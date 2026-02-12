use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use reqwest::cookie::{CookieStore as _, Jar};
use reqwest::Client;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri::WindowEvent;
use url::Url;

const SSO_URL: &str = "https://sso.uom.gr/login";
const PORTAL_URL: &str = "https://sis-portal.uom.gr";
const SERVICE_URL: &str = "https://sis-portal.uom.gr/login/cas";
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── Session types ───────────────────────────────────────────────────

struct SessionData {
    client: Client,
    csrf: String,
    profile_id: String,
}

#[derive(Clone, Default, Serialize, Deserialize)]
pub struct AppSettings {
    pub keep_in_tray: bool,
}

pub struct AppState {
    session: Mutex<Option<SessionData>>,
    settings: Mutex<AppSettings>,
}

#[derive(Serialize, Deserialize)]
struct SavedSession {
    portal_cookies: String,
    csrf: String,
    profile_id: String,
}

// ── Sync HTML helpers (scraper types are !Send) ─────────────────────

fn extract_cas_tokens(html: &str) -> Result<(String, Option<String>), String> {
    let doc = Html::parse_document(html);
    let exec_sel = Selector::parse(r#"input[name="execution"]"#).unwrap();
    let execution = doc
        .select(&exec_sel)
        .next()
        .and_then(|el| el.value().attr("value"))
        .ok_or("CAS execution token not found")?
        .to_string();
    let lt_sel = Selector::parse(r#"input[name="lt"]"#).unwrap();
    let lt = doc
        .select(&lt_sel)
        .next()
        .and_then(|el| el.value().attr("value"))
        .map(|s| s.to_string());
    Ok((execution, lt))
}

fn extract_csrf(html: &str) -> Result<String, String> {
    let doc = Html::parse_document(html);
    let sel = Selector::parse(r#"meta[name="_csrf"]"#).unwrap();
    doc.select(&sel)
        .next()
        .and_then(|el| el.value().attr("content"))
        .map(|s| s.to_string())
        .ok_or_else(|| "CSRF token not found".to_string())
}

fn find_profile_id(value: &Value) -> Option<String> {
    fn extract_id(v: &Value) -> Option<String> {
        v.get("id").and_then(|id| match id {
            Value::String(s) => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        })
    }
    match value {
        Value::Object(map) => {
            for v in map.values() {
                if let Some(id) = find_profile_id(v) {
                    return Some(id);
                }
            }
            extract_id(value)
        }
        Value::Array(arr) => arr.first().and_then(extract_id),
        _ => None,
    }
}

// ── Session persistence helpers ─────────────────────────────────────

fn session_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("session.json"))
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &tauri::AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    let data = match std::fs::read_to_string(&path) {
        Ok(d) => d,
        Err(_) => return AppSettings::default(),
    };
    serde_json::from_str(&data).unwrap_or_default()
}

fn save_settings(app: &tauri::AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_string(settings).unwrap()).map_err(|e| e.to_string())
}

fn save_session_to_disk(
    app: &tauri::AppHandle,
    jar: &Jar,
    csrf: &str,
    profile_id: &str,
) -> Result<(), String> {
    let portal_url: Url = PORTAL_URL.parse().unwrap();
    let cookies = jar
        .cookies(&portal_url)
        .and_then(|h| h.to_str().ok().map(|s| s.to_string()))
        .unwrap_or_default();

    let saved = SavedSession {
        portal_cookies: cookies,
        csrf: csrf.to_string(),
        profile_id: profile_id.to_string(),
    };

    let path = session_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, serde_json::to_string(&saved).unwrap()).map_err(|e| e.to_string())
}

fn delete_session_from_disk(app: &tauri::AppHandle) {
    if let Ok(path) = session_path(app) {
        let _ = std::fs::remove_file(path);
    }
}

fn build_client_from_cookies(cookies: &str) -> Result<Client, String> {
    let jar = Arc::new(Jar::default());
    let portal_url: Url = PORTAL_URL.parse().unwrap();

    for part in cookies.split("; ") {
        if !part.is_empty() {
            let set_cookie = format!("{part}; Domain=sis-portal.uom.gr; Path=/");
            jar.add_cookie_str(&set_cookie, &portal_url);
        }
    }

    Client::builder()
        .cookie_provider(jar)
        .user_agent(UA)
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

// ── Sync state helpers ──────────────────────────────────────────────

fn extract_session(app: &tauri::AppHandle) -> Result<(Client, String, String), String> {
    let state = app.state::<AppState>();
    let guard = state.session.lock().map_err(|e| e.to_string())?;
    let s = guard.as_ref().ok_or("Not logged in")?;
    Ok((s.client.clone(), s.csrf.clone(), s.profile_id.clone()))
}

fn store_session(app: &tauri::AppHandle, data: SessionData) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    *guard = Some(data);
    Ok(())
}

// ── Async helper: authenticated API GET ─────────────────────────────

async fn api_get(
    client: &Client,
    path: &str,
    csrf: &str,
    profile_id: &str,
) -> Result<Value, String> {
    let resp = client
        .get(format!("{PORTAL_URL}{path}"))
        .header("X-CSRF-TOKEN", csrf)
        .header("X-Profile", profile_id)
        .header("X-Requested-With", "XMLHttpRequest")
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Request failed: {e}"))?;

    resp.json::<Value>()
        .await
        .map_err(|e| format!("Invalid JSON: {e}"))
}

// ── Command: try_restore_session ────────────────────────────────────

#[tauri::command]
async fn try_restore_session(app: tauri::AppHandle) -> Result<Value, String> {
    let path = session_path(&app)?;
    let data = std::fs::read_to_string(&path).map_err(|_| "No saved session".to_string())?;
    let saved: SavedSession =
        serde_json::from_str(&data).map_err(|_| "Corrupt session file".to_string())?;

    if saved.portal_cookies.is_empty() {
        return Err("Empty session".to_string());
    }

    let client = build_client_from_cookies(&saved.portal_cookies)?;

    // Verify the session is still valid
    let student_info = api_get(
        &client,
        "/feign/student/student_data",
        &saved.csrf,
        &saved.profile_id,
    )
    .await
    .map_err(|_| {
        delete_session_from_disk(&app);
        "Session expired".to_string()
    })?;

    // Session works — store it in memory
    store_session(
        &app,
        SessionData {
            client,
            csrf: saved.csrf,
            profile_id: saved.profile_id,
        },
    )?;

    Ok(student_info)
}

// ── Command: login ──────────────────────────────────────────────────

#[tauri::command]
async fn login(
    username: String,
    password: String,
    app: tauri::AppHandle,
) -> Result<Value, String> {
    let jar = Arc::new(Jar::default());
    let client = Client::builder()
        .cookie_provider(jar.clone())
        .user_agent(UA)
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    // 1. Hit the portal to set initial cookies
    client
        .get(PORTAL_URL)
        .send()
        .await
        .map_err(|e| format!("Portal unreachable: {e}"))?;

    // 2. Load the CAS login page
    let login_page = client
        .get(SSO_URL)
        .query(&[("service", SERVICE_URL)])
        .send()
        .await
        .map_err(|e| format!("CAS page error: {e}"))?;

    let login_url = login_page.url().to_string();
    let login_html = login_page.text().await.map_err(|e| e.to_string())?;

    // 3. Extract hidden form tokens
    let (execution, lt) = extract_cas_tokens(&login_html)?;

    // 4. Submit credentials
    let mut form: Vec<(&str, String)> = vec![
        ("username", username),
        ("password", password),
        ("execution", execution),
        ("_eventId", "submit".to_string()),
    ];
    if let Some(lt_val) = lt {
        form.push(("lt", lt_val));
    }

    let resp = client
        .post(SSO_URL)
        .query(&[("service", SERVICE_URL)])
        .form(&form)
        .header("Referer", &login_url)
        .send()
        .await
        .map_err(|e| format!("Login request failed: {e}"))?;

    let final_url = resp.url().to_string();
    if resp.url().host_str() == Some("sso.uom.gr") {
        return Err(format!("Invalid username or password (ended at {final_url})"));
    }

    // 5. Grab the CSRF token
    let portal_html = client
        .get(PORTAL_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .text()
        .await
        .map_err(|e| e.to_string())?;

    let csrf = extract_csrf(&portal_html)?;

    // 6. Fetch student profile
    let profiles: Value = client
        .get(format!("{PORTAL_URL}/api/person/profiles"))
        .header("X-CSRF-TOKEN", &csrf)
        .header("X-Requested-With", "XMLHttpRequest")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    let profile_id = find_profile_id(&profiles)
        .ok_or_else(|| format!("No student profiles found in: {profiles}"))?;

    // 7. Fetch student info
    let student_info =
        api_get(&client, "/feign/student/student_data", &csrf, &profile_id).await?;

    // 8. Save session to disk (cookies + CSRF + profile)
    let _ = save_session_to_disk(&app, &jar, &csrf, &profile_id);

    // 9. Store in memory
    store_session(&app, SessionData { client, csrf, profile_id })?;

    Ok(student_info)
}

// ── Command: get_student_info ───────────────────────────────────────

#[tauri::command]
async fn get_student_info(app: tauri::AppHandle) -> Result<Value, String> {
    let (client, csrf, pid) = extract_session(&app)?;
    api_get(&client, "/feign/student/student_data", &csrf, &pid).await
}

// ── Command: get_grades ─────────────────────────────────────────────

#[tauri::command]
async fn get_grades(app: tauri::AppHandle) -> Result<Value, String> {
    let (client, csrf, pid) = extract_session(&app)?;
    api_get(&client, "/feign/student/grades/all", &csrf, &pid).await
}

// ── Command: get_grade_stats ────────────────────────────────────────

#[derive(Deserialize)]
struct GetGradeStatsArgs {
    #[serde(rename = "courseSyllabusId")]
    course_syllabus_id: String,
    #[serde(rename = "examPeriodId")]
    exam_period_id: String,
}

#[tauri::command]
async fn get_grade_stats(
    app: tauri::AppHandle,
    args: GetGradeStatsArgs,
) -> Result<serde_json::Value, String> {
    let (client, csrf, pid) = extract_session(&app)?;
    let path = format!(
        "/feign/student/grades/stats/course_syllabus/{}/exam_period/{}",
        args.course_syllabus_id,
        args.exam_period_id
    );
    api_get(&client, &path, &csrf, &pid).await
}

// ── Command: get_keep_in_tray ───────────────────────────────────────

#[tauri::command]
fn get_keep_in_tray(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let guard = state.settings.lock().map_err(|e| e.to_string())?;
    Ok(guard.keep_in_tray)
}

// ── Command: set_keep_in_tray ───────────────────────────────────────

#[tauri::command]
fn set_keep_in_tray(app: tauri::AppHandle, value: bool) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut guard = state.settings.lock().map_err(|e| e.to_string())?;
    guard.keep_in_tray = value;
    save_settings(&app, &*guard)
}

// ── Command: logout ─────────────────────────────────────────────────

#[tauri::command]
fn logout(app: tauri::AppHandle) -> Result<(), String> {
    delete_session_from_disk(&app);
    let state = app.state::<AppState>();
    let mut guard = state.session.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

// ── Entry point ─────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            session: Mutex::new(None),
            settings: Mutex::new(AppSettings::default()),
        })
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            try_restore_session,
            login,
            get_student_info,
            get_grades,
            get_grade_stats,
            logout,
            get_keep_in_tray,
            set_keep_in_tray
        ])
        .setup(|app| {
            // Load settings from disk
            let settings = load_settings(&app.handle());
            let state = app.state::<AppState>();
            let mut guard = state.settings.lock().unwrap();
            *guard = settings;

            // Build tray with Show and Quit menu items
            let show_i = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let guard = state.settings.lock();
                if let Ok(guard) = guard {
                    if guard.keep_in_tray {
                        let _ = window.hide();
                        api.prevent_close();
                        return;
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

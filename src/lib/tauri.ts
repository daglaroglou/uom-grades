/**
 * Safe wrapper around Tauri commands.
 * Uses dynamic import so it never breaks during SSR or in a regular browser.
 */

import type { StudentInfo, GradeRecord } from "@/types";

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

function requireTauri(): void {
  if (!isTauri()) {
    throw new Error("This app must be run as a desktop application");
  }
}

// ── Commands ────────────────────────────────────────────────────────

export async function tryRestoreSession(): Promise<StudentInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<StudentInfo>("try_restore_session");
  } catch {
    return null;
  }
}

export async function login(
  username: string,
  password: string,
  rememberMe = false
): Promise<StudentInfo> {
  requireTauri();
  return invoke<StudentInfo>("login", {
    args: { username, password, remember_me: rememberMe },
  });
}

export async function getStudentInfo(): Promise<StudentInfo> {
  requireTauri();
  return invoke<StudentInfo>("get_student_info");
}

/** Fetch grade distribution stats for a course/exam period */
export async function getGradeStats(
  courseSyllabusId: string,
  examPeriodId: string
): Promise<number[]> {
  requireTauri();
  const data = await invoke<number[] | { [key: string]: number[] }>(
    "get_grade_stats",
    { args: { courseSyllabusId, examPeriodId } }
  );
  if (Array.isArray(data)) return data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val)) return val;
  }
  return [];
}

export async function getGrades(): Promise<GradeRecord[]> {
  requireTauri();
  const data = await invoke<GradeRecord[] | Record<string, unknown>>("get_grades");
  if (Array.isArray(data)) return data;
  for (const val of Object.values(data)) {
    if (Array.isArray(val)) return val;
  }
  return [];
}

export async function logout(): Promise<void> {
  if (isTauri()) {
    await invoke("logout");
  }
}

// ── Settings ───────────────────────────────────────────────────────

export async function getKeepInTray(): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>("get_keep_in_tray");
}

export async function setKeepInTray(value: boolean): Promise<void> {
  if (isTauri()) {
    await invoke("set_keep_in_tray", { value });
  }
}

export async function getBackgroundCheckMinutes(): Promise<number> {
  if (!isTauri()) return 5;
  return invoke<number>("get_background_check_minutes");
}

export async function setBackgroundCheckMinutes(value: number): Promise<void> {
  if (isTauri()) {
    await invoke("set_background_check_minutes", {
      value: Math.max(5, Math.floor(value)),
    });
  }
}

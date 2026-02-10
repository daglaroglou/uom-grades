/**
 * Safe wrapper around Tauri commands.
 * Uses dynamic import so it never breaks during SSR or in a regular browser.
 * Falls back to mock data when not running inside the Tauri webview.
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

// ── Commands ────────────────────────────────────────────────────────

export async function tryRestoreSession(): Promise<StudentInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<StudentInfo>("try_restore_session");
  } catch {
    return null;
  }
}

export async function login(username: string, password: string): Promise<StudentInfo> {
  if (isTauri()) {
    return invoke<StudentInfo>("login", { username, password });
  }

  // Mock fallback for browser-only development
  await new Promise((r) => setTimeout(r, 800));
  if (username === "student" && password === "password") {
    return {
      firstName: "Alex",
      lastName: "Johnson",
      am: "ics24130",
      department: { name: "Applied Informatics" },
      currentSemester: 4,
    };
  }
  throw new Error("Invalid username or password");
}

export async function getStudentInfo(): Promise<StudentInfo> {
  if (isTauri()) {
    return invoke<StudentInfo>("get_student_info");
  }
  return {
    firstName: "Alex",
    lastName: "Johnson",
    am: "ics24130",
    department: { name: "Applied Informatics" },
    currentSemester: 4,
  };
}

export async function getGrades(): Promise<GradeRecord[]> {
  if (isTauri()) {
    const data = await invoke<GradeRecord[] | Record<string, unknown>>("get_grades");
    // The API may return an array directly or wrap it in an object
    if (Array.isArray(data)) return data;
    // Try to find the first array value in the response
    for (const val of Object.values(data)) {
      if (Array.isArray(val)) return val;
    }
    return [];
  }

  // Mock fallback for browser-only development
  await new Promise((r) => setTimeout(r, 400));
  return [
    { courseName: "Mathematics I",        courseCode: "ICE101", grade: 8.5,  ects: 6, status: "PASSED", examPeriod: "FEB 2026" },
    { courseName: "Physics",              courseCode: "ICE102", grade: 7.0,  ects: 6, status: "PASSED", examPeriod: "FEB 2026" },
    { courseName: "Programming I",        courseCode: "ICE103", grade: 9.5,  ects: 6, status: "PASSED", examPeriod: "JUN 2025" },
    { courseName: "English I",            courseCode: "ICE104", grade: 6.0,  ects: 4, status: "PASSED", examPeriod: "JUN 2025" },
    { courseName: "Discrete Mathematics", courseCode: "ICE105", grade: 5.5,  ects: 6, status: "PASSED", examPeriod: "JUN 2025" },
    { courseName: "Databases",            courseCode: "ICE201", grade: null,  ects: 6, status: "FAILED", examPeriod: "FEB 2026" },
  ];
}

export async function logout(): Promise<void> {
  if (isTauri()) {
    await invoke("logout");
  }
}

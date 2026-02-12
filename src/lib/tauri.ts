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

/** Fetch grade distribution stats for a course/exam period */
export async function getGradeStats(
  courseSyllabusId: string,
  examPeriodId: string
): Promise<number[]> {
  if (!isTauri()) {
    // Mock: return fake distribution for browser dev
    await new Promise((r) => setTimeout(r, 200));
    return [5, 6, 7, 7, 8, 8, 8, 9, 9, 10];
  }
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
    { courseName: "Mathematics I",        courseCode: "ICE101", grade: 8.5,  ects: 6, status: "PASSED", examPeriod: "FEB 2026", courseSyllabusId: "B250294A-ED21-4103-96D1-048BF26FB987", examPeriodId: "9B11E0A8-141C-48F2-9FB2-3F5AACCA59AC" },
    { courseName: "Physics",              courseCode: "ICE102", grade: 7.0,  ects: 6, status: "PASSED", examPeriod: "FEB 2026", courseSyllabusId: "C3603A5B-FE32-5214-A7E2-159CG37GC098", examPeriodId: "9B11E0A8-141C-48F2-9FB2-3F5AACCA59AC" },
    { courseName: "Programming I",        courseCode: "ICE103", grade: 9.5,  ects: 6, status: "PASSED", examPeriod: "JUN 2025", courseSyllabusId: "D4714B6C-0F43-6325-B8F3-26ADH48HD109", examPeriodId: "0C22F1B9-252D-49G3-0GC3-4G6BDDDB60BD" },
    { courseName: "English I",            courseCode: "ICE104", grade: 6.0,  ects: 4, status: "PASSED", examPeriod: "JUN 2025", courseSyllabusId: "E5825C7D-1G54-7436-C9G4-37BEI59IE210", examPeriodId: "0C22F1B9-252D-49G3-0GC3-4G6BDDDB60BD" },
    { courseName: "Discrete Mathematics", courseCode: "ICE105", grade: 5.5,  ects: 6, status: "PASSED", examPeriod: "JUN 2025", courseSyllabusId: "F6936D8E-2H65-8547-D0H5-48CFJ60JF321", examPeriodId: "0C22F1B9-252D-49G3-0GC3-4G6BDDDB60BD" },
    { courseName: "Databases",            courseCode: "ICE201", grade: null,  ects: 6, status: "FAILED", examPeriod: "FEB 2026", courseSyllabusId: "G7A47E9F-3I76-9658-E1I6-59DGK71KG432", examPeriodId: "9B11E0A8-141C-48F2-9FB2-3F5AACCA59AC" },
  ];
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

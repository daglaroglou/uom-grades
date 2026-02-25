/**
 * Grades cache for offline viewing.
 * Persists to localStorage when grades are successfully fetched.
 */

import type { GradeRecord, StudentInfo } from "@/types";

const CACHE_KEY = "uom-grades-cache";
const CACHE_VERSION = 2;

export interface GradesCache {
  version: number;
  grades: GradeRecord[];
  cachedAt: string; // ISO
  studentInfo?: StudentInfo;
}

/** Placeholder student info when cache has no studentInfo (legacy cache) */
export const OFFLINE_PLACEHOLDER_STUDENT: StudentInfo = {
  firstname: "",
  lastname: "",
  studentNo: "",
  studentStatusTitle: "Offline",
};

export function saveGradesCache(
  grades: GradeRecord[],
  studentInfo?: StudentInfo
): void {
  if (typeof window === "undefined") return;
  try {
    const cache: GradesCache = {
      version: CACHE_VERSION,
      grades,
      cachedAt: new Date().toISOString(),
      ...(studentInfo && { studentInfo }),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota/parse errors
  }
}

export function loadGradesCache(): GradesCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as GradesCache;
    if (!cache?.grades || !Array.isArray(cache.grades)) return null;
    // Accept both v1 and v2 for backward compatibility
    if (cache.version !== 1 && cache.version !== CACHE_VERSION) return null;
    return cache;
  } catch {
    return null;
  }
}

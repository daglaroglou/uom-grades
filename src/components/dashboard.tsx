"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Settings, Moon, Sun } from "lucide-react";
import { getGrades, logout as tauriLogout } from "@/lib/tauri";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import type { StudentInfo, GradeRecord } from "@/types";
import {
  studentDisplayName,
  studentId,
  studentDepartment,
  studentSemester,
  studentStatus,
  courseName,
  courseCode,
  gradeValue,
  gradeEcts,
  gradeStatus,
  gradeExamPeriod,
  courseSemester,
} from "@/types";

const ECTS_TARGET = 240;

// ── Types ───────────────────────────────────────────────────────────

interface CourseGroup {
  key: string;
  name: string;
  code: string;
  ects: number | null;
  current: GradeRecord;
  attempts: GradeRecord[];
  passed: boolean;
}

interface SemesterSection {
  semester: number;
  label: string;
  courses: CourseGroup[];
}

interface DashboardProps {
  studentInfo: StudentInfo;
  onLogout: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

function gradeColor(score: number | null, failed: boolean): string {
  if (failed || (score !== null && score < 5))
    return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
  if (score === null) return "bg-muted text-muted-foreground hover:bg-muted";
  if (score >= 8.5)
    return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300";
  if (score >= 6.5)
    return "bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300";
  if (score >= 5)
    return "bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-950 dark:text-red-300";
}

function gradeLabel(score: number | null, failed: boolean): string {
  if (failed) return "Fail";
  if (score === null) return "—";
  if (score >= 8.5) return "Excellent";
  if (score >= 6.5) return "Very Good";
  if (score >= 5) return "Good";
  return "Fail";
}

function cKey(g: GradeRecord): string {
  return courseCode(g) || courseName(g);
}

function isFailed(g: GradeRecord): boolean {
  const s = gradeStatus(g).toUpperCase();
  const v = gradeValue(g);
  return s.includes("FAIL") || s.includes("ΑΠΟΤ") || (v !== null && v < 5);
}

/**
 * Best-effort chronological sort key for an exam attempt.
 * Tries (1) explicit attempt number, (2) date-like fields, (3) exam period text.
 * Falls back to the original array index so we always keep a deterministic order.
 */
function attemptSortKey(
  g: GradeRecord,
  fallbackIndex: number
): number {
  // 1) Explicit attempt number if the API provides one
  const attemptNo =
    (g as any).attemptNo ??
    (g as any).attempt_no ??
    (g as any).attempt ??
    (g as any).try ??
    (g as any).examAttempt;
  if (typeof attemptNo === "number" && Number.isFinite(attemptNo)) {
    return attemptNo;
  }

  // 2) Date-like fields (ISO strings, timestamps, etc.)
  const dateFields = [
    "examDate",
    "exam_date",
    "date",
    "gradeDate",
    "createdAt",
    "updatedAt",
  ];
  for (const field of dateFields) {
    const v = (g as any)[field];
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      return v;
    }
  }

  // 3) Exam period text like "FEB 2026", "Χειμερινό 2023-24", etc.
  const periodRaw = gradeExamPeriod(g);
  if (periodRaw) {
    const text = String(periodRaw).toLowerCase();

    // Academic year (pick the latest 4‑digit year we see)
    const yearMatches = text.match(/\b(19|20)\d{2}\b/g);
    const year = yearMatches && yearMatches.length
      ? parseInt(yearMatches[yearMatches.length - 1]!, 10)
      : Number.NaN;

    // Within the academic year, roughly order winter < spring < september
    let term = 1;
    if (/(χειμ|winter|win|feb|january|ιαν|φεβ)/i.test(text)) term = 0;
    else if (/(εαρ|spring|jun|june|may|μαΐ|ιουν)/i.test(text)) term = 1;
    else if (/(σεπ|sept|sep|autumn|fall|oct|nov)/i.test(text)) term = 2;

    if (!Number.isNaN(year)) {
      // Multiply to keep terms in order inside the same year
      return year * 10 + term;
    }
  }

  // 4) Fallback: preserve the original relative order
  return 1_000_000_000 + fallbackIndex;
}

function semesterLabel(n: number): string {
  if (n === 0) return "Other";
  const ordinal = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
  return `${ordinal[n - 1] ?? `${n}th`} Semester`;
}

// ── Build grouped data ──────────────────────────────────────────────

function buildSemesters(grades: GradeRecord[]): {
  semesters: SemesterSection[];
  passedCourses: CourseGroup[];
  passedEcts: number;
  avg: string;
  best: CourseGroup | null;
} {
  // Remember original order so sorting can fall back to it
  const indexMap = new Map<GradeRecord, number>();
  grades.forEach((g, idx) => {
    indexMap.set(g, idx);
  });

  const courseMap = new Map<string, GradeRecord[]>();
  for (const g of grades) {
    const key = cKey(g);
    const arr = courseMap.get(key) ?? [];
    arr.push(g);
    courseMap.set(key, arr);
  }

  const allCourses: CourseGroup[] = [];
  for (const [key, rawAttempts] of courseMap) {
    // Sort attempts from oldest → newest.
    // Business rule: any passing attempt (grade ≥ 5 / non‑fail status)
    // must be the last real try, so all failing attempts come first.
    const attempts = [...rawAttempts].sort((a, b) => {
      const aFailed = isFailed(a);
      const bFailed = isFailed(b);
      if (aFailed !== bFailed) {
        // failed (true) should come before passed (false)
        return aFailed ? -1 : 1;
      }

      const aKey = attemptSortKey(a, indexMap.get(a) ?? 0);
      const bKey = attemptSortKey(b, indexMap.get(b) ?? 0);
      if (aKey === bKey) {
        return (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0);
      }
      return aKey - bKey;
    });

    const current = attempts[attempts.length - 1];
    const hasPassed = !isFailed(current);

    allCourses.push({
      key,
      name: courseName(current),
      code: courseCode(current),
      ects: gradeEcts(current),
      current,
      attempts,
      passed: hasPassed,
    });
  }

  const semMap = new Map<number, CourseGroup[]>();
  for (const c of allCourses) {
    const sem = courseSemester(c.current);
    const arr = semMap.get(sem) ?? [];
    arr.push(c);
    semMap.set(sem, arr);
  }

  const semesters: SemesterSection[] = Array.from(semMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([sem, courses]) => ({
      semester: sem,
      label: semesterLabel(sem),
      courses,
    }));

  const passedCourses = allCourses.filter((c) => c.passed);
  const passedEcts = passedCourses.reduce((s, c) => s + (c.ects ?? 0), 0);

  const avg =
    passedCourses.length > 0
      ? (
          passedCourses.reduce(
            (s, c) => s + (gradeValue(c.current) ?? 0),
            0
          ) / passedCourses.length
        ).toFixed(2)
      : "—";

  const best = passedCourses.length
    ? passedCourses.reduce((b, c) =>
        (gradeValue(c.current) ?? 0) > (gradeValue(b.current) ?? 0) ? c : b
      )
    : null;

  return { semesters, passedCourses, passedEcts, avg, best };
}

// ── Component ───────────────────────────────────────────────────────

export function Dashboard({ studentInfo, onLogout }: DashboardProps) {
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    getGrades()
      .then(setGrades)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const { semesters, passedCourses, passedEcts, avg, best } = useMemo(
    () => buildSemesters(grades),
    [grades]
  );

  const name = studentDisplayName(studentInfo);
  const sid = studentId(studentInfo);
  const dept = studentDepartment(studentInfo);
  const sem = studentSemester(studentInfo);
  const statusText = studentStatus(studentInfo);
  const ectsPercent = Math.min(
    100,
    Math.round((passedEcts / ECTS_TARGET) * 100)
  );

  function toggleCourse(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleLogout() {
    await tauriLogout();
    onLogout();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="min-h-screen bg-background"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎓</span>
            <div>
              <h1 className="text-lg font-semibold">{name}</h1>
              <p className="text-sm text-muted-foreground">
                {sid}
                {statusText ? ` · ${statusText}` : ""}
                {sem ? ` · ${sem}` : ""}
              </p>
              {dept && (
                <p className="text-xs text-muted-foreground truncate max-w-md">
                  {dept}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Settings toggle */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label="Settings"
              >
                <Settings className="h-4 w-4" />
              </Button>

              {/* Settings dropdown */}
              <AnimatePresence>
                {settingsOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setSettingsOpen(false)}
                    />
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-10 z-50 w-56 rounded-lg border bg-popover p-4 shadow-lg"
                    >
                      <p className="text-sm font-semibold mb-3">Settings</p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          {theme === "dark" ? (
                            <Moon className="h-4 w-4" />
                          ) : (
                            <Sun className="h-4 w-4" />
                          )}
                          <span>Dark Mode</span>
                        </div>
                        <Switch
                          checked={theme === "dark"}
                          onCheckedChange={toggleTheme}
                        />
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <Button variant="outline" size="sm" onClick={handleLogout}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* ── Summary cards (equal height) ────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Average",
              content: <p className="text-3xl font-bold">{avg}</p>,
            },
            {
              label: "ECTS Progress",
              content: (
                <>
                  <p className="text-3xl font-bold">
                    {passedEcts}
                    <span className="text-lg font-normal text-muted-foreground">
                      {" "}
                      / {ECTS_TARGET}
                    </span>
                  </p>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${ectsPercent}%` }}
                      transition={{
                        delay: 0.6,
                        duration: 0.8,
                        ease: "easeOut",
                      }}
                    />
                  </div>
                </>
              ),
            },
            {
              label: "Passed Courses",
              content: (
                <p className="text-3xl font-bold">{passedCourses.length}</p>
              ),
            },
            {
              label: "Best Grade",
              content: (
                <>
                  <p className="text-3xl font-bold">
                    {best ? gradeValue(best.current) : "—"}
                  </p>
                  {best && (
                    <p className="text-sm text-muted-foreground truncate">
                      {best.name}
                    </p>
                  )}
                </>
              ),
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="flex"
            >
              <Card className="flex flex-col w-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center">
                  {card.content}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ── Semesters ────────────────────────────────────────── */}
        {loading ? (
          <p className="text-muted-foreground">Loading grades...</p>
        ) : grades.length === 0 ? (
          <p className="text-muted-foreground">No grades found.</p>
        ) : (
          <div className="space-y-8">
            {semesters.map((section, si) => (
              <motion.div
                key={section.semester}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + si * 0.08 }}
              >
                {/* ── Semester divider ──────────────────────── */}
                <div className="flex items-center gap-4 mb-4">
                  <Separator className="flex-1" />
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    {section.label}
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <Card>
                  <div className="divide-y">
                    {section.courses.map((course) => {
                      const hasHistory = course.attempts.length > 1;
                      const isOpen = expanded.has(course.key);
                      const score = gradeValue(course.current);
                      const failed = !course.passed;

                      return (
                        <div key={course.key}>
                          {/* ── Main row ───────────────────── */}
                          <button
                            type="button"
                            onClick={() => hasHistory && toggleCourse(course.key)}
                            disabled={!hasHistory}
                            className={`w-full grid grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_80px_70px_80px_100px] items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                              hasHistory
                                ? "cursor-pointer hover:bg-muted/50"
                                : "cursor-default"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {hasHistory ? (
                                <ChevronDown
                                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                                    isOpen ? "rotate-0" : "-rotate-90"
                                  }`}
                                />
                              ) : (
                                <div className="w-4 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {course.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {course.code}
                                  {hasHistory &&
                                    ` · ${course.attempts.length} attempts`}
                                </p>
                              </div>
                            </div>

                            <p className="text-right font-semibold tabular-nums">
                              {score !== null ? score : "—"}
                            </p>

                            <p className="text-right text-muted-foreground tabular-nums">
                              {course.ects ?? "—"}
                              <span className="text-xs ml-0.5">ec</span>
                            </p>

                            <p className="text-right text-xs text-muted-foreground hidden sm:block truncate">
                              {gradeExamPeriod(course.current)}
                            </p>

                            <div className="flex justify-end">
                              <Badge
                                variant="secondary"
                                className={gradeColor(score, failed)}
                              >
                                {gradeLabel(score, failed)}
                              </Badge>
                            </div>
                          </button>

                          {/* ── Past attempts dropdown ─────── */}
                          <AnimatePresence>
                            {isOpen && hasHistory && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="bg-muted/30 border-t">
                                  {course.attempts.map((a, ai) => {
                                    const aScore = gradeValue(a);
                                    const aFailed = isFailed(a);
                                    const isCurrent = a === course.current;

                                    return (
                                      <div
                                        key={ai}
                                        className={`grid grid-cols-[1fr_auto_auto_auto_auto] sm:grid-cols-[1fr_80px_70px_80px_100px] items-center gap-3 px-4 py-2 text-sm ${
                                          isCurrent
                                            ? "bg-primary/5 font-medium"
                                            : "opacity-50"
                                        }`}
                                      >
                                        <p className="pl-6 text-muted-foreground text-xs">
                                          {ai + 1}.{" "}
                                          {gradeExamPeriod(a) || `Attempt ${ai + 1}`}
                                          {isCurrent ? " ✓" : ""}
                                        </p>

                                        <p className="text-right tabular-nums">
                                          {aScore !== null ? aScore : "—"}
                                        </p>

                                        <p className="text-right text-muted-foreground tabular-nums text-xs">
                                          {gradeEcts(a) ?? "—"} ec
                                        </p>

                                        <div className="hidden sm:block" />

                                        <div className="flex justify-end">
                                          <Badge
                                            variant="secondary"
                                            className={`text-xs ${gradeColor(aScore, aFailed)}`}
                                          >
                                            {gradeLabel(aScore, aFailed)}
                                          </Badge>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </motion.div>
  );
}

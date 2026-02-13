"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  CheckmarkCircle01Icon,
  Settings01Icon,
  Moon01Icon,
  Sun01Icon,
  PanelRightCloseIcon,
  GraduationScrollIcon,
} from "@hugeicons/core-free-icons";
import {
  getGrades,
  logout as tauriLogout,
  getKeepInTray,
  setKeepInTray,
  getBackgroundCheckMinutes,
  setBackgroundCheckMinutes,
} from "@/lib/tauri";
import { CourseStatsPanel } from "@/components/course-stats-panel";
import { useTheme } from "@/components/theme-provider";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  gradeRecordId,
  gradeValue,
  gradeEcts,
  gradeStatus,
  courseSemester,
  courseSyllabusId,
  examPeriodId,
  examPeriodTitle,
  examPeriodDisplay,
  syllabusYear,
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

function cKey(g: GradeRecord): string {
  return courseCode(g) || courseName(g);
}

function isFailed(g: GradeRecord): boolean {
  const s = gradeStatus(g).toUpperCase();
  const v = gradeValue(g);
  return s.includes("FAIL") || s.includes("ΑΠΟΤ") || (v !== null && v < 5);
}

/** Sort key for attempt ordering: syllabus year, period, then grade (higher = later effort) */
function attemptSortKey(g: GradeRecord): [number, string, number] {
  const year = syllabusYear(g) ?? 0;
  const periodTitle = examPeriodTitle(g).toUpperCase();
  const epId = examPeriodId(g);
  // Prefer periodTitle so "2023-2024 ΧΕΙΜΕΡΙΝΉ" matches when both show same period
  const periodKey = `${year}-${periodTitle || epId || "0"}`;
  const grade = gradeValue(g) ?? -1;
  return [year, periodKey, grade];
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
    // Sort attempts by syllabus year, period (examPeriodId or periodTitle), then grade (higher = later effort).
    const attempts = [...rawAttempts].sort((a, b) => {
      const [aYear, aPeriod, aGrade] = attemptSortKey(a);
      const [bYear, bPeriod, bGrade] = attemptSortKey(b);

      if (aYear !== bYear) return aYear - bYear;
      const cmpPeriod = aPeriod.localeCompare(bPeriod);
      if (cmpPeriod !== 0) return cmpPeriod;

      // Same year and period (e.g. both "2023-2024 ΧΕΙΜΕΡΙΝΉ"): higher grade = later effort (retake)
      if (aGrade !== bGrade) return aGrade - bGrade;

      return (indexMap.get(a) ?? 0) - (indexMap.get(b) ?? 0);
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
    // Use first attempt for semester grouping (curriculum semester is fixed per course)
    const sem = courseSemester(c.attempts[0]);
    const arr = semMap.get(sem) ?? [];
    arr.push(c);
    semMap.set(sem, arr);
  }

  const semesters: SemesterSection[] = Array.from(semMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([sem, courses]) => ({
      semester: sem,
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
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshedToast, setShowRefreshedToast] = useState(false);
  const [newCourseKeys, setNewCourseKeys] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keepInTray, setKeepInTrayState] = useState(false);
  const [backgroundCheckMinutes, setBackgroundCheckMinutesState] = useState(5);
  const [statsExpanded, setStatsExpanded] = useState<Set<string>>(new Set());
  const gradesRef = useRef<GradeRecord[]>([]);
  const { theme, toggle: toggleTheme } = useTheme();
  const { t, locale, setLocale } = useLocale();

  async function checkForNewGrades(
    currentGrades: GradeRecord[],
    options: { showToast?: boolean; showNotification?: boolean } = {}
  ): Promise<{ data: GradeRecord[]; hadNew: boolean }> {
    const oldIds = new Set(currentGrades.map((g) => gradeRecordId(g)));
    const oldCourseKeys = new Set(
      currentGrades.map((g) => courseCode(g) || courseName(g))
    );
    const data = await getGrades();
    const newIds = data.filter((g) => !oldIds.has(gradeRecordId(g)));
    const newKeys = new Set<string>();
    for (const g of newIds) {
      newKeys.add(courseCode(g) || courseName(g));
    }
    const hadNew = newKeys.size > 0;

    if (hadNew) {
      setGrades(data);
      setNewCourseKeys(newKeys);
      setTimeout(() => setNewCourseKeys(new Set()), 30000);

      if (options.showNotification !== false) {
        const brandNewCourses = newIds.filter(
          (g) => !oldCourseKeys.has(courseCode(g) || courseName(g))
        );
        const newEfforts = newIds.filter((g) =>
          oldCourseKeys.has(courseCode(g) || courseName(g))
        );
        const newCourseCount = new Set(
          brandNewCourses.map((g) => courseCode(g) || courseName(g))
        ).size;
        const newEffortCount = new Set(
          newEfforts.map((g) => courseCode(g) || courseName(g))
        ).size;
        let body = "";
        if (newCourseCount > 0 && newEffortCount > 0) {
          body = t("newGradesBoth", {
            courses: newCourseCount,
            efforts: newEffortCount,
          });
        } else if (newCourseCount > 0) {
          body = t("newGradesCourses", { count: newCourseCount });
        } else {
          body = t("newGradesEfforts", { count: newEffortCount });
        }
        import("@tauri-apps/plugin-notification")
          .then(({ sendNotification }) =>
            sendNotification({ title: t("newGradesTitle"), body })
          )
          .catch(() => {});
      }

      if (options.showToast) {
        setShowRefreshedToast(true);
        setTimeout(() => setShowRefreshedToast(false), 2500);
      }
    }

    return { data, hadNew };
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const { data, hadNew } = await checkForNewGrades(grades, {
        showToast: true,
        showNotification: true,
      });
      if (!hadNew) {
        setGrades(data);
        setShowRefreshedToast(true);
        setTimeout(() => setShowRefreshedToast(false), 2500);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  function semesterLabel(sem: number): string {
    if (sem === 0) return t("semesterOther");
    const ordKey = `ordinal${Math.min(sem, 8)}` as const;
    return t("semesterFormat", { ordinal: t(ordKey) });
  }

  useEffect(() => {
    getGrades()
      .then(setGrades)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getKeepInTray().then(setKeepInTrayState);
    getBackgroundCheckMinutes().then(setBackgroundCheckMinutesState);
  }, []);

  gradesRef.current = grades;

  // Background check for new grades
  useEffect(() => {
    const mins = Math.max(5, backgroundCheckMinutes);
    const ms = mins * 60 * 1000;
    const id = setInterval(() => {
      const currentGrades = gradesRef.current;
      getGrades()
        .then((data) => {
          const oldIds = new Set(currentGrades.map((g) => gradeRecordId(g)));
          const oldCourseKeys = new Set(
            currentGrades.map((g) => courseCode(g) || courseName(g))
          );
          const newIds = data.filter((g) => !oldIds.has(gradeRecordId(g)));
          const newKeys = new Set<string>();
          for (const g of newIds) {
            newKeys.add(courseCode(g) || courseName(g));
          }
          if (newKeys.size > 0) {
            setGrades(data);
            setNewCourseKeys(newKeys);
            setTimeout(() => setNewCourseKeys(new Set()), 30000);
            const brandNewCourses = newIds.filter(
              (g) => !oldCourseKeys.has(courseCode(g) || courseName(g))
            );
            const newEfforts = newIds.filter((g) =>
              oldCourseKeys.has(courseCode(g) || courseName(g))
            );
            const newCourseCount = new Set(
              brandNewCourses.map((g) => courseCode(g) || courseName(g))
            ).size;
            const newEffortCount = new Set(
              newEfforts.map((g) => courseCode(g) || courseName(g))
            ).size;
            let body = "";
            if (newCourseCount > 0 && newEffortCount > 0) {
              body = t("newGradesBoth", {
                courses: newCourseCount,
                efforts: newEffortCount,
              });
            } else if (newCourseCount > 0) {
              body = t("newGradesCourses", { count: newCourseCount });
            } else {
              body = t("newGradesEfforts", { count: newEffortCount });
            }
            import("@tauri-apps/plugin-notification")
              .then(({ sendNotification }) =>
                sendNotification({ title: t("newGradesTitle"), body })
              )
              .catch(() => {});
          }
        })
        .catch(() => {});
    }, ms);
    return () => clearInterval(id);
  }, [backgroundCheckMinutes, t]);

  async function handleKeepInTrayChange(checked: boolean) {
    setKeepInTrayState(checked);
    await setKeepInTray(checked);
  }

  async function handleBackgroundCheckChange(value: number) {
    const mins = Math.max(5, Math.floor(value));
    setBackgroundCheckMinutesState(mins);
    await setBackgroundCheckMinutes(mins);
  }

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

  function toggleStats(key: string) {
    setStatsExpanded((prev) => {
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
      className="page-bg min-h-screen bg-background"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-primary/10 p-2.5 ring-1 ring-primary/10 dark:ring-primary/20">
              <HugeiconsIcon
                icon={GraduationScrollIcon}
                size={28}
                className="text-primary shrink-0"
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight truncate">{name}</h1>
              <p className="text-sm text-muted-foreground truncate">
                {sid}
                {statusText ? ` · ${statusText}` : ""}
                {sem ? ` · ${sem}` : ""}
              </p>
              {dept && (
                <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                  {dept}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Refresh */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={t("refresh")}
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
            </Button>
            {/* Settings toggle */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen((v) => !v)}
                aria-label={t("settings")}
              >
                <HugeiconsIcon icon={Settings01Icon} size={16} />
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
                      initial={{ opacity: 0, y: -4, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-10 z-50 w-64 rounded-xl border bg-popover p-4 shadow-xl shadow-black/10 dark:shadow-black/30 ring-1 ring-border/50"
                    >
                      <p className="text-sm font-semibold mb-3">{t("settings")}</p>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              {t("language")}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => setLocale("en")}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                locale === "en"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                            >
                              EN
                            </button>
                            <button
                              type="button"
                              onClick={() => setLocale("el")}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                locale === "el"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted hover:bg-muted/80"
                              }`}
                            >
                              ΕΛ
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            {theme === "dark" ? (
                              <HugeiconsIcon icon={Moon01Icon} size={16} />
                            ) : (
                              <HugeiconsIcon icon={Sun01Icon} size={16} />
                            )}
                            <span>{t("darkMode")}</span>
                          </div>
                          <Switch
                            checked={theme === "dark"}
                            onCheckedChange={toggleTheme}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm">
                            <HugeiconsIcon icon={PanelRightCloseIcon} size={16} />
                            <span>{t("keepInTray")}</span>
                          </div>
                          <Switch
                            checked={keepInTray}
                            onCheckedChange={handleKeepInTrayChange}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            {t("backgroundCheck")}
                          </span>
                          <Select
                            value={String(backgroundCheckMinutes)}
                            onValueChange={(v) =>
                              handleBackgroundCheckChange(parseInt(v, 10))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[5, 10, 15, 20, 30, 60].map((m) => (
                                <SelectItem key={m} value={String(m)}>
                                  {t("backgroundCheckMinutes", { minutes: m })}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              className="rounded-lg hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            >
              {t("signOut")}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        {/* ── Summary cards (equal height) ────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: t("average"),
              content: <p className="text-3xl font-bold tabular-nums tracking-tight">{avg}</p>,
            },
            {
              label: t("ectsProgress"),
              content: (
                <>
                  <p className="text-3xl font-bold tracking-tight">
                    {passedEcts}
                    <span className="text-lg font-normal text-muted-foreground">
                      {" "}
                      / {ECTS_TARGET}
                    </span>
                  </p>
                  <div className="mt-2.5 h-2.5 rounded-full bg-muted overflow-hidden">
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
              label: t("passedCourses"),
              content: (
                <p className="text-3xl font-bold tabular-nums tracking-tight">{passedCourses.length}</p>
              ),
            },
            {
              label: t("bestGrade"),
              content: (
                <>
                  <p className="text-3xl font-bold tracking-tight">
                    {best ? gradeValue(best.current) : "—"}
                  </p>
                  {best && (
                    <p className="text-sm text-muted-foreground truncate mt-1">
                      {best.name}
                    </p>
                  )}
                </>
              ),
            },
          ].map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08, ease: "easeOut" }}
              className="flex"
            >
              <Card className="flex flex-col w-full overflow-hidden border-0 shadow-md shadow-black/5 dark:shadow-black/15 ring-1 ring-border/50 hover:ring-border/70 transition-shadow">
                <CardHeader className="pb-2 pt-5">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-center pb-5">
                  {card.content}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* ── Semesters ────────────────────────────────────────── */}
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-16 gap-4"
          >
            <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">{t("loadingGrades")}</p>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-primary/40"
                  animate={{ opacity: [0.4, 1, 0.4] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                />
              ))}
            </div>
          </motion.div>
        ) : grades.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-dashed border-border bg-muted/30 px-8 py-12 text-center"
          >
            <p className="text-muted-foreground">{t("noGradesFound")}</p>
          </motion.div>
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
                    {semesterLabel(section.semester)}
                  </h2>
                  <Separator className="flex-1" />
                </div>

                <Card className="overflow-hidden border-0 shadow-md shadow-black/5 dark:shadow-black/15 ring-1 ring-border/50">
                  {/* Table headers */}
                  <div className="hidden sm:grid grid-cols-[1fr_80px_80px] items-center gap-3 px-4 py-3.5 text-xs font-medium uppercase tracking-wider text-muted-foreground border-b bg-muted/40">
                    <span>{t("course")}</span>
                    <span className="text-right">{t("grade")}</span>
                    <span className="text-right">{t("ects")}</span>
                  </div>
                  <div className="divide-y">
                    {section.courses.map((course) => {
                      const hasHistory = course.attempts.length > 1;
                      const isOpen = expanded.has(course.key);
                      const isNew = newCourseKeys.has(course.key);
                      const score = gradeValue(course.current);
                      const failed = !course.passed;
                      const csId = courseSyllabusId(course.current);
                      const epId = examPeriodId(course.current);
                      const hasStats = Boolean(csId && epId);
                      const showStats = statsExpanded.has(course.key);

                      return (
                        <div key={course.key}>
                          {/* ── Main row ───────────────────── */}
                          <button
                            type="button"
                            onClick={() => hasHistory && toggleCourse(course.key)}
                            disabled={!hasHistory}
                            className={`w-full grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_80px_80px] items-center gap-3 px-4 py-3.5 text-left text-sm transition-colors ${
                              hasHistory
                                ? "cursor-pointer hover:bg-muted/50"
                                : "cursor-default"
                            } ${isNew ? "bg-primary/5 ring-1 ring-primary/20 dark:ring-primary/30" : ""}`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {hasHistory ? (
                                <HugeiconsIcon
                                  icon={ArrowDown01Icon}
                                  size={16}
                                  className={`shrink-0 text-muted-foreground transition-transform duration-200 ${
                                    isOpen ? "rotate-0" : "-rotate-90"
                                  }`}
                                />
                              ) : (
                                <div className="w-4 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="font-medium truncate flex items-center gap-2">
                                  {course.name}
                                  {isNew && (
                                    <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">
                                      {t("new")}
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {course.code}
                                  {hasHistory &&
                                    ` · ${t("attemptsCount", { count: course.attempts.length })}`}
                                  {examPeriodDisplay(course.current) && (
                                    <> · {examPeriodDisplay(course.current)}</>
                                  )}
                                </p>
                              </div>
                            </div>

                            {/* Grade display */}
                            <div className="flex justify-end">
                              <span
                                className={`inline-flex items-center justify-center min-w-[2.25rem] h-9 rounded-md text-base font-bold tabular-nums ${
                                  failed
                                    ? "text-red-700 dark:text-red-400 bg-red-500/15 dark:bg-red-500/20"
                                    : score !== null && score >= 8.5
                                      ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-500/20"
                                      : score !== null && score >= 6.5
                                        ? "text-blue-700 dark:text-blue-400 bg-blue-500/15 dark:bg-blue-500/20"
                                        : score !== null && score >= 5
                                          ? "text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20"
                                          : "text-muted-foreground bg-muted"
                                }`}
                              >
                                {score !== null ? score : "—"}
                              </span>
                            </div>

                            <p className="text-right text-muted-foreground tabular-nums text-sm">
                              {course.ects ?? "—"}
                              <span className="text-xs ml-0.5">{t("ects")}</span>
                            </p>
                          </button>

                          {/* ── View distribution button ─────── */}
                          {hasStats && (
                            <div className="border-t">
                              <button
                                type="button"
                                onClick={() => toggleStats(course.key)}
                                className="w-full px-4 py-2.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors flex items-center gap-2"
                              >
                                <span className="text-[10px]">{showStats ? "↓" : "→"}</span>
                                {t("gradeDistribution")}
                              </button>
                              <AnimatePresence>
                                {showStats && csId && epId && (
                                  <CourseStatsPanel
                                    courseSyllabusId={csId}
                                    examPeriodId={epId}
                                    courseName={course.name}
                                    myGrade={score}
                                  />
                                )}
                              </AnimatePresence>
                            </div>
                          )}

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
                                        className={`grid grid-cols-[1fr_auto_auto] sm:grid-cols-[1fr_80px_80px] items-center gap-3 px-4 py-2 text-sm ${
                                          isCurrent
                                            ? "bg-primary/5 font-medium"
                                            : "opacity-50"
                                        }`}
                                      >
                                        <p className="pl-6 text-muted-foreground text-xs">
                                          {ai + 1}.{" "}
                                          {examPeriodDisplay(a) || t("attemptN", { n: ai + 1 })}
                                          {isCurrent ? " ✓" : ""}
                                        </p>

                                        <div className="flex justify-end">
                                          <span
                                            className={`inline-flex items-center justify-center min-w-[1.75rem] h-7 rounded text-sm font-bold tabular-nums ${
                                              aFailed
                                                ? "text-red-700 dark:text-red-400 bg-red-500/15 dark:bg-red-500/20"
                                                : aScore !== null && aScore >= 8.5
                                                  ? "text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 dark:bg-emerald-500/20"
                                                  : aScore !== null && aScore >= 5
                                                    ? "text-amber-700 dark:text-amber-400 bg-amber-500/15 dark:bg-amber-500/20"
                                                    : "text-muted-foreground bg-muted"
                                            }`}
                                          >
                                            {aScore !== null ? aScore : "—"}
                                          </span>
                                        </div>

                                        <p className="text-right text-muted-foreground tabular-nums text-xs">
                                          {gradeEcts(a) ?? "—"} {t("ects")}
                                        </p>
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

      {/* Refresh notification */}
      <AnimatePresence>
        {showRefreshedToast && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-6 right-6 z-50 w-72 overflow-hidden rounded-xl border bg-popover shadow-xl shadow-black/10 dark:shadow-black/30 ring-1 ring-border/50"
          >
            <div className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 dark:bg-emerald-500/20">
                <HugeiconsIcon
                  icon={CheckmarkCircle01Icon}
                  size={20}
                  className="text-emerald-600 dark:text-emerald-400"
                />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="font-semibold text-foreground">
                  {t("refreshed")}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("refreshedDetail", {
                    count: semesters.reduce((n, s) => n + s.courses.length, 0),
                  })}
                </p>
              </div>
            </div>
            <motion.div
              className="h-1 bg-emerald-500/30 dark:bg-emerald-500/40"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 2.5, ease: "linear" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

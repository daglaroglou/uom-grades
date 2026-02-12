/* eslint-disable @typescript-eslint/no-explicit-any */

/** Raw student info returned by the UoM portal API */
export type StudentInfo = Record<string, any>;

/** Raw grade record returned by the UoM portal API */
export type GradeRecord = Record<string, any>;

// ── Helpers to extract fields regardless of exact API key names ─────

export function studentDisplayName(info: StudentInfo): string {
  const first = info.firstname ?? info.firstName ?? info.first_name ?? info.name ?? "";
  const last = info.lastname ?? info.lastName ?? info.last_name ?? info.surname ?? "";
  if (first || last) return `${first} ${last}`.trim();
  return "Student";
}

export function studentId(info: StudentInfo): string {
  return info.studentNo ?? info.am ?? info.studentId ?? info.id ?? "";
}

export function studentDepartment(info: StudentInfo): string {
  return (
    info.departmentTitle ?? info.department?.name ?? info.department?.title ??
    (typeof info.department === "string" ? info.department : "")
  );
}

export function studentSemester(info: StudentInfo): string | null {
  if (info.lastPeriod) {
    const year = info.lastSyllabus ? ` ${info.lastSyllabus}` : "";
    return `${info.lastPeriod}${year}`;
  }
  if (info.currentSemester) return `Semester ${info.currentSemester}`;
  return null;
}

export function studentStatus(info: StudentInfo): string {
  return info.studentStatusTitle ?? info.status ?? "";
}

export function studentProgram(info: StudentInfo): string {
  return info.programTitle ?? info.program ?? "";
}

// ── Grade field extractors ──────────────────────────────────────────

export function courseName(g: GradeRecord): string {
  return (
    g.courseName ?? g.course?.title ?? g.course?.name ?? g.title ?? g.name ?? "—"
  );
}

export function courseCode(g: GradeRecord): string {
  return g.courseCode ?? g.course?.code ?? g.code ?? "";
}

export function gradeValue(g: GradeRecord): number | null {
  const v = g.grade ?? g.score ?? g.mark;
  if (typeof v !== "number") return null;
  // API returns 0-1 scale (0.85 = 8.5) — convert to 0-10
  const scaled = v <= 1 ? v * 10 : v;
  return Math.round(scaled * 10) / 10; // one decimal
}

export function gradeEcts(g: GradeRecord): number | null {
  const v = g.ects ?? g.course?.ects;
  return typeof v === "number" ? v : null;
}

export function gradeStatus(g: GradeRecord): string {
  return g.status ?? g.result ?? "";
}

export function gradeExamPeriod(g: GradeRecord): string {
  return g.examPeriod ?? g.period ?? g.exam_period ?? "";
}

/** Extract courseSyllabusId for the stats API (string or object with id) */
export function courseSyllabusId(g: GradeRecord): string | null {
  const v =
    g.courseSyllabusId ??
    g.course?.courseSyllabusId ??
    (g.course?.courseSyllabus as { id?: string })?.id ??
    g.course_syllabus_id;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: string }).id === "string")
    return (v as { id: string }).id;
  return null;
}

/** Extract examPeriodId for the stats API (string or object with id) */
export function examPeriodId(g: GradeRecord): string | null {
  const v =
    g.examPeriodId ??
    g.examPeriod?.id ??
    (g.examPeriod as { id?: string })?.id ??
    g.exam_period_id;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: string }).id === "string")
    return (v as { id: string }).id;
  return null;
}

/** The semester the course belongs to (curriculum semester, not exam period) */
export function courseSemester(g: GradeRecord): number {
  // 1. Try explicit fields from the API
  const v =
    g.semester ?? g.courseSemester ?? g.course?.semester ??
    g.suggestedSemester ?? g.typicalSemester ?? g.semesterNo ??
    g.course?.suggestedSemester ?? g.course?.typicalSemester;
  if (typeof v === "number" && v > 0) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) return n;
  }

  // 2. Fallback: extract from course code (e.g. AIC501 → 5, ICE201 → 2)
  //    Greek university codes: letters + first digit = semester
  const code = courseCode(g);
  const m = code.match(/[A-Za-z]+(\d)/);
  if (m) {
    const d = parseInt(m[1], 10);
    if (d >= 1 && d <= 8) return d;
  }

  return 0;
}

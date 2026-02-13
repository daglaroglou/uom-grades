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

/** Unique id for a grade record (for change detection) */
export function gradeRecordId(g: GradeRecord): string {
  const id = g.id ?? g.gradeId ?? g.grade_id;
  if (typeof id === "string") return id;
  const code = courseCode(g);
  const year = g.syllabus ?? (g.courseSyllabusId as { syllabus?: number })?.syllabus ?? "";
  const epId = g.examPeriodId ?? g.periodId ?? g.exam_period_id ?? "";
  const grade = g.grade ?? g.score ?? g.mark ?? "";
  return `${code}-${year}-${epId}-${grade}`;
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
    g.periodId ?? // diploma endpoint
    g.exam_period_id;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { id?: string }).id === "string")
    return (v as { id: string }).id;
  return null;
}

/** Extract exam period title (e.g. "Χειμερινή", "Winter") */
export function examPeriodTitle(g: GradeRecord): string {
  const v =
    g.periodTitle ??
    g.examPeriod?.title ??
    (g.examPeriod as { title?: string })?.title ??
    g.exam_period_title ??
    gradeExamPeriod(g); // fallback to raw period text
  return typeof v === "string" && v.trim() ? v : "";
}

/** Syllabus year from grade record (e.g. 2022) */
export function syllabusYear(g: GradeRecord): number | null {
  const v =
    g.syllabus ??
    (g.courseSyllabusId as { syllabus?: number })?.syllabus ??
    (g.course?.courseSyllabusId as { syllabus?: number })?.syllabus;
  if (typeof v === "number" && v > 1900 && v < 2100) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 1900 && n < 2100) return n;
  }
  return null;
}

/** Display string for exam period: "2023-2024 ΦΕΒΡΟΥΑΡΙΟΣ" */
export function examPeriodDisplay(g: GradeRecord): string {
  const year = syllabusYear(g);
  const title = examPeriodTitle(g);
  const yearStr = year ? `${year}-${year + 1}` : "";
  const titleUpper = title ? title.toUpperCase() : "";
  if (yearStr && titleUpper) return `${yearStr} ${titleUpper}`;
  if (yearStr) return yearStr;
  if (titleUpper) return titleUpper;
  return gradeExamPeriod(g) || "";
}

/** The semester the course belongs to (curriculum semester, not exam period) */
export function courseSemester(g: GradeRecord): number {
  // 1. Try explicit fields from the API
  const v =
    g.semester ?? g.courseSemester ?? g.course?.semester ??
    g.studentSemester ?? // diploma endpoint: studentSemester = 1, 2, ...
    g.suggestedSemester ?? g.typicalSemester ?? g.semesterNo ??
    g.course?.suggestedSemester ?? g.course?.typicalSemester;
  if (typeof v === "number" && v > 0) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) return n;
  }

  // 2. Diploma endpoint: semesterId = { id, sortOrder, title, abbr }
  const sid = g.semesterId as { id?: string; sortOrder?: number } | undefined;
  if (sid) {
    if (typeof sid.sortOrder === "number" && sid.sortOrder > 0) return sid.sortOrder;
    if (typeof sid.id === "string") {
      const n = parseInt(sid.id, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  }

  // 3. Fallback: extract from course code (e.g. AIC501 → 5, ICE201 → 2)
  //    Greek university codes: letters + first digit = semester
  const code = courseCode(g);
  const m = code.match(/[A-Za-z]+(\d)/);
  if (m) {
    const d = parseInt(m[1], 10);
    if (d >= 1 && d <= 8) return d;
  }

  return 0; // "other"
}

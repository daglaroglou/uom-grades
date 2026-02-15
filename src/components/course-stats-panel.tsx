"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { getGradeStats } from "@/lib/tauri";
import { useWindowSize } from "@/hooks/use-window-size";
import { useLocale } from "@/components/locale-provider";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ── Types ───────────────────────────────────────────────────────────

interface CourseStatsPanelProps {
  courseSyllabusId: string;
  examPeriodId: string;
  courseName: string;
  myGrade: number | null;
}

interface GradeDistribution {
  grade: number;
  count: number;
  fill: string;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert API values (0–1 scale) to integer grades 0–10 */
function parseGrades(raw: number[]): number[] {
  return raw.map((v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    if (v <= 1) return Math.round(v * 10);
    return Math.round(v);
  });
}

function barColor(grade: number): string {
  if (grade < 5) return "hsl(var(--destructive))";
  if (grade >= 8.5) return "hsl(142 76% 36%)";
  if (grade >= 6.5) return "hsl(217 91% 60%)";
  return "hsl(38 92% 50%)";
}

// ── Component ───────────────────────────────────────────────────────

export function CourseStatsPanel({
  courseSyllabusId,
  examPeriodId,
  courseName,
  myGrade,
}: CourseStatsPanelProps) {
  const { t } = useLocale();
  const { width: windowWidth } = useWindowSize();
  const [raw, setRaw] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getGradeStats(courseSyllabusId, examPeriodId)
      .then((data) => {
        setRaw(Array.isArray(data) ? data : []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [courseSyllabusId, examPeriodId]);

  const { grades, distribution, stats } = (() => {
    if (!raw || raw.length === 0) {
      return {
        grades: [] as number[],
        distribution: [] as GradeDistribution[],
        stats: null as {
          count: number;
          mean: number;
          median: number;
          min: number;
          max: number;
          passRate: number;
        } | null,
      };
    }
    const grades = parseGrades(raw);
    const countByGrade = new Map<number, number>();
    for (const g of grades) {
      countByGrade.set(g, (countByGrade.get(g) ?? 0) + 1);
    }
    const distribution: GradeDistribution[] = Array.from(
      { length: 11 },
      (_, i) => i
    ).map((grade) => ({
      grade,
      count: countByGrade.get(grade) ?? 0,
      fill: barColor(grade),
    }));

    const sorted = [...grades].sort((a, b) => a - b);
    const sum = grades.reduce((a, b) => a + b, 0);
    const passed = grades.filter((g) => g >= 5).length;

    return {
      grades,
      distribution,
      stats: {
        count: grades.length,
        mean: sum / grades.length,
        median:
          sorted.length % 2 === 1
            ? sorted[Math.floor(sorted.length / 2)]!
            : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2,
        min: Math.min(...grades),
        max: Math.max(...grades),
        passRate: (passed / grades.length) * 100,
      },
    };
  })();

  if (loading) {
    return (
      <div className="border-t bg-muted/20 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0" />
          <p className="text-sm text-muted-foreground">{t("loadingDistribution")}</p>
        </div>
        <div className="mt-4 flex gap-1 overflow-hidden">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <motion.div
              key={i}
              className="h-12 flex-1 rounded-sm bg-muted"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.05 }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t bg-destructive/5 px-4 py-6">
        <p className="text-sm text-destructive font-medium">
          {t("couldNotLoadStats", { error })}
        </p>
      </div>
    );
  }

  if (grades.length === 0) {
    return (
      <div className="border-t bg-muted/20 px-4 py-6">
        <p className="text-sm text-muted-foreground">
          {t("noDistributionData")}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      className="overflow-hidden"
    >
      <div className="border-t bg-muted/20 px-4 py-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">
          {t("gradeDistributionCourse", { courseName })}
        </p>

        {/* Stats row */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="rounded-lg bg-background/90 px-3 py-2.5 border border-border/60 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("students")}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5">{stats.count}</p>
            </div>
            <div className="rounded-lg bg-background/90 px-3 py-2.5 border border-border/60 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("mean")}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5">{stats.mean.toFixed(2)}</p>
            </div>
            <div className="rounded-lg bg-background/90 px-3 py-2.5 border border-border/60 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("median")}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5">{stats.median.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-background/90 px-3 py-2.5 border border-border/60 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("range")}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5">{stats.min}–{stats.max}</p>
            </div>
            <div className="rounded-lg bg-background/90 px-3 py-2.5 border border-border/60 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{t("passRate")}</p>
              <p className="text-lg font-bold tabular-nums tracking-tight mt-0.5">{stats.passRate.toFixed(0)}%</p>
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="h-[200px] w-full min-w-0 rounded-lg bg-background/50 p-2 border border-border/40" key={windowWidth}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={distribution}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="opacity-40" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="grade"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const d = payload[0].payload as GradeDistribution;
                  return (
                    <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 text-sm shadow-lg ring-1 ring-border/30">
                      <p className="font-semibold">{t("gradeLabel", { grade: d.grade })}</p>
                      <p className="text-muted-foreground text-xs mt-0.5">{t("studentsCount", { count: d.count })}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                {distribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {myGrade !== null && (
          <p className="text-xs text-muted-foreground mt-2">
            {t("yourGrade", { grade: myGrade })}
          </p>
        )}
      </div>
    </motion.div>
  );
}

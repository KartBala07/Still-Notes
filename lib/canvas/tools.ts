// Adapted from canvas-pro syllabus, courseDetail, curve and schedule engines.
import { z } from "zod";
import type { Assignment, SchoolData } from "./types";
import { estimate, studyPlan } from "./engine";
const pct = z.number().finite().min(0).max(100),
  num = z.number().finite().min(0).max(10000),
  id = z.string().min(1).max(120);
export const syllabusSchema = z
  .object({
    raw: z.string().max(12000),
    mode: z.enum(["auto", "canvas", "syllabus", "points"]).default("auto"),
    weights: z.record(pct),
    late: z.object({
      noLate: z.boolean().default(false),
      perDay: pct.default(0),
      flat: pct.default(0),
      graceDays: z.number().int().min(0).max(365).default(0),
      deadlineDays: z.number().int().min(0).max(365).nullable().default(null),
      maxCredit: pct.default(100),
      minCredit: pct.default(0),
    }),
    confirmed: z.boolean().default(false),
  })
  .refine((s) => s.late.minCredit <= s.late.maxCredit, {
    message: "Minimum credit cannot exceed maximum credit.",
  })
  .refine((s) => Object.keys(s.weights).length <= 20, {
    message: "Use at most 20 grade categories.",
  });
export type Syllabus = z.infer<typeof syllabusSchema>;
export const toolsSchema = z
  .object({
    syllabi: z.record(syllabusSchema).default({}),
    whatIf: z.record(num).default({}),
    effort: z
      .array(
        z.object({
          id,
          taskId: id,
          minutes: z.number().min(1).max(600),
          estimate: z.number().min(1).max(600),
          at: z.number(),
        }),
      )
      .max(2500)
      .default([]),
    curves: z
      .array(
        z.object({
          id,
          courseId: id,
          title: z.string().max(160),
          raw: num,
          possible: num.positive(),
          average: num.nullable(),
          added: num,
          target: pct,
          at: z.number(),
        }),
      )
      .max(300)
      .default([]),
    read: z.array(id).max(1000).default([]),
    plan: z
      .object({
        start: z
          .string()
          .regex(/^\d\d:\d\d$/)
          .default("18:00"),
        end: z
          .string()
          .regex(/^\d\d:\d\d$/)
          .default("21:00"),
        breakEvery: z.number().int().min(0).max(120).default(50),
        breakMinutes: z.number().int().min(0).max(60).default(10),
        minutesPerPoint: z.number().min(0.3).max(3).default(1.2),
        difficulty: z.record(z.number().min(0.4).max(3)).default({}),
      })
      .default({}),
  })
  .superRefine((v, c) => {
    if (
      Object.keys(v.syllabi).length > 50 ||
      Object.keys(v.whatIf).length > 1500 ||
      Object.keys(v.plan.difficulty).length > 50 ||
      new TextEncoder().encode(JSON.stringify(v)).length > 700000
    )
      c.addIssue({
        code: "custom",
        message: "Too much planning data; export and clear older entries.",
      });
    const m = (s: string) => {
      const [h, n] = s.split(":").map(Number);
      return h < 24 && n < 60 ? h * 60 + n : NaN;
    };
    if (!(m(v.plan.end) > m(v.plan.start)))
      c.addIssue({
        code: "custom",
        message: "Choose a study window ending later the same day.",
      });
  });
export type SchoolTools = z.infer<typeof toolsSchema>;
export const emptyTools: SchoolTools = toolsSchema.parse({});
export function parseSyllabus(raw: string): Syllabus {
  const weights: Record<string, number> = {};
  const categories = [
    ["exam", /exam|test|final|midterm/i],
    ["quiz", /quizz?/i],
    ["project", /project|essay|paper|lab|portfolio/i],
    ["participation", /participation/i],
    ["assignment", /homework|assignment|classwork|worksheet/i],
  ] as const;
  for (const line of raw.split(/[;\n]/)) {
    const n = line.match(/(\d+(?:\.\d+)?)\s*%/),
      type = categories.find(([, re]) => re.test(line));
    if (n && type && !/late|penalty|credit|deduct/i.test(line) && +n[1] <= 100)
      weights[type[0]] = +n[1];
  }
  const lateText = raw
    .split(/[;\n]/)
    .filter((l) => /late|penalty|credit|deduct/i.test(l))
    .join(" ");
  const value = (re: RegExp, fallback = 0) =>
    Number(lateText.match(re)?.[1] ?? fallback);
  return syllabusSchema.parse({
    raw: raw.slice(0, 12000),
    weights,
    confirmed: false,
    late: {
      noLate:
        /no late work|late work (?:is |will )?not (?:be )?accepted(?!\s+(?:after|beyond|past|later|more))/i.test(
          lateText,
        ),
      perDay: Math.min(100, value(/(\d+)\s*%[^.;]{0,40}?per (?:school )?day/i)),
      flat: Math.min(
        100,
        value(/(?:flat|late) penalty[^.;\d]{0,15}(\d+)\s*%/i),
      ),
      graceDays: value(/full credit[^.;\d]{0,30}(\d+)\s*days?/i),
      deadlineDays: lateText.match(
        /(?:only accepted within|not accepted after|no credit after)[^\d]{0,10}(\d+)\s*days?/i,
      )?.[1]
        ? value(
            /(?:only accepted within|not accepted after|no credit after)[^\d]{0,10}(\d+)\s*days?/i,
          )
        : null,
      maxCredit: Math.min(
        100,
        value(/(?:maximum|max|capped at|up to)[^\d]{0,10}(\d+)\s*%/i, 100),
      ),
      minCredit: Math.min(
        100,
        value(/(?:minimum|min|floor)[^\d]{0,10}(\d+)\s*%/i),
      ),
    },
  });
}
export function lateCredit(s: Syllabus | undefined, days: number) {
  if (!s?.confirmed)
    return { credit: 1, label: "Policy unconfirmed · full credit assumption" };
  const p = s.late;
  if (p.noLate || (p.deadlineDays !== null && days > p.deadlineDays))
    return { credit: 0, label: "Outside the accepted late-work policy" };
  if (days <= p.graceDays) return { credit: 1, label: "Within grace period" };
  const effective = Math.max(0, days - p.graceDays),
    penalty = effective ? (p.perDay ? effective * p.perDay : p.flat) : 0;
  return {
    credit: Math.max(p.minCredit, Math.min(p.maxCredit, 100 - penalty)) / 100,
    label: effective
      ? `${penalty}% penalty · max ${p.maxCredit}% credit`
      : "Within grace period",
  };
}
export function lateRank(
  data: SchoolData,
  tools: SchoolTools,
  now = Date.now(),
) {
  return data.tasks
    .filter(
      (t) => !t.done && !t.submitted && t.dueAt && +new Date(t.dueAt) < now,
    )
    .map((task) => {
      const days = Math.max(
          1,
          Math.ceil((now - +new Date(task.dueAt!)) / 86400000),
        ),
        syllabus = tools.syllabi[task.courseId] || tools.syllabi._all,
        credit = lateCredit(syllabus, days),
        weight =
          (syllabus?.confirmed ? syllabus.weights[task.type] : undefined) ??
          task.groupWeight ??
          100,
        worth = task.pointsPossible * credit.credit,
        minutes = estimate(task);
      return {
        task,
        days,
        ...credit,
        worth,
        minutes,
        priority: (worth * weight) / 100 / minutes,
      };
    })
    .sort((a, b) => b.priority - a.priority);
}
export function projectedGrade(
  tasks: Assignment[],
  whatIf: Record<string, number>,
  syllabus?: Syllabus,
) {
  const useCanvas =
      syllabus?.mode === "canvas" ||
      ((!syllabus || syllabus.mode === "auto") &&
        tasks.some((t) => t.groupId && t.groupWeight != null)),
    useSyllabus =
      !useCanvas &&
      syllabus?.mode !== "points" &&
      syllabus?.confirmed &&
      Object.keys(syllabus.weights).length > 0;
  const buckets = new Map<
    string,
    { name: string; earned: number; possible: number; weight: number | null }
  >();
  let excluded = 0;
  for (const t of tasks) {
    if (t.excused || !t.pointsPossible) continue;
    const earned = whatIf[t.id] ?? t.pointsEarned;
    if (earned == null) {
      excluded++;
      continue;
    }
    const name = useCanvas
        ? t.groupId || "unknown"
        : useSyllabus
          ? t.type
          : "all",
      b = buckets.get(name) || {
        name: useCanvas
          ? t.groupName || "Other"
          : useSyllabus
            ? t.type
            : "Point total",
        earned: 0,
        possible: 0,
        weight: useCanvas
          ? t.groupWeight
          : useSyllabus
            ? (syllabus!.weights[t.type] ?? null)
            : 100,
      };
    b.earned += earned;
    b.possible += t.pointsPossible;
    buckets.set(name, b);
  }
  let numerator = 0,
    denominator = 0;
  for (const b of buckets.values())
    if (b.weight != null && b.possible) {
      numerator += (b.earned / b.possible) * b.weight;
      denominator += b.weight;
    }
  return {
    pct: denominator ? (numerator / denominator) * 100 : null,
    buckets: [...buckets.values()],
    excluded,
    method: useCanvas
      ? "Canvas groups"
      : useSyllabus
        ? "Confirmed syllabus weights"
        : "Point totals",
    incomplete: [...buckets.values()].some((b) => b.weight === null),
  };
}
export function effortFactors(data: SchoolData, tools: SchoolTools) {
  const map: Record<
    string,
    { actual: number; expected: number; count: number; factor: number }
  > = {};
  const estimates = new Map<string, number>();
  for (const log of tools.effort)
    estimates.set(
      log.taskId,
      Math.max(estimates.get(log.taskId) || 0, log.estimate),
    );
  const counted = new Set<string>();
  for (const log of tools.effort) {
    const task = data.tasks.find((t) => t.id === log.taskId);
    if (!task) continue;
    const b = map[task.courseId] || {
      actual: 0,
      expected: 0,
      count: 0,
      factor: 1,
    };
    b.actual += log.minutes;
    if (!counted.has(log.taskId)) {
      b.expected += estimates.get(log.taskId)!;
      counted.add(log.taskId);
    }
    b.count++;
    b.factor = Math.max(0.4, Math.min(2.5, b.actual / b.expected));
    map[task.courseId] = b;
  }
  return map;
}
export function timedPlan(
  data: SchoolData,
  tools: SchoolTools,
  now = Date.now(),
) {
  const p = tools.plan,
    minute = (s: string) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m;
    },
    start = minute(p.start),
    available = Math.min(data.dailyMinutes, minute(p.end) - start),
    rhythm = p.breakEvery && p.breakMinutes;
  let cap = 0,
    used = 0,
    since = 0;
  while (used < available) {
    if (rhythm && since === p.breakEvery) {
      if (used + p.breakMinutes >= available) break;
      used += p.breakMinutes;
      since = 0;
    }
    used++;
    cap++;
    since++;
  }
  const factors = effortFactors(data, tools),
    adjusted = {
      ...data,
      dailyMinutes: cap,
      tasks: data.tasks.map((t) => ({
        ...t,
        minutes: Math.min(
          600,
          Math.max(
            5,
            Math.round(
              estimate(t) *
                (t.minutes ? 1 : p.minutesPerPoint / 1.2) *
                (p.difficulty[t.courseId] || factors[t.courseId]?.factor || 1),
            ),
          ),
        ),
      })),
    },
    plan = studyPlan(adjusted, now);
  const clock = (n: number) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return {
    ...plan,
    days: plan.days.map((d) => {
      let cursor = start,
        sinceBreak = 0;
      const sessions: {
        task: Assignment | null;
        minutes: number;
        start: string;
        end: string;
      }[] = [];
      for (const slot of d.slots) {
        let left = slot.minutes;
        while (left > 0) {
          if (rhythm && sinceBreak === p.breakEvery) {
            sessions.push({
              task: null,
              minutes: p.breakMinutes,
              start: clock(cursor),
              end: clock(cursor + p.breakMinutes),
            });
            cursor += p.breakMinutes;
            sinceBreak = 0;
          }
          const take = Math.min(
            left,
            rhythm ? p.breakEvery - sinceBreak : left,
          );
          sessions.push({
            task: data.tasks.find((t) => t.id === slot.task.id)!,
            minutes: take,
            start: clock(cursor),
            end: clock(cursor + take),
          });
          left -= take;
          cursor += take;
          sinceBreak += take;
        }
      }
      return { ...d, sessions, available, capacity: cap };
    }),
  };
}

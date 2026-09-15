// Ported from Wizard24-24/canvas-pro via KartBala07/canvas-pro.
// See docs/CANVAS-MERGE.md for source revision and integration details.
import type { Assignment, Course, SchoolData } from "./types";
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export function daysUntil(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const due = new Date(iso),
    today = new Date(now);
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((+due - +today) / 86400000);
}
export function rankTasks(data: SchoolData, now = Date.now()) {
  return data.tasks
    .filter((t) => !t.submitted && !t.done)
    .map((task) => {
      const course = data.courses.find((c) => c.id === task.courseId),
        due = daysUntil(task.dueAt, now),
        urgency = due === null ? 0 : clamp(1 - due / 14, 0, 1),
        deficit =
          course?.currentScore == null
            ? 0.3
            : clamp((course.targetGrade - course.currentScore) / 100, 0, 1),
        weight =
          task.groupWeight == null ? 0.5 : clamp(task.groupWeight / 100, 0, 1),
        typeBoost = { exam: 1, quiz: 0.7, project: 0.75, assignment: 0.5 }[
          task.type
        ],
        impact =
          0.45 * weight +
          0.35 * clamp(task.pointsPossible / 150, 0, 1) +
          0.2 * typeBoost;
      return {
        task,
        course,
        score: Math.round(
          (urgency * 0.5 + impact * 0.35 + deficit * 0.15) * 100,
        ),
        due,
        reason:
          due === null
            ? "No due date"
            : due < 0
              ? `${-due} days overdue`
              : due === 0
                ? "Due today"
                : due === 1
                  ? "Due tomorrow"
                  : `Due in ${due} days`,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.task.dueAt || "9999").localeCompare(b.task.dueAt || "9999"),
    );
}
export function estimate(task: Assignment) {
  if (task.minutes > 0) return clamp(task.minutes, 5, 600);
  const factor = { assignment: 1, quiz: 1.6, exam: 2.6, project: 2.2 }[
    task.type
  ];
  return Math.round(
    clamp(
      (task.pointsPossible * 1.2 || 20) *
        factor *
        (task.type === "exam" ? 2.5 : 1),
      task.type === "exam" ? 30 : 10,
      task.type === "exam" ? 300 : 120,
    ),
  );
}
export function studyPlan(data: SchoolData, now = Date.now()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      return {
        date: date.toISOString(),
        used: 0,
        slots: [] as { task: Assignment; minutes: number }[],
      };
    }),
    remaining = new Map<string, number>();
  for (const { task, due } of rankTasks(data, now)) {
    if (due === null || due > 7) continue;
    let left = estimate(task);
    const last = Math.min(6, Math.max(0, due - 1));
    const order =
      task.type === "exam"
        ? Array.from(
            { length: Math.min(3, last + 1) },
            (_, i) => Math.max(0, last - 2) + i,
          )
        : Array.from({ length: last + 1 }, (_, i) => last - i);
    for (let n = 0; n < order.length && left > 0; n++) {
      const day = days[order[n]],
        capacity = Math.max(0, data.dailyMinutes - day.used);
      const target =
        task.type === "exam" ? Math.ceil(left / (order.length - n)) : left;
      const take = Math.min(left, capacity, target);
      if (take) {
        day.slots.push({ task, minutes: take });
        day.used += take;
        left -= take;
      }
    }
    if (left) remaining.set(task.id, left);
  }
  return { days, remaining };
}
export function letter(score: number | null) {
  if (score == null) return "—";
  return score >= 93
    ? "A"
    : score >= 90
      ? "A−"
      : score >= 87
        ? "B+"
        : score >= 83
          ? "B"
          : score >= 80
            ? "B−"
            : score >= 77
              ? "C+"
              : score >= 73
                ? "C"
                : score >= 70
                  ? "C−"
                  : score >= 60
                    ? "D"
                    : "F";
}
export function gpa(courses: Course[]) {
  const graded = courses.filter((c) => c.currentScore !== null);
  if (!graded.length) return null;
  return (
    graded.reduce(
      (sum, c) =>
        sum +
        (c.currentScore! >= 90
          ? 4
          : c.currentScore! >= 80
            ? 3
            : c.currentScore! >= 70
              ? 2
              : c.currentScore! >= 60
                ? 1
                : 0),
      0,
    ) / graded.length
  );
}
export function curve(
  raw: number,
  possible: number,
  added: number,
  target: number,
) {
  if (possible <= 0) throw Error("Possible points must be above zero.");
  return {
    rawPct: (raw / possible) * 100,
    curvedPct: ((raw + added) / possible) * 100,
    needed: Math.max(
      0,
      Math.ceil(((target / 100) * possible - raw) * 100) / 100,
    ),
  };
}

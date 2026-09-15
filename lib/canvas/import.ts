import { schoolSchema } from "./schema";
/** Import only recognized coursework fields; discard tokens, provider keys and profile data. */
export function importSchool(input: unknown) {
  const raw = input as any;
  const root = raw?.data || raw;
  if (!Array.isArray(root?.courses) || !Array.isArray(root?.tasks))
    throw Error(
      "Choose a Canvas Pro coursework snapshot with courses and tasks.",
    );
  return schoolSchema.parse({
    courses: root.courses.map((c: any) => ({
      id: String(c.id),
      name: c.name,
      code: c.code || "",
      type: c.type || "regular",
      currentScore: c.currentScore ?? null,
      targetGrade: c.targetGrade ?? 93,
      origin: c.origin || "canvas",
    })),
    tasks: root.tasks.map((t: any) => ({
      id: String(t.id),
      courseId: String(t.courseId),
      title: t.title,
      type: t.type === "test" ? "exam" : t.type,
      dueAt: t.dueAt || null,
      pointsPossible: t.pointsPossible || 0,
      pointsEarned: t.pointsEarned ?? null,
      groupWeight: t.groupWeight ?? null,
      submitted: !!t.submitted,
      needsGrading: !!t.needsGrading,
      htmlUrl: t.htmlUrl || "",
      description: t.description || "",
      done: !!t.done,
      minutes: t.minutes || 0,
    })),
    announcements: root.announcements || [],
    synced: root.synced || Date.now(),
    dailyMinutes: root.dailyMinutes || 120,
  });
}

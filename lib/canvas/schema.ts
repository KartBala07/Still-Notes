import { z } from "zod";
const label = z.string().max(250),
  id = z.string().min(1).max(120),
  score = z.number().finite().min(0).max(10000);
const canvasUrl = z
  .string()
  .max(2048)
  .refine(
    (s) => !s || /^https:\/\/[a-z0-9-]+\.instructure\.com\//i.test(s),
    "Use a Canvas HTTPS link",
  );
export const schoolSchema = z
  .object({
    courses: z
      .array(
        z.object({
          id,
          name: label,
          code: label.default(""),
          type: z.enum(["regular", "honors", "ap"]).default("regular"),
          currentScore: score.nullable().default(null),
          targetGrade: score.max(100).default(93),
          origin: z.enum(["canvas", "manual"]).default("canvas"),
        }),
      )
      .max(50),
    tasks: z
      .array(
        z.object({
          id,
          courseId: id,
          title: label,
          type: z
            .enum(["assignment", "quiz", "exam", "project"])
            .default("assignment"),
          dueAt: z.string().datetime({ offset: true }).nullable().default(null),
          pointsPossible: score.default(0),
          pointsEarned: score.nullable().default(null),
          groupWeight: score.max(100).nullable().default(null),
          submitted: z.boolean().default(false),
          needsGrading: z.boolean().default(false),
          htmlUrl: canvasUrl.default(""),
          description: z.string().max(15000).default(""),
          done: z.boolean().default(false),
          minutes: z.number().min(0).max(600).default(0),
        }),
      )
      .max(1500),
    announcements: z
      .array(
        z.object({
          id,
          courseId: id,
          title: label,
          text: z.string().max(15000),
          url: canvasUrl.default(""),
          date: z.string().max(80),
        }),
      )
      .max(150),
    synced: z.number().default(0),
    dailyMinutes: z.number().int().min(15).max(480).default(120),
  })
  .superRefine((data, ctx) => {
    const ids = new Set(data.courses.map((c) => c.id));
    if (
      ids.size !== data.courses.length ||
      new Set(data.tasks.map((t) => t.id)).size !== data.tasks.length ||
      data.tasks.some((t) => !ids.has(t.courseId)) ||
      new Set(data.announcements.map((a) => a.id)).size !==
        data.announcements.length ||
      data.announcements.some((a) => !ids.has(a.courseId))
    )
      ctx.addIssue({
        code: "custom",
        message: "Duplicate IDs or missing course",
      });
    if (new TextEncoder().encode(JSON.stringify(data)).length > 800000)
      ctx.addIssue({
        code: "custom",
        message: "Import fewer courses (800 KB per snapshot)",
      });
  });

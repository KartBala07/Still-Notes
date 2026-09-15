import { z } from "zod";
const label = z.string().max(300),
  id = z.string().max(120);
export const contentSchema = z
  .object({
    syllabus: z.string().max(15000).default(""),
    files: z
      .array(
        z.object({
          id,
          name: label,
          type: z.string().max(150),
          size: z.number().min(0).max(1e10),
          locked: z.boolean().default(false),
        }),
      )
      .max(1000)
      .default([]),
    modules: z
      .array(
        z.object({
          id,
          name: label,
          items: z
            .array(
              z.object({
                id,
                title: label,
                type: z.string().max(80),
                contentId: id.optional(),
                page: z.string().max(300).optional(),
                url: z
                  .string()
                  .max(2048)
                  .refine((s) => !s || /^https:\/\//i.test(s))
                  .default(""),
              }),
            )
            .max(500),
        }),
      )
      .max(100)
      .default([]),
    updated: z.number().default(0),
  })
  .refine(
    (x) => new TextEncoder().encode(JSON.stringify(x)).length < 700000,
    "Course content is too large.",
  );
export type CourseContent = z.infer<typeof contentSchema>;
export const emptyContent: CourseContent = contentSchema.parse({});

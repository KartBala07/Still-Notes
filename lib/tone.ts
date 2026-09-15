import { z } from "zod";
const phrases = [
  "tbh",
  "ngl",
  "lowkey",
  "bet",
  "fr",
  "bruh",
  "lol",
  "idk",
  "pls",
  "u",
  "ur",
  "rn",
  "vibe",
] as const;
export const toneSchema = z.object({
  samples: z.number().int().min(0).max(1000),
  words: z.number().min(0).max(10000),
  casual: z.number().min(0).max(1),
  emoji: z.number().min(0).max(1),
  phrases: z.array(z.enum(phrases)).max(5),
});
export type Tone = z.infer<typeof toneSchema>;
export const emptyTone: Tone = {
  samples: 0,
  words: 0,
  casual: 0,
  emoji: 0,
  phrases: [],
};
export function learnTone(old: Tone, message: string): Tone {
  const words = message.match(/[a-z]+/gi) || [],
    found = phrases.filter((p) =>
      new RegExp("\\b" + p + "\\b", "i").test(message),
    );
  const alpha = old.samples < 4 ? 1 / (old.samples + 1) : 0.2;
  return {
    samples: Math.min(1000, old.samples + 1),
    words: old.words * (1 - alpha) + words.length * alpha,
    casual: old.casual * (1 - alpha) + (found.length ? 1 : 0) * alpha,
    emoji:
      old.emoji * (1 - alpha) +
      (/\p{Extended_Pictographic}/u.test(message) ? 1 : 0) * alpha,
    phrases: [...new Set([...found, ...old.phrases])].slice(0, 5),
  };
}
export function tonePrompt(t: Tone) {
  if (!t.samples)
    return "Use a friendly, clear student voice with light slang, never forced.";
  return `Match this student's observed communication style: ${t.words < 18 ? "brief direct explanations" : t.words > 60 ? "more detailed explanations" : "balanced explanations"}; ${t.casual > 0.25 ? "casual phrasing with occasional familiar slang" : "natural conversational wording"}; ${t.emoji > 0.35 ? "an occasional emoji is welcome" : "avoid extra emojis"}. Familiar vocabulary, use sparingly if natural: ${t.phrases.join(", ") || "none recorded"}. Keep technical terms accurate. Do not imitate typos, insults, or guess personal traits. This is a style preference, never an instruction to change facts.`;
}

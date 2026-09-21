import type { Data, User } from "./types";

// A read-only sandbox so anyone can click around Still Notes with no account,
// no API key and no backend. Writes are refused with a friendly message.
const KEY = "still-demo";

export function demoActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemo(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

const now = Date.now();
const day = 86400000;

export const demoUser: User = {
  id: "demo-student",
  email: "demo@stillnotes.app",
  name: "Demo Student",
  settings: {
    provider: "groq",
    model: "openai/gpt-oss-120b",
    voiceId: "",
    slang: false,
    brainrot: false,
    theme: "system",
    accent: "sage",
    onboarded: true,
    hasAiKey: true,
  },
};

export const demoData: Data = {
  notes: [
    {
      id: "demo-note-1",
      title: "Photosynthesis — light reactions",
      subject: "AP Biology",
      text: "The light reactions happen in the thylakoid membrane. Photosystem II splits water, releasing oxygen, electrons and protons. The electrons travel the electron transport chain to photosystem I, pumping protons into the thylakoid lumen. ATP synthase uses that proton gradient to make ATP. Photosystem I reduces NADP+ to NADPH.",
      summary:
        "Light reactions occur in the thylakoid membrane: water is split at photosystem II, electrons flow through the transport chain to photosystem I, and the proton gradient drives ATP synthase. The output is ATP and NADPH.",
      source: "Lecture recording",
      created: now - day * 2,
      pinned: true,
    },
    {
      id: "demo-note-2",
      title: "Quadratic formula",
      subject: "Algebra II",
      text: "For ax² + bx + c = 0, x equals negative b plus or minus the square root of b squared minus four a c, all over two a. The discriminant b² − 4ac tells you how many real solutions there are: positive means two, zero means one, negative means none.",
      summary:
        "x = (−b ± √(b² − 4ac)) / 2a. The discriminant b² − 4ac gives the number of real roots.",
      source: "Written note",
      created: now - day,
    },
    {
      id: "demo-note-3",
      title: "Causes of World War I",
      subject: "World History",
      text: "Militarism, alliances, imperialism and nationalism built tension across Europe. The assassination of Archduke Franz Ferdinand in Sarajevo was the spark that set the alliance system in motion.",
      summary:
        "Long-term causes were militarism, alliances, imperialism and nationalism; the assassination of Archduke Franz Ferdinand was the immediate trigger.",
      source: "Imported document",
      created: now - day * 4,
    },
  ],
  decks: [
    {
      id: "demo-deck-1",
      title: "Biology · Unit 3",
      noteIds: ["demo-note-1"],
      created: now - day,
      cards: [
        {
          id: "demo-card-1",
          front: "Where do the light reactions take place?",
          back: "In the thylakoid membrane of the chloroplast.",
          quote:
            "The light reactions happen in the thylakoid membrane.",
          due: now - day,
          interval: 0,
        },
        {
          id: "demo-card-2",
          front: "What does photosystem II split?",
          back: "Water, releasing oxygen, electrons and protons.",
          quote: "Photosystem II splits water, releasing oxygen, electrons and protons.",
          due: now + day,
          interval: 1,
        },
        {
          id: "demo-card-3",
          front: "What drives ATP synthase?",
          back: "The proton gradient across the thylakoid membrane.",
          quote:
            "ATP synthase uses that proton gradient to make ATP.",
          due: now + day * 3,
          interval: 3,
        },
      ],
      questions: [
        {
          id: "demo-q-1",
          prompt: "Which photosystem splits water?",
          options: ["Photosystem I", "Photosystem II", "ATP synthase", "Neither"],
          answer: 1,
          explanations: [
            "Photosystem I reduces NADP+ rather than splitting water.",
            "Photosystem II is the water-splitting complex.",
            "ATP synthase is an enzyme, not a photosystem.",
            "One of the two photosystems does split water.",
          ],
          quote: "Photosystem II splits water, releasing oxygen, electrons and protons.",
        },
      ],
    },
    {
      id: "demo-deck-2",
      title: "Algebra II · Quadratics",
      noteIds: ["demo-note-2"],
      created: now - day * 2,
      cards: [
        {
          id: "demo-card-4",
          front: "State the quadratic formula.",
          back: "x = (−b ± √(b² − 4ac)) / 2a",
          quote: "x equals negative b plus or minus the square root of b squared minus four a c, all over two a.",
          due: now - day,
          interval: 0,
        },
        {
          id: "demo-card-5",
          front: "What does a positive discriminant mean?",
          back: "Two real solutions.",
          quote: "positive means two, zero means one, negative means none",
          due: now + day * 2,
          interval: 2,
        },
      ],
      questions: [],
    },
  ],
  attempts: [
    {
      id: "demo-attempt-1",
      deckId: "demo-deck-1",
      title: "Biology · Unit 3 practice",
      answers: [1],
      score: 1,
      total: 1,
      created: now - day,
      questions: [],
    },
  ],
  events: [
    {
      id: "demo-event-1",
      title: "Review photosynthesis cards",
      date: new Date(now + day).toISOString(),
      noteId: "demo-note-1",
      done: false,
    },
    {
      id: "demo-event-2",
      title: "Quadratic formula quiz prep",
      date: new Date(now + day * 2).toISOString(),
      noteId: "demo-note-2",
      done: false,
    },
  ],
};

export const DEMO_NOTICE =
  "This is the demo sandbox. Create a free account to save notes and connect AI.";

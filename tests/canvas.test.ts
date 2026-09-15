import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rankTasks,
  studyPlan,
  estimate,
  gpa,
  curve,
} from "../lib/canvas/engine";
import { importSchool } from "../lib/canvas/import";
import { schoolSchema } from "../lib/canvas/schema";
import { emptyTone, learnTone, tonePrompt } from "../lib/tone";
import { youtubeId, youtubeEmbed } from "../lib/youtube";
const now = +new Date("2026-09-15T12:00:00Z");
function fixture() {
  return importSchool({
    courses: [{ id: "c", name: "Biology", currentScore: 82 }],
    tasks: [
      {
        id: "exam",
        courseId: "c",
        title: "Cell exam",
        type: "exam",
        dueAt: "2026-09-18T18:00:00Z",
        pointsPossible: 100,
        minutes: 180,
      },
      {
        id: "late",
        courseId: "c",
        title: "Lab",
        dueAt: "2026-09-14T18:00:00Z",
        pointsPossible: 20,
        minutes: 60,
      },
      { id: "done", courseId: "c", title: "Submitted", submitted: true },
      { id: "manual", courseId: "c", title: "Done", done: true },
    ],
    dailyMinutes: 30,
  });
}
test("priorities exclude completed work and label overdue tasks", () => {
  const ranked = rankTasks(fixture(), now);
  assert.equal(ranked.length, 2);
  assert.match(ranked.find((x) => x.task.id === "late")!.reason, /overdue/);
  assert.ok(ranked.every((x) => x.score >= 0 && x.score <= 100));
});
test("study plan respects daily capacity and accounts for every estimated minute", () => {
  const data = fixture(),
    plan = studyPlan(data, now);
  for (const day of plan.days) {
    assert.ok(day.used <= data.dailyMinutes);
    assert.equal(
      day.used,
      day.slots.reduce((n, s) => n + s.minutes, 0),
    );
  }
  for (const task of data.tasks.filter((t) => !t.done && !t.submitted)) {
    const allocated = plan.days
      .flatMap((d) => d.slots)
      .filter((s) => s.task.id === task.id)
      .reduce((n, s) => n + s.minutes, 0);
    assert.equal(
      allocated + (plan.remaining.get(task.id) || 0),
      estimate(task),
    );
  }
  assert.ok(plan.remaining.size > 0);
});
test("coursework import removes credentials and refuses cross-course references and unsafe links", () => {
  const data = fixture();
  const parsed = schoolSchema.parse({
    ...data,
    token: "sensitive",
    profile: { email: "private" },
    courses: data.courses.map((c) => ({ ...c, key: "hidden" })),
  });
  assert.ok(!JSON.stringify(parsed).includes("sensitive"));
  assert.ok(!JSON.stringify(parsed).includes("hidden"));
  assert.throws(() =>
    schoolSchema.parse({
      ...data,
      tasks: [{ ...data.tasks[0], courseId: "missing" }],
    }),
  );
  assert.throws(() =>
    schoolSchema.parse({
      ...data,
      tasks: [
        {
          ...data.tasks[0],
          htmlUrl: "https://school.instructure.com.evil.test/x",
        },
      ],
    }),
  );
  assert.throws(() =>
    schoolSchema.parse({
      ...data,
      announcements: [
        { id: "a", courseId: "missing", title: "A", text: "x", date: "" },
      ],
    }),
  );
});
test("grade estimates and point curves use explicit denominators", () => {
  assert.equal(gpa([]), null);
  assert.equal(gpa(fixture().courses), 2.7);
  assert.deepEqual(curve(38, 50, 5, 90), {
    rawPct: 76,
    curvedPct: 86,
    needed: 7,
  });
  assert.throws(() => curve(1, 0, 0, 90));
});
test("style adaptation stores bounded statistics without raw messages", () => {
  const message = "ngl can u explain this private-word XYZ 😀";
  let profile = learnTone(emptyTone, message);
  for (let i = 0; i < 1100; i++) profile = learnTone(profile, "pls help");
  assert.equal(profile.samples, 1000);
  assert.ok(profile.phrases.length <= 5);
  assert.ok(!JSON.stringify(profile).includes("XYZ"));
  assert.match(tonePrompt(profile), /Keep technical terms accurate/);
  assert.equal(emptyTone.samples, 0);
});
test("video links allow only HTTPS YouTube identities and fixed embed origins", () => {
  assert.equal(youtubeId("https://youtu.be/dQw4w9WgXcQ?t=10"), "dQw4w9WgXcQ");
  for (const url of [
    "javascript:alert(1)",
    "https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ",
    "https://evil@youtube.com/watch?v=dQw4w9WgXcQ",
    "http://youtube.com/watch?v=dQw4w9WgXcQ",
  ])
    assert.equal(youtubeId(url), null);
  assert.equal(
    new URL(youtubeEmbed("dQw4w9WgXcQ")).origin,
    "https://www.youtube-nocookie.com",
  );
  assert.throws(() => youtubeEmbed("../unsafe"));
});

test("Canvas Pro snapshot import includes unique To Do tasks and keeps authoritative assignment rows", () => {
 const data=fixture(), next=importSchool({...data,todos:[{...data.tasks[0],title:'Duplicate todo'}, {...data.tasks[0],id:'todo-only',title:'Todo only'}]});
 assert.equal(next.tasks.length,data.tasks.length+1);assert.equal(next.tasks[0].title,'Cell exam');assert.equal(next.tasks.at(-1)!.title,'Todo only');
});

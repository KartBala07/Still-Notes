import { test } from "node:test";
import assert from "node:assert/strict";
import { importSchool } from "../lib/canvas/import";
import {
  parseSyllabus,
  lateCredit,
  lateRank,
  projectedGrade,
  effortFactors,
  timedPlan,
  toolsSchema,
} from "../lib/canvas/tools";
const now = +new Date("2026-09-15T12:00:00Z");
function fixture() {
  return importSchool({
    courses: [{ id: "c", name: "Math" }],
    tasks: [
      {
        id: "a",
        courseId: "c",
        title: "Assignment",
        type: "assignment",
        pointsPossible: 100,
        pointsEarned: 90,
        groupId: "homework",
        groupWeight: 20,
        minutes: 120,
        dueAt: "2026-09-14T18:00:00Z",
      },
      {
        id: "b",
        courseId: "c",
        title: "Exam",
        type: "exam",
        pointsPossible: 100,
        pointsEarned: 50,
        groupId: "tests",
        groupWeight: 80,
        minutes: 180,
        dueAt: "2026-09-19T18:00:00Z",
      },
      {
        id: "d",
        courseId: "c",
        title: "Not graded yet",
        pointsPossible: 100,
        groupId: "tests",
        groupWeight: 80,
      },
      {
        id: "e",
        courseId: "c",
        title: "Excused",
        pointsPossible: 100,
        pointsEarned: 0,
        excused: true,
        groupId: "tests",
        groupWeight: 80,
      },
    ],
    dailyMinutes: 90,
  });
}
test("syllabus caps, grace periods and late cutoffs remain untrusted until confirmed", () => {
  const s = parseSyllabus(
    "Exams 80%\nHomework 20%\nLate work: full credit for 2 days, then 10% per day; Late work maximum credit 80%; Late work not accepted after 5 days",
  );
  assert.equal(s.weights.exam, 80);
  assert.equal(s.late.maxCredit, 80);
  assert.equal(s.late.minCredit, 0);
  assert.equal(lateCredit(s, 9).credit, 1);
  s.confirmed = true;
  assert.equal(lateCredit(s, 1).credit, 1);
  assert.equal(lateCredit(s, 3).credit, 0.8);
  assert.equal(lateCredit(s, 6).credit, 0);
  assert.equal(
    lateCredit({ ...s, late: { ...s.late, noLate: true } }, 1).credit,
    0,
  );
  const tools = toolsSchema.parse({ syllabi: { c: s } });
  assert.equal(lateRank(fixture(), tools, now).length, 1);
  assert.throws(() =>
    toolsSchema.parse({
      syllabi: {
        c: { ...s, late: { ...s.late, minCredit: 90, maxCredit: 80 } },
      },
    }),
  );
});
test("what-if grades normalize populated weighted groups and exclude excused and ungraded work", () => {
  const data = fixture();
  const result = projectedGrade(data.tasks, {});
  assert.ok(Math.abs(result.pct! - 58) < 1e-8);
  assert.equal(result.excluded, 1);
  assert.equal(projectedGrade(data.tasks, { b: 100 }).pct, 98);
  const points = parseSyllabus("");
  points.mode = "points";
  assert.equal(projectedGrade(data.tasks, {}, points).pct, 70);
  assert.equal(
    projectedGrade(
      data.tasks.filter((t) => t.id === "a"),
      {},
    ).pct,
    90,
  );
});
test("effort factors count the original task estimate once across multiple work sessions", () => {
  const tools = toolsSchema.parse({
    effort: [
      { id: "1", taskId: "a", minutes: 90, estimate: 120, at: now },
      { id: "2", taskId: "a", minutes: 90, estimate: 120, at: now },
    ],
  });
  const factor = effortFactors(fixture(), tools).c;
  assert.equal(factor.actual, 180);
  assert.equal(factor.expected, 120);
  assert.equal(factor.factor, 1.5);
});
test("timed plans account for work and breaks without exceeding their study window", () => {
  const data = fixture(),
    tools = toolsSchema.parse({
      plan: { start: "18:00", end: "19:30", breakEvery: 25, breakMinutes: 5 },
    }),
    plan = timedPlan(data, tools, now);
  for (const day of plan.days) {
    assert.ok(day.sessions.reduce((n, s) => n + s.minutes, 0) <= 90);
    assert.ok(
      day.sessions.every((s) => s.start >= "18:00" && s.end <= "19:30"),
    );
    assert.equal(
      day.sessions.filter((s) => s.task).reduce((n, s) => n + s.minutes, 0),
      day.used,
    );
    for (let i = 1; i < day.sessions.length; i++)
      assert.equal(day.sessions[i].start, day.sessions[i - 1].end);
  }
  assert.ok(plan.days.some((d) => d.sessions.some((s) => s.task === null)));
  assert.throws(() =>
    toolsSchema.parse({ plan: { start: "25:00", end: "27:00" } }),
  );
  assert.throws(() =>
    toolsSchema.parse({ plan: { start: "22:00", end: "18:00" } }),
  );
});

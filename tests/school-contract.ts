import assert from "node:assert/strict";
export async function schoolContract(
  call: (
    path: string,
    method?: string,
    body?: any,
    token?: string,
  ) => Promise<{ status: number; body: any }>,
  a: string,
  b: string,
) {
  const snapshot = {
    courses: [{ id: "private-course", name: "Private algebra" }],
    tasks: [
      {
        id: "task-own",
        courseId: "private-course",
        title: "Quadratics homework",
        description: "Complete problems one through ten.",
        pointsPossible: 20,
      },
    ],
    announcements: [],
  };
  assert.equal((await call("school", "PUT", snapshot, a)).status, 200);
  const planning = {
    syllabi: {},
    curves: [
      {
        id: "curve-own",
        courseId: "private-course",
        title: "My test",
        raw: 38,
        possible: 50,
        average: 35,
        added: 5,
        target: 90,
        at: Date.now(),
      },
    ],
  };
  assert.equal((await call("school-tools", "PUT", planning, a)).status, 200);
  assert.deepEqual(
    (await call("school-tools", "GET", undefined, b)).body.curves,
    [],
  );
  assert.equal((await call("school-tools")).status, 401);
  assert.equal(
    (
      await call(
        "school-tools",
        "PUT",
        { plan: { start: "25:00", end: "26:00" } },
        a,
      )
    ).status,
    400,
  );
  const content = {
    syllabus: "Private course reading.",
    files: [
      {
        id: "1",
        name: "Reading.pdf",
        type: "application/pdf",
        size: 1024,
        url: "https://signed-secret.example",
      },
    ],
    modules: [],
    canvasToken: "do-not-save",
  };
  assert.equal(
    (await call("school-content/private-course", "PUT", content, b)).status,
    404,
  );
  assert.equal(
    (await call("school-content/private-course", "PUT", content, a)).status,
    200,
  );
  assert.equal(
    (await call("school-content/private-course", "GET", undefined, b)).status,
    404,
  );
  const stored = JSON.stringify(
    (await call("school-content/private-course", "GET", undefined, a)).body,
  );
  assert.ok(!stored.includes("signed-secret"));
  assert.ok(!stored.includes("do-not-save"));
  assert.equal(
    (
      await call(
        "school-chat/prepare",
        "POST",
        { courseId: "private-course", question: "What is due?" },
        b,
      )
    ).status,
    404,
  );
  const prepared = await call(
    "school-chat/prepare",
    "POST",
    { courseId: "private-course", question: "What is due?" },
    a,
  );
  assert.equal(prepared.status, 200);
  assert.ok(JSON.stringify(prepared.body).includes("Quadratics homework"));
  const request = {
    courseId: "private-course",
    question: "Mark my homework complete",
    localResult: {
      answer: "Your assignment is Quadratics homework.",
      citations: [{ sourceId: "task:task-own", quote: "Quadratics homework" }],
      actions: [
        { type: "setDone", id: "task-own", done: true },
        { type: "setDone", id: "someone-elses-task", done: true },
      ],
      chart: "none",
    },
  };
  const suggested = await call("school-chat", "POST", request, a);
  assert.equal(suggested.status, 200);
  assert.equal(suggested.body.actions.length, 1);
  assert.equal(
    (await call("school", "GET", undefined, a)).body.tasks[0].done,
    false,
    "AI suggestions must not perform writes",
  );
  request.localResult.citations[0].quote = "This text was fabricated";
  const rejected = await call("school-chat", "POST", request, a);
  assert.deepEqual(rejected.body.citations, []);
  assert.deepEqual(rejected.body.actions, []);
  assert.equal(
    (
      await call(
        "school",
        "PUT",
        {
          courses: [{ id: "private-course", name: "Another users class" }],
          tasks: [],
          announcements: [],
        },
        b,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("school-content/private-course", "GET", undefined, b)).body
      .syllabus,
    "",
    "Identical school IDs must not leak another account’s documents",
  );
}

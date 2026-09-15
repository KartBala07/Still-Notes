import { test } from "node:test";
import assert from "node:assert/strict";
import { completeStudy, decodeCompletion } from "../lib/ai-completion";
const options = {
  provider: "openrouter" as const,
  model: "openrouter/free",
  key: "test-only",
  messages: [
    { role: "system", content: "Return JSON." },
    { role: "user", content: "Connection test" },
  ],
  maxTokens: 1024,
};
test("OpenRouter retries rejected JSON capabilities once using the same model and returns the actual routed model", async () => {
  const calls: any[] = [];
  const send: typeof fetch = async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    calls.push(JSON.parse(init!.body as string));
    return calls.length === 1
      ? Response.json(
          {
            error: {
              message: "No endpoints support response_format",
              code: 404,
            },
          },
          { status: 404 },
        )
      : Response.json({
          model: "vendor/free-model",
          choices: [
            { message: { content: '{"ok":true}' }, finish_reason: "stop" },
          ],
        });
  };
  const result = await completeStudy(options, send);
  assert.equal(result.model, "vendor/free-model");
  assert.equal(result.value.ok, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].provider.require_parameters, true);
  assert.equal(calls[0].max_tokens, 1024);
  assert.equal(calls[0].reasoning.exclude, true);
  assert.equal(calls[1].response_format, undefined);
  assert.equal(calls[1].model, options.model);
  assert.deepEqual(calls[1].messages, options.messages);
});
test("OpenRouter privacy, billing and quota errors do not retry or change models", async () => {
  for (const [status, message, expected] of [
    [404, "No endpoints matching your data policy", "privacy"],
    [402, "Insufficient credits", "credits"],
    [429, "Rate limit exceeded", "rate limit"],
  ] as const) {
    let calls = 0;
    await assert.rejects(
      completeStudy(options, async () => {
        calls++;
        return Response.json({ error: { code: status, message } }, { status });
      }),
      new RegExp(expected),
    );
    assert.equal(calls, 1);
  }
});
test("reasoning-only, truncated, filtered and HTTP-200 error completions are errors, not successful tests", async () => {
  for (const data of [
    { choices: [{ message: { content: null, reasoning: "thinking" } }] },
    {
      choices: [
        { finish_reason: "length", message: { content: '{"ok":true}' } },
      ],
    },
    { choices: [{ message: { refusal: "No" } }] },
    { error: { code: 429, message: "Rate limit exceeded" } },
    { choices: [{ message: { content: "[]" } }] },
  ]) {
    assert.throws(() => decodeCompletion(data, "OpenRouter"));
  }
  let calls = 0;
  await assert.rejects(
    completeStudy(options, async () => {
      calls++;
      return Response.json({
        error: { code: 429, message: "Rate limit exceeded" },
      });
    }),
    /rate limit/,
  );
  assert.equal(calls, 1);
  assert.deepEqual(
    decodeCompletion(
      {
        choices: [
          {
            message: {
              content: [{ type: "text", text: '```json\n{"ok":true}\n```' }],
            },
          },
        ],
      },
      "OpenRouter",
    ),
    { ok: true },
  );
});

import { aiError, providers } from "./ai-providers";
import type { Settings } from "./types";
export class AIConnectionError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}
export function decodeCompletion(data: any, provider: string) {
  if (data?.error)
    throw new AIConnectionError(
      aiError(
        Number(data.error.code) || 502,
        String(data.error.code || ""),
        provider,
        String(data.error.message || ""),
      ),
    );
  const choice = data?.choices?.[0],
    message = choice?.message;
  if (choice?.finish_reason === "length")
    throw new AIConnectionError(
      "The model ran out of output space. Try a smaller study set or a model with a larger output limit.",
    );
  if (message?.refusal || choice?.finish_reason === "content_filter")
    throw new AIConnectionError(
      "The model declined this request. Try another model or review the selected source material.",
    );
  const content =
    typeof message?.content === "string"
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join("\n")
        : "";
  if (!content.trim())
    throw new AIConnectionError(
      "The model returned no answer text. Reasoning models may need a larger token budget. Choose another model or retry.",
    );
  const raw = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      throw Error();
    return parsed;
  } catch {
    throw new AIConnectionError(
      "The model answered but did not produce valid study data. Try fewer questions or select another model.",
    );
  }
}
export async function completeStudy(
  options: {
    provider: Settings["provider"];
    model: string;
    key: string;
    messages: { role: string; content: string }[];
    schema?: Record<string, unknown>;
    maxTokens: number;
  },
  send: typeof fetch = fetch,
) {
  const { provider, model, key, messages, schema, maxTokens } = options,
    strict =
      provider === "groq" &&
      [
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
        "qwen/qwen3.8-27b",
      ].includes(model);
  const body: any = {
    model,
    messages,
    max_tokens: maxTokens,
    stream: false,
    temperature: 0.2,
    response_format:
      schema && strict
        ? {
            type: "json_schema",
            json_schema: { name: "study_response", strict: true, schema },
          }
        : { type: "json_object" },
  };
  if (provider === "groq" && model.startsWith("openai/gpt-oss-"))
    body.reasoning_effort = "low";
  if (provider === "deepseek") body.thinking = { type: "disabled" };
  if (provider === "openrouter") {
    body.provider = { require_parameters: true };
    body.reasoning = { effort: "low", exclude: true };
    delete body.temperature;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    let r: Response;
    try {
      r = await send(providers[provider].base + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
          ...(provider === "openrouter"
            ? {
                "HTTP-Referer":
                  "https://still-notes.swathibala988.chatgpt.site",
                "X-OpenRouter-Title": "Still Notes",
              }
            : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(110000),
      });
    } catch {
      throw new AIConnectionError(
        "The AI provider did not respond in time. Your work is saved; try again or choose another model.",
      );
    }
    const data: any = await r.json().catch(() => ({}));
    const code = String(data.error?.code || ""),
      detail = String(data.error?.message || ""),
      status = r.ok && data.error ? Number(data.error.code) || 502 : r.status;
    // Retry only a rejected format request, with the SAME selected model/provider.
    // Never change privacy settings, switch to a paid model, or retry billed output.
    if (
      provider === "openrouter" &&
      !attempt &&
      [400, 404, 422].includes(status) &&
      /response_format|json|structured|parameter|no endpoints.*support/i.test(
        detail,
      ) &&
      !/privacy|data policy|data collection/i.test(detail)
    ) {
      delete body.response_format;
      delete body.reasoning;
      delete body.provider;
      continue;
    }
    if (!r.ok || data.error)
      throw new AIConnectionError(
        aiError(status, code, providers[provider].name, detail),
        status === 429 ? 429 : 502,
      );
    return {
      value: decodeCompletion(data, providers[provider].name),
      model: typeof data.model === "string" ? data.model : model,
    };
  }
  throw new AIConnectionError("No compatible model endpoint was available.");
}

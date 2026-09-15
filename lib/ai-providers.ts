import type { Settings } from "./types";
export const providers = {
  groq: {
    name: "Groq",
    base: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
  },
  grok: {
    name: "xAI Grok",
    base: "https://api.x.ai/v1",
    model: "grok-4-1-fast-reasoning",
  },
  deepseek: {
    name: "DeepSeek",
    base: "https://api.deepseek.com",
    model: "deepseek-flash",
  },
  openrouter: {
    name: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    model: "openrouter/free",
  },
} as const;
export function providerKey(
  keys: Record<string, string>,
  provider: Settings["provider"],
) {
  if (keys["ai_" + provider]) return keys["ai_" + provider];
  if (!keys.ai) return "";
  const legacy = keys.ai.startsWith("gsk_")
    ? "groq"
    : keys.ai.startsWith("xai-")
      ? "grok"
      : keys.ai.startsWith("sk-or-")
        ? "openrouter"
        : keys.aiProvider;
  return legacy === provider ? keys.ai : "";
}
export function checkKeyProvider(key: string, provider: Settings["provider"]) {
  if (key.startsWith("gsk_") && provider !== "groq")
    return "This is a Groq key. Choose Groq, or enter a key from the selected provider.";
  if (key.startsWith("sk-or-") && provider !== "openrouter")
    return "This is an OpenRouter key. Choose OpenRouter.";
  if (key.startsWith("xai-") && provider !== "grok")
    return "This is an xAI key. Choose xAI Grok.";
  return "";
}
export function aiError(
  status: number,
  code: string,
  provider: string,
  detail = "",
) {
  if (/privacy|data policy|data collection|zdr/i.test(detail))
    return `${provider} found no model compatible with your account's privacy settings. Choose a compatible model; Still Notes will not relax those settings.`;
  if (/context|maximum.*token|too many tokens/i.test(detail) && status === 400)
    return "The selected material exceeds this model's context limit. Select fewer or shorter lessons.";
  if (status === 401 || status === 403)
    return `${provider} rejected the API key. Replace it in Settings and test the connection.`;
  if (status === 402)
    return `${provider} has no available credits or its spending limit was reached. Select openrouter/free for free routing, or check provider billing.`;
  if (status === 404 || /model_not_found|model_decommissioned/.test(code))
    return "This model is unavailable. Load current models in Settings and choose another.";
  if (status === 429)
    return `${provider} rate limit reached. Free models have shared capacity and daily quotas. Wait for the limit to reset, choose another available model, or use local AI.`;
  if (status === 503 || /no endpoints/i.test(detail))
    return `${provider} has no available endpoint for this model right now. Try another current model or use local AI.`;
  if (status === 400)
    return `${provider} could not accept this model’s request format. Check the model in Settings.`;
  return `${provider} is temporarily unavailable (${status}). Your source material is saved; try again shortly.`;
}

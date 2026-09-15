export type LocalConfig = {
  mode: "cloud" | "ollama" | "opencode";
  model: string;
  pairing: string;
};
let owner = "";
export function setLocalOwner(id: string) {
  owner = id;
}
export function localConfig(): LocalConfig {
  try {
    const s = JSON.parse(localStorage.getItem("still-local-" + owner) || "{}");
    return {
      mode: ["cloud", "ollama", "opencode"].includes(s.mode) ? s.mode : "cloud",
      model: typeof s.model === "string" ? s.model : "gemma4:e2b",
      pairing: sessionStorage.getItem("still-pair-" + owner) || "",
    };
  } catch {
    return { mode: "cloud", model: "gemma4:e2b", pairing: "" };
  }
}
export function saveLocal(config: LocalConfig) {
  if (!owner) throw Error("Sign in first");
  localStorage.setItem(
    "still-local-" + owner,
    JSON.stringify({ mode: config.mode, model: config.model }),
  );
  sessionStorage.setItem("still-pair-" + owner, config.pairing);
}
export function forgetLocal() {
  if (owner) {
    sessionStorage.removeItem("still-pair-" + owner);
  }
  owner = "";
}
export async function companion(
  path: string,
  body: unknown = {},
  pairing = localConfig().pairing,
) {
  if (!["/generate", "/models", "/health", "/canvas"].includes(path))
    throw Error("Unsupported connector action");
  if (!pairing) throw Error("Pair this computer in Settings → Local AI first.");
  let response: Response;
  try {
    response = await fetch("http://127.0.0.1:8766" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Still-Pairing": pairing,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240000),
    });
  } catch {
    throw Error(
      "Cannot reach the local connector. Start it on this computer and allow local network access if your browser asks. Local models require a compatible computer.",
    );
  }
  const data = (await response.json()) as any;
  if (!response.ok) throw Error(data.error || "Local request failed");
  return data;
}
export async function localGenerate(prepared: unknown) {
  const c = localConfig();
  const r = await companion("/generate", {
    ...(prepared as object),
    provider: c.mode,
    model: c.model,
  });
  try {
    return JSON.parse(
      r.content
        .trim()
        .replace(/^```(?:json)?\s*/, "")
        .replace(/\s*```$/, ""),
    );
  } catch {
    throw Error(
      "The local model returned incomplete study data. Try fewer questions or another installed model.",
    );
  }
}

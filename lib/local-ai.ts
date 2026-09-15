export type LocalConfig = {
  mode: "cloud" | "ollama" | "opencode";
  model: string;
  pairing: string;
};
let owner = "";
let ownerRevision = 0;
export function setLocalOwner(id: string) {
  owner = id;
  ownerRevision++;
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
  ownerRevision++;
  if (owner) {
    sessionStorage.removeItem("still-pair-" + owner);
    sessionStorage.removeItem("still-canvas-" + owner);
  }
  owner = "";
}
export async function companion(
  path: string,
  body: unknown = {},
  pairing = localConfig().pairing,
) {
  if (
    ![
      "/generate",
      "/models",
      "/health",
      "/canvas",
      "/opencode/models",
      "/canvas/connect",
      "/canvas/disconnect",
      "/canvas/sync",
      "/canvas/content",
      "/canvas/page",
      "/canvas/file",
      "/canvas/assignment",
      "/canvas/submit",
      "/canvas/read",
    ].includes(path)
  )
    throw Error("Unsupported connector action");
  if (!pairing) throw Error("Pair this computer in Settings → Local AI first.");
  const startedFor = ownerRevision;
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
  if (startedFor !== ownerRevision) throw Error("Your account changed. Run this action again in the current account.");
  if (!response.ok) throw Error(data.error || "Local request failed");
  return data;
}
export function canvasSession() {
  try {
    return sessionStorage.getItem("still-canvas-" + owner) || "";
  } catch {
    return "";
  }
}
export async function connectCanvas(base: string, token: string) {
  const out = await companion("/canvas/connect", { base, token });
  sessionStorage.setItem("still-canvas-" + owner, out.session);
  return out;
}
export async function canvasRequest(
  path: string,
  data: Record<string, unknown> = {},
) {
  const session = canvasSession();
  if (!session)
    throw Error(
      "Connect Canvas in Classes first. It stays connected in this tab for two hours.",
    );
  return companion("/canvas/" + path, { ...data, session });
}
export async function disconnectCanvas() {
  const session = canvasSession();
  try {
    if (session) await companion("/canvas/disconnect", { session });
  } finally {
    sessionStorage.removeItem("still-canvas-" + owner);
  }
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

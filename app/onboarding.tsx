"use client";
import { useState } from "react";
import {
  ArrowRight,
  Cloud,
  KeyRound,
  Laptop,
  Check,
  LoaderCircle,
  Download,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api, download } from "../lib/client";
import { providers } from "../lib/ai-providers";
import { companion, localConfig, saveLocal, DEFAULT_OLLAMA_MODEL } from "../lib/local-ai";
import type { Settings, User } from "../lib/types";

const KEY_LINKS: Record<Settings["provider"], { href: string; label: string }> = {
  groq: { href: "https://console.groq.com/keys", label: "console.groq.com/keys" },
  grok: { href: "https://console.x.ai/", label: "console.x.ai" },
  deepseek: { href: "https://platform.deepseek.com/api_keys", label: "platform.deepseek.com" },
  openrouter: { href: "https://openrouter.ai/keys", label: "openrouter.ai/keys" },
};

type Step = "choose" | "cloud" | "local" | "done";

export default function Onboarding({
  user,
  onSave,
}: {
  user: User;
  onSave: (u: User) => void;
}) {
  const [step, setStep] = useState<Step>("choose");
  const [provider, setProvider] = useState<Settings["provider"]>(
    user.settings.provider,
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pairing, setPairing] = useState(localConfig().pairing);
  const [model, setModel] = useState(localConfig().model || DEFAULT_OLLAMA_MODEL);
  const [models, setModels] = useState<string[]>([]);

  async function save(extra: Record<string, unknown> = {}) {
    const r = await api<{ user: User }>("settings", "PUT", {
      ...user.settings,
      ...extra,
    });
    onSave(r.user);
    return r.user;
  }

  async function complete() {
    setBusy(true);
    try {
      const r = await api<{ user: User }>("settings", "PUT", {
        ...user.settings,
        onboarded: true,
      });
      onSave(r.user);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCloud() {
    setBusy(true);
    setStatus("");
    try {
      await save({ provider, model: providers[provider].model, aiKey: key.trim() });
      const test = await api<{ model: string }>("ai/test", "POST");
      toast.success("AI connected — " + test.model);
      setStep("done");
    } catch (e) {
      setStatus((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pairLocal() {
    setBusy(true);
    setStatus("");
    try {
      saveLocal({ mode: "ollama", model, pairing });
      const health = await companion("/health", {}, pairing);
      if (health.version < 2) {
        throw new Error(
          "That connector is outdated. Download the current connector and run it again.",
        );
      }
      try {
        const listed = await companion("/models", {}, pairing);
        setModels(listed.models);
        if (!listed.models.includes(model) && listed.models[0]) setModel(listed.models[0]);
      } catch {
        /* model listing is optional */
      }
      await save();
      toast.success("Local connector paired");
      setStep("done");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    await complete();
    toast.success("You can set up AI any time in Settings.");
  }

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true">
      <div className="onboarding glass">
        <button
          className="onboarding-skip"
          onClick={skip}
          disabled={busy}
          aria-label="Skip setup"
        >
          <X size={16} />
        </button>

        {step === "choose" && (
          <>
            <span className="auth-symbol">
              <Sparkles />
            </span>
            <span className="eyebrow">ONE QUICK STEP</span>
            <h2>How should your AI run?</h2>
            <p className="onboarding-lede">
              Still Notes can use a cloud key or a model on this computer. You can
              change this any time in Settings.
            </p>
            <div className="onboarding-cards">
              <button className="onboarding-card" onClick={() => setStep("cloud")}>
                <Cloud size={22} />
                <strong>Use an API key</strong>
                <span>Groq, xAI, DeepSeek or OpenRouter. Works on every device.</span>
              </button>
              <button className="onboarding-card" onClick={() => setStep("local")}>
                <Laptop size={22} />
                <strong>Run it on this computer</strong>
                <span>Ollama with the local connector. Your notes stay on your machine.</span>
              </button>
            </div>
            <button className="onboarding-skip-text" onClick={skip} disabled={busy}>
              I’ll decide later
            </button>
          </>
        )}

        {step === "cloud" && (
          <>
            <span className="auth-symbol">
              <KeyRound />
            </span>
            <span className="eyebrow">CLOUD AI</span>
            <h2>Add your API key</h2>
            <ol className="onboarding-steps">
              <li>
                Open{" "}
                <a href={KEY_LINKS[provider].href} target="_blank" rel="noreferrer">
                  {KEY_LINKS[provider].label} ↗
                </a>{" "}
                and sign in.
              </li>
              <li>
                Choose <strong>Create API key</strong> and copy it. It stays
                private to your account.
              </li>
              <li>Pick your provider, paste the key, then save and test.</li>
            </ol>
            <label>
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as Settings["provider"])}
              >
                <option value="groq">Groq — fast, generous free tier</option>
                <option value="grok">xAI Grok</option>
                <option value="deepseek">DeepSeek — paid credits</option>
                <option value="openrouter">OpenRouter — free models available</option>
              </select>
            </label>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  user.settings.hasAiKey ? "A key is already saved — paste to replace" : "Paste your key"
                }
              />
            </label>
            {status && (
              <p className="connection-result" role="status">
                {status}
              </p>
            )}
            <div className="onboarding-actions">
              <button className="text-link" onClick={() => setStep("choose")} disabled={busy}>
                Back
              </button>
              <button className="primary" onClick={saveCloud} disabled={busy}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Testing…
                  </>
                ) : (
                  <>
                    Save &amp; test <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === "local" && (
          <>
            <span className="auth-symbol">
              <Laptop />
            </span>
            <span className="eyebrow">LOCAL AI</span>
            <h2>Run a model on this computer</h2>
            <ol className="onboarding-steps">
              <li>
                Install Ollama from{" "}
                <a href="https://ollama.com/download" target="_blank" rel="noreferrer">
                  ollama.com/download ↗
                </a>
                .
              </li>
              <li>
                In a terminal run <code>ollama pull {model || DEFAULT_OLLAMA_MODEL}</code>.
              </li>
              <li>
                Download the connector below and run it with Python 3. It prints a
                pairing code.{" "}
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      const response = await fetch(
                        new URL("../public/local-companion.py", import.meta.url).href,
                      );
                      if (!response.ok) throw Error("Download unavailable");
                      download("local-companion.py", await response.text());
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Download size={14} /> Download connector
                </button>
              </li>
              <li>Paste the code and the model name, then pair.</li>
            </ol>
            <label>
              Pairing code
              <input
                type="password"
                autoComplete="off"
                value={pairing}
                onChange={(e) => setPairing(e.target.value)}
                placeholder="Printed by the connector"
              />
            </label>
            <label>
              Ollama model
              <input
                value={model}
                list="onboarding-models"
                onChange={(e) => setModel(e.target.value)}
                placeholder={DEFAULT_OLLAMA_MODEL}
              />
              <datalist id="onboarding-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
            {status && (
              <p className="connection-result" role="status">
                {status}
              </p>
            )}
            <p className="hint">
              Keep the connector window open while you study. Tablets and phones
              can still use a cloud key later.
            </p>
            <div className="onboarding-actions">
              <button className="text-link" onClick={() => setStep("choose")} disabled={busy}>
                Back
              </button>
              <button className="primary" onClick={pairLocal} disabled={busy || !pairing}>
                {busy ? (
                  <>
                    <LoaderCircle size={16} className="spin" /> Pairing…
                  </>
                ) : (
                  <>
                    Save &amp; pair <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {step === "done" && (
          <>
            <span className="auth-symbol">
              <Check />
            </span>
            <span className="eyebrow">YOU’RE READY</span>
            <h2>That’s everything.</h2>
            <p className="onboarding-lede">
              Record a lecture, import a document, or generate a study set. Every
              AI option lives in Settings whenever you want to change it.
            </p>
            <button className="primary" onClick={complete} disabled={busy}>
              Start studying <ArrowRight size={16} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

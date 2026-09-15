"use client";
import { useEffect, useState } from "react";
import { Monitor, Link, RotateCcw, Download } from "lucide-react";
import { toast } from "sonner";
import {
  localConfig,
  saveLocal,
  companion,
  type LocalConfig,
} from "../lib/local-ai";
import { api, download } from "../lib/client";
import { emptyTone, type Tone } from "../lib/tone";
export function LocalSettings() {
  const [s, setS] = useState<LocalConfig>(localConfig),
    [models, setModels] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  async function run(list = false) {
    setBusy(true);
    try {
      saveLocal(s);
      const r = await companion(
        list
          ? s.mode === "opencode"
            ? "/opencode/models"
            : "/models"
          : "/health",
        {},
        s.pairing,
      );
      if (list) {
        const found =
          s.mode === "opencode"
            ? r.models.map((m: { id: string }) => m.id)
            : r.models;
        setModels(found);
        if (!s.model && found[0]) {
          const next = { ...s, model: found[0] };
          setS(next);
          saveLocal(next);
        }
      }
      setStatus(
        list
          ? "Choose one of the available models below."
          : r.version >= 2
            ? "Connector v2 paired. Now load models and test your chosen AI."
            : "Your connector is outdated. Download the new connector, restart it, and pair again.",
      );
      toast.success(
        list ? "Installed models loaded" : "Local connector connected",
      );
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass settings-panel local-settings">
      <h2>
        <Monitor size={20} />
        AI on this device
      </h2>
      <p>
        Keep Ollama and OpenCode as your local options for notes, flashcards,
        practice questions and chat.
      </p>
      <label>
        Run study AI with
        <select
          value={s.mode}
          onChange={(e) =>
            setS({
              ...s,
              mode: e.target.value as LocalConfig["mode"],
              model: e.target.value === "opencode" ? "" : "gemma4:e2b",
            })
          }
        >
          <option value="cloud">Cloud provider below</option>
          <option value="ollama">Ollama · local models</option>
          <option value="opencode">OpenCode · local connector</option>
        </select>
      </label>
      {s.mode === "opencode" && (
        <div className="local-guide">
          <strong>OpenCode setup</strong>
          <p>
            Start OpenCode in a dedicated folder, disable automatic sharing, and
            connect your preferred provider there. You can use Gemini, OpenAI,
            OpenRouter, Copilot or a local Ollama provider that your OpenCode
            installation supports.
          </p>
          <code>opencode serve --hostname 127.0.0.1 --port 4096</code>
          <a
            href="https://opencode.ai/docs/providers/"
            target="_blank"
            rel="noreferrer"
          >
            OpenCode provider setup ↗
          </a>
        </div>
      )}
      <div className="local-guide">
        <strong>Pair this computer</strong>
        <p>
          Download the connector, then run it with Python 3. It prints a pairing
          code for this tab. It also connects your Canvas account.
        </p>
        <button
          className="secondary"
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
          <Download size={15} />
          Download connector
        </button>
        <code>
          macOS: python3 local-companion.py
          <br />
          Windows: py local-companion.py
        </code>
      </div>
      <label>
        Pairing code
        <input
          type="password"
          autoComplete="off"
          value={s.pairing}
          onChange={(e) => setS({ ...s, pairing: e.target.value })}
          placeholder="From the connector running on this computer"
        />
      </label>
      {s.mode !== "cloud" && (
        <>
          <label>
            {s.mode === "ollama"
              ? "Installed Ollama model"
              : "OpenCode provider/model"}
            <input
              value={s.model}
              list="local-models"
              onChange={(e) => setS({ ...s, model: e.target.value })}
            />
            <datalist id="local-models">
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </label>
          <p className="hint">
            {s.mode === "ollama"
              ? "Ollama must be running with the selected model downloaded. Your source text goes to this computer for generation; saved notes still sync to your account."
              : "OpenCode runs locally, but the provider you choose may use a cloud model. Choose an Ollama-backed provider for local inference. Study sessions have tools disabled."}
          </p>
        </>
      )}
      <div className="connection-actions">
        <button className="primary" disabled={busy} onClick={() => run()}>
          <Link size={15} />
          Save & pair
        </button>
        {s.mode !== "cloud" && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => run(true)}
          >
            {s.mode === "opencode"
              ? "Load OpenCode models"
              : "List installed models"}
          </button>
        )}
        {s.mode !== "cloud" && (
          <button
            className="secondary"
            disabled={busy || !s.model}
            onClick={async () => {
              setBusy(true);
              try {
                saveLocal(s);
                const r = await companion("/generate", {
                  provider: s.mode,
                  model: s.model,
                  messages: [
                    {
                      role: "system",
                      content: 'Return one JSON object only: {"ok":true}',
                    },
                    { role: "user", content: "Connection test" },
                  ],
                  schema: {
                    type: "object",
                    properties: { ok: { type: "boolean" } },
                    required: ["ok"],
                    additionalProperties: false,
                  },
                });
                const value = JSON.parse(
                  r.content
                    .trim()
                    .replace(/^```(?:json)?\s*/, "")
                    .replace(/\s*```$/, ""),
                );
                if (value.ok !== true)
                  throw Error(
                    "The server connected but the model did not produce valid JSON. Choose another model.",
                  );
                setStatus("AI test passed · " + r.model);
                toast.success("Local AI is responding");
              } catch (e) {
                setStatus((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Test {s.mode === "opencode" ? "OpenCode" : "Ollama"}
          </button>
        )}
        <button
          className="secondary"
          onClick={() => {
            saveLocal(s);
            toast.success("AI choice saved for this device");
          }}
        >
          Save AI choice
        </button>
      </div>
      {status && (
        <p className="connection-result" role="status">
          {status}
        </p>
      )}
      <p className="hint">
        Local models require a computer running the connector. Tablets and
        phones can use the cloud provider. Some browsers restrict websites from
        connecting to local services; allow local network access when supported.
      </p>
    </section>
  );
}
export function ToneSettings({ enabled }: { enabled: boolean }) {
  const [tone, setTone] = useState<Tone>(emptyTone);
  useEffect(() => {
    api<Tone>("tone")
      .then(setTone)
      .catch(() => {});
  }, []);
  return (
    <section className="glass settings-panel">
      <h2>Your communication style</h2>
      <p>
        {enabled
          ? "Gen Z mode adapts to your wording as you chat."
          : "Enable Gen Z mode to adapt explanations to the way you communicate."}
      </p>
      <div className="tone-stats">
        <span>{tone.samples} messages observed</span>
        <span>
          {tone.samples
            ? (tone.words < 18
                ? "Concise"
                : tone.words > 60
                  ? "Detailed"
                  : "Balanced") + " explanations"
            : "Still getting to know your style"}
        </span>
        {tone.phrases.length > 0 && <span>{tone.phrases.join(" · ")}</span>}
      </div>
      <p className="hint">
        Only simple style statistics and a small list of familiar words are
        saved to your private account. We don’t retain the raw messages in this
        profile or train model weights. Technical terms stay accurate.
      </p>
      <button
        className="secondary"
        onClick={async () => {
          try {
            await api("tone", "DELETE");
            setTone(emptyTone);
            toast.success("Learned style reset");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      >
        <RotateCcw size={15} />
        Reset learned style
      </button>
    </section>
  );
}

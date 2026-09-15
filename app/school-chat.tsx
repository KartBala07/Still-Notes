"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Sparkles, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/client";
import { localConfig } from "../lib/local-ai";
import type { PlanningProps } from "./school-planning";
type Answer = {
  answer: string;
  citations: { sourceId: string; quote: string }[];
  actions: { type: "setDone"; id: string; done: boolean }[];
  chart: "grades" | "workload" | "none";
};
type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: Answer;
};
export function CourseworkChat(p: PlanningProps) {
  const [messages, setMessages] = useState<Message[]>([]),
    [question, setQuestion] = useState(""),
    [course, setCourse] = useState("all"),
    [include, setInclude] = useState(true),
    [busy, setBusy] = useState(false),
    end = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      end.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
      }),
    [messages],
  );
  async function send(text = question) {
    if (!text.trim() || busy) return;
    const history = messages
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 5000) }));
    setQuestion("");
    setMessages((old) => [
      ...old,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setBusy(true);
    try {
      const result = await api<Answer>("school-chat", "POST", {
        question: text,
        history,
        includeContext: include,
        courseId: course === "all" ? undefined : course,
      });
      setMessages((old) => [
        ...old,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.answer,
          result,
        },
      ]);
    } catch (e) {
      toast.error((e as Error).message);
      setQuestion(text);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="glass school-panel coursework-chat">
      <div className="section-title">
        <div>
          <span className="eyebrow">CANVAS PRO ASSISTANT</span>
          <h2>Think through your school day.</h2>
          <p>
            Ask about your classes, grades, deadlines and imported syllabus.
          </p>
        </div>
        <span className="subject">
          {localConfig().mode === "cloud"
            ? "Cloud AI"
            : localConfig().mode === "opencode"
              ? "OpenCode"
              : "Ollama"}
        </span>
      </div>
      <div className="assignment-filters">
        <select
          aria-label="Chat course context"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
        >
          <option value="all">All my classes</option>
          {p.data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="check-line">
          <input
            type="checkbox"
            checked={include}
            onChange={(e) => setInclude(e.target.checked)}
          />
          Include my coursework
        </label>
        <button
          className="text-link"
          disabled={busy}
          onClick={() => setMessages([])}
        >
          <RotateCcw size={14} />
          Clear chat
        </button>
      </div>
      <div className="coursework-messages" aria-live="polite">
        {!messages.length && (
          <div className="school-empty">
            <Sparkles size={32} />
            <h3>A little clarity goes a long way.</h3>
            <div className="chat-starters">
              {[
                "What should I work on first today?",
                "Which classes need my attention?",
                "Show my grades as a chart.",
                "Explain my late-work policy.",
              ].map((s) => (
                <button key={s} className="secondary" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <article className={"coursework-message " + m.role} key={m.id}>
            <span>{m.role === "user" ? "You" : "Study assistant"}</span>
            <p className="source-text">{m.content}</p>
            {m.result?.citations.length ? (
              <details>
                <summary>
                  {m.result.citations.length} coursework sources
                </summary>
                {m.result.citations.map((c, i) => (
                  <blockquote key={i}>
                    <small>{c.sourceId}</small>
                    <p>{c.quote}</p>
                  </blockquote>
                ))}
              </details>
            ) : null}
            {m.result?.actions.map((a, i) => (
              <button
                className="secondary"
                disabled={p.busy}
                key={i}
                onClick={async () => {
                  try {
                    await p.save({
                      ...p.data,
                      tasks: p.data.tasks.map((t) =>
                        t.id === a.id ? { ...t, done: a.done } : t,
                      ),
                    });
                    toast.success("Checklist updated");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Check size={15} />
                {a.done ? "Mark complete: " : "Reopen: "}
                {p.data.tasks.find((t) => t.id === a.id)?.title}
              </button>
            ))}
            {m.result && m.result.chart !== "none" && (
              <div
                className="course-chart"
                aria-label={
                  m.result.chart === "grades"
                    ? "Current grades"
                    : "Open assignments by class"
                }
              >
                {p.data.courses
                  .filter((c) => course === "all" || c.id === course)
                  .map((c) => {
                    const n =
                        m.result!.chart === "grades"
                          ? c.currentScore
                          : p.data.tasks.filter(
                              (t) =>
                                t.courseId === c.id && !t.done && !t.submitted,
                            ).length,
                      max =
                        m.result!.chart === "grades"
                          ? 100
                          : Math.max(1, p.data.tasks.length);
                    return (
                      <div key={c.id}>
                        <span>{c.name}</span>
                        <div>
                          <i
                            style={{
                              width:
                                Math.min(100, ((n || 0) / max) * 100) + "%",
                            }}
                          />
                        </div>
                        <strong>
                          {n == null
                            ? "—"
                            : n +
                              (m.result!.chart === "grades" ? "%" : " open")}
                        </strong>
                      </div>
                    );
                  })}
              </div>
            )}
          </article>
        ))}
        {busy && <p className="hint">Reading your coursework…</p>}
        <div ref={end} />
      </div>
      <form
        className="coursework-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          aria-label="Question about coursework"
          rows={2}
          value={question}
          maxLength={3000}
          placeholder="Ask about your classes…"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          className="primary"
          disabled={busy || !question.trim()}
          aria-label="Send question"
        >
          <Send size={18} />
        </button>
      </form>
      <p className="hint">
        Uses your selected coursework only. No web searches. Suggested checklist
        changes require your click; the assistant cannot submit homework.
      </p>
    </section>
  );
}

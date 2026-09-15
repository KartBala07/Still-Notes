"use client";
import { useEffect, useState } from "react";
import {
  BookOpen,
  Download,
  ExternalLink,
  FileText,
  FolderOpen,
  RefreshCw,
  Upload,
  X,
  Send,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, download, extract } from "../lib/client";
import { canvasRequest } from "../lib/local-ai";
import { emptyContent, type CourseContent } from "../lib/canvas/content";
import { estimate } from "../lib/canvas/engine";
import {
  SyllabusEditor,
  GradeProjection,
  type PlanningProps,
} from "./school-planning";
import type { Assignment } from "../lib/canvas/types";
type Props = PlanningProps & {
  onLesson: (id: string) => void;
  startTab?: string;
  initialCourse?: string;
};
async function attempt(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
const safeUrl = (s: string) => {
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : "";
  } catch {
    return "";
  }
};
async function toWire(file: File) {
  if (file.size > 15000000)
    throw Error("Choose files totaling less than 15 MB.");
  return new Promise<{ name: string; type: string; data: string }>(
    (resolve, reject) => {
      const r = new FileReader();
      r.onload = () =>
        resolve({
          name: file.name,
          type: file.type || "application/octet-stream",
          data: String(r.result).split(",")[1],
        });
      r.onerror = () => reject(Error("Cannot read file"));
      r.readAsDataURL(file);
    },
  );
}
export function CourseExplorer(p: Props) {
  const [cid, setCid] = useState(
      p.initialCourse || p.data.courses[0]?.id || "",
    ),
    [tab, setTab] = useState(p.startTab || "Home"),
    [content, setContent] = useState<CourseContent>(emptyContent),
    [busy, setBusy] = useState(false),
    [q, setQ] = useState(""),
    [preview, setPreview] = useState<{
      name: string;
      type: string;
      url: string;
      text: string;
      file: File;
    } | null>(null),
    [page, setPage] = useState<{ title: string; text: string } | null>(null);
  useEffect(() => {
    let live = true;
    setContent(emptyContent);
    if (cid)
      api<CourseContent>("school-content/" + encodeURIComponent(cid))
        .then((c) => {
          if (live) setContent(c);
        })
        .catch((e) => toast.error(e.message));
    return () => {
      live = false;
    };
  }, [cid]);
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  const course = p.data.courses.find((c) => c.id === cid),
    tasks = p.data.tasks.filter((t) => t.courseId === cid);
  async function sync() {
    setBusy(true);
    try {
      const c = await canvasRequest("content", { courseId: cid });
      setContent(await api<CourseContent>("school-content/" + cid, "PUT", c));
      if (c.warnings?.length) toast.info(c.warnings.join(" "));
      else toast.success("Course content synced");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openFile(id: string) {
    setBusy(true);
    try {
      const f = await canvasRequest("file", { courseId: cid, id }),
        bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0)),
        file = new File([bytes], f.name, { type: f.type });
      let text = "";
      if (/\.(pdf|docx|txt|md|csv)$/i.test(file.name))
        text = await extract(file);
      const type = /^image\/(png|jpeg|webp|gif|avif)$/.test(f.type)
        ? "image"
        : f.type === "application/pdf"
          ? "pdf"
          : f.type.startsWith("audio/")
            ? "audio"
            : f.type.startsWith("video/")
              ? "video"
              : "text";
      setPreview({
        name: f.name,
        type,
        url: URL.createObjectURL(file),
        text,
        file,
      });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function note(title: string, text: string) {
    if (!text.trim())
      throw Error(
        "This file has no selectable text. Export or transcribe it before creating a lesson.",
      );
    const n = await api("notes", "POST", {
      title: title.slice(0, 160),
      subject: course?.name.slice(0, 80) || "Canvas",
      text: text.slice(0, 90000),
      source: "Canvas course material",
    });
    p.onLesson(n.id);
  }
  return (
    <section className="glass school-panel pro-course">
      <div className="section-title">
        <div>
          <span className="eyebrow">YOUR CLASSROOM</span>
          <h2>{course?.name || "Choose a class"}</h2>
        </div>
        <button
          className="secondary"
          disabled={busy || !/^\d+$/.test(cid)}
          onClick={sync}
        >
          <RefreshCw size={15} />
          {busy ? "Loading…" : "Sync course content"}
        </button>
      </div>
      <div className="assignment-filters">
        <select
          aria-label="Choose course"
          disabled={busy}
          value={cid}
          onChange={(e) => {
            setCid(e.target.value);
            setPage(null);
            setPreview(null);
          }}
        >
          {p.data.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <span className="hint">
          {content.updated
            ? "Content saved " + new Date(content.updated).toLocaleString()
            : "Sync Canvas to load modules and files"}
        </span>
      </div>
      <nav className="pro-subtabs" aria-label="Course sections">
        {["Home", "Assignments", "Grades", "Modules", "Files", "Syllabus"].map(
          (t) => (
            <button
              key={t}
              className={t === tab ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </nav>
      {tab === "Home" && (
        <div className="pro-two-column">
          <article>
            <h3>Upcoming work</h3>
            {tasks
              .filter((t) => !t.done && !t.submitted)
              .sort((a, b) =>
                (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
              )
              .slice(0, 8)
              .map((t) => (
                <button
                  className="pro-course-link"
                  key={t.id}
                  onClick={() => p.select(t)}
                >
                  <BookOpen size={17} />
                  <span>
                    {t.title}
                    <small>
                      {t.dueAt
                        ? new Date(t.dueAt).toLocaleDateString()
                        : "No due date"}{" "}
                      · {t.pointsPossible} points
                    </small>
                  </span>
                </button>
              ))}
          </article>
          <article>
            <h3>Recent announcements</h3>
            {p.data.announcements
              .filter((a) => a.courseId === cid)
              .slice(0, 5)
              .map((a) => (
                <details className="pro-announcement" key={a.id}>
                  <summary>{a.title}</summary>
                  <p className="source-text">{a.text}</p>
                </details>
              ))}
            {content.syllabus && (
              <>
                <h3>Syllabus</h3>
                <p className="source-text">{content.syllabus.slice(0, 1000)}</p>
                <button
                  className="text-link"
                  onClick={() => setTab("Syllabus")}
                >
                  View syllabus and policies
                </button>
              </>
            )}
          </article>
        </div>
      )}
      {tab === "Assignments" && (
        <div className="pro-task-list">
          {tasks.map((t) => (
            <button
              className="pro-course-link"
              key={t.id}
              onClick={() => p.select(t)}
            >
              <FileText size={16} />
              <span>
                {t.title}
                <small>
                  {t.type} ·{" "}
                  {t.submitted ? "Submitted" : t.done ? "Complete" : "Open"} ·{" "}
                  {t.pointsEarned ?? "—"}/{t.pointsPossible}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
      {tab === "Grades" && <GradeProjection {...p} courseId={cid} />}
      {tab === "Syllabus" && (
        <>
          <SyllabusEditor
            key={cid}
            courseId={cid}
            tools={p.tools}
            saveTools={p.saveTools}
          />
          {content.syllabus && (
            <details className="pro-announcement">
              <summary>Original syllabus from Canvas</summary>
              <p className="source-text">{content.syllabus}</p>
              <button
                className="secondary"
                onClick={() =>
                  attempt(() =>
                    note(course?.name + " syllabus", content.syllabus),
                  )
                }
              >
                Make a lesson note
              </button>
            </details>
          )}
        </>
      )}
      {tab === "Modules" && (
        <div className="form-stack">
          {content.modules.map((m) => (
            <details key={m.id} className="pro-module" open>
              <summary>
                <FolderOpen size={17} />
                {m.name}
                <span>{m.items.length} items</span>
              </summary>
              {m.items.map((it) => (
                <div className="pro-course-link" key={it.id}>
                  <span>
                    {it.title}
                    <small>{it.type}</small>
                  </span>
                  {it.type === "File" ? (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => openFile(it.contentId || "")}
                    >
                      Preview
                    </button>
                  ) : it.type === "Page" ? (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        attempt(async () =>
                          setPage(
                            await canvasRequest("page", {
                              courseId: cid,
                              id: it.page,
                            }),
                          ),
                        )
                      }
                    >
                      Read page
                    </button>
                  ) : it.type === "Assignment" &&
                    tasks.some(
                      (t) =>
                        t.canvasId === it.contentId ||
                        t.id === cid + "-" + it.contentId,
                    ) ? (
                    <button
                      className="secondary"
                      onClick={() =>
                        p.select(
                          tasks.find(
                            (t) =>
                              t.canvasId === it.contentId ||
                              t.id === cid + "-" + it.contentId,
                          )!,
                        )
                      }
                    >
                      Open assignment
                    </button>
                  ) : safeUrl(it.url) ? (
                    <a
                      className="text-link"
                      href={safeUrl(it.url)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                      <ExternalLink size={14} />
                    </a>
                  ) : null}
                </div>
              ))}
            </details>
          ))}
          {!content.modules.length && (
            <p className="school-empty">
              No synced modules. Use Sync course content above.
            </p>
          )}
        </div>
      )}
      {tab === "Files" && (
        <>
          <div className="assignment-filters">
            <input
              aria-label="Search course files"
              placeholder="Search handouts and documents…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <label className="secondary">
              <Upload size={15} />
              Import your document
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.docx,.txt,.md,.csv"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) attempt(async () => note(f.name, await extract(f)));
                }}
              />
            </label>
          </div>
          {content.files
            .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
            .map((f) => (
              <div className="pro-course-link" key={f.id}>
                <FileText size={19} />
                <span>
                  {f.name}
                  <small>
                    {f.type || "File"} · {(f.size / 1024).toFixed(0)} KB
                    {f.locked ? " · Locked" : ""}
                  </small>
                </span>
                <button
                  className="secondary"
                  disabled={busy || f.locked}
                  onClick={() => openFile(f.id)}
                >
                  Preview
                </button>
              </div>
            ))}
          {!content.files.length && (
            <p className="school-empty">
              No synced files. The module-file fallback is included when your
              token can access it.
            </p>
          )}
        </>
      )}
      {(preview || page) && (
        <div className="pro-document-reader">
          <div className="section-title">
            <h3>{preview?.name || page?.title}</h3>
            <button
              className="icon-button"
              aria-label="Close document preview"
              onClick={() => {
                setPreview(null);
                setPage(null);
              }}
            >
              <X size={17} />
            </button>
          </div>
          {preview?.type === "image" && (
            <img src={preview.url} alt={preview.name} />
          )}{" "}
          {preview?.type === "pdf" && (
            <iframe title={preview.name} sandbox="" src={preview.url} />
          )}{" "}
          {preview?.type === "audio" && <audio src={preview.url} controls />}
          {preview?.type === "video" && <video src={preview.url} controls />}
          {(preview?.text || page?.text) && (
            <p className="source-text">{preview?.text || page?.text}</p>
          )}
          <div className="button-row">
            {preview && (
              <button
                className="secondary"
                onClick={() => download(preview.name, preview.file)}
              >
                <Download size={15} />
                Download
              </button>
            )}
            <button
              className="primary"
              disabled={!(preview?.text || page?.text)}
              onClick={() =>
                attempt(() =>
                  note(
                    preview?.name || page!.title,
                    preview?.text || page!.text,
                  ),
                )
              }
            >
              Make lesson & study material
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
type Detail = {
  title: string;
  text: string;
  types: string[];
  locked: boolean;
  submitted: boolean;
  attempt: number;
  comments: { author: string; text: string }[];
  attachments: { id: string; name: string }[];
};
export function AssignmentExtras(p: PlanningProps & { task: Assignment }) {
  const t = p.task,
    cid = t.courseId,
    id = t.canvasId || t.id.match(/^\d+-(\d+)$/)?.[1],
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState(""),
    [text, setText] = useState(""),
    [url, setUrl] = useState(""),
    [files, setFiles] = useState<File[]>([]),
    [confirm, setConfirm] = useState(false),
    [mins, setMins] = useState("25"),
    [recording, setRecording] = useState<MediaRecorder | null>(null);
  useEffect(
    () => () => {
      if (recording?.state === "recording") recording.stop();
      recording?.stream.getTracks().forEach((t) => t.stop());
    },
    [recording],
  );
  async function load() {
    setBusy(true);
    try {
      const d = await canvasRequest("assignment", { courseId: cid, id });
      setDetail(d);
      setKind(
        d.types.find((k: string) =>
          ["online_text_entry", "online_url", "online_upload"].includes(k),
        ) || "",
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const logs = p.tools.effort.filter((l) => l.taskId === t.id);
  async function submit() {
    setBusy(true);
    try {
      if (!confirm)
        throw Error("Review the submission and tick the confirmation box.");
      if (files.reduce((n, f) => n + f.size, 0) > 15000000)
        throw Error("Combined files must be below 15 MB.");
      const result = await canvasRequest("submit", {
        courseId: cid,
        id,
        type: kind,
        text,
        url,
        files: await Promise.all(files.map(toWire)),
        confirmed: true,
      });
      if (!result.submitted)
        throw Error(
          "Canvas has not confirmed the submission. Check Canvas before retrying.",
        );
      setConfirm(false);
      setDetail((d) =>
        d ? { ...d, submitted: true, attempt: result.attempt } : d,
      );
      try {
        await p.save({
          ...p.data,
          tasks: p.data.tasks.map((x) =>
            x.id === t.id ? { ...x, submitted: true, needsGrading: true } : x,
          ),
        });
      } catch {
        toast.info(
          "Canvas confirmed your submission. Sync Classes to update the saved workspace; you do not need to submit again.",
        );
        return;
      }
      toast.success("Canvas confirmed your submission");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="pro-assignment-extras form-stack">
      <details className="pro-module">
        <summary>
          <Clock size={16} />
          Effort log · {logs.reduce((n, l) => n + l.minutes, 0)} min
        </summary>
        <p className="hint">
          Log completed work sessions. Course estimates adapt using your total
          actual time versus the original estimate.
        </p>
        <div className="form-row">
          <label>
            Minutes spent
            <input
              type="number"
              min="1"
              max="600"
              value={mins}
              onChange={(e) => setMins(e.target.value)}
            />
          </label>
          <button
            className="secondary"
            disabled={p.busy}
            onClick={() =>
              attempt(async () => {
                const minutes = Number(mins);
                if (!Number.isFinite(minutes) || minutes < 1 || minutes > 600)
                  throw Error("Enter 1–600 minutes");
                await p.saveTools({
                  ...p.tools,
                  effort: [
                    ...p.tools.effort,
                    {
                      id: crypto.randomUUID(),
                      taskId: t.id,
                      minutes,
                      estimate: estimate(t),
                      at: Date.now(),
                    },
                  ],
                });
              })
            }
          >
            Log effort
          </button>
        </div>
        {logs.map((l) => (
          <p key={l.id}>
            {new Date(l.at).toLocaleDateString()} · {l.minutes} minutes{" "}
            <button
              className="text-link"
              onClick={() =>
                attempt(() =>
                  p.saveTools({
                    ...p.tools,
                    effort: p.tools.effort.filter((x) => x.id !== l.id),
                  }),
                )
              }
            >
              Remove
            </button>
          </p>
        ))}
      </details>
      {id && (
        <>
          <button className="secondary" disabled={busy} onClick={load}>
            <RefreshCw size={15} />
            {busy
              ? "Contacting Canvas…"
              : "Load assignment, feedback & submission options"}
          </button>
          {detail && (
            <>
              <p className="source-text">{detail.text}</p>
              {detail.comments.length > 0 && (
                <div>
                  <h3>Teacher feedback</h3>
                  {detail.comments.map((c, i) => (
                    <blockquote key={i}>
                      <strong>{c.author}</strong>
                      <p>{c.text}</p>
                    </blockquote>
                  ))}
                </div>
              )}
              {detail.attachments.length > 0 && (
                <p className="hint">
                  Submitted files:{" "}
                  {detail.attachments.map((a) => a.name).join(", ")}
                </p>
              )}
              <p>
                {detail.submitted
                  ? `Canvas submission confirmed · attempt ${detail.attempt}`
                  : "No submission confirmed yet."}
              </p>
              {!detail.locked && kind ? (
                <div className="form-stack">
                  <h3>
                    {detail.submitted
                      ? "Submit another attempt"
                      : "Submit your work"}
                  </h3>
                  <label>
                    Submission type
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setConfirm(false);
                      }}
                    >
                      {detail.types
                        .filter((k) =>
                          [
                            "online_text_entry",
                            "online_url",
                            "online_upload",
                          ].includes(k),
                        )
                        .map((k) => (
                          <option key={k} value={k}>
                            {k === "online_text_entry"
                              ? "Written response"
                              : k === "online_url"
                                ? "Website / document link"
                                : "File upload"}
                          </option>
                        ))}
                    </select>
                  </label>
                  {kind === "online_text_entry" && (
                    <textarea
                      rows={7}
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setConfirm(false);
                      }}
                      placeholder="Write your response…"
                      maxLength={90000}
                    />
                  )}{" "}
                  {kind === "online_url" && (
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setConfirm(false);
                      }}
                      placeholder="https://docs.google.com/…"
                    />
                  )}
                  {kind === "online_upload" && (
                    <>
                      <input
                        aria-label="Submission files"
                        type="file"
                        multiple
                        onChange={(e) => {
                          setFiles(Array.from(e.target.files || []));
                          setConfirm(false);
                        }}
                      />
                      <p>
                        {files.map((f) => f.name).join(", ") ||
                          "Choose up to five files, 15 MB combined."}
                      </p>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          attempt(async () => {
                            if (recording) {
                              recording.stop();
                              recording.stream
                                .getTracks()
                                .forEach((t) => t.stop());
                              setRecording(null);
                              return;
                            }
                            if (
                              !navigator.mediaDevices ||
                              !window.MediaRecorder
                            )
                              throw Error(
                                "Recording is unavailable in this browser. Upload a recording file instead.",
                              );
                            const stream =
                                await navigator.mediaDevices.getUserMedia({
                                  audio: true,
                                }),
                              r = new MediaRecorder(stream),
                              chunks: Blob[] = [];
                            r.ondataavailable = (e) => {
                              if (e.data.size) chunks.push(e.data);
                            };
                            r.onstop = () => {
                              const f = new File(
                                chunks,
                                "response." +
                                  (r.mimeType.includes("mp4") ? "m4a" : "webm"),
                                { type: r.mimeType },
                              );
                              setFiles([f]);
                              setConfirm(false);
                              stream.getTracks().forEach((t) => t.stop());
                            };
                            r.start();
                            setRecording(r);
                            setTimeout(() => {
                              if (r.state === "recording") {
                                r.stop();
                                stream.getTracks().forEach((t) => t.stop());
                                setRecording(null);
                              }
                            }, 300000);
                          })
                        }
                      >
                        {recording
                          ? "Stop recording"
                          : "Record an audio response"}
                      </button>
                    </>
                  )}
                  <label className="check-line">
                    <input
                      type="checkbox"
                      checked={confirm}
                      onChange={(e) => setConfirm(e.target.checked)}
                    />
                    I reviewed this work and want to submit it to my teacher in
                    Canvas.
                  </label>
                  <button
                    className="primary"
                    disabled={busy || !confirm || !!recording}
                    onClick={submit}
                  >
                    <Send size={15} />
                    {busy ? "Submitting…" : "Submit to Canvas"}
                  </button>
                </div>
              ) : (
                <p className="hint">
                  {detail.locked
                    ? "This assignment is locked."
                    : "This assignment uses a Canvas quiz, annotation, media service or external tool. Complete that workflow in Canvas using the link above."}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

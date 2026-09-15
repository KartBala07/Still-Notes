"use client";
import { useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  RefreshCw,
  Upload,
  Plus,
  ExternalLink,
  BookOpen,
  CalendarDays,
  Check,
  ArrowUpRight,
  Download,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { api, download } from "../lib/client";
import { companion } from "../lib/local-ai";
import {
  emptySchool,
  type SchoolData,
  type Assignment,
} from "../lib/canvas/types";
import { importSchool } from "../lib/canvas/import";
import { rankTasks, studyPlan, letter, gpa, curve } from "../lib/canvas/engine";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs";
const tabs = [
  "Overview",
  "Assignments",
  "Grades",
  "Study plan",
  "Announcements",
  "Curve calculator",
];
export default function School({
  onLesson,
  onCalendar,
}: {
  onLesson: (id: string) => void;
  onCalendar: () => void;
}) {
  const [data, setData] = useState<SchoolData>(emptySchool),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState("Overview"),
    [modal, setModal] = useState(""),
    [selected, setSelected] = useState<Assignment | null>(null),
    [query, setQuery] = useState(""),
    [course, setCourse] = useState("all"),
    [base, setBase] = useState("https://djusd.instructure.com"),
    [token, setToken] = useState(""),
    [numbers, setNumbers] = useState({
      raw: 72,
      possible: 100,
      added: 5,
      target: 93,
    });
  useEffect(() => {
    let active = true;
    api<SchoolData>("school")
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const ranked = useMemo(() => rankTasks(data), [data]),
    plan = useMemo(() => studyPlan(data), [data]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(next: SchoolData) {
    const saved = await api<SchoolData>("school", "PUT", next);
    setData(saved);
  }
  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 1100000) throw Error("Choose a snapshot below 1 MB.");
    const next = importSchool(JSON.parse(await file.text()));
    await save(next);
    toast.success("Coursework imported into your private account");
  }
  async function noteFrom(task: Assignment) {
    const courseName =
      data.courses.find((c) => c.id === task.courseId)?.name || "Canvas";
    const note = await api("notes", "POST", {
      title: task.title,
      subject: courseName.slice(0, 80),
      text:
        task.description ||
        `Assignment: ${task.title}\nCourse: ${courseName}\nAdd your lesson material here before generating a study set.`,
      source: task.htmlUrl || "Canvas Pro assignment",
    });
    onLesson(note.id);
  }
  function taskRows(list: Assignment[]) {
    return list.map((t) => {
      const c = data.courses.find((c) => c.id === t.courseId),
        priority = ranked.find((r) => r.task.id === t.id);
      return (
        <div
          className={
            "assignment-row " + (t.done || t.submitted ? "is-complete" : "")
          }
          key={t.id}
        >
          <button
            className={"completion " + (t.done || t.submitted ? "checked" : "")}
            disabled={busy || t.submitted}
            aria-label={
              (t.done ? "Mark incomplete: " : "Mark complete: ") + t.title
            }
            onClick={() =>
              action(() =>
                save({
                  ...data,
                  tasks: data.tasks.map((x) =>
                    x.id === t.id ? { ...x, done: !x.done } : x,
                  ),
                }),
              )
            }
          >
            {(t.done || t.submitted) && <Check size={15} />}
          </button>
          <button className="assignment-main" onClick={() => setSelected(t)}>
            <strong>{t.title}</strong>
            <span>
              {c?.name} · {t.type}
            </span>
          </button>
          <span
            className={
              "due-badge " +
              (priority && priority.due !== null && priority.due < 0
                ? "late"
                : "")
            }
          >
            {t.submitted
              ? "Submitted"
              : t.done
                ? "Completed"
                : priority?.reason}
          </span>
          <span className="assignment-points">
            {t.pointsEarned ?? "—"} / {t.pointsPossible} pts
          </span>
          <button
            className="icon-button"
            aria-label={"Open " + t.title}
            onClick={() => setSelected(t)}
          >
            <ArrowUpRight size={17} />
          </button>
        </div>
      );
    });
  }
  const filtered = data.tasks.filter(
    (t) =>
      (course === "all" || t.courseId === course) &&
      (!query || t.title.toLowerCase().includes(query.toLowerCase())),
  );
  const result =
    numbers.possible > 0
      ? curve(numbers.raw, numbers.possible, numbers.added, numbers.target)
      : null;
  return (
    <div className="workspace school-workspace">
      <section className="workspace-heading">
        <div>
          <span className="eyebrow">CANVAS PRO × STILL NOTES</span>
          <h1>
            Your school day,
            <br />
            <span className="accent">all together.</span>
          </h1>
          <p>Know what’s due. Understand what matters. Make a plan.</p>
        </div>
        <button className="primary" onClick={() => setModal("connect")}>
          <RefreshCw size={16} />
          Connect Canvas
        </button>
      </section>
      <div className="school-toolbar">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="school-tabs">
            {tabs.map((t) => (
              <TabsTrigger key={t} value={t}>
                {t}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Refresh saved coursework"
          onClick={() =>
            action(async () => {
              setData(await api<SchoolData>("school"));
              toast.success("Coursework refreshed");
            })
          }
        >
          <RefreshCw size={18} />
        </button>
        <button
          className="icon-button"
          aria-label="Export coursework"
          onClick={() =>
            download("coursework.json", JSON.stringify(data, null, 2))
          }
        >
          <Download size={18} />
        </button>
        <label className="icon-button" title="Import coursework snapshot">
          <Upload size={18} />
          <input
            aria-label="Import coursework snapshot"
            className="sr-only"
            type="file"
            accept=".json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              action(() => importFile(file));
            }}
          />
        </label>
      </div>
      {loading ? (
        <div className="school-empty glass">Opening your coursework…</div>
      ) : !data.courses.length ? (
        <div className="school-empty glass">
          <GraduationCap size={38} />
          <h2>A clearer picture of your classes.</h2>
          <p>
            Connect Canvas through the local connector, import a Canvas Pro
            snapshot, or add your classes yourself.
          </p>
          <div className="button-row">
            <button className="primary" onClick={() => setModal("course")}>
              <Plus size={16} />
              Add a class
            </button>
            <button className="secondary" onClick={() => setModal("connect")}>
              Connect Canvas
            </button>
          </div>
        </div>
      ) : (
        <>
          {(tab === "Overview" || tab === "Grades") && (
            <div className="course-grid">
              {data.courses.map((c) => (
                <article className="course-card glass" key={c.id}>
                  <div>
                    <span className="subject">{c.type.toUpperCase()}</span>
                    <span className="grade-letter">
                      {letter(c.currentScore)}
                    </span>
                  </div>
                  <h2>{c.name}</h2>
                  <div className="course-score">
                    <strong>
                      {c.currentScore == null
                        ? "—"
                        : c.currentScore.toFixed(1) + "%"}
                    </strong>
                    <span>target {c.targetGrade}%</span>
                  </div>
                  <div className="grade-track">
                    <span
                      style={{
                        width: Math.min(100, c.currentScore || 0) + "%",
                      }}
                    />
                  </div>
                  {tab === "Grades" && c.origin === "manual" && (
                    <label className="target-control">
                      Current grade %
                      <input
                        aria-label={"Current grade for " + c.name}
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        defaultValue={c.currentScore ?? ""}
                        onBlur={(e) => {
                          const score =
                            e.target.value === ""
                              ? null
                              : Number(e.target.value);
                          if (
                            score !== c.currentScore &&
                            (score === null ||
                              (Number.isFinite(score) &&
                                score >= 0 &&
                                score <= 100))
                          )
                            action(() =>
                              save({
                                ...data,
                                courses: data.courses.map((x) =>
                                  x.id === c.id
                                    ? { ...x, currentScore: score }
                                    : x,
                                ),
                              }),
                            );
                        }}
                      />
                    </label>
                  )}
                  {tab === "Grades" ? (
                    <label className="target-control">
                      Your target %
                      <input
                        aria-label={"Target for " + c.name}
                        type="number"
                        min="0"
                        max="100"
                        defaultValue={c.targetGrade}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          if (
                            n !== c.targetGrade &&
                            Number.isFinite(n) &&
                            n >= 0 &&
                            n <= 100
                          )
                            action(() =>
                              save({
                                ...data,
                                courses: data.courses.map((x) =>
                                  x.id === c.id ? { ...x, targetGrade: n } : x,
                                ),
                              }),
                            );
                        }}
                      />
                    </label>
                  ) : (
                    <button
                      className="text-link"
                      onClick={() => {
                        setCourse(c.id);
                        setTab("Assignments");
                      }}
                    >
                      {
                        data.tasks.filter(
                          (t) => t.courseId === c.id && !t.done && !t.submitted,
                        ).length
                      }{" "}
                      open assignments
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
          {tab === "Grades" && (
            <p className="hint">
              Unweighted GPA estimate:{" "}
              <strong>{gpa(data.courses)?.toFixed(2) ?? "—"}</strong> / 4.0.
              Targets are planning preferences. Your school’s grading scale and
              official GPA may differ.
            </p>
          )}
          {(tab === "Overview" || tab === "Assignments") && (
            <section className="school-panel glass">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    {tab === "Overview" ? "START HERE" : "YOUR COURSEWORK"}
                  </span>
                  <h2>
                    {tab === "Overview"
                      ? "A little direction for today."
                      : "Every assignment, in one place."}
                  </h2>
                </div>
                <button className="secondary" onClick={() => setModal("task")}>
                  <Plus size={16} />
                  Add task
                </button>
              </div>
              {tab === "Assignments" && (
                <div className="assignment-filters">
                  <input
                    aria-label="Search assignments"
                    placeholder="Find an assignment…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="Filter by class"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                  >
                    <option value="all">All classes</option>
                    {data.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {taskRows(
                tab === "Overview"
                  ? ranked.slice(0, 6).map((r) => r.task)
                  : filtered,
              )}
              {!(tab === "Overview" ? ranked : filtered).length && (
                <p className="school-empty">
                  You’re caught up here. Take a breath.
                </p>
              )}
            </section>
          )}
          {tab === "Study plan" && (
            <>
              <div className="plan-controls">
                <p>
                  Priorities use due dates, grade targets, assignment weight and
                  points.
                </p>
                <label>
                  Daily study minutes
                  <input
                    type="number"
                    min="15"
                    max="480"
                    defaultValue={data.dailyMinutes}
                    onBlur={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 15 && n <= 480 && n !== data.dailyMinutes)
                        action(() => save({ ...data, dailyMinutes: n }));
                    }}
                  />
                </label>
              </div>
              <div className="plan-grid">
                {plan.days.map((d, i) => (
                  <article className="glass plan-day" key={d.date}>
                    <div>
                      <h3>
                        {i === 0
                          ? "Today"
                          : new Date(d.date).toLocaleDateString(undefined, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                      </h3>
                      <span>{d.used} min</span>
                    </div>
                    {d.slots.map((s, j) => (
                      <button key={j} onClick={() => setSelected(s.task)}>
                        <span>{s.task.title}</span>
                        <strong>{s.minutes} min</strong>
                      </button>
                    ))}
                    {!d.slots.length && <p>Room to recharge.</p>}
                    {!!d.slots.length && (
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() =>
                          action(async () => {
                            const when = new Date(d.date);
                            when.setHours(18, 0, 0, 0);
                            await api("events", "POST", {
                              title: `Study: ${d.slots[0].task.title}`.slice(
                                0,
                                150,
                              ),
                              date: when.toISOString(),
                            });
                            toast.success(
                              "Study session added to your calendar",
                            );
                            onCalendar();
                          })
                        }
                      >
                        <CalendarDays size={15} />
                        Add session to calendar
                      </button>
                    )}
                  </article>
                ))}
              </div>
              {plan.remaining.size > 0 && (
                <p className="hint">
                  {plan.remaining.size} assignments need more time than fits in
                  your current plan. Increase your daily time or start earlier;
                  no extra time is silently assumed.
                </p>
              )}
            </>
          )}
          {tab === "Announcements" && (
            <div className="announcement-list">
              {data.announcements.map((a) => (
                <article className="glass school-panel" key={a.courseId + a.id}>
                  <span className="eyebrow">
                    {data.courses.find((c) => c.id === a.courseId)?.name}
                  </span>
                  <h2>{a.title}</h2>
                  <p className="source-text">{a.text}</p>
                  {a.url && (
                    <a
                      className="text-link"
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in Canvas
                      <ExternalLink size={14} />
                    </a>
                  )}
                </article>
              ))}
              {!data.announcements.length && (
                <p className="school-empty glass">
                  No announcements in your last sync.
                </p>
              )}
            </div>
          )}
          {tab === "Curve calculator" && (
            <section className="glass school-panel curve-panel">
              <div>
                <span className="eyebrow">WHAT IF?</span>
                <h2>Explore a grade curve.</h2>
                <p>This calculator never changes your Canvas grades.</p>
                <div className="curve-inputs">
                  {(
                    [
                      ["raw", "Points earned"],
                      ["possible", "Points possible"],
                      ["added", "Curve points"],
                      ["target", "Target percent"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        type="number"
                        min={key === "possible" ? 1 : 0}
                        max="10000"
                        value={numbers[key]}
                        onChange={(e) =>
                          setNumbers({
                            ...numbers,
                            [key]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="curve-result">
                <span>With this curve</span>
                <strong>
                  {result ? result.curvedPct.toFixed(1) + "%" : "—"}
                </strong>
                <p>
                  {result
                    ? `${result.needed} extra points needed to reach ${numbers.target}%`
                    : "Enter positive possible points."}
                </p>
              </div>
            </section>
          )}
          <div className="school-footer">
            <span>
              {data.synced
                ? "Last Canvas sync: " + new Date(data.synced).toLocaleString()
                : "Classes added manually"}{" "}
              · Private to your account
            </span>
            <button className="text-link" onClick={() => setModal("course")}>
              <Plus size={14} />
              Add class
            </button>
          </div>
        </>
      )}
      <Dialog
        open={!!modal}
        onOpenChange={(v) => {
          if (!v) {
            setModal("");
            setToken("");
          }
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>
              {modal === "connect"
                ? "Connect your Canvas"
                : modal === "course"
                  ? "Add a class"
                  : "Add an assignment"}
            </DialogTitle>
            <DialogDescription>
              {modal === "connect"
                ? "Canvas access stays on this computer. The imported coursework is saved to your private account."
                : "Keep your classes and deadlines together."}
            </DialogDescription>
          </DialogHeader>
          {modal === "connect" ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  const result = await companion("/canvas", { base, token });
                  const next = importSchool(result);
                  const manual = data.courses.filter(
                    (c) => c.origin === "manual",
                  );
                  await save({
                    ...next,
                    courses: [
                      ...next.courses.map((c) => ({
                        ...c,
                        targetGrade:
                          data.courses.find((old) => old.id === c.id)
                            ?.targetGrade ?? c.targetGrade,
                      })),
                      ...manual,
                    ],
                    dailyMinutes: data.dailyMinutes,
                    tasks: [
                      ...next.tasks.map((t) => {
                        const old = data.tasks.find((x) => x.id === t.id);
                        return {
                          ...t,
                          done: old?.done || false,
                          minutes: old?.minutes || 0,
                        };
                      }),
                      ...data.tasks.filter(
                        (t) =>
                          manual.some((c) => c.id === t.courseId) ||
                          (!t.htmlUrl &&
                            !next.tasks.some((n) => n.id === t.id) &&
                            next.courses.some((c) => c.id === t.courseId)),
                      ),
                    ],
                  });
                  setToken("");
                  setModal("");
                  toast.success("Canvas coursework synced");
                  if (result.warnings?.length)
                    toast.info(result.warnings.join(". "));
                });
              }}
            >
              <p className="hint">
                Pair the local connector in Settings first. Your token is sent
                only to that connector and Canvas, and is cleared when this
                dialog closes.
              </p>
              <label>
                School URL
                <input
                  type="url"
                  required
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                />
              </label>
              <label>
                Canvas access token
                <input
                  type="password"
                  autoComplete="off"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? "Reading your classes…" : "Sync coursework"}
              </button>
            </form>
          ) : modal === "course" ? (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(async () => {
                  await save({
                    ...data,
                    courses: [
                      ...data.courses,
                      {
                        id: crypto.randomUUID(),
                        name: String(f.get("name")),
                        code: "",
                        type: f.get("type") as "regular",
                        currentScore:
                          f.get("score") === "" ? null : Number(f.get("score")),
                        targetGrade: Number(f.get("target")),
                        origin: "manual",
                      },
                    ],
                  });
                  setModal("");
                });
              }}
            >
              <label>
                Class name
                <input
                  name="name"
                  required
                  maxLength={160}
                  placeholder="AP Biology"
                />
              </label>
              <label>
                Level
                <select name="type">
                  <option value="regular">Regular</option>
                  <option value="honors">Honors</option>
                  <option value="ap">AP</option>
                </select>
              </label>
              <div className="form-row">
                <label>
                  Current grade %
                  <input
                    name="score"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                  />
                </label>
                <label>
                  Target %
                  <input
                    name="target"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue="93"
                    required
                  />
                </label>
              </div>
              <button className="primary" disabled={busy}>
                Save class
              </button>
            </form>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(async () => {
                  await save({
                    ...data,
                    tasks: [
                      ...data.tasks,
                      {
                        id: crypto.randomUUID(),
                        courseId: String(f.get("course")),
                        title: String(f.get("title")),
                        type: f.get("type") as "assignment",
                        dueAt: f.get("due")
                          ? new Date(String(f.get("due"))).toISOString()
                          : null,
                        pointsPossible: Number(f.get("points")),
                        pointsEarned: null,
                        groupWeight: null,
                        submitted: false,
                        needsGrading: false,
                        htmlUrl: "",
                        description: String(f.get("description")),
                        done: false,
                        minutes: 0,
                      },
                    ],
                  });
                  setModal("");
                });
              }}
            >
              <label>
                Title
                <input name="title" required maxLength={160} />
              </label>
              <div className="form-row">
                <label>
                  Class
                  <select name="course">
                    {data.courses.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Type
                  <select name="type">
                    <option value="assignment">Assignment</option>
                    <option value="quiz">Quiz</option>
                    <option value="exam">Exam</option>
                    <option value="project">Project</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Due date
                  <input name="due" type="datetime-local" />
                </label>
                <label>
                  Possible points
                  <input
                    name="points"
                    type="number"
                    min="0"
                    max="10000"
                    defaultValue="10"
                  />
                </label>
              </div>
              <label>
                Instructions or lesson material
                <textarea name="description" rows={4} maxLength={15000} />
              </label>
              <button className="primary" disabled={busy}>
                Save assignment
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <DialogContent className="app-dialog">
          <DialogHeader>
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>
              {data.courses.find((c) => c.id === selected?.courseId)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="assignment-detail">
            <p className="source-text">
              {selected?.description ||
                "Add lesson material to a note to build a useful study set."}
            </p>
            {selected && (
              <label>
                Estimated study minutes
                <input
                  type="number"
                  min="0"
                  max="600"
                  defaultValue={selected.minutes}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    if (n >= 0 && n <= 600 && n !== selected.minutes)
                      action(async () => {
                        await save({
                          ...data,
                          tasks: data.tasks.map((t) =>
                            t.id === selected.id ? { ...t, minutes: n } : t,
                          ),
                        });
                        setSelected({ ...selected, minutes: n });
                      });
                  }}
                />
                <span className="hint">Use 0 for an automatic estimate.</span>
              </label>
            )}
            <div className="button-row">
              <button
                className="primary"
                disabled={busy}
                onClick={() => selected && action(() => noteFrom(selected))}
              >
                <BookOpen size={16} />
                Make a lesson note
              </button>
              {selected?.htmlUrl && (
                <a
                  className="secondary"
                  href={selected.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open in Canvas
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

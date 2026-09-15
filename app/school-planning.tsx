"use client";
import { useState } from "react";
import { Check, Upload, Plus, Trash2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { api, extract, download } from "../lib/client";
import { rankTasks, estimate, letter, curve } from "../lib/canvas/engine";
import {
  emptyTools,
  parseSyllabus,
  lateRank,
  timedPlan,
  effortFactors,
  projectedGrade,
  type SchoolTools,
  type Syllabus,
} from "../lib/canvas/tools";
import type { SchoolData, Assignment } from "../lib/canvas/types";
export type PlanningProps = {
  data: SchoolData;
  tools: SchoolTools;
  save: (d: SchoolData) => Promise<void>;
  saveTools: (s: SchoolTools) => Promise<void>;
  select: (t: Assignment) => void;
  busy: boolean;
  onCalendar?: () => void;
};
async function attempt(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    toast.error((e as Error).message);
  }
}
export function WorkLists({ mode, ...p }: PlanningProps & { mode: string }) {
  const [q, setQ] = useState(""),
    [band, setBand] = useState("all"),
    [showDone, setShowDone] = useState(false);
  const ranks = rankTasks(p.data),
    late = lateRank(p.data, p.tools),
    rankMap = new Map(ranks.map((r) => [r.task.id, r])),
    lateMap = new Map(late.map((r) => [r.task.id, r]));
  let list =
    mode === "Late work"
      ? late.map((r) => r.task)
      : mode === "Tests & quizzes"
        ? p.data.tasks.filter((t) => t.type === "exam" || t.type === "quiz")
        : [
            ...ranks.map((r) => r.task),
            ...p.data.tasks.filter((t) => t.done || t.submitted),
          ];
  list = list.filter(
    (t) =>
      (showDone || (!t.done && !t.submitted)) &&
      (!q ||
        (t.title + " " + p.data.courses.find((c) => c.id === t.courseId)?.name)
          .toLowerCase()
          .includes(q.toLowerCase())) &&
      (band === "all" ||
        ((rankMap.get(t.id)?.score || 0) >=
          (band === "high" ? 65 : band === "medium" ? 35 : 0) &&
          (rankMap.get(t.id)?.score || 0) <
            (band === "high" ? 101 : band === "medium" ? 65 : 35))),
  );
  return (
    <section className="glass school-panel">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            {mode === "Late work" ? "RECOVER WHAT YOU CAN" : "YOUR NEXT STEPS"}
          </span>
          <h2>{mode}</h2>
          <p>
            {mode === "Late work"
              ? "Ranked by recoverable weighted points per minute. Confirm each syllabus policy before relying on estimates."
              : "Shared with your assignments and study plan."}
          </p>
        </div>
        <strong>{list.length} shown</strong>
      </div>
      <div className="assignment-filters">
        <input
          aria-label="Search coursework"
          placeholder="Search coursework or class…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Priority"
          value={band}
          onChange={(e) => setBand(e.target.value)}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label className="check-line">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
          />
          Show completed
        </label>
      </div>
      <div className="button-row">
        <button
          className="secondary"
          disabled={p.busy || !list.some((t) => !t.done && !t.submitted)}
          onClick={() =>
            attempt(() =>
              p.save({
                ...p.data,
                tasks: p.data.tasks.map((t) =>
                  list.some((x) => x.id === t.id) && !t.submitted
                    ? { ...t, done: true }
                    : t,
                ),
              }),
            )
          }
        >
          Mark shown work complete
        </button>
        <button
          className="text-link"
          disabled={p.busy}
          onClick={() =>
            attempt(() =>
              p.save({
                ...p.data,
                tasks: p.data.tasks.map((t) =>
                  list.some((x) => x.id === t.id) ? { ...t, done: false } : t,
                ),
              }),
            )
          }
        >
          Reset shown checkmarks
        </button>
      </div>
      <div className="pro-task-list">
        {list.map((t) => {
          const r = rankMap.get(t.id),
            l = lateMap.get(t.id);
          return (
            <article className="pro-task" key={t.id}>
              <button
                className={
                  "completion " + (t.done || t.submitted ? "checked" : "")
                }
                disabled={p.busy || t.submitted}
                aria-label={"Toggle completion: " + t.title}
                onClick={() =>
                  attempt(() =>
                    p.save({
                      ...p.data,
                      tasks: p.data.tasks.map((x) =>
                        x.id === t.id ? { ...x, done: !x.done } : x,
                      ),
                    }),
                  )
                }
              >
                {(t.done || t.submitted) && <Check size={14} />}
              </button>
              <button className="assignment-main" onClick={() => p.select(t)}>
                <strong>{t.title}</strong>
                <span>
                  {p.data.courses.find((c) => c.id === t.courseId)?.name} ·{" "}
                  {t.type}
                </span>
                <small>
                  {r?.reason || "Completed"} ·{" "}
                  {l
                    ? `${l.worth.toFixed(1)} recoverable points · ${l.label}`
                    : `${t.pointsPossible} points · ${estimate(t)} min estimated`}
                </small>
              </button>
              <span className="priority-chip">
                {l
                  ? l.priority.toFixed(2) + " pts/min"
                  : r
                    ? r.score + "/100"
                    : "Done"}
              </span>
            </article>
          );
        })}
      </div>
      {!list.length && (
        <p className="school-empty">Nothing matches these filters.</p>
      )}
    </section>
  );
}
export function SyllabusEditor({
  courseId,
  tools,
  saveTools,
}: {
  courseId: string;
  tools: SchoolTools;
  saveTools: (s: SchoolTools) => Promise<void>;
}) {
  const [s, setS] = useState<Syllabus>(
      tools.syllabi[courseId] || parseSyllabus(""),
    ),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="form-stack"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await saveTools({
            ...tools,
            syllabi: { ...tools.syllabi, [courseId]: s },
          });
          toast.success("Syllabus preferences saved");
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Import a syllabus, check the detected numbers, then confirm the policy.
        These are planning estimates; your teacher’s rules control actual
        grades.
      </p>
      <textarea
        rows={6}
        aria-label="Syllabus text"
        value={s.raw}
        onChange={(e) => setS({ ...s, raw: e.target.value, confirmed: false })}
        maxLength={12000}
        placeholder="Paste grading weights and late-work rules…"
      />
      <div className="button-row">
        <label className="secondary">
          <Upload size={15} />
          Upload syllabus
          <input
            className="sr-only"
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                attempt(async () =>
                  setS(parseSyllabus((await extract(f)).slice(0, 12000))),
                );
            }}
          />
        </label>
        <button
          className="secondary"
          type="button"
          onClick={() => setS(parseSyllabus(s.raw))}
        >
          Extract weights & policy
        </button>
      </div>
      <label>
        Grade calculation
        <select
          value={s.mode}
          onChange={(e) =>
            setS({ ...s, mode: e.target.value as Syllabus["mode"] })
          }
        >
          <option value="auto">Automatic</option>
          <option value="canvas">Canvas groups</option>
          <option value="syllabus">Syllabus weights</option>
          <option value="points">Point totals</option>
        </select>
      </label>
      <div className="pro-fields">
        {["assignment", "quiz", "exam", "project", "participation"].map((k) => (
          <label key={k}>
            {k} weight %
            <input
              type="number"
              min="0"
              max="100"
              value={s.weights[k] ?? ""}
              onChange={(e) =>
                setS({
                  ...s,
                  confirmed: false,
                  weights: { ...s.weights, [k]: Number(e.target.value) },
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={s.late.noLate}
          onChange={(e) =>
            setS({
              ...s,
              confirmed: false,
              late: { ...s.late, noLate: e.target.checked },
            })
          }
        />
        No late work accepted
      </label>
      <div className="pro-fields">
        {(
          [
            ["perDay", "Penalty % per day"],
            ["flat", "Flat penalty %"],
            ["graceDays", "Full-credit grace days"],
            ["deadlineDays", "Last accepted day (blank = no limit)"],
            ["maxCredit", "Maximum late credit %"],
            ["minCredit", "Minimum late credit %"],
          ] as const
        ).map(([k, label]) => (
          <label key={k}>
            {label}
            <input
              type="number"
              min="0"
              max={k.includes("Days") ? 365 : 100}
              value={s.late[k] ?? ""}
              onChange={(e) =>
                setS({
                  ...s,
                  confirmed: false,
                  late: {
                    ...s.late,
                    [k]:
                      k === "deadlineDays" && e.target.value === ""
                        ? null
                        : Number(e.target.value),
                  },
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="check-line">
        <input
          type="checkbox"
          checked={s.confirmed}
          onChange={(e) => setS({ ...s, confirmed: e.target.checked })}
        />
        I checked these values against the syllabus
      </label>
      <button className="primary" disabled={busy}>
        Save syllabus
      </button>
    </form>
  );
}
export function GradeProjection({
  courseId,
  ...p
}: PlanningProps & { courseId: string }) {
  const tasks = p.data.tasks.filter((t) => t.courseId === courseId),
    s = p.tools.syllabi[courseId],
    projected = projectedGrade(tasks, p.tools.whatIf, s);
  return (
    <div className="form-stack">
      <div className="pro-metrics">
        <article>
          <span>What-if grade</span>
          <strong>
            {projected.pct === null ? "—" : projected.pct.toFixed(1) + "%"}
          </strong>
        </article>
        <article>
          <span>Calculation</span>
          <strong className="metric-label">{projected.method}</strong>
        </article>
        <article>
          <span>Ungraded excluded</span>
          <strong>{projected.excluded}</strong>
        </article>
      </div>
      <p className="hint">
        This does not change Canvas grades. Drop rules, extra-credit rules and
        teacher-specific grading can make official grades differ.
        {projected.incomplete
          ? " Some categories have no known weight and are excluded."
          : ""}
      </p>
      <button
        className="secondary"
        disabled={p.busy}
        onClick={() =>
          attempt(() =>
            p.saveTools({
              ...p.tools,
              whatIf: Object.fromEntries(
                Object.entries(p.tools.whatIf).filter(
                  ([id]) => !tasks.some((t) => t.id === id),
                ),
              ),
            }),
          )
        }
      >
        Reset this class’s projections
      </button>
      <div className="pro-table-wrap">
        <table className="pro-table">
          <thead>
            <tr>
              <th>Assignment</th>
              <th>Actual</th>
              <th>Possible</th>
              <th>What-if points</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>
                  <button className="text-link" onClick={() => p.select(t)}>
                    {t.title}
                  </button>
                  {t.excused && " · Excused"}
                </td>
                <td>{t.pointsEarned ?? "—"}</td>
                <td>{t.pointsPossible}</td>
                <td>
                  <input
                    aria-label={"What-if points for " + t.title}
                    type="number"
                    min="0"
                    max="10000"
                    disabled={p.busy || t.excused}
                    key={String(p.tools.whatIf[t.id])}
                    defaultValue={p.tools.whatIf[t.id] ?? ""}
                    placeholder="Unchanged"
                    onBlur={(e) => {
                      const next = { ...p.tools.whatIf };
                      if (e.target.value === "") delete next[t.id];
                      else next[t.id] = Number(e.target.value);
                      attempt(() => p.saveTools({ ...p.tools, whatIf: next }));
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pro-fields">
        {projected.buckets.map((b, i) => (
          <article className="pro-mini-card" key={i}>
            <strong>{b.name}</strong>
            <p>
              {((b.earned / b.possible) * 100).toFixed(1)}% · weight{" "}
              {b.weight ?? "unknown"}%
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
export function DetailedPlan(p: PlanningProps) {
  const [conf, setConf] = useState(p.tools.plan),
    [addingDay, setAddingDay] = useState(""),
    [addedDays, setAddedDays] = useState<string[]>([]),
    plan = timedPlan(p.data, p.tools),
    factors = effortFactors(p.data, p.tools);
  return (
    <div className="pro-plan-layout">
      <div className="pro-plan-days">
        {plan.days.map((d) => (
          <article className="glass school-panel" key={d.date}>
            <div className="section-title">
              <h3>
                {new Date(d.date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              <span>{d.used} min study</span>
            </div>
            {d.sessions.map((s, i) => (
              <button
                className={"pro-session " + (!s.task ? "is-break" : "")}
                key={i}
                disabled={!s.task}
                onClick={() => s.task && p.select(s.task)}
              >
                <time>
                  {s.start}–{s.end}
                </time>
                <strong>{s.task?.title || "Take a break"}</strong>
                <span>{s.minutes}m</span>
              </button>
            ))}
            {!d.sessions.length && <p className="hint">Free / flex time.</p>}
            {d.sessions.some((s) => s.task) && (
              <button
                className="text-link"
                disabled={!!addingDay || addedDays.includes(d.date)}
                onClick={() =>
                  attempt(async () => {
                    setAddingDay(d.date);
                    try {
                      for (const s of d.sessions.filter((s) => s.task)) {
                        const date = new Date(d.date);
                        const [h, m] = s.start.split(":").map(Number);
                        date.setHours(h, m, 0, 0);
                        await api("events", "POST", {
                          title: (
                            s.task!.title +
                            " · " +
                            s.minutes +
                            " min"
                          ).slice(0, 150),
                          date: date.toISOString(),
                        });
                      }
                      setAddedDays((days) => [...days, d.date]);
                      p.onCalendar?.();
                      toast.success("Study sessions added to calendar");
                    } finally {
                      setAddingDay("");
                    }
                  })
                }
              >
                <CalendarDays size={14} />
                {addedDays.includes(d.date)
                  ? "Added to calendar"
                  : addingDay === d.date
                    ? "Adding…"
                    : "Add this day to calendar"}
              </button>
            )}
          </article>
        ))}
        {plan.remaining.size > 0 && (
          <div className="pro-notice">
            <strong>More time needed</strong>
            {[...plan.remaining].map(([id, n]) => (
              <p key={id}>
                {p.data.tasks.find((t) => t.id === id)?.title}: {n} minutes
                unscheduled
              </p>
            ))}
          </div>
        )}
      </div>
      <aside className="glass school-panel">
        <h2>Tune your plan</h2>
        <form
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            attempt(() => p.saveTools({ ...p.tools, plan: conf }));
          }}
        >
          <div className="form-row">
            <label>
              Start
              <input
                type="time"
                value={conf.start}
                onChange={(e) => setConf({ ...conf, start: e.target.value })}
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={conf.end}
                onChange={(e) => setConf({ ...conf, end: e.target.value })}
              />
            </label>
          </div>
          <label>
            Daily study cap (minutes)
            <input
              type="number"
              min="15"
              max="480"
              defaultValue={p.data.dailyMinutes}
              onBlur={(e) =>
                attempt(() =>
                  p.save({ ...p.data, dailyMinutes: Number(e.target.value) }),
                )
              }
            />
          </label>
          <label>
            Minutes per point
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="3"
              value={conf.minutesPerPoint}
              onChange={(e) =>
                setConf({ ...conf, minutesPerPoint: Number(e.target.value) })
              }
            />
          </label>
          <div className="form-row">
            <label>
              Break every (minutes)
              <input
                type="number"
                min="0"
                max="120"
                value={conf.breakEvery}
                onChange={(e) =>
                  setConf({ ...conf, breakEvery: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Break length
              <input
                type="number"
                min="0"
                max="60"
                value={conf.breakMinutes}
                onChange={(e) =>
                  setConf({ ...conf, breakMinutes: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {p.data.courses.map((c) => (
            <label key={c.id}>
              {c.name}
              <select
                value={conf.difficulty[c.id] || ""}
                onChange={(e) => {
                  const difficulty = { ...conf.difficulty };
                  if (e.target.value) difficulty[c.id] = Number(e.target.value);
                  else delete difficulty[c.id];
                  setConf({ ...conf, difficulty });
                }}
              >
                <option value="">Learn from effort logs</option>
                <option value="0.6">Light</option>
                <option value="1">Normal</option>
                <option value="1.6">Heavy</option>
                <option value="2.2">Very demanding</option>
              </select>
              <small>
                {factors[c.id]
                  ? `${factors[c.id].factor.toFixed(2)}× learned from ${factors[c.id].count} logs`
                  : "No effort logs yet"}
              </small>
            </label>
          ))}
          <button className="primary" disabled={p.busy}>
            Save & regenerate
          </button>
        </form>
      </aside>
    </div>
  );
}
export function CurveHistory(p: PlanningProps) {
  const [courseId, setCourseId] = useState(p.data.courses[0]?.id || ""),
    [title, setTitle] = useState(""),
    [values, setValues] = useState({
      raw: 72,
      possible: 100,
      added: 5,
      target: 93,
    }),
    [avg, setAvg] = useState("");
  const r =
    values.possible > 0
      ? curve(values.raw, values.possible, values.added, values.target)
      : null;
  return (
    <div className="form-stack">
      <div className="pro-two-column">
        <section className="glass school-panel form-stack">
          <h2>Curve calculator</h2>
          <label>
            Course
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setValues({
                  ...values,
                  target:
                    p.data.courses.find((c) => c.id === e.target.value)
                      ?.targetGrade || 93,
                });
              }}
            >
              {p.data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Test name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
            />
          </label>
          <div className="pro-fields">
            {(
              [
                ["raw", "Points earned"],
                ["possible", "Points possible"],
                ["added", "Curve points"],
                ["target", "Target %"],
              ] as const
            ).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  type="number"
                  min={k === "possible" ? 1 : 0}
                  max={k === "target" ? 100 : 10000}
                  step="0.1"
                  value={values[k]}
                  onChange={(e) =>
                    setValues({ ...values, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            Class average (points, optional)
            <input
              type="number"
              min="0"
              max="10000"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
            />
          </label>
          <input
            aria-label="Adjust curve points"
            type="range"
            min="0"
            max="30"
            step="0.5"
            value={values.added}
            onChange={(e) =>
              setValues({ ...values, added: Number(e.target.value) })
            }
          />
          <button
            className="primary"
            disabled={!r || !courseId || p.busy}
            onClick={() =>
              attempt(async () => {
                await p.saveTools({
                  ...p.tools,
                  curves: [
                    ...p.tools.curves,
                    {
                      id: crypto.randomUUID(),
                      courseId,
                      title: title || "Unnamed test",
                      ...values,
                      average: avg === "" ? null : Number(avg),
                      at: Date.now(),
                    },
                  ],
                });
                toast.success("Curve saved privately");
              })
            }
          >
            <Plus size={15} />
            Save curve
          </button>
        </section>
        <section className="glass school-panel curve-result">
          <span>Projected test grade</span>
          <strong>{r ? r.curvedPct.toFixed(1) + "%" : "—"}</strong>
          <h2>{r ? letter(r.curvedPct) : ""}</h2>
          <p>
            {r ? `${r.needed} points needed to reach ${values.target}%` : ""}
          </p>
          {avg !== "" && r && (
            <p>
              Class average after curve:{" "}
              {(((Number(avg) + values.added) / values.possible) * 100).toFixed(
                1,
              )}
              %
            </p>
          )}
          <p className="hint">
            Your private history syncs between devices. This does not alter
            official grades.
          </p>
        </section>
      </div>
      <section className="glass school-panel">
        <div className="section-title">
          <h2>Curve history</h2>
          <button
            className="secondary"
            onClick={() =>
              download(
                "curve-history.json",
                JSON.stringify(p.tools.curves, null, 2),
              )
            }
          >
            Export history
          </button>
        </div>
        {p.tools.curves.length === 0 ? (
          <p className="hint">Save your first curve above.</p>
        ) : (
          <div className="pro-table-wrap">
            <table className="pro-table">
              <thead>
                <tr>
                  <th>Course / test</th>
                  <th>Raw</th>
                  <th>Curve</th>
                  <th>Final</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.tools.curves
                  .slice()
                  .reverse()
                  .map((c) => (
                    <tr key={c.id}>
                      <td>
                        {p.data.courses.find((x) => x.id === c.courseId)?.name}
                        <small>
                          {c.title} · {new Date(c.at).toLocaleDateString()}
                        </small>
                      </td>
                      <td>{((c.raw / c.possible) * 100).toFixed(1)}%</td>
                      <td>+{c.added} pts</td>
                      <td>
                        {(((c.raw + c.added) / c.possible) * 100).toFixed(1)}%
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={"Delete curve " + c.title}
                          onClick={() =>
                            attempt(() =>
                              p.saveTools({
                                ...p.tools,
                                curves: p.tools.curves.filter(
                                  (x) => x.id !== c.id,
                                ),
                              }),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {p.data.courses.map((c) => {
          const h = p.tools.curves.filter((x) => x.courseId === c.id);
          return h.length ? (
            <p key={c.id}>
              {c.name}: average +
              {(
                h.reduce((n, x) => n + (x.added / x.possible) * 100, 0) /
                h.length
              ).toFixed(1)}{" "}
              percentage points across {h.length} tests.
            </p>
          ) : null;
        })}
      </section>
    </div>
  );
}

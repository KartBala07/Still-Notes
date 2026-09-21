"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Mic,
  Upload,
  Layers,
  Quote,
  Sparkles,
  BookOpen,
  CalendarDays,
  MessageCircle,
} from "lucide-react";
import type { Data, User } from "../lib/types";
import CountUp from "../components/react-bits/CountUp";
import ShinyText from "../components/react-bits/ShinyText";
import SpotlightCard from "../components/react-bits/SpotlightCard";
const thoughts = [
  "You don’t have to understand everything today. Just one thing more than yesterday.",
  "A good question is the beginning of a better understanding.",
  "Small moments of focus become things you thought you couldn’t do.",
  "Progress is often quiet. Keep showing up for it.",
  "Curiosity turns a page of facts into a world of possibilities.",
  "Give yourself permission to learn it slowly and know it deeply.",
  "The part you find difficult is a good place to be curious.",
  "Take a breath. Make a connection. Try one more time.",
  "You build confidence by keeping small promises to yourself.",
  "Learning is a conversation between what you know and what you wonder.",
  "A little recall today makes room for a little more tomorrow.",
  "Let your questions be bigger than your fear of getting it wrong.",
  "Your next breakthrough might begin with a five-minute review.",
  "Make space for the idea. Then make time to make it yours.",
];
function dayIndex() {
  const d = new Date();
  return Math.floor(
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000,
  );
}
export function usePageMotion(page: string, count: number) {
  useEffect(() => {
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    const nodes = document.querySelectorAll<HTMLElement>(
      ".reveal,.note-card,.deck-card,.workspace-heading",
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            (e.target as HTMLElement).dataset.reveal = "shown";
            observer.unobserve(e.target);
          }
      },
      { threshold: 0.06 },
    );
    nodes.forEach((node, i) => {
      node.dataset.reveal = "pending";
      node.style.setProperty(
        "--reveal-delay",
        Math.min((i % 5) * 45, 180) + "ms",
      );
      observer.observe(node);
    });
    return () => {
      observer.disconnect();
      nodes.forEach((n) => delete n.dataset.reveal);
    };
  }, [page, count]);
}
export default function Dashboard({
  user,
  data,
  onNavigate,
  onNew,
}: {
  user: User;
  data: Data;
  onNavigate: (page: string) => void;
  onNew: (mode: string) => void;
}) {
  const [day, setDay] = useState(dayIndex);
  useEffect(() => {
    const id = setInterval(() => setDay(dayIndex()), 60000);
    return () => clearInterval(id);
  }, []);
  const due = data.decks.reduce(
    (n, d) => n + d.cards.filter((c) => c.due <= Date.now()).length,
    0,
  );
  const upcoming = data.events
    .filter((e) => !e.done && new Date(e.date).getTime() >= Date.now())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);
  return (
    <div className="workspace dashboard">
      <section className="dashboard-welcome reveal">
        <div>
          <span className="eyebrow">
            <Sparkles size={14} />
            YOUR MIND, A LITTLE MORE OPEN
          </span>
          <h1>
            Hey {user.name.split(" ")[0]},<br />
            what will click <span>today?</span>
          </h1>
          <p>Turn a little curiosity into a lot of understanding.</p>
        </div>
        <div className="today-pill">
          <CalendarDays size={16} />
          {new Date().toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>
      </section>
      <button
        className="school-banner glass reveal"
        onClick={() => onNavigate("school")}
      >
        <span>
          <BookOpen size={20} />
          <strong>Your classes. Your notes. Connected.</strong>
        </span>
        <span>
          Open Canvas workspace
          <ArrowUpRight size={17} />
        </span>
      </button>
      <section className="quick-actions reveal" aria-label="Start learning">
        <button
          className="quick-card lime-card"
          onClick={() => onNew("record")}
        >
          <div>
            <Mic />
            <ArrowUpRight />
          </div>
          <h2>Catch every idea.</h2>
          <p>
            Record a lecture.
            <br />
            Let your notes take shape.
          </p>
          <span>Record lecture</span>
        </button>
        <button className="quick-card glass" onClick={() => onNew("lesson")}>
          <div>
            <Upload />
            <ArrowUpRight />
          </div>
          <h2>Bring it all together.</h2>
          <p>
            PDFs, documents, YouTube.
            <br />
            One place to understand it.
          </p>
          <span>Import material</span>
        </button>
        <button
          className="quick-card dark-card"
          onClick={() => onNavigate("study")}
        >
          <div>
            <Layers />
            <ArrowUpRight />
          </div>
          <h2>Make it stick.</h2>
          <p>
            Flashcards, quizzes & games.
            <br />
            Practice with a purpose.
          </p>
          <span>Open study studio</span>
        </button>
      </section>
      <section className="dashboard-middle">
        <article className="quote-card reveal">
          <img
            src={
              new URL("../public/images/misty-mountains.webp", import.meta.url)
                .href
            }
            alt="A quiet green valley beneath misty mountains"
            loading="lazy"
            decoding="async"
          />
          <div className="quote-overlay">
            <span className="eyebrow">
              <Quote size={15} />
              QUOTE OF THE DAY
            </span>
            <blockquote>“{thoughts[day % thoughts.length]}”</blockquote>
            <div>
              <span>Still Notes · Daily thoughts</span>
              <a
                href="https://unsplash.com/photos/o4uW0_IF2Sk"
                target="_blank"
                rel="noreferrer"
              >
                Photo: Suhyeon Choi
              </a>
            </div>
          </div>
        </article>
        <SpotlightCard as="aside" className="progress-panel glass reveal">
          <span className="eyebrow">
            <ShinyText text="LOOK HOW FAR YOU’VE COME" />
          </span>
          <h2>Your learning, at a glance.</h2>
          <button onClick={() => onNavigate("notes")}>
            <span>
              <BookOpen size={17} />
              Lessons collected
            </span>
            <strong>
              <CountUp to={data.notes.length} />
              <ArrowUpRight size={16} />
            </strong>
          </button>
          <button onClick={() => onNavigate("study")}>
            <span>
              <Layers size={17} />
              Cards ready to revisit
            </span>
            <strong>
              <CountUp to={due} />
              <ArrowUpRight size={16} />
            </strong>
          </button>
          <button onClick={() => onNavigate("study")}>
            <span>
              <Sparkles size={17} />
              Practice sessions
            </span>
            <strong>
              <CountUp to={data.attempts.length} />
              <ArrowUpRight size={16} />
            </strong>
          </button>
        </SpotlightCard>
      </section>
      <section className="dashboard-bottom">
        <SpotlightCard as="article" className="glass reveal">
          <div className="section-title">
            <h2>A question on your mind?</h2>
            <MessageCircle size={21} />
          </div>
          <p>Your personal tutor, grounded in the lessons you choose.</p>
          <div className="prompt-chips">
            {[
              "Explain a tricky concept",
              "Connect the big ideas",
              "Help me revise",
            ].map((t) => (
              <button key={t} onClick={() => onNavigate("chat")}>
                {t}
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </SpotlightCard>
        <SpotlightCard as="article" className="glass reveal">
          <div className="section-title">
            <h2>A little time to learn.</h2>
            <button
              className="icon-button"
              aria-label="Open calendar"
              onClick={() => onNavigate("calendar")}
            >
              <ArrowUpRight size={20} />
            </button>
          </div>
          {upcoming.length ? (
            upcoming.map((e) => (
              <button
                className="upcoming-session"
                key={e.id}
                onClick={() => onNavigate("calendar")}
              >
                <span>{e.title}</span>
                <small>
                  {new Date(e.date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </button>
            ))
          ) : (
            <>
              <p>A small plan makes a big difference.</p>
              <button
                className="secondary"
                onClick={() => onNavigate("calendar")}
              >
                <CalendarDays size={16} />
                Plan your next session
              </button>
            </>
          )}
        </SpotlightCard>
      </section>
    </div>
  );
}

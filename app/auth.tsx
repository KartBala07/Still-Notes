"use client";
import { useState } from "react";
import {
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Mic,
  Layers,
  Cloud,
  LoaderCircle,
  Mail,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { api, setSession } from "../lib/client";
import { setDemo } from "../lib/demo";
import type { User } from "../lib/types";
import BlurText from "../components/react-bits/BlurText";
import GradientText from "../components/react-bits/GradientText";
import StarBorder from "../components/react-bits/StarBorder";
export default function Auth({
  onLogin,
  resetToken = "",
}: {
  onLogin: (u: User, t: string) => Promise<void>;
  resetToken?: string;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "reset">(
    resetToken ? "reset" : "login",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const switchMode = (next: typeof mode) => {
    setMode(next);
    setError("");
    setMessage("");
  };
  const titles = {
    login: "Welcome back.",
    signup: "Your next chapter.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const b = new FormData(e.currentTarget);
    try {
      if (mode === "forgot") {
        const r = await api("auth/forgot", "POST", { email: b.get("email") });
        setMessage(r.message);
      } else if (mode === "reset") {
        if (b.get("password") !== b.get("confirm"))
          throw new Error("The passwords do not match.");
        await api("auth/reset", "POST", {
          token: resetToken,
          password: b.get("password"),
        });
        setSession("");
        history.replaceState(null, "", location.pathname + location.search);
        setMode("login");
        setMessage("Password updated. Sign in with your new password.");
      } else {
        const r = await api("auth/" + mode, "POST", {
          email: b.get("email"),
          password: b.get("password"),
          name: b.get("name") || "Student",
        });
        await onLogin(r.user, r.token);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-screen modern-auth">
      <section className="auth-story">
        <a className="brand" href="#">
          <span className="brand-icon">
            <BookOpen />
          </span>
          still<span className="brand-soft">notes</span>
        </a>
        <span className="eyebrow">
          <Sparkles size={14} />A LITTLE CURIOSITY GOES A LONG WAY
        </span>
        <h1>
          <BlurText
            text="Big ideas."
            animateBy="words"
            direction="top"
            className="auth-hero-line"
          />
          <GradientText
            className="auth-hero-line auth-hero-accent"
            colors={["#bf6047", "#e0a37f", "#7f9c86", "#bf6047"]}
            animationSpeed={6}
          >
            Clearer thinking.
          </GradientText>
        </h1>
        <p>
          Your lectures, notes, and next breakthrough.
          <br />
          One space to make it all click.
        </p>
        <div className="auth-features">
          <span>
            <Mic />
            Capture a lecture
          </span>
          <span>
            <Layers />
            Make it stick
          </span>
          <span>
            <Cloud />
            Pick up anywhere
          </span>
        </div>
        <div className="auth-landscape">
          <img
            src={
              new URL("../public/images/misty-mountains.webp", import.meta.url)
                .href
            }
            alt="Green mountains beneath soft morning mist"
          />
          <div>
            <span>ROOM TO GROW</span>
            <p>Start small. Stay curious.</p>
          </div>
        </div>
      </section>
      <form className="auth-card glass" onSubmit={submit}>
        <span className="auth-symbol">
          {mode === "forgot" ? (
            <Mail />
          ) : mode === "reset" ? (
            <LockKeyhole />
          ) : (
            <Sparkles />
          )}
        </span>
        <span className="eyebrow">YOUR PERSONAL STUDY SPACE</span>
        <h2>{titles[mode]}</h2>
        <p>
          {mode === "forgot"
            ? "Enter your account email. We’ll send a link to choose a new password."
            : mode === "reset"
              ? "Choose a new password with at least 10 characters."
              : mode === "signup"
                ? "Create a private workspace for everything you’re learning."
                : "Sign in and pick up where your curiosity left off."}
        </p>
        {mode === "signup" && (
          <label>
            Your name
            <input
              name="name"
              required
              maxLength={80}
              autoComplete="name"
              placeholder="What should we call you?"
            />
          </label>
        )}
        {mode !== "reset" && (
          <label>
            Email address
            <input
              name="email"
              required
              maxLength={254}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            {mode === "reset" ? "New password" : "Password"}
            <input
              name="password"
              type="password"
              required
              minLength={mode === "reset" ? 10 : 8}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder={
                mode === "reset" ? "At least 10 characters" : "Your password"
              }
            />
          </label>
        )}
        {mode === "reset" && (
          <label>
            Confirm new password
            <input
              name="confirm"
              type="password"
              required
              minLength={10}
              maxLength={128}
              autoComplete="new-password"
            />
          </label>
        )}
        {mode === "login" && (
          <button
            type="button"
            className="text-button forgot-link"
            onClick={() => switchMode("forgot")}
          >
            Forgot password?
          </button>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success-message" role="status">
            {message}
          </p>
        )}
        <StarBorder
          as="button"
          type="submit"
          disabled={busy}
          className="auth-submit"
          color="var(--primary)"
        >
          {busy ? (
            <>
              <LoaderCircle size={17} className="spin" />
              Please wait…
            </>
          ) : (
            <>
              {mode === "forgot"
                ? "Send reset link"
                : mode === "reset"
                  ? "Save new password"
                  : mode === "signup"
                    ? "Create account"
                    : "Let’s get started"}
              <ArrowRight size={17} />
            </>
          )}
        </StarBorder>
        <button
          type="button"
          className="secondary auth-demo"
          onClick={() => {
            setDemo(true);
            location.reload();
          }}
        >
          Explore the demo — no account needed
        </button>
        <p className="auth-switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <button type="button" onClick={() => switchMode("signup")}>
                Create an account
              </button>
            </>
          ) : (
            <button type="button" onClick={() => switchMode("login")}>
              <ArrowLeft size={13} /> Back to sign in
            </button>
          )}
        </p>
        <small className="muted">
          <LockKeyhole size={12} /> Your notes are private to your account.
        </small>
      </form>
    </div>
  );
}

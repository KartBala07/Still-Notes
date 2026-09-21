"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  LoaderCircle,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
  KeyRound,
  Eye,
  X,
} from "lucide-react";
import { toast, Toaster } from "sonner";
import {
  admin,
  setDevToken,
  devToken,
  type AdminAccount,
  type AdminContent,
} from "../lib/admin";

function formatBytes(bytes: number) {
  if (!bytes) return "0 MB";
  return (bytes / 1000000).toFixed(1) + " MB";
}
function formatDate(value: number) {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
function tempPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export default function DevConsole() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<AdminContent | null>(null);
  const [resetFor, setResetFor] = useState<AdminAccount | null>(null);
  const [resetValue, setResetValue] = useState("");
  const [issued, setIssued] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await admin.accounts();
      setAccounts(r.accounts);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!devToken()) return;
    admin
      .session()
      .then(() => {
        setSignedIn(true);
        return load();
      })
      .catch(() => setDevToken(""));
  }, [load]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await admin.login(email, password);
      setDevToken(r.token);
      setSignedIn(true);
      setPassword("");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try {
      await admin.logout();
    } catch {
      /* ignore */
    }
    setDevToken("");
    setSignedIn(false);
    setAccounts([]);
  }

  async function doReset() {
    if (!resetFor) return;
    setBusy(true);
    try {
      await admin.setPassword(resetFor.id, resetValue);
      setIssued(resetValue);
      setResetFor(null);
      setResetValue("");
      toast.success("Temporary password set for " + resetFor.email);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleSuspend(account: AdminAccount) {
    setBusy(true);
    try {
      await admin.suspend(account.id, !account.suspended);
      toast.success(
        (account.suspended ? "Reactivated " : "Suspended ") + account.email,
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(account: AdminAccount) {
    if (
      !confirm(
        "Permanently delete " +
          account.email +
          " and all of their notes, decks and recordings? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      await admin.remove(account.id);
      toast.success("Deleted " + account.email);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = accounts.filter((a) =>
    (a.email + " " + a.name).toLowerCase().includes(query.toLowerCase()),
  );

  if (!signedIn)
    return (
      <div className="dev-screen">
        <form className="dev-login glass" onSubmit={signIn}>
          <span className="auth-symbol">
            <ShieldCheck />
          </span>
          <span className="eyebrow">DEVELOPER ACCESS</span>
          <h1>Owner console</h1>
          <p>
            This sign-in is separate from student accounts and is configured on
            the server. It cannot read API keys or passwords.
          </p>
          <label>
            Developer email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label>
            Developer password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <ShieldCheck size={16} />}
            Sign in
          </button>
          <a className="dev-back" href="#" onClick={() => location.reload()}>
            <ArrowLeft size={13} /> Back to Still Notes
          </a>
        </form>
        <div className="dev-note">
          Set <code>DEV_EMAIL</code> and <code>DEV_PASSWORD</code> in the backend
          environment to enable this console.
        </div>
        <Toaster position="bottom-right" richColors />
      </div>
    );

  return (
    <div className="dev-screen dev-wide">
      <header className="dev-header">
        <div>
          <span className="eyebrow">DEVELOPER CONSOLE</span>
          <h1>All accounts</h1>
          <p>
            {accounts.length} account{accounts.length === 1 ? "" : "s"} ·{" "}
            {accounts.filter((a) => a.suspended).length} suspended · passwords and
            API keys are never shown
          </p>
        </div>
        <div className="dev-header-actions">
          <a className="secondary" href="#">
            <ArrowLeft size={15} /> App
          </a>
          <button className="secondary" onClick={load} disabled={busy}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="secondary" onClick={signOut}>
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>

      {issued && (
        <div className="dev-issued" role="status">
          <strong>Temporary password:</strong> <code>{issued}</code> — share it
          privately; the student should change it after signing in.
          <button className="link-btn" onClick={() => setIssued("")}>
            Dismiss
          </button>
        </div>
      )}

      <label className="dev-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by email or name"
        />
      </label>

      <div className="dev-table-wrap glass">
        <table className="dev-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Joined</th>
              <th>Model in use</th>
              <th>Content</th>
              <th>Storage</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className={a.suspended ? "dev-row-suspended" : ""}>
                <td>
                  <strong>{a.name}</strong>
                  <span>{a.email}</span>
                </td>
                <td>{formatDate(a.created)}</td>
                <td>
                  <span className="dev-chip">{a.provider}</span>
                  <code>{a.model}</code>
                </td>
                <td>
                  {a.notes} notes · {a.decks} decks
                  {a.assets ? " · " + a.assets + " audio" : ""}
                </td>
                <td>{formatBytes(a.bytes)}</td>
                <td>
                  {a.suspended ? (
                    <span className="dev-status bad">Suspended</span>
                  ) : (
                    <span className="dev-status ok">Active</span>
                  )}
                </td>
                <td className="dev-actions">
                  <button
                    className="icon-btn"
                    title="View content"
                    onClick={async () => {
                      try {
                        setViewing(await admin.content(a.id));
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    <Eye size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Set a temporary password"
                    onClick={() => {
                      setResetValue(tempPassword());
                      setResetFor(a);
                    }}
                  >
                    <KeyRound size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    title={a.suspended ? "Reactivate" : "Suspend"}
                    onClick={() => toggleSuspend(a)}
                  >
                    <UserX size={15} />
                  </button>
                  <button
                    className="icon-btn danger"
                    title="Delete account"
                    onClick={() => remove(a)}
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr>
                <td colSpan={7} className="dev-empty">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {viewing && (
        <div className="dev-modal" role="dialog" aria-modal="true">
          <div className="dev-modal-card glass">
            <header>
              <div>
                <span className="eyebrow">USER CONTENT</span>
                <h2>{viewing.email}</h2>
              </div>
              <button className="icon-btn" onClick={() => setViewing(null)}>
                <X size={16} />
              </button>
            </header>
            <p className="hint">
              Read-only view for support. This access is not visible to the
              student and does not include API keys.
            </p>
            <h3>Lessons ({viewing.notes.length})</h3>
            {viewing.notes.map((n) => (
              <details key={n.id} className="dev-content-item">
                <summary>
                  {n.title || "Untitled"} <small>{n.subject}</small>
                </summary>
                <p>{n.text}</p>
              </details>
            ))}
            {!viewing.notes.length && <p className="muted">No lessons.</p>}
            <h3>Study sets ({viewing.decks.length})</h3>
            {viewing.decks.map((d) => (
              <p key={d.id} className="dev-deck">
                {d.title} · {d.cards} cards
              </p>
            ))}
          </div>
        </div>
      )}

      {resetFor && (
        <div className="dev-modal" role="dialog" aria-modal="true">
          <div className="dev-modal-card glass narrow-dev">
            <header>
              <div>
                <span className="eyebrow">RESET PASSWORD</span>
                <h2>{resetFor.email}</h2>
              </div>
              <button className="icon-btn" onClick={() => setResetFor(null)}>
                <X size={16} />
              </button>
            </header>
            <p className="hint">
              Share this temporary password privately. All of the student’s
              active sessions will be signed out.
            </p>
            <label>
              Temporary password
              <input
                value={resetValue}
                onChange={(e) => setResetValue(e.target.value)}
                minLength={10}
              />
            </label>
            <div className="button-row">
              <button className="secondary" onClick={() => setResetValue(tempPassword())}>
                Generate another
              </button>
              <button
                className="primary"
                disabled={busy || resetValue.length < 10}
                onClick={doReset}
              >
                <ShieldAlert size={15} /> Set password
              </button>
            </div>
          </div>
        </div>
      )}
      <Toaster position="bottom-right" richColors />
    </div>
  );
}

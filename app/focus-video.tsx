"use client";
import { useState } from "react";
import { X, Play, ExternalLink, Minimize2, Film } from "lucide-react";
import { toast } from "sonner";
import { youtubeId, youtubeEmbed } from "../lib/youtube";
import { api } from "../lib/client";
import type { User } from "../lib/types";
export default function FocusVideo({
  user,
  onSave,
}: {
  user: User;
  onSave: (u: User) => void;
}) {
  const [url, setUrl] = useState(user.settings.brainrotVideo || ""),
    [playing, setPlaying] = useState(""),
    [small, setSmall] = useState(false),
    [busy, setBusy] = useState(false);
  if (small)
    return (
      <button className="video-reopen primary" onClick={() => setSmall(false)}>
        <Film size={17} />
        Video corner
      </button>
    );
  return (
    <aside
      className="focus-video glass"
      aria-label="Optional YouTube video corner"
    >
      <header>
        <strong>
          <Film size={16} />
          Brainrot corner
        </strong>
        <div>
          <button
            className="icon-button"
            aria-label="Minimize and stop video"
            onClick={() => {
              setPlaying("");
              setSmall(true);
            }}
          >
            <Minimize2 size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Turn off video corner"
            onClick={async () => {
              setPlaying("");
              try {
                onSave(
                  (
                    await api("settings", "PUT", {
                      ...user.settings,
                      brainrot: false,
                    })
                  ).user,
                );
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      {playing ? (
        <iframe
          key={playing}
          title="Your chosen YouTube background video"
          src={youtubeEmbed(playing)}
          width="360"
          height="220"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="video-placeholder">
          <Play size={29} />
          <strong>Your video. Your pace.</strong>
          <p>
            Paste a parkour, runner, or driving video you like. Nothing loads
            until you press play.
          </p>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const id = youtubeId(url);
          if (!id) {
            toast.error("Paste a valid HTTPS YouTube video link");
            return;
          }
          setBusy(true);
          try {
            const r = await api("settings", "PUT", {
              ...user.settings,
              brainrotVideo: "https://www.youtube.com/watch?v=" + id,
            });
            onSave(r.user);
            setPlaying(id);
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          aria-label="YouTube background video link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a YouTube video link"
          type="url"
          required
        />
        <button className="primary" disabled={busy} aria-label="Load video">
          <Play size={15} />
        </button>
      </form>
      <footer>
        <a
          href="https://www.youtube.com/results?search_query=minecraft+parkour+no+commentary"
          target="_blank"
          rel="noreferrer"
        >
          Find a video
          <ExternalLink size={12} />
        </a>
        {youtubeId(url) && (
          <a
            href={"https://www.youtube.com/watch?v=" + youtubeId(url)}
            target="_blank"
            rel="noreferrer"
          >
            Open on YouTube
            <ExternalLink size={12} />
          </a>
        )}
      </footer>
    </aside>
  );
}

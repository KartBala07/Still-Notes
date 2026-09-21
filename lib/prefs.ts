// Per-device preferences the UI can trust even when the deployed backend has not
// been updated to store a newer settings field yet. The server stays the source
// of truth across devices; these keep the interface consistent on this device.
export type LocalPrefs = {
  accent?: string;
  onboarded?: boolean;
  theme?: string;
};

function key(id: string) {
  return "still-prefs-" + id;
}

export function localPrefs(id: string | undefined): LocalPrefs {
  if (!id || typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(key(id)) || "{}") as LocalPrefs;
  } catch {
    return {};
  }
}

export function setLocalPrefs(id: string | undefined, patch: LocalPrefs) {
  if (!id || typeof window === "undefined") return;
  try {
    localStorage.setItem(key(id), JSON.stringify({ ...localPrefs(id), ...patch }));
  } catch {
    /* storage unavailable */
  }
}

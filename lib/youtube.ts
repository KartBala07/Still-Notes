export function youtubeId(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    return null;
  const host = url.hostname.replace(/^www\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
        ? url.searchParams.get("v") ||
          url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
        : null;
  return id && /^[-\w]{11}$/.test(id) ? id : null;
}
export function youtubeEmbed(id: string) {
  if (!/^[-\w]{11}$/.test(id)) throw Error("Invalid YouTube video");
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0`;
}

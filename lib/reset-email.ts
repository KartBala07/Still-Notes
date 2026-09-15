import type { BackendRuntime } from "./backend-store";
export async function sendResetEmail(
  config: NonNullable<BackendRuntime["email"]>,
  email: string,
  token: string,
) {
  const url = new URL(config.appUrl);
  if (url.protocol !== "https:") throw new Error("Reset URL must use HTTPS");
  // Fragment is read by the app; it is never sent in HTTP access logs or referrers.
  url.hash = "reset=" + encodeURIComponent(token);
  const text = `A password reset was requested for your Still Notes account.\n\nChoose a new password: ${url.toString()}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: "Reset your Still Notes password",
      text,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("Email delivery unavailable");
}

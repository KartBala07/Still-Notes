# Still Notes

A responsive, glass-inspired cloud study workspace for desktop, Mac, tablets and phones. Open it in a browser; no unsigned Mac installer is needed.

## Features

- Email/password accounts; each person has private lessons, study sets, calendar events and results.
- Light, dark and system themes; desktop sidebar, keyboard shortcuts and responsive layouts.
- Microphone recording in standalone 10-minute clips, downloadable backups, Fish Audio transcription and optional read-aloud.
- PDF, DOCX, text, Markdown, CSV and subtitle imports. Public Google Docs/Sheets links and YouTube captions where accessible. Private Google files work through downloaded exports. Scanned PDFs need OCR before import.
- Groq, xAI Grok, DeepSeek and OpenRouter settings, separate encrypted keys per provider, live model lists and connection checks. DeepSeek is paid; OpenRouter offers a separate free-model router subject to its limits.
- Refreshed glass dashboard, daily original study thoughts, attributed landscape photography and scroll reveals that respect reduced motion.
- Password-reset email flow with hashed, single-use, 30-minute tokens and session revocation; requires a configured email sender.
- AI-organized notes, flashcards, quizzes, timed AP-style multiple-choice practice and detailed rationales for every option.
- Match and Crash study games, spaced flashcard review, mistake notebook, focus timer and study calendar.
- Chat grounded in selected lessons, with verified exact source quotations and no web tools.
- Integrated Canvas Pro course dashboard, assignment priorities, grades, weekly study plan, announcements and curve calculator. Course data syncs privately; Canvas access tokens stay in the optional local connector.
- Ollama and OpenCode options for local study generation, with explicit model selection and a paired loopback connector. Cloud providers remain available on other devices.
- Opt-in Gen Z mode adapts explanation length, familiar wording and emoji use from simple per-user statistics; reset the learned style in Settings.
- An optional YouTube video corner accepts your own runner, parkour or driving video links. Nothing embeds until you load a video; minimize stops playback.
- JSON account export and Markdown lesson export.

## Convex migration

A Convex hosting target is prepared on this branch. See [Convex setup and account continuity](docs/CONVEX.md). The UI can be served directly from the deployment’s `.convex.site` address. Deployment needs access to the intended Convex project; no new public URL is claimed here. Transition mode preserves current accounts and data in the existing backend until a verified database transfer.

## Current hosting

The app is live on [GitHub Pages](https://kartbala07.github.io/Still-Notes/) and at its [cloud origin](https://still-notes.swathibala988.chatgpt.site). Anyone can create an account; each person’s lessons, study data, calendar and API keys stay scoped to that account.

GitHub Pages hosts the React frontend. The backend runs as a Cloudflare-compatible Worker with D1 for account/study data and R2 for audio, independently of a user’s laptop. The same full source is stored in this repository. `.github/workflows/pages.yml` checks and publishes frontend changes. GitHub Pages cannot execute the private backend.

The owner account and encrypted provider credentials are configured in private runtime secrets. Initialization is idempotent and does not overwrite existing account settings or passwords. New users add their own provider keys in Settings.

GitHub Pages is enabled using GitHub Actions. The frontend connects to the cloud backend through an explicit CORS allowlist for `https://kartbala07.github.io`. Public account sign-up was approved by the owner; study content is not made public.

The hosted frontend uses an HttpOnly Secure SameSite=Lax session cookie. The cross-origin GitHub Pages frontend uses a bearer session kept in tab-scoped sessionStorage so it works when browsers block third-party cookies. Provider API keys and study content are not persisted in browser storage. Local model preferences are stored per account on each device; the connector pairing code lasts only for that tab.

## Canvas Pro integration and local AI

See [Canvas merge, attribution and local setup](docs/CANVAS-MERGE.md). This is a feature integration into one authenticated workspace. The collaborating fork and its upstream remain unchanged.

## Development

Use Node 22 or newer.

```sh
npm ci
npm run typecheck
npm test
python3 -m unittest discover -s tests -p '*_test.py'
npm run build:pages
npm run dev
```

The server uses the Sites/Vinext build scripts supplied in this repository. `npm run db:generate` generates D1 migrations from `db/schema.ts`. Do not run schema creation at request time. The cloud host applies packaged migrations during deployment.

Required runtime binding names: `DB` (D1), `BUCKET` (R2). Required secret: `APP_ENCRYPTION_KEY` (at least 32 random characters). `OWNER_BOOTSTRAP` optionally contains an owner ID, email, name, salted password digest and encrypted provider-key payload supplied through secret runtime configuration. The first API request creates that owner account idempotently; it never overwrites an existing account. Never put real keys, passwords or secrets in the repository. Per-user AI and Fish keys are encrypted with AES-GCM before persistence. Passwords use salted PBKDF2-SHA256; session tokens are stored only as SHA256 digests.

## Practical limits

- 20 MB per uploaded file; 90,000 source characters per lesson or selected generation request; up to 20 generated cards/questions at a time.
- A recording is initially held in the open browser tab. Download and transcribe each clip, then save its lesson before closing the tab. Long recordings are split into independent clips.
- Cloud AI calls require valid provider credentials and available quota. Ollama uses an installed local model without a cloud AI key. Read-aloud and transcription still use Fish Audio; read-aloud also requires a Fish Audio voice ID.
- AI output can be wrong. Quotes are checked against the source, but this cannot prove every inference. Review generated material. AP-style questions are independent practice, not official College Board questions or a guaranteed AP syllabus assessment.
- Public Google export and YouTube caption access can fail because of source permissions or provider restrictions; file upload / transcript paste remains available.
- Calendar sessions are in-app plans; external calendar sync, email reminders and email verification are not configured. Password-reset delivery requires the email configuration below.
- Cloud sync requires an internet connection. New devices sign in to the same account. This release does not provide offline editing.

## Verification

Tests cover authentication, logout, origin restrictions, private note and coursework isolation, encryption, hidden keys, server-side grading, spaced-review ownership, local-generation authorization, citation rejection, style reset, schedule capacity and local connector permissions. Frontend and Worker builds are checked separately. Real Ollama/OpenCode models and physical-device microphone behavior still need checking on the user's hardware.

## Password reset and AI configuration

Set `RESEND_API_KEY`, `AUTH_EMAIL_FROM` (an address on a verified sender domain) and `PUBLIC_APP_URL` (the full HTTPS frontend URL, including `/Still-Notes/` if using Pages) in the active backend environment. Never commit these secrets. No sender is configured by source code alone. The endpoint gives the same response for known and unknown addresses, limits requests, stores only token hashes, rejects replay/expiry and revokes sessions when a reset succeeds. Test real delivery on the intended domain before announcing password recovery as live.

In transition mode, configure email and deploy the new shared backend **on the existing Worker host** before releasing this frontend. Bridging to an old backend does not make the new AI or reset endpoints available. Native Convex mode needs these variables on Convex instead.

In Settings, select a provider, add its key, and choose **Save & test connection**. A provider switch does not send another provider’s saved key. The key bank preserves existing credentials while supporting separate keys per vendor. Real provider access still depends on an active key, available model, balance and rate limits.

## Design credits

Interface direction inspired by [AI Chatbot Interface — ChatGPT Redesign on Dribbble](https://dribbble.com/shots/24044559-AI-Chatbot-Interface-ChatGpt-Redesign). Landscape photo by [Suhyeon Choi on Unsplash](https://unsplash.com/photos/a-green-field-with-mountains-in-the-background-o4uW0_IF2Sk), bundled locally for consistent loading. Daily thoughts are original Still Notes text, not attributed quotations.

# Still Notes

A responsive, glass-inspired cloud study workspace for desktop, Mac, tablets and phones. Open it in a browser; no unsigned Mac installer is needed.

## Features

- Email/password accounts; each person has private lessons, study sets, calendar events and results.
- Light, dark and system themes; desktop sidebar, keyboard shortcuts and responsive layouts.
- Microphone recording in standalone 10-minute clips, downloadable backups, Fish Audio transcription and optional read-aloud.
- PDF, DOCX, text, Markdown, CSV and subtitle imports. Public Google Docs/Sheets links and YouTube captions where accessible. Private Google files work through downloaded exports. Scanned PDFs need OCR before import.
- Groq and xAI Grok settings, editable encrypted API keys, configurable model and Fish Audio voice ID.
- AI-organized notes, flashcards, quizzes, timed AP-style multiple-choice practice and detailed rationales for every option.
- Match and Crash study games, spaced flashcard review, mistake notebook, focus timer and study calendar.
- Chat grounded in selected lessons, with verified exact source quotations and no web tools.
- Optional Gen Z explanations and original runner, block parkour and driving animations. These are not the commercial Subway Surfers, Minecraft or GTA games.
- JSON account export and Markdown lesson export.

## Hosting

The cloud deployment is prepared for `https://still-notes.swathibala988.chatgpt.site` but is **not live yet**. The cloud source-hosting service returned HTTP 500 while receiving the final update. After deployment, the backend runs as a Cloudflare-compatible Worker, with D1 for account/study data and R2 for audio, independently of a user’s laptop.

The owner account and encrypted provider credentials are configured in private runtime secrets. The owner account is initialized on the first API request after the finished backend is deployed.

GitHub stores the complete source. `.github/workflows/pages.yml` builds and publishes the same React frontend to GitHub Pages. GitHub Pages serves static files and cannot run the private backend.

For the first Pages deployment, a repository administrator must open **Settings → Pages → Build and deployment → Source → GitHub Actions**, then rerun the workflow. The connector used to create this repository cannot change the Pages administration setting. The cloud host must also be opened to public account sign-in before other people can use the GitHub frontend. That audience change is awaiting explicit approval. The frontend is configured for `https://kartbala07.github.io/Still-Notes/` and connects to the cloud backend through an explicit CORS allowlist.

The hosted frontend uses an HttpOnly Secure SameSite=Lax session cookie. The cross-origin GitHub Pages frontend uses a bearer session kept in tab-scoped sessionStorage so it works when browsers block third-party cookies. No product data or API keys are stored in browser storage.

## Development

Use Node 22 or newer.

```sh
npm ci
npm run typecheck
npm test
npm run build:pages
npm run dev
```

The server uses the Sites/Vinext build scripts supplied in this repository. `npm run db:generate` generates D1 migrations from `db/schema.ts`. Do not run schema creation at request time. The cloud host applies packaged migrations during deployment.

Required runtime binding names: `DB` (D1), `BUCKET` (R2). Required secret: `APP_ENCRYPTION_KEY` (at least 32 random characters). `OWNER_BOOTSTRAP` optionally contains an owner ID, email, name, salted password digest and encrypted provider-key payload supplied through secret runtime configuration. The first API request creates that owner account idempotently; it never overwrites an existing account. Never put real keys, passwords or secrets in the repository. Per-user AI and Fish keys are encrypted with AES-GCM before persistence. Passwords use salted PBKDF2-SHA256; session tokens are stored only as SHA256 digests.

## Practical limits

- 20 MB per uploaded file; 90,000 source characters per lesson or selected generation request; up to 20 generated cards/questions at a time.
- A recording is initially held in the open browser tab. Download and transcribe each clip, then save its lesson before closing the tab. Long recordings are split into independent clips.
- API calls require valid provider credentials and credits. Read-aloud also requires a Fish Audio voice ID. Speech transcription does not require a voice ID.
- AI output can be wrong. Quotes are checked against the source, but this cannot prove every inference. Review generated material. AP-style questions are independent practice, not official College Board questions or a guaranteed AP syllabus assessment.
- Public Google export and YouTube caption access can fail because of source permissions or provider restrictions; file upload / transcript paste remains available.
- Calendar sessions are in-app plans; external calendar sync, email reminders, password-reset email and email verification are not configured.
- Cloud sync requires an internet connection. New devices sign in to the same account. This release does not provide offline editing.

## Verification

Tests cover authentication, logout, origin restrictions, private note isolation, encryption, hidden keys, server-side grading and spaced-review ownership. Frontend and Worker builds are checked separately. Physical-device microphone behavior still depends on browser permissions and hardware.

# Canvas Pro + Still Notes

This integration was requested by the owner of the collaborating fork [KartBala07/canvas-pro](https://github.com/KartBala07/canvas-pro), forked from [Wizard24-24/canvas-pro](https://github.com/Wizard24-24/canvas-pro). Source reviewed at fork revision `f62e9a4865f0b3a7dbd49565e1b82dfdc91cec55`. The source fork did not contain a LICENSE file; this document credits the contributors and does not assign a new license to their work.

## What is integrated

The TypeScript domain engine in `lib/canvas/engine.ts` ports and adapts the course priority, grade, scheduling and curve concepts from the source app's `js/priorities.js`, `js/schedule.js`, grade/calculator modules and Canvas normalization. The local connector adapts the source app's local-server approach and explicit Ollama/OpenCode options. The responsive React coursework views are new and share Still Notes authentication, notes, calendar and themes.

| Area | Integrated behavior |
| --- | --- |
| Courses | Canvas sync through a local connector, JSON snapshot import/export and manual classes |
| Assignments | Class/search filters, due dates, priority scores, local completion and task-to-lesson import |
| Grades | Course scores, target grades and clearly labeled unweighted GPA estimates |
| Study plan | Seven-day plan with daily time limits and explicit unscheduled work |
| Announcements | Plain-text course messages with links back to Canvas |
| Curve calculator | Point additions and points needed for a target percentage |
| Local AI | Ollama or OpenCode generates organized notes, study sets and source-cited chat |

This is a feature port into Still Notes, not a replacement of the friend's repository or a merge of its unrelated git history. Canvas is read-only: checking off a task does not submit homework or change an official grade. School-specific GPA scales may differ. Snapshot imports preserve only recognized coursework fields and discard credentials/profile data. Existing snapshots are replaced only after a complete, validated import. Cloud snapshots use last-write-wins saving; reopen Classes to refresh after edits from another device.

## Pair a computer

1. In Settings → AI on this device, download the connector. Python 3 is required.
2. Run `python3 local-companion.py` on macOS or `py local-companion.py` on Windows. It binds only to `127.0.0.1:8766` and prints a random pairing code. Leave this terminal open.
3. Paste the code into Settings and choose **Save & pair**. The code is stored only in the current browser tab and cleared on sign-out.
4. For Ollama, start Ollama and select an installed model. **List installed models** queries that computer. The source app's `gemma4:e2b` model choice is preserved as a default; availability and hardware requirements depend on the user's installation. Choose another installed model if necessary.
5. For OpenCode, start `opencode serve --hostname 127.0.0.1 --port 4096` in a dedicated empty folder with a configuration that disables sharing (`"share": "disabled"`). Select `provider/model`, for example an Ollama-backed provider. If OpenCode uses basic authentication, provide the same `OPENCODE_SERVER_PASSWORD` environment variable to the connector; never put it in source files. OpenCode software runs locally, but a cloud-backed provider still sends text to its provider.

For a new Convex origin, start the connector with `STILL_NOTES_ORIGIN` set to that exact HTTPS origin. macOS: `STILL_NOTES_ORIGIN=https://YOUR-DEPLOYMENT.convex.site python3 local-companion.py`. PowerShell: set `$env:STILL_NOTES_ORIGIN='https://YOUR-DEPLOYMENT.convex.site'`, then `py local-companion.py`.

The connector checks Host, Origin and the pairing code, limits concurrent requests, refuses redirects, and uses fixed loopback model services. OpenCode sessions deny all tools, verify that the server retained the denial, refuse automatic sharing, and are deleted after each request. Model output still goes through the authenticated backend's structure and source-quote validation before saving. Selected local mode never silently falls back to a paid cloud provider.

Browsers may block website-to-localhost access or ask for local-network permission. Local AI requires the computer and connector to stay running; it does not run inside an iPhone browser. Tablets and phones can access synced notes and use a configured cloud provider. No real local model or physical-device session has been tested by this repository's automated tests.

## Canvas connection

Pair the connector, then open Classes → Connect Canvas. Enter the school's `https://SCHOOL.instructure.com` URL and a Canvas access token. The browser sends this credential to the paired local connector, which reads Canvas over HTTPS. The token is not uploaded to Still Notes, saved to disk, or placed in an export. The resulting coursework is stored in the signed-in user's private cloud account. Schools that restrict API tokens require manual coursework entry or an exported snapshot instead.

## Adaptive style and video corner

Gen Z mode is opt-in. It records message count, average length, casual/emoji frequency and at most five words from a fixed small slang vocabulary. It does not retain raw messages in that profile or retrain the model. Settings provides a reset. Accuracy and citation requirements remain unchanged.

The optional brainrot corner accepts HTTPS YouTube watch, short and share links. Videos load through `youtube-nocookie.com` only after user interaction, with native playback controls and a direct YouTube fallback link. Minimize unmounts and stops the player. Videos may be unavailable for embedding because of their owner's settings. YouTube receives playback requests; the study assistant itself has no browsing tools.

## Deployment status and remaining configuration

The Pages failure shown earlier was resolved when GitHub Pages was enabled. The subsequent Convex deploy failed at **Check deployment access** because the repository lacks `CONVEX_DEPLOY_KEY`; verification/build succeeded. Add a production deploy key in the repository's Actions secrets and run **Deploy Still Notes to Convex**. Connecting the Convex plugin alone does not supply that deployment credential. See [Convex setup](CONVEX.md) for the account-preserving transition mode.

Password-reset email requires a verified email sender and a Resend API key on the active backend. Local study AI does not replace Fish Audio transcription or its billing. Existing account and provider secrets must not be copied into git or rotated as part of this integration.

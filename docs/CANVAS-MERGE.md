# Canvas Pro + Still Notes

This integration was requested by the owner of the collaborating fork [KartBala07/canvas-pro](https://github.com/KartBala07/canvas-pro), forked from [Wizard24-24/canvas-pro](https://github.com/Wizard24-24/canvas-pro). Source reviewed at fork revision `f62e9a4865f0b3a7dbd49565e1b82dfdc91cec55`. The source fork did not contain a LICENSE file; this document credits the contributors and does not assign a new license to their work.

## What is integrated

The TypeScript domain engine in `lib/canvas/engine.ts` ports and adapts the course priority, grade, scheduling and curve concepts from the source app's `js/priorities.js`, `js/schedule.js`, grade/calculator modules and Canvas normalization. The local connector adapts the source app's local-server approach and explicit Ollama/OpenCode options. The responsive React coursework views are new and share Still Notes authentication, notes, calendar and themes.

| Area | Integrated behavior |
| --- | --- |
| Dashboard and coursework | Canvas course and To Do feed sync, deduplication, manual classes/tasks and snapshot import/export |
| Assignments and tests | Separate tests/quizzes, searchable ranked To Do, bulk app checklists, assignment-to-lesson import and effort logs |
| Late work | Recoverable-credit ranking using editable, explicitly confirmed syllabus late policies |
| Course workspace | Home, assignments, grade projections, modules, pages, files and syllabus |
| Documents | Canvas file/module fallback, image/PDF/audio/video preview, downloads, selectable-text PDF/DOCX imports and lesson creation |
| Grades | Current scores, targets, unweighted GPA, what-if assignment scores and weighted group/syllabus/points projections |
| Syllabus | Text/PDF/DOCX policy import; rule-based weight/late-policy detection; editable values requiring confirmation |
| Study plan | Seven days, time windows, daily limits, breaks, difficulty overrides, effort-based estimates and explicit unscheduled work; add a day's sessions to the calendar |
| Announcements | Search and unread filters, private read state, and an explicit action to mark read in Canvas |
| Curve calculator | Point additions, target score, class average, private history, JSON export and deletion |
| Coursework AI | Course-scoped multi-turn chat, exact-quote validation, data-based charts and checklist suggestions that require a click before applying |
| Submission | Live status, attempts and teacher comments; reviewed text, URL and file submissions; audio responses saved as uploadable files |
| Local AI | Paired Ollama and OpenCode, installed/connected model discovery, JSON connection tests, note organization, study generation and grounded chat |

This is a feature port into Still Notes. The friend's repository and its unrelated git history remain unchanged. App checklists and grade projections do not change official Canvas grades. The separate **Submit to Canvas** form sends work only after the user reviews it and confirms. Course-specific quiz, external-tool, annotation and Kaltura/media workflows open in Canvas; arbitrary media-service integration is not claimed. Standard audio/video files can be uploaded when an assignment accepts file submissions. School-specific GPA scales and dropped-assignment rules may differ from the displayed estimates.

The source's optional public Supabase curve/email feed is replaced with per-user private curve history to match the account-privacy requirement. Additional AI providers from the source app can be used through a configured OpenCode provider; that does not make cloud-backed models local. Private notes never become public just because the app allows public signup.

Snapshot imports preserve recognized coursework fields and deduplicated To Do items while discarding credentials/profile data. Invalid snapshots cannot overwrite the saved snapshot. Planning, document metadata and curve history sync privately in the cloud and are included in the full account JSON export; the Classes snapshot export contains coursework only. Saving uses last-write-wins; refresh Classes after changes on another device. Course binary files are fetched through the connector when opened; extracted lessons persist in the cloud. Signed file URLs and Canvas tokens are not saved in cloud document metadata.

## Pair a computer

1. In Settings → AI on this device, download the **version 2** connector and replace any earlier copy. Python 3 is required. Stop the earlier connector before starting this one.
2. Run `python3 local-companion.py` on macOS or `py local-companion.py` on Windows. It binds only to `127.0.0.1:8766` and prints a random pairing code. Leave this terminal open.
3. Paste the code into Settings and choose **Save & pair**. The code is stored only in the current browser tab and cleared on sign-out.
4. For Ollama, start Ollama and select an installed model. **List installed models** queries that computer. The source app's `gemma4:e2b` model choice is preserved as a default; availability and hardware requirements depend on the user's installation. Choose another installed model if necessary.
5. For OpenCode, start `opencode serve --hostname 127.0.0.1 --port 4096` in a dedicated empty folder with a configuration that disables sharing (`"share": "disabled"`). Use **Load OpenCode models** to select a connected `provider/model`, then **Test connection**. Connect the provider in OpenCode first. If OpenCode uses basic authentication, provide the same `OPENCODE_SERVER_PASSWORD` environment variable to the connector; never put it in source files. OpenCode software runs locally, but a cloud-backed provider still sends text to its provider.

For a new Convex origin, start the connector with `STILL_NOTES_ORIGIN` set to that exact HTTPS origin. macOS: `STILL_NOTES_ORIGIN=https://YOUR-DEPLOYMENT.convex.site python3 local-companion.py`. PowerShell: set `$env:STILL_NOTES_ORIGIN='https://YOUR-DEPLOYMENT.convex.site'`, then `py local-companion.py`.

The connector checks Host, Origin and the pairing code, limits concurrent requests and uses fixed loopback model services. Model/API redirects are refused. Canvas file transfers validate each HTTPS redirect and never send Canvas bearer tokens to object-storage hosts. OpenCode sessions deny all tools, verify that the server retained the denial, refuse automatic sharing, and are deleted after each request. Model output still goes through the authenticated backend's structure and source-quote validation before saving. Selected local mode never silently falls back to a paid cloud provider.

Browsers may block website-to-localhost access or ask for local-network permission. Local AI requires the computer and connector to stay running; it does not run inside an iPhone browser. Tablets and phones can access synced notes and use a configured cloud provider. No real local model or physical-device session has been tested by this repository's automated tests.

## Canvas connection

Pair the connector, then open Classes → Connect Canvas. Enter the school's `https://SCHOOL.instructure.com` URL and a Canvas access token. The browser sends this credential to the paired local connector, which calls Canvas over HTTPS. The connector retains it only in memory for a two-hour local session; **Disconnect** or stopping the connector clears that session. Only a random session ID is kept in the browser tab. The token is not uploaded to Still Notes, saved to disk, or placed in an export. The resulting coursework is stored in the signed-in user's private cloud account. Schools that restrict API tokens require manual coursework entry or an exported snapshot instead.

## OpenRouter repair

Connection tests now allow 1,024 output tokens instead of 64, recognize HTTP-200 error bodies and refuse empty, truncated or invalid model output. OpenRouter requests ask for compatible JSON routing with low reasoning effort. If the selected route rejects JSON-format parameters, Still Notes retries once with those optional parameters omitted and the same model. It never relaxes account privacy policies or silently switches to a paid model. The test reports the actual routed model. Quota, credits, privacy restrictions and unavailable endpoints are shown with actionable errors. An actual successful call still requires the user's valid key and available provider capacity.

## Adaptive style and video corner

Gen Z mode is opt-in. It records message count, average length, casual/emoji frequency and at most five words from a fixed small slang vocabulary. It does not retain raw messages in that profile or retrain the model. Settings provides a reset. Accuracy and citation requirements remain unchanged.

The optional brainrot corner accepts HTTPS YouTube watch, short and share links. Videos load through `youtube-nocookie.com` only after user interaction, with native playback controls and a direct YouTube fallback link. Minimize unmounts and stops the player. Videos may be unavailable for embedding because of their owner's settings. YouTube receives playback requests; the study assistant itself has no browsing tools.

## Deployment status and remaining configuration

The Pages failure shown earlier was resolved when GitHub Pages was enabled. The subsequent Convex deploy failed at **Check deployment access** because the repository lacks `CONVEX_DEPLOY_KEY`; verification/build succeeded. Add a production deploy key in the repository's Actions secrets and run **Deploy Still Notes to Convex**. Connecting the Convex plugin alone does not supply that deployment credential. See [Convex setup](CONVEX.md) for the account-preserving transition mode.

Password-reset email requires a verified email sender and a Resend API key on the active backend. Local study AI does not replace Fish Audio transcription or its billing. Existing account and provider secrets must not be copied into git or rotated as part of this integration.

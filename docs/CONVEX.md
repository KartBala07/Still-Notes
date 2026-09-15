# Convex hosting

The frontend is packaged into Convex HTTP actions, so the whole UI opens at the deployment's `https://…convex.site` address. No GitHub Pages build is needed for that address. GitHub continues to store the source and run deployment checks.

## Deploy

Before publishing the new frontend in transition mode, deploy this branch’s updated shared backend and D1 migration to the existing Worker host. Configure its email sender there. Otherwise the existing backend will not recognize the new reset or AI test/model routes.

1. Link this project with `npm run dev:convex`. Sign in to the intended Convex team and choose the Still Notes project. This deploys to a development environment.
2. Create a **production deploy key** in the Convex dashboard. Put it in GitHub **Settings → Secrets and variables → Actions → New repository secret**, named `CONVEX_DEPLOY_KEY`. Do not commit the key or paste it into chat.
3. Merge the Convex migration branch, then run **Deploy Still Notes to Convex** in Actions. It builds the same frontend, checks types and tests both backend implementations, and runs `convex deploy`.
4. Open the **HTTP Actions URL** from Convex **Settings → URL & Deploy Key**. Use the `.convex.site` URL, not `.convex.cloud` (the latter is the client/database API origin).
5. Verify sign-in, existing lessons, a new saved lesson, PDF import and microphone permissions at the new URL. Only retire GitHub Pages after these checks pass.

Alternatively, after signing in locally, run `npm run deploy:convex`. This still hosts the app in Convex's cloud, not on the computer running the deploy command.

## Account continuity

**The default is transition mode.** The frontend and HTTP routing run on Convex; authenticated API requests are forwarded over HTTPS to the existing Still Notes backend. Accounts, notes, encrypted provider keys and recordings therefore remain in their existing cloud database. No password reset, empty replacement account or API-key copy is needed for the initial address change. This is not yet a database migration.

The destination is fixed in server code, redirects are rejected, third-party browser origins are denied and only the required credential/content headers are forwarded. The session cookie is returned as HttpOnly and Secure under the Convex address. Private responses are never cached. The existing backend must remain running during this phase; its rate limits and availability still apply.

A native Convex backend is also included and tested. It uses Convex tables for users, hashed sessions, encrypted provider keys, lessons, study sets, attempts and calendar events, plus Convex file storage for recordings. Data functions are all internal; browser access goes through the authenticated HTTP API. Per-user ownership is checked before reads or writes, including inside item mutations.

**Do not set `BACKEND_MODE=convex` for existing users until their data is transferred and verified.** That setting changes the active database. A safe transfer requires a maintenance window, private export of the old accounts/items/recordings, preservation of user IDs and password hashes, and either the original `APP_ENCRYPTION_KEY` or re-encryption of provider keys in the source runtime. Sessions should be invalidated during the transfer, then users sign in again. Verify record counts, file access and two-account isolation before cutover. Never put exports, passwords, keys or recordings in GitHub.

For a fresh empty Convex deployment only: set `APP_ENCRYPTION_KEY` to a securely generated secret of at least 32 characters, optionally set `OWNER_BOOTSTRAP`, and set `BACKEND_MODE=convex`. Native signup requires configured encryption. Do not rotate the encryption secret after storing keys unless those keys are re-encrypted.

## Local checks

```sh
npm ci
npm run build:convex
npm run typecheck
npm test
npm run test:convex
```

The build creates `lib/convex-web-assets.js` (ignored by Git) from public frontend assets only. Its declaration is committed for type checking. No runtime secrets or user data are bundled. Hash-named assets are cached; the app shell revalidates. Unknown paths return 404. The build rejects assets/bundles that would exceed conservative Convex size limits.

The native backend tests use `convex-test`; they are not a substitute for checking the deployed Convex runtime and real devices. The existing Worker tests continue to cover backward compatibility.

Convex references: [HTTP actions](https://docs.convex.dev/functions/http-actions), [runtimes](https://docs.convex.dev/functions/runtimes), [deployment limits](https://docs.convex.dev/production/state/limits).

Native Convex queries page through items in batches of eight; mutations use indexed lookups and bounded cleanup. Password changes advance an account session version to invalidate all older sessions/reset tokens atomically, without scanning an unbounded table. The current whole-library API has a 16 MiB response safeguard; larger libraries need a paged client before cutover.

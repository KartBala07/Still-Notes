import type { GenericActionCtx, GenericDataModel } from "convex/server";
type ActionCtx = GenericActionCtx<GenericDataModel>;
import { internal } from "./_generated/api";
import type { StoredItem, BackendRuntime } from "../lib/backend-store";
export function convexRuntime(ctx: ActionCtx): BackendRuntime {
  const d = internal.database;
  return {
    encryptionKey: process.env.APP_ENCRYPTION_KEY || "",
    ownerBootstrap: process.env.OWNER_BOOTSTRAP,
    email:
      process.env.RESEND_API_KEY &&
      process.env.AUTH_EMAIL_FROM &&
      process.env.PUBLIC_APP_URL
        ? {
            apiKey: process.env.RESEND_API_KEY,
            from: process.env.AUTH_EMAIL_FROM,
            appUrl: process.env.PUBLIC_APP_URL,
          }
        : undefined,
    store: {
      accountByEmail: (email) => ctx.runQuery(d.accountByEmail, { email }),
      accountById: (id) => ctx.runQuery(d.accountById, { id }),
      createAccount: (account) => ctx.runMutation(d.createAccount, { account }),
      accountForSession: (hash, now) =>
        ctx.runQuery(d.accountForSession, { hash, now }),
      createSession: (hash, user, expires, expectedPassword) =>
        ctx.runMutation(d.createSession, {
          hash,
          user,
          expires,
          expectedPassword,
        }),
      deleteSession: (hash) => ctx.runMutation(d.deleteSession, { hash }),
      changePassword: (user, password) =>
        ctx.runMutation(d.changePassword, { user, password }),
      updateSettings: (user, settings, keys) =>
        ctx.runMutation(d.updateSettings, { user, settings, keys }),
      listItems: async (user) => {
        const items: StoredItem[] = [];
        let cursor: string | null = null;
        let bytes = 0;
        for (;;) {
          const result: {
            page: StoredItem[];
            isDone: boolean;
            continueCursor: string;
          } = await ctx.runQuery(d.listItems, {
            user,
            paginationOpts: { numItems: 8, cursor },
          });
          for (const item of result.page) {
            bytes += new TextEncoder().encode(item.data).length;
            if (bytes > 16 * 1024 * 1024)
              throw new Error(
                "This library exceeds the current export limit. Please contact support.",
              );
            items.push(item);
          }
          if (result.isDone) return items;
          cursor = result.continueCursor;
        }
      },
      getItem: (user, kind, id) => ctx.runQuery(d.getItem, { user, kind, id }),
      putItem: (item) => ctx.runMutation(d.putItem, { item }),
      deleteItem: (user, id, kind) =>
        ctx.runMutation(d.deleteItem, { user, id, ...(kind ? { kind } : {}) }),
      getAsset: (user, id) => ctx.runQuery(d.getAsset, { user, id }),
      putAsset: (asset) => ctx.runMutation(d.putAsset, { asset }),
      deleteAsset: (user, id) => ctx.runMutation(d.deleteAsset, { user, id }),
      incrementRate: (id, expires) =>
        ctx.runMutation(d.incrementRate, { id, expires }),
      pruneLimits: (now) => ctx.runMutation(d.pruneLimits, { now }),
      createReset: (hash, user, expires) =>
        ctx.runMutation(d.createReset, { hash, user, expires }),
      consumeReset: (hash, password, now) =>
        ctx.runMutation(d.consumeReset, { hash, password, now }),
    },
    blobs: {
      put: async (key, blob) => {
        const storageId = await ctx.storage.store(blob);
        try {
          await ctx.runMutation(d.putBlob, { key, storageId });
        } catch (error) {
          await ctx.storage.delete(storageId);
          throw error;
        }
      },
      get: async (key) => {
        const ref = await ctx.runQuery(d.getBlob, { key });
        return ref ? ctx.storage.get(ref.storageId) : null;
      },
      delete: (key) => ctx.runMutation(d.deleteBlob, { key }),
    },
  };
}

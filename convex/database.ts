import { internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { accountFields, itemFields, assetFields } from "./schema";

const accountDoc = v.object({
  ...accountFields,
  _id: v.id("users"),
  _creationTime: v.number(),
});
const itemDoc = v.object({
  ...itemFields,
  _id: v.id("items"),
  _creationTime: v.number(),
});
const assetDoc = v.object({
  ...assetFields,
  _id: v.id("assets"),
  _creationTime: v.number(),
});
const blobDoc = v.object({
  key: v.string(),
  storageId: v.id("_storage"),
  _id: v.id("blobs"),
  _creationTime: v.number(),
});
// User/item UUIDs are stable external IDs retained for the existing account migration.
// Native document references (including storage) use v.id.
// No public queries or mutations: all browser access goes through authenticated HTTP routes.
export const accountByEmail = internalQuery({
  returns: v.union(v.null(), accountDoc),
  args: { email: v.string() },
  handler: (ctx, { email }) =>
    ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique(),
});
export const accountById = internalQuery({
  returns: v.union(v.null(), accountDoc),
  args: { id: v.string() },
  handler: (ctx, { id }) =>
    ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", id))
      .unique(),
});
export const createAccount = internalMutation({
  returns: v.boolean(),
  args: { account: v.object(accountFields) },
  handler: async (ctx, { account }) => {
    if (
      await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", account.email))
        .unique()
    )
      return false;
    if (
      await ctx.db
        .query("users")
        .withIndex("by_external_id", (q) => q.eq("id", account.id))
        .unique()
    )
      throw new Error("Account ID collision");
    await ctx.db.insert("users", account);
    return true;
  },
});
export const accountForSession = internalQuery({
  returns: v.union(v.null(), accountDoc),
  args: { hash: v.string(), now: v.number() },
  handler: async (ctx, { hash, now }) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!s || s.expires <= now) return null;
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", s.user))
      .unique();
    return u && (s.authVersion || 0) === (u.authVersion || 0) ? u : null;
  },
});
export const createSession = internalMutation({
  returns: v.boolean(),
  args: {
    hash: v.string(),
    user: v.string(),
    expires: v.number(),
    expectedPassword: v.string(),
  },
  handler: async (ctx, { expectedPassword, ...session }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", session.user))
      .unique();
    if (!u || u.password !== expectedPassword) return false;
    await ctx.db.insert("sessions", {
      ...session,
      authVersion: u.authVersion || 0,
    });
    return true;
  },
});
export const deleteSession = internalMutation({
  returns: v.null(),
  args: { hash: v.string() },
  handler: async (ctx, { hash }) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (s) await ctx.db.delete(s._id);
    return null;
  },
});
export const changePassword = internalMutation({
  returns: v.null(),
  args: { user: v.string(), password: v.string() },
  handler: async (ctx, { user, password }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", user))
      .unique();
    if (!u) throw new Error("Account missing");
    await ctx.db.patch(u._id, {
      password,
      authVersion: (u.authVersion || 0) + 1,
    });
    return null;
  },
});
export const updateSettings = internalMutation({
  returns: v.null(),
  args: { user: v.string(), settings: v.string(), keys: v.string() },
  handler: async (ctx, { user, settings, keys }) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", user))
      .unique();
    if (!u) throw new Error("Account missing");
    await ctx.db.patch(u._id, { settings, keys });
    return null;
  },
});
export const listItems = internalQuery({
  returns: paginationResultValidator(itemDoc),
  args: { user: v.string(), paginationOpts: paginationOptsValidator },
  handler: (ctx, { user, paginationOpts }) =>
    ctx.db
      .query("items")
      .withIndex("by_user_updated", (q) => q.eq("user", user))
      .order("desc")
      .paginate({
        ...paginationOpts,
        numItems: Math.min(paginationOpts.numItems, 8),
      }),
});
export const getItem = internalQuery({
  returns: v.union(v.null(), itemDoc),
  args: { user: v.string(), kind: v.string(), id: v.string() },
  handler: (ctx, { user, kind, id }) =>
    ctx.db
      .query("items")
      .withIndex("by_user_kind_id", (q) =>
        q.eq("user", user).eq("kind", kind).eq("id", id),
      )
      .unique(),
});
export const putItem = internalMutation({
  returns: v.null(),
  args: { item: v.object(itemFields) },
  handler: async (ctx, { item }) => {
    if (new TextEncoder().encode(item.data).length > 900000)
      throw new Error("Item is too large");
    const old = await ctx.db
      .query("items")
      .withIndex("by_external_id", (q) => q.eq("id", item.id))
      .unique();
    if (old) {
      if (old.user !== item.user || old.kind !== item.kind)
        throw new Error("Item ownership mismatch");
      await ctx.db.patch(old._id, { data: item.data, updated: item.updated });
    } else await ctx.db.insert("items", item);
    return null;
  },
});
export const deleteItem = internalMutation({
  returns: v.null(),
  args: { user: v.string(), id: v.string(), kind: v.optional(v.string()) },
  handler: async (ctx, { user, id, kind }) => {
    const old = await ctx.db
      .query("items")
      .withIndex("by_external_id", (q) => q.eq("id", id))
      .unique();
    if (old && old.user === user && (!kind || old.kind === kind))
      await ctx.db.delete(old._id);
    return null;
  },
});
export const getAsset = internalQuery({
  returns: v.union(v.null(), assetDoc),
  args: { user: v.string(), id: v.string() },
  handler: (ctx, { user, id }) =>
    ctx.db
      .query("assets")
      .withIndex("by_user_id", (q) => q.eq("user", user).eq("id", id))
      .unique(),
});
export const putAsset = internalMutation({
  returns: v.null(),
  args: { asset: v.object(assetFields) },
  handler: async (ctx, { asset }) => {
    await ctx.db.insert("assets", asset);
    return null;
  },
});
export const deleteAsset = internalMutation({
  returns: v.null(),
  args: { user: v.string(), id: v.string() },
  handler: async (ctx, { user, id }) => {
    const a = await ctx.db
      .query("assets")
      .withIndex("by_user_id", (q) => q.eq("user", user).eq("id", id))
      .unique();
    if (a) await ctx.db.delete(a._id);
    return null;
  },
});
export const incrementRate = internalMutation({
  returns: v.number(),
  args: { id: v.string(), expires: v.number() },
  handler: async (ctx, { id, expires }) => {
    const old = await ctx.db
      .query("limits")
      .withIndex("by_external_id", (q) => q.eq("id", id))
      .unique();
    const count = (old?.count || 0) + 1;
    if (old) await ctx.db.patch(old._id, { count });
    else await ctx.db.insert("limits", { id, count, expires });
    return count;
  },
});
export const pruneLimits = internalMutation({
  returns: v.null(),
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    for (const r of await ctx.db
      .query("limits")
      .withIndex("by_expiry", (q) => q.lt("expires", now))
      .take(100))
      await ctx.db.delete(r._id);
    for (const s of await ctx.db
      .query("sessions")
      .withIndex("by_expiry", (q) => q.lt("expires", now))
      .take(100))
      await ctx.db.delete(s._id);
    for (const r of await ctx.db
      .query("resets")
      .withIndex("by_expiry", (q) => q.lt("expires", now))
      .take(100))
      await ctx.db.delete(r._id);
    return null;
  },
});
export const getBlob = internalQuery({
  returns: v.union(v.null(), blobDoc),
  args: { key: v.string() },
  handler: (ctx, { key }) =>
    ctx.db
      .query("blobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique(),
});
export const putBlob = internalMutation({
  returns: v.null(),
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const old = await ctx.db
      .query("blobs")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (old) throw new Error("Upload already exists");
    await ctx.db.insert("blobs", args);
    return null;
  },
});
export const deleteBlob = internalMutation({
  returns: v.null(),
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const old = await ctx.db
      .query("blobs")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (old) {
      await ctx.storage.delete(old.storageId);
      await ctx.db.delete(old._id);
    }
    return null;
  },
});
export const createReset = internalMutation({
  returns: v.null(),
  args: { hash: v.string(), user: v.string(), expires: v.number() },
  handler: async (ctx, args) => {
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", args.user))
      .unique();
    if (!u) throw new Error("Account missing");
    await ctx.db.insert("resets", {
      ...args,
      used: false,
      authVersion: u.authVersion || 0,
    });
    return null;
  },
});
export const consumeReset = internalMutation({
  returns: v.boolean(),
  args: { hash: v.string(), password: v.string(), now: v.number() },
  handler: async (ctx, { hash, password, now }) => {
    const reset = await ctx.db
      .query("resets")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!reset || reset.used || reset.expires <= now) return false;
    const u = await ctx.db
      .query("users")
      .withIndex("by_external_id", (q) => q.eq("id", reset.user))
      .unique();
    if (!u || (reset.authVersion || 0) !== (u.authVersion || 0)) return false;
    await ctx.db.patch(u._id, {
      password,
      authVersion: (u.authVersion || 0) + 1,
    });
    await ctx.db.patch(reset._id, { used: true });
    return true;
  },
});

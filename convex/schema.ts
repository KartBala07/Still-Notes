import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export const accountFields = {
  id: v.string(),
  email: v.string(),
  name: v.string(),
  password: v.string(),
  settings: v.string(),
  keys: v.string(),
  created: v.number(),
  authVersion: v.optional(v.number()),
};
export const itemFields = {
  id: v.string(),
  user: v.string(),
  kind: v.string(),
  data: v.string(),
  updated: v.number(),
};
export const assetFields = {
  id: v.string(),
  user: v.string(),
  name: v.string(),
  type: v.string(),
  size: v.number(),
};
export default defineSchema({
  users: defineTable(accountFields)
    .index("by_email", ["email"])
    .index("by_external_id", ["id"]),
  sessions: defineTable({
    hash: v.string(),
    user: v.string(),
    expires: v.number(),
    authVersion: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_user", ["user"])
    .index("by_expiry", ["expires"]),
  items: defineTable(itemFields)
    .index("by_external_id", ["id"])
    .index("by_user_updated", ["user", "updated"])
    .index("by_user_kind_id", ["user", "kind", "id"]),
  assets: defineTable(assetFields).index("by_user_id", ["user", "id"]),
  blobs: defineTable({ key: v.string(), storageId: v.id("_storage") }).index(
    "by_key",
    ["key"],
  ),
  resets: defineTable({
    hash: v.string(),
    user: v.string(),
    expires: v.number(),
    used: v.boolean(),
    authVersion: v.optional(v.number()),
  })
    .index("by_hash", ["hash"])
    .index("by_user", ["user"])
    .index("by_expiry", ["expires"]),
  limits: defineTable({
    id: v.string(),
    count: v.number(),
    expires: v.number(),
  })
    .index("by_external_id", ["id"])
    .index("by_expiry", ["expires"]),
});

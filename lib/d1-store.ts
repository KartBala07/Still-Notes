import type { Account, AdminStat, BackendStore, StoredItem, Asset } from "./backend-store";

/** Existing cloud backend remains compatible while the Convex deployment is prepared. */
export function d1Store(db: D1Database): BackendStore {
  const get = async <T>(sql: string, ...args: unknown[]) =>
    db
      .prepare(sql)
      .bind(...args)
      .first<T>();
  const run = async (sql: string, ...args: unknown[]) => {
    await db
      .prepare(sql)
      .bind(...args)
      .run();
  };
  return {
    accountByEmail: (email) =>
      get<Account>("SELECT * FROM users WHERE email=?", email),
    accountById: (id) => get<Account>("SELECT * FROM users WHERE id=?", id),
    createAccount: async (u) =>
      !!(await get(
        "INSERT INTO users (id,email,name,password,settings,keys,created) VALUES (?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id",
        u.id,
        u.email,
        u.name,
        u.password,
        u.settings,
        u.keys,
        u.created,
      )),
    accountForSession: (hash, now) =>
      get<Account>(
        "SELECT users.* FROM users JOIN sessions ON sessions.user=users.id WHERE sessions.hash=? AND sessions.expires>?",
        hash,
        now,
      ),
    createSession: async (hash, user, expires, expectedPassword) =>
      !!(await get(
        "INSERT INTO sessions (hash,user,expires) SELECT ?,id,? FROM users WHERE id=? AND password=? RETURNING hash",
        hash,
        expires,
        user,
        expectedPassword,
      )),
    deleteSession: (hash) => run("DELETE FROM sessions WHERE hash=?", hash),
    changePassword: async (user, password) => {
      await db.batch([
        db
          .prepare("UPDATE users SET password=? WHERE id=?")
          .bind(password, user),
        db.prepare("DELETE FROM sessions WHERE user=?").bind(user),
        db.prepare("UPDATE password_resets SET used=1 WHERE user=?").bind(user),
      ]);
    },
    updateSettings: (user, settings, keys) =>
      run(
        "UPDATE users SET settings=?,keys=? WHERE id=?",
        settings,
        keys,
        user,
      ),
    listItems: async (user) =>
      (
        await db
          .prepare("SELECT * FROM items WHERE user=? ORDER BY updated DESC")
          .bind(user)
          .all<StoredItem>()
      ).results,
    getItem: (user, kind, id) =>
      get<StoredItem>(
        "SELECT * FROM items WHERE user=? AND kind=? AND id=?",
        user,
        kind,
        id,
      ),
    putItem: (i) =>
      run(
        "INSERT INTO items (id,user,kind,data,updated) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated=excluded.updated WHERE items.user=excluded.user AND items.kind=excluded.kind",
        i.id,
        i.user,
        i.kind,
        i.data,
        i.updated,
      ),
    deleteItem: (user, id, kind) =>
      kind
        ? run(
            "DELETE FROM items WHERE user=? AND id=? AND kind=?",
            user,
            id,
            kind,
          )
        : run("DELETE FROM items WHERE user=? AND id=?", user, id),
    getAsset: (user, id) =>
      get<Asset>("SELECT * FROM assets WHERE user=? AND id=?", user, id),
    putAsset: (a) =>
      run(
        "INSERT INTO assets (id,user,name,type,size) VALUES (?,?,?,?,?)",
        a.id,
        a.user,
        a.name,
        a.type,
        a.size,
      ),
    deleteAsset: (user, id) =>
      run("DELETE FROM assets WHERE user=? AND id=?", user, id),
    incrementRate: async (id, expires) =>
      (await get<{ count: number }>(
        "INSERT INTO limits (id,count,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
        id,
        expires,
      ))!.count,
    pruneLimits: (now) => run("DELETE FROM limits WHERE expires<?", now),
    createReset: (hash, user, expires) =>
      run(
        "INSERT INTO password_resets (hash,user,expires,used) VALUES (?,?,?,0)",
        hash,
        user,
        expires,
      ),
    consumeReset: async (hash, password, now) => {
      const result = await db.batch([
        db
          .prepare(
            "UPDATE users SET password=? WHERE id=(SELECT user FROM password_resets WHERE hash=? AND expires>? AND used=0)",
          )
          .bind(password, hash, now),
        db
          .prepare(
            "DELETE FROM sessions WHERE user=(SELECT user FROM password_resets WHERE hash=? AND expires>? AND used=0)",
          )
          .bind(hash, now),
        db
          .prepare(
            "UPDATE password_resets SET used=1 WHERE user=(SELECT user FROM password_resets WHERE hash=? AND expires>? AND used=0)",
          )
          .bind(hash, now),
      ]);
      return result[0].meta.changes === 1;
    },
    // Developer console. Passwords and keys are never selected here.
    listAccounts: async () =>
      (
        await db
          .prepare(
            "SELECT id,email,name,settings,created,suspended FROM users ORDER BY created DESC",
          )
          .all<Account>()
      ).results,
    adminStats: async () => {
      const stats: Record<string, AdminStat> = {};
      const ensure = (user: string) =>
        (stats[user] ||= {
          notes: 0,
          decks: 0,
          attempts: 0,
          events: 0,
          assets: 0,
          bytes: 0,
        });
      const items = (
        await db
          .prepare("SELECT user,kind,COUNT(*) AS c FROM items GROUP BY user,kind")
          .all<{ user: string; kind: string; c: number }>()
      ).results;
      for (const row of items) {
        const stat = ensure(row.user);
        if (row.kind === "notes") stat.notes = row.c;
        else if (row.kind === "decks") stat.decks = row.c;
        else if (row.kind === "attempts") stat.attempts = row.c;
        else if (row.kind === "events") stat.events = row.c;
      }
      const assets = (
        await db
          .prepare(
            "SELECT user,COUNT(*) AS c,COALESCE(SUM(size),0) AS bytes FROM assets GROUP BY user",
          )
          .all<{ user: string; c: number; bytes: number }>()
      ).results;
      for (const row of assets) {
        const stat = ensure(row.user);
        stat.assets = row.c;
        stat.bytes = row.bytes;
      }
      return stats;
    },
    adminSetPassword: async (user, password) => {
      await db.batch([
        db.prepare("UPDATE users SET password=? WHERE id=?").bind(password, user),
        db.prepare("DELETE FROM sessions WHERE user=?").bind(user),
        db.prepare("UPDATE password_resets SET used=1 WHERE user=?").bind(user),
      ]);
    },
    adminSetSuspended: async (user, suspended) => {
      const statements = [
        db
          .prepare("UPDATE users SET suspended=? WHERE id=?")
          .bind(suspended ? 1 : 0, user),
      ];
      if (suspended)
        statements.push(db.prepare("DELETE FROM sessions WHERE user=?").bind(user));
      await db.batch(statements);
    },
    adminDeleteAccount: (user) => run("DELETE FROM users WHERE id=?", user),
  };
}

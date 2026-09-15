export type Account = {
  id: string;
  email: string;
  name: string;
  password: string;
  settings: string;
  keys: string;
  created: number;
};
export type StoredItem = {
  id: string;
  user: string;
  kind: string;
  data: string;
  updated: number;
};
export type Asset = {
  id: string;
  user: string;
  name: string;
  type: string;
  size: number;
};

/** Only trusted server code receives this interface. User IDs come from verified sessions. */
export interface BackendStore {
  accountByEmail(email: string): Promise<Account | null>;
  accountById(id: string): Promise<Account | null>;
  createAccount(account: Account): Promise<boolean>;
  accountForSession(hash: string, now: number): Promise<Account | null>;
  createSession(
    hash: string,
    user: string,
    expires: number,
    expectedPassword: string,
  ): Promise<boolean>;
  deleteSession(hash: string): Promise<void | null>;
  changePassword(user: string, password: string): Promise<void | null>;
  updateSettings(
    user: string,
    settings: string,
    keys: string,
  ): Promise<void | null>;
  listItems(user: string): Promise<StoredItem[]>;
  getItem(user: string, kind: string, id: string): Promise<StoredItem | null>;
  putItem(item: StoredItem): Promise<void | null>;
  deleteItem(user: string, id: string, kind?: string): Promise<void | null>;
  getAsset(user: string, id: string): Promise<Asset | null>;
  putAsset(asset: Asset): Promise<void | null>;
  deleteAsset(user: string, id: string): Promise<void | null>;
  incrementRate(id: string, expires: number): Promise<number>;
  pruneLimits(now: number): Promise<void | null>;
  createReset(
    hash: string,
    user: string,
    expires: number,
  ): Promise<void | null>;
  consumeReset(hash: string, password: string, now: number): Promise<boolean>;
}
export interface BlobStore {
  put(key: string, blob: Blob): Promise<void | null>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void | null>;
}
export type BackendRuntime = {
  store: BackendStore;
  blobs: BlobStore;
  encryptionKey: string;
  ownerBootstrap?: string;
  email?: { apiKey: string; from: string; appUrl: string };
  /** Cloudflare supplies a trusted IP header; Convex uses per-account limits. */
  trustedClientIp?: (request: Request) => string | null;
};

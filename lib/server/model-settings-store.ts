import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { ModelFields, ModelKind } from "../ai/model-settings";

export type StoredModel = ModelFields & { key: string; revision: number };
const COOKIE = "xiantu_models";
export function modelIdentity(request: Request, create = false) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  const existing = token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
  const value = existing ?? (create ? randomBytes(32).toString("hex") : undefined);
  return {
    id: value ? createHash("sha256").update(value).digest("hex") : null,
    cookie:
      !existing && value
        ? `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=31536000${request.headers.get("origin")?.startsWith("https://") ? "; Secure" : ""}`
        : null,
  };
}
const queues = new Map<string, Promise<unknown>>();
/** Single Node service storage. Only opaque browser credentials leave the server.
 * Files contain private keys; the whole directory is excluded from Git and public assets.
 */
export class ModelSettingsStore {
  constructor(
    private directory = process.env.XIANTU_AI_SETTINGS_DIR || ".xiantu-private/ai-settings",
  ) {}
  private filename(id: string, kind: ModelKind) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid settings identity");
    return path.resolve(this.directory, `${id}-${kind}.json`);
  }
  async read(id: string | null, kind: ModelKind): Promise<StoredModel | undefined> {
    if (!id) return undefined;
    try {
      return JSON.parse(await readFile(this.filename(id, kind), "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
  async save(id: string, kind: ModelKind, config: Omit<StoredModel, "revision">, revision: number) {
    const filename = this.filename(id, kind);
    const previous = queues.get(filename) ?? Promise.resolve();
    const operation = previous
      .catch(() => {})
      .then(async () => {
        const current = await this.read(id, kind);
        if ((current?.revision ?? 0) !== revision) throw new SettingsConflict();
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
        const temporary = `${filename}.${randomUUID()}.tmp`;
        const updated = { ...config, revision: revision + 1 };
        try {
          await writeFile(temporary, JSON.stringify(updated), { mode: 0o600, flag: "wx" });
          await rename(temporary, filename);
        } finally {
          await unlink(temporary).catch(() => {});
        }
        return updated;
      });
    queues.set(filename, operation);
    try {
      return await operation;
    } finally {
      if (queues.get(filename) === operation) queues.delete(filename);
    }
  }
}
export class SettingsConflict extends Error {}

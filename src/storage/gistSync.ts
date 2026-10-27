import { validate } from "../lib/data";
import type { AppData } from "../types";

// Cloud sync through a private GitHub gist. IndexedDB stays the source of truth: the gist only
// holds a snapshot that the user pushes (Save) or pulls (Load) by hand, so devices can trade data.
//
// NOTE (size limit): the snapshot is a single treatcode.json for now, which assumes it stays small.
// The gist API returns up to 1 MB of each file inline; past that the file comes back `truncated`
// and raw_url serves it, but only up to 10 MB. Beyond 10 MB the only way to read the file is a
// `git clone` of the gist, which a browser can't do, so Load would break.
// Planned fix, if saves ever get that big:
//   - Split the compact JSON into treatcode.part-000.json … part-NNN.json (≤ ~900 KB each, so every
//     part comes back inline) plus treatcode.manifest.json = { format, parts, bytes, sha256, savedAt }.
//   - Save writes every part and the manifest in one PATCH, setting leftover parts from a larger
//     earlier save to null so GitHub deletes them.
//   - Load joins the parts, checks bytes and sha256 (crypto.subtle.digest), then runs validate().
//   - Keep reading a lone treatcode.json as a fallback so gists saved by this version still load.

export interface SyncConfig {
  token: string;
  gistId?: string;
  // The gist's updated_at as of this device's last Save or Load; a different value on the
  // server means another device saved since.
  remoteUpdatedAt?: string;
  bytes?: number;
  // Local changes not yet saved to the cloud.
  dirty: boolean;
}
// Per-device (it holds the token), so it lives in localStorage rather than the exported AppData.
const KEY = "treatcode-sync";

export function loadSync(): SyncConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return value && typeof value.token === "string" ? value : null;
  } catch {
    return null;
  }
}
export function storeSync(config: SyncConfig | null) {
  try {
    if (config) localStorage.setItem(KEY, JSON.stringify(config));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the connection lasts for this visit only.
  }
}

const API = "https://api.github.com";
const FILE = "treatcode.json";
interface GistFile {
  content?: string;
  truncated?: boolean;
  raw_url?: string;
}
interface Gist {
  id: string;
  updated_at: string;
  files: Record<string, GistFile>;
}
export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch {
    throw new SyncError("Couldn't reach GitHub. Check your connection.");
  }
  if (res.status === 401) throw new SyncError("GitHub rejected the token. It may be wrong or expired.", 401);
  if (res.status === 403 || res.status === 404)
    throw new SyncError(
      "The token can't reach the cloud copy. Check it has gist access, or the gist was deleted.",
      res.status,
    );
  if (!res.ok) throw new SyncError(`GitHub returned an error (${res.status}).`, res.status);
  return res.json();
}

// A new device knows only the token, so it finds the gist by its file name.
export async function findGist(token: string): Promise<{ id: string; updatedAt: string } | null> {
  for (let page = 1; ; page++) {
    const gists = await request<Gist[]>(token, `/gists?per_page=100&page=${page}`);
    const gist = gists.find((g) => FILE in g.files);
    if (gist) return { id: gist.id, updatedAt: gist.updated_at };
    if (gists.length < 100) return null;
  }
}

export async function remoteUpdatedAt(token: string, gistId: string) {
  return (await request<Gist>(token, `/gists/${gistId}`)).updated_at;
}

// See NOTE (size limit): raw_url covers files over 1 MB, but only up to 10 MB.
export async function pullGist(token: string, gistId: string) {
  const gist = await request<Gist>(token, `/gists/${gistId}`);
  const file = gist.files[FILE];
  if (!file) throw new SyncError(`The gist has no ${FILE}.`, 404);
  let text = file.content ?? "";
  if (file.truncated && file.raw_url) {
    // No auth header: the secret raw URL is enough, and a custom header would need a CORS preflight.
    const res = await fetch(file.raw_url).catch(() => null);
    if (!res?.ok) throw new SyncError("Couldn't download the cloud copy.");
    text = await res.text();
  }
  let data: AppData;
  try {
    data = validate(JSON.parse(text));
  } catch {
    throw new SyncError("The cloud copy isn't valid TreatCode data.");
  }
  return { data, updatedAt: gist.updated_at, bytes: byteLength(text) };
}

// See NOTE (size limit): this is where the snapshot would be split into parts.
export async function pushGist(token: string, gistId: string | undefined, data: AppData) {
  const content = JSON.stringify(data);
  const files = { [FILE]: { content } };
  const gist = gistId
    ? await request<Gist>(token, `/gists/${gistId}`, { method: "PATCH", body: JSON.stringify({ files }) })
    : await request<Gist>(token, "/gists", {
        method: "POST",
        body: JSON.stringify({ description: "TreatCode sync", public: false, files }),
      });
  return { gistId: gist.id, updatedAt: gist.updated_at, bytes: byteLength(content) };
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

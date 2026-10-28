import { afterEach, describe, expect, it, vi } from "vitest";
import { changedSince, findGist, pullGist, pushGist, remoteState, SyncError } from "./gistSync";
import { emptyAppData } from "../types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
// Replies in order and records each call as [url, method, body, cache].
function mockFetch(...replies: Response[]) {
  const calls: [string, string, unknown, RequestCache | undefined][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push([
        url,
        init.method ?? "GET",
        init.body ? JSON.parse(init.body as string) : undefined,
        init.cache,
      ]);
      return replies.shift()!;
    }),
  );
  return calls;
}
const gist = (
  id: string,
  files: Record<string, object>,
  updated_at = "2026-10-01T00:00:00Z",
  version = "v1",
) => ({ id, updated_at, files, history: [{ version }, { version: "older" }] });
afterEach(() => vi.unstubAllGlobals());

describe("gist sync", () => {
  it("finds the TreatCode gist on a later page", async () => {
    const other = Array.from({ length: 100 }, (_, i) => gist(`g${i}`, { "notes.md": {} }));
    const calls = mockFetch(json(other), json([gist("tc", { "treatcode.json": {} })]));
    expect(await findGist("t")).toEqual({ id: "tc", updatedAt: "2026-10-01T00:00:00Z" });
    expect(calls.map((c) => c[0])).toEqual([
      "https://api.github.com/gists?per_page=100&page=1",
      "https://api.github.com/gists?per_page=100&page=2",
    ]);
  });
  it("returns null when no gist holds the save", async () => {
    mockFetch(json([gist("a", { "notes.md": {} })]));
    expect(await findGist("t")).toBeNull();
  });
  it("pulls inline content", async () => {
    const data = emptyAppData();
    mockFetch(
      json(gist("tc", { "treatcode.json": { content: JSON.stringify(data) } }, "2026-10-02T00:00:00Z")),
    );
    const pulled = await pullGist("t", "tc");
    expect(pulled.data).toEqual(data);
    expect(pulled.updatedAt).toBe("2026-10-02T00:00:00Z");
    expect(pulled.version).toBe("v1");
    expect(pulled.bytes).toBe(JSON.stringify(data).length);
  });
  it("downloads a truncated file from raw_url", async () => {
    const data = emptyAppData();
    const calls = mockFetch(
      json(gist("tc", { "treatcode.json": { content: "{", truncated: true, raw_url: "https://raw/tc" } })),
      new Response(JSON.stringify(data)),
    );
    expect((await pullGist("t", "tc")).data).toEqual(data);
    expect(calls[1][0]).toBe("https://raw/tc");
  });
  it("rejects a cloud copy that isn't valid data", async () => {
    mockFetch(json(gist("tc", { "treatcode.json": { content: '{"version":1}' } })));
    await expect(pullGist("t", "tc")).rejects.toThrow("isn't valid TreatCode data");
  });
  it("creates a private gist the first time and updates it after", async () => {
    const data = emptyAppData();
    const calls = mockFetch(json(gist("new", {}, "2026-10-03T00:00:00Z", "v3")), json(gist("new", {})));
    expect(await pushGist("t", undefined, data)).toMatchObject({
      gistId: "new",
      updatedAt: "2026-10-03T00:00:00Z",
      version: "v3",
    });
    await pushGist("t", "new", data);
    expect(calls[0]).toEqual([
      "https://api.github.com/gists",
      "POST",
      {
        description: "TreatCode sync",
        public: false,
        files: { "treatcode.json": { content: JSON.stringify(data) } },
      },
      "no-store",
    ]);
    expect(calls[1].slice(0, 2)).toEqual(["https://api.github.com/gists/new", "PATCH"]);
  });
  it("maps HTTP failures to readable errors", async () => {
    mockFetch(json({}, 401), json({}, 404), json({}, 500));
    await expect(remoteState("t", "tc")).rejects.toMatchObject({
      status: 401,
      message: /rejected the token/,
    });
    await expect(remoteState("t", "tc")).rejects.toMatchObject({ status: 404 });
    await expect(remoteState("t", "tc")).rejects.toBeInstanceOf(SyncError);
  });
  it("reads the remote revision without the HTTP cache", async () => {
    const calls = mockFetch(json(gist("tc", {}, "2026-10-04T00:00:00Z", "v4")));
    expect(await remoteState("t", "tc")).toEqual({ updatedAt: "2026-10-04T00:00:00Z", version: "v4" });
    expect(calls[0][3]).toBe("no-store");
  });
  it("tells a newer cloud revision from the one this device knows", () => {
    const config = { token: "t", gistId: "tc", remoteUpdatedAt: "A", remoteVersion: "v1", dirty: false };
    // updated_at can drift between responses; the commit SHA can't.
    expect(changedSince(config, { updatedAt: "B", version: "v1" })).toBe(false);
    expect(changedSince(config, { updatedAt: "A", version: "v2" })).toBe(true);
    // Saved before remoteVersion existed: fall back to updated_at.
    const old = { ...config, remoteVersion: undefined };
    expect(changedSince(old, { updatedAt: "A", version: "v1" })).toBe(false);
    expect(changedSince(old, { updatedAt: "B", version: "v1" })).toBe(true);
    // Connected without loading: nothing known yet, so any cloud copy counts as changed.
    expect(changedSince({ token: "t", gistId: "tc", dirty: true }, { updatedAt: "A", version: "v1" })).toBe(
      true,
    );
  });
  it("reports network failures", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(findGist("t")).rejects.toThrow("Couldn't reach GitHub");
  });
});

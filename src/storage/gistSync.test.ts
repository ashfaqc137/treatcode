import { afterEach, describe, expect, it, vi } from "vitest";
import { findGist, pullGist, pushGist, remoteUpdatedAt, SyncError } from "./gistSync";
import { emptyAppData } from "../types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
// Replies in order and records each call as [url, method, body].
function mockFetch(...replies: Response[]) {
  const calls: [string, string, unknown][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push([url, init.method ?? "GET", init.body ? JSON.parse(init.body as string) : undefined]);
      return replies.shift()!;
    }),
  );
  return calls;
}
const gist = (id: string, files: Record<string, object>, updated_at = "2026-10-01T00:00:00Z") => ({
  id,
  updated_at,
  files,
});
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
    const calls = mockFetch(json(gist("new", {}, "2026-10-03T00:00:00Z")), json(gist("new", {})));
    expect(await pushGist("t", undefined, data)).toMatchObject({
      gistId: "new",
      updatedAt: "2026-10-03T00:00:00Z",
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
    ]);
    expect(calls[1].slice(0, 2)).toEqual(["https://api.github.com/gists/new", "PATCH"]);
  });
  it("maps HTTP failures to readable errors", async () => {
    mockFetch(json({}, 401), json({}, 404), json({}, 500));
    await expect(remoteUpdatedAt("t", "tc")).rejects.toMatchObject({
      status: 401,
      message: /rejected the token/,
    });
    await expect(remoteUpdatedAt("t", "tc")).rejects.toMatchObject({ status: 404 });
    await expect(remoteUpdatedAt("t", "tc")).rejects.toBeInstanceOf(SyncError);
  });
  it("reports network failures", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    await expect(findGist("t")).rejects.toThrow("Couldn't reach GitHub");
  });
});

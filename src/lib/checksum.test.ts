import { describe, expect, it } from "vitest";
import { addEntry, createTopic, moveEntry, updateEntry } from "./data";
import { checksum } from "./checksum";
import { emptyAppData, type AppData } from "../types";

const t0 = new Date("2026-01-20T00:00:00.000Z");
const later = new Date("2026-01-25T00:00:00.000Z");
const queues = (data: AppData) => data.topics[0].queues.map((q) => q.id);

function seeded() {
  const data = emptyAppData();
  return addEntry(data, "default", queues(data)[0], { title: "Two Sum", tags: ["arrays"] }, t0);
}
// Rebuilds every object with its keys reversed, as a different code path might build them.
const reordered = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(reordered)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .reverse()
            .map(([k, v]) => [k, reordered(v)]),
        )
      : value;

describe("checksum", () => {
  it("matches the same content built in a different key order", () => {
    const data = seeded();
    expect(checksum(reordered(data) as AppData)).toBe(checksum(data));
  });
  it("ignores which topic is selected", () => {
    const data = createTopic(seeded(), "Graphs");
    expect(data.selectedTopicId).not.toBe("default");
    expect(checksum({ ...data, selectedTopicId: "default" })).toBe(checksum(data));
  });
  it("changes with the content", () => {
    const data = seeded();
    const id = data.entries[0].id;
    const sum = checksum(data);
    expect(checksum(updateEntry(data, id, { title: "Three Sum", tags: ["arrays"] }))).not.toBe(sum);
    expect(checksum(updateEntry(data, id, { title: "Two Sum", tags: ["hash"] }))).not.toBe(sum);
    expect(checksum(moveEntry(data, id, queues(data)[1], later))).not.toBe(sum);
    expect(checksum(createTopic(data, "Graphs"))).not.toBe(sum);
  });
});

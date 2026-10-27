import {
  emptyAppData,
  newTopic,
  TIME_UNITS,
  type AppData,
  type Entry,
  type Interval,
  type Queue,
  type Topic,
} from "../types";
import { findQueue, queueLabel } from "./queues";

const norm = (text: string) => text.trim().toLocaleLowerCase();
const topicEntries = (data: AppData, topicId: string) => data.entries.filter((e) => e.topicId === topicId);
const topicOf = (data: AppData, topicId: string) => {
  const topic = data.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error("Unknown topic.");
  return topic;
};
const withTopic = (data: AppData, topic: Topic): AppData => ({
  ...data,
  topics: data.topics.map((t) => (t.id === topic.id ? topic : t)),
});

// Topics
function checkedTopicTitle(data: AppData, title: string, id?: string) {
  const clean = title.trim();
  if (!clean) throw new Error("Topic name is required.");
  if (clean.length > 60) throw new Error("Topic names are limited to 60 characters.");
  if (data.topics.some((t) => t.id !== id && norm(t.title) === norm(clean)))
    throw new Error("A topic with this name already exists.");
  return clean;
}
export function createTopic(data: AppData, title: string): AppData {
  const topic = newTopic(checkedTopicTitle(data, title));
  return { ...data, topics: [...data.topics, topic], selectedTopicId: topic.id };
}
export function renameTopic(data: AppData, topicId: string, title: string): AppData {
  return withTopic(data, { ...topicOf(data, topicId), title: checkedTopicTitle(data, title, topicId) });
}
export function deleteTopic(data: AppData, topicId: string): AppData {
  topicOf(data, topicId);
  if (data.topics.length === 1) throw new Error("At least one topic is required.");
  const topics = data.topics.filter((t) => t.id !== topicId);
  return {
    ...data,
    topics,
    entries: data.entries.filter((e) => e.topicId !== topicId),
    selectedTopicId: data.selectedTopicId === topicId ? topics[0].id : data.selectedTopicId,
  };
}

// Entries
export interface EntryInput {
  title: string;
  notes?: string;
  tags?: string[];
}
export const parseTags = (raw: string) => raw.split(/[,\s]+/);
const cleanTags = (tags: string[] = []) =>
  [...new Set(tags.map(norm).filter(Boolean))].map((t) => t.slice(0, 40)).slice(0, 12);
function checkedEntry(data: AppData, topicId: string, input: EntryInput, id?: string) {
  const title = input.title.trim();
  if (!title) throw new Error("Title is required.");
  if (topicEntries(data, topicId).some((e) => e.id !== id && norm(e.title) === norm(title)))
    throw new Error(`“${title}” is already in this topic.`);
  return { title, notes: input.notes?.trim() || undefined, tags: cleanTags(input.tags) };
}
export function addEntry(
  data: AppData,
  topicId: string,
  queueId: string,
  input: EntryInput,
  now = new Date(),
): AppData {
  if (!findQueue(topicOf(data, topicId), queueId)) throw new Error("Unknown queue.");
  const at = now.toISOString();
  const entry: Entry = {
    id: crypto.randomUUID(),
    topicId,
    queueId,
    ...checkedEntry(data, topicId, input),
    createdAt: at,
    movedAt: at,
    history: [{ at, to: queueId }],
  };
  return { ...data, entries: [...data.entries, entry] };
}
// Moving restarts the timer, so dropping an entry back into its own queue means "again, same interval".
export function moveEntry(data: AppData, id: string, queueId: string, now = new Date()): AppData {
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) throw new Error("Unknown entry.");
  if (!findQueue(topicOf(data, entry.topicId), queueId)) throw new Error("Unknown queue.");
  const at = now.toISOString();
  return {
    ...data,
    entries: data.entries.map((e) =>
      e.id !== id
        ? e
        : { ...e, queueId, movedAt: at, history: [...e.history, { at, from: e.queueId, to: queueId }] },
    ),
  };
}
export function updateEntry(data: AppData, id: string, input: EntryInput): AppData {
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) throw new Error("Unknown entry.");
  const clean = checkedEntry(data, entry.topicId, input, id);
  return { ...data, entries: data.entries.map((e) => (e.id === id ? { ...e, ...clean } : e)) };
}
export function removeEntry(data: AppData, id: string): AppData {
  return { ...data, entries: data.entries.filter((e) => e.id !== id) };
}

// Queues
export interface QueueInput {
  interval: Interval | null;
  name?: string;
  random?: boolean;
}
const validInterval = (i: unknown): i is Interval | null =>
  i === null ||
  (typeof i === "object" &&
    TIME_UNITS.includes((i as Interval).unit) &&
    Number.isInteger((i as Interval).value) &&
    (i as Interval).value >= 1);
function checkedQueue(queues: Queue[], { random, ...queue }: Omit<Queue, "random"> & { random?: boolean }) {
  if (!validInterval(queue.interval)) throw new Error("Duration must be a whole number ≥ 1.");
  if (random && !queue.interval) throw new Error("A random queue needs a delay.");
  const name = queue.name?.trim() || undefined;
  if (name && name.length > 40) throw new Error("Queue names are limited to 40 characters.");
  const result: Queue = { ...queue, name, ...(random ? { random: true as const } : {}) };
  const others = [...queues.filter((q) => q.id !== queue.id), result];
  const label = norm(queueLabel(result, others));
  if (others.some((q) => q.id !== queue.id && norm(queueLabel(q, others)) === label))
    throw new Error(`A queue named “${queueLabel(result, others)}” already exists.`);
  return result;
}
export function createQueue(data: AppData, topicId: string, input: QueueInput): AppData {
  const topic = topicOf(data, topicId);
  const queue = checkedQueue(topic.queues, {
    id: crypto.randomUUID(),
    ...input,
    createdOrder: Math.max(-1, ...topic.queues.map((q) => q.createdOrder)) + 1,
  });
  return withTopic(data, { ...topic, queues: [...topic.queues, queue] });
}
export function updateQueue(data: AppData, topicId: string, queueId: string, patch: Partial<QueueInput>) {
  const topic = topicOf(data, topicId);
  const current = findQueue(topic, queueId);
  if (!current) throw new Error("Unknown queue.");
  const queue = checkedQueue(topic.queues, { ...current, ...patch });
  return withTopic(data, { ...topic, queues: topic.queues.map((q) => (q.id === queueId ? queue : q)) });
}
export type QueueDeletion = { mode: "drop" } | { mode: "move"; target: string };
// Moved entries keep their movedAt, so their due date follows the target queue's interval.
export function deleteQueue(data: AppData, topicId: string, queueId: string, how: QueueDeletion): AppData {
  const topic = topicOf(data, topicId);
  if (!findQueue(topic, queueId)) throw new Error("Unknown queue.");
  if (topic.queues.length === 1) throw new Error("At least one queue is required.");
  if (how.mode === "move" && (how.target === queueId || !findQueue(topic, how.target)))
    throw new Error("Choose another queue to move entries into.");
  const inQueue = (e: Entry) => e.topicId === topicId && e.queueId === queueId;
  const entries =
    how.mode === "drop"
      ? data.entries.filter((e) => !inQueue(e))
      : data.entries.map((e) => (inQueue(e) ? { ...e, queueId: how.target } : e));
  return {
    ...withTopic(data, { ...topic, queues: topic.queues.filter((q) => q.id !== queueId) }),
    entries,
  };
}

// Persistence
export function validate(value: unknown): AppData {
  const data = value as AppData;
  if (
    !data ||
    data.version !== 4 ||
    !Array.isArray(data.topics) ||
    !Array.isArray(data.entries) ||
    !data.topics.some((t) => t.id === data.selectedTopicId)
  )
    throw new Error("Unsupported data format.");
  const queueIds = new Map<string, Set<string>>();
  for (const topic of data.topics) {
    if (typeof topic.title !== "string" || !Array.isArray(topic.queues) || !topic.queues.length)
      throw new Error("Invalid topic.");
    const ids = new Set<string>();
    for (const q of topic.queues) {
      if (
        typeof q.id !== "string" ||
        !q.id ||
        ids.has(q.id) ||
        !validInterval(q.interval) ||
        !Number.isFinite(q.createdOrder) ||
        (q.random !== undefined && (q.random !== true || !q.interval)) ||
        (q.name !== undefined && (typeof q.name !== "string" || q.name.length > 40))
      )
        throw new Error("Invalid queue.");
      ids.add(q.id);
    }
    queueIds.set(topic.id, ids);
  }
  const seen = new Set<string>();
  for (const e of data.entries) {
    const key = `${e.topicId}:${norm(e.title ?? "")}`;
    if (
      !queueIds.get(e.topicId)?.has(e.queueId) ||
      !e.id ||
      !e.title?.trim() ||
      !Array.isArray(e.tags) ||
      Number.isNaN(Date.parse(e.movedAt)) ||
      !Array.isArray(e.history) ||
      seen.has(key)
    )
      throw new Error("The data contains invalid or duplicate entries.");
    seen.add(key);
  }
  return data;
}
export { emptyAppData };

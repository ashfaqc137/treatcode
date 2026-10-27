import {
  defaultSettings,
  defaultSubject,
  emptyAppData,
  NEW,
  TIME_UNITS,
  type AppData,
  type ItemStatus,
  type Queue,
  type Settings,
  type StudyItem,
  type Subject,
  type TimeUnit,
} from "../types";
import { findQueue, queueLabel } from "./queues";
const norm = (title: string) => title.trim().toLocaleLowerCase();
const subjectItems = (data: AppData, subjectId: string) =>
  data.items.filter((item) => item.subjectId === subjectId);
function checkedTitles(data: AppData, subjectId: string, rawTitles: string[]) {
  const existing = new Set(subjectItems(data, subjectId).map((i) => norm(i.title)));
  const titles = rawTitles.map((x) => x.trim()).filter(Boolean);
  const duplicate = titles.find((title) => existing.has(norm(title)) || (existing.add(norm(title)), false));
  if (duplicate) throw new Error(`“${duplicate}” already exists in this subject.`);
  return titles;
}
export function addTitles(data: AppData, subjectId: string, rawTitles: string[], now = new Date()): AppData {
  const titles = checkedTitles(data, subjectId, rawTitles);
  const start = Math.max(-1, ...subjectItems(data, subjectId).map((i) => i.createdOrder)) + 1;
  return {
    ...data,
    items: [
      ...data.items,
      ...titles.map((title, i) => ({
        id: crypto.randomUUID(),
        subjectId,
        title,
        status: "NEW" as const,
        createdAt: now.toISOString(),
        createdOrder: start + i,
        attemptCount: 0,
        history: [],
      })),
    ],
  };
}
export function addDraftToSession(data: AppData, title: string, now = new Date()): AppData {
  const session = data.activeSession;
  if (!session) throw new Error("No active session.");
  const titles = checkedTitles(data, session.subjectId, [title]);
  const start = Math.max(-1, ...subjectItems(data, session.subjectId).map((i) => i.createdOrder)) + 1;
  const item: StudyItem = {
    id: crypto.randomUUID(),
    subjectId: session.subjectId,
    title: titles[0],
    status: "NEW",
    createdAt: now.toISOString(),
    createdOrder: start,
    attemptCount: 0,
    history: [],
  };
  return { ...data, items: [...data.items, item], activeSession: { ...session, itemId: item.id } };
}
export function classify(data: AppData, id: string, status: string, now = new Date()): AppData {
  const item = data.items.find((x) => x.id === id);
  if (!item || !findQueue(subjectOf(data, item.subjectId).settings, status))
    throw new Error("Unknown queue.");
  return {
    ...data,
    items: data.items.map((item) =>
      item.id !== id
        ? item
        : {
            ...item,
            status,
            lastAttemptedAt: now.toISOString(),
            attemptCount: item.attemptCount + 1,
            history: [
              ...item.history,
              { attemptedAt: now.toISOString(), previousStatus: item.status, resultingStatus: status },
            ],
          },
    ),
    activeSession: data.activeSession ? { ...data.activeSession, resolved: true } : undefined,
  };
}
export function discardSessionItem(data: AppData): AppData {
  const session = data.activeSession;
  if (!session?.itemId) throw new Error("No session item to discard.");
  return {
    ...data,
    items: data.items.filter((item) => item.id !== session.itemId),
    activeSession: { ...session, resolved: true },
  };
}
export function startSession(data: AppData, subjectId: string, itemId?: string): AppData {
  if (data.activeSession) throw new Error("End the current session first.");
  return {
    ...data,
    selectedSubjectId: subjectId,
    activeSession: { subjectId, itemId, startedAt: new Date().toISOString(), resolved: false },
  };
}
export function endSession(data: AppData): AppData {
  if (!data.activeSession?.resolved)
    throw new Error("Classify or discard the session item before ending it.");
  return { ...data, activeSession: undefined };
}
export function createSubject(data: AppData, title: string): AppData {
  const clean = title.trim();
  if (!clean) throw new Error("Subject name is required.");
  if (data.subjects.some((s) => norm(s.title) === norm(clean)))
    throw new Error("A subject with this name already exists.");
  const subject: Subject = {
    id: crypto.randomUUID(),
    title: clean,
    createdAt: new Date().toISOString(),
    settings: defaultSettings(),
  };
  return { ...data, subjects: [...data.subjects, subject], selectedSubjectId: subject.id };
}
export function updateItem(data: AppData, id: string, title: string, status: ItemStatus): AppData {
  const item = data.items.find((x) => x.id === id);
  if (!item) return data;
  const clean = title.trim();
  if (!clean) throw new Error("Title is required.");
  if (subjectItems(data, item.subjectId).some((x) => x.id !== id && norm(x.title) === norm(clean)))
    throw new Error("An item with this title already exists in this subject.");
  if (status !== NEW && !findQueue(subjectOf(data, item.subjectId).settings, status))
    throw new Error("Unknown queue.");
  return {
    ...data,
    items: data.items.map((x) =>
      x.id !== id
        ? x
        : { ...x, title: clean, status, lastAttemptedAt: status === "NEW" ? undefined : x.lastAttemptedAt },
    ),
  };
}
export function removeItem(data: AppData, id: string): AppData {
  return { ...data, items: data.items.filter((i) => i.id !== id) };
}
const subjectOf = (data: AppData, subjectId: string) => {
  const subject = data.subjects.find((s) => s.id === subjectId);
  if (!subject) throw new Error("Unknown subject.");
  return subject;
};
const withSettings = (data: AppData, subjectId: string, settings: Settings): AppData => ({
  ...data,
  subjects: data.subjects.map((s) => (s.id === subjectId ? { ...s, settings } : s)),
});
export interface QueueInput {
  unit: TimeUnit;
  value: number;
  name?: string;
}
function checkedQueue(queues: Queue[], queue: Queue): Queue {
  if (!TIME_UNITS.includes(queue.unit)) throw new Error("Unknown time unit.");
  if (!Number.isInteger(queue.value) || queue.value < 1)
    throw new Error("Duration must be a whole number ≥ 1.");
  const name = queue.name?.trim() || undefined;
  if (name && name.length > 100) throw new Error("Queue names are limited to 100 characters.");
  const result = { ...queue, name };
  const others = [...queues.filter((q) => q.id !== queue.id), result];
  const label = norm(queueLabel(result, others));
  if (label === norm(NEW) || others.some((q) => q.id !== queue.id && norm(queueLabel(q, others)) === label))
    throw new Error(`A queue named “${queueLabel(result, others)}” already exists.`);
  return result;
}
export function createQueue(data: AppData, subjectId: string, input: QueueInput): AppData {
  const { settings } = subjectOf(data, subjectId);
  const queue = checkedQueue(settings.queues, {
    id: crypto.randomUUID(),
    ...input,
    createdOrder: Math.max(-1, ...settings.queues.map((q) => q.createdOrder)) + 1,
  });
  return withSettings(data, subjectId, { ...settings, queues: [...settings.queues, queue] });
}
export function updateQueue(data: AppData, subjectId: string, queueId: string, patch: Partial<QueueInput>) {
  const { settings } = subjectOf(data, subjectId);
  const current = settings.queues.find((q) => q.id === queueId);
  if (!current) throw new Error("Unknown queue.");
  const queue = checkedQueue(settings.queues, { ...current, ...patch });
  return withSettings(data, subjectId, {
    ...settings,
    queues: settings.queues.map((q) => (q.id === queueId ? queue : q)),
  });
}
export type QueueDeletion = { mode: "drop" } | { mode: "move"; target: string };
export function deleteQueue(data: AppData, subjectId: string, queueId: string, how: QueueDeletion): AppData {
  const { settings } = subjectOf(data, subjectId);
  if (!findQueue(settings, queueId)) throw new Error("Unknown queue.");
  if (settings.queues.length === 1) throw new Error("At least one queue is required.");
  const session = data.activeSession;
  if (session && !session.resolved && data.items.some((i) => i.id === session.itemId && i.status === queueId))
    throw new Error("The active session's item is in this queue.");
  if (
    how.mode === "move" &&
    (how.target === queueId || (how.target !== NEW && !findQueue(settings, how.target)))
  )
    throw new Error("Choose another queue to move items into.");
  const inQueue = (i: StudyItem) => i.subjectId === subjectId && i.status === queueId;
  const items =
    how.mode === "drop"
      ? data.items.filter((i) => !inQueue(i))
      : data.items.map((i) =>
          inQueue(i)
            ? {
                ...i,
                status: how.target,
                lastAttemptedAt: how.target === NEW ? undefined : i.lastAttemptedAt,
              }
            : i,
        );
  return {
    ...withSettings(data, subjectId, {
      ...settings,
      queues: settings.queues.filter((q) => q.id !== queueId),
    }),
    items,
  };
}
const LEGACY = ["R1", "R2", "R3", "RD"];
function migrateV2(raw: any): AppData {
  const map = new Map<string, string>();
  const subjects = raw.subjects.map((subject: any) => {
    const queues: Queue[] = LEGACY.map((status, createdOrder) => {
      const days = Number(subject.settings?.intervals?.[status]);
      const whole = Number.isInteger(days);
      const queue: Queue = {
        id: crypto.randomUUID(),
        unit: whole ? "day" : "hour",
        value: whole ? days : Math.max(1, Math.round(days * 24)),
        createdOrder,
      };
      map.set(`${subject.id}:${status}`, queue.id);
      return queue;
    });
    return {
      ...subject,
      settings: { queues, starvationMultiplier: subject.settings?.starvationMultiplier ?? 2 },
    };
  });
  const remap = (subjectId: string, status: string) => map.get(`${subjectId}:${status}`) ?? status;
  return {
    ...raw,
    version: 3,
    subjects,
    items: raw.items.map((item: any) => ({
      ...item,
      status: remap(item.subjectId, item.status),
      history: (item.history ?? []).map((h: any) => ({
        ...h,
        previousStatus: remap(item.subjectId, h.previousStatus),
        resultingStatus: remap(item.subjectId, h.resultingStatus),
      })),
    })),
  };
}
export function migrate(value: unknown): AppData {
  if (!value || typeof value !== "object") throw new Error("Not a TreatCode export.");
  let raw = value as any;
  if (raw.version === 1 && Array.isArray(raw.items) && raw.settings) {
    const subject = defaultSubject();
    raw = {
      version: 2,
      subjects: [{ ...subject, settings: raw.settings }],
      selectedSubjectId: subject.id,
      items: raw.items.map((item: any) => ({ ...item, subjectId: subject.id })),
    };
  }
  if (raw.version === 2 && Array.isArray(raw.subjects) && Array.isArray(raw.items)) raw = migrateV2(raw);
  return raw as AppData;
}
export function validate(data: AppData): AppData {
  if (
    data.version !== 3 ||
    !Array.isArray(data.subjects) ||
    !Array.isArray(data.items) ||
    !data.subjects.some((s) => s.id === data.selectedSubjectId)
  )
    throw new Error("Unsupported export format.");
  const queueIds = new Map<string, Set<string>>();
  for (const subject of data.subjects) {
    const queues = subject.settings?.queues;
    if (!Array.isArray(queues) || !queues.length || !Number.isFinite(subject.settings.starvationMultiplier))
      throw new Error("Invalid subject settings.");
    const ids = new Set<string>();
    for (const q of queues) {
      if (
        typeof q.id !== "string" ||
        !q.id ||
        ids.has(q.id) ||
        !TIME_UNITS.includes(q.unit) ||
        !Number.isInteger(q.value) ||
        q.value < 1 ||
        !Number.isFinite(q.createdOrder) ||
        (q.name !== undefined && (typeof q.name !== "string" || q.name.length > 100))
      )
        throw new Error("Invalid subject settings.");
      ids.add(q.id);
    }
    queueIds.set(subject.id, ids);
  }
  const seen = new Set<string>();
  for (const item of data.items) {
    const key = `${item.subjectId}:${norm(item.title)}`;
    const ids = queueIds.get(item.subjectId);
    if (
      !ids ||
      !item.id ||
      !item.title?.trim() ||
      (item.status !== NEW && !ids.has(item.status)) ||
      !Number.isFinite(item.createdOrder) ||
      !Array.isArray(item.history) ||
      seen.has(key)
    )
      throw new Error("The import contains invalid or duplicate items.");
    seen.add(key);
  }
  return data;
}
export function validateImport(value: unknown): AppData {
  return { ...validate(migrate(value)), activeSession: undefined };
}
export { emptyAppData };

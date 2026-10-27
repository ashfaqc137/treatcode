export const NEW = "NEW";
export const TIME_UNITS = ["hour", "day", "week", "month"] as const;
export type TimeUnit = (typeof TIME_UNITS)[number];
// "NEW" or a queue id.
export type ItemStatus = string;
export interface Queue {
  id: string;
  unit: TimeUnit;
  value: number;
  name?: string;
  createdOrder: number;
}
export interface AttemptHistory {
  attemptedAt: string;
  previousStatus: ItemStatus;
  resultingStatus: ItemStatus;
}
export interface StudyItem {
  id: string;
  subjectId: string;
  title: string;
  status: ItemStatus;
  createdAt: string;
  createdOrder: number;
  lastAttemptedAt?: string;
  attemptCount: number;
  history: AttemptHistory[];
}
export interface Settings {
  queues: Queue[];
  starvationMultiplier: number;
}
export interface Subject {
  id: string;
  title: string;
  createdAt: string;
  settings: Settings;
}
export interface ActiveSession {
  subjectId: string;
  itemId?: string;
  startedAt: string;
  resolved: boolean;
}
export interface AppData {
  version: 3;
  subjects: Subject[];
  selectedSubjectId: string;
  items: StudyItem[];
  activeSession?: ActiveSession;
}
export const defaultQueues = (): Queue[] =>
  [1, 2, 4, 10].map((value, createdOrder) => ({ id: crypto.randomUUID(), unit: "day", value, createdOrder }));
export const defaultSettings = (): Settings => ({ queues: defaultQueues(), starvationMultiplier: 2 });
export const defaultSubject = (): Subject => ({
  id: "default",
  title: "Default",
  createdAt: new Date().toISOString(),
  settings: defaultSettings(),
});
export const emptyAppData = (): AppData => {
  const subject = defaultSubject();
  return { version: 3, subjects: [subject], selectedSubjectId: subject.id, items: [] };
};

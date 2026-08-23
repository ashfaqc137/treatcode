import { useState, type RefObject } from "react";
import { addDraftToSession, classify, createSubject, discardSessionItem, endSession } from "./lib/data";
import {
  REVIEW_STATUSES,
  STATUSES,
  type AppData,
  type ItemStatus,
  type Settings,
  type StudyItem,
  type Subject,
} from "./types";
import { formatDue } from "./lib/scheduling";
export function Session({
  data,
  subject,
  onCommit,
  onEnded,
}: {
  data: AppData;
  subject: Subject;
  onCommit: (x: AppData) => void;
  onEnded: () => void;
}) {
  const s = data.activeSession;
  const [draft, setDraft] = useState("");
  if (!s)
    return (
      <section className="session">
        <h2>No active session</h2>
      </section>
    );
  const item = data.items.find((i) => i.id === s.itemId);
  if (s.resolved)
    return (
      <section className="session">
        <p className="eyebrow">SESSION READY TO END</p>
        <h2>Item resolved.</h2>
        <button
          className="primary"
          onClick={() => {
            onCommit(endSession(data));
            onEnded();
          }}
        >
          End session
        </button>
      </section>
    );
  if (!item)
    return (
      <section className="session">
        <p className="eyebrow">NEW SESSION · {subject.title}</p>
        <h2>Add one item to attempt</h2>
        <p className="session-intro">
          This item stays private to the session until you complete and classify it.
        </p>
        <div className="session-entry">
          <label htmlFor="session-topic">Topic or problem</label>
          <div>
            <input
              id="session-topic"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. Design a URL shortener"
              autoFocus
            />
            <button
              className="primary"
              disabled={!draft.trim()}
              onClick={() => onCommit(addDraftToSession(data, draft))}
            >
              Begin attempt
            </button>
          </div>
        </div>
      </section>
    );
  return (
    <section className="session">
      <p className="eyebrow">
        {item.status === "NEW" ? "FRESH ITEM" : "REVISION"} · {subject.title}
      </p>
      <h2>{item.title}</h2>
      <p className="session-meta">
        {item.status} · {item.attemptCount} prior attempts
      </p>
      <p>Classify it to enqueue its next review—or discard it.</p>
      <div className="classify">
        {REVIEW_STATUSES.map((status) => (
          <button
            key={status}
            className={status.toLowerCase()}
            onClick={() => onCommit(classify(data, item.id, status))}
          >
            {status}
          </button>
        ))}
        <button className="danger" onClick={() => onCommit(discardSessionItem(data))}>
          Discard
        </button>
      </div>
    </section>
  );
}
export function Queues({
  items,
  settings,
  now,
  onUpdate,
  onDelete,
}: {
  items: StudyItem[];
  settings: Settings;
  now: Date;
  onUpdate: (id: string, t: string, s: ItemStatus) => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<StudyItem | null>(null);
  const rows = items
    .filter((i) => i.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.createdOrder - b.createdOrder);
  return (
    <section>
      <div className="section-title">
        <div>
          <p className="eyebrow">LIBRARY</p>
          <h2>Manage queues</h2>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Queue</th>
              <th>Last attempted</th>
              <th>Next review</th>
              <th>Attempts</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.title}</td>
                <td>
                  <span className={`badge ${i.status}`}>{i.status}</span>
                </td>
                <td>{i.lastAttemptedAt ? new Date(i.lastAttemptedAt).toLocaleDateString() : "—"}</td>
                <td>{formatDue(i, now, settings)}</td>
                <td>{i.attemptCount}</td>
                <td>
                  <button onClick={() => setSelected(i)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <Edit
          item={selected}
          close={() => setSelected(null)}
          save={(t, s) => {
            onUpdate(selected.id, t, s);
            setSelected(null);
          }}
          del={() => {
            onDelete(selected.id);
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}
function Edit({
  item,
  close,
  save,
  del,
}: {
  item: StudyItem;
  close: () => void;
  save: (t: string, s: ItemStatus) => void;
  del: () => void;
}) {
  const [t, setT] = useState(item.title),
    [s, setS] = useState<ItemStatus>(item.status);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Edit item</h2>
        <label>
          Title
          <input value={t} onChange={(e) => setT(e.target.value)} />
        </label>
        <label>
          Queue
          <select value={s} onChange={(e) => setS(e.target.value as ItemStatus)}>
            {STATUSES.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <div className="modal-actions">
          <button className="danger" onClick={del}>
            Delete
          </button>
          <span />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => save(t, s)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
export function Settings({
  data,
  subject,
  save,
  exportData,
  importData,
  fileRef,
  clear,
}: {
  data: AppData;
  subject: Subject;
  save: (x: AppData) => void;
  exportData: () => void;
  importData: (f?: File) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  clear: () => void;
}) {
  const [settings, setSettings] = useState(subject.settings);
  const [name, setName] = useState("");
  return (
    <section className="settings">
      <p className="eyebrow">SETTINGS</p>
      <h2>Settings & data</h2>
      <Card title="Subjects">
        <p>Each subject has independent queues, analytics, and review intervals.</p>
        <label>
          Current subject
          <select value={subject.id} onChange={(e) => save({ ...data, selectedSubjectId: e.target.value })}>
            {data.subjects.map((x) => (
              <option key={x.id} value={x.id}>
                {x.title}
              </option>
            ))}
          </select>
        </label>
        <div className="new-subject">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New subject name" />
          <button
            onClick={() => {
              try {
                save(createSubject(data, name));
                setName("");
              } catch (e) {
                alert((e as Error).message);
              }
            }}
          >
            Add subject
          </button>
        </div>
      </Card>
      <Card title={`Review gaps · ${subject.title}`}>
        {REVIEW_STATUSES.map((s) => (
          <label key={s}>
            {s}{" "}
            <input
              type="number"
              min=".1"
              step=".1"
              value={settings.intervals[s]}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  intervals: { ...settings.intervals, [s]: Math.max(0.1, +e.target.value) },
                })
              }
            />{" "}
            full days
          </label>
        ))}
        <button
          className="primary"
          onClick={() =>
            save({
              ...data,
              subjects: data.subjects.map((x) => (x.id === subject.id ? { ...x, settings } : x)),
            })
          }
        >
          Save settings
        </button>
      </Card>
      <Card title="Backup">
        <button onClick={exportData}>Export JSON</button>{" "}
        <button onClick={() => fileRef.current?.click()}>Import JSON</button>
        <input
          hidden
          ref={fileRef}
          type="file"
          accept="application/json"
          onChange={(e) => importData(e.target.files?.[0])}
        />
      </Card>
      <Card title="Danger zone">
        <button className="danger" onClick={clear}>
          Clear all data
        </button>
      </Card>
    </section>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="card">
      <h3>{title}</h3>
      {children}
    </article>
  );
}

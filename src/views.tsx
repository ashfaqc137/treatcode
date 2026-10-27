import { useState, type RefObject } from "react";
import {
  addDraftToSession,
  classify,
  createQueue,
  createSubject,
  deleteQueue,
  discardSessionItem,
  endSession,
  updateQueue,
  type QueueDeletion,
} from "./lib/data";
import {
  NEW,
  TIME_UNITS,
  type AppData,
  type ItemStatus,
  type Queue,
  type Settings,
  type StudyItem,
  type Subject,
  type TimeUnit,
} from "./types";
import { formatDue } from "./lib/scheduling";
import { byDuration, byPriority, findQueue, longLabel, queueLabel } from "./lib/queues";
export function QueueBadge({ status, settings }: { status: ItemStatus; settings: Settings }) {
  if (status === NEW) return <span className="badge NEW">NEW</span>;
  const queue = findQueue(settings, status);
  if (!queue) return <span className="badge queue">deleted queue</span>;
  return (
    <span className="badge queue" title={longLabel(queue)}>
      {queueLabel(queue, settings.queues)}
    </span>
  );
}
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
        <QueueBadge status={item.status} settings={subject.settings} /> · {item.attemptCount} prior attempts
      </p>
      <p>Classify it to enqueue its next review—or discard it.</p>
      <div className="classify">
        {byDuration(subject.settings.queues).map((queue) => (
          <button
            key={queue.id}
            title={longLabel(queue)}
            onClick={() => onCommit(classify(data, item.id, queue.id))}
          >
            {queueLabel(queue, subject.settings.queues)}
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
                  <QueueBadge status={i.status} settings={settings} />
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
          settings={settings}
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
  settings,
  close,
  save,
  del,
}: {
  item: StudyItem;
  settings: Settings;
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
            <option value={NEW}>NEW</option>
            {byDuration(settings.queues).map((q) => (
              <option key={q.id} value={q.id}>
                {queueLabel(q, settings.queues)} ({longLabel(q)})
              </option>
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
      <Card title={`Queues · ${subject.title}`}>
        <QueueManager data={data} subject={subject} save={save} />
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
const attempt = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    alert((e as Error).message);
  }
};
function UnitSelect({ value, onChange }: { value: TimeUnit; onChange: (u: TimeUnit) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as TimeUnit)}>
      {TIME_UNITS.map((u) => (
        <option key={u} value={u}>
          {u}s
        </option>
      ))}
    </select>
  );
}
function QueueManager({
  data,
  subject,
  save,
}: {
  data: AppData;
  subject: Subject;
  save: (x: AppData) => void;
}) {
  const queues = subject.settings.queues;
  const [value, setValue] = useState(1),
    [unit, setUnit] = useState<TimeUnit>("day"),
    [name, setName] = useState(""),
    [deleting, setDeleting] = useState<Queue | null>(null);
  const update = (q: Queue, patch: Partial<Queue>) =>
    attempt(() => save(updateQueue(data, subject.id, q.id, patch)));
  return (
    <>
      <p>Highest priority first. Leave the name blank to auto-name the queue.</p>
      {byPriority(queues).map((q) => (
        <div className="queue-row" key={q.id}>
          <QueueBadge status={q.id} settings={subject.settings} />
          <input
            key={q.name ?? ""}
            defaultValue={q.name ?? ""}
            placeholder={queueLabel(
              { ...q, name: undefined },
              queues.map((x) => (x.id === q.id ? { ...x, name: undefined } : x)),
            )}
            onBlur={(e) => e.target.value.trim() !== (q.name ?? "") && update(q, { name: e.target.value })}
          />
          <input
            type="number"
            min="1"
            step="1"
            value={q.value}
            onChange={(e) => +e.target.value >= 1 && update(q, { value: Math.floor(+e.target.value) })}
          />
          <UnitSelect value={q.unit} onChange={(u) => update(q, { unit: u })} />
          <button className="danger" disabled={queues.length === 1} onClick={() => setDeleting(q)}>
            Delete
          </button>
        </div>
      ))}
      <div className="queue-row">
        <span />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" />
        <input
          type="number"
          min="1"
          step="1"
          value={value}
          onChange={(e) => setValue(Math.floor(+e.target.value))}
        />
        <UnitSelect value={unit} onChange={setUnit} />
        <button
          onClick={() =>
            attempt(() => {
              save(createQueue(data, subject.id, { unit, value, name }));
              setName("");
            })
          }
        >
          Add
        </button>
      </div>
      {deleting && (
        <DeleteQueue
          data={data}
          subject={subject}
          queue={deleting}
          close={() => setDeleting(null)}
          confirm={(how) =>
            attempt(() => {
              save(deleteQueue(data, subject.id, deleting.id, how));
              setDeleting(null);
            })
          }
        />
      )}
    </>
  );
}
function DeleteQueue({
  data,
  subject,
  queue,
  close,
  confirm,
}: {
  data: AppData;
  subject: Subject;
  queue: Queue;
  close: () => void;
  confirm: (how: QueueDeletion) => void;
}) {
  const others = byDuration(subject.settings.queues).filter((q) => q.id !== queue.id);
  const count = data.items.filter((i) => i.subjectId === subject.id && i.status === queue.id).length;
  const [mode, setMode] = useState<QueueDeletion["mode"]>("move"),
    [target, setTarget] = useState(others[0]?.id ?? NEW);
  const label = queueLabel(queue, subject.settings.queues);
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Delete queue {label}</h2>
        {count === 0 ? (
          <p>This queue is empty.</p>
        ) : (
          <>
            <p>
              {count} item{count === 1 ? "" : "s"} in {label}.
            </p>
            <label>
              <input type="radio" checked={mode === "move"} onChange={() => setMode("move")} /> Move to{" "}
              <select value={target} disabled={mode !== "move"} onChange={(e) => setTarget(e.target.value)}>
                {others.map((q) => (
                  <option key={q.id} value={q.id}>
                    {queueLabel(q, subject.settings.queues)} ({longLabel(q)})
                  </option>
                ))}
                <option value={NEW}>NEW</option>
              </select>
            </label>
            <label>
              <input type="radio" checked={mode === "drop"} onChange={() => setMode("drop")} /> Drop items
              permanently
            </label>
          </>
        )}
        <div className="modal-actions">
          <span />
          <button onClick={close}>Cancel</button>
          <button
            className="danger"
            onClick={() => confirm(mode === "move" && count ? { mode: "move", target } : { mode: "drop" })}
          >
            Delete queue
          </button>
        </div>
      </div>
    </div>
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

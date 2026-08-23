import { useEffect, useRef, useState } from "react";
import { emptyAppData, removeItem, startSession, updateItem, validateImport } from "./lib/data";
import { nextFresh, nextUpcoming, pickNextRevision } from "./lib/picker";
import { dueAt, formatDue } from "./lib/scheduling";
import { indexedDbStorage } from "./storage/indexedDb";
import { REVIEW_STATUSES, type AppData, type ItemStatus, type StudyItem, type Subject } from "./types";
import { Queues, Session, Settings } from "./views";
type View = "dashboard" | "session" | "queues" | "settings";
export default function App() {
  const [data, setData] = useState<AppData | null>(null),
    [view, setView] = useState<View>("dashboard"),
    [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    indexedDbStorage
      .load()
      .then((x) => setData(x as AppData))
      .catch(() => setData(emptyAppData()));
  }, []);
  const commit = (x: AppData) => {
    setData(x);
    indexedDbStorage.save(x).catch(() => setNotice("Changes could not be saved."));
  };
  if (!data) return <main className="loading">Loading…</main>;
  const subject = data.subjects.find((s) => s.id === data.selectedSubjectId)!;
  const items = data.items.filter((i) => i.subjectId === subject.id);
  const now = new Date();
  const revision = pickNextRevision(items, now, subject.settings),
    fresh = nextFresh(items),
    upcoming = nextUpcoming(items, subject.settings),
    locked = !!data.activeSession;
  const exportData = () => {
    const u = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = u;
    a.download = "treatcode.json";
    a.click();
    URL.revokeObjectURL(u);
  };
  const importData = async (f?: File) => {
    if (!f) return;
    try {
      const x = validateImport(JSON.parse(await f.text()));
      if (confirm("Replace all current data?")) {
        commit(x);
        setNotice("Import complete.");
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <main className="app">
      <header>
        <div>
          <h1>TreatCode</h1>
          <span>Adaptive revision, kept local.</span>
        </div>
        <nav>
          <span className="current-subject">
            <small>Subject</small>
            <b>{subject.title}</b>
          </span>
          {(["dashboard", "session", "queues", "settings"] as View[]).map((n) => (
            <button
              key={n}
              disabled={locked && n !== "session"}
              className={view === n ? "active" : ""}
              onClick={() => setView(n)}
            >
              {n}
            </button>
          ))}
        </nav>
      </header>
      {locked && (
        <div className="notice">
          A {subject.title} session is active. Finish or discard its item, then end the session.
        </div>
      )}
      {notice && (
        <div className="notice">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {view === "dashboard" && (
        <Dashboard
          subject={subject}
          items={items}
          revision={revision}
          fresh={fresh}
          upcoming={upcoming}
          now={now}
          locked={locked}
          start={() => {
            commit(startSession(data, subject.id, revision?.id ?? fresh?.id));
            setView("session");
          }}
        />
      )}{" "}
      {view === "session" && (
        <Session data={data} subject={subject} onCommit={commit} onEnded={() => setView("dashboard")} />
      )}{" "}
      {view === "queues" && (
        <Queues
          items={items}
          settings={subject.settings}
          now={now}
          onUpdate={(id, t, s) => {
            try {
              commit(updateItem(data, id, t, s));
            } catch (e) {
              setNotice((e as Error).message);
            }
          }}
          onDelete={(id) => {
            if (confirm("Delete this item permanently?")) commit(removeItem(data, id));
          }}
        />
      )}{" "}
      {view === "settings" && (
        <Settings
          data={data}
          subject={subject}
          save={commit}
          exportData={exportData}
          importData={importData}
          fileRef={fileRef}
          clear={async () => {
            if (confirm("Delete all data?")) {
              await indexedDbStorage.clear();
              setData(emptyAppData());
            }
          }}
        />
      )}
    </main>
  );
}
function Dashboard({
  subject,
  items,
  revision,
  fresh,
  upcoming,
  now,
  locked,
  start,
}: {
  subject: Subject;
  items: StudyItem[];
  revision: StudyItem | null;
  fresh: StudyItem | null;
  upcoming: StudyItem | null;
  now: Date;
  locked: boolean;
  start: () => void;
}) {
  const count = (s: ItemStatus) => items.filter((i) => i.status === s).length;
  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow">{subject.title.toUpperCase()}</p>
          <h2>
            {revision || fresh
              ? "Ready for one focused attempt."
              : "Start a session to add and attempt an item."}
          </h2>
          <p>Each session handles one revision or fresh item, then must be ended.</p>
        </div>
        <button className="primary" disabled={locked} onClick={start}>
          Start Study Session
        </button>
      </div>
      <div className="cards">
        <Card title="Next revision">
          <Summary
            item={revision}
            fallback={
              upcoming
                ? `Nothing due. Next: ${upcoming.title} — ${dueAt(upcoming, subject.settings)?.toLocaleString()}`
                : "No revision currently due"
            }
            now={now}
            subject={subject}
          />
        </Card>
        <Card title="Next fresh item">
          <Summary item={fresh} fallback="No fresh items remaining" />
          <p>{count("NEW")} remaining</p>
        </Card>
      </div>
      <div className="stats">
        {[
          ["Total", items.length],
          ["Fresh", count("NEW")],
          ["Due", items.filter((i) => i.status !== "NEW" && dueAt(i, subject.settings)! <= now).length],
          ["Attempts", items.reduce((n, i) => n + i.attemptCount, 0)],
          ...REVIEW_STATUSES.map((s) => [s, count(s)]),
        ].map(([l, v]) => (
          <div key={String(l)}>
            <strong>{v}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
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
function Summary({
  item,
  fallback,
  now,
  subject,
}: {
  item: StudyItem | null;
  fallback: string;
  now?: Date;
  subject?: Subject;
}) {
  return item ? (
    <>
      <strong>{item.title}</strong>
      <p>
        <span className={`badge ${item.status}`}>{item.status}</span> · {item.attemptCount} attempts
      </p>
      {now && subject && <small>{formatDue(item, now, subject.settings)}</small>}
    </>
  ) : (
    <p>{fallback}</p>
  );
}

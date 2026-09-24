/**
 * **Outbox** — Mutationen, die ohne Verbindung nicht rausgingen, werden hier
 * zwischengespeichert und nachgeholt, sobald wieder Netz da ist.
 *
 * Warum es das braucht: der Service-Worker beantwortet ausschließlich GETs aus
 * dem Cache (`public/sw.js`). Alles Schreibende lief vorher gegen die Wand — im
 * Konbini-Untergeschoss, in der Yamanote, im Shinkansen-Tunnel war die getippte
 * Ausgabe nach dem Fehler-Toast weg. Genau dort wird die App aber benutzt.
 *
 * ⚠️ **Warum im Client und nicht per Background Sync im Service-Worker:**
 * die Background-Sync-API gibt es in Safari/iOS **nicht** — auf dem iPhone, für
 * das diese App auch als native Hülle gebaut wird, wäre sie wirkungslos. Der
 * Client-Weg funktioniert überall und liegt außerdem an der Stelle, durch die
 * ohnehin jede Mutation läuft (`src/lib/api/client.ts`).
 *
 * ⚠️ **IndexedDB, nicht localStorage:** ein angehängtes Beleg-Foto ist eine
 * Data-URL von bis zu 1,5 MB. localStorage ist bei ~5 MB zu Ende und blockiert
 * beim Schreiben den Haupt-Thread.
 */

import { isQueueable, usesClientId } from "./queueable";

/** Wird nach jedem Lauf gefeuert, bei dem etwas durchging — Listen laden dann neu. */
export const SYNCED_EVENT = "clover:synced";

const DB_NAME = "clover-outbox";
const STORE = "requests";
const DB_VERSION = 1;

/** Nach so vielen vergeblichen Anläufen gilt ein Eintrag als verloren. */
const MAX_ATTEMPTS = 5;

export type OutboxEntry = {
  /** Autoincrement — zugleich die **Reihenfolge**, in der nachgeholt wird. */
  seq: number;
  method: string;
  path: string;
  body?: unknown;
  createdAt: number;
  attempts: number;
  /** POST mit selbst vergebener Id → eine 409 beim Nachholen heißt „war schon da". */
  ownId: boolean;
};

type NewEntry = Omit<OutboxEntry, "seq">;

/* ------------------------------------------------------------------ IndexedDB */

let dbPromise: Promise<IDBDatabase | null> | null = null;

/**
 * IndexedDB öffnen. Gibt `null` zurück, wenn es sie nicht gibt oder der Browser
 * sie verweigert (privates Fenster, blockierte Website-Daten).
 *
 * ⚠️ Der `null`-Fall ist kein Randfall, den man ignorieren darf: die Aufrufer
 * müssen dann wieder den **Fehler** zeigen. Eine Warteschlange, die stillschweigend
 * nichts speichert, wäre schlimmer als gar keine — der Nutzer hielte die Ausgabe
 * für gesichert.
 */
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/* -------------------------------------------------------------- Abonnenten */

type Listener = (count: number) => void;
const listeners = new Set<Listener>();

/** Auf Änderungen der Warteschlangenlänge hören (für die Anzeige in der Leiste). */
export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  void count().then(fn);
  return () => listeners.delete(fn);
}

/** Letzter bekannter Füllstand — spart eine IndexedDB-Runde bei jedem GET. */
let cachedCount: number | null = null;

async function notify(): Promise<void> {
  const n = await count();
  cachedCount = n;
  for (const fn of listeners) fn(n);
}

/**
 * Offline angelegte Datensätze, die zu dieser Sammlung gehören.
 *
 * ⚠️ Ohne das hätte die Warteschlange ein sichtbares Loch: der Service-Worker
 * beantwortet `GET /api/v1/expenses` offline aus seinem Cache, und in dem Stand
 * steht der gerade erfasste Eintrag naturgemäß nicht. Nach einem Neuladen wäre
 * er aus der Liste verschwunden, obwohl er sehr wohl noch gesendet wird — und
 * wer ihn dann erneut eintippt, hat ihn am Ende doppelt. Genau der Fehler, den
 * die Warteschlange verhindern soll.
 *
 * Nur **Anlagen** werden eingeblendet, nicht wartende Änderungen: ein
 * zurückgesetzter Haken sieht nach einem Neuladen kurz alt aus, was harmlos
 * ist — ein fehlender Datensatz verführt dagegen zum Doppeleintrag.
 */
export async function pendingCreates(collectionPath: string): Promise<unknown[]> {
  if (cachedCount === null) cachedCount = await count();
  if (cachedCount === 0) return [];
  const entries = await readAll();
  return entries
    .filter((e) => e.method === "POST" && e.ownId && e.path === collectionPath)
    .map((e) => ({
      ...(e.body && typeof e.body === "object" ? (e.body as object) : {}),
      createdAt: new Date(e.createdAt).toISOString(),
      pendingSync: true,
    }));
}

/* ------------------------------------------------------------------ Zugriff */

/** Anzahl wartender Mutationen. */
export async function count(): Promise<number> {
  return (await tx<number>("readonly", (s) => s.count())) ?? 0;
}

/** Alle wartenden Mutationen in Einfüge-Reihenfolge. */
async function readAll(): Promise<OutboxEntry[]> {
  const all = await tx<OutboxEntry[]>("readonly", (s) => s.getAll() as IDBRequest<OutboxEntry[]>);
  return (all ?? []).sort((a, b) => a.seq - b.seq);
}

/**
 * Mutation einreihen. `false` heißt: **nicht** gespeichert (keine IndexedDB) —
 * der Aufrufer muss dann den normalen Fehler melden.
 */
export async function enqueue(entry: NewEntry): Promise<boolean> {
  const key = await tx<IDBValidKey>("readwrite", (s) => s.add(entry) as IDBRequest<IDBValidKey>);
  if (key === null) return false;
  await notify();
  return true;
}

async function remove(seq: number): Promise<void> {
  await tx<undefined>("readwrite", (s) => s.delete(seq) as IDBRequest<undefined>);
}

async function bumpAttempts(entry: OutboxEntry): Promise<void> {
  await tx<IDBValidKey>(
    "readwrite",
    (s) => s.put({ ...entry, attempts: entry.attempts + 1 }) as IDBRequest<IDBValidKey>,
  );
}

/* -------------------------------------------------------------------- Flush */

export type FlushResult = {
  /** Erfolgreich nachgeholt. */
  sent: number;
  /** Vom Server endgültig abgelehnt (4xx) bzw. zu oft gescheitert — verworfen. */
  dropped: number;
  /** Noch offen (Verbindung wieder weg). */
  pending: number;
};

let flushing: Promise<FlushResult> | null = null;

/**
 * Warteschlange abarbeiten — **streng der Reihe nach**.
 *
 * ⚠️ Die Reihenfolge ist Teil der Richtigkeit, nicht nur Kosmetik: das Anlegen
 * einer Ausgabe und das Anhängen ihres Belegs sind zwei Anfragen, und die
 * zweite nennt die Id der ersten. Parallel abgeschickt käme das PATCH vor dem
 * POST an und liefe ins Leere.
 *
 * ⚠️ Beim ersten Netzfehler wird **abgebrochen**, nicht weitergemacht: die
 * Verbindung ist dann weg, jeder weitere Versuch scheitert ebenso — und ein
 * Eintrag, der später an die Reihe käme, dürfte nicht vor einem früheren
 * durchrutschen.
 */
export function flush(): Promise<FlushResult> {
  // Gleichzeitige Aufrufe (online-Event + Timer + Seitenaufbau) teilen sich
  // einen Lauf; sonst schickten zwei Läufe dieselben Einträge doppelt los.
  if (flushing) return flushing;
  flushing = runFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function runFlush(): Promise<FlushResult> {
  const entries = await readAll();
  let sent = 0;
  let dropped = 0;

  for (const entry of entries) {
    const hasBody = entry.body !== undefined;
    let res: Response;
    try {
      res = await fetch(entry.path, {
        method: entry.method,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
        body: hasBody ? JSON.stringify(entry.body) : undefined,
      });
    } catch {
      // Immer noch kein Netz → alles Weitere bleibt liegen.
      break;
    }

    if (res.ok) {
      await remove(entry.seq);
      sent++;
      continue;
    }

    // 409 auf ein POST mit eigener Id = der Datensatz liegt bereits. Das ist
    // der Normalfall nach einer verlorenen Antwort, kein Fehler.
    if (res.status === 409 && entry.ownId) {
      await remove(entry.seq);
      sent++;
      continue;
    }

    // 4xx = der Server wird diese Anfrage nie annehmen (ungültig, gelöscht,
    // keine Berechtigung). Liegen lassen hieße, die Schlange für immer zu
    // blockieren.
    if (res.status >= 400 && res.status < 500) {
      await remove(entry.seq);
      dropped++;
      continue;
    }

    // 5xx kann vorübergehend sein → erneut versuchen, aber nicht endlos.
    if (entry.attempts + 1 >= MAX_ATTEMPTS) {
      await remove(entry.seq);
      dropped++;
      continue;
    }
    await bumpAttempts(entry);
    break;
  }

  await notify();
  // Die Oberfläche zeigt bis hierhin Platzhalter — jetzt gibt es echte
  // Serverdaten (Wechselkurs, Ersteller, Beleg-Flag). Listen laden neu.
  if (sent > 0 && typeof window !== "undefined") {
    window.dispatchEvent(new Event(SYNCED_EVENT));
  }
  return { sent, dropped, pending: await count() };
}

/* --------------------------------------------------------- Einreihen + Platzhalter */


/**
 * Eine gescheiterte Mutation in die Warteschlange legen und eine **vorläufige**
 * Antwort bauen, mit der die Oberfläche weiterarbeiten kann.
 *
 * `null` heißt: nicht übernommen (Endpunkt nicht in der Allowlist oder keine
 * IndexedDB) → der Aufrufer meldet den Fehler wie bisher.
 *
 * ⚠️ Die Id kommt bei anlegenden POSTs **vom Client** und ist genau die, unter
 * der der Datensatz später auch auf dem Server liegt. Deshalb funktioniert ein
 * anschließendes PATCH/DELETE auf denselben Datensatz ohne Umschreiben der
 * Warteschlange — und deshalb ist das Nachholen idempotent (s. `queueable.ts`).
 *
 * ⚠️ Der Platzhalter trägt `pendingSync: true`. Die Oberfläche **muss** das
 * kenntlich machen: gezeigt wird hier der Wunsch des Nutzers, nicht der Stand
 * des Servers. Felder, die erst der Server füllt (eingefrorener Wechselkurs,
 * Ersteller-Name), fehlen bewusst, statt geraten zu werden — nach dem
 * Nachholen ersetzt die echte Antwort den Platzhalter.
 */
export async function queueMutation(
  method: string,
  path: string,
  body: unknown,
): Promise<{ response: unknown } | null> {
  if (!isQueueable(method, path)) return null;

  const withId = usesClientId(method, path);
  const id = withId ? newId() : null;
  const payload =
    withId && body && typeof body === "object" ? { ...(body as object), id } : body;

  const stored = await enqueue({
    method,
    path,
    body: payload,
    createdAt: Date.now(),
    attempts: 0,
    ownId: withId,
  });
  if (!stored) return null;

  const base = payload && typeof payload === "object" ? { ...(payload as object) } : {};
  return {
    response: {
      ...base,
      ...(id ? { id, createdAt: new Date().toISOString() } : {}),
      pendingSync: true,
    },
  };
}

/**
 * Id für einen offline angelegten Datensatz.
 * `randomUUID` ist überall verfügbar, wo es auch IndexedDB gibt; der Fallback
 * deckt unsichere Kontexte (http://…) ab, in denen `crypto.randomUUID` fehlt.
 */
function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `off-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

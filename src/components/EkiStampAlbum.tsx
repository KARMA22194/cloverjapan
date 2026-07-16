"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api/client";
import { STAMP_CATALOG } from "@/lib/ekiStamps";

interface Collected {
  stampKey: string;
  by: string;
  at: string;
}

const SEAL = "#b7282e"; // Hanko-Rot (japanische Stempelfarbe)

export function EkiStampAlbum() {
  const [collected, setCollected] = useState<Record<string, Collected>>({});
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    return api
      .get<{ collected: Collected[] }>("/api/v1/stamps")
      .then((r) => {
        const map: Record<string, Collected> = {};
        r.collected.forEach((c) => (map[c.stampKey] = c));
        setCollected(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
  }, []);

  function collectHere() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNote({ ok: false, text: "Standort wird von diesem Gerät nicht unterstützt." });
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await api.post<{ name: string }>("/api/v1/stamps/collect", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setNote({ ok: true, text: `🎉 Stempel „${r.name}" freigeschaltet!` });
          await load();
        } catch {
          // Fehlermeldung (z. B. „kein Stempel-Ort in der Nähe") erscheint als Toast.
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setNote({ ok: false, text: "Standortzugriff abgelehnt – in den Browser-Einstellungen erlauben." });
      },
      // maximumAge: 0 → immer frische Position (man will den Ort *jetzt*).
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  const count = Object.keys(collected).length;
  const total = STAMP_CATALOG.length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Stempel-Sammlung{" "}
            <span className="tabular-nums" style={{ color: SEAL }}>
              {count}/{total}
            </span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Steh an einer Station oder einem Tempel und schalte den Stempel frei.
          </p>
        </div>
        <button
          type="button"
          onClick={collectHere}
          disabled={locating}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          📍 {locating ? "Suche Ort…" : "Stempel hier sammeln"}
        </button>
      </div>

      {note && (
        <p
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            note.ok
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          }`}
        >
          {note.text}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">Album wird geladen…</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {STAMP_CATALOG.map((s) => {
            const got = collected[s.key];
            return (
              <div
                key={s.key}
                className={`flex flex-col items-center rounded-xl border p-3 text-center transition ${
                  got
                    ? "bg-white dark:bg-slate-900"
                    : "border-dashed border-slate-200 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/30"
                }`}
                style={got ? { borderColor: `${SEAL}66` } : undefined}
              >
                <div
                  className="grid h-16 w-16 place-items-center rounded-full border-2 border-dashed text-2xl"
                  style={
                    got
                      ? { borderColor: SEAL, color: SEAL }
                      : { borderColor: "currentColor", opacity: 0.35 }
                  }
                >
                  <span className={got ? "" : "grayscale"} aria-hidden>
                    {s.emoji}
                  </span>
                </div>
                <p
                  className={`mt-2 text-xs font-medium ${
                    got ? "text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {s.name}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{s.area}</p>
                {got && got.by && (
                  <p className="mt-0.5 text-[10px]" style={{ color: SEAL }}>
                    ✓ {got.by}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

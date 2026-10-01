"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api/client";
import { displayTime, PREDICTION_MIN_MINUTES } from "@/lib/services/flightSchedule";

interface Endpoint {
  airportIata: string;
  scheduled: string | null;
  revised: string | null;
  predicted: string | null;
  terminal: string | null;
  checkInDesk: string | null;
  gate: string | null;
  baggageBelt?: string | null;
}
interface Live {
  found: boolean;
  flightNumber: string;
  status: string;
  departure: Endpoint;
  arrival: Endpoint & { baggageBelt: string | null };
}

// AeroDataBox-Status → deutsches Label + Farbton.
const STATUS: Record<string, { label: string; cls: string }> = {
  Expected: { label: "Planmäßig", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  Scheduled: { label: "Planmäßig", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  CheckIn: { label: "Check-in offen", cls: "bg-brand/15 text-brand-dark dark:text-brand-tint" },
  Boarding: { label: "Boarding", cls: "bg-brand/15 text-brand-dark dark:text-brand-tint" },
  GateClosed: { label: "Gate geschlossen", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  Departed: { label: "Gestartet", cls: "bg-brand/15 text-brand-dark dark:text-brand-tint" },
  EnRoute: { label: "Unterwegs", cls: "bg-brand/15 text-brand-dark dark:text-brand-tint" },
  Approaching: { label: "Im Anflug", cls: "bg-brand/15 text-brand-dark dark:text-brand-tint" },
  Arrived: { label: "Gelandet", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  Delayed: { label: "Verspätet", cls: "bg-danger/15 text-danger" },
  Canceled: { label: "Annulliert", cls: "bg-danger/15 text-danger" },
  CanceledUncertain: { label: "Annulliert?", cls: "bg-danger/15 text-danger" },
  Diverted: { label: "Umgeleitet", cls: "bg-danger/15 text-danger" },
  Unknown: { label: "Status unbekannt", cls: "bg-ink-subtle/20 text-ink-muted" },
};

/** Ein Info-Feld (z. B. „Gate B23") – nur anzeigen, wenn belegt. */
function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="rounded-md bg-surface-2 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

/**
 * Die Zeit eines Endpunkts — in der Darstellung, die ihrer Verbindlichkeit
 * entspricht.
 *
 * ⚠️ Der Unterschied ist der ganze Punkt. Eine **gemeldete** Änderung wird rot
 * hervorgehoben und der Plan durchgestrichen: das ist passiert. Eine
 * **Vorhersage** bekommt ein „ca." und einen zurückhaltenden Ton, und der Plan
 * bleibt stehen — denn gültig ist weiterhin er. Vorher sahen beide gleich aus,
 * und damit stand neben dem grünen „Planmäßig" eine rote Verspätung.
 */
function TimeLine({ ep }: { ep: Endpoint }) {
  const t = displayTime(ep);
  if (!t.shown) return null;

  if (t.kind === "revised") {
    return (
      <span className="tabular-nums">
        <span className="text-ink-subtle line-through">{t.scheduled}</span>{" "}
        <span className="font-semibold text-danger">{t.shown}</span>
      </span>
    );
  }

  if (t.kind === "predicted") {
    return (
      <span className="tabular-nums">
        <span className="text-ink-muted">{t.scheduled}</span>{" "}
        <span className="font-medium text-amber-700 dark:text-amber-400">ca. {t.shown}</span>
      </span>
    );
  }

  return <span className="tabular-nums text-ink-muted">{t.shown}</span>;
}

export function FlightLiveStatus({ number, date }: { number: string; date: string }) {
  const [data, setData] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Kein State-Update nach dem Unmount (sonst React-Warnung + toter Request-Effekt).
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    api
      .get<Live>(`/api/v1/flights/live?number=${encodeURIComponent(number)}&date=${date}`)
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setErr(null);
      })
      .catch((e) => {
        if (alive.current) setErr(e instanceof Error ? e.message : "Live-Status nicht verfügbar.");
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
  }, [number, date]);

  useEffect(() => {
    load(); // initial immer laden
    // Alle 90 s aktualisieren — aber NUR bei sichtbarem, online Tab, sonst reißt das
    // eigene 60/h-Limit im Hintergrund (H6). Bei Rückkehr/Online sofort aktualisieren.
    const tick = () => {
      if (document.visibilityState === "visible" && navigator.onLine !== false) load();
    };
    const id = setInterval(tick, 90_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, [load]);

  if (loading && !data) {
    return <p className="text-xs text-ink-subtle">Live-Status wird geladen…</p>;
  }
  if (err && !data) {
    return <p className="text-xs text-ink-subtle">{err}</p>;
  }
  if (!data) return null;

  const st = STATUS[data.status] ?? STATUS.Unknown;
  const dep = data.departure;
  const arr = data.arrival;
  const noneAssigned =
    !dep.terminal && !dep.checkInDesk && !dep.gate && !arr.terminal && !arr.gate && !arr.baggageBelt;
  // „ca." braucht eine Erklärung — ein Hovertitel hilft auf dem Handy niemandem.
  const showsPrediction =
    displayTime(dep).kind === "predicted" || displayTime(arr).kind === "predicted";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
        <span className="text-xs text-ink-muted">
          <TimeLine ep={dep} />
          {" → "}
          <TimeLine ep={arr} />
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">
            Abflug {dep.airportIata && `· ${dep.airportIata}`}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <Field label="Terminal" value={dep.terminal} />
            <Field label="Check-in" value={dep.checkInDesk} />
            <Field label="Gate" value={dep.gate} />
          </div>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-ink-muted">
            Ankunft {arr.airportIata && `· ${arr.airportIata}`}
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            <Field label="Terminal" value={arr.terminal} />
            <Field label="Gate" value={arr.gate} />
            <Field label="Gepäckband" value={arr.baggageBelt} />
          </div>
        </div>
      </div>

      {showsPrediction && (
        <p className="text-[11px] text-ink-subtle">
          „ca." ist eine Vorhersage des Datendienstes (ab {PREDICTION_MIN_MINUTES} min Abweichung),
          keine Meldung der Airline. Verbindlich bleibt die geplante Zeit.
        </p>
      )}

      {noneAssigned && (
        <p className="text-[11px] text-ink-subtle">
          Gate, Check-in-Schalter und Gepäckband werden meist erst wenige Stunden vor Abflug
          vergeben.
        </p>
      )}
    </div>
  );
}

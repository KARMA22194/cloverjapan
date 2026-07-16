"use client";

/**
 * Statische Notfall- & Basics-Infos für Japan (deutsche Reisende).
 * Rein informativ – vor der Reise auf Aktualität prüfen (Nummern/Adressen).
 */

interface Contact {
  label: string;
  value: string;
  tel?: string;
  note?: string;
}

const EMERGENCY: Contact[] = [
  { label: "Polizei", value: "110", tel: "110", note: "kostenlos, landesweit" },
  { label: "Feuerwehr & Rettung", value: "119", tel: "119", note: "Notarzt/Ambulanz" },
  {
    label: "Japan Visitor Hotline (JNTO)",
    value: "050-3816-2787",
    tel: "+815038162787",
    note: "24 h, Englisch – Notfall, Wegweiser, Übersetzung",
  },
];

const EMBASSY: Contact[] = [
  {
    label: "Deutsche Botschaft Tokio",
    value: "+81 3 5791-7700",
    tel: "+81357917700",
    note: "4-5-10 Minami-Azabu, Minato-ku, Tokyo 106-0047",
  },
  {
    label: "Dt. Generalkonsulat Osaka-Kobe",
    value: "+81 6 6440-5070",
    tel: "+81664405070",
    note: "Umeda, Kita-ku, Osaka",
  },
];

const BASICS: { emoji: string; title: string; text: string }[] = [
  {
    emoji: "🧾",
    title: "Tax-Free einkaufen",
    text: "Steuerfrei ab ¥5.000 (netto) pro Laden und Tag – Reisepass zwingend vorzeigen. Ware ggf. versiegelt, erst nach der Ausreise öffnen.",
  },
  {
    emoji: "🙅",
    title: "Kein Trinkgeld",
    text: "Trinkgeld ist in Japan unüblich und kann als unhöflich gelten. Der Preis ist der Preis.",
  },
  {
    emoji: "🔌",
    title: "Strom & Stecker",
    text: "100 V, 50/60 Hz. Steckdosen Typ A/B (US-Stil, flache Pins) – Adapter aus Deutschland (Typ F) nötig.",
  },
  {
    emoji: "💴",
    title: "Bargeld & Karten",
    text: "Vieles läuft über Bargeld und IC-Karten (Suica/Pasmo). Ausländische Karten am zuverlässigsten an 7-Eleven- und Japan-Post-Automaten.",
  },
  {
    emoji: "🚰",
    title: "Leitungswasser",
    text: "Leitungswasser ist trinkbar. Kostenlose Wasserspender & Getränkeautomaten überall.",
  },
  {
    emoji: "📶",
    title: "Verbindung",
    text: "Ohne Roaming: Pocket-WLAN oder eSIM. Notrufe (110/119) gehen auch ohne SIM/Guthaben.",
  },
];

const PHRASES: { de: string; ja: string; roman: string }[] = [
  { de: "Hilfe!", ja: "助けて！", roman: "Tasukete!" },
  { de: "Bitte rufen Sie die Polizei.", ja: "警察を呼んでください。", roman: "Keisatsu o yonde kudasai." },
  { de: "Ich brauche einen Arzt.", ja: "医者が必要です。", roman: "Isha ga hitsuyō desu." },
  { de: "Wo ist das Krankenhaus?", ja: "病院はどこですか？", roman: "Byōin wa doko desu ka?" },
  { de: "Danke.", ja: "ありがとうございます。", roman: "Arigatō gozaimasu." },
  { de: "Entschuldigung.", ja: "すみません。", roman: "Sumimasen." },
];

function ContactCard({ title, contacts }: { title: string; contacts: Contact[] }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-semibold text-brand-dark dark:text-brand-tint">
        {title}
      </div>
      <ul>
        {contacts.map((c) => (
          <li
            key={c.label}
            className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-800 dark:text-slate-100">{c.label}</p>
              {c.note && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{c.note}</p>
              )}
            </div>
            {c.tel ? (
              <a
                href={`tel:${c.tel}`}
                className="shrink-0 rounded-md bg-brand-tint px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-dark transition hover:opacity-90"
              >
                {c.value}
              </a>
            ) : (
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {c.value}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotfallInfo() {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-slate-700 dark:text-slate-200">
        <span className="font-semibold text-danger">Im Notfall:</span> Polizei{" "}
        <a href="tel:110" className="font-semibold text-danger underline">110</a>, Feuerwehr &
        Rettung{" "}
        <a href="tel:119" className="font-semibold text-danger underline">119</a>. Notrufe
        funktionieren auch ohne SIM/Guthaben.
      </div>

      <ContactCard title="Notrufnummern" contacts={EMERGENCY} />
      <ContactCard title="Deutsche Vertretungen" contacts={EMBASSY} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Gut zu wissen
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {BASICS.map((b) => (
            <div
              key={b.title}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3"
            >
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                <span aria-hidden>{b.emoji}</span> {b.title}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{b.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-2 text-sm font-semibold text-brand-dark dark:text-brand-tint">
          Wichtige Sätze
        </div>
        <ul>
          {PHRASES.map((p) => (
            <li
              key={p.de}
              className="border-b border-slate-100 dark:border-slate-800 px-4 py-2.5 last:border-b-0"
            >
              <p className="text-sm text-slate-800 dark:text-slate-100">{p.de}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                <span className="text-base">{p.ja}</span>
                <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{p.roman}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Angaben ohne Gewähr – vor der Reise auf Aktualität prüfen.
      </p>
    </div>
  );
}

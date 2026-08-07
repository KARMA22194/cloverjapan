"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { resizeImage } from "@/lib/image";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SECTION_GROUPS, SECTION_ICONS, SECTION_IDS, ICON_PIXEL_SIZE, ICON_MAX_BYTES, type SectionId } from "@/lib/sectionIcons";

/**
 * Eigene Bereichs-Symbole wählen.
 *
 * Standard bleibt überall das Emoji; wer will, hinterlegt pro Bereich ein eigenes
 * Bild. Die Wahl liegt im Konto (`UserSectionIcon`) und gilt damit auf allen
 * Geräten — sie ist **persönlich**, andere Mitglieder sehen weiter ihre eigenen.
 *
 * Das App-Logo ist bewusst nicht dabei: es ist Markenzeichen, keine
 * Bereichs-Illustration.
 */
export function SectionIconSettings({ userId }: { userId?: string } = {}) {
  const router = useRouter();
  // Ohne `userId` das eigene Konto (`/me`), mit `userId` ein fremdes (nur ADMIN).
  // Beides dieselbe Oberfläche — der einzige Unterschied ist der Endpunkt.
  const base = userId ? `/api/v1/users/${userId}/icons` : "/api/v1/me/icons";
  const forOther = Boolean(userId);
  const [icons, setIcons] = useState<Partial<Record<SectionId, string>>>({});
  const [busy, setBusy] = useState<SectionId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Ein verstecktes File-Input je Bereich wäre 24-mal derselbe Knoten — stattdessen
  // eines, dessen Ziel-Bereich vor dem Öffnen gemerkt wird.
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<SectionId | null>(null);

  useEffect(() => {
    api
      .get<Partial<Record<SectionId, string>>>(base)
      .then(setIcons)
      .catch(() => {});
  }, [base]);

  function pick(id: SectionId) {
    target.current = id;
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    fileRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const id = target.current;
    if (!file || !id) return;
    setBusy(id);
    setError(null);
    try {
      // **PNG**, nicht JPEG: ein freigestelltes Motiv soll seine Transparenz
      // behalten — JPEG hat keinen Alphakanal und färbte den Hintergrund schwarz.
      // Und *kein* `square`: das würde mittig beschneiden und bei einem hohen
      // Motiv die Ränder abschneiden. Seitenverhältnis bleibt, die Anzeige passt
      // es per `object-contain` in die quadratische Fläche ein.
      const data = await resizeImage(file, { max: ICON_PIXEL_SIZE, type: "image/png" });
      if (data.length > ICON_MAX_BYTES) {
        setError("Bild zu groß – bitte ein einfacheres Motiv nehmen.");
        return;
      }
      await api.put(`${base}/${id}`, { data });
      setIcons((prev) => ({ ...prev, [id]: data }));
      // Nur beim eigenen Konto neu rendern — das eigene Layout zeigt die eigenen
      // Symbole; ein fremdes Konto sieht seine Änderung beim nächsten Aufruf.
      if (!forOther) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Konnte nicht gespeichert werden.");
    } finally {
      setBusy(null);
    }
  }

  async function reset(id: SectionId) {
    setBusy(id);
    setError(null);
    try {
      await api.delete(`${base}/${id}`);
      setIcons((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (!forOther) router.refresh();
    } catch {
      setError("Konnte nicht zurückgesetzt werden.");
    } finally {
      setBusy(null);
    }
  }

  const customCount = Object.keys(icons).length;

  return (
    <Card pad="lg" className={forOther ? "mt-3" : "mt-6"}>
      <h2 className="text-sm font-bold text-ink">Bereichs-Symbole</h2>
      <p className="mt-1 text-xs text-ink-muted">
        {forOther
          ? "Standard sind Emoji. Als Admin kannst du die Symbole dieses Kontos ersetzen — sie gelten nur für diese Person."
          : "Standard sind Emoji. Du kannst jedes Symbol durch ein eigenes Bild ersetzen — das sehen nur du, nicht die anderen Mitglieder."}{" "}
        Das App-Logo bleibt unverändert.
        {customCount > 0 && ` Aktuell ${customCount} eigene.`}
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFile}
        className="hidden"
      />
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-4 space-y-5">
        {SECTION_GROUPS.map((group) => {
          const ids = SECTION_IDS.filter((id) => SECTION_ICONS[id].group === group);
          return (
            <div key={group}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-ink-subtle">
                {group}
              </p>
              <ul className="space-y-1">
                {ids.map((id) => {
                  const custom = icons[id];
                  const working = busy === id;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-3 rounded-field px-2 py-1.5 transition hover:bg-surface-2"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-field bg-brand/10 ring-1 ring-brand/15">
                        {custom ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={custom}
                            alt=""
                            aria-hidden
                            className="h-5 w-5 object-contain"
                          />
                        ) : (
                          <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
                            {SECTION_ICONS[id].emoji}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {SECTION_ICONS[id].label}
                        {custom && (
                          <span className="ml-2 text-[11px] text-ink-subtle">eigenes Bild</span>
                        )}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => pick(id)}
                        disabled={working}
                      >
                        {working ? "…" : custom ? "Ändern" : "Bild wählen"}
                      </Button>
                      {custom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => reset(id)}
                          disabled={working}
                          className="text-danger hover:bg-danger/10"
                        >
                          Zurücksetzen
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-ink-subtle">
        Bilder werden auf höchstens {ICON_PIXEL_SIZE}×{ICON_PIXEL_SIZE} verkleinert — das
        Seitenverhältnis bleibt, es wird nichts abgeschnitten. Freigestellte PNGs mit
        transparentem Hintergrund sehen am besten aus; die Transparenz bleibt erhalten.
      </p>
    </Card>
  );
}

/**
 * Nel rapportino, le foto già fatte sul cantiere si scelgono dal rullino (24/11/2026): prima entravano da sole
 * solo quelle tue della giornata, e per una foto di ieri o di un collega bisognava rifarla. Un tocco seleziona,
 * un altro toglie; «Aggiungi» le mette nel rapportino fino al massimo consentito.
 */
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Images, X } from "lucide-react";
import { useFotoCantiereLettura } from "@/hooks/useFotoCantiere";
import { Miniatura, raggruppaFoto } from "@/components/campo/RullinoCampo";
import { riferimentoFile } from "@/lib/storage/fileRiservati";
import { cn } from "@/lib/utils";
import { PILLOLA } from "@/lib/campo/stileCampo";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export function ScegliDalRullino({ orderId, giaNelRapportino, posti, disabilitato, onAggiungi }: {
  orderId: string;
  /** I riferimenti già allegati: non si ripropongono come nuovi. */
  giaNelRapportino: string[];
  /** Quante foto si possono ancora aggiungere. */
  posti: number;
  disabilitato?: boolean;
  onAggiungi: (riferimenti: string[]) => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [scelte, setScelte] = useState<string[]>([]);
  const { foto, isLoading, getSignedUrl } = useFotoCantiereLettura(orderId);
  const { gruppi } = useMemo(() => raggruppaFoto(foto), [foto]);
  const rif = (path: string) => riferimentoFile("foto-cantiere", path);
  const gia = new Set(giaNelRapportino);
  const disponibili = foto.filter(f => !gia.has(rif(f.storage_path))).length;

  if (!isLoading && disponibili === 0) return null;
  const chiudi = () => { setAperto(false); setScelte([]); };
  const alterna = (r: string) => setScelte(prima => prima.includes(r) ? prima.filter(x => x !== r)
    : prima.length >= posti ? prima : [...prima, r]);

  return (
    <>
      <button type="button" disabled={disabilitato || posti === 0 || isLoading} onClick={() => setAperto(true)}
        className={cn(PILLOLA, "w-full disabled:opacity-60")}>
        <Images className="size-4 shrink-0" aria-hidden="true" />
        {t("Dal rullino del cantiere ({n})", { n: disponibili })}
      </button>
      {aperto && createPortal(
        <div role="dialog" aria-modal="true" aria-label={t("Scegli le foto del cantiere")} className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center gap-2 border-b px-2 pt-[max(env(safe-area-inset-top),0.5rem)] pb-2">
            <button type="button" onClick={chiudi} aria-label={t("Chiudi")} className="flex size-11 items-center justify-center rounded-full active:bg-muted">
              <X className="size-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold">{t("Scegli le foto del cantiere")}</p>
              <p className="text-xs text-muted-foreground">{t("Scelte {n} di {max}", { n: scelte.length, max: posti })}</p>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
            {gruppi.map(g => (
              <section key={g.giorno} className="space-y-1.5">
                <h3 className="px-0.5 text-[13px] font-bold first-letter:uppercase">
                  {g.giorno === "oggi" ? t("Oggi") : g.giorno === "ieri" ? t("Ieri") : g.giorno === "senza-data" ? t("Senza data")
                    : new Date(`${g.giorno}T12:00:00`).toLocaleDateString(intlCampo(), { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <div className="grid grid-cols-3 gap-1">
                  {g.righe.map(({ foto: f }) => {
                    const r = rif(f.storage_path);
                    const giaDentro = gia.has(r);
                    const scelta = scelte.includes(r);
                    return (
                      <div key={f.id} className={cn("relative", giaDentro && "opacity-40")} aria-disabled={giaDentro}>
                        <Miniatura foto={f} getSignedUrl={getSignedUrl} evidenzia={scelta}
                          onApri={() => { if (!giaDentro) alterna(r); }} />
                        <span aria-hidden="true" className={cn("pointer-events-none absolute end-1 top-1 flex size-6 items-center justify-center rounded-full border-2 border-white shadow",
                          scelta || giaDentro ? "bg-primary text-primary-foreground" : "bg-black/30")}>
                          {(scelta || giaDentro) && <Check className="size-3.5" />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <div className="border-t p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
            <button type="button" disabled={scelte.length === 0}
              onClick={() => { onAggiungi(scelte); chiudi(); }}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-primary-foreground disabled:opacity-50">
              {scelte.length === 0 ? t("Tocca le foto da aggiungere") : scelte.length === 1 ? t("Aggiungi 1 foto") : t("Aggiungi {n} foto", { n: scelte.length })}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

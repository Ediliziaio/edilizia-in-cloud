/**
 * La lista del mattino (manuale, Parte 12): gli allarmi del motore di regole
 * sui clienti attivi, i gravi in cima, ognuno con il motivo in numeri,
 * l'azione (un verbo), la scadenza, chi deve farla — e tre pulsanti: Fatto,
 * Non era un problema (alimenta la taratura), Rimanda a domani. Sotto, «da
 * guardare»: le note del motore e gli avvisi della console che il motore non
 * copre (costi mancanti, fatture, promemoria).
 */
import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, ExternalLink, Info, Loader2, ListChecks, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { azionePerRegola, type AzioneOggi, type VoceOggi } from "./provvigioni";
import type { Allarme } from "./useMktConsole";
import { dataBreve } from "./formato";

const ETICHETTA_AZIONE: Record<AzioneOggi, { testo: string; esterno?: boolean }> = {
  lead_fermi: { testo: "Apri i lead nel CRM" },
  ricollega_meta: { testo: "Apri Pubblicità" },
  inserzioni: { testo: "Gestione inserzioni", esterno: true },
  moduli: { testo: "Controlla i moduli" },
  costi: { testo: "Costi del mese" },
  referente: { testo: "Scrivi al referente", esterno: true },
  fatture: { testo: "Collega le fatture" },
  promemoria: { testo: "Apri Attività" },
  incassi: { testo: "Registro incassi" },
  entra: { testo: "Entra nell'azienda" },
};
const ENTRA_IN_AZIENDA: ReadonlySet<AzioneOggi> = new Set<AzioneOggi>(["lead_fermi", "ricollega_meta", "moduli", "fatture", "entra"]);
const GRAVITA: Record<string, { classe: string; etichetta: string }> = {
  grave: { classe: "text-rose-700 dark:text-rose-400", etichetta: "grave" },
  rosso: { classe: "text-rose-600 dark:text-rose-400", etichetta: "rosso" },
  giallo: { classe: "text-amber-600 dark:text-amber-400", etichetta: "giallo" },
  nota: { classe: "text-slate-500 dark:text-slate-400", etichetta: "nota" },
};

export type AllarmeConCliente = Allarme & { cliente: string; company_id: string };

interface Props {
  allarmi: AllarmeConCliente[];
  voci: VoceOggi[];
  aggiornatoAlle: string | null;
  oggi: Date;
  inCorso: string | null;
  puoEntrare: boolean;
  onApri: (a: AllarmeConCliente) => void;
  onChiudi: (id: string, esito: "risolto" | "falso_positivo" | "rimandato") => void;
  chiusuraInCorso: boolean;
  onAzione: (v: VoceOggi) => void;
  onRicalcola: () => void;
  ricalcoloInCorso: boolean;
}

export function CosaFareOggi({ allarmi, voci, aggiornatoAlle, oggi, inCorso, puoEntrare, onApri, onChiudi, chiusuraInCorso, onAzione, onRicalcola, ricalcoloInCorso }: Props) {
  const [tutte, setTutte] = useState(false);
  const azioni = allarmi.filter((a) => a.mostrato && a.gravita !== "nota");
  const note = allarmi.filter((a) => a.mostrato && a.gravita === "nota");
  const nascosti = allarmi.filter((a) => !a.mostrato).length;
  const gravi = azioni.filter((a) => a.gravita === "grave" || a.gravita === "rosso").length;
  const visibili = tutte ? azioni : azioni.slice(0, 5);

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Cosa fare oggi</h2>
        <span className="text-xs text-muted-foreground">
          {azioni.length === 0 ? "niente in coda" : `${azioni.length} ${azioni.length === 1 ? "azione" : "azioni"}${gravi ? ` · ${gravi} ${gravi === 1 ? "grave" : "gravi"}` : ""}`}
          {aggiornatoAlle ? ` · aggiornato ${dataBreve(aggiornatoAlle, true, oggi)}` : ""}
        </span>
        <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 text-xs" onClick={onRicalcola} disabled={ricalcoloInCorso} title="Ricalcola metriche e regole adesso (di norma alle 05:30 e ogni due ore)">
          {ricalcoloInCorso ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Ricalcola adesso
        </Button>
      </header>

      {azioni.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Nessun allarme aperto sui clienti attivi.
        </p>
      ) : (
        <ul className="divide-y">
          {visibili.map((a) => {
            const azione = azionePerRegola(a.regola);
            const et = ETICHETTA_AZIONE[azione];
            const entra = ENTRA_IN_AZIENDA.has(azione);
            const g = GRAVITA[a.gravita] ?? GRAVITA.nota;
            const scaduta = !!a.scadenza && new Date(a.scadenza) < oggi;
            return (
              <li key={a.id} className="px-4 py-2.5 text-sm">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", g.classe)} />
                  <div className="min-w-0 flex-1">
                    <div><span className="font-medium">{a.cliente}</span><span className="text-muted-foreground"> — {a.titolo}</span></div>
                    <div className="mt-0.5 text-[13px]">→ {a.azione}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {a.regola} · <span className={g.classe}>{g.etichetta}</span>
                      {a.scadenza ? <> · <span className={scaduta ? "font-medium text-rose-700 dark:text-rose-400" : ""}><Clock className="mr-0.5 inline h-3 w-3" />entro {dataBreve(a.scadenza, true, oggi)}</span></> : null}
                      {" · "}chi: {a.proprietario === "noi" ? "tu" : a.proprietario}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onApri(a)} disabled={entra && (!puoEntrare || inCorso === a.company_id)}>
                      {entra && inCorso === a.company_id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {et.testo}{et.esterno ? <ExternalLink className="h-3 w-3 opacity-60" /> : null}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => onChiudi(a.id, "risolto")} disabled={chiusuraInCorso} title="Fatto: l'allarme si chiude"><Check className="h-3 w-3" /> Fatto</Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => onChiudi(a.id, "falso_positivo")} disabled={chiusuraInCorso} title="Non era un problema: serve a tarare le soglie"><X className="h-3 w-3" /> Non era un problema</Button>
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => onChiudi(a.id, "rimandato")} disabled={chiusuraInCorso} title="Torna domani"><Clock className="h-3 w-3" /> Domani</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {azioni.length > 5 && (
        <button type="button" className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setTutte((v) => !v)}>
          {tutte ? "mostra solo le prime cinque" : `mostra tutte (${azioni.length})`}
        </button>
      )}

      {(note.length > 0 || voci.length > 0 || nascosti > 0) && (
        <div className="border-t px-4 py-2.5">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Da guardare</div>
          <ul className="space-y-1 text-xs">
            {note.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Info className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1"><span className="font-medium">{a.cliente}</span><span className="text-muted-foreground"> — {a.titolo} · {a.azione}</span></span>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => onChiudi(a.id, "risolto")} disabled={chiusuraInCorso}>Visto</Button>
              </li>
            ))}
            {voci.map((v) => {
              const et = ETICHETTA_AZIONE[v.azione];
              return (
                <li key={`${v.service_client_id}-${v.tipo}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AlertTriangle className={cn("h-3.5 w-3.5 shrink-0", v.grave ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")} />
                  <span className="min-w-0 flex-1"><span className="font-medium">{v.cliente}</span><span className="text-muted-foreground"> — {v.testo}</span></span>
                  <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[11px]" onClick={() => onAzione(v)} disabled={ENTRA_IN_AZIENDA.has(v.azione) && (!puoEntrare || inCorso === v.company_id)}>
                    {et.testo}{et.esterno ? <ExternalLink className="h-3 w-3 opacity-60" /> : null}
                  </Button>
                </li>
              );
            })}
            {nascosti > 0 && <li className="text-[11px] text-muted-foreground">Altri {nascosti} allarmi registrati e non mostrati (campione insufficiente, tetto di cinque per cliente, rimandati).</li>}
          </ul>
        </div>
      )}
    </section>
  );
}

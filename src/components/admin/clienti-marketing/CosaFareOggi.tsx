/**
 * La lista del mattino: gli avvisi di tutti i clienti attivi in un posto solo,
 * i gravi in cima, ognuno con l'azione che lo chiude — aprire i lead fermi,
 * ricollegare Meta, caricare i costi, scrivere al referente.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AzioneOggi, VoceOggi } from "./provvigioni";

const ETICHETTA_AZIONE: Record<AzioneOggi, { testo: string; esterno?: boolean }> = {
  lead_fermi: { testo: "Apri i lead nel CRM" },
  ricollega_meta: { testo: "Apri Pubblicità" },
  inserzioni: { testo: "Gestione inserzioni", esterno: true },
  moduli: { testo: "Controlla i moduli" },
  costi: { testo: "Carica i costi" },
  referente: { testo: "Scrivi al referente", esterno: true },
  fatture: { testo: "Collega le fatture" },
  promemoria: { testo: "Apri Attività" },
  entra: { testo: "Entra nell'azienda" },
};

const QUANTE_ALL_INIZIO = 8;

interface Props {
  voci: VoceOggi[];
  inCorso: string | null;
  puoEntrare: boolean;
  onAzione: (v: VoceOggi) => void;
}

export function CosaFareOggi({ voci, inCorso, puoEntrare, onAzione }: Props) {
  const [tutte, setTutte] = useState(false);
  const gravi = voci.filter((v) => v.grave).length;
  const visibili = tutte ? voci : voci.slice(0, QUANTE_ALL_INIZIO);

  return (
    <section className="rounded-xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Cosa fare oggi</h2>
        {voci.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {voci.length} {voci.length === 1 ? "cosa" : "cose"}{gravi > 0 ? ` · ${gravi} ${gravi === 1 ? "grave" : "gravi"}` : ""}
          </span>
        )}
      </header>
      {voci.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" /> Niente da fare: nessun avviso sui clienti attivi.
        </p>
      ) : (
        <ul className="divide-y">
          {visibili.map((v) => {
            const az = ETICHETTA_AZIONE[v.azione];
            const entra = ["lead_fermi", "ricollega_meta", "moduli", "fatture", "entra"].includes(v.azione);
            return (
              <li key={`${v.service_client_id}-${v.tipo}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                <AlertTriangle className={cn("h-4 w-4 shrink-0", v.grave ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400")} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{v.cliente}</span>
                  <span className="text-muted-foreground"> — {v.testo}</span>
                </span>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => onAzione(v)} disabled={entra && (!puoEntrare || inCorso === v.company_id)}>
                  {entra && inCorso === v.company_id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  {az.testo}{az.esterno ? <ExternalLink className="h-3 w-3 opacity-60" /> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {voci.length > QUANTE_ALL_INIZIO && (
        <button type="button" className="w-full border-t px-4 py-2 text-left text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setTutte((v) => !v)}>
          {tutte ? "mostra solo le prime" : `mostra tutte (${voci.length})`}
        </button>
      )}
    </section>
  );
}

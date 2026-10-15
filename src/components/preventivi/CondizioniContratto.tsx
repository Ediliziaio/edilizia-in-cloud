/**
 * Il blocco «Condizioni generali di contratto» degli editor dei modelli.
 *
 * Un preventivo firmato è il contratto: senza condizioni quel contratto non
 * dice niente su tempi, varianti, garanzie, pagamenti e recesso. Qui l'azienda
 * parte dal testo del proprio settore, lo rilegge e lo adatta; può anche
 * importare le condizioni che già usa (PDF o Word) o riusare un blocco della
 * libreria Template offerte.
 *
 * Stesso blocco per tutti i moduli: prima stava scritto a mano solo dentro
 * l'editor delle ristrutturazioni, e negli altri sette non c'era affatto.
 */
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EditorContratto } from './EditorContratto';
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
import { CopiaCondizioni } from './CopiaCondizioni';
import { condizioniStandard, type SettoreCondizioni } from "@/lib/condizioniStandard";
import type { QuoteTemplate } from "@/types/quoteTemplate";
import { htmlPerEditorContratto } from '@/lib/preventivi/contrattoEditor';

/** Conserva la formattazione del blocco copiato. */
export function testoDaBloccoLibreria(template: QuoteTemplate): string {
  const raw = String(template.body_html ?? template.contractual_terms_text ?? template.legal_terms_text ?? "");
  return htmlPerEditorContratto(raw);
}

interface Props {
  companyId: string | null | undefined;
  /** Il settore decide l'articolo che cambia da un mestiere all'altro. */
  settore: SettoreCondizioni;
  attivo: boolean;
  testo: string;
  onAttivo: (v: boolean) => void;
  onTesto: (v: string) => void;
  /** Il modulo di recesso allegato al preventivo: lo accende l'azienda, spento di serie. */
  recesso: boolean;
  onRecesso: (v: boolean) => void;
  localOnly?: boolean;
}

export function CondizioniContratto({ companyId, settore, attivo, testo, onAttivo, onTesto, recesso, onRecesso, localOnly = false }: Props) {
  const usaTestoDelSettore = () => {
    if (testo.trim() && !window.confirm("Sostituire il testo attuale con quello di base del settore?")) return;
    onTesto(condizioniStandard(settore));
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Clausole contrattuali</p>
          <p className="text-xs text-muted-foreground">
            Gli articoli che regolano i lavori. Pagamenti e validità dell’offerta si impostano sopra; qui puoi richiamarli senza riscriverli.
          </p>
        </div>
        <Switch checked={attivo} onCheckedChange={onAttivo} aria-label="Condizioni generali nel documento" />
      </div>

      {attivo && (
        <>
          {/* Vuoto non vuol dire «senza condizioni»: il documento stampa il testo di base
              del settore (adattatoreEdile). Qui lo si dice com'è, e si invita a rileggerlo. */}
          {!testo.trim() && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Il campo è vuoto: nel documento esce il <strong>testo di base del settore</strong>. Rileggilo e adattalo
              alla tua azienda: con «Parti dal testo del settore» lo porti qui e lo modifichi.
            </div>
          )}

          <CopiaCondizioni companyId={companyId} value={testo} onChange={onTesto} />
          <EditorContratto value={testo} onChange={onTesto} />
          <details open={!testo.trim()} className="rounded-lg border bg-background/70 p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Altre opzioni: importa un file o usa un testo di base</summary>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={usaTestoDelSettore}>
              Parti dal testo del settore
            </Button>
            <ImportaCondizioniBar companyId={companyId} testoAttuale={testo} onTesto={onTesto} compatto soloImport localOnly={localOnly} />
          </div>

          </details>
          <p className="text-[11px] text-muted-foreground">
            Campi automatici disponibili:{" "}
            <code>{"{{azienda.ragione_sociale}}"}</code>, <code>{"{{cliente.nome_completo}}"}</code>,{" "}
            <code>{"{{preventivo.numero}}"}</code>, <code>{"{{preventivo.totale}}"}</code>,{" "}
            <code>{"{{preventivo.piano_pagamenti}}"}</code>, <code>{"{{preventivo.frase_pagamenti}}"}</code>{" "}
            (la frase intera sui pagamenti: cita il piano solo se c'è), <code>{"{{cantiere.indirizzo}}"}</code>.
            <br />
            Il testo di base è un punto di partenza scritto sulle norme più ricorrenti nei lavori edili: rileggilo con il
            tuo consulente prima di usarlo con i clienti.
          </p>

          {/* Il modulo di recesso è una scelta dell'azienda, spenta di serie (21/09/2026):
              serve solo a chi firma con un privato fuori dalla sede o a distanza. */}
          <div className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">Allega il modulo di recesso</p>
              <p className="text-xs text-muted-foreground">
                Serve quando firmi con un privato a casa sua o a distanza (online, al telefono): senza, il cliente può
                arrivare a recedere fino a 12 mesi dopo, anche a lavori finiti. A chi vende ad aziende o fa firmare in
                sede non serve.
              </p>
            </div>
            <Switch checked={recesso} onCheckedChange={onRecesso} aria-label="Allega il modulo di recesso" />
          </div>
        </>
      )}
    </div>
  );
}

export default CondizioniContratto;

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
import { useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImportaCondizioniBar } from "@/components/quote-templates/ImportaCondizioniBar";
import { useQuoteTemplates } from "@/hooks/useQuoteTemplates";
import { condizioniStandard, type SettoreCondizioni } from "@/lib/condizioniStandard";
import type { QuoteTemplate } from "@/types/quoteTemplate";

/** Da blocco della libreria (HTML ricco) al markdown povero che i PDF impaginano. */
export function testoDaBloccoLibreria(template: QuoteTemplate): string {
  const raw = String(template.body_html ?? template.contractual_terms_text ?? template.legal_terms_text ?? "");
  return raw
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ").replace(/<h[1-6][^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
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
}

export function CondizioniContratto({ companyId, settore, attivo, testo, onAttivo, onTesto, recesso, onRecesso }: Props) {
  const { templates: templatesLibreria } = useQuoteTemplates();
  const blocchi = useMemo(
    () => templatesLibreria.filter((t) => t.is_active !== false && (t.kind === "condizioni" || t.kind === "legali")),
    [templatesLibreria],
  );
  const [bloccoId, setBloccoId] = useState("");

  const applicaBlocco = (modo: "replace" | "append") => {
    const blocco = blocchi.find((b) => b.id === bloccoId);
    if (!blocco) return;
    const nuovo = testoDaBloccoLibreria(blocco);
    if (!nuovo) return;
    const attuale = testo.trim();
    onTesto(modo === "append" && attuale ? `${attuale}\n\n${nuovo}` : nuovo);
  };

  const usaTestoDelSettore = () => {
    if (testo.trim() && !window.confirm("Sostituire il testo attuale con quello di base del settore?")) return;
    onTesto(condizioniStandard(settore));
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium flex items-center gap-1.5"><Scale className="h-3.5 w-3.5" /> Condizioni generali di contratto</p>
          <p className="text-xs text-muted-foreground">
            Oggetto, pagamenti, tempi, varianti, garanzie, recesso, foro. Nel PDF diventano una pagina dedicata, seguita
            dalla pagina della firma con l'approvazione delle clausole (art. 1341 c.c.).
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

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={usaTestoDelSettore}>
              Parti dal testo del settore
            </Button>
            <ImportaCondizioniBar companyId={companyId} testoAttuale={testo} onTesto={onTesto} compatto soloImport />
          </div>

          {blocchi.length > 0 && (
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <select
                value={bloccoId}
                onChange={(e) => setBloccoId(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Riusa un blocco dalla libreria Template offerte…</option>
                {blocchi.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!bloccoId} onClick={() => applicaBlocco("replace")}>Sostituisci</Button>
                <Button size="sm" variant="outline" disabled={!bloccoId} onClick={() => applicaBlocco("append")}>Aggiungi in coda</Button>
              </div>
            </div>
          )}

          <Textarea
            value={testo}
            onChange={(e) => onTesto(e.target.value)}
            rows={14}
            className="font-mono text-[12px] leading-relaxed"
            placeholder={"# Condizioni generali di contratto\n\n## Art. 1 — Oggetto\n…\n\n# Clausole da approvare specificamente\n- Art. 4 — Pagamenti\n…"}
          />
          <p className="text-[11px] text-muted-foreground">
            Formato: <code>#</code> sezione, <code>##</code> articolo, <code>-</code> elenco. Tag disponibili:{" "}
            <code>{"{{azienda.ragione_sociale}}"}</code>, <code>{"{{cliente.nome_completo}}"}</code>,{" "}
            <code>{"{{preventivo.numero}}"}</code>, <code>{"{{preventivo.totale}}"}</code>,{" "}
            <code>{"{{preventivo.piano_pagamenti}}"}</code>, <code>{"{{cantiere.indirizzo}}"}</code>.
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

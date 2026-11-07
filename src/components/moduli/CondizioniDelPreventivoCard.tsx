/**
 * «Condizioni contrattuali» nel preventivo (27/10/2026): due cose che prima si potevano decidere solo per tutta
 * l'azienda, nel modello.
 *
 *   · Il PDF esce CON o SENZA la parte contrattuale: il primo invio al cliente spesso è solo il prezzo.
 *   · Le condizioni si possono riscrivere per QUESTO preventivo, quando il cliente lo chiede. Lo può fare solo chi
 *     gestisce i modelli dell'azienda; gli altri le vedono e basta.
 *
 * Una regola resta ferma: il PDF che va in firma le ha sempre, perché il preventivo firmato è il contratto. Qui si
 * dice, e chi manda in firma passa dal progetto di `perLaFirma()`.
 */
import { useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Link } from "react-router-dom";
import { Eye, FileText, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { AnteprimaCondizioniDialog } from "@/components/preventivi/CondizioniContratto";
import type { ModelloArchivio } from "@/lib/condizioni/archivio";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { usePermissions } from "@/hooks/usePermissions";
import { useCondizioniArchivio } from "@/hooks/useCondizioniArchivio";
import { htmlDelModello, testoPiano } from "@/lib/condizioni/archivio";
import { PAGINA_CONDIZIONI } from "@/lib/condizioni/indirizzi";
import { htmlPerEditorContratto } from "@/lib/preventivi/contrattoEditor";
import { cn } from "@/lib/utils";
import {
  condizioniRiscritte, condizioniTolteDalPdf, haTesto, puoRiscrivereLeCondizioni,
  type CondizioniDelPreventivo,
} from "@/lib/preventivi/condizioniDelPreventivo";

interface Props {
  progetto: CondizioniDelPreventivo | null | undefined;
  onChange: (patch: Partial<CondizioniDelPreventivo>) => void;
  /** Il testo che il modello del preventivatore aveva: vale solo se l'archivio non ha niente. */
  testoDelModello?: string | null;
  /** Il modello di «Contratti e condizioni» associato al preventivatore (07/11/2026). */
  modelloAssociatoId?: string | null;
  /** L'azienda ha spento le condizioni nel modello: allora non escono comunque, e qui si dice. */
  spenteNelModello?: boolean;
}

export function CondizioniDelPreventivoCard({ progetto, onChange, testoDelModello, modelloAssociatoId, spenteNelModello }: Props) {
  const permessi = usePermissions();
  const puoRiscrivere = puoRiscrivereLeCondizioni(permessi);
  const riscritte = condizioniRiscritte(progetto);
  const fuoriDalPdf = condizioniTolteDalPdf(progetto);
  const [apertoEditor, setApertoEditor] = useState(false);
  const [bozza, setBozza] = useState("");
  // Da dove partono le condizioni di questo preventivo: la stessa regola del PDF (`condizioniDelPdf`).
  // Il modello associato al preventivatore, poi il predefinito di «Contratti e condizioni», poi il testo vecchio.
  const archivio = useCondizioniArchivio();
  const perPreventivi = useMemo(() => archivio.modelli.filter((m) => m.attivo && m.ambito === "preventivo"), [archivio.modelli]);
  const dallArchivio = perPreventivi.find((m) => m.id === modelloAssociatoId) ?? perPreventivi.find((m) => m.predefinito) ?? null;
  const base = dallArchivio ? htmlDelModello(dallArchivio) : String(testoDelModello ?? "");

  const apriEditor = () => {
    // L'editor vero (07/11/2026): grassetti, titoli ed elenchi del modello restano, e si riscrive sopra.
    setBozza(DOMPurify.sanitize(htmlPerEditorContratto(riscritte ? String(progetto?.condizioni_testo ?? "") : base)));
    setApertoEditor(true);
  };
  // Per un cliente che tratta si parte spesso da un altro modello dell'archivio, non da zero.
  const partiDa = (id: string) => {
    const m = perPreventivi.find((x) => x.id === id);
    if (m) setBozza(DOMPurify.sanitize(htmlPerEditorContratto(htmlDelModello(m))));
  };
  // L'anteprima mostra quello che esce davvero: il testo di questo preventivo, o quello del modello.
  const [anteprima, setAnteprima] = useState(false);
  const daMostrare: ModelloArchivio = riscritte || !dallArchivio
    ? { id: "documento", nome: riscritte ? "Condizioni di questo preventivo" : "Condizioni", ambito: "preventivo", attivo: true, versione: 1,
        clausole: [{ titolo: "", testo: riscritte ? String(progetto?.condizioni_testo ?? "") : base }] }
    : dallArchivio;
  const salva = () => {
    onChange({ condizioni_testo: haTesto(bozza) ? bozza : null });
    setApertoEditor(false);
  };

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <FileText className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            Condizioni contrattuali
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {spenteNelModello
              ? "L'azienda le tiene fuori da tutti i preventivi: nel modello sono spente."
              : fuoriDalPdf
                ? "Questo PDF esce senza la parte contrattuale. Quando lo mandi in firma ci sono comunque."
                : riscritte
                  ? "Nel PDF escono le condizioni scritte per questo preventivo."
                  : dallArchivio
                    ? `Nel PDF esce «${dallArchivio.nome}», da Contratti e condizioni.`
                    : "Nel PDF escono le condizioni del modello dell'azienda."}
          </p>
        </div>
        {!spenteNelModello && (
          <label className="flex shrink-0 items-center gap-2 text-[11px] font-medium">
            <span>Nel PDF</span>
            <Switch
              checked={!fuoriDalPdf}
              aria-label="Includi le condizioni contrattuali nel PDF"
              onCheckedChange={(v) => onChange({ condizioni_nel_pdf: v ? null : false })}
            />
          </label>
        )}
      </div>

      {!spenteNelModello && (
        <div className="space-y-2 px-3 py-2">
          {fuoriDalPdf && (
            <p className="flex items-start gap-1.5 rounded bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
              Va bene per il primo invio, quello in cui mostri il prezzo. Il preventivo firmato è il contratto: quando
              lo mandi in firma le condizioni tornano da sole.
            </p>
          )}

          {apertoEditor ? (
            <>
              {perPreventivi.length > 1 && (
                <select aria-label="Parti dalle condizioni di un altro modello" className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                  value="" onChange={(e) => e.target.value && partiDa(e.target.value)}>
                  <option value="">Parti da un altro modello di «Contratti e condizioni»…</option>
                  {perPreventivi.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              )}
              <RichTextEditor value={bozza} onChange={setBozza} minHeight={220}
                placeholder="Le condizioni di questo preventivo, scritte per questo cliente." />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="sm" onClick={salva}>Salva per questo preventivo</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setApertoEditor(false)}>Annulla</Button>
                <span className="text-[10px] text-muted-foreground">Valgono solo qui: il modello dell'azienda non cambia.</span>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {(riscritte || haTesto(base)) && (
                <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={() => setAnteprima(true)}>
                  <Eye className="h-3.5 w-3.5" />Anteprima
                </Button>
              )}
              {puoRiscrivere ? (
                <>
                  <Button type="button" size="sm" variant="outline" onClick={apriEditor}>
                    {riscritte ? "Modifica le condizioni di questo preventivo" : "Scrivi condizioni solo per questo preventivo"}
                  </Button>
                  {riscritte && (
                    <Button type="button" size="sm" variant="ghost" className="gap-1 text-slate-500" onClick={() => onChange({ condizioni_testo: null })}>
                      <RotateCcw className="h-3 w-3" />Torna a quelle del modello
                    </Button>
                  )}
                </>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Lock aria-hidden="true" className="h-3 w-3" />
                  {riscritte
                    ? "Queste condizioni sono state scritte per questo preventivo. Per cambiarle serve il permesso «Riscrivere le condizioni su un documento»."
                    : "Per scrivere condizioni diverse serve il permesso «Riscrivere le condizioni su un documento»."}
                </p>
              )}
            </div>
          )}

          {riscritte && !apertoEditor && (
            <p className={cn("max-h-24 overflow-hidden rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900")}>
              {testoPiano(progetto?.condizioni_testo).slice(0, 320)}
              {testoPiano(progetto?.condizioni_testo).length > 320 ? "…" : ""}
            </p>
          )}

          {!riscritte && !haTesto(base) && (
            <p className="text-[11px] text-muted-foreground">
              L'azienda non ha ancora scritto le sue condizioni: il documento usa quelle di base del tuo settore.{" "}
              <Link to={PAGINA_CONDIZIONI} className="underline">Scrivile in Contratti e condizioni</Link> per averle su tutti i preventivi.
            </p>
          )}
        </div>
      )}
      <AnteprimaCondizioniDialog open={anteprima} onOpenChange={setAnteprima} modello={daMostrare}
        titolo={riscritte ? "Le condizioni di questo preventivo, come escono nel PDF" : undefined} />
    </div>
  );
}

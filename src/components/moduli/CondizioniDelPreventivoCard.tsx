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
import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Lock, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  condizioniRiscritte, condizioniTolteDalPdf, haTesto, puoRiscrivereLeCondizioni,
  type CondizioniDelPreventivo,
} from "@/lib/preventivi/condizioniDelPreventivo";

interface Props {
  progetto: CondizioniDelPreventivo | null | undefined;
  onChange: (patch: Partial<CondizioniDelPreventivo>) => void;
  /** Le condizioni del modello dell'azienda: quelle che valgono se il preventivo non ne ha di sue. */
  testoDelModello?: string | null;
  /** L'azienda ha spento le condizioni nel modello: allora non escono comunque, e qui si dice. */
  spenteNelModello?: boolean;
}

/** Il testo ricco senza tag, per mostrarlo in una casella e per la lunghezza. */
const inTesto = (html: string | null | undefined) =>
  String(html ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/gi, " ").trim();

export function CondizioniDelPreventivoCard({ progetto, onChange, testoDelModello, spenteNelModello }: Props) {
  const permessi = usePermissions();
  const puoRiscrivere = puoRiscrivereLeCondizioni(permessi);
  const riscritte = condizioniRiscritte(progetto);
  const fuoriDalPdf = condizioniTolteDalPdf(progetto);
  const [apertoEditor, setApertoEditor] = useState(false);
  const [bozza, setBozza] = useState("");

  const apriEditor = () => {
    setBozza(riscritte ? inTesto(progetto?.condizioni_testo) : inTesto(testoDelModello));
    setApertoEditor(true);
  };
  const salva = () => {
    const pulito = bozza.trim();
    onChange({ condizioni_testo: pulito ? pulito.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("") : null });
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
              <Textarea
                aria-label="Condizioni contrattuali di questo preventivo"
                value={bozza}
                onChange={(e) => setBozza(e.target.value)}
                rows={10}
                className="text-xs"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" size="sm" onClick={salva}>Salva per questo preventivo</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setApertoEditor(false)}>Annulla</Button>
                <span className="text-[10px] text-muted-foreground">Valgono solo qui: il modello dell'azienda non cambia.</span>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
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
                    ? "Queste condizioni sono state scritte per questo preventivo. Per cambiarle serve il permesso sui modelli."
                    : "Per scrivere condizioni diverse serve il permesso sui modelli di preventivo."}
                </p>
              )}
            </div>
          )}

          {riscritte && !apertoEditor && (
            <p className={cn("max-h-24 overflow-hidden rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900")}>
              {inTesto(progetto?.condizioni_testo).slice(0, 320)}
              {inTesto(progetto?.condizioni_testo).length > 320 ? "…" : ""}
            </p>
          )}

          {!riscritte && !haTesto(testoDelModello) && (
            <p className="text-[11px] text-muted-foreground">
              Nel modello non ci sono condizioni scritte: il documento usa quelle di base del tuo settore.{" "}
              <Link to="/azienda/impostazioni/template-preventivi" className="underline">Scrivile nel modello</Link> per averle su tutti i preventivi.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

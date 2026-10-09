/**
 * Un rapportino nella lista del cantiere, visto da chi lo ha compilato.
 *
 * Lo stato viene da `stato` (non dal vecchio `approvato`): un rapportino RESPINTO si riconosce subito, mostra
 * il motivo scritto dall'ufficio e ha il bottone per correggerlo e rimandarlo.
 */
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertCircle, CheckCircle, Clock, Download, FileText, Loader2, PenLine } from "lucide-react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { cn } from "@/lib/utils";
import { ETICHETTA_STATO_OPERAIO, rapportinoDaRifare, statoRapportino, type StatoRapportino } from "@/lib/campo/rapportinoStato";

export interface RapportinoCardRiga {
  id: string;
  data_lavoro: string;
  stato?: string | null;
  approvato?: boolean | null;
  motivo_rifiuto?: string | null;
  ore_lavorate: number | null;
  percentuale_avanzamento?: number | null;
  descrizione_lavori: string | null;
  foto_urls?: string[] | null;
  materiali_usati?: unknown;
  fasi_lavorate?: unknown;
  pdf_url?: string | null;
  firma_operaio_url?: string | null;
}

const CHIP: Record<StatoRapportino, { classe: string; icona: typeof Clock }> = {
  inviato: { classe: "border-primary/20 bg-primary/10 text-primary", icona: Clock },
  approvato: { classe: "border-green-500/20 bg-green-500/20 text-green-700", icona: CheckCircle },
  rifiutato: { classe: "border-red-500/30 bg-red-500/10 text-red-700", icona: AlertCircle },
  bozza: { classe: "border-border bg-background text-muted-foreground", icona: FileText },
};

interface Props {
  r: RapportinoCardRiga;
  pdfOccupato: boolean;
  onPdf: () => void;
  onFirma: () => void;
  /** Apre il rapportino di quel giorno per correggerlo e rimandarlo. */
  onCorreggi: () => void;
  /** phase_id → nome della fase, per i rapportini che non lo portano scritto nella voce. */
  nomiFasi?: ReadonlyMap<string, string>;
}

export function RapportinoCardCampo({ r, pdfOccupato, onPdf, onFirma, onCorreggi, nomiFasi }: Props) {
  const stato = statoRapportino(r) ?? "inviato";
  const { classe, icona: Icona } = CHIP[stato];
  const daRifare = rapportinoDaRifare(stato);
  const giorno = parseISO(r.data_lavoro);
  const foto = Array.isArray(r.foto_urls) ? r.foto_urls : [];
  return (
    <div className={cn("rounded-2xl border bg-muted p-4", stato === "rifiutato" ? "border-red-300" : "border-border")}>
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground">
          {Number.isNaN(giorno.getTime()) ? r.data_lavoro : format(giorno, "d MMM yyyy", { locale: it })}
        </p>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", classe)}>
          <Icona className="h-3.5 w-3.5" aria-hidden="true" />
          {ETICHETTA_STATO_OPERAIO[stato]}
        </span>
      </div>

      {stato === "rifiutato" && (
        <div role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">L'ufficio ha respinto il rapportino</p>
          <p className="mt-0.5">{r.motivo_rifiuto?.trim() || "Nessun motivo scritto: chiedi all'ufficio cosa correggere."}</p>
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {r.ore_lavorate != null && <span>{r.ore_lavorate}h lavorate</span>}
        {r.percentuale_avanzamento != null && r.percentuale_avanzamento > 0 && <span>{r.percentuale_avanzamento}% avanzamento</span>}
        {foto.length > 0 && <span>{foto.length} foto</span>}
      </div>
      {r.descrizione_lavori && <p className="mt-1 line-clamp-2 text-sm text-foreground">{r.descrizione_lavori}</p>}

      {/* Su che fasi si è lavorato, con quanti materiali e quante foto: una riga per fase */}
      <RapportinoBlocchi report={r} compatto nomiFasi={nomiFasi} className="mt-2 rounded-xl bg-background/70 px-3 py-1.5" />

      {foto.length > 0 && (
        <div className="mt-2 flex gap-1">
          {foto.slice(0, 3).map((url, i) => (
            <ImgRiservata width={48} height={48} loading="lazy" key={i} src={url} className="h-12 w-12 rounded-lg object-cover" alt="Foto rapportino" />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {daRifare && (
          <button onClick={onCorreggi}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {stato === "rifiutato" ? "Correggi e rimanda" : "Completa e invia"}
          </button>
        )}
        <button onClick={onPdf} disabled={pdfOccupato}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50">
          {pdfOccupato ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {pdfOccupato ? "Preparo PDF…" : r.pdf_url ? "Apri PDF" : "Genera PDF"}
        </button>
        {r.firma_operaio_url ? (
          <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-700">
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            Firmato
          </span>
        ) : !daRifare && (
          <button onClick={onFirma} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            Firma
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Un rapportino nella lista del cantiere: autore o consultazione del capocantiere.
 *
 * Lo stato viene da `stato` (non dal vecchio `approvato`): un rapportino RESPINTO si riconosce subito, mostra
 * il motivo scritto dall'ufficio e ha il bottone per correggerlo e rimandarlo.
 */
import { leggiValori, valoreInTesto } from "../../../supabase/functions/_shared/moduliCantiere";
import { compilatoDa } from "../../../supabase/functions/genera-pdf-rapportino/model";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { AlertCircle, CheckCircle, Clock, Download, FileText, Loader2, PenLine } from "lucide-react";
import { ImgRiservata } from "@/components/common/ImgRiservata";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { cn } from "@/lib/utils";
import { ETICHETTA_STATO_OPERAIO, rapportinoDaRifare, statoRapportino, type StatoRapportino } from "@/lib/campo/rapportinoStato";
import { isClientReport } from "@/lib/campo/reportKind";
import { oreInTesto } from "@/lib/campo/regoleCampo";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  campi_extra?: unknown;
  created_at?: string | null;
  autore?: unknown;
  ufficio_created_by?: string | null;
  pdf_url?: string | null;
  firma_operaio_url?: string | null;
  lavoro_completato?: boolean | null;
  firma_cliente_url?: string | null;
  firma_cliente_nome?: string | null;
}

const CHIP: Record<StatoRapportino, { classe: string; icona: typeof Clock }> = {
  inviato: { classe: "border-primary/20 bg-primary/10 text-primary", icona: Clock },
  approvato: { classe: "border-green-500/20 bg-green-500/20 text-green-700", icona: CheckCircle },
  rifiutato: { classe: "border-red-500/30 bg-red-500/10 text-red-700", icona: AlertCircle },
  bozza: { classe: "border-border bg-background text-muted-foreground", icona: FileText },
};

interface Props {
  r: RapportinoCardRiga;
  autore?: string;
  pdfOccupato: boolean;
  /** Senza: il PDF non si apre da qui (rapporto di un collega ancora senza PDF). */
  onPdf?: () => void;
  /** Senza: il rapporto è di un collega, la firma dell'autore non si aggiunge da qui. */
  onFirma?: () => void;
  /** Apre il rapportino di quel giorno per correggerlo e rimandarlo. Senza: non è tuo. */
  onCorreggi?: () => void;
  /** Rapportino tuo già inviato o approvato: apre la richiesta di correzione all'ufficio. Senza: non si mostra. */
  onChiediCorrezione?: () => void;
  /** phase_id → nome della fase, per i rapportini che non lo portano scritto nella voce. */
  nomiFasi?: ReadonlyMap<string, string>;
}

export function RapportinoCardCampo({ r, autore, pdfOccupato, onPdf, onFirma, onCorreggi, onChiediCorrezione, nomiFasi }: Props) {
  const t = useT();
  const stato = statoRapportino(r) ?? "inviato";
  const { classe, icona: Icona } = CHIP[stato];
  const daRifare = rapportinoDaRifare(stato);
  const giorno = parseISO(r.data_lavoro);
  const foto = Array.isArray(r.foto_urls) ? r.foto_urls : [];
  const valoriPropri = leggiValori(r.campi_extra);
  const chiEQuando = compilatoDa(r as unknown as Record<string, unknown>);
  const cliente = isClientReport(r);
  return (
    <div className={cn("rounded-2xl border bg-muted p-4", stato === "rifiutato" ? "border-red-300" : "border-border")}>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{cliente ? t("Collaudo col cliente") : t("Rapportino")}</p>
      {autore && <p className="mb-2 text-sm font-semibold">{autore}</p>}
      <div className="mb-1 flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground">
          {Number.isNaN(giorno.getTime()) ? r.data_lavoro : format(giorno, "d MMM yyyy", { locale: it })}
        </p>
        <span className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", classe)}>
          <Icona className="h-3.5 w-3.5" aria-hidden="true" />
          {t(ETICHETTA_STATO_OPERAIO[stato])}
        </span>
      </div>

      {stato === "rifiutato" && (
        <div role="alert" className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <p className="font-semibold">{t("L'ufficio ha respinto il rapportino")}</p>
          <p className="mt-0.5">{r.motivo_rifiuto?.trim() || t("Nessun motivo scritto: chiedi all'ufficio cosa correggere.")}</p>
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {/* Il database manda «3.50»: all'operaio si scrive «3h 30», mai col punto. */}
        {r.ore_lavorate != null && Number.isFinite(Number(r.ore_lavorate)) && <span>{t("{ore} lavorate", { ore: oreInTesto(Number(r.ore_lavorate)) })}</span>}
        {r.percentuale_avanzamento != null && r.percentuale_avanzamento > 0 && <span>{t("{n}% avanzamento", { n: r.percentuale_avanzamento })}</span>}
        {foto.length > 0 && <span>{t("{n} foto", { n: foto.length })}</span>}
      </div>
      {r.descrizione_lavori && <p className="mt-1 line-clamp-2 text-sm text-foreground">{r.descrizione_lavori}</p>}
      {cliente && <p className="mt-2 text-sm font-semibold">{r.firma_cliente_url
        ? r.firma_cliente_nome?.trim() ? t("Firma cliente presente · {nome}", { nome: r.firma_cliente_nome.trim() }) : t("Firma cliente presente")
        : t("Firma cliente non presente nell’archivio")}</p>}

      {chiEQuando && <p className="mt-1 text-xs text-muted-foreground">{chiEQuando}</p>}
      {valoriPropri.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {valoriPropri.map(v => `${v.etichetta}${v.fase_nome ? ` (${v.fase_nome})` : ""}: ${valoreInTesto(v)}`).join(" · ")}
        </p>
      )}

      {/* Su che fasi si è lavorato, con quanti materiali e quante foto: una riga per fase */}
      <RapportinoBlocchi report={r} compatto nomiFasi={nomiFasi} className="mt-2 rounded-xl bg-background/70 px-3 py-1.5" />

      {foto.length > 0 && (
        <div className="mt-2 flex gap-1">
          {foto.slice(0, 3).map((url, i) => (
            <ImgRiservata width={48} height={48} loading="lazy" key={i} src={url} className="h-12 w-12 rounded-lg object-cover" alt={t("Foto rapportino")} />
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {daRifare && onCorreggi && (
          <button onClick={onCorreggi}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {stato === "rifiutato" ? t("Correggi e rimanda") : t("Completa e invia")}
          </button>
        )}
        {onPdf && <button onClick={onPdf} disabled={pdfOccupato}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground disabled:opacity-50">
          {pdfOccupato ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {pdfOccupato ? t("Preparo PDF…") : r.pdf_url ? t("Apri PDF") : t("Genera PDF")}
        </button>}
        {/* Collaudo 23/11: «per correggerlo contatta l'ufficio» senza un modo per farlo. Occasionale: a testo. */}
        {!daRifare && onChiediCorrezione && (
          <button type="button" onClick={onChiediCorrezione}
            className="flex min-h-11 items-center px-1 text-[13px] font-semibold text-muted-foreground underline">
            {t("Chiedi una correzione")}
          </button>
        )}
        {!onFirma ? null : r.firma_operaio_url ? (
          <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-semibold text-green-700">
            <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
            {t("La tua firma è presente")}
          </span>
        ) : !daRifare && (
          // Secondaria: l'azione principale della pagina è sopra («Scrivi il rapportino»).
          <button onClick={onFirma} className="flex min-h-11 items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3 py-2 text-[13px] font-semibold text-primary">
            <PenLine className="h-4 w-4" aria-hidden="true" />
            {t("Aggiungi la tua firma")}
          </button>
        )}
      </div>
    </div>
  );
}

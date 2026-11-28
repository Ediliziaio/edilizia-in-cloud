/**
 * Scadenzario → «Assegni ed effetti» (28/11/2026): gli assegni, le Ri.Ba. e i RID con data futura, emessi
 * e ricevuti. Si filtra per verso e per stato, si evidenziano quelli «da confermare» (data passata,
 * ancora in attesa) e si esporta in CSV. La chiusura (Pagato/Incassato, Insoluto, Annulla) sta in
 * `ChiudiEffettoDialog`: `onAzione` lo apre sull'effetto scelto.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { exportToCSV } from "@/lib/csvExport";
import { formatCurrency, formatDateIt } from "@/lib/formatters";
import { oggiIso } from "@/lib/finance/collegamentiFinanza";
import {
  ETICHETTA_STATO_EFFETTO, STATI_EFFETTO, eDaConfermare, nomeTipoEffetto,
  type Effetto as EffettoLetto, type StatoEffetto,
} from "@/lib/finance/effettiScadenzario";
import { useEffettiElenco, type Effetto } from "@/hooks/useEffetti";

export type VersoEffetti = "tutti" | "emesso" | "ricevuto";
export type FiltroStatoEffetti = StatoEffetto | "tutti";

const arrotonda = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Applica i filtri di verso e di stato, poi ordina per data dell'effetto (senza data in fondo). */
export function filtraEffetti<T extends EffettoLetto>(effetti: readonly T[], verso: VersoEffetti, stato: FiltroStatoEffetti): T[] {
  return effetti
    .filter((e) => (verso === "tutti" || e.direzione === verso) && (stato === "tutti" || e.stato === stato))
    .sort((a, b) => (a.data_scadenza ?? "9999").localeCompare(b.data_scadenza ?? "9999") || a.id.localeCompare(b.id));
}

export const COLONNE_CSV_EFFETTI = [
  { key: "data", label: "Data" }, { key: "tipo", label: "Tipo" }, { key: "verso", label: "Verso" }, { key: "numero", label: "Numero" },
  { key: "banca", label: "Banca" }, { key: "controparte", label: "Fornitore / Cliente" }, { key: "descrizione", label: "Descrizione" },
  { key: "importo", label: "Importo" }, { key: "stato", label: "Stato" }, { key: "da_confermare", label: "Da confermare" },
];

/** Una riga di CSV per effetto: importo come 1234,56 (numero, senza simbolo), data gg/mm/aaaa. */
export function righeCsvEffetti(effetti: readonly EffettoLetto[], oggi = oggiIso()): Record<string, string>[] {
  return effetti.map((e) => ({
    data: e.data_scadenza ? `${e.data_scadenza.slice(8, 10)}/${e.data_scadenza.slice(5, 7)}/${e.data_scadenza.slice(0, 4)}` : "",
    tipo: nomeTipoEffetto(e.tipo),
    verso: e.direzione === "ricevuto" ? "Ricevuto" : "Emesso",
    numero: String(e.numero ?? ""),
    banca: String(e.banca ?? ""),
    controparte: String(e.controparte ?? ""),
    descrizione: String(e.descrizione_fonte ?? ""),
    importo: arrotonda(Number(e.importo)).toFixed(2).replace(".", ","),
    stato: ETICHETTA_STATO_EFFETTO[e.stato as StatoEffetto] ?? String(e.stato),
    da_confermare: eDaConfermare(e, oggi) ? "Sì" : "",
  }));
}

function Chip({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: React.ReactNode }) {
  return <Button type="button" size="sm" variant={attivo ? "secondary" : "outline"} aria-pressed={attivo} onClick={onClick}
    className={`h-8 px-2.5 text-xs ${attivo ? "ring-1 ring-foreground/20" : ""}`}>{children}</Button>;
}

export function EffettiPanel({ companyId, onAzione, azienda }: {
  companyId: string | undefined;
  /** Apre il dialogo di chiusura per l'effetto: senza, il pannello è di sola lettura. */
  onAzione?: (e: Effetto) => void;
  azienda?: string;
}) {
  const t = useT();
  const [verso, setVerso] = useState<VersoEffetti>("tutti");
  const [stato, setStato] = useState<FiltroStatoEffetti>("in_attesa");
  const stati: StatoEffetto[] = stato === "tutti" ? STATI_EFFETTO : [stato];
  const q = useEffettiElenco(companyId, stati);
  const righe = useMemo(() => filtraEffetti(q.data ?? [], verso, stato), [q.data, verso, stato]);
  const totale = useMemo(() => {
    let emessi = 0, ricevuti = 0;
    for (const e of righe) { if (e.direzione === "ricevuto") ricevuti += Number(e.importo || 0); else emessi += Number(e.importo || 0); }
    return { emessi: arrotonda(emessi), ricevuti: arrotonda(ricevuti) };
  }, [righe]);
  const daConfermare = righe.filter((e) => eDaConfermare(e)).length;

  const esporta = () => exportToCSV(righeCsvEffetti(righe), COLONNE_CSV_EFFETTI, `assegni_ed_effetti${azienda ? `_${azienda.replace(/[^A-Za-z0-9]+/g, "_")}` : ""}`);

  return (
    <div className="space-y-3" data-testid="effetti-panel">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Verso")}>
        <Chip attivo={verso === "tutti"} onClick={() => setVerso("tutti")}>{t("Tutti")}</Chip>
        <Chip attivo={verso === "emesso"} onClick={() => setVerso("emesso")}>{t("Emessi")}</Chip>
        <Chip attivo={verso === "ricevuto"} onClick={() => setVerso("ricevuto")}>{t("Ricevuti")}</Chip>
        <Button type="button" variant="outline" size="sm" className="ml-auto h-8 gap-1.5 px-2.5 text-xs" disabled={!righe.length} onClick={esporta}>
          <Download className="h-3.5 w-3.5" />{t("Esporta CSV")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("Stato")}>
        <Chip attivo={stato === "in_attesa"} onClick={() => setStato("in_attesa")}>{t("In attesa")}</Chip>
        <Chip attivo={stato === "pagato"} onClick={() => setStato("pagato")}>{t("Pagati")}</Chip>
        <Chip attivo={stato === "insoluto"} onClick={() => setStato("insoluto")}>{t("Insoluti")}</Chip>
        <Chip attivo={stato === "annullato"} onClick={() => setStato("annullato")}>{t("Annullati")}</Chip>
        <Chip attivo={stato === "tutti"} onClick={() => setStato("tutti")}>{t("Tutti gli stati")}</Chip>
      </div>

      {q.isPending ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Caricamento…")}</p>
        : q.isError ? <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere gli assegni e gli effetti.")}</p>
        : !righe.length ? <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t("Nessun assegno o effetto per questi filtri.")}</p>
        : <>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
            <span>{t(righe.length === 1 ? "{n} effetto" : "{n} effetti", { n: righe.length })}</span>
            {totale.emessi > 0 && <span className="text-rose-700 dark:text-rose-400">{t("↑ {importo} emessi", { importo: formatCurrency(totale.emessi) })}</span>}
            {totale.ricevuti > 0 && <span className="text-emerald-700 dark:text-emerald-400">{t("↓ {importo} ricevuti", { importo: formatCurrency(totale.ricevuti) })}</span>}
            {daConfermare > 0 && <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400"><AlertTriangle className="h-3.5 w-3.5" />{t("{n} da confermare", { n: daConfermare })}</span>}
          </p>
          <ul className="divide-y rounded-lg border bg-card text-sm">
            {righe.map((e) => {
              const confermare = eDaConfermare(e);
              const ricevuto = e.direzione === "ricevuto";
              return (
                <li key={e.id} data-testid="effetto-riga" data-da-confermare={confermare || undefined}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${confermare ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}>
                  <span className="w-[5.5rem] shrink-0 tabular-nums">{e.data_scadenza ? formatDateIt(e.data_scadenza) : t("Senza data")}</span>
                  <span className="flex min-w-0 flex-1 basis-40 flex-col leading-tight">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {ricevuto ? <ArrowDownLeft className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={t("Ricevuto")} /> : <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-rose-600" aria-label={t("Emesso")} />}
                      <span className="truncate font-medium">{nomeTipoEffetto(e.tipo)}{e.numero ? ` n. ${e.numero}` : ""}{e.controparte ? ` · ${e.controparte}` : ""}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">{[e.descrizione_fonte, e.banca].filter(Boolean).join(" · ")}</span>
                  </span>
                  {confermare && <Badge variant="outline" className="border-amber-300 bg-amber-100 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">{t("Da confermare")}</Badge>}
                  {e.stato !== "in_attesa" && <Badge variant="outline" className="text-[11px]">{t(ETICHETTA_STATO_EFFETTO[e.stato as StatoEffetto] ?? String(e.stato))}</Badge>}
                  <span className={`shrink-0 font-semibold tabular-nums ${ricevuto ? "text-emerald-700 dark:text-emerald-400" : ""}`}>{ricevuto ? "+" : "−"}{formatCurrency(Number(e.importo))}</span>
                  {onAzione && e.stato === "in_attesa" && (
                    <Button type="button" size="sm" variant={confermare ? "default" : "outline"} className="h-8 px-2.5 text-xs max-sm:w-full" onClick={() => onAzione(e)}>
                      {ricevuto ? t("Incassato / Insoluto…") : t("Pagato / Insoluto…")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>}
    </div>
  );
}

export default EffettiPanel;

import { useId, useState } from "react";
import { ChevronDown, ChevronRight, Download, Layers3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatCurrency } from "@/lib/formatters";
import { nettoSal } from "@/lib/orders/salNetto";
import type { SalCertificato } from "@/lib/orders/salCertificato";
import { detrazioniDelPeriodo } from "@/lib/orders/salNuovoVerbale";
import { calcolaVociDelPeriodo, voceAvanzata, type SalVoce, type SalVoceSottofase } from "@/lib/orders/salPeriodo";

const formattaQuantita = (n: number) => Number(n).toLocaleString("it-IT", { maximumFractionDigits: 3 });
const euro = (n: number | null | undefined) => n == null ? "—" : formatCurrency(n);
const deltaPercentuale = (n: number | null | undefined) => n == null ? "—" : `${n > 0 ? "+" : ""}${n.toLocaleString("it-IT")} p.p.`;

function quantitaDellaVoce(voce: SalVoceSottofase) {
  if (voce.quantita_a_oggi == null && voce.quantita_contratto == null) return "—";
  const eseguita = voce.quantita_a_oggi == null ? "—" : formattaQuantita(voce.quantita_a_oggi);
  const prevista = voce.quantita_contratto == null ? "" : ` / ${formattaQuantita(voce.quantita_contratto)}`;
  return `${eseguita}${prevista}${voce.unita ? ` ${voce.unita}` : ""}`;
}

export function SalRecordPhases({ fasi, fasiPrecedenti, totale, precedente, certificato, certificatoPrima, nota, vedeImporti, pdfInCorso, onScaricaPdf }: {
  fasi: SalVoce[];
  fasiPrecedenti: SalVoce[] | null;
  totale: number;
  precedente: number;
  certificato: SalCertificato | null;
  certificatoPrima: SalCertificato | null;
  nota: string | null;
  vedeImporti: boolean;
  pdfInCorso: boolean;
  onScaricaPdf: (formato: "periodo" | "completo") => void;
}) {
  const [faseId, setFaseId] = useState<string | null>(fasi[0]?.id ?? null);
  const [soloPeriodo, setSoloPeriodo] = useState(false);
  const [soloAvanzate, setSoloAvanzate] = useState(false);
  const titoloId = useId();
  const periodo = calcolaVociDelPeriodo(fasi, fasiPrecedenti);
  const fasiVisibili = soloAvanzate ? fasi.filter(voce => {
    const delta = periodo.get(voce.id);
    return voceAvanzata(delta) || Array.from(delta?.dettaglio.values() ?? []).some(voceAvanzata);
  }) : fasi;
  const fase = fasiVisibili.find((voce) => voce.id === faseId);
  const periodoFase = fase && periodo.get(fase.id);
  const sottofasi = [...(fase?.sal_voci_sottofasi ?? [])].sort((a, b) => a.posizione - b.posizione);
  const haSottofasi = sottofasi.length > 0;
  const righe = haSottofasi
    ? sottofasi
      .map((voce) => {
        const delta = periodoFase?.dettaglio.get(voce.id);
        const quantita = soloPeriodo
          ? delta?.quantita == null ? "—" : `${formattaQuantita(delta.quantita)}${voce.unita ? ` ${voce.unita}` : ""}`
          : quantitaDellaVoce(voce);
        return { voce, quantita, delta };
      })
      .filter(({ delta }) => !soloAvanzate || voceAvanzata(delta))
    : (fase ? [fase] : fasiVisibili).map((voce) => ({ voce, quantita: "", delta: periodo.get(voce.id) }));
  const quota = nettoSal(totale, precedente).daFatturare;
  const detrazioni = certificato ? detrazioniDelPeriodo(quota, certificato, certificatoPrima, fasiPrecedenti !== null) : [];
  const etichettaImporto = soloPeriodo ? "Importo del periodo" : "Cumulativo SAL";
  const avanza = (v: number, delta: number | null | undefined) => soloPeriodo ? deltaPercentuale(delta) : `${v}%`;

  return (
    <>
      <div className="sal-record-phase-options">
        <div className="sal-record-phase-modes" role="group" aria-label="Vista del SAL">
          <button type="button" aria-pressed={soloPeriodo} onClick={() => setSoloPeriodo(true)}>Solo questo SAL</button>
          <button type="button" aria-pressed={!soloPeriodo} onClick={() => setSoloPeriodo(false)}>Cumulativo</button>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={soloAvanzate} onChange={(e) => setSoloAvanzate(e.target.checked)} />
            Solo voci avanzate
          </label>
          {vedeImporti && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={pdfInCorso}
              title="Scarica il verbale intero nel formato della vista selezionata"
              onClick={() => onScaricaPdf(soloPeriodo ? "periodo" : "completo")}>
              {pdfInCorso ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
              {pdfInCorso ? "Preparo il PDF…" : "Scarica PDF"}
            </Button>
          )}
        </div>
      </div>
      <div className="sal-record-phase-layout">
        <nav className="sal-record-phase-nav" aria-label="Macrofasi del verbale">
          <button type="button" className="sal-record-phase-overview" aria-pressed={!fase} onClick={() => setFaseId(null)}>
            <Layers3 className="h-4 w-4 shrink-0" aria-hidden />
            <span>Tutte le macrofasi</span>
            <small>{fasiVisibili.length}</small>
          </button>
          {fasiVisibili.map((voce) => (
            <button key={voce.id} type="button" aria-pressed={fase?.id === voce.id} onClick={() => setFaseId(voce.id)}>
              <span>{voce.descrizione}</span>
              <small>{avanza(voce.percentuale_avanzamento, periodo.get(voce.id)?.percentuale)}</small>
            </button>
          ))}
        </nav>
        <section key={fase?.id ?? "tutte"} className="sal-record-phase-panel" aria-labelledby={titoloId} tabIndex={0}>
          <div className="sal-record-phase-heading">
            <h3 id={titoloId}>{fase?.descrizione ?? "Tutte le macrofasi"}</h3>
            {haSottofasi && <span>{righe.length} {righe.length === 1 ? "lavorazione" : "lavorazioni"}</span>}
          </div>
          {fase && haSottofasi && (
            <dl className="sal-record-phase-stats">
              {vedeImporti && !soloPeriodo && <div><dt>Contrattuale</dt><dd>{euro(fase.importo_contrattuale)}</dd></div>}
              <div><dt>{soloPeriodo ? "Avanzamento del periodo" : "Avanzamento"}</dt><dd>{avanza(fase.percentuale_avanzamento, periodoFase?.percentuale)}</dd></div>
              {vedeImporti && <div><dt>{etichettaImporto}</dt><dd>{euro(soloPeriodo ? periodoFase?.importo : fase.importo_sal)}</dd></div>}
            </dl>
          )}
          {righe.length > 0 ? <div className="sal-record-phase-table-scroll">
            <table className="sal-record-table w-full text-xs">
              <thead><tr>
                <th scope="col" className="text-left">{fase ? "Lavorazione" : "Macrofase"}</th>
                {haSottofasi && <th scope="col" className="text-right">{soloPeriodo ? "Quantità del periodo" : "Quantità a oggi"}</th>}
                <th scope="col" className="text-right">{soloPeriodo ? "Δ Avanz." : "Avanz."}</th>
                {vedeImporti && !soloPeriodo && <th scope="col" className="text-right">Contrattuale</th>}
                {vedeImporti && <th scope="col" className="text-right">{etichettaImporto}</th>}
              </tr></thead>
              <tbody>
                {righe.map(({ voce, quantita, delta }) => (
                  <tr key={voce.id}>
                    <th scope="row" className="text-left font-medium">
                      {fase ? voce.descrizione : (
                        <button type="button" className="inline-flex items-center gap-1 text-left hover:underline" onClick={() => setFaseId(voce.id)}>
                          {voce.descrizione}<ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </button>
                      )}
                    </th>
                    {haSottofasi && <td className="text-right text-muted-foreground">{quantita}</td>}
                    <td className="text-right">{avanza(voce.percentuale_avanzamento, delta?.percentuale)}</td>
                    {vedeImporti && !soloPeriodo && <td className="text-right text-muted-foreground">{euro(voce.importo_contrattuale)}</td>}
                    {vedeImporti && <td className="text-right font-medium">{euro(soloPeriodo ? delta?.importo : voce.importo_sal)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div> : <p className="sal-record-phase-note" role="status">Nessuna voce con avanzamento verificabile nel periodo.</p>}
          {soloPeriodo && righe.some(({ delta, quantita }) => delta?.percentuale == null || (vedeImporti && delta.importo == null) || quantita === "—") &&
            <p className="sal-record-phase-note">Il trattino indica un dato del periodo non ricostruibile.</p>}
          {fase?.note && <p className="sal-record-phase-note">Nota della fase · {fase.note}</p>}
          {nota && <p className="sal-record-phase-note">Nota del verbale · {nota}</p>}
        </section>
      </div>
      {vedeImporti && (
        <Collapsible className="sal-record-phase-footer">
          <div className="sal-record-phase-summary">
            <dl className="sal-record-phase-totals" aria-label="Totali del verbale">
              {!soloPeriodo && <div><dt>Cumulativo del verbale</dt><dd>{euro(totale)}</dd></div>}
              {!soloPeriodo && precedente > 0 && <div><dt>Già riconosciuto</dt><dd>{euro(precedente)}</dd></div>}
              {(soloPeriodo || precedente > 0) && <div className="sal-record-phase-quota" data-rettifica={quota < 0}><dt>{quota < 0 ? "Rettifica da verificare" : "Quota nuova del SAL"}</dt><dd>{euro(quota)}</dd></div>}
            </dl>
            {certificato && (
              <CollapsibleTrigger className="sal-record-phase-certificate">
                <span>Netto del certificato<strong>{euro(certificato.netto)}</strong></span>
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              </CollapsibleTrigger>
            )}
          </div>
          {certificato && <CollapsibleContent className="sal-record-phase-deductions">
            <dl aria-label="Detrazioni del certificato">
              <div><dt>Lavori del periodo</dt><dd>{euro(quota)}</dd></div>
              {detrazioni.map(({ label, amount }) => <div key={label}><dt>{label}</dt><dd>{euro(amount)}</dd></div>)}
              <div className="font-semibold"><dt>Netto certificato · IVA esclusa</dt><dd>{euro(certificato.netto)}</dd></div>
            </dl>
            {detrazioni.length === 0 && <p className="sal-record-phase-note">Nessuna detrazione nel periodo.</p>}
            {certificato.altre_detrazioni_nota && <p className="sal-record-phase-note">{certificato.altre_detrazioni_nota}</p>}
          </CollapsibleContent>}
        </Collapsible>
      )}
    </>
  );
}

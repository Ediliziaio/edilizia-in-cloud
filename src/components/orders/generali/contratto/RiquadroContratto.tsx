// src/components/orders/generali/contratto/RiquadroContratto.tsx
// Il riquadro del contratto in Panoramica: scadenze vicine, ritenute trattenute e da svincolare,
// anticipazione da recuperare, ultimo SAL. Silenzioso se la lettura non riesce: la Panoramica
// non si ferma per un modulo.
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRight, FileCheck2, Info } from "lucide-react";
import { Ciambella } from "@/components/orders/generali/design/Ciambella";
import { composizioneSal } from "@/lib/orders/generali/graficiPanoramica";
import { Skeleton } from "@/components/ui/skeleton";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDatiContratto } from "@/hooks/useGeneraleContratto";
import { anticipazione, oggiIso, ritenute, scadenzeContratto, totaliSal, valoreContratto, type DatiContrattoDaiDocumenti } from "@/lib/orders/generali/contratto";
import { cn } from "@/lib/utils";
import { dataIt, euro } from "./formato";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function RiquadroContratto({ riepilogo }: PropsScheda) {
  const tr = useT();
  const { data: dati, isLoading, isError } = useDatiContratto(riepilogo.generale.id, riepilogo.permessi.importi);
  const [parametri, setParametri] = useSearchParams();
  // Da telefono la scheda del contratto non c'è: niente collegamenti, solo i numeri.
  const telefono = useIsMobile();
  if (!riepilogo.permessi.importi || isError) return null;
  if (isLoading || !dati) return <Skeleton className="h-24 w-full rounded-lg" />;
  if (!dati.permessi.importi) return null;

  const link = (sezione?: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "contratto");
    if (sezione) p.set("sezione", sezione); else p.delete("sezione");
    return { search: `?${p.toString()}` };
  };
  const valore = valoreContratto(dati.contratto, dati.atti);
  if (!valore) {
    if (telefono) return null;
    return (
      <section aria-label={tr("Contratto")} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
        <p className="text-sm text-muted-foreground">{tr("Dati del contratto da completare")}</p>
        <Link to={link()} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
          {tr("Vai al contratto")} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </section>
    );
  }

  const t = totaliSal(dati.sal);
  const r = ritenute(dati.sal);
  const ant = anticipazione(dati.contratto, dati.sal);
  const scadenze = scadenzeContratto(dati, oggiIso()).slice(0, 3);
  const ultimo = [...dati.sal].filter((s) => s.stato !== "bozza").sort((a, b) => b.numero - a.numero)[0];
  const etichettaSal = ultimo ? (ultimo.al ? tr("Ultimo SAL n. {numero} al {data}", { numero: ultimo.numero, data: dataIt(ultimo.al) }) : tr("Ultimo SAL n. {numero}", { numero: ultimo.numero })) : tr("Nessun SAL emesso");
  const grafico = composizioneSal(valore.aggiornato, t.aSal);
  const apriGrafico = (id: string) => { const p = new URLSearchParams(parametri); p.set("scheda", "contratto"); if (id === "sal") { p.set("sezione", "sal"); p.set("stato-sal", "emessi"); } else { p.delete("sezione"); p.delete("stato-sal"); } setParametri(p); };

  return (
    <section aria-labelledby="riquadro-contratto-titolo" className="generale-panel generale-contract">
      <header className="generale-panel-heading">
        <div className="generale-panel-title"><span className="generale-section-icon"><FileCheck2 aria-hidden="true" /></span><div><h2 id="riquadro-contratto-titolo">{tr("Contratto e SAL")}</h2><p>{tr("Valore contrattuale e somme da svincolare")}</p></div></div>
        {telefono ? (
          <span className="text-xs text-muted-foreground">{etichettaSal}</span>
        ) : (
          <Link to={link("sal")} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            {etichettaSal} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </header>
      <div className="generale-chart-body">
      {grafico && !grafico.oltre && <Ciambella dati={[
        { id: "sal", nome: tr("SAL emessi"), valore: grafico.aSal, colore: "rgb(var(--brand-navy-deep, 23 59 103))" },
        { id: "residuo", nome: tr("valore e residuo del contratto"), valore: grafico.residuo, colore: "rgb(var(--brand-accent, 249 115 22) / 0.25)" },
      ]} valore={`${grafico.percentuale}%`} etichetta={tr("contratto a SAL")} onSeleziona={telefono ? undefined : apriGrafico} />}
      <dl className="generale-contract-values">
        <div>
          <dt className="text-xs text-muted-foreground">{tr("A SAL")}</dt>
          <dd className="tabular-nums">{euro(t.aSal)} <span className="text-xs text-muted-foreground">{tr("su {importo}", { importo: euro(valore.aggiornato) })}</span></dd>
        </div>
        <div><dt className="text-xs text-muted-foreground">{tr("Residuo non a SAL")}</dt><dd className={cn("tabular-nums", grafico?.oltre && "text-destructive")}>{euro(grafico?.residuo ?? null)}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">{tr("Netto dei SAL")}</dt>
          <dd className="tabular-nums">{euro(t.netto)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tr("Ritenute da svincolare")}</dt>
          <dd className="tabular-nums">
            {euro(r.daSvincolare)}
            {r.trattenute > 0 && <span className="text-xs text-muted-foreground"> {tr("su {importo} trattenute", { importo: euro(r.trattenute) })}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{tr("Anticipazione da recuperare")}</dt>
          <dd className="tabular-nums">{ant.importo > 0 ? euro(ant.daRecuperare) : <span className="text-muted-foreground">{tr("nessuna")}</span>}</dd>
        </div>
      </dl>
      </div>
      {grafico?.oltre && <p role="status" className="px-5 pb-3 text-sm text-destructive">{tr("Il valore a SAL supera il contratto: verifica gli atti aggiuntivi.")}</p>}
      {!telefono && <div className="generale-panel-footer"><button type="button" onClick={() => apriGrafico("sal")}>{tr("Apri SAL emessi")} <ArrowRight aria-hidden="true" /></button><button type="button" onClick={() => apriGrafico("residuo")}>{tr("Valore e residuo del contratto")} <ArrowRight aria-hidden="true" /></button></div>}
      {(dati.contratto?.cig || dati.contratto?.cup || dati.contratto?.splitPayment) && <footer className="generale-panel-footer">
        {dati.contratto.cig && <span>CIG <strong className="font-medium text-foreground">{dati.contratto.cig}</strong></span>}
        {dati.contratto.cup && <span>CUP <strong className="font-medium text-foreground">{dati.contratto.cup}</strong></span>}
        {dati.contratto.splitPayment && <span>{tr("Scissione dei pagamenti")}</span>}
      </footer>}
      {dati.contratto?.daiDocumenti && <DaiDocumenti d={dati.contratto.daiDocumenti} />}
      {scadenze.length > 0 && (
        <ul className="space-y-1 border-t px-4 py-2.5">
          {scadenze.map((s) => (
            <li key={s.id} className={cn("flex items-start gap-2 text-sm", s.tono === "attenzione" && "text-amber-800 dark:text-amber-300")}>
              {s.tono === "attenzione" ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              {telefono ? <span>{s.testo}</span> : <Link to={link(s.id === "sal-bozza" ? "sal" : undefined)} className="hover:underline">{s.testo}</Link>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Quello che i documenti dell'appalto dicono e il modulo del contratto non chiede (lotto 5 della lettura dai documenti). */
function DaiDocumenti({ d }: { d: DatiContrattoDaiDocumenti }) {
  const t = useT();
  const voci = [
    d.quotaPct !== null && (d.importoTotaleAppalto !== null ? t("Quota nel raggruppamento {perc}% di {importo}", { perc: d.quotaPct.toLocaleString(intlCampo()), importo: euro(d.importoTotaleAppalto) }) : t("Quota nel raggruppamento {perc}%", { perc: d.quotaPct.toLocaleString(intlCampo()) })),
    d.tettoAccordo !== null && t("Tetto dell'accordo quadro {importo}", { importo: euro(d.tettoAccordo) }),
    d.durataGiorni !== null && t("Durata {n} giorni", { n: d.durataGiorni }),
    d.aCorpoMisura && t("A {modo}", { modo: d.aCorpoMisura.replace(/^a\s+/i, "") }),
    d.costoManodopera !== null && t("Manodopera {importo}", { importo: euro(d.costoManodopera) }),
    d.salSogliaImporto !== null && t("SAL ogni {importo}", { importo: euro(d.salSogliaImporto) }),
    d.salCadenzaGiorni !== null && t("SAL ogni {n} giorni", { n: d.salCadenzaGiorni }),
    d.terminiPagamentoGiorni !== null && t("Pagamento a {n} giorni", { n: d.terminiPagamentoGiorni }),
    d.revisionePrezzi && t("Revisione prezzi: {testo}", { testo: d.revisionePrezzi }),
  ].filter(Boolean) as string[];
  if (voci.length === 0) return null;
  return (
    <footer className="generale-panel-footer flex-wrap" aria-label={t("Dati dai documenti")}>
      {voci.map((v) => <span key={v}>{v}</span>)}
    </footer>
  );
}

import { lazy, Suspense, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDettaglioSubappaltoCommessa } from "@/hooks/useDettaglioSubappaltoCommessa";
import type { useDatiAffidaContratto } from "@/hooks/useDatiAffidaContratto";
import type { VocePrevista } from "@/hooks/useVociPrevisteFasi";
import { computoCorrenteSubappalto, costiFlussoSubappalto, variazioneSubappalto, type ContrattoFlusso } from "@/lib/subappaltatori/flussoCommessa";
import { refreshFlussoSubappalto } from "@/lib/subappaltatori/refreshFlussoCommessa";
import type { AffidamentoChiFaCosa } from "@/lib/subappaltatori/affidamentiCommessa";
import { puoConsultareSalSub, puoScrivereSalSub } from "@/lib/permessi/contabilitaSubappalto";
import { formatCurrency } from "@/lib/formatters";
import { AffidaVociDialog } from "./AffidaVociDialog";
import { VarianteVociDialog } from "./VarianteVociDialog";
import type { SALSubappaltatore } from "@/types/subappaltatori";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

const LavorazioniAffidateDialog = lazy(() => import("@/components/subappaltatori/LavorazioniAffidateDialog").then((m) => ({ default: m.LavorazioniAffidateDialog })));
const LavoriMisureSubDialog = lazy(() => import("@/components/subappaltatori/LavoriMisureSubDialog").then((m) => ({ default: m.LavoriMisureSubDialog })));
const VerbaleSalSubDialog = lazy(() => import("@/components/subappaltatori/VerbaleSalSubDialog").then((m) => ({ default: m.VerbaleSalSubDialog })));
const SchedaCommessaDialog = lazy(() => import("@/components/sicurezza/SchedaCommessaDialog").then((m) => ({ default: m.SchedaCommessaDialog })));

type Dati = NonNullable<ReturnType<typeof useDatiAffidaContratto>["data"]>;
interface Props {
  companyId: string;
  orderId: string;
  dati: Dati;
  voci: VocePrevista[];
  affidamenti: AffidamentoChiFaCosa[];
  inRicarica?: boolean;
  contrattoAperto?: string;
}
const dataIt = (data: string) => data.includes("T")
  ? new Intl.DateTimeFormat(intlCampo(), { timeZone: "Europe/Rome" }).format(new Date(data))
  : data.slice(0, 10).split("-").reverse().join("/");
const statoSal = { ricevuto: "Da verificare", verificato: "Approvato", pagato: "Pagato", contestato: "Contestato" };

export function ContrattiSubappaltoCommessa(props: Props) {
  const t = useT();
  const p = usePermissions();
  if (!p.canViewCosts || !puoConsultareSalSub(p)) return null;
  const attivo = props.dati.contratti.find((c) => c.id === props.contrattoAperto);
  const contratti = attivo ? [attivo, ...props.dati.contratti.filter((c) => c.id !== attivo.id)] : props.dati.contratti;
  return <section className="space-y-2" aria-label={t("Contratti e avanzamento del subappalto")}>
    <div>
      <h4 className="text-sm font-semibold">{t("Contratti, varianti e SAL")}</h4>
      <p className="text-xs text-muted-foreground">{t("Tutti i contratti della commessa. Gli importi riguardano l’intero contratto e sono IVA esclusa.")}</p>
    </div>
    {!props.dati.contratti.length && <p className="text-sm text-muted-foreground">{t("Dopo la conferma dei costi trovi qui il computo della ditta, le varianti e i SAL.")}</p>}
    {props.contrattoAperto && !attivo && (props.inRicarica
      ? <p role="status" className="text-sm text-muted-foreground">{t("Carico il contratto collegato…")}</p>
      : <p role="alert" className="text-sm text-muted-foreground">{t("Il contratto collegato non è disponibile tra i contratti della commessa.")}</p>)}
    {contratti.map((c) => <Contratto key={c.id} {...props} contratto={c} />)}
  </section>;
}

function Contratto({ companyId, orderId, dati, voci, affidamenti, inRicarica, contrattoAperto, contratto: c }: Props & { contratto: ContrattoFlusso }) {
  const t = useT();
  const p = usePermissions();
  const qc = useQueryClient();
  const { effectiveCompany: azienda } = useAuth();
  const [aperto, setAperto] = useState(c.id === contrattoAperto);
  const dettaglio = useDettaglioSubappaltoCommessa(companyId, orderId, c.id, aperto && p.canViewCosts && puoConsultareSalSub(p));
  const [computo, setComputo] = useState<"corrente" | "originale">();
  const [scheda, setScheda] = useState<string>();
  const [misure, setMisure] = useState<"lavori" | "misure" | "sal">();
  const [verbale, setVerbale] = useState<SALSubappaltatore>();
  const [variante, setVariante] = useState(false);
  const [assegna, setAssegna] = useState(false);
  const ditta = dati.schede.find((s) => s.id === c.subappaltatore_id);
  const nome = ditta?.ragione_sociale || "Ditta da verificare";
  const scrittura = puoScrivereSalSub(p) && c.stato !== "risolto" && c.stato !== "completato";
  const inBozza = c.stato === "bozza" && !c.firmato_il;
  const quote = affidamenti.filter((a) => a.contratto_id === c.id || (a.subappaltatore_id === ditta?.campo_subappaltatore_id && a.stato === "bozza" && !a.contratto_id));
  const conVociCollegate = quote.some((a) => a.contratto_id === c.id);
  const refresh = () => refreshFlussoSubappalto(qc, companyId, orderId);
  const apriScheda = (tab: string) => setScheda(`/azienda/subappaltatori/${c.subappaltatore_id}?tab=${tab}&contratto=${c.id}`);
  const costi = dettaglio.data ? costiFlussoSubappalto(c, dettaglio.data.varianti, dettaglio.data.sal) : null;
  const elenco = dettaglio.data ? computoCorrenteSubappalto(c, dettaglio.data.quadro, dati.fasi, voci, dati.sottofasi, quote) : null;
  const ricarica = !!inRicarica || dettaglio.isFetching;

  const scarica = useMutation({
    mutationFn: async () => {
      if (ricarica || dettaglio.isError || !elenco?.coerente || !azienda || azienda.id !== companyId) throw new Error(t("Rileggi il computo prima di generare il PDF."));
      const [{ generaPdfComputoSubappalto }, { scaricaBlob }] = await Promise.all([
        import("@/lib/subappaltatori/computoPdf"), import("./generali/vendita/scarica"),
      ]);
      const blob = await generaPdfComputoSubappalto({
        azienda: azienda.business_name || azienda.name, companyId, ditta: nome, numero: c.numero_contratto || c.id.slice(0, 8),
        commessa: dati.codiceCommessa, revisione: elenco.revisione, bozza: inBozza, righe: elenco.righe, oneri: Number(c.oneri_sicurezza),
      });
      scaricaBlob(blob, `Computo subappalto ${nome} ${c.numero_contratto || c.id.slice(0, 8)}.pdf`.replace(/[\\/:*?"<>|]/g, "-"));
    },
    onError: (e: Error) => toast.error(e.message || t("PDF non generato. Riprova.")),
  });

  return <article className="overflow-hidden rounded-lg border bg-background max-sm:[&_button]:min-h-11" aria-label={`${nome} · ${c.numero_contratto || t("Contratto")}`}>
    <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-3 text-left hover:bg-muted/30"
      aria-expanded={aperto} aria-controls={`subappalto-${c.id}`} onClick={() => setAperto((v) => !v)}>
      <span className="min-w-0 flex-1 max-sm:basis-full"><span className="block text-sm font-semibold">{nome} · {c.numero_contratto || t("Contratto")}</span>
        <span className="block text-xs text-muted-foreground">{c.descrizione_lavori}</span></span>
      <Badge variant="outline">{inBozza ? t("Bozza · costi da confermare") : c.stato === "risolto" ? t("Risolto") : c.stato === "completato" ? t("Completato") : c.stato === "sospeso" ? t("Sospeso") : c.firmato_il ? t("Firmato") : t("Da firmare")}</Badge>
      <span className="text-sm font-semibold tabular-nums">{formatCurrency(Number(c.importo_contrattuale) + Number(c.oneri_sicurezza))}</span>
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aperto ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    {aperto && <div id={`subappalto-${c.id}`} className="space-y-4 border-t p-3">
      {dettaglio.isError ? <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
        {t("Non riesco a leggere computo, varianti e SAL.")} <Button size="sm" variant="outline" onClick={() => void dettaglio.refetch()}>{t("Riprova")}</Button>
      </div> : !dettaglio.data || !costi || !elenco ? <p role="status" className="text-sm text-muted-foreground">{t("Carico computo, varianti e SAL…")}</p> : <>
        <dl className="grid grid-cols-2 gap-2 text-sm lg:grid-cols-4">
          <Cifra titolo={inBozza ? t("Costo proposto iniziale") : t("Importo iniziale")} valore={costi.iniziale} />
          <Cifra titolo={t("Varianti registrate")} valore={costi.variazione} />
          <Cifra titolo={inBozza ? t("Costo proposto attuale") : t("Costo attuale")} valore={costi.attuale} />
          <Cifra titolo={t("SAL approvati")} valore={costi.approvato} />
        </dl>
        <p className="text-xs text-muted-foreground">{t("Lavori {lavori} + oneri sicurezza {oneri}. Le varianti sono comprese nel costo attuale.", { lavori: formatCurrency(Number(c.importo_contrattuale)), oneri: formatCurrency(Number(c.oneri_sicurezza)) })}</p>
        {!elenco.coerente && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">{t("Il computo non torna con l’importo attuale. Aggiorna il quadro da «Lavori e quantità» prima di stampare il computo aggiornato.")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!elenco.coerente || ricarica} onClick={() => setComputo("corrente")}><FileText className="mr-1 h-3.5 w-3.5" />{t("Computo aggiornato")}{elenco.revisione != null ? ` · ${t("rev. {n}", { n: elenco.revisione })}` : ""}</Button>
          <Button size="sm" variant="outline" disabled={!elenco.coerente || ricarica || scarica.isPending} onClick={() => scarica.mutate()}>{scarica.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{t("PDF computo")}</Button>
          {c.firmato_il && elenco.originali.length > 0 && <Button size="sm" variant="ghost" onClick={() => setComputo("originale")}>{t("Elenco originale firmato")}</Button>}
          <Button size="sm" variant="outline" onClick={() => apriScheda("contratto")}>{inBozza ? t("Conferma costi e condizioni") : t("Condizioni e firma")}</Button>
          {ditta?.campo_subappaltatore_id && <Button size="sm" variant="ghost" onClick={() => apriScheda("listino")}>{t("Listino della ditta")}</Button>}
        </div>
        {c.firmato_il && <div className="space-y-2 rounded-md border p-3">
          <h5 className="text-sm font-semibold">{t("Nuovi lavori e varianti")}</h5>
          <p className="text-xs text-muted-foreground">{t("Per nuovi lavori, aggiungi le voci nelle lavorazioni della commessa e assegnale a questa ditta. Poi registra la variante e controlla il nuovo totale.")}</p>
          {scrittura && <div className="flex flex-wrap gap-2">
            {ditta?.campo_subappaltatore_id && <Button size="sm" variant="outline" disabled={ricarica} onClick={() => setAssegna(true)}>{t("Assegna nuove voci alla ditta")}</Button>}
            <Button size="sm" variant="outline" disabled={!conVociCollegate || ricarica} onClick={() => setVariante(true)}>{t("Registra variante sulle voci")}</Button>
          </div>}
          {!conVociCollegate && <p className="text-xs text-muted-foreground">{t("Questo contratto non ha affidamenti collegati alle voci. Gestisci le varianti d’importo da «Condizioni e firma» e aggiorna il quadro lavori.")}</p>}
          {dettaglio.data.varianti.length > 0 && <ul className="divide-y text-sm" aria-label={t("Storico varianti")}>{dettaglio.data.varianti.map((v) => <li key={v.id} className="flex flex-wrap justify-between gap-2 py-2">
            <span>{dataIt(v.created_at)} · {v.motivo}</span><strong className="tabular-nums">{variazioneSubappalto(v) > 0 ? "+" : ""}{formatCurrency(variazioneSubappalto(v))}</strong>
          </li>)}</ul>}
        </div>}
        <section className="space-y-2" aria-label={t("Avanzamento e verbali SAL")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-sm font-semibold">{t("Misure, SAL e verbali")}</h5>
            {c.firmato_il && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setMisure("lavori")}>{t("Lavori e quantità")}</Button>
              <Button size="sm" variant="outline" onClick={() => setMisure("misure")}>{t("Misure")}</Button>
              <Button size="sm" onClick={() => setMisure("sal")}>{scrittura ? t("Prepara SAL e verbale") : t("Consulta SAL")}</Button>
            </div>}
          </div>
          {!c.firmato_il && <p className="text-sm text-muted-foreground">{t("Completa condizioni e firma del contratto per gestire misure e SAL.")}</p>}
          <p className="text-xs text-muted-foreground">{t("Da verificare {verificare} · Pagato {pagato} · Netto approvato da pagare {netto}", { verificare: formatCurrency(costi.daVerificare), pagato: formatCurrency(costi.pagato), netto: formatCurrency(costi.daPagareApprovato) })}</p>
          {dettaglio.data.sal.length === 0 ? <p className="text-sm text-muted-foreground">{t("Nessun SAL registrato.")}</p> : <ul className="divide-y rounded-md border" aria-label={t("SAL del contratto")}>{dettaglio.data.sal.map((s) => <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div><p className="font-medium">SAL {s.numero_sal} · {dataIt(s.data_emissione)} · {statoSal[s.stato] ? t(statoSal[s.stato]) : s.stato}</p>
              <p className="text-xs text-muted-foreground">{t("Lordo {lordo} · Ritenuta {ritenuta} · Netto {netto}", { lordo: formatCurrency(Number(s.importo_lordo)), ritenuta: formatCurrency(Number(s.ritenuta_importo)), netto: formatCurrency(Number(s.importo_netto)) })}</p></div>
            <Button size="sm" variant="outline" onClick={() => setVerbale(s)}>{t("Apri verbale SAL {n}", { n: s.numero_sal })}</Button>
          </li>)}</ul>}
          <Button size="sm" variant="ghost" onClick={() => apriScheda("contabilita")}>{t("Contabilità, fatture e pagamenti della ditta")}</Button>
        </section>
      </>}
    </div>}
    <Suspense fallback={<p role="status" className="p-3 text-sm">{t("Apro il dettaglio del subappalto…")}</p>}>
      {computo && elenco && <LavorazioniAffidateDialog titolo={`${nome} · ${c.numero_contratto || t("Contratto")} · ${computo === "originale" ? t("Elenco originale firmato") : `${t("Computo corrente")}${elenco.revisione != null ? ` · ${t("revisione {n}", { n: elenco.revisione })}` : ""}`}`}
        righe={computo === "originale" ? elenco.originali : elenco.righe}
        oneri={computo === "originale" ? undefined : Number(c.oneri_sicurezza)} importoPattuito={computo === "originale" ? undefined : Number(c.importo_contrattuale)}
        onPdf={computo === "corrente" ? () => scarica.mutate() : undefined} etichettaPdf={t("PDF computo")} pdfInCorso={scarica.isPending} onClose={() => setComputo(undefined)} />}
      {scheda && <SchedaCommessaDialog destinazione={{ to: scheda }} companyId={companyId} orderId={orderId} onClose={() => { setScheda(undefined); refresh(); }} />}
      {misure && <LavoriMisureSubDialog companyId={companyId} contratto={{ ...c, order_id: orderId }} sezioneIniziale={misure}
        onClose={() => { setMisure(undefined); refresh(); }} onApriVerbale={async (id) => {
          const aggiornato = await dettaglio.refetch();
          const s = aggiornato.data?.sal.find((r) => r.id === id);
          if (aggiornato.isError || !s) throw new Error(t("SAL salvato, ma il verbale non è ancora leggibile: riprova la lettura."));
          setMisure(undefined); setVerbale(s); refresh();
        }} />}
      {verbale && <VerbaleSalSubDialog companyId={companyId} sal={verbale} onClose={() => { setVerbale(undefined); refresh(); }} />}
    </Suspense>
    {variante && <VarianteVociDialog companyId={companyId} contrattoId={c.id} nomeDitta={nome} importo={Number(c.importo_contrattuale)} oneri={Number(c.oneri_sicurezza)} elencoContratto={c.elenco_lavori}
      quote={quote} voci={voci.map((v) => ({ ...v, fase: dati.fasi.find((f) => f.id === v.phase_id)?.name, sottofase: dati.sottofasi.find((s) => s.id === v.subphase_id)?.name }))}
      onChiudi={() => { setVariante(false); refresh(); }} onFatto={() => { setVariante(false); refresh(); }} />}
    {assegna && ditta?.campo_subappaltatore_id && <AffidaVociDialog companyId={companyId} orderId={orderId} voci={voci} fasi={dati.fasi}
      dittaFissa={{ id: ditta.campo_subappaltatore_id, nome }} onChiudi={() => setAssegna(false)} onCambio={refresh}
      onAffidate={() => { setAssegna(false); if (conVociCollegate) setVariante(true); }} />}
  </article>;
}

function Cifra({ titolo, valore }: { titolo: string; valore: number }) {
  return <div className="rounded-md bg-muted/40 p-2.5"><dt className="text-xs text-muted-foreground">{titolo}</dt><dd className="mt-1 font-semibold tabular-nums">{formatCurrency(valore)}</dd></div>;
}

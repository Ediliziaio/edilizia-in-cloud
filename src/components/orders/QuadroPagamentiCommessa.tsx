/**
 * Economia → Incassi: in cima, lo stato della commessa in una lettura. Quanto è
 * entrato e quanto deve entrare (rate e SAL del cliente), quanto è uscito e
 * quanto deve uscire.
 *
 * Fatture e costi (UsciteCommessa): a chi, con quale fattura e per quando:
 * fornitori e ordini d'acquisto, subappaltatori e ditte, professionisti,
 * noleggi, costi extra anche senza fattura.
 *
 * I numeri li calcola commessa_quadro_pagamenti() (vedi la migrazione
 * 20281031250000): le stesse regole di chi registra i pagamenti.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from 'react-router-dom';
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Paperclip, Receipt, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import {
  CATEGORIE, STATO_USCITA, documentoUscita, filtraUscite, normalizzaQuadro, riepilogoCategorie, totaliQuadro,
  type FiltroUscite, type Uscita,
} from "@/lib/orders/quadroPagamenti";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { IvaCommessa } from "./IvaCommessa";
import { PurchasePaymentsDialog } from "./PurchasePaymentsDialog";
import { RiquadroCommessa, TabellaCommessa } from "./TabellaCommessa";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

// La funzione è nuova: non ancora nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function useQuadroPagamenti(orderId: string) {
  return useQuery({
    // «order-supplier-payments» è fra le chiavi che si aggiornano dopo ogni pagamento registrato.
    queryKey: ["order-supplier-payments", "quadro", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("commessa_quadro_pagamenti", { p_order_id: orderId });
      if (error) throw error;
      return normalizzaQuadro(data);
    },
  });
}

interface Props {
  orderId: string;
  /** Vede importi della commessa: incassi dal cliente. */
  mostraIncassi: boolean;
  /** Vede i costi: uscite verso fornitori, subappalti, professionisti… */
  mostraUscite: boolean;
  /** Porta all'elenco delle uscite, in Fatture e costi. */
  onApriUscite?: () => void;
  /**
   * Le rate del cliente, subito sotto i quattro numeri (01/11/2026): la prima cosa da leggere è
   * lo stato degli incassi, poi i fornitori. L'IVA della commessa sta in fondo alla pagina.
   */
  incassi?: ReactNode | ((totali: ReturnType<typeof totaliQuadro>) => ReactNode);
  /** false = l'IVA della commessa la mostra chi chiama, più in basso. */
  conIva?: boolean;
  vistaUnificata?: boolean;
  documenti?: ReactNode;
}

export function QuadroPagamentiCommessa({ orderId, mostraIncassi, mostraUscite, onApriUscite, incassi, conIva = true, vistaUnificata = false, documenti }: Props) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useQuadroPagamenti(orderId);
  const totali = useMemo(() => totaliQuadro({ rate: data?.rate ?? [], uscite: data?.uscite ?? [],crediti_misura:data?.crediti_misura,incassi_unita:data?.incassi_unita }), [data]);

  const senzaAccessoCliente = <p role="note" className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">{t("Il tuo ruolo non permette di consultare fatture e incassi del cliente. I costi restano nella scheda Costi e Fatture Fornitori.")}</p>;
  if (!mostraIncassi && !mostraUscite && !documenti) return vistaUnificata ? senzaAccessoCliente : null;
  if (isError) return <ErroreLettura onRiprova={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const contenutoIncassi = typeof incassi === "function" ? incassi(totali) : incassi;
  // Nella vista cliente ordinaria, rate e documenti sono già un unico elenco.
  if (vistaUnificata) {
    if (!mostraIncassi && !documenti) return senzaAccessoCliente;
    if (data.crediti_misura) return <div className="space-y-3"><p role="note" className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">{t("Commessa a misura: i crediti derivano dai documenti emessi. Rapportini e SAL in bozza restano da rendicontare.")}</p>{documenti}</div>;
    if (data.incassi_unita) return <div className="space-y-3"><Card><CardHeader><CardTitle className="text-base">{t("Versamenti dell’unità")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t("Caparra, acconti e saldo si registrano in Unità e vendite. Le permute coprono il prezzo senza generare entrate.")}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">{t("Incassato dai versamenti")}</dt><dd className="font-semibold tabular-nums">{formatCurrency(totali.incassato)}</dd></div><div><dt className="text-muted-foreground">{t("Da incassare sull’unità")}</dt><dd className="font-semibold tabular-nums">{formatCurrency(totali.daIncassare)}</dd></div></dl>{data.incassi_unita.da_collegare>0 && <p className="text-sm text-amber-800">{t("{n} incassi storici da collegare alla prima nota.", { n: data.incassi_unita.da_collegare })}</p>}{data.incassi_unita.generale_id && <Link className="text-sm font-medium text-primary underline" to={`/azienda/ordini/${data.incassi_unita.generale_id}?scheda=unita`}>{t("Apri Unità e vendite")}</Link>}</CardContent></Card>{documenti}</div>;
    return <>{contenutoIncassi ?? documenti}</>;
  }

  const rateAperte = data.rate.filter((r) => !r.is_paid);
  const [cassaPrima, cassaDopo = ""] = (totali.cassa >= 0
    ? t("Finora la commessa ha portato in cassa {importo} (incassato meno pagato, IVA inclusa).")
    : t("Finora la commessa ha anticipato {importo} (incassato meno pagato, IVA inclusa).")).split("{importo}");

  return (
    <div className="space-y-4">
      {/* ── Lo stato in quattro numeri ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {mostraIncassi && <>
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-green-700" />} titolo={t("Incassato")} valore={totali.incassato} tono="verde" />
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-amber-700" />} titolo={t("Da incassare")} valore={totali.daIncassare} tono={totali.incassoScaduto > 0 ? "rosso" : totali.daIncassare > 0 ? "ambra" : undefined}
            nota={totali.incassoScaduto > 0 ? t("{importo} scaduti", { importo: formatCurrency(totali.incassoScaduto) }) : rateAperte[0]?.expected_date ? t("prossima il {data}", { data: dataIt(rateAperte[0].expected_date) }) : undefined} />
        </>}
        {mostraUscite && <KpiUscite totali={totali} />}
      </div>
      {mostraIncassi && mostraUscite && (
        <p className="text-sm text-slate-600">
          <Wallet className="mr-1 inline h-4 w-4" aria-hidden="true" />
          {cassaPrima}<strong className={totali.cassa >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(Math.abs(totali.cassa))}</strong>{cassaDopo}
          {mostraUscite && onApriUscite && <>{" "}<button type="button" className="font-medium text-primary underline underline-offset-2" onClick={onApriUscite}>{t("Vedi le uscite")}</button></>}
        </p>
      )}

      {/* ── Incassi dal cliente: le rate ── */}
      {mostraIncassi && data.crediti_misura ? <Card><CardHeader><CardTitle className="text-base">{t("Crediti da documenti emessi")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t("L’importo della commessa a misura è una stima. Rapportini e SAL in bozza restano da rendicontare; diventano crediti solo con il documento emesso.")}</p>
        {data.crediti_misura.documenti.length ? <ul className="divide-y">{data.crediti_misura.documenti.map(d=><li key={d.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><Link className="font-medium text-primary underline" to={d.nativo?`/azienda/documenti/${d.id}/dettaglio`:'/azienda/documenti/emesse-importate'}>{d.numero}</Link><span>{t("Emesso {emesso} · Incassato {incassato} · Residuo {residuo}", { emesso: formatCurrency(d.totale), incassato: formatCurrency(d.incassato), residuo: formatCurrency(d.residuo) })}{d.scadenza?` · ${dataIt(d.scadenza)}`:''}</span></li>)}</ul> : <p className="rounded-md bg-blue-50 p-3 text-sm text-blue-900">{t("Nessun credito emesso. Prosegui dal rendiconto delle lavorazioni.")}</p>}
      </CardContent></Card> : mostraIncassi && data.incassi_unita ? <Card><CardHeader><CardTitle className="text-base">{t("Incassi dell’unità collegati alla prima nota")}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-muted-foreground">{t("Caparra, acconti e saldo si registrano in Unità e vendite. Questa vista legge la stessa cassa effettiva; le permute coprono il prezzo senza generare entrate.")}</p>{data.incassi_unita.da_collegare>0 && <p className="text-sm text-amber-800">{t("{n} incassi storici ancora da collegare esplicitamente alla prima nota.", { n: data.incassi_unita.da_collegare })}</p>}{data.incassi_unita.generale_id && <Link className="text-sm font-medium text-primary underline" to={`/azienda/ordini/${data.incassi_unita.generale_id}?scheda=unita`}>{t("Apri Unità e vendite della commessa generale")}</Link>}</CardContent></Card> : contenutoIncassi}

      {/* ── SAL al cliente ── */}
      {mostraIncassi && data.sal_cliente.length > 0 && <SalCliente sal={data.sal_cliente} />}

      {/* ── IVA della commessa: a debito, a credito, saldo ── */}
      {conIva && mostraIncassi && mostraUscite && <IvaCommessa orderId={orderId} />}
    </div>
  );
}

/** Fatture e costi → Tutte: ogni uscita della commessa, in una tabella con la stessa veste delle altre viste. */
export function UsciteCommessa({ orderId, onApriSubappalti, onApriMezzi }: {
  orderId: string;
  /** Apre la vista dei subappalti (contratti e SAL passivi). */
  onApriSubappalti?: () => void;
  /** Porta ai mezzi del cantiere, dove si gestiscono noleggi e spese. */
  onApriMezzi?: () => void;
}) {
  const t = useT();
  const { data, isLoading, isError, refetch } = useQuadroPagamenti(orderId);
  const [filtro, setFiltro] = useState<FiltroUscite>("aperte");
  const [costoAperto, setCostoAperto] = useState<string | null>(null);
  const [odaAperto, setOdaAperto] = useState<string | null>(null);
  const uscite = useMemo(() => data?.uscite ?? [], [data]);
  const totali = useMemo(() => totaliQuadro({ rate: [], uscite }), [uscite]);
  const categorie = useMemo(() => riepilogoCategorie(uscite), [uscite]);
  const righe = useMemo(() => filtraUscite(uscite, filtro), [uscite, filtro]);

  if (isError) return <ErroreLettura onRiprova={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const scaduteUscite = uscite.filter((u) => u.stato === "scaduto").length;
  const [noleggiPrima, noleggiDopo = ""] = t("I noleggi si collegano ai mezzi in {link}.").split("{link}");
  const azione = (u: Uscita) => u.origine_tipo === "costo" ? () => setCostoAperto(u.origine_id)
    : u.origine_tipo === "oda" ? () => setOdaAperto(u.origine_id)
    : u.origine_tipo === "subappalto" ? onApriSubappalti : undefined;

  return (
    <>
      {costoAperto && <ExpensePaymentDialog key={costoAperto} costId={costoAperto} onClose={() => setCostoAperto(null)} />}
      {odaAperto && <PurchasePaymentsDialog orderId={odaAperto} onClose={() => setOdaAperto(null)} />}
      <RiquadroCommessa
        icona={<Receipt className="h-5 w-5 text-primary" aria-hidden="true" />}
        descrizione={t("Importi pagati e residui, con scadenze e movimenti riconciliati.")}
        titolo={t("Pagamenti della commessa")} conteggio={uscite.length}
        riassunto={scaduteUscite > 0 ? <span className="font-medium text-red-700">{t("{n} scaduti", { n: scaduteUscite })}</span> : undefined}
        numeri={<>
          <dl className="commessa-totali grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:max-w-xl">
            <NumeroUscite titolo={t("Pagato")} valore={totali.pagato} />
            <NumeroUscite titolo={t("Da pagare")} valore={totali.daPagare} evidenza={totali.pagamentoScaduto > 0 ? "rosso" : totali.daPagare > 0 ? "ambra" : undefined}
              nota={[totali.pagamentoScaduto > 0 ? t("{importo} scaduti", { importo: formatCurrency(totali.pagamentoScaduto) }) : null,
                totali.impegnato > 0 ? t("+ {importo} ordinati senza fattura", { importo: formatCurrency(totali.impegnato) }) : null].filter(Boolean).join(" · ") || undefined} />
          </dl>
          {uscite.length > 0 && (
            // Telefono: una riga che scorre di lato, non tre righe di bottoni.
            <div className="commessa-payment-filters flex flex-wrap gap-1.5 max-sm:-mx-3 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-3 max-sm:[scrollbar-width:none]" role="group" aria-label={t("Filtra i pagamenti")}>
              <Filtro attivo={filtro === "aperte"} onClick={() => setFiltro("aperte")}>{t("Da pagare")}</Filtro>
              {scaduteUscite > 0 && <Filtro attivo={filtro === "scadute"} onClick={() => setFiltro("scadute")}>{t("Scaduti ({n})", { n: scaduteUscite })}</Filtro>}
              {categorie.map((c) => (
                <Filtro key={c.value} attivo={filtro === c.value} onClick={() => setFiltro(c.value)}>
                  {t(c.label)} · {c.residuo > 0 ? formatCurrency(c.residuo) : c.voci}
                </Filtro>
              ))}
              <Filtro attivo={filtro === "tutte"} onClick={() => setFiltro("tutte")}>{t("Tutti ({n})", { n: uscite.length })}</Filtro>
            </div>
          )}
        </>}
      >
        <div className="space-y-3">
          {uscite.length === 0 ? (
            <p className="commessa-empty text-sm text-muted-foreground">{t("Nessun costo, ordine d’acquisto, subappalto o ditta su questa commessa.")}</p>
          ) : righe.length === 0 ? (
            <p className="commessa-empty commessa-empty-success rounded-md bg-green-50 p-3 text-sm text-green-800">{t("Niente da pagare qui: tutto saldato.")}</p>
          ) : (
            <TabellaCommessa etichetta={t("Pagamenti della commessa")} righe={righe} chiave={(u) => u.chiave}
              /* Clic sulla riga: apre quello che apre il pulsante in fondo (26/11/2026).
                 Chi guarda l'elenco vuole vedere il costo o l'ordine, e doveva arrivare
                 fino in fondo alla riga per riuscirci. */
              onRiga={(u) => azione(u)?.()} colonne={[
              { titolo: t("A chi"), principale: true, cella: (u) => <CellaUscita u={u} /> },
              { titolo: t("Documento"), soloComputer: true, cella: (u) => <span className="text-xs">{documentoUscita(u)}{u.ha_ricevuta && !u.senza_fattura && <span className="block text-muted-foreground"><Paperclip className="mr-1 inline h-3 w-3" aria-hidden="true" />{t("Ricevuta allegata")}</span>}</span> },
              { titolo: t("Scadenza"), cella: (u) => <CellaScadenza u={u} oggi={data.oggi} /> },
              { titolo: t("Importo"), destra: true, soloComputer: true, cella: (u) => formatCurrency(u.importo) },
              { titolo: t("Pagato"), destra: true, soloComputer: true, cella: (u) => (u.pagato > 0 ? formatCurrency(u.pagato) : "—") },
              { titolo: t("Da pagare"), destra: true, cella: (u) => <span className="font-medium">{u.stato === "fattura_da_arrivare" ? "—" : formatCurrency(u.residuo)}</span> },
              { titolo: t("Stato"), soloComputer: true, cella: (u) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATO_USCITA[u.stato].classe}`}>{t(STATO_USCITA[u.stato].label)}</span> },
              { titolo: t("Azioni"), destra: true, senzaEtichetta: true, cella: (u) => { const fai = azione(u); return fai ? (
                <Button size="sm" variant="outline" onClick={fai}>{u.origine_tipo === "subappalto" ? t("Apri SAL") : u.stato === "pagato" ? t("Pagamenti") : t("Registra pagamento")}</Button>
              ) : null; } },
            ]} />
          )}
          {data.mezzi_stimati?.costo ? (
            <p className="text-xs text-muted-foreground">
              {t("Mezzi dell’azienda usati in cantiere: costo stimato {importo} ({giorni} giorni-mezzo). È un costo interno, non un pagamento.", { importo: formatCurrency(Number(data.mezzi_stimati.costo)), giorni: data.mezzi_stimati.giorni ?? 0 })}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("Importi IVA inclusa, tranne i subappalti in reverse charge: lì alla ditta va l'imponibile.")}
            {onApriMezzi && <>{" "}{noleggiPrima}<button type="button" className="font-medium text-primary underline underline-offset-2" onClick={onApriMezzi}>{t("Cantiere → Lavorazioni")}</button>{noleggiDopo}</>}
          </p>
        </div>
      </RiquadroCommessa>
    </>
  );
}

function NumeroUscite({ titolo, valore, nota, evidenza }: { titolo: string; valore: number; nota?: string; evidenza?: "rosso" | "ambra" }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titolo}</dt>
      <dd className={`mt-1 text-sm font-semibold tabular-nums ${evidenza === "rosso" ? "text-red-700" : evidenza === "ambra" ? "text-amber-700" : ""}`}>{formatCurrency(valore)}</dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

/** «Fattura X - Fornitore» quando il fornitore è già scritto prima: si toglie la coda ripetuta. */
export function descrizioneSenzaControparte(descrizione: string | null | undefined, controparte: string | null | undefined): string {
  const d = (descrizione ?? "").trim();
  const c = (controparte ?? "").trim();
  if (!c) return d;
  const coda = new RegExp(`\\s*[-–·]\\s*${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i");
  return d.replace(coda, "").trim() || d;
}

function CellaUscita({ u }: { u: Uscita }) {
  const t = useT();
  const etichettaCategoria = CATEGORIE.find((c) => c.value === u.categoria)?.label;
  const categoria = etichettaCategoria ? t(etichettaCategoria) : u.categoria;
  const descrizione = descrizioneSenzaControparte(u.descrizione, u.controparte);
  return (
    <div className="min-w-0">
      <p className="font-medium">{u.controparte ?? t("Senza fornitore")} {descrizione && <span className="font-normal text-muted-foreground">· {descrizione}</span>}
        {/* Telefono: lo stato sta qui, non su una riga «Stato» a sé. */}
        <span className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-2 py-0.5 align-middle text-[11px] font-medium sm:hidden ${STATO_USCITA[u.stato].classe}`}>{t(STATO_USCITA[u.stato].label)}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {categoria}{u.riferimento ? ` · ${u.riferimento}` : ""}{u.ripartito ? ` · ${t("quota {pct}%", { pct: u.quota_pct.toLocaleString(intlCampo()) })}` : ""}
      </p>
      {u.origine_tipo === "subappalto" && u.contratto != null && (
        <p className="text-xs text-muted-foreground">
          {t("Contratto {contratto} · maturato {maturato}", { contratto: formatCurrency(u.contratto), maturato: formatCurrency(u.maturato_lordo ?? 0) })}
          {u.ritenute ? ` · ${t("ritenute {importo}", { importo: formatCurrency(u.ritenute) })}` : ""}
          {u.contratto - (u.maturato_lordo ?? 0) > 0.01 ? ` · ${t("ancora da maturare {importo}", { importo: formatCurrency(u.contratto - (u.maturato_lordo ?? 0)) })}` : ""}
        </p>
      )}
      {(u.origine_tipo === "subappalto" || u.origine_tipo === "ditta") && u.iva_pct != null && (
        <p className="text-xs text-muted-foreground">
          {u.reverse_charge
            ? t("Reverse charge: alla ditta va l'imponibile; l'IVA {iva} la integri tu e la detrai insieme: non cambia quanto versi", { iva: `${Number(u.iva_pct).toLocaleString(intlCampo())}%${u.iva_da_versare ? ` (${formatCurrency(u.iva_da_versare)})` : ""}` })
            : t("IVA {pct}% inclusa", { pct: Number(u.iva_pct).toLocaleString(intlCampo()) })}
        </p>
      )}
    </div>
  );
}

function CellaScadenza({ u, oggi }: { u: Uscita; oggi: string }) {
  const t = useT();
  if (u.stato === "pagato") return u.pagato_il ? <span className="whitespace-nowrap text-xs text-muted-foreground">{t("Pagato il {data}", { data: dataIt(u.pagato_il) })}</span> : <span className="text-xs">—</span>;
  if (!u.scadenza) return <span className="text-xs">—</span>;
  const scaduta = u.stato === "scaduto";
  const giorni = oggi ? Math.round((Date.parse(u.scadenza) - Date.parse(oggi)) / 86_400_000) : null;
  return (
    <span className={`block text-xs ${scaduta ? "font-medium text-red-700" : "text-muted-foreground"}`}>
      {scaduta && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}
      {/* Subappalto: la data è quando il SAL è maturato; i termini di pagamento stanno nel contratto. */}
      {u.origine_tipo === "oda" ? t("Consegna prevista") : u.origine_tipo === "subappalto" ? t("SAL da pagare dal") : ""} <span className="whitespace-nowrap">{dataIt(u.scadenza)}</span>
      {giorni != null && u.origine_tipo !== "oda" && u.origine_tipo !== "subappalto" ? <span className="block whitespace-nowrap">{giorni < 0 ? t("scaduta da {n} giorni", { n: -giorni }) : giorni === 0 ? t("oggi") : t("tra {n} giorni", { n: giorni })}</span> : null}
    </span>
  );
}

function ErroreLettura({ onRiprova }: { onRiprova: () => void }) {
  const t = useT();
  return (
    <p role="alert" className="rounded-lg border border-amber-300 bg-white p-4 text-sm">
      {t("Non riesco a leggere incassi e pagamenti della commessa.")} <button type="button" className="underline" onClick={onRiprova}>{t("Riprova")}</button>
    </p>
  );
}

function KpiUscite({ totali }: { totali: ReturnType<typeof totaliQuadro> }) {
  const t = useT();
  return <>
    <Kpi icona={<ArrowUpRight className="h-4 w-4 text-slate-700" />} titolo={t("Pagato")} valore={totali.pagato} />
    <Kpi icona={<ArrowUpRight className="h-4 w-4 text-amber-700" />} titolo={t("Da pagare")} valore={totali.daPagare} tono={totali.pagamentoScaduto > 0 ? "rosso" : "ambra"}
      nota={[totali.pagamentoScaduto > 0 ? t("{importo} scaduti", { importo: formatCurrency(totali.pagamentoScaduto) }) : null,
        totali.impegnato > 0 ? t("+ {importo} ordinati senza fattura", { importo: formatCurrency(totali.impegnato) }) : null].filter(Boolean).join(" · ") || undefined} />
  </>;
}

/** I SAL al cliente e la rata che li incassa: le rate si gestiscono nella scheda degli incassi. */
function SalCliente({ sal }: { sal: ReturnType<typeof normalizzaQuadro>["sal_cliente"] }) {
  const t = useT();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ArrowDownLeft className="h-5 w-5 text-primary" aria-hidden="true" />{t("SAL al cliente")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("Ogni SAL e la rata che lo incassa: rate, fatture e incassi si gestiscono negli incassi qui sopra.")}</p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2" aria-label={t("SAL del cliente")}>
          {sal.map((s) => (
            <li key={s.id} className="rounded-md border px-3 py-2 text-sm">
              <span className="font-semibold">SAL {s.numero_sal}</span> · {dataIt(s.data_emissione)} · {s.importo_sal_ivato != null
                ? <>{formatCurrency(s.importo_sal_ivato)} <span className="text-xs text-muted-foreground">{t("IVA inclusa ({imponibile} + IVA {pct}%)", { imponibile: formatCurrency(s.importo_sal ?? 0), pct: Number(s.iva_pct ?? 0).toLocaleString(intlCampo()) })}</span></>
                : formatCurrency(Number(s.importo_totale ?? 0))}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${s.incassato ? "bg-green-50 text-green-800" : s.rata ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {s.incassato ? t("incassato") : s.rata ? t("da incassare con «{rata}»", { rata: s.rata }) : s.stato === "approvato" ? t("approvato, senza rata") : s.stato ?? t("bozza")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Kpi({ icona, titolo, valore, nota, tono }: { icona: ReactNode; titolo: string; valore: number; nota?: string; tono?: "verde" | "ambra" | "rosso" }) {
  const colore = tono === "verde" ? "text-green-700" : tono === "rosso" ? "text-red-700" : tono === "ambra" ? "text-amber-700" : "text-slate-900";
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icona}{titolo}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${colore}`}>{formatCurrency(valore)}</p>
      {nota && <p className={`text-xs ${tono === "rosso" ? "text-red-700" : "text-muted-foreground"}`}>{nota}</p>}
    </div>
  );
}

function Filtro({ attivo, onClick, children }: { attivo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={attivo}
      className={`min-h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-medium ${attivo ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-muted"}`}>
      {children}
    </button>
  );
}

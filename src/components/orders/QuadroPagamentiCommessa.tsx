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
  incassi?: ReactNode;
  /** false = l'IVA della commessa la mostra chi chiama, più in basso. */
  conIva?: boolean;
}

export function QuadroPagamentiCommessa({ orderId, mostraIncassi, mostraUscite, onApriUscite, incassi, conIva = true }: Props) {
  const { data, isLoading, isError, refetch } = useQuadroPagamenti(orderId);
  const totali = useMemo(() => totaliQuadro({ rate: data?.rate ?? [], uscite: data?.uscite ?? [] }), [data]);

  if (!mostraIncassi && !mostraUscite) return null;
  if (isError) return <ErroreLettura onRiprova={() => void refetch()} />;
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const rateAperte = data.rate.filter((r) => !r.is_paid);

  return (
    <div className="space-y-4">
      {/* ── Lo stato in quattro numeri ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {mostraIncassi && <>
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-green-700" />} titolo="Incassato" valore={totali.incassato} tono="verde" />
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-amber-700" />} titolo="Da incassare" valore={totali.daIncassare} tono={totali.incassoScaduto > 0 ? "rosso" : "ambra"}
            nota={totali.incassoScaduto > 0 ? `${formatCurrency(totali.incassoScaduto)} scaduti` : rateAperte[0]?.expected_date ? `prossima il ${dataIt(rateAperte[0].expected_date)}` : undefined} />
        </>}
        {mostraUscite && <KpiUscite totali={totali} />}
      </div>
      {mostraIncassi && mostraUscite && (
        <p className="text-sm text-slate-600">
          <Wallet className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Finora la commessa {totali.cassa >= 0 ? "ha portato in cassa" : "ha anticipato"} <strong className={totali.cassa >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(Math.abs(totali.cassa))}</strong> (incassato meno pagato, IVA inclusa).
          {mostraUscite && onApriUscite && <>{" "}<button type="button" className="font-medium text-primary underline underline-offset-2" onClick={onApriUscite}>Vedi le uscite</button></>}
        </p>
      )}

      {/* ── Incassi dal cliente: le rate ── */}
      {incassi}

      {/* ── SAL emessi al cliente ── */}
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
  const azione = (u: Uscita) => u.origine_tipo === "costo" ? () => setCostoAperto(u.origine_id)
    : u.origine_tipo === "oda" ? () => setOdaAperto(u.origine_id)
    : u.origine_tipo === "subappalto" ? onApriSubappalti : undefined;

  return (
    <>
      {costoAperto && <ExpensePaymentDialog key={costoAperto} costId={costoAperto} onClose={() => setCostoAperto(null)} />}
      {odaAperto && <PurchasePaymentsDialog orderId={odaAperto} onClose={() => setOdaAperto(null)} />}
      <RiquadroCommessa
        icona={<Receipt className="h-5 w-5 text-primary" aria-hidden="true" />}
        titolo="Pagamenti della commessa" conteggio={uscite.length}
        riassunto={scaduteUscite > 0 ? <span className="font-medium text-red-700">{scaduteUscite} scaduti</span> : undefined}
        numeri={<>
          <dl className="grid grid-cols-2 gap-3 rounded-md border bg-muted/20 p-3 sm:max-w-xl">
            <NumeroUscite titolo="Pagato" valore={totali.pagato} />
            <NumeroUscite titolo="Da pagare" valore={totali.daPagare} evidenza={totali.pagamentoScaduto > 0 ? "rosso" : "ambra"}
              nota={[totali.pagamentoScaduto > 0 ? `${formatCurrency(totali.pagamentoScaduto)} scaduti` : null,
                totali.impegnato > 0 ? `+ ${formatCurrency(totali.impegnato)} ordinati senza fattura` : null].filter(Boolean).join(" · ") || undefined} />
          </dl>
          {uscite.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra i pagamenti">
              <Filtro attivo={filtro === "aperte"} onClick={() => setFiltro("aperte")}>Da pagare</Filtro>
              {scaduteUscite > 0 && <Filtro attivo={filtro === "scadute"} onClick={() => setFiltro("scadute")}>Scaduti ({scaduteUscite})</Filtro>}
              {categorie.map((c) => (
                <Filtro key={c.value} attivo={filtro === c.value} onClick={() => setFiltro(c.value)}>
                  {c.label} · {c.residuo > 0 ? formatCurrency(c.residuo) : c.voci}
                </Filtro>
              ))}
              <Filtro attivo={filtro === "tutte"} onClick={() => setFiltro("tutte")}>Tutti ({uscite.length})</Filtro>
            </div>
          )}
        </>}
      >
        <div className="space-y-3">
          {uscite.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun costo, ordine d’acquisto, subappalto o ditta su questa commessa.</p>
          ) : righe.length === 0 ? (
            <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Niente da pagare qui: tutto saldato.</p>
          ) : (
            <TabellaCommessa etichetta="Pagamenti della commessa" righe={righe} chiave={(u) => u.chiave} colonne={[
              { titolo: "A chi", principale: true, cella: (u) => <CellaUscita u={u} /> },
              { titolo: "Documento", cella: (u) => <span className="text-xs">{documentoUscita(u)}{u.ha_ricevuta && !u.senza_fattura && <span className="block text-muted-foreground"><Paperclip className="mr-1 inline h-3 w-3" aria-hidden="true" />Ricevuta allegata</span>}</span> },
              { titolo: "Scadenza", cella: (u) => <CellaScadenza u={u} oggi={data.oggi} /> },
              { titolo: "Importo", destra: true, cella: (u) => formatCurrency(u.importo) },
              { titolo: "Pagato", destra: true, cella: (u) => (u.pagato > 0 ? formatCurrency(u.pagato) : "—") },
              { titolo: "Da pagare", destra: true, cella: (u) => <span className="font-medium">{u.stato === "fattura_da_arrivare" ? "—" : formatCurrency(u.residuo)}</span> },
              { titolo: "Stato", cella: (u) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATO_USCITA[u.stato].classe}`}>{STATO_USCITA[u.stato].label}</span> },
              { titolo: "Azioni", destra: true, cella: (u) => { const fai = azione(u); return fai ? (
                <Button size="sm" variant="outline" onClick={fai}>{u.origine_tipo === "subappalto" ? "Apri SAL" : u.stato === "pagato" ? "Pagamenti" : "Registra pagamento"}</Button>
              ) : null; } },
            ]} />
          )}
          {data.mezzi_stimati?.costo ? (
            <p className="text-xs text-muted-foreground">
              Mezzi dell’azienda usati in cantiere: costo stimato {formatCurrency(Number(data.mezzi_stimati.costo))} ({data.mezzi_stimati.giorni ?? 0} giorni-mezzo). È un costo interno, non un pagamento.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Importi IVA inclusa, tranne i subappalti in reverse charge: lì alla ditta va l'imponibile.
            {onApriMezzi && <>{" "}I noleggi si collegano ai mezzi in <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={onApriMezzi}>Cantiere → Lavorazioni</button>.</>}
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

function CellaUscita({ u }: { u: Uscita }) {
  const categoria = CATEGORIE.find((c) => c.value === u.categoria)?.label ?? u.categoria;
  return (
    <div className="min-w-0">
      <p className="font-medium">{u.controparte ?? "Senza fornitore"} <span className="font-normal text-muted-foreground">· {u.descrizione}</span></p>
      <p className="text-xs text-muted-foreground">
        {categoria}{u.riferimento ? ` · ${u.riferimento}` : ""}{u.ripartito ? ` · quota ${u.quota_pct.toLocaleString("it-IT")}%` : ""}
      </p>
      {u.origine_tipo === "subappalto" && u.contratto != null && (
        <p className="text-xs text-muted-foreground">
          Contratto {formatCurrency(u.contratto)} · maturato {formatCurrency(u.maturato_lordo ?? 0)}
          {u.ritenute ? ` · ritenute ${formatCurrency(u.ritenute)}` : ""}
          {u.contratto - (u.maturato_lordo ?? 0) > 0.01 ? ` · ancora da maturare ${formatCurrency(u.contratto - (u.maturato_lordo ?? 0))}` : ""}
        </p>
      )}
      {(u.origine_tipo === "subappalto" || u.origine_tipo === "ditta") && u.iva_pct != null && (
        <p className="text-xs text-muted-foreground">
          {u.reverse_charge
            ? `Reverse charge: alla ditta va l'imponibile; l'IVA ${Number(u.iva_pct).toLocaleString("it-IT")}%${u.iva_da_versare ? ` (${formatCurrency(u.iva_da_versare)})` : ""} la integri tu e la detrai insieme: non cambia quanto versi`
            : `IVA ${Number(u.iva_pct).toLocaleString("it-IT")}% inclusa`}
        </p>
      )}
    </div>
  );
}

function CellaScadenza({ u, oggi }: { u: Uscita; oggi: string }) {
  if (u.stato === "pagato") return u.pagato_il ? <span className="whitespace-nowrap text-xs text-muted-foreground">Pagato il {dataIt(u.pagato_il)}</span> : <span className="text-xs">—</span>;
  if (!u.scadenza) return <span className="text-xs">—</span>;
  const scaduta = u.stato === "scaduto";
  const giorni = oggi ? Math.round((Date.parse(u.scadenza) - Date.parse(oggi)) / 86_400_000) : null;
  return (
    <span className={`block text-xs ${scaduta ? "font-medium text-red-700" : "text-muted-foreground"}`}>
      {scaduta && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}
      {/* Subappalto: la data è quando il SAL è maturato; i termini di pagamento stanno nel contratto. */}
      {u.origine_tipo === "oda" ? "Consegna prevista" : u.origine_tipo === "subappalto" ? "SAL da pagare dal" : ""} <span className="whitespace-nowrap">{dataIt(u.scadenza)}</span>
      {giorni != null && u.origine_tipo !== "oda" && u.origine_tipo !== "subappalto" ? <span className="block whitespace-nowrap">{giorni < 0 ? `scaduta da ${-giorni} giorni` : giorni === 0 ? "oggi" : `tra ${giorni} giorni`}</span> : null}
    </span>
  );
}

function ErroreLettura({ onRiprova }: { onRiprova: () => void }) {
  return (
    <p role="alert" className="rounded-lg border border-amber-300 bg-white p-4 text-sm">
      Non riesco a leggere incassi e pagamenti della commessa. <button type="button" className="underline" onClick={onRiprova}>Riprova</button>
    </p>
  );
}

function KpiUscite({ totali }: { totali: ReturnType<typeof totaliQuadro> }) {
  return <>
    <Kpi icona={<ArrowUpRight className="h-4 w-4 text-slate-700" />} titolo="Pagato" valore={totali.pagato} />
    <Kpi icona={<ArrowUpRight className="h-4 w-4 text-amber-700" />} titolo="Da pagare" valore={totali.daPagare} tono={totali.pagamentoScaduto > 0 ? "rosso" : "ambra"}
      nota={[totali.pagamentoScaduto > 0 ? `${formatCurrency(totali.pagamentoScaduto)} scaduti` : null,
        totali.impegnato > 0 ? `+ ${formatCurrency(totali.impegnato)} ordinati senza fattura` : null].filter(Boolean).join(" · ") || undefined} />
  </>;
}

/** I SAL emessi al cliente e la rata che li incassa: le rate si gestiscono nella scheda degli incassi. */
function SalCliente({ sal }: { sal: ReturnType<typeof normalizzaQuadro>["sal_cliente"] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ArrowDownLeft className="h-5 w-5 text-primary" aria-hidden="true" />SAL emessi al cliente</CardTitle>
        <p className="text-sm text-muted-foreground">Ogni SAL e la rata che lo incassa: rate, fatture e incassi si gestiscono negli incassi qui sopra.</p>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2" aria-label="SAL del cliente">
          {sal.map((s) => (
            <li key={s.id} className="rounded-md border px-3 py-2 text-sm">
              <span className="font-semibold">SAL {s.numero_sal}</span> · {dataIt(s.data_emissione)} · {s.importo_sal_ivato != null
                ? <>{formatCurrency(s.importo_sal_ivato)} <span className="text-xs text-muted-foreground">IVA inclusa ({formatCurrency(s.importo_sal ?? 0)} + IVA {Number(s.iva_pct ?? 0).toLocaleString("it-IT")}%)</span></>
                : formatCurrency(Number(s.importo_totale ?? 0))}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${s.incassato ? "bg-green-50 text-green-800" : s.rata ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                {s.incassato ? "incassato" : s.rata ? `da incassare con «${s.rata}»` : s.stato === "approvato" ? "approvato, senza rata" : s.stato ?? "bozza"}
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
      className={`min-h-8 rounded-full border px-3 text-xs font-medium ${attivo ? "border-primary bg-primary text-primary-foreground" : "bg-white text-slate-700 hover:bg-muted"}`}>
      {children}
    </button>
  );
}

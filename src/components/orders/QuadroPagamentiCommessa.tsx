/**
 * Economia → Incassi e pagamenti: in cima, lo stato della commessa in una
 * lettura. Quanto è entrato e quanto deve entrare (rate e SAL del cliente),
 * quanto è uscito e quanto deve uscire, a chi, con quale fattura e per quando:
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
import { PurchasePaymentsDialog } from "./PurchasePaymentsDialog";
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
  /** Apre la vista dei subappalti (contratti e SAL passivi). */
  onApriSubappalti?: () => void;
}

export function QuadroPagamentiCommessa({ orderId, mostraIncassi, mostraUscite, onApriSubappalti }: Props) {
  const { data, isLoading, isError, refetch } = useQuadroPagamenti(orderId);
  const [filtro, setFiltro] = useState<FiltroUscite>("aperte");
  const [costoAperto, setCostoAperto] = useState<string | null>(null);
  const [odaAperto, setOdaAperto] = useState<string | null>(null);

  const totali = useMemo(() => totaliQuadro({ rate: data?.rate ?? [], uscite: data?.uscite ?? [] }), [data]);
  const categorie = useMemo(() => riepilogoCategorie(data?.uscite ?? []), [data]);
  const righe = useMemo(() => filtraUscite(data?.uscite ?? [], filtro), [data, filtro]);

  if (!mostraIncassi && !mostraUscite) return null;
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border border-amber-300 bg-white p-4 text-sm">
        Non riesco a leggere incassi e pagamenti della commessa. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button>
      </p>
    );
  }
  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const scaduteUscite = (data.uscite ?? []).filter((u) => u.stato === "scaduto").length;
  const rateAperte = data.rate.filter((r) => !r.is_paid);

  return (
    <div className="space-y-4">
      {costoAperto && <ExpensePaymentDialog key={costoAperto} costId={costoAperto} onClose={() => setCostoAperto(null)} />}
      {odaAperto && <PurchasePaymentsDialog orderId={odaAperto} onClose={() => setOdaAperto(null)} />}

      {/* ── Lo stato in quattro numeri ── */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {mostraIncassi && <>
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-green-700" />} titolo="Incassato" valore={totali.incassato} tono="verde" />
          <Kpi icona={<ArrowDownLeft className="h-4 w-4 text-amber-700" />} titolo="Da incassare" valore={totali.daIncassare} tono={totali.incassoScaduto > 0 ? "rosso" : "ambra"}
            nota={totali.incassoScaduto > 0 ? `${formatCurrency(totali.incassoScaduto)} scaduti` : rateAperte[0]?.expected_date ? `prossima il ${dataIt(rateAperte[0].expected_date)}` : undefined} />
        </>}
        {mostraUscite && <>
          <Kpi icona={<ArrowUpRight className="h-4 w-4 text-slate-700" />} titolo="Pagato" valore={totali.pagato} />
          <Kpi icona={<ArrowUpRight className="h-4 w-4 text-amber-700" />} titolo="Da pagare" valore={totali.daPagare} tono={totali.pagamentoScaduto > 0 ? "rosso" : "ambra"}
            nota={[totali.pagamentoScaduto > 0 ? `${formatCurrency(totali.pagamentoScaduto)} scaduti` : null,
              totali.impegnato > 0 ? `+ ${formatCurrency(totali.impegnato)} ordinati senza fattura` : null].filter(Boolean).join(" · ") || undefined} />
        </>}
      </div>
      {mostraIncassi && mostraUscite && (
        <p className="text-sm text-slate-600">
          <Wallet className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Finora la commessa {totali.cassa >= 0 ? "ha portato in cassa" : "ha anticipato"} <strong className={totali.cassa >= 0 ? "text-green-700" : "text-red-700"}>{formatCurrency(Math.abs(totali.cassa))}</strong> (incassato meno pagato, IVA inclusa).
        </p>
      )}

      {/* ── Da pagare ── */}
      {mostraUscite && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />Pagamenti della commessa
              {scaduteUscite > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{scaduteUscite} scaduti</span>}
            </CardTitle>
            <p className="text-sm text-muted-foreground">Ogni impegno verso fornitori, subappaltatori, ditte, professionisti e noleggi, e i costi extra: con la fattura collegata, quanto è pagato, quanto resta e quando scade. Importi IVA inclusa.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.uscite.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun costo, ordine d’acquisto, subappalto o ditta su questa commessa. I costi si aggiungono da Materiali e acquisti → Fatture e costi.</p>
            ) : <>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtra i pagamenti">
                <Filtro attivo={filtro === "aperte"} onClick={() => setFiltro("aperte")}>Da pagare</Filtro>
                {scaduteUscite > 0 && <Filtro attivo={filtro === "scadute"} onClick={() => setFiltro("scadute")}>Scaduti ({scaduteUscite})</Filtro>}
                {categorie.map((c) => (
                  <Filtro key={c.value} attivo={filtro === c.value} onClick={() => setFiltro(c.value)}>
                    {c.label} · {c.residuo > 0 ? formatCurrency(c.residuo) : c.voci}
                  </Filtro>
                ))}
                <Filtro attivo={filtro === "tutte"} onClick={() => setFiltro("tutte")}>Tutti ({data.uscite.length})</Filtro>
              </div>
              {righe.length === 0 ? (
                <p className="rounded-md bg-green-50 p-3 text-sm text-green-800">Niente da pagare qui: tutto saldato.</p>
              ) : (
                <ul className="divide-y rounded-md border" aria-label="Pagamenti della commessa">
                  {righe.map((u) => (
                    <RigaUscita key={u.chiave} u={u} oggi={data.oggi}
                      onPagamenti={u.origine_tipo === "costo" ? () => setCostoAperto(u.origine_id)
                        : u.origine_tipo === "oda" ? () => setOdaAperto(u.origine_id)
                        : u.origine_tipo === "subappalto" ? onApriSubappalti : undefined} />
                  ))}
                </ul>
              )}
              {data.mezzi_stimati?.costo ? (
                <p className="text-xs text-muted-foreground">
                  Mezzi dell’azienda usati in cantiere: costo stimato {formatCurrency(Number(data.mezzi_stimati.costo))} ({data.mezzi_stimati.giorni ?? 0} giorni-mezzo). È un costo interno, non un pagamento.
                </p>
              ) : null}
            </>}
          </CardContent>
        </Card>
      )}

      {/* ── SAL del cliente ── le rate (con fattura, stato e «Registra incasso») stanno nel
          piano pagamenti subito sotto: qui non si ripetono. */}
      {mostraIncassi && data.sal_cliente.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ArrowDownLeft className="h-5 w-5 text-primary" aria-hidden="true" />Incassi dal cliente</CardTitle>
            <p className="text-sm text-muted-foreground">I SAL emessi al cliente e la rata che li incassa. Rate, fatture e incassi si gestiscono nel piano pagamenti qui sotto.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.sal_cliente.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">SAL del cliente</p>
                <ul className="flex flex-wrap gap-2" aria-label="SAL del cliente">
                  {data.sal_cliente.map((s) => (
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
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RigaUscita({ u, oggi, onPagamenti }: { u: Uscita; oggi: string; onPagamenti?: () => void }) {
  const st = STATO_USCITA[u.stato];
  const categoria = CATEGORIE.find((c) => c.value === u.categoria)?.label ?? u.categoria;
  const scaduta = u.stato === "scaduto";
  const giorni = u.scadenza && oggi ? Math.round((Date.parse(u.scadenza) - Date.parse(oggi)) / 86_400_000) : null;
  return (
    <li className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{u.controparte ?? "Senza fornitore"} <span className="font-normal text-muted-foreground">· {u.descrizione}</span></p>
        <p className="text-xs text-muted-foreground">
          {categoria}{u.riferimento ? ` · ${u.riferimento}` : ""} · {documentoUscita(u)}
          {u.ripartito ? ` · quota ${u.quota_pct.toLocaleString("it-IT")}%` : ""}
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
            IVA {Number(u.iva_pct).toLocaleString("it-IT")}% inclusa{u.reverse_charge ? " · reverse charge: alla ditta va l'imponibile, l'IVA la versi tu" : ""}
          </p>
        )}
        {u.stato !== "pagato" && u.scadenza && (
          <p className={`text-xs ${scaduta ? "font-medium text-red-700" : "text-muted-foreground"}`}>
            {scaduta && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}
            {/* Subappalto: la data è quando il SAL è maturato; i termini di pagamento stanno nel contratto. */}
            {u.origine_tipo === "oda" ? "Consegna prevista" : u.origine_tipo === "subappalto" ? "SAL da pagare dal" : "Scadenza"} {dataIt(u.scadenza)}
            {giorni != null && u.origine_tipo !== "oda" && u.origine_tipo !== "subappalto" ? (giorni < 0 ? ` · scaduta da ${-giorni} giorni` : giorni === 0 ? " · oggi" : ` · tra ${giorni} giorni`) : ""}
          </p>
        )}
        {u.stato === "pagato" && u.pagato_il && <p className="text-xs text-muted-foreground">Pagato il {dataIt(u.pagato_il)}</p>}
        {u.ha_ricevuta && <p className="text-xs text-muted-foreground"><Paperclip className="mr-1 inline h-3 w-3" aria-hidden="true" />Ricevuta allegata</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.classe}`}>{st.label}</span>
        <div className="text-right tabular-nums">
          <p className="text-sm font-semibold">{formatCurrency(u.stato === "pagato" || u.stato === "fattura_da_arrivare" ? u.importo : u.residuo)}</p>
          <p className="text-[11px] text-muted-foreground">
            {u.stato === "fattura_da_arrivare" ? "ordinato" : u.stato === "pagato" ? "pagato" : u.pagato > 0 ? `resta · pagato ${formatCurrency(u.pagato)} su ${formatCurrency(u.importo)}` : "da pagare"}
          </p>
        </div>
        {onPagamenti && (
          <Button size="sm" variant="outline" onClick={onPagamenti}>
            {u.origine_tipo === "subappalto" ? "Apri SAL" : u.stato === "pagato" ? "Pagamenti" : "Registra pagamento"}
          </Button>
        )}
      </div>
    </li>
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

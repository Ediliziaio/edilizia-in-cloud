import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { CaricaFatturaCommessaButton, collegaFatturaACommessa } from "./CaricaFatturaCommessa";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
/**
 * Materiali e acquisti → «Bolle e DDT» e «Fatture fornitori» della commessa.
 *
 * I documenti c'erano già, sparsi: le bolle dei fornitori stanno sull'ordine
 * d'acquisto (ddt_ricezione → purchase_orders.order_id), quelle fotografate in
 * cantiere su campo_acquisti, i DDT fatti al cliente su documenti_fiscali; le
 * fatture dei fornitori sono legate alla commessa attraverso l'ordine d'acquisto
 * o il costo registrato (company_costs.order_id), oppure solo suggerite
 * dall'AI (order_id_suggerito). Qui si vedono tutti insieme, per commessa.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, FileText, Plus, Receipt, Truck } from "lucide-react";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { useCostiCommessa } from "./OrderCostiCommessa";

// Alcune tabelle non sono ancora nei tipi generati: contratto locale.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const dataIt = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

interface OdaCommessa { id: string; oda_number: string | null; fornitore: string | null; totale: number | null }

/** Liste di id spezzate a 50: liste lunghe nell'indirizzo della richiesta non passano. */
const aLotti = (ids: string[]) => Array.from({ length: Math.ceil(ids.length / 50) }, (_, i) => ids.slice(i * 50, (i + 1) * 50));
const senzaDoppi = <T extends { id: string }>(righe: T[]) => [...new Map(righe.map((r) => [r.id, r])).values()];

async function odaDellaCommessa(companyId: string, orderId: string): Promise<OdaCommessa[]> {
  const data = await allPaymentRows((da, a) => db
    .from("purchase_orders")
    .select("id, oda_number, total, suppliers(name)")
    .eq("company_id", companyId)
    .eq("order_id", orderId)
    .order("id")
    .range(da, a));
  return ((data ?? []) as Array<{ id: string; oda_number: string | null; total: number | null; suppliers: { name: string | null } | null }>)
    .map((o) => ({ id: o.id, oda_number: o.oda_number, fornitore: o.suppliers?.name ?? null, totale: o.total == null ? null : Number(o.total) }));
}

// ── Bolle e DDT ─────────────────────────────────────────────────────────────

export interface RigaBolla {
  id: string;
  origine: "fornitore" | "cantiere" | "cliente";
  numero: string | null;
  data: string | null;
  controparte: string | null;
  stato: string;
  attenzione: boolean;
  link?: string;
  /** Ordine d'acquisto a cui la bolla appartiene, quando c'è. */
  purchaseOrderId?: string | null;
  /** Cosa manca: confermare a cosa appartiene, oppure controllare la merce. */
  daFare?: "conferma" | "controllo" | null;
  /** Perché, in parole: compare sulla riga. */
  motivo?: string | null;
}

/**
 * Una bolla è confermata quando è sull'ordine giusto e qualcuno l'ha controllata. Dal cantiere la conferma l'ufficio;
 * caricata sulla commessa senza ordine resta da confermare finché nessuno l'ha controllata.
 */
export function cosaManca(
  origine: "fornitore" | "cantiere",
  d: { stato: string | null; purchase_order_id?: string | null; has_damages?: boolean | null; ai_avvisi?: unknown },
): Pick<RigaBolla, "daFare" | "motivo"> {
  const avvisiAI = Array.isArray(d.ai_avvisi) ? d.ai_avvisi.length : 0;
  if (origine === "cantiere") {
    if (d.stato !== "da_verificare") return { daFare: null, motivo: null };
    return { daFare: "conferma", motivo: d.purchase_order_id ? "Foto dal cantiere: conferma che sia di questo ordine" : "Foto dal cantiere: conferma a cosa appartiene" };
  }
  if (d.stato === "non_conforme" || d.has_damages) return { daFare: "controllo", motivo: "Merce non conforme o danneggiata" };
  if (d.stato === "ricevuto" || d.stato === "parziale") {
    if (!d.purchase_order_id) return { daFare: "conferma", motivo: "Senza ordine d’acquisto: conferma a cosa appartiene" };
    if (avvisiAI > 0) return { daFare: "conferma", motivo: "Letta dall’AI con dei dubbi: controlla l’abbinamento all’ordine" };
    return { daFare: "controllo", motivo: "Arrivata, merce da controllare" };
  }
  return { daFare: null, motivo: null };
}

const STATI_DDT: Record<string, string> = {
  atteso: "Attesa", attesa: "Attesa", parziale: "Arrivata in parte", ricevuto: "Arrivata, da controllare",
  verificato: "Controllata", non_conforme: "Non conforme",
  da_verificare: "Da verificare in ufficio", registrato: "Registrata", rifiutato: "Rifiutata",
  bozza: "Bozza", emesso: "Emesso", emessa: "Emesso", inviato: "Inviato",
};

export function useBolleCommessa(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commessa-bolle-ddt", companyId, orderId],
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<RigaBolla[]> => {
      const oda = await odaDellaCommessa(companyId!, orderId);
      const perOda = new Map(oda.map((o) => [o.id, o]));
      const [ddtLotti, ddtDiretti, campo, emessi] = await Promise.all([
        Promise.all(aLotti(oda.map((o) => o.id)).map((ids) => allPaymentRows((da, a) => db.from("ddt_ricezione")
          .select("id, purchase_order_id, numero_ddt, data_ricezione, stato, has_damages, non_conformita, ai_avvisi")
          .eq("company_id", companyId).in("purchase_order_id", ids).order("id").range(da, a)))),
        // Dal 29/10/2026 una bolla può stare sulla commessa senza ordine d'acquisto (caricata dall'ufficio).
        allPaymentRows((da, a) => db.from("ddt_ricezione")
          .select("id, purchase_order_id, numero_ddt, data_ricezione, stato, has_damages, non_conformita, ai_avvisi, suppliers(name)")
          .eq("company_id", companyId).eq("order_id", orderId).order("id").range(da, a)),
        // Solo le bolle: scontrini e fatture fotografati in cantiere non sono documenti di trasporto.
        allPaymentRows((da, a) => db.from("campo_acquisti").select("id, fornitore, numero_documento, data_documento, created_at, stato, purchase_order_id")
          .eq("company_id", companyId).eq("order_id", orderId).eq("tipo_documento", "bolla").neq("stato", "annullato").order("id").range(da, a)),
        allPaymentRows((da, a) => db.from("documenti_fiscali").select("id, numero, data_emissione, stato, cliente_snapshot")
          .eq("company_id", companyId).eq("ordine_id", orderId).eq("tipo", "ddt").is("deleted_at", null).order("id").range(da, a)),
      ]);
      const viste = new Set<string>();
      const ddt = ([...ddtLotti.flat(), ...ddtDiretti] as Array<{ id: string; purchase_order_id: string | null; numero_ddt: string | null; suppliers?: { name: string } | null }>)
        .filter((d) => (viste.has(d.id) ? false : (viste.add(d.id), true)));
      // La foto di una bolla poi registrata come ricezione sull'ordine d'acquisto è lo stesso documento: si mostra una volta.
      const giaRegistrate = new Set(ddt.map((d) => `${d.purchase_order_id}|${(d.numero_ddt ?? "").trim().toLowerCase()}`));
      type BollaCantiere = { id: string; fornitore: string | null; numero_documento: string | null; data_documento: string | null; created_at: string; stato: string; purchase_order_id: string | null };
      const campoUniche = (campo as BollaCantiere[])
        .filter((c) => !(c.purchase_order_id && giaRegistrate.has(`${c.purchase_order_id}|${(c.numero_documento ?? "").trim().toLowerCase()}`)));
      const righe: RigaBolla[] = [
        ...ddt.map((d: { id: string; purchase_order_id: string | null; numero_ddt: string | null; data_ricezione: string | null; stato: string | null; has_damages: boolean | null; non_conformita: unknown; suppliers?: { name: string } | null }) => ({
          id: d.id, origine: "fornitore" as const, numero: d.numero_ddt, data: d.data_ricezione,
          controparte: (d.purchase_order_id
            ? [perOda.get(d.purchase_order_id)?.fornitore, perOda.get(d.purchase_order_id)?.oda_number].filter(Boolean).join(" · ")
            : d.suppliers?.name) || null,
          stato: STATI_DDT[d.stato ?? ""] ?? (d.stato ?? "—"),
          attenzione: d.stato === "non_conforme" || !!d.has_damages || d.stato === "ricevuto",
          link: `/azienda/ddt/${d.id}`,
          purchaseOrderId: d.purchase_order_id,
          ...cosaManca("fornitore", d),
        })),
        ...campoUniche.map((c) => ({
          id: c.id, origine: "cantiere" as const, numero: c.numero_documento, data: c.data_documento ?? c.created_at,
          controparte: c.fornitore, stato: STATI_DDT[c.stato] ?? c.stato, attenzione: c.stato === "da_verificare",
          purchaseOrderId: c.purchase_order_id,
          ...cosaManca("cantiere", c),
        })),
        ...emessi.map((e: { id: string; numero: string | null; data_emissione: string | null; stato: string | null; cliente_snapshot: { ragione_sociale?: string; nome?: string; cognome?: string } | null }) => ({
          id: e.id, origine: "cliente" as const, numero: e.numero, data: e.data_emissione,
          controparte: e.cliente_snapshot?.ragione_sociale || [e.cliente_snapshot?.nome, e.cliente_snapshot?.cognome].filter(Boolean).join(" ") || null,
          stato: STATI_DDT[e.stato ?? ""] ?? (e.stato ?? "—"), attenzione: false, link: `/azienda/documenti/${e.id}`,
        })),
      ];
      return righe.sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
    },
  });
}

export const ORIGINE: Record<RigaBolla["origine"], { testo: string; classe: string }> = {
  fornitore: { testo: "Dal fornitore", classe: "bg-blue-50 text-blue-800" },
  cantiere: { testo: "Foto dal cantiere", classe: "bg-orange-50 text-orange-800" },
  cliente: { testo: "DDT al cliente", classe: "bg-slate-100 text-slate-700" },
};

export function OrderBolleDdtCard({ orderId, puoAprireDocumenti = true }: { orderId: string; puoAprireDocumenti?: boolean }) {
  const { data = [], isLoading, isError, refetch } = useBolleCommessa(orderId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const filtri: Record<string, (r: RigaBolla) => boolean> = {
    fornitore: (r) => r.origine === "fornitore",
    cantiere: (r) => r.origine === "cantiere",
    cliente: (r) => r.origine === "cliente",
    conferma: (r) => r.daFare === "conferma",
    controllo: (r) => r.daFare === "controllo",
  };
  const conta = (chiave: string) => data.filter(filtri[chiave]).length;
  const visibili = filtro && filtri[filtro] && conta(filtro) > 0 ? data.filter(filtri[filtro]) : data;
  const qc = useQueryClient();
  const permessi = usePermissions();
  // Stessa regola della pagina Bolle: magazzino, acquisti, commesse o amministratore, mai in sola lettura.
  const puoCaricare = !permessi.solaLettura
    && (permessi.canEditWarehouse || permessi.canManagePurchasing || permessi.canEditOrders || permessi.isAdmin);
  const [carica, setCarica] = useState(false);
  return (
    <>
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Truck className="h-5 w-5 text-primary" aria-hidden="true" />Bolle e DDT
            {data.length > 0 && <Badge variant="outline">{data.length}</Badge>}
          </CardTitle>
          {puoCaricare && (
            <Button size="sm" onClick={() => setCarica(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Carica bolla
            </Button>
          )}
        </div>
        {data.length > 0 ? (
          <ContatoriFiltro className="mt-1" etichetta="Bolle per tipo e stato" attivo={filtro} onScegli={setFiltro} voci={[
            { chiave: "conferma", etichetta: "Da confermare", valore: conta("conferma"), avviso: true },
            { chiave: "controllo", etichetta: "Da controllare", valore: conta("controllo"), avviso: true },
            { chiave: "fornitore", etichetta: "Dal fornitore", valore: conta("fornitore") },
            { chiave: "cantiere", etichetta: "Dal cantiere", valore: conta("cantiere") },
            { chiave: "cliente", etichetta: "DDT al cliente", valore: conta("cliente") },
          ]} />
        ) : <p className="text-sm text-muted-foreground">Le bolle dei fornitori arrivate sugli ordini d’acquisto, quelle fotografate in cantiere e i DDT fatti al cliente.</p>}
      </CardHeader>
      <CardContent>
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere le bolle. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna bolla su questa commessa. Caricala da «Carica bolla» (foto o PDF, l’AI legge le righe), oppure arriva quando si registra un DDT su un ordine d’acquisto o l’operaio la fotografa dal cantiere.</p>
        ) : (
          <ul className="divide-y" aria-label="Bolle e DDT della commessa">
            {visibili.map((r) => {
              const corpo = (
                <div className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.numero ? `N° ${r.numero}` : "Senza numero"} · {dataIt(r.data)}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.controparte ?? "—"}</p>
                    {r.motivo && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{r.motivo}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORIGINE[r.origine].classe}`}>{ORIGINE[r.origine].testo}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.attenzione ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}>
                      {r.attenzione && <AlertTriangle className="mr-1 inline h-3 w-3" aria-hidden="true" />}{r.stato}
                    </span>
                  </div>
                </div>
              );
              const link = r.origine === "cliente" && !puoAprireDocumenti ? undefined : r.link;
              return <li key={`${r.origine}-${r.id}`}>{link ? <Link to={link} className="block hover:bg-muted/40">{corpo}</Link> : corpo}</li>;
            })}
          </ul>
        )}
        {data.some((r) => r.origine === "cantiere" && r.attenzione) && (
          <p className="mt-2 text-xs text-muted-foreground">Le bolle dal cantiere si verificano in Cantiere → Diario, nel riquadro «Da approvare dal cantiere».</p>
        )}
      </CardContent>
    </Card>
      {carica && (
        <NewDDTDialog
          open={carica}
          onOpenChange={setCarica}
          prefillOrderId={orderId}
          restaQui
          onCreated={() => { void qc.invalidateQueries({ queryKey: ["commessa-bolle-ddt"] }); }}
        />
      )}
    </>
  );
}

// ── Fatture dei fornitori ───────────────────────────────────────────────────

export interface RigaFattura {
  id: string;
  numero: string | null;
  data: string | null;
  fornitore: string | null;
  totale: number | null;
  stato: string | null;
  legame: "oda" | "costo" | "suggerita";
  oda: string | null;
  /** Ordine d'acquisto a cui la fattura è collegata, quando c'è. */
  purchaseOrderId: string | null;
  costId: string | null;
  notaCredito: boolean;
  /** Fattura ripartita su più commesse: la percentuale di questa (il totale è già la quota). */
  quota: number | null;
  /** Totale intero del documento, quando conta solo una quota. */
  totaleDocumento: number | null;
  pagataIl: string | null;
  /** Quanto l'AI è sicura che sia di questa commessa, da 0 a 1 (solo le suggerite). */
  confidenza: number | null;
  /** Cosa guardare prima di fidarsi: anomalie dell'AI, importo oltre l'ordine, fattura mai aperta. */
  daControllare: string | null;
}

/** Fatturato oltre l'ordine: meno è normale (acconti, consegne a parti), di più va guardato. Un euro di tolleranza per gli arrotondamenti. */
export function fatturatoOltreOrdine(fatturato: number, totaleOrdine: number | null): boolean {
  return totaleOrdine != null && totaleOrdine > 0 && fatturato > totaleOrdine + 1;
}

/**
 * La quota di questa commessa sui costi che ne citano la ripartizione, come in
 * Economia → esposizione di cassa. Vale anche per il costo intestato a questa
 * commessa: se la ripartizione la cita al 40%, conta il 40%. Un costo senza
 * percentuale valida, o al 100%, resta intero (nessuna voce nella mappa).
 */
export function quoteDeiCostiRipartiti(
  costi: { id: string; order_id: string | null; allocations: unknown }[],
  orderId: string,
): Map<string, number> {
  const quote = new Map<string, number>();
  for (const c of costi) {
    const voce = (Array.isArray(c.allocations) ? c.allocations : []).find((x: unknown): x is { order_id: string; pct: unknown } =>
      !!x && typeof x === "object" && (x as { order_id?: unknown }).order_id === orderId);
    if (!voce) continue;
    const pct = Number(voce.pct);
    if (Number.isFinite(pct) && pct >= 0 && pct < 100) quote.set(c.id, pct);
  }
  return quote;
}

export function useFattureFornitoriCommessa(orderId: string) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commessa-fatture-fornitori", companyId, orderId],
    enabled: !!companyId && !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<RigaFattura[]> => {
      // Stesse regole di Economia → Pagamenti (useSupplierPayments): costi diretti e ripartiti, liste a lotti.
      const [oda, costiDiretti, costiRipartiti] = await Promise.all([
        odaDellaCommessa(companyId!, orderId),
        allPaymentRows((da, a) => db.from("company_costs").select("id").eq("company_id", companyId).eq("order_id", orderId).order("id").range(da, a)),
        allPaymentRows((da, a) => db.from("company_costs").select("id, order_id, allocations").eq("company_id", companyId)
          .contains("allocations", JSON.stringify([{ order_id: orderId }])).order("id").range(da, a)),
      ]);
      const odaIds = oda.map((o) => o.id);
      const costoIds = senzaDoppi([...(costiDiretti as { id: string }[]), ...(costiRipartiti as { id: string }[])]).map((c) => c.id);
      const perOda = new Map(oda.map((o) => [o.id, o.oda_number]));
      const totaleOda = new Map(oda.map((o) => [o.id, o.totale]));
      // Quota di questa commessa sui costi ripartiti (come in Economia → esposizione di cassa).
      const quotaCosto = quoteDeiCostiRipartiti(costiRipartiti as { id: string; order_id: string | null; allocations: unknown }[], orderId);
      const campi = "id, numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento, tipo_documento, stato, purchase_order_id, company_cost_id, pagata_il, order_match_confidenza, anomalie_rilevate";
      const [daOda, daCosto, suggerite] = await Promise.all([
        Promise.all(aLotti(odaIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("purchase_order_id", ids).order("id").range(da, a)))),
        Promise.all(aLotti(costoIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("company_cost_id", ids).order("id").range(da, a)))),
        allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).eq("order_id_suggerito", orderId).order("id").range(da, a)),
      ]);
      type Grezza = { id: string; numero_fattura: string | null; data_fattura: string | null; cedente_ragione_sociale: string | null; totale_documento: number | null; tipo_documento: string | null; stato: string | null; purchase_order_id: string | null; company_cost_id: string | null; pagata_il: string | null; order_match_confidenza: number | null; anomalie_rilevate: unknown };
      const viste = new Map<string, RigaFattura>();
      const aggiungi = (f: Grezza, legame: RigaFattura["legame"]) => {
        // Una fattura rifiutata non è un costo della commessa.
        if (viste.has(f.id) || f.stato === "rifiutata") return;
        // Nota di credito: riduce quanto si deve al fornitore.
        const segno = eNotaDiCredito(f.tipo_documento) ? -1 : 1;
        const intero = f.totale_documento == null ? null : segno * Math.abs(Number(f.totale_documento));
        const quota = legame === "costo" && f.company_cost_id ? quotaCosto.get(f.company_cost_id) ?? null : null;
        viste.set(f.id, {
          id: f.id, numero: f.numero_fattura, data: f.data_fattura, fornitore: f.cedente_ragione_sociale,
          totale: intero == null || quota == null ? intero : Math.round(intero * quota) / 100,
          totaleDocumento: quota == null ? null : intero,
          stato: f.stato, legame, oda: f.purchase_order_id ? perOda.get(f.purchase_order_id) ?? null : null,
          purchaseOrderId: f.purchase_order_id, costId:f.company_cost_id,
          notaCredito: segno < 0, quota,
          pagataIl: f.pagata_il,
          confidenza: legame === "suggerita" && f.order_match_confidenza != null ? Number(f.order_match_confidenza) : null,
          daControllare: Array.isArray(f.anomalie_rilevate) && f.anomalie_rilevate.length > 0 ? "L’AI ha segnalato un’anomalia"
            : f.stato === "non_letta" && legame !== "suggerita" ? "Non ancora aperta da nessuno" : null,
        });
      };
      (daOda.flat() as Grezza[]).forEach((f) => aggiungi(f, "oda"));
      (daCosto.flat() as Grezza[]).forEach((f) => aggiungi(f, "costo"));
      // Suggerita = l'AI pensa che sia di questa commessa, ma nessun ordine o costo la lega ancora.
      (suggerite as Grezza[]).filter((f) => !f.purchase_order_id && !f.company_cost_id).forEach((f) => aggiungi(f, "suggerita"));
      const fatturatoPerOda = new Map<string, number>();
      for (const f of viste.values()) {
        if (f.legame === "oda" && f.purchaseOrderId) fatturatoPerOda.set(f.purchaseOrderId, (fatturatoPerOda.get(f.purchaseOrderId) ?? 0) + (f.totale ?? 0));
      }
      for (const f of viste.values()) {
        if (f.legame !== "oda" || !f.purchaseOrderId) continue;
        const fatturato = fatturatoPerOda.get(f.purchaseOrderId) ?? 0, ordine = totaleOda.get(f.purchaseOrderId) ?? null;
        if (fatturatoOltreOrdine(fatturato, ordine)) f.daControllare = `Fatturato ${formatCurrency(fatturato)} su un ordine di ${formatCurrency(ordine!)}`;
      }
      return [...viste.values()].sort((a, b) => String(b.data ?? "").localeCompare(String(a.data ?? "")));
    },
  });
}

const LEGAME: Record<RigaFattura["legame"], string> = {
  oda: "Sull’ordine d’acquisto",
  costo: "Costo della commessa",
  suggerita: "Suggerita, da collegare",
};

export function OrderFattureFornitoriCard({ orderId, mostraImporti, puoAprireFatture = true, puoModificare = false }: { orderId: string; mostraImporti: boolean; puoAprireFatture?: boolean; puoModificare?: boolean }) {
  const [paymentCostId,setPaymentCostId] = useState<string|null>(null);
  const [collegando, setCollegando] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // Suggerita dall'AI → costo di questa commessa (contabilizzata se serve).
  const collega = async (f: RigaFattura) => {
    setCollegando(f.id);
    try {
      await collegaFatturaACommessa(f.id, orderId);
      toast.success(`Fattura ${f.numero ?? ""} messa fra i costi della commessa`);
      refreshFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["margin"] });
    } catch (e) {
      toast.error("Fattura non collegata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCollegando(null);
    }
  };
  const { data = [], isLoading, isError, refetch } = useFattureFornitoriCommessa(orderId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const { data: costi } = useCostiCommessa(orderId);
  const costiSenzaFattura = (costi?.costi ?? []).filter((c) => c.senza_fattura).length;
  const collegate = data.filter((f) => f.legame !== "suggerita");
  const suggerite = data.filter((f) => f.legame === "suggerita");
  const totale = collegate.reduce((s, f) => s + (f.totale ?? 0), 0);
  const filtri: Record<string, (f: RigaFattura) => boolean> = {
    controllare: (f) => !!f.daControllare,
    pagare: (f) => !f.pagataIl && !f.notaCredito,
    pagate: (f) => !!f.pagataIl,
  };
  const conta = (chiave: string) => collegate.filter(filtri[chiave]).length;
  const soloSuggerite = filtro === "collegare" && suggerite.length > 0;
  const collegateVisibili = filtro && filtri[filtro] && conta(filtro) > 0 ? collegate.filter(filtri[filtro]) : collegate;
  // Un suggerimento sbagliato dell'AI: la fattura resta nelle ricevute, solo non è più proposta qui.
  const nonDiQuesta = async (f: RigaFattura) => {
    setCollegando(f.id);
    try {
      const { error } = await db.from("fatture_ricevute").update({ order_id_suggerito: null, order_match_confidenza: null }).eq("id", f.id).eq("order_id_suggerito", orderId);
      if (error) throw error;
      toast.success(`Fattura ${f.numero ?? ""} tolta dai suggerimenti`);
      void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
    } catch (e) {
      toast.error("Suggerimento non tolto", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCollegando(null);
    }
  };
  const riga = (f: RigaFattura) => (
    <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">{f.fornitore ?? "Fornitore"} · {f.notaCredito ? "nota di credito" : "n."} {f.numero ?? "—"}</p>
        <p className="text-sm text-muted-foreground">{dataIt(f.data)}{f.oda ? ` · ${f.oda}` : ""} · {LEGAME[f.legame]}</p>
        {f.daControllare && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{f.daControllare}</p>}
        {f.confidenza != null && <p className="text-xs text-muted-foreground">L’AI è sicura al {Math.round(f.confidenza * 100)}%</p>}
        {f.legame !== "suggerita" && !f.notaCredito && <p className="text-xs text-muted-foreground">{f.pagataIl ? `Pagata il ${dataIt(f.pagataIl)}` : "Da pagare"}</p>}
        {mostraImporti && f.quota != null && f.totaleDocumento != null && (
          <p className="text-xs text-muted-foreground">Ripartita: {f.quota.toLocaleString("it-IT")}% di {formatCurrency(f.totaleDocumento)}</p>
        )}
      </div>
      {mostraImporti && <div className="flex items-center gap-3"><p className="shrink-0 text-sm font-semibold tabular-nums">{f.totale == null ? "—" : formatCurrency(f.totale)}</p>{f.costId && <Button variant="outline" size="sm" onClick={()=>setPaymentCostId(f.costId)}>Pagamenti e residuo</Button>}</div>}
      {puoModificare && f.legame === "suggerita" && (
        <Button size="sm" variant="outline" className="w-full sm:w-auto" disabled={collegando !== null} onClick={() => void collega(f)}>
          {collegando === f.id ? "Collego…" : "Collega a questa commessa"}
        </Button>
      )}
      {puoModificare && f.legame === "suggerita" && (
        <Button size="sm" variant="ghost" className="w-full sm:w-auto" disabled={collegando !== null} onClick={() => void nonDiQuesta(f)}>
          Non è di questa commessa
        </Button>
      )}
    </li>
  );
  return (
    <>
    {paymentCostId && <ExpensePaymentDialog key={paymentCostId} costId={paymentCostId} onClose={()=>setPaymentCostId(null)}/>}
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Receipt className="h-5 w-5 text-primary" aria-hidden="true" />Fatture dei fornitori
          {collegate.length > 0 && <Badge variant="outline">{collegate.length}</Badge>}
          {mostraImporti && collegate.length > 0 && <span className="text-sm font-normal text-muted-foreground">· {formatCurrency(totale)} IVA inclusa</span>}
          {puoModificare && <span className="ml-auto"><CaricaFatturaCommessaButton orderId={orderId} /></span>}
        </CardTitle>
        {!isLoading && !isError && (data.length > 0 || costiSenzaFattura > 0) && (
          <ContatoriFiltro className="mt-1" etichetta="Fatture per stato" attivo={filtro} onScegli={(c) => {
            if (c === "costi") { document.getElementById("costi-commessa")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
            setFiltro(c);
          }} voci={[
            { chiave: "collegare", etichetta: "Da collegare", valore: suggerite.length, avviso: true },
            { chiave: "controllare", etichetta: "Da controllare", valore: conta("controllare"), avviso: true },
            { chiave: "pagare", etichetta: "Da pagare", valore: conta("pagare") },
            { chiave: "pagate", etichetta: "Pagate", valore: conta("pagate") },
            { chiave: "costi", etichetta: "Costi senza fattura", valore: costiSenzaFattura },
          ]} />
        )}
        <p className="text-sm text-muted-foreground">Le fatture arrivate per questa commessa, collegate all’ordine d’acquisto o al costo registrato.{puoModificare ? " Da qui puoi caricarne una (XML dallo SDI, PDF o foto): diventa un costo della commessa." : ""}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere le fatture. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {soloSuggerite ? null : collegate.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna fattura collegata. Caricala da qui, oppure collegala dalla fattura ricevuta scegliendo l’ordine d’acquisto o la commessa.</p>
            ) : <ul className="divide-y" aria-label="Fatture collegate">{collegateVisibili.map(riga)}</ul>}
            {suggerite.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-sm font-semibold text-amber-900">Probabilmente di questa commessa: {suggerite.length}</p>
                <p className="text-xs text-amber-900/80">L’AI le ha riconosciute ma non sono ancora collegate: finché non lo sono, non entrano nei costi.</p>
                <ul className="divide-y" aria-label="Fatture suggerite">{suggerite.map(riga)}</ul>
              </div>
            )}
            {puoAprireFatture && <Link to="/azienda/documenti/fatture-ricevute" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4">
              <FileText className="h-4 w-4" aria-hidden="true" />Apri le fatture ricevute
            </Link>}
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}

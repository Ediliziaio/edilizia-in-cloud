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
import { ChevronDown, FileText, Plus, Receipt, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDDTRicezioneMutations, type DDTStato } from "@/hooks/useDDTRicezione";
import { useSegnaRicevutaPagata } from "@/components/fatturazione/PagamentoRicevuta";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "./TabellaCommessa";
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
  /** Lo stato di verifica: gli stessi stati del documento, detti in due parole. Il DDT al cliente non si verifica. */
  verifica?: "da_verificare" | "verificata" | "non_conforme" | "attesa" | "rifiutata" | null;
  /** Le righe del documento, quando ci sono. */
  materiali?: MaterialeBolla[];
}

export interface MaterialeBolla { nome: string; quantita: number | null; unita: string | null }

export function statoVerificaBolla(origine: "fornitore" | "cantiere", d: { stato: string | null; has_damages?: boolean | null }): RigaBolla["verifica"] {
  if (d.stato === "non_conforme" || d.stato === "rifiutato" && origine === "fornitore" || d.has_damages) return "non_conforme";
  if (d.stato === "rifiutato") return "rifiutata";
  if (d.stato === "verificato" || d.stato === "registrato") return "verificata";
  if (d.stato === "atteso" || d.stato === "attesa") return "attesa";
  return "da_verificare";
}

/** Righe scritte nel documento (bolla dal cantiere o DDT al cliente): i nomi cambiano secondo chi le ha scritte. */
export function materialiDaRighe(righe: unknown): MaterialeBolla[] {
  if (!Array.isArray(righe)) return [];
  return righe.flatMap((r) => {
    const x = (r ?? {}) as Record<string, unknown>;
    const nome = [x.descrizione, x.nome, x.description, x.name].find((v) => typeof v === "string" && v.trim());
    if (!nome) return [];
    const q = Number(x.quantita ?? x.quantity);
    const unita = [x.unita_misura, x.unita, x.um].find((v) => typeof v === "string" && v.trim());
    return [{ nome: String(nome).trim(), quantita: Number.isFinite(q) && q > 0 ? q : null, unita: unita ? String(unita) : null }];
  });
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

export function useBolleCommessa(orderId: string, abilitato = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commessa-bolle-ddt", companyId, orderId],
    enabled: !!companyId && !!orderId && abilitato,
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
        allPaymentRows((da, a) => db.from("campo_acquisti").select("id, fornitore, numero_documento, data_documento, created_at, stato, purchase_order_id, righe")
          .eq("company_id", companyId).eq("order_id", orderId).eq("tipo_documento", "bolla").neq("stato", "annullato").order("id").range(da, a)),
        allPaymentRows((da, a) => db.from("documenti_fiscali").select("id, numero, data_emissione, stato, cliente_snapshot, righe")
          .eq("company_id", companyId).eq("ordine_id", orderId).eq("tipo", "ddt").is("deleted_at", null).order("id").range(da, a)),
      ]);
      // Le righe della bolla: scritte (ddt_righe) oppure registrate all'arrivo sugli articoli (goods_receipts).
      const idBolle = [...new Set([...ddtLotti.flat(), ...ddtDiretti].map((d) => (d as { id: string }).id))];
      // Sono un dettaglio: se non si leggono, l'elenco delle bolle resta.
      const [righeBolla, arrivi] = await Promise.all([
        Promise.all(aLotti(idBolle).map((ids) => allPaymentRows((da, a) => db.from("ddt_righe").select("id, ddt_ricezione_id, descrizione, quantita, unita_misura")
          .eq("company_id", companyId).in("ddt_ricezione_id", ids).order("id").range(da, a)))).catch(() => [] as unknown[][]),
        Promise.all(aLotti(idBolle).map((ids) => allPaymentRows((da, a) => db.from("goods_receipts").select("id, ddt_ricezione_id, quantity_received, order_items!goods_receipts_order_item_id_fkey(name, unita_misura)")
          .eq("company_id", companyId).in("ddt_ricezione_id", ids).order("id").range(da, a)))).catch(() => [] as unknown[][]),
      ]);
      const materialiBolla = new Map<string, MaterialeBolla[]>();
      const aggiungiMateriale = (id: string, m: MaterialeBolla) => materialiBolla.set(id, [...(materialiBolla.get(id) ?? []), m]);
      for (const r of righeBolla.flat() as Array<{ ddt_ricezione_id: string; descrizione: string | null; quantita: number | null; unita_misura: string | null }>) {
        if (r.descrizione) aggiungiMateriale(r.ddt_ricezione_id, { nome: r.descrizione, quantita: r.quantita == null ? null : Number(r.quantita), unita: r.unita_misura });
      }
      for (const r of arrivi.flat() as Array<{ ddt_ricezione_id: string; quantity_received: number | null; order_items: { name: string | null; unita_misura: string | null } | null }>) {
        if (r.order_items?.name && !righeBolla.flat().some((x) => (x as { ddt_ricezione_id: string }).ddt_ricezione_id === r.ddt_ricezione_id)) {
          aggiungiMateriale(r.ddt_ricezione_id, { nome: r.order_items.name, quantita: r.quantity_received == null ? null : Number(r.quantity_received), unita: r.order_items.unita_misura });
        }
      }
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
          verifica: statoVerificaBolla("fornitore", d),
          materiali: materialiBolla.get(d.id) ?? [],
        })),
        ...campoUniche.map((c) => ({
          id: c.id, origine: "cantiere" as const, numero: c.numero_documento, data: c.data_documento ?? c.created_at,
          controparte: c.fornitore, stato: STATI_DDT[c.stato] ?? c.stato, attenzione: c.stato === "da_verificare",
          purchaseOrderId: c.purchase_order_id,
          ...cosaManca("cantiere", c),
          verifica: statoVerificaBolla("cantiere", c),
          materiali: materialiDaRighe((c as { righe?: unknown }).righe),
        })),
        ...emessi.map((e: { id: string; numero: string | null; data_emissione: string | null; stato: string | null; cliente_snapshot: { ragione_sociale?: string; nome?: string; cognome?: string } | null }) => ({
          id: e.id, origine: "cliente" as const, numero: e.numero, data: e.data_emissione,
          controparte: e.cliente_snapshot?.ragione_sociale || [e.cliente_snapshot?.nome, e.cliente_snapshot?.cognome].filter(Boolean).join(" ") || null,
          stato: STATI_DDT[e.stato ?? ""] ?? (e.stato ?? "—"), attenzione: false, link: `/azienda/documenti/${e.id}`,
          verifica: null as RigaBolla["verifica"], materiali: materialiDaRighe((e as { righe?: unknown }).righe),
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

const VERIFICA: Record<NonNullable<RigaBolla["verifica"]>, { testo: string; tono: TonoStato }> = {
  da_verificare: { testo: "Da verificare", tono: "ambra" },
  verificata: { testo: "Verificata", tono: "verde" },
  non_conforme: { testo: "Non conforme", tono: "rosso" },
  attesa: { testo: "Attesa", tono: "grigio" },
  rifiutata: { testo: "Rifiutata", tono: "grigio" },
};

const quantitaMateriale = (m: MaterialeBolla) => (m.quantita == null ? "" : ` · ${m.quantita.toLocaleString("it-IT")}${m.unita ? ` ${m.unita}` : ""}`);

/** I materiali: il primo si legge subito, gli altri si aprono. */
function CellaMateriali({ materiali = [] }: { materiali?: MaterialeBolla[] }) {
  if (materiali.length === 0) return <span className="text-muted-foreground">—</span>;
  if (materiali.length === 1) return <span>{materiali[0].nome}{quantitaMateriale(materiali[0])}</span>;
  return (
    <details>
      <summary className="cursor-pointer">{materiali[0].nome} e altri {materiali.length - 1}</summary>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {materiali.map((m, i) => <li key={`${m.nome}-${i}`}>{m.nome}{quantitaMateriale(m)}</li>)}
      </ul>
    </details>
  );
}

/**
 * Lo stato si cambia da qui, con le stesse scritture della pagina della bolla. «Attesa» no: la merce arrivata si
 * registra sull'ordine. Le bolle dal cantiere si verificano dove si scrive anche l'importo.
 */
function StatoBolla({ riga, orderId, puoCambiare, onCambia }: {
  riga: RigaBolla; orderId: string; puoCambiare: boolean; onCambia: (updates: { stato: DDTStato; has_damages?: boolean }) => void;
}) {
  const v = VERIFICA[riga.verifica!];
  const freccia = <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" />;
  if (riga.origine === "cantiere" && riga.verifica === "da_verificare") {
    return <Link to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=diario`} title="Verificala nel Diario"><StatoPill tono={v.tono}>{v.testo}{freccia}</StatoPill></Link>;
  }
  if (riga.origine !== "fornitore" || riga.verifica === "attesa" || !puoCambiare) return <StatoPill tono={v.tono}>{v.testo}</StatoPill>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Cambia lo stato della bolla ${riga.numero ?? ""}`}><StatoPill tono={v.tono}>{v.testo}{freccia}</StatoPill></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={riga.verifica === "verificata"} onSelect={() => onCambia({ stato: "verificato", has_damages: false })}>Verificata: merce conforme</DropdownMenuItem>
        <DropdownMenuItem disabled={riga.verifica === "da_verificare"} onSelect={() => onCambia({ stato: "ricevuto", has_damages: false })}>Da verificare</DropdownMenuItem>
        <DropdownMenuItem disabled={riga.verifica === "non_conforme"} onSelect={() => onCambia({ stato: "non_conforme", has_damages: true })}>Non conforme</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrderBolleDdtCard({ orderId, puoAprireDocumenti = true }: { orderId: string; puoAprireDocumenti?: boolean }) {
  const { data = [], isLoading, isError, refetch } = useBolleCommessa(orderId);
  const [filtro, setFiltro] = useState<string | null>(null);
  const filtri: Record<string, (r: RigaBolla) => boolean> = {
    daVerificare: (r) => r.verifica === "da_verificare" || r.verifica === "non_conforme",
    verificate: (r) => r.verifica === "verificata",
    fornitore: (r) => r.origine === "fornitore",
    cantiere: (r) => r.origine === "cantiere",
    cliente: (r) => r.origine === "cliente",
  };
  const conta = (chiave: string) => data.filter(filtri[chiave]).length;
  const visibili = filtro && filtri[filtro] && conta(filtro) > 0 ? data.filter(filtri[filtro]) : data;
  const qc = useQueryClient();
  const permessi = usePermissions();
  // Stessa regola della pagina Bolle: magazzino, acquisti, commesse o amministratore, mai in sola lettura.
  const puoCaricare = !permessi.solaLettura
    && (permessi.canEditWarehouse || permessi.canManagePurchasing || permessi.canEditOrders || permessi.isAdmin);
  const [carica, setCarica] = useState(false);
  const { updateDDT } = useDDTRicezioneMutations(null);
  const linkDi = (r: RigaBolla) => (r.origine === "cliente" && !puoAprireDocumenti ? undefined : r.link);
  const colonne: ColonnaTabella<RigaBolla>[] = [
    { titolo: "Numero", principale: true, cella: (r) => {
      const testo = r.numero ? `N° ${r.numero}` : "Senza numero";
      const link = linkDi(r);
      return link ? <Link to={link} className="font-medium underline-offset-2 hover:underline">{testo}</Link> : <span className="font-medium">{testo}</span>;
    } },
    { titolo: "Data", cella: (r) => <span className="whitespace-nowrap">{dataIt(r.data)}</span> },
    { titolo: "Fornitore o cliente", cella: (r) => r.controparte ?? "—" },
    { titolo: "Provenienza", cella: (r) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ORIGINE[r.origine].classe}`}>{ORIGINE[r.origine].testo}</span> },
    { titolo: "Materiali", cella: (r) => <CellaMateriali materiali={r.materiali} /> },
    { titolo: "Stato", cella: (r) => r.verifica ? (
      <div className="space-y-0.5">
        <StatoBolla riga={r} orderId={orderId} puoCambiare={puoCaricare} onCambia={(updates) => updateDDT.mutate({ id: r.id, updates })} />
        {r.motivo && <p className="text-xs text-muted-foreground">{r.motivo}</p>}
      </div>
    ) : <StatoPill tono="grigio">{r.stato}</StatoPill> },
  ];
  return (
    <>
    <RiquadroCommessa
      icona={<Truck className="h-5 w-5 text-primary" aria-hidden="true" />}
      titolo="Bolle e DDT" conteggio={data.length}
      azioni={puoCaricare ? <Button size="sm" onClick={() => setCarica(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Carica bolla</Button> : undefined}
      numeri={data.length > 0 ? (
        <ContatoriFiltro etichetta="Bolle per stato e provenienza" attivo={filtro} onScegli={setFiltro} voci={[
          { chiave: "daVerificare", etichetta: "Da verificare", valore: conta("daVerificare"), avviso: true },
          { chiave: "verificate", etichetta: "Verificate", valore: conta("verificate") },
          { chiave: "fornitore", etichetta: "Dal fornitore", valore: conta("fornitore") },
          { chiave: "cantiere", etichetta: "Dal cantiere", valore: conta("cantiere") },
          { chiave: "cliente", etichetta: "DDT al cliente", valore: conta("cliente") },
        ]} />
      ) : undefined}
    >
        {isError ? (
          <p role="alert" className="text-sm text-destructive">Non riesco a leggere le bolle. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessuna bolla su questa commessa. Caricala da «Carica bolla» (foto o PDF, l’AI legge le righe), oppure arriva quando registri la merce sull’ordine d’acquisto.</p>
        ) : (
          <TabellaCommessa etichetta="Bolle e DDT della commessa" colonne={colonne} righe={visibili} chiave={(r) => `${r.origine}-${r.id}`} />
        )}
        {data.some((r) => r.origine === "cantiere" && r.verifica === "da_verificare") && (
          <p className="mt-2 text-xs text-muted-foreground">Le bolle dal cantiere si verificano in Cantiere → Diario, nel riquadro «Da approvare dal cantiere».</p>
        )}
    </RiquadroCommessa>
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
  /** Il pagamento vero sta sul costo collegato: sulla fattura c'è solo se qualcuno l'ha segnato lì. */
  pagamento: StatoPagamento;
  pagato: number | null;
  residuo: number | null;
  pagataIl: string | null;
  /** Una riga sola per capire cos'è. */
  descrizione: string | null;
  /** Contabilizzata = controllata e nei conti: lo stesso stato delle Fatture ricevute. */
  verificata: boolean;
  /** Quanto l'AI è sicura che sia di questa commessa, da 0 a 1 (solo le suggerite). */
  confidenza: number | null;
  /** Cosa guardare prima di fidarsi: anomalie dell'AI, importo oltre l'ordine, fattura mai aperta. */
  daControllare: string | null;
}

export type StatoPagamento = "pagata" | "parziale" | "da_pagare";
export interface PagamentoCalcolato { pagamento: StatoPagamento; pagato: number | null; residuo: number | null; pagataIl: string | null }

/** Dovuto, pagato e residuo sono quelli di «Pagamenti e residuo» (dettaglio_pagamento_costo), non un conto a parte. */
export function pagamentoFattura(
  pagataIlFattura: string | null,
  costo: { is_paid: boolean | null; paid_date: string | null } | undefined,
  dettaglio: { pagato: number; residuo: number } | undefined,
  totale: number | null,
  quota: number | null = null,
): PagamentoCalcolato {
  const parte = (n: number) => (quota == null ? n : Math.round(n * quota) / 100);
  if (pagataIlFattura) return { pagamento: "pagata", pagato: totale, residuo: 0, pagataIl: pagataIlFattura };
  if (costo?.is_paid || (dettaglio && dettaglio.residuo <= 0.005 && dettaglio.pagato > 0)) return { pagamento: "pagata", pagato: totale, residuo: 0, pagataIl: costo?.paid_date ?? null };
  if (dettaglio && dettaglio.pagato > 0) return { pagamento: "parziale", pagato: parte(dettaglio.pagato), residuo: parte(dettaglio.residuo), pagataIl: null };
  return { pagamento: "da_pagare", pagato: totale == null ? null : 0, residuo: dettaglio ? parte(dettaglio.residuo) : totale, pagataIl: null };
}

/** La riga che dice cos'è la fattura: il riassunto dell'AI, altrimenti la prima voce del documento. */
export function descrizioneFattura(riassunto: string | null, righe: unknown): string | null {
  if (riassunto?.trim()) return riassunto.trim();
  return materialiDaRighe(righe)[0]?.nome ?? null;
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

export function useFattureFornitoriCommessa(orderId: string, abilitato = true) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commessa-fatture-fornitori", companyId, orderId],
    enabled: !!companyId && !!orderId && abilitato,
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
      const campi = "id, numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento, tipo_documento, stato, purchase_order_id, company_cost_id, pagata_il, order_match_confidenza, anomalie_rilevate, ai_riassunto, righe";
      const [daOda, daCosto, suggerite] = await Promise.all([
        Promise.all(aLotti(odaIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("purchase_order_id", ids).order("id").range(da, a)))),
        Promise.all(aLotti(costoIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("company_cost_id", ids).order("id").range(da, a)))),
        allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).eq("order_id_suggerito", orderId).order("id").range(da, a)),
      ]);
      type Grezza = { id: string; numero_fattura: string | null; data_fattura: string | null; cedente_ragione_sociale: string | null; totale_documento: number | null; tipo_documento: string | null; stato: string | null; purchase_order_id: string | null; company_cost_id: string | null; pagata_il: string | null; order_match_confidenza: number | null; anomalie_rilevate: unknown; ai_riassunto: string | null; righe: unknown };
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
          pagamento: f.pagata_il ? "pagata" : "da_pagare",
          pagato: null,
          residuo: null,
          pagataIl: f.pagata_il,
          descrizione: descrizioneFattura(f.ai_riassunto, f.righe),
          verificata: f.stato === "contabilizzata",
          confidenza: legame === "suggerita" && f.order_match_confidenza != null ? Number(f.order_match_confidenza) : null,
          daControllare: Array.isArray(f.anomalie_rilevate) && f.anomalie_rilevate.length > 0 ? "L’AI ha segnalato un’anomalia"
            : f.stato === "non_letta" && legame !== "suggerita" ? "Non ancora aperta da nessuno" : null,
        });
      };
      (daOda.flat() as Grezza[]).forEach((f) => aggiungi(f, "oda"));
      (daCosto.flat() as Grezza[]).forEach((f) => aggiungi(f, "costo"));
      // Suggerita = l'AI pensa che sia di questa commessa, ma nessun ordine o costo la lega ancora.
      (suggerite as Grezza[]).filter((f) => !f.purchase_order_id && !f.company_cost_id).forEach((f) => aggiungi(f, "suggerita"));
      const costiCollegati = [...new Set([...viste.values()].flatMap((f) => (f.costId ? [f.costId] : [])))];
      const pagamenti = (await Promise.all(aLotti(costiCollegati).map((ids) => allPaymentRows((da, a) => db.from("company_costs")
        .select("id, is_paid, paid_date").eq("company_id", companyId).in("id", ids).order("id").range(da, a))))).flat() as Array<{ id: string; is_paid: boolean | null; paid_date: string | null }>;
      const pagamentoCosto = new Map(pagamenti.map((c) => [c.id, c]));
      // Lo stesso calcolo della finestra «Pagamenti e residuo»: se per una non riesce, resta quello che dice il costo.
      const dettagli = new Map(await Promise.all(costiCollegati.map(async (id) => {
        const { data: d, error } = await db.rpc("dettaglio_pagamento_costo", { p_costo: id });
        return [id, error || !d ? undefined : { pagato: Number(d.pagato) || 0, residuo: Number(d.residuo) || 0 }] as const;
      })));
      for (const f of viste.values()) {
        Object.assign(f, pagamentoFattura(f.pagataIl, f.costId ? pagamentoCosto.get(f.costId) : undefined, f.costId ? dettagli.get(f.costId) : undefined, f.totale, f.quota));
      }
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

const PAGAMENTO: Record<StatoPagamento, { testo: string; tono: TonoStato }> = {
  pagata: { testo: "Pagata", tono: "verde" },
  parziale: { testo: "Pagata in parte", tono: "blu" },
  da_pagare: { testo: "Da pagare", tono: "ambra" },
};

export function OrderFattureFornitoriCard({ orderId, mostraImporti, puoAprireFatture = true, puoModificare = false }: { orderId: string; mostraImporti: boolean; puoAprireFatture?: boolean; puoModificare?: boolean }) {
  const [paymentCostId, setPaymentCostId] = useState<string | null>(null);
  const [riepilogoId, setRiepilogoId] = useState<string | null>(null);
  const { effectiveCompany } = useAuth();
  const segnaPagata = useSegnaRicevutaPagata();
  const [occupata, setOccupata] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useFattureFornitoriCommessa(orderId);
  const { data: costi } = useCostiCommessa(orderId);
  const azione = async (f: RigaFattura, fai: () => Promise<unknown>, riuscita: string, fallita: string) => {
    setOccupata(f.id);
    try {
      await fai();
      toast.success(riuscita);
      refreshFinancialQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
      void queryClient.invalidateQueries({ queryKey: ["margin"] });
    } catch (e) {
      toast.error(fallita, { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setOccupata(null);
    }
  };
  // Suggerita dall'AI → costo di questa commessa (contabilizzata se serve).
  const collega = (f: RigaFattura) => azione(f, () => collegaFatturaACommessa(f.id, orderId), `Fattura ${f.numero ?? ""} messa fra i costi della commessa`, "Fattura non collegata");
  // Un suggerimento sbagliato dell'AI: la fattura resta nelle ricevute, solo non è più proposta qui.
  const nonDiQuesta = (f: RigaFattura) => azione(f, async () => {
    const { error } = await db.from("fatture_ricevute").update({ order_id_suggerito: null, order_match_confidenza: null }).eq("id", f.id).eq("order_id_suggerito", orderId);
    if (error) throw error;
  }, `Fattura ${f.numero ?? ""} tolta dai suggerimenti`, "Suggerimento non tolto");
  // Stessa azione di Fatture ricevute: crea il costo o corregge quello nato dall'ordine, senza contarlo due volte.
  const verifica = (f: RigaFattura) => {
    if (!window.confirm(`Confermi la fattura ${f.numero ?? ""}? Viene contabilizzata e il suo costo entra nei conti.`)) return;
    void azione(f, async () => {
      const { error } = await db.rpc("contabilizza_fattura_ricevuta", { p_fattura_id: f.id });
      if (error) throw error;
    }, `Fattura ${f.numero ?? ""} verificata`, "Fattura non verificata");
  };
  const collegate = data.filter((f) => f.legame !== "suggerita");
  const suggerite = data.filter((f) => f.legame === "suggerita");
  const totale = collegate.reduce((n, f) => n + (f.totale ?? 0), 0);
  const costiSenzaFattura = (costi?.costi ?? []).filter((c) => c.senza_fattura).length;
  const filtri: Record<string, (f: RigaFattura) => boolean> = {
    collegare: (f) => f.legame === "suggerita",
    daVerificare: (f) => f.legame !== "suggerita" && (!f.verificata || !!f.daControllare),
    verificate: (f) => f.legame !== "suggerita" && f.verificata && !f.daControllare,
    pagare: (f) => f.legame !== "suggerita" && f.pagamento !== "pagata" && !f.notaCredito,
    pagate: (f) => f.legame !== "suggerita" && f.pagamento === "pagata",
  };
  const conta = (chiave: string) => data.filter(filtri[chiave]).length;
  const visibili = filtro && filtri[filtro] && conta(filtro) > 0 ? data.filter(filtri[filtro]) : data;
  const importo = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(n));
  const colonne: ColonnaTabella<RigaFattura>[] = [
    { titolo: "Fattura", principale: true, cella: (f) => {
      const testo = `${f.notaCredito ? "Nota di credito" : "N."} ${f.numero ?? "—"}`;
      return puoAprireFatture
        ? <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setRiepilogoId(f.id)}>{testo}</button>
        : <span className="font-medium">{testo}</span>;
    } },
    { titolo: "Data", cella: (f) => <span className="whitespace-nowrap">{dataIt(f.data)}</span> },
    { titolo: "Fornitore", cella: (f) => (
      <div className="min-w-0 max-sm:text-right">
        <p>{f.fornitore ?? "Fornitore"}</p>
        {f.descrizione && <p className="line-clamp-1 text-xs text-muted-foreground" title={f.descrizione}>{f.descrizione}</p>}
      </div>
    ) },
    { titolo: "Collegata a", cella: (f) => (
      <div className="text-xs text-muted-foreground">
        {f.oda ?? LEGAME[f.legame]}
        {f.quota != null && f.totaleDocumento != null && mostraImporti && <p>Ripartita: {f.quota.toLocaleString("it-IT")}% di {formatCurrency(f.totaleDocumento)}</p>}
        {f.confidenza != null && <p>L’AI è sicura al {Math.round(f.confidenza * 100)}%</p>}
      </div>
    ) },
    { titolo: "Verifica", cella: (f) => f.legame === "suggerita" ? <StatoPill tono="ambra">Da collegare</StatoPill> : (
      <div className="space-y-0.5">
        {puoModificare && !f.verificata ? (
          <button type="button" title="Segna verificata" aria-label={`Verifica la fattura ${f.numero ?? ""}`} disabled={occupata !== null} onClick={() => verifica(f)}>
            <StatoPill tono="ambra">Da verificare<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
          </button>
        ) : <StatoPill tono={f.verificata && !f.daControllare ? "verde" : "ambra"}>{f.verificata && !f.daControllare ? "Verificata" : "Da verificare"}</StatoPill>}
        {f.daControllare && <p className="text-xs text-muted-foreground">{f.daControllare}</p>}
      </div>
    ) },
    { titolo: "Pagamento", cella: (f) => f.legame === "suggerita" || f.notaCredito ? <span className="text-muted-foreground">—</span> : (
      <div className="space-y-0.5">
        {puoModificare || f.costId ? (
          <button type="button" title={f.costId ? "Pagamenti e residuo" : f.pagamento === "pagata" ? "Rimetti da pagare" : "Segna pagata"} aria-label={`Pagamento della fattura ${f.numero ?? ""}`} disabled={segnaPagata.isPending}
            onClick={() => {
              if (f.costId) { setPaymentCostId(f.costId); return; }
              segnaPagata.mutate({ id: f.id, pagata: f.pagamento !== "pagata", numero: f.numero ?? undefined }, {
                onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }),
              });
            }}>
            <StatoPill tono={PAGAMENTO[f.pagamento].tono}>{PAGAMENTO[f.pagamento].testo}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
          </button>
        ) : <StatoPill tono={PAGAMENTO[f.pagamento].tono}>{PAGAMENTO[f.pagamento].testo}</StatoPill>}
        {f.pagataIl && <p className="whitespace-nowrap text-xs text-muted-foreground">il {dataIt(f.pagataIl)}</p>}
      </div>
    ) },
    ...(mostraImporti ? [
      { titolo: "Totale", destra: true, cella: (f: RigaFattura) => <span className="font-medium">{importo(f.totale)}</span> },
      { titolo: "Pagato", destra: true, cella: (f: RigaFattura) => (f.legame === "suggerita" ? "—" : importo(f.pagato)) },
      { titolo: "Da pagare", destra: true, cella: (f: RigaFattura) => (f.legame === "suggerita" ? "—" : <span className={f.residuo ? "font-medium text-amber-700 dark:text-amber-400" : undefined}>{importo(f.residuo)}</span>) },
    ] : []),
    { titolo: "Azioni", destra: true, cella: (f) => (
      <div className="flex flex-wrap justify-end gap-1">
        {puoModificare && f.legame === "suggerita" && <>
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={occupata !== null} onClick={() => void collega(f)}>{occupata === f.id ? "Collego…" : "Collega a questa commessa"}</Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={occupata !== null} onClick={() => void nonDiQuesta(f)}>Non è di questa commessa</Button>
        </>}
      </div>
    ) },
  ];
  return (
    <>
    {paymentCostId && <ExpensePaymentDialog key={paymentCostId} costId={paymentCostId} onClose={() => { setPaymentCostId(null); void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }); }} />}
    {riepilogoId && (
      <RiepilogoFatturaRicevuta fatturaId={riepilogoId} companyId={effectiveCompany?.id} onClose={() => { setRiepilogoId(null); void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }); }}
        azioni={(() => {
          const f = data.find((x) => x.id === riepilogoId);
          return puoModificare && f && f.legame !== "suggerita" && !f.verificata ? { onContabilizza: () => verifica(f) } : {};
        })()} />
    )}
    <RiquadroCommessa
      icona={<Receipt className="h-5 w-5 text-primary" aria-hidden="true" />}
      titolo="Fatture dei fornitori" conteggio={collegate.length}
      riassunto={mostraImporti && collegate.length > 0 ? `${formatCurrency(totale)} IVA inclusa` : undefined}
      azioni={puoModificare ? <CaricaFatturaCommessaButton orderId={orderId} /> : undefined}
      numeri={!isLoading && !isError && (data.length > 0 || costiSenzaFattura > 0) ? (
        <ContatoriFiltro etichetta="Fatture per stato" attivo={filtro} onScegli={(c) => {
          if (c === "costi") { document.getElementById("costi-commessa")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
          setFiltro(c);
        }} voci={[
          { chiave: "daVerificare", etichetta: "Da verificare", valore: conta("daVerificare"), avviso: true },
          { chiave: "verificate", etichetta: "Verificate", valore: conta("verificate") },
          { chiave: "collegare", etichetta: "Da collegare", valore: conta("collegare"), avviso: true },
          { chiave: "pagare", etichetta: "Da pagare", valore: conta("pagare") },
          { chiave: "pagate", etichetta: "Pagate", valore: conta("pagate") },
          { chiave: "costi", etichetta: "Costi senza fattura", valore: costiSenzaFattura },
        ]} />
      ) : undefined}
    >
      {isError ? (
        <p role="alert" className="text-sm text-destructive">Non riesco a leggere le fatture. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-3">
          {data.length === 0
            ? <p className="text-sm text-muted-foreground">Nessuna fattura collegata. Caricala da qui, oppure collegala dalla fattura ricevuta scegliendo l’ordine d’acquisto o la commessa.</p>
            : <TabellaCommessa etichetta="Fatture dei fornitori" colonne={colonne} righe={visibili} chiave={(f) => f.id} />}
          {suggerite.length > 0 && <p className="text-xs text-muted-foreground">Le fatture «Da collegare» le ha riconosciute l’AI: finché non le colleghi non entrano nei costi.</p>}
          {puoAprireFatture && <Link to="/azienda/documenti/fatture-ricevute" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4">
            <FileText className="h-4 w-4" aria-hidden="true" />Apri le fatture ricevute
          </Link>}
        </div>
      )}
    </RiquadroCommessa>
    </>
  );
}

import { percorsoDocumentoGenerale, useAspettoOperativo } from "./generali/design/ContestoOperativo";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { ExpensePaymentDialog } from "./ExpensePaymentDialog";
import { collegaFatturaACommessa } from "./CaricaFatturaCommessa";
import { CollegaFatturaRicevutaDialog, FattureProbabiliCommessa } from "./CollegaFatturaRicevutaDialog";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
/**
 * Materiali e acquisti → «Bolle e DDT» e Fatture e costi → «Fornitori» della commessa.
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
import { ChevronDown, FileText, Link2, Plus, Receipt, Truck } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDDTRicezioneMutations, type DDTStato } from "@/hooks/useDDTRicezione";
import { useSegnaRicevutaPagata } from "@/components/fatturazione/PagamentoRicevuta";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import { CollegaFatturaCommesseDialog, type FatturaDaCollegare } from "@/components/fatturazione/CollegaFatturaCommesseDialog";
import { VerificaFatturaPill } from "@/components/fatturazione/VerificaFatturaPill";
import { fatturaVerificata, quoteDelCosto, vociFattura } from "@/lib/fatturazione/ripartizioneFattura";
import { NewDDTDialog } from "@/components/ddt/NewDDTDialog";
import { BolleInBloccoDialog } from "@/components/ddt/BolleInBloccoDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { allPaymentRows } from "@/hooks/useSupplierPayments";
import { useAuth } from "@/contexts/AuthContext";
import { STATI_DDT } from "@/lib/orders/materialProcurement";
import { formatCurrency } from "@/lib/formatters";
import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";
import { Skeleton } from "@/components/ui/skeleton";
import { ContatoriFiltro } from "./ContatoriFiltro";
import { RiquadroCommessa, StatoPill, TabellaCommessa, type ColonnaTabella, type TonoStato } from "./TabellaCommessa";
import { useCostiCommessa } from "./OrderCostiCommessa";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

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
  d: { stato: string | null; purchase_order_id?: string | null; order_id?: string | null; has_damages?: boolean | null; ai_avvisi?: unknown },
): Pick<RigaBolla, "daFare" | "motivo"> {
  const avvisiAI = Array.isArray(d.ai_avvisi) ? d.ai_avvisi.length : 0;
  if (origine === "cantiere") {
    if (d.stato !== "da_verificare") return { daFare: null, motivo: null };
    return { daFare: "conferma", motivo: d.purchase_order_id ? "Foto dal cantiere: conferma che sia di questo ordine" : "Foto dal cantiere: conferma a cosa appartiene" };
  }
  if (d.stato === "non_conforme" || d.has_damages) return { daFare: "controllo", motivo: "Merce non conforme o danneggiata" };
  if (d.stato === "ricevuto" || d.stato === "parziale") {
    if (!d.purchase_order_id && avvisiAI > 0) return { daFare: "conferma", motivo: "Letta dall’AI con dei dubbi: controlla i dati della bolla" };
    if (!d.purchase_order_id) return d.order_id
      ? { daFare: "controllo", motivo: "Attribuita alla commessa, merce da controllare" }
      : { daFare: "conferma", motivo: "Senza ordine d’acquisto: conferma a cosa appartiene" };
    if (avvisiAI > 0) return { daFare: "conferma", motivo: "Letta dall’AI con dei dubbi: controlla l’abbinamento all’ordine" };
    return { daFare: "controllo", motivo: "Arrivata, merce da controllare" };
  }
  return { daFare: null, motivo: null };
}

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
          ...cosaManca("fornitore", { ...d, order_id: orderId }),
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

const quantitaMateriale = (m: MaterialeBolla) => (m.quantita == null ? "" : ` · ${m.quantita.toLocaleString(intlCampo())}${m.unita ? ` ${m.unita}` : ""}`);

/** I materiali: il primo si legge subito, gli altri si aprono. */
function CellaMateriali({ materiali = [] }: { materiali?: MaterialeBolla[] }) {
  const t = useT();
  if (materiali.length === 0) return <span className="text-muted-foreground">—</span>;
  if (materiali.length === 1) return <span>{materiali[0].nome}{quantitaMateriale(materiali[0])}</span>;
  return (
    <details>
      <summary className="cursor-pointer">{t("{nome} e altri {n}", { nome: materiali[0].nome, n: materiali.length - 1 })}</summary>
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
  const t = useT();
  const v = VERIFICA[riga.verifica!];
  const testo = t(v.testo);
  const freccia = <ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" />;
  if (riga.origine === "cantiere" && riga.verifica === "da_verificare") {
    return <Link to={`/azienda/ordini/${orderId}?tab=cantiere&vista_cantiere=diario`} title={t("Verificala nel Diario")}><StatoPill tono={v.tono}>{testo}{freccia}</StatoPill></Link>;
  }
  if (riga.origine !== "fornitore" || riga.verifica === "attesa" || !puoCambiare) return <StatoPill tono={v.tono}>{testo}</StatoPill>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={t("Cambia lo stato della bolla {numero}", { numero: riga.numero ?? "" })}><StatoPill tono={v.tono}>{testo}{freccia}</StatoPill></DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem disabled={riga.verifica === "verificata"} onSelect={() => onCambia({ stato: "verificato", has_damages: false })}>{t("Verificata: merce conforme")}</DropdownMenuItem>
        <DropdownMenuItem disabled={riga.verifica === "da_verificare"} onSelect={() => onCambia({ stato: "ricevuto", has_damages: false })}>{t("Da verificare")}</DropdownMenuItem>
        <DropdownMenuItem disabled={riga.verifica === "non_conforme"} onSelect={() => onCambia({ stato: "non_conforme", has_damages: true })}>{t("Non conforme")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OrderBolleDdtCard({ orderId, puoAprireDocumenti = true }: { orderId: string; puoAprireDocumenti?: boolean }) {
  const t = useT();
  const aspetto = useAspettoOperativo();
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
  const [caricaPiu, setCaricaPiu] = useState(false);
  const { updateDDT } = useDDTRicezioneMutations(null);
  const linkDi = (r: RigaBolla) => (r.origine === "cliente" && !puoAprireDocumenti || !r.link ? undefined : percorsoDocumentoGenerale(r.link, aspetto?.generaleId));
  const colonne: ColonnaTabella<RigaBolla>[] = [
    { titolo: t("Numero"), principale: true, cella: (r) => {
      const testo = r.numero ? `N° ${r.numero}` : t("Senza numero");
      const link = linkDi(r);
      return link ? <Link to={link} className="font-medium underline-offset-2 hover:underline">{testo}</Link> : <span className="font-medium">{testo}</span>;
    } },
    { titolo: t("Data"), cella: (r) => <span className="whitespace-nowrap">{dataIt(r.data)}</span> },
    { titolo: t("Fornitore o cliente"), cella: (r) => r.controparte ?? "—" },
    { titolo: t("Provenienza"), cella: (r) => <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${ORIGINE[r.origine].classe}`}>{t(ORIGINE[r.origine].testo)}</span> },
    { titolo: t("Materiali"), cella: (r) => <CellaMateriali materiali={r.materiali} /> },
    { titolo: t("Stato"), cella: (r) => r.verifica ? (
      <div className="space-y-0.5">
        <StatoBolla riga={r} orderId={orderId} puoCambiare={puoCaricare} onCambia={(updates) => updateDDT.mutate({ id: r.id, updates })} />
        {r.motivo && <p className="text-xs text-muted-foreground">{t(r.motivo)}</p>}
      </div>
    ) : <StatoPill tono="grigio">{t(r.stato)}</StatoPill> },
  ];
  return (
    <>
    <RiquadroCommessa
      icona={<Truck className="h-5 w-5 text-primary" aria-hidden="true" />}
      descrizione={t("Merce ricevuta, provenienza e verifica delle consegne, anche senza ordine d’acquisto.")}
      titolo={t("Bolle e DDT")} conteggio={data.length}
      azioni={puoCaricare ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setCaricaPiu(true)}>{t("Più bolle")}</Button><Button size="sm" onClick={() => setCarica(true)}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("Carica bolla")}</Button></div> : undefined}
      numeri={data.length > 0 ? (
        <ContatoriFiltro etichetta={t("Bolle per stato e provenienza")} attivo={filtro} onScegli={setFiltro} voci={[
          { chiave: "daVerificare", etichetta: t("Da verificare"), valore: conta("daVerificare"), avviso: true },
          { chiave: "verificate", etichetta: t("Verificate"), valore: conta("verificate") },
          { chiave: "fornitore", etichetta: t("Dal fornitore"), valore: conta("fornitore") },
          { chiave: "cantiere", etichetta: t("Dal cantiere"), valore: conta("cantiere") },
          { chiave: "cliente", etichetta: t("DDT al cliente"), valore: conta("cliente") },
        ]} />
      ) : undefined}
    >
        {isError ? (
          <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere le bolle.")} <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button></p>
        ) : isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <p className="commessa-empty text-sm text-muted-foreground">{t("Nessuna bolla su questa commessa. Caricala da «Carica bolla» (foto o PDF, l’AI legge le righe), oppure arriva quando registri la merce sull’ordine d’acquisto.")}</p>
        ) : (
          <TabellaCommessa etichetta={t("Bolle e DDT della commessa")} colonne={colonne} righe={visibili} chiave={(r) => `${r.origine}-${r.id}`} />
        )}
        {data.some((r) => r.origine === "cantiere" && r.verifica === "da_verificare") && (
          <p className="mt-2 text-xs text-muted-foreground">{t("Le bolle dal cantiere si verificano in Cantiere → Diario, nel riquadro «Da approvare dal cantiere».")}</p>
        )}
    </RiquadroCommessa>
      {caricaPiu && <BolleInBloccoDialog open onOpenChange={setCaricaPiu} orderId={orderId} destinazione="cantiere" />}
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
  imponibileDocumento: number | null;
  /**
   * Il costo che questa fattura porta alla commessa, IVA esclusa: l'imponibile per la quota
   * (23/11/2026: una fattura da 50.551 € ne portava 23.489 a una commessa, e la
   * tabella mostrava solo 28.656 IVA inclusa, senza dire di quanto era la fattura).
   */
  costoQui: number | null;
  /** Le bolle della fattura viste da questa commessa (commessa_fatture_bolle): null se non leggibili. */
  bolle: BolleDellaFattura | null;
  pagamento: StatoPagamento;
  pagato: number | null;
  residuo: number | null;
  pagataIl: string | null;
  /** Una riga sola per capire cos'è. */
  descrizione: string | null;
  /** Scelta di chi controlla; finché nessuno sceglie, contabilizzata vale verificata. */
  verificata: boolean;
  contabilizzata: boolean;
  /** Le altre commesse su cui è divisa, e le voci di questa commessa. */
  ripartizione: Array<{ orderId: string; codice: string; pct: number; importo: number | null }>;
  vociQui: string[];
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

export interface BolleDellaFattura {
  /** Bolle che la fattura cita (XML o a mano) e quante sono caricate in Edilizia in Cloud. */
  citate: number;
  caricate: number;
  /** Bolle collegate che hanno consegnato merce su questa commessa, e quanto vale (IVA esclusa). */
  qui: number;
  valoreQui: number;
  senzaPrezzo: number;
}

/**
 * Il costo messo sulla commessa torna con le bolle? Solo quando lo si può dire:
 * - tutte le bolle caricate e prezzate: deve valere quanto la merce consegnata qui;
 * - bolle mancanti: si sa solo che non può valere MENO della merce già consegnata qui.
 * Un euro o il 2% di tolleranza per arrotondamenti e trasporti.
 */
export function ripartizioneDalleBolle(costoQui: number | null, b: BolleDellaFattura | null): "torna" | "non_torna" | "incompleta" | null {
  if (!b || b.citate === 0 || costoQui == null) return null;
  const tolleranza = Math.max(1, Math.abs(b.valoreQui) * 0.02);
  const complete = b.caricate === b.citate && b.senzaPrezzo === 0;
  if (complete) return Math.abs(Math.abs(costoQui) - b.valoreQui) <= tolleranza ? "torna" : "non_torna";
  if (b.senzaPrezzo === 0 && b.valoreQui - Math.abs(costoQui) > tolleranza) return "non_torna";
  return "incompleta";
}

/** Il costo sulla commessa, IVA esclusa: imponibile (o totale, se manca) per la quota; intera senza quota. */
export function costoSullaCommessa(imponibile: number | null, totale: number | null, segno: number, quota: number | null): number | null {
  const base = imponibile != null ? segno * Math.abs(Number(imponibile)) : totale;
  if (base == null || !Number.isFinite(base)) return null;
  return quota == null ? base : Math.round(base * quota) / 100;
}

/** «56,7% della fattura» o «tutta la fattura». */
export function incidenzaSullaFattura(quota: number | null): string {
  return quota == null ? "tutta la fattura" : `${quota.toLocaleString("it-IT", { maximumFractionDigits: 1 })}% della fattura`;
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
      const campi = "id, numero_fattura, data_fattura, cedente_ragione_sociale, totale_documento, tipo_documento, stato, purchase_order_id, company_cost_id, pagata_il, order_match_confidenza, anomalie_rilevate, ai_riassunto, righe, imponibile_totale";
      const [daOda, daCosto, suggerite] = await Promise.all([
        Promise.all(aLotti(odaIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("purchase_order_id", ids).order("id").range(da, a)))),
        Promise.all(aLotti(costoIds).map((ids) => allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).in("company_cost_id", ids).order("id").range(da, a)))),
        allPaymentRows((da, a) => db.from("fatture_ricevute").select(campi)
          .eq("company_id", companyId).eq("order_id_suggerito", orderId).order("id").range(da, a)),
      ]);
      type Grezza = { id: string; numero_fattura: string | null; data_fattura: string | null; cedente_ragione_sociale: string | null; totale_documento: number | null; tipo_documento: string | null; stato: string | null; purchase_order_id: string | null; company_cost_id: string | null; pagata_il: string | null; order_match_confidenza: number | null; anomalie_rilevate: unknown; ai_riassunto: string | null; righe: unknown; imponibile_totale: number | null };
      // La verifica scelta a mano: lettura a parte, così una base dati senza la colonna non ferma l'elenco.
      const verifiche = new Map<string, string>();
      const idFatture = [...new Set([...daOda.flat(), ...daCosto.flat(), ...suggerite].map((f) => (f as { id: string }).id))];
      for (const ids of aLotti(idFatture)) {
        const { data: v, error: errV } = await db.from("fatture_ricevute").select("id, verifica_manuale").eq("company_id", companyId).in("id", ids).not("verifica_manuale", "is", null);
        if (!errV) for (const x of (v ?? []) as Array<{ id: string; verifica_manuale: string }>) verifiche.set(x.id, x.verifica_manuale);
      }
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
          imponibileDocumento: f.imponibile_totale,
          costoQui: costoSullaCommessa(f.imponibile_totale, intero, segno, quota),
          bolle: null,
          pagamento: f.pagata_il ? "pagata" : "da_pagare",
          pagato: null,
          residuo: null,
          pagataIl: f.pagata_il,
          descrizione: descrizioneFattura(f.ai_riassunto, f.righe),
          verificata: fatturaVerificata({ stato: f.stato, verifica_manuale: verifiche.get(f.id) }),
          contabilizzata: f.stato === "contabilizzata",
          ripartizione: [],
          vociQui: [],
          confidenza: legame === "suggerita" && f.order_match_confidenza != null ? Number(f.order_match_confidenza) : null,
          daControllare: Array.isArray(f.anomalie_rilevate) && f.anomalie_rilevate.length > 0 ? "L’AI ha segnalato un’anomalia"
            : f.stato === "non_letta" && legame !== "suggerita" ? "Non ancora aperta da nessuno" : null,
        });
      };
      (daOda.flat() as Grezza[]).forEach((f) => aggiungi(f, "oda"));
      (daCosto.flat() as Grezza[]).forEach((f) => aggiungi(f, "costo"));
      // Suggerita = l'AI pensa che sia di questa commessa, ma nessun ordine o costo la lega ancora.
      (suggerite as Grezza[]).filter((f) => !f.purchase_order_id && !f.company_cost_id).forEach((f) => aggiungi(f, "suggerita"));
      // Fattura divisa su più commesse: quanto a ciascuna e quali voci a questa.
      const costiDivisi = costiRipartiti as Array<{ id: string; order_id: string | null; allocations: unknown }>;
      const idAltreCommesse = [...new Set(costiDivisi.flatMap((c) => quoteDelCosto(c).map((q) => q.order_id)))];
      const codici = new Map<string, string>();
      for (const ids of aLotti(idAltreCommesse)) {
        const { data: o, error: errO } = await db.from("orders").select("id, order_code").eq("company_id", companyId).in("id", ids);
        if (errO) throw errO;
        for (const x of (o ?? []) as Array<{ id: string; order_code: string | null }>) codici.set(x.id, x.order_code ?? "Commessa");
      }
      const righeFattura = new Map(([...daOda.flat(), ...daCosto.flat()] as Grezza[]).map((f) => [f.id, f.righe]));
      for (const f of viste.values()) {
        const quote = quoteDelCosto(costiDivisi.find((c) => c.id === f.costId));
        if (quote.length < 2 && !(quote[0]?.pct < 100)) continue;
        f.ripartizione = quote.map((q) => ({ orderId: q.order_id, codice: codici.get(q.order_id) ?? "Commessa", pct: q.pct, importo: (f.totaleDocumento ?? f.totale) == null ? null : Math.round((f.totaleDocumento ?? f.totale)! * q.pct) / 100 }));
        const mie = quote.find((q) => q.order_id === orderId)?.righe ?? [];
        f.vociQui = vociFattura(righeFattura.get(f.id)).filter((v) => mie.includes(v.numero)).map((v) => v.descrizione);
      }
      // Le bolle di ogni fattura viste da qui. Chi non vede i costi riceve un rifiuto: la tabella resta com'era.
      for (const ids of aLotti([...viste.keys()])) {
        const { data: b, error: errB } = await db.rpc("commessa_fatture_bolle", { p_order: orderId, p_fatture: ids });
        if (errB) break;
        for (const x of (b ?? []) as Array<{ fattura_id: string; bolle_citate: number; bolle_caricate: number; bolle_qui: number; valore_qui: number | string; righe_senza_prezzo: number }>) {
          const f = viste.get(x.fattura_id);
          if (f) f.bolle = { citate: x.bolle_citate, caricate: x.bolle_caricate, qui: x.bolle_qui, valoreQui: Number(x.valore_qui) || 0, senzaPrezzo: x.righe_senza_prezzo };
        }
      }
      for (const f of viste.values()) {
        if (f.legame !== "suggerita" && !f.daControllare && ripartizioneDalleBolle(f.costoQui, f.bolle) === "non_torna")
          f.daControllare = `Il costo qui non torna con le bolle consegnate: ${formatCurrency(f.bolle!.valoreQui)}`;
      }
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

/** Sotto il costo: quanto dicono le bolle consegnate qui, e quante bolle della fattura mancano. */
function BolleQui({ f }: { f: RigaFattura }) {
  const t = useT();
  const b = f.bolle;
  if (!b || b.citate === 0 || f.legame === "suggerita") return null;
  const esito = ripartizioneDalleBolle(f.costoQui, b);
  const mancanti = b.citate - b.caricate;
  return (
    <div className="mt-0.5 space-y-0.5 text-xs">
      {b.qui > 0 && (
        <p className={esito === "non_torna" ? "font-medium text-amber-700 dark:text-amber-400" : esito === "torna" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}>
          {t(b.qui === 1 ? "Bolle qui: {importo} ({n} bolla)" : "Bolle qui: {importo} ({n} bolle)", { importo: formatCurrency(b.valoreQui), n: b.qui })}{esito === "torna" ? " ✓" : ""}
        </p>
      )}
      {b.senzaPrezzo > 0 && <p className="text-muted-foreground">{t(b.senzaPrezzo === 1 ? "{n} riga senza prezzo" : "{n} righe senza prezzo", { n: b.senzaPrezzo })}</p>}
      {mancanti > 0 && <p className="text-muted-foreground">{t(mancanti === 1 ? "{n} bolla su {totale} da caricare" : "{n} bolle su {totale} da caricare", { n: mancanti, totale: b.citate })}</p>}
    </div>
  );
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

export function OrderFattureFornitoriCard({ orderId, mostraImporti, puoAprireFatture = true, puoModificare = false, onApriCosti }: { orderId: string; mostraImporti: boolean; puoAprireFatture?: boolean; puoModificare?: boolean; onApriCosti?: () => void }) {
  const t = useT();
  const [paymentCostId, setPaymentCostId] = useState<string | null>(null);
  const [riepilogoId, setRiepilogoId] = useState<string | null>(null);
  const [daDividere, setDaDividere] = useState<RigaFattura | null>(null);
  const [collegaRicevuta, setCollegaRicevuta] = useState(false);
  const [daProbabile, setDaProbabile] = useState<FatturaDaCollegare | null>(null);
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
      toast.error(fallita, { description: messaggioErrore(e) });
    } finally {
      setOccupata(null);
    }
  };
  // Suggerita dall'AI → costo di questa commessa (contabilizzata se serve).
  const collega = (f: RigaFattura) => azione(f, () => collegaFatturaACommessa(f.id, orderId), t("Fattura {numero} messa fra i costi della commessa", { numero: f.numero ?? "" }), t("Fattura non collegata"));
  // Un suggerimento sbagliato dell'AI: la fattura resta nelle ricevute, solo non è più proposta qui.
  const nonDiQuesta = (f: RigaFattura) => azione(f, async () => {
    const { error } = await db.from("fatture_ricevute").update({ order_id_suggerito: null, order_match_confidenza: null }).eq("id", f.id).eq("order_id_suggerito", orderId);
    if (error) throw error;
  }, t("Fattura {numero} tolta dai suggerimenti", { numero: f.numero ?? "" }), t("Suggerimento non tolto"));
  // Stessa azione di Fatture ricevute: crea il costo o corregge quello nato dall'ordine, senza contarlo due volte.
  const contabilizza = (f: RigaFattura) => {
    if (!window.confirm(t("Contabilizzare la fattura {numero}? Il suo costo entra nei conti.", { numero: f.numero ?? "" }))) return;
    void azione(f, async () => {
      const { error } = await db.rpc("contabilizza_fattura_ricevuta", { p_fattura_id: f.id });
      if (error) throw error;
    }, t("Fattura {numero} contabilizzata", { numero: f.numero ?? "" }), t("Fattura non contabilizzata"));
  };
  const collegate = data.filter((f) => f.legame !== "suggerita");
  const suggerite = data.filter((f) => f.legame === "suggerita");
  const totale = collegate.reduce((n, f) => n + (f.totale ?? 0), 0);
  const costoCommessa = collegate.reduce((n, f) => n + (f.costoQui ?? 0), 0);
  const costiSenzaFattura = (costi?.costi ?? []).filter((c) => c.senza_fattura).length;
  const filtri: Record<string, (f: RigaFattura) => boolean> = {
    collegare: (f) => f.legame === "suggerita",
    // Chi l'ha verificata ha deciso: l'avviso resta scritto sulla riga, ma non la rimette da verificare.
    daVerificare: (f) => f.legame !== "suggerita" && !f.verificata,
    verificate: (f) => f.legame !== "suggerita" && f.verificata,
    pagare: (f) => f.legame !== "suggerita" && f.pagamento !== "pagata" && !f.notaCredito,
    pagate: (f) => f.legame !== "suggerita" && f.pagamento === "pagata",
  };
  const conta = (chiave: string) => data.filter(filtri[chiave]).length;
  const visibili = filtro && filtri[filtro] && conta(filtro) > 0 ? data.filter(filtri[filtro]) : data;
  const importo = (n: number | null | undefined) => (n == null ? "—" : formatCurrency(n));
  const colonne: ColonnaTabella<RigaFattura>[] = [
    { titolo: t("Fattura"), principale: true, cella: (f) => {
      const testo = `${f.notaCredito ? t("Nota di credito") : "N."} ${f.numero ?? "—"}`;
      return puoAprireFatture
        ? <button type="button" className="text-left font-medium underline-offset-2 hover:underline" onClick={() => setRiepilogoId(f.id)}>{testo}</button>
        : <span className="font-medium">{testo}</span>;
    } },
    { titolo: t("Data"), cella: (f) => <span className="whitespace-nowrap">{dataIt(f.data)}</span> },
    { titolo: t("Fornitore"), cella: (f) => (
      <div className="min-w-0 max-sm:text-right">
        <p>{f.fornitore ?? t("Fornitore")}</p>
        {f.descrizione && <p className="line-clamp-1 text-xs text-muted-foreground" title={f.descrizione}>{f.descrizione}</p>}
      </div>
    ) },
    { titolo: t("Collegata a"), cella: (f) => (
      <div className="text-xs text-muted-foreground">
        {f.oda ?? t(LEGAME[f.legame])}
        {f.ripartizione.length > 0 && (
          <details>
            <summary className="cursor-pointer">{t(f.ripartizione.length === 1 ? "Divisa su {n} commessa" : "Divisa su {n} commesse", { n: f.ripartizione.length })}</summary>
            <ul className="mt-0.5 space-y-0.5">
              {f.ripartizione.map((q) => (
                <li key={q.orderId} className={q.orderId === orderId ? "font-medium text-foreground" : undefined}>
                  {q.codice} · {q.pct.toLocaleString(intlCampo())}%{mostraImporti && q.importo != null ? ` · ${formatCurrency(q.importo)}` : ""}
                </li>
              ))}
            </ul>
            {f.vociQui.length > 0 && <p className="mt-0.5">{t("Voci di questa commessa: {voci}", { voci: f.vociQui.join(", ") })}</p>}
          </details>
        )}
        {f.confidenza != null && <p>{t("L’AI è sicura al {pct}%", { pct: Math.round(f.confidenza * 100) })}</p>}
      </div>
    ) },
    { titolo: t("Verifica"), cella: (f) => f.legame === "suggerita" ? <StatoPill tono="ambra">{t("Da collegare")}</StatoPill> : (
      <div className="space-y-0.5">
        <VerificaFatturaPill id={f.id} numero={f.numero} verificata={f.verificata} avviso={!!f.daControllare} puoCambiare={puoModificare}
          altreAzioni={!f.contabilizzata ? [{ testo: t("Contabilizza"), fai: () => contabilizza(f) }] : undefined} />
        {f.daControllare && <p className="text-xs text-muted-foreground">{t(f.daControllare)}</p>}
      </div>
    ) },
    { titolo: t("Pagamento"), cella: (f) => f.legame === "suggerita" || f.notaCredito ? <span className="text-muted-foreground">—</span> : (
      <div className="space-y-0.5">
        {puoModificare || f.costId ? (
          <button type="button" title={f.costId ? t("Pagamenti e residuo") : f.pagamento === "pagata" ? t("Rimetti da pagare") : t("Segna pagata")} aria-label={t("Pagamento della fattura {numero}", { numero: f.numero ?? "" })} disabled={segnaPagata.isPending}
            onClick={() => {
              if (f.costId) { setPaymentCostId(f.costId); return; }
              segnaPagata.mutate({ id: f.id, pagata: f.pagamento !== "pagata", numero: f.numero ?? undefined }, {
                onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }),
              });
            }}>
            <StatoPill tono={PAGAMENTO[f.pagamento].tono}>{t(PAGAMENTO[f.pagamento].testo)}<ChevronDown className="ml-1 inline h-3 w-3" aria-hidden="true" /></StatoPill>
          </button>
        ) : <StatoPill tono={PAGAMENTO[f.pagamento].tono}>{t(PAGAMENTO[f.pagamento].testo)}</StatoPill>}
        {f.pagataIl && <p className="whitespace-nowrap text-xs text-muted-foreground">{t("il {data}", { data: dataIt(f.pagataIl) })}</p>}
      </div>
    ) },
    ...(mostraImporti ? [
      { titolo: t("Fattura"), destra: true, cella: (f: RigaFattura) => (
        <div className="whitespace-nowrap">
          <p>{importo(f.totaleDocumento ?? f.totale)}</p>
          {f.imponibileDocumento != null && <p className="text-xs text-muted-foreground">{t("imp.")} {formatCurrency((f.notaCredito ? -1 : 1) * Math.abs(f.imponibileDocumento))}</p>}
        </div>
      ) },
      { titolo: t("Su questa commessa"), destra: true, cella: (f: RigaFattura) => f.legame === "suggerita" ? <span className="text-muted-foreground">—</span> : (
        <div className="whitespace-nowrap">
          <p className="font-medium">{importo(f.costoQui)}</p>
          {f.imponibileDocumento == null && f.costoQui != null && <p className="text-xs text-muted-foreground">{t("IVA inclusa: imponibile non letto")}</p>}
          <p className={f.quota != null ? "text-xs font-medium text-primary" : "text-xs text-muted-foreground"}>{f.quota == null ? t("tutta la fattura") : t("{pct}% della fattura", { pct: f.quota.toLocaleString(intlCampo(), { maximumFractionDigits: 1 }) })}</p>
          <BolleQui f={f} />
        </div>
      ) },
      { titolo: t("Pagato"), destra: true, cella: (f: RigaFattura) => (f.legame === "suggerita" ? "—" : importo(f.pagato)) },
      { titolo: t("Da pagare"), destra: true, cella: (f: RigaFattura) => (f.legame === "suggerita" ? "—" : <span className={f.residuo ? "font-medium text-amber-700 dark:text-amber-400" : undefined}>{importo(f.residuo)}</span>) },
    ] : []),
    { titolo: t("Azioni"), destra: true, senzaEtichetta: true, cella: (f) => (
      <div className="flex flex-wrap justify-end gap-1">
        {puoModificare && f.legame !== "oda" && <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => setDaDividere(f)}>{f.legame === "suggerita" ? t("Dividi su più commesse") : t("Commesse")}</Button>}
        {puoModificare && f.legame === "suggerita" && <>
          <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={occupata !== null} onClick={() => void collega(f)}>{occupata === f.id ? t("Collego…") : t("Collega a questa commessa")}</Button>
          <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={occupata !== null} onClick={() => void nonDiQuesta(f)}>{t("Non è di questa commessa")}</Button>
        </>}
      </div>
    ) },
  ];
  return (
    <>
    {paymentCostId && <ExpensePaymentDialog key={paymentCostId} costId={paymentCostId} onClose={() => { setPaymentCostId(null); void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }); }} />}
    {collegaRicevuta && effectiveCompany?.id && (
      <CollegaFatturaRicevutaDialog open onOpenChange={setCollegaRicevuta} orderId={orderId} companyId={effectiveCompany.id} mostraImporti={mostraImporti} />
    )}
    {daDividere && effectiveCompany?.id && (
      <CollegaFatturaCommesseDialog companyId={effectiveCompany.id} commessaIniziale={orderId} onChiudi={() => { setDaDividere(null); void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }); }}
        fattura={{ id: daDividere.id, numero: daDividere.numero, fornitore: daDividere.fornitore, imponibile: daDividere.imponibileDocumento, totale: daDividere.totaleDocumento ?? daDividere.totale, companyCostId: daDividere.costId, purchaseOrderId: daDividere.purchaseOrderId }} />
    )}
    {daProbabile && effectiveCompany?.id && (
      <CollegaFatturaCommesseDialog companyId={effectiveCompany.id} commessaIniziale={orderId} fattura={daProbabile}
        onChiudi={() => {
          setDaProbabile(null);
          void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
          void queryClient.invalidateQueries({ queryKey: ["fatture-candidate-commessa"] });
        }} />
    )}
    {riepilogoId && (
      <RiepilogoFatturaRicevuta fatturaId={riepilogoId} companyId={effectiveCompany?.id} onClose={() => { setRiepilogoId(null); void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] }); }}
        azioni={(() => {
          const f = data.find((x) => x.id === riepilogoId);
          if (!puoModificare || !f) return {};
          return {
            ...(f.legame !== "oda" ? { onCollegaCommesse: () => { setRiepilogoId(null); setDaDividere(f); } } : {}),
            ...(!f.contabilizzata ? { onContabilizza: () => contabilizza(f) } : {}),
          };
        })()} />
    )}
    <RiquadroCommessa
      icona={<Receipt className="h-5 w-5 text-primary" aria-hidden="true" />}
      descrizione={t("Fatture, quote della commessa, controlli e pagamenti della stessa spesa.")}
      titolo={t("Fatture dei fornitori")} conteggio={collegate.length}
      riassunto={mostraImporti && collegate.length > 0 ? t("{costo} di costo sulla commessa · {totale} IVA inclusa", { costo: formatCurrency(costoCommessa), totale: formatCurrency(totale) }) : undefined}
      azioni={puoModificare ? <Button size="sm" onClick={() => setCollegaRicevuta(true)}><Link2 className="mr-1.5 h-4 w-4" aria-hidden="true" />{t("Collega fattura")}</Button> : undefined}
      numeri={!isLoading && !isError && (data.length > 0 || costiSenzaFattura > 0) ? (
        <ContatoriFiltro etichetta={t("Fatture per stato")} attivo={filtro} onScegli={(c) => {
          if (c === "costi") { onApriCosti?.(); return; }
          setFiltro(c);
        }} voci={[
          { chiave: "daVerificare", etichetta: t("Da verificare"), valore: conta("daVerificare"), avviso: true },
          { chiave: "verificate", etichetta: t("Verificate"), valore: conta("verificate") },
          { chiave: "collegare", etichetta: t("Da collegare"), valore: conta("collegare"), avviso: true },
          { chiave: "pagare", etichetta: t("Da pagare"), valore: conta("pagare") },
          { chiave: "pagate", etichetta: t("Pagate"), valore: conta("pagate") },
          { chiave: "costi", etichetta: t("Costi senza fattura"), valore: costiSenzaFattura },
        ]} />
      ) : undefined}
    >
      {isError ? (
        <p role="alert" className="text-sm text-destructive">{t("Non riesco a leggere le fatture.")} <button type="button" className="underline" onClick={() => void refetch()}>{t("Riprova")}</button></p>
      ) : isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="space-y-3">
          {puoModificare && effectiveCompany?.id && (
            <FattureProbabiliCommessa orderId={orderId} companyId={effectiveCompany.id} mostraImporti={mostraImporti}
              giaMostrate={new Set(data.map((f) => f.id))} onCollega={setDaProbabile} onVediTutte={() => setCollegaRicevuta(true)} />
          )}
          {data.length === 0
            ? <p className="commessa-empty text-sm text-muted-foreground">{t("Nessuna fattura collegata. Con «Collega fattura» la scegli fra le fatture ricevute, o carichi il file se non c’è.")}</p>
            : <TabellaCommessa etichetta={t("Fatture dei fornitori")} colonne={colonne} righe={visibili} chiave={(f) => f.id}
                onRiga={puoAprireFatture ? (f) => setRiepilogoId(f.id) : undefined} />}
          {suggerite.length > 0 && <p className="text-xs text-muted-foreground">{t("Le fatture «Da collegare» le ha riconosciute l’AI: finché non le colleghi non entrano nei costi.")}</p>}
          {puoAprireFatture && <Link to="/azienda/documenti/fatture-ricevute" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline underline-offset-4">
            <FileText className="h-4 w-4" aria-hidden="true" />{t("Apri le fatture ricevute")}
          </Link>}
        </div>
      )}
    </RiquadroCommessa>
    </>
  );
}

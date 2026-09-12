/**
 * AdminServiceClients — Clienti-Servizio (Fase 2 della feature "Prodotti & Servizi").
 *
 * Gestisce public.aedix_service_clients: le relazioni RICORRENTI cliente ↔ servizio
 * (es. le aziende clienti di Marketing Edile a provvigione mensile). Il cliente può
 * essere collegato a un contatto CRM o a un'azienda piattaforma (o solo un nome).
 * Mostra MRR ricorrente stimato, incassato reale (da aedix_service_billings) e lo
 * stato di ogni relazione, con ricerca + filtri per servizio/stato.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BrandPageHeader } from "@/components/admin/BrandPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Users, Plus, Pencil, Trash2, Loader2, Building2, UserRound, Link2, Wallet, Search, AlertTriangle, CalendarCheck } from "lucide-react";
import { ServiceBillingsDialog } from "@/components/admin/settings/ServiceBillingsDialog";
import { ChiusuraMeseDialog } from "@/components/admin/settings/ChiusuraMeseDialog";
import { ValoreClientiTable } from "@/components/admin/settings/ValoreClientiTable";
import { ClientiMarketingPanel } from "@/components/admin/clienti-marketing/ClientiMarketingPanel";
import { ReportClienteMarketing } from "@/components/admin/clienti-marketing/ReportClienteMarketing";
import { ScaglioniEditor } from "@/components/admin/clienti-marketing/ScaglioniEditor";
import { useClientiMarketing } from "@/components/admin/clienti-marketing/useClientiMarketing";
import {
  SCAGLIONI_STANDARD, meseChiave, meseLeggibile, normalizzaScaglioni, righeDaScaglioni, scaglioniDaRighe, totaliMese, variazione, type RigaScaglione,
} from "@/components/admin/clienti-marketing/provvigioni";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

interface ProductLineLite { id: string; nome: string; colore: string | null; }
interface PackageLite { id: string; nome: string; prezzo: number; product_line_id: string; }
interface ServiceClient {
  id: string;
  product_line_id: string;
  package_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  cliente_nome: string;
  commerciale: string | null;
  billing_model: string;
  importo: number;
  provvigione_pct: number | null;
  ricorrenza: string;
  stato: string;
  data_inizio: string;
  data_fine: string | null;
  note: string | null;
  /** scaglioni progressivi [{da, a, pct}] sul venduto mensile; null = righe a % fissa */
  provvigione_scaglioni: unknown;
}
interface BillingRow { service_client_id: string; periodo: string; importo_dovuto: number; importo_incassato: number; }
interface CommLine { id?: string; etichetta: string; base: string; percentuale: number; }

const COMM_BASE = [
  { value: "fatturato", label: "Fatturato cliente" },
  { value: "incassato", label: "Incassato cliente" },
];

const BILLING = [
  { value: "retainer_fisso", label: "Retainer fisso" },
  { value: "provvigione", label: "Provvigione %" },
  { value: "performance", label: "Performance" },
  { value: "una_tantum", label: "Una-tantum" },
];
const RICORRENZE = [
  { value: "mensile", label: "Mensile" },
  { value: "annuale", label: "Annuale" },
  { value: "una_tantum", label: "Una-tantum" },
];
const STATI: Record<string, string> = { attivo: "bg-emerald-100 text-emerald-700", pausa: "bg-amber-100 text-amber-700", cessato: "bg-slate-200 text-slate-600" };
// useGrouping booleano: la stringa "always" non passa il typecheck (vedi ChiusuraMeseDialog).
const eur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true }).format(Math.round(n || 0));

type Draft = Partial<ServiceClient>;
const EMPTY: Draft = { billing_model: "retainer_fisso", ricorrenza: "mensile", stato: "attivo", importo: 0, data_inizio: new Date().toISOString().slice(0, 10) };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => supabase as any;

export default function AdminServiceClients() {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [clientQuery, setClientQuery] = useState("");
  const [billClient, setBillClient] = useState<{ id: string; cliente_nome: string; importo: number; commerciale?: string | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceClient | null>(null);
  const [commLines, setCommLines] = useState<CommLine[]>([]);
  // Provvigione a scaglioni progressivi (Marketing Edile) al posto delle righe a % fissa.
  const [usaScaglioni, setUsaScaglioni] = useState(false);
  const [righeScaglioni, setRigheScaglioni] = useState<RigaScaglione[]>([]);
  const [chiusuraOpen, setChiusuraOpen] = useState(false);
  // "marketing" = la console dei clienti seguiti nel marketing, un mese alla
  // volta; "contratti" = una riga per relazione; "clienti" = una riga per
  // persona, con gli acquisti ripetuti sommati.
  const [vista, setVista] = useState<"marketing" | "contratti" | "clienti">("marketing");
  const [oggi] = useState(() => new Date());
  const meseOggi = meseChiave(oggi);
  const [mese, setMese] = useState(meseOggi);
  // ?report=<cliente-servizio>: il report del mese da stampare, al posto della
  // console; ?scheda=<cliente-servizio>: la scheda completa del cliente.
  const [searchParams, setSearchParams] = useSearchParams();
  const reportId = searchParams.get("report");
  const schedaId = searchParams.get("scheda");
  const riepilogo = useClientiMarketing(mese, vista === "marketing" || !!reportId || !!schedaId);
  const totali = useMemo(() => totaliMese(riepilogo.data ?? [], mese === meseOggi), [riepilogo.data, mese, meseOggi]);
  // Filtri lista
  const [search, setSearch] = useState("");
  const [filtServizio, setFiltServizio] = useState("tutti");
  const [filtStato, setFiltStato] = useState("tutti");
  const isEdit = !!draft.id;
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const { data: lines = [] } = useQuery({
    queryKey: ["admin", "product-lines-lite"],
    queryFn: async (): Promise<ProductLineLite[]> => {
      const { data, error } = await sb().from("aedix_product_lines").select("id,nome,colore").order("ordine");
      if (error) throw error; return (data ?? []) as ProductLineLite[];
    },
  });
  const lineMap = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines]);

  const { data: packages = [] } = useQuery({
    enabled: !!draft.product_line_id && dialogOpen,
    queryKey: ["admin", "packages-of-line", draft.product_line_id],
    queryFn: async (): Promise<PackageLite[]> => {
      const { data, error } = await sb().from("aedix_product_packages").select("id,nome,prezzo,product_line_id").eq("product_line_id", draft.product_line_id).eq("attivo", true).order("ordine");
      if (error) throw error; return (data ?? []) as PackageLite[];
    },
  });

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "service-clients"],
    queryFn: async (): Promise<ServiceClient[]> => {
      const { data, error } = await sb().from("aedix_service_clients").select("*").order("created_at", { ascending: false });
      if (error) throw error; return (data ?? []) as ServiceClient[];
    },
  });

  // Incassi reali (aedix_service_billings) aggregati per cliente-servizio.
  const { data: billings = [] } = useQuery({
    queryKey: ["admin", "service-billings-all"],
    queryFn: async (): Promise<BillingRow[]> => {
      const { data, error } = await sb().from("aedix_service_billings").select("service_client_id,periodo,importo_dovuto,importo_incassato");
      if (error) throw error; return (data ?? []) as BillingRow[];
    },
  });

  const billSummary = useMemo(() => {
    const per = new Map<string, { incassatoTot: number; dovutoMese: number; incassatoMese: number; ultimo: string | null }>();
    let incassatoMeseTot = 0, dovutoMeseTot = 0;
    for (const b of billings) {
      const inc = Number(b.importo_incassato) || 0, dov = Number(b.importo_dovuto) || 0;
      const e = per.get(b.service_client_id) ?? { incassatoTot: 0, dovutoMese: 0, incassatoMese: 0, ultimo: null };
      e.incassatoTot += inc;
      if (inc > 0 && (!e.ultimo || b.periodo > e.ultimo)) e.ultimo = b.periodo;
      if ((b.periodo ?? "").slice(0, 7) === currentMonth) { e.dovutoMese += dov; e.incassatoMese += inc; incassatoMeseTot += inc; dovutoMeseTot += dov; }
      per.set(b.service_client_id, e);
    }
    return { per, incassatoMeseTot, daIncassareMese: Math.max(0, dovutoMeseTot - incassatoMeseTot) };
  }, [billings, currentMonth]);

  // Ricerca cliente: aziende piattaforma + contatti CRM
  const { data: clientResults = [] } = useQuery({
    enabled: clientQuery.trim().length >= 2,
    queryKey: ["admin", "client-search", clientQuery],
    queryFn: async (): Promise<{ kind: "company" | "contact"; id: string; label: string }[]> => {
      const q = `%${clientQuery.trim()}%`;
      const [comp, cont] = await Promise.all([
        sb().from("companies").select("id,name").ilike("name", q).limit(6),
        sb().from("marketing_contacts").select("id,first_name,last_name,company_name").or(`first_name.ilike.${q},last_name.ilike.${q},company_name.ilike.${q}`).limit(6),
      ]);
      const out: { kind: "company" | "contact"; id: string; label: string }[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (comp.data ?? []) as any[]) out.push({ kind: "company", id: c.id, label: c.name });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of (cont.data ?? []) as any[]) out.push({ kind: "contact", id: c.id, label: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Contatto" });
      return out;
    },
  });

  // L'identita' del cliente-servizio e' SEMPRE un contatto CRM (contact_id e'
  // NOT NULL dal 31/08/2026): e' cio' che permette di sommare gli acquisti
  // ripetuti della stessa persona. Se scegli un'azienda di Edilizia in Cloud,
  // il contatto corrispondente viene trovato o creato al volo, e l'azienda
  // resta agganciata come attributo.
  const selezionaCliente = async (c: { kind: "company" | "contact"; id: string; label: string }) => {
    setClientQuery("");
    if (c.kind === "contact") {
      setDraft((d) => ({ ...d, cliente_nome: c.label, contact_id: c.id, company_id: null }));
      return;
    }
    const { data: esistente } = await sb()
      .from("marketing_contacts")
      .select("id")
      .eq("company_id", PLATFORM_ADMIN_COMPANY_ID)
      .ilike("company_name", c.label)
      .limit(1)
      .maybeSingle();
    let contactId = (esistente as { id: string } | null)?.id ?? null;
    if (!contactId) {
      const { data: creato, error } = await sb()
        .from("marketing_contacts")
        // first_name è obbligatorio a database: per un'azienda vale il suo nome.
        .insert({ company_id: PLATFORM_ADMIN_COMPANY_ID, first_name: c.label, company_name: c.label, source_channel: "cliente_servizio" })
        .select("id")
        .single();
      if (error) { toast.error("Non riesco a creare il contatto per questa azienda", { description: error.message }); return; }
      contactId = (creato as { id: string }).id;
    }
    setDraft((d) => ({ ...d, cliente_nome: c.label, contact_id: contactId, company_id: c.id }));
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      // contact_id e' l'identita' del cliente ed e' NOT NULL a database: meglio
      // fermarsi qui con un messaggio chiaro che far fallire l'insert.
      if (!d.contact_id) throw new Error("Collega il cliente a un contatto (o a un'azienda) prima di salvare");
      const isProv = d.billing_model === "provvigione";
      const scaglioni = isProv && usaScaglioni ? scaglioniDaRighe(righeScaglioni) : [];
      if (isProv && usaScaglioni && !scaglioni.length) throw new Error("Compila almeno uno scaglione (oltre, fino a, %) oppure usa la tabella standard");
      // Una riga conta solo se ha una % > 0 (le righe vuote/incomplete si scartano).
      const activeLines = scaglioni.length ? [] : commLines.filter((l) => Number(l.percentuale) > 0);
      const payload = {
        product_line_id: d.product_line_id, package_id: d.package_id ?? null,
        contact_id: d.contact_id ?? null, company_id: d.company_id ?? null, cliente_nome: d.cliente_nome,
        commerciale: d.commerciale?.trim() || null,
        billing_model: d.billing_model, importo: Number(d.importo) || 0,
        // provvigione_pct legacy = prima riga o primo scaglione (compat. letture vecchie);
        // le righe reali stanno in aedix_service_commission_lines, gli scaglioni qui sotto.
        provvigione_pct: isProv ? (scaglioni[0] ? scaglioni[0].pct : activeLines[0] ? Number(activeLines[0].percentuale) || 0 : null) : null,
        provvigione_scaglioni: scaglioni.length ? scaglioni : null,
        ricorrenza: d.ricorrenza, stato: d.stato, data_inizio: d.data_inizio, data_fine: d.data_fine ?? null,
        note: d.note ?? null, updated_at: new Date().toISOString(),
      };
      const t = sb().from("aedix_service_clients");
      let clientId = d.id;
      if (d.id) {
        const { error } = await t.update(payload).eq("id", d.id);
        if (error) throw error;
      } else {
        const { data, error } = await t.insert(payload).select("id").single();
        if (error) throw error;
        clientId = (data as { id: string }).id;
      }
      // Sostituzione integrale delle righe provvigione del cliente.
      if (clientId) {
        await sb().from("aedix_service_commission_lines").delete().eq("service_client_id", clientId);
        if (isProv && activeLines.length) {
          const { error } = await sb().from("aedix_service_commission_lines").insert(
            activeLines.map((l, i) => ({ service_client_id: clientId, etichetta: l.etichetta.trim() || null, base: l.base, percentuale: Number(l.percentuale) || 0, ordine: i, attivo: true }))
          );
          if (error) throw error;
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-clients"] }); qc.invalidateQueries({ queryKey: ["admin", "commission-lines"] }); qc.invalidateQueries({ queryKey: ["clienti-marketing"] }); toast.success(isEdit ? "Cliente-servizio aggiornato" : "Cliente-servizio creato"); setDialogOpen(false); },
    onError: (e: unknown) => toast.error("Errore nel salvataggio", { description: e instanceof Error ? e.message : String(e) }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb().from("aedix_service_clients").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-clients"] }); qc.invalidateQueries({ queryKey: ["clienti-marketing"] }); toast.success("Eliminato"); setDeleteTarget(null); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });
  // Cambio stato rapido dalla lista (senza aprire il dialog completo).
  const setStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      const { error } = await sb().from("aedix_service_clients").update({ stato, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "service-clients"] }); qc.invalidateQueries({ queryKey: ["clienti-marketing"] }); },
    onError: (e: unknown) => toast.error("Errore", { description: e instanceof Error ? e.message : String(e) }),
  });

  const openNew = () => {
    setDraft(EMPTY); setClientQuery(""); setCommLines([{ etichetta: "", base: "fatturato", percentuale: 0 }]);
    setUsaScaglioni(false); setRigheScaglioni(righeDaScaglioni(SCAGLIONI_STANDARD));
    setDialogOpen(true);
  };
  /**
   * Un secondo servizio allo stesso cliente (marketing oggi, consulenza
   * domani): contratto nuovo, stesso contatto e stessa azienda, così
   * provvigioni e scadenze restano separate ma il cliente resta uno.
   */
  const nuovoServizioPer = (serviceClientId: string) => {
    const r = rows.find((x) => x.id === serviceClientId);
    if (!r) { toast.error("Cliente non trovato: ricarica la pagina"); return; }
    setDraft({ ...EMPTY, cliente_nome: r.cliente_nome, contact_id: r.contact_id, company_id: r.company_id, commerciale: r.commerciale });
    setClientQuery(""); setCommLines([{ etichetta: "", base: "fatturato", percentuale: 0 }]);
    setUsaScaglioni(false); setRigheScaglioni(righeDaScaglioni(SCAGLIONI_STANDARD));
    setDialogOpen(true);
  };
  const openEdit = async (r: ServiceClient) => {
    // Reset SUBITO commLines: evita di mostrare le righe del cliente precedente
    // finché la query asincrona del nuovo cliente non risolve.
    const scaglioni = normalizzaScaglioni(r.provvigione_scaglioni);
    setUsaScaglioni(scaglioni.length > 0);
    setRigheScaglioni(righeDaScaglioni(scaglioni.length ? scaglioni : SCAGLIONI_STANDARD));
    setDraft({ ...r }); setClientQuery(""); setCommLines([]); setDialogOpen(true);
    if (r.billing_model === "provvigione") {
      try {
        const { data, error } = await sb().from("aedix_service_commission_lines").select("*").eq("service_client_id", r.id).order("ordine");
        if (error) throw error;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loaded = ((data ?? []) as any[]).map((l) => ({ id: l.id as string, etichetta: (l.etichetta ?? "") as string, base: (l.base ?? "fatturato") as string, percentuale: Number(l.percentuale) || 0 }));
        setCommLines(loaded.length ? loaded : [{ etichetta: "", base: "fatturato", percentuale: 0 }]);
      } catch (e) {
        toast.error("Impossibile caricare le provvigioni", { description: e instanceof Error ? e.message : String(e) });
        setCommLines([{ etichetta: "", base: "fatturato", percentuale: 0 }]);
      }
    }
  };

  const kpi = useMemo(() => {
    const attivi = rows.filter((r) => r.stato === "attivo");
    const mrr = attivi.reduce((s, r) => s + (r.ricorrenza === "mensile" ? Number(r.importo) : r.ricorrenza === "annuale" ? Number(r.importo) / 12 : 0), 0);
    return { attivi: attivi.length, tot: rows.length, mrr };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filtServizio !== "tutti" && r.product_line_id !== filtServizio) return false;
      if (filtStato !== "tutti" && r.stato !== filtStato) return false;
      if (q && !`${r.cliente_nome} ${r.commerciale ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, filtServizio, filtStato]);

  const hasFilters = search.trim() !== "" || filtServizio !== "tutti" || filtStato !== "tutti";
  const canSave = !!draft.cliente_nome?.trim() && !!draft.product_line_id && !!draft.billing_model;
  const apriDaConsole = (serviceClientId: string, cosa: "modifica" | "incassi") => {
    const r = rows.find((x) => x.id === serviceClientId);
    if (!r) { toast.error("Contratto non trovato: ricarica la pagina"); return; }
    if (cosa === "modifica") void openEdit(r);
    else setBillClient({ id: r.id, cliente_nome: r.cliente_nome, importo: r.importo, commerciale: r.commerciale });
  };
  const deltaLead = variazione(totali.lead, totali.leadPrec);
  const kpiMarketing = [
    { l: "Clienti attivi", v: String(totali.clienti) },
    { l: "Lead del mese", v: `${totali.lead.toLocaleString("it-IT")}${deltaLead == null ? "" : ` (${deltaLead > 0 ? "+" : ""}${deltaLead}%)`}` },
    { l: "Appuntamenti", v: totali.appuntamenti.toLocaleString("it-IT") },
    { l: "Vendite chiuse", v: `${totali.vinte.toLocaleString("it-IT")} · ${eur(totali.valoreVinto)}` },
    { l: "Spesa ads", v: eur(totali.spesa) },
    { l: "Provvigioni stimate", v: eur(totali.provvigioni) },
  ];

  if (reportId) {
    const cliente = riepilogo.data?.find((r) => r.service_client_id === reportId);
    return (
      <div className="space-y-5">
        {riepilogo.isLoading ? (
          <Skeleton className="mx-auto h-[70vh] max-w-3xl rounded-xl" />
        ) : !cliente ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border py-14 text-center">
            <p className="text-sm text-muted-foreground">Cliente marketing non trovato.</p>
            <Button variant="outline" size="sm" onClick={() => setSearchParams({})}>Torna alla console</Button>
          </div>
        ) : (
          <ReportClienteMarketing c={cliente} mese={mese} meseLeggibile={meseLeggibile(mese)} meseOggi={meseOggi} oggi={oggi} onMese={setMese} onChiudi={() => setSearchParams({})} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BrandPageHeader
        icon={Users}
        eyebrow="CRM · Servizi"
        title={vista === "marketing" ? "Clienti marketing" : "Clienti-Servizio"}
        subtitle={vista === "marketing"
          ? "Per ogni azienda seguita nel marketing: lead arrivati e seguiti, appuntamenti, vendite, costi per lead e per vendita, venduto e provvigione del mese."
          : "Le relazioni ricorrenti cliente ↔ servizio (retainer, provvigioni, performance). Collega ogni cliente a un contatto CRM o a un'azienda."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Icon-only su mobile: la CTA primaria deve restare leggibile. */}
            <Button variant="outline" onClick={() => setChiusuraOpen(true)} className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Chiudi il mese</span>
            </Button>
            <Button onClick={openNew} className="gap-2 flex-1 sm:flex-none">
              <Plus className="h-4 w-4" /> Nuovo cliente-servizio
            </Button>
          </div>
        }
      >
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${vista === "marketing" ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
          {(vista === "marketing" ? kpiMarketing : [
            { l: "Clienti attivi", v: String(kpi.attivi) },
            { l: "Totale relazioni", v: String(kpi.tot) },
            { l: "Ricorrente ~mese", v: eur(kpi.mrr) },
            { l: "Incassato (mese)", v: eur(billSummary.incassatoMeseTot) },
            { l: "Da incassare", v: eur(billSummary.daIncassareMese) },
          ]).map((k) => (
            <div key={k.l} className="rounded-xl bg-white/[0.07] p-3">
              <div className="text-[11px] uppercase tracking-wide text-blue-50/70">{k.l}</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{k.v}</div>
            </div>
          ))}
        </div>
      </BrandPageHeader>

      <div className="inline-flex rounded-lg border p-0.5">
        {([["marketing", "Clienti marketing"], ["contratti", "Contratti"], ["clienti", "Per cliente"]] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setVista(v)}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {vista === "marketing" ? (
        <ClientiMarketingPanel
          mese={mese}
          meseOggi={meseOggi}
          oggi={oggi}
          schedaId={schedaId}
          onScheda={(id) => setSearchParams(id ? { scheda: id } : {})}
          onNuovoServizio={nuovoServizioPer}
          onMese={setMese}
          righe={riepilogo.data ?? []}
          isLoading={riepilogo.isLoading}
          isError={riepilogo.isError}
          isFetching={riepilogo.isFetching}
          refetch={() => void riepilogo.refetch()}
          onModifica={(id) => apriDaConsole(id, "modifica")}
          onIncassi={(id) => apriDaConsole(id, "incassi")}
          onReport={(id) => setSearchParams({ report: id })}
          onVaiAiContratti={() => setVista("contratti")}
        />
      ) : vista === "clienti" ? <ValoreClientiTable /> : <>

      {/* Toolbar: ricerca + filtri */}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca cliente o commerciale…" className="pl-8" />
          </div>
          <Select value={filtServizio} onValueChange={setFiltServizio}>
            <SelectTrigger className="sm:w-52"><SelectValue placeholder="Servizio" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti i servizi</SelectItem>
              {lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filtStato} onValueChange={setFiltStato}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti gli stati</SelectItem>
              <SelectItem value="attivo">Attivi</SelectItem>
              <SelectItem value="pausa">In pausa</SelectItem>
              <SelectItem value="cessato">Cessati</SelectItem>
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFiltServizio("tutti"); setFiltStato("tutti"); }}>Azzera</Button>
          )}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-amber-500/60" />
              <p className="text-sm text-muted-foreground">Errore nel caricamento dei clienti-servizio.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun cliente-servizio. Aggiungi la prima relazione (es. un'azienda cliente di Marketing Edile).</p>
              <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuovo cliente-servizio</Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Search className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nessun cliente-servizio corrisponde ai filtri.</p>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setFiltServizio("tutti"); setFiltStato("tutti"); }}>Azzera filtri</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[960px]">
                <TableHeader className="[&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500">
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Modello</TableHead>
                    <TableHead className="text-right">Importo</TableHead>
                    <TableHead className="text-right">Incassato</TableHead>
                    <TableHead>Dal</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const line = lineMap.get(r.product_line_id);
                    const bs = billSummary.per.get(r.id);
                    const inRitardo = r.stato === "attivo" && !!bs && bs.dovutoMese > bs.incassatoMese;
                    return (
                      <TableRow key={r.id} className={r.stato === "cessato" ? "opacity-55" : ""}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {r.company_id ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : r.contact_id ? <UserRound className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                            <div className="min-w-0">
                              <span className="font-medium">{r.cliente_nome}</span>
                              {r.commerciale && <div className="text-[11px] text-muted-foreground truncate">comm. {r.commerciale}</div>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: line?.colore ?? "hsl(var(--chart-1))" }} />
                            {line?.nome ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {BILLING.find((b) => b.value === r.billing_model)?.label ?? r.billing_model}
                          {r.billing_model === "provvigione" && normalizzaScaglioni(r.provvigione_scaglioni).length
                            ? ` · a scaglioni ${normalizzaScaglioni(r.provvigione_scaglioni)[0].pct.toLocaleString("it-IT")}% → ${normalizzaScaglioni(r.provvigione_scaglioni).at(-1)?.pct.toLocaleString("it-IT")}%`
                            : r.billing_model === "provvigione" && r.provvigione_pct != null ? ` · ${r.provvigione_pct}%` : ""}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{eur(r.importo)}<span className="text-xs text-muted-foreground">/{r.ricorrenza === "mensile" ? "mese" : r.ricorrenza === "annuale" ? "anno" : "una tantum"}</span></TableCell>
                        <TableCell className="text-right tabular-nums">
                          {bs ? (
                            <span className="inline-flex items-center justify-end gap-1.5">
                              {inRitardo && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Mese corrente non ancora saldato" />}
                              <span className="font-medium">{eur(bs.incassatoTot)}</span>
                            </span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.data_inizio}</TableCell>
                        <TableCell>
                          <button
                            type="button"
                            title="Clic per cambiare stato"
                            onClick={() => setStato.mutate({ id: r.id, stato: r.stato === "attivo" ? "pausa" : "attivo" })}
                            disabled={r.stato === "cessato" || setStato.isPending}
                            className="disabled:cursor-default"
                          >
                            <Badge variant="secondary" className={`border-0 ${STATI[r.stato] ?? ""} ${r.stato !== "cessato" ? "cursor-pointer hover:opacity-80" : ""}`}>{r.stato}</Badge>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBillClient({ id: r.id, cliente_nome: r.cliente_nome, importo: r.importo, commerciale: r.commerciale })} aria-label="Incassi" title="Registro incassi"><Wallet className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)} aria-label="Modifica"><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)} aria-label="Elimina"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      </>}

      {/* Le finestre stanno fuori dal ramo della vista: la scheda contratto e
          l'eliminazione si aprono anche dalla console clienti marketing. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Modifica cliente-servizio" : "Nuovo cliente-servizio"}</DialogTitle>
            <DialogDescription>Collega un cliente a un servizio e definisci il modello di incasso ricorrente.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-1.5">
              <Label>Cliente (nome) *</Label>
              <Input value={draft.cliente_nome ?? ""} onChange={(e) => { setDraft((d) => ({ ...d, cliente_nome: e.target.value })); setClientQuery(e.target.value); }} placeholder="Cerca azienda/contatto o scrivi un nome" />
              {(draft.company_id || draft.contact_id) && (
                <span className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <Link2 className="h-3 w-3" /> collegato {draft.company_id ? "ad azienda + contatto" : "a contatto"}
                  <button className="ml-1 underline" onClick={() => setDraft((d) => ({ ...d, company_id: null, contact_id: null }))}>scollega</button>
                </span>
              )}
              {clientQuery.trim().length >= 2 && clientResults.length > 0 && !draft.company_id && !draft.contact_id && (
                <div className="max-h-40 overflow-y-auto rounded-lg border">
                  {clientResults.map((c) => (
                    <button key={`${c.kind}-${c.id}`} type="button"
                      onClick={() => { void selezionaCliente(c); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted">
                      {c.kind === "company" ? <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> : <UserRound className="h-3.5 w-3.5 text-muted-foreground" />}
                      {c.label} <span className="ml-auto text-[10px] uppercase text-muted-foreground">{c.kind === "company" ? "azienda" : "contatto"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Servizio *</Label>
                <Select value={draft.product_line_id} onValueChange={(v) => setDraft((d) => ({ ...d, product_line_id: v, package_id: null }))}>
                  <SelectTrigger><SelectValue placeholder="Scegli…" /></SelectTrigger>
                  <SelectContent>{lines.map((l) => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Pacchetto</Label>
                <Select value={draft.package_id ?? "none"} onValueChange={(v) => setDraft((d) => ({ ...d, package_id: v === "none" ? null : v }))} disabled={!draft.product_line_id}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— nessuno —</SelectItem>
                    {packages.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome} · {eur(p.prezzo)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Modello</Label>
                <Select value={draft.billing_model} onValueChange={(v) => setDraft((d) => ({ ...d, billing_model: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BILLING.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Ricorrenza</Label>
                <Select value={draft.ricorrenza} onValueChange={(v) => setDraft((d) => ({ ...d, ricorrenza: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RICORRENZE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{draft.billing_model === "provvigione" ? "Importo medio €/mese (stima)" : "Importo €"}</Label>
                <Input type="number" value={draft.importo ?? 0} onChange={(e) => setDraft((d) => ({ ...d, importo: Number(e.target.value) }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Stato</Label>
                <Select value={draft.stato} onValueChange={(v) => setDraft((d) => ({ ...d, stato: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="attivo">Attivo</SelectItem><SelectItem value="pausa">In pausa</SelectItem><SelectItem value="cessato">Cessato</SelectItem></SelectContent>
                </Select>
              </div>
            </div>

            {draft.billing_model === "provvigione" && (
              <div className="inline-flex w-fit rounded-lg border p-0.5 text-xs">
                {([[true, "A scaglioni progressivi"], [false, "Percentuale fissa"]] as const).map(([v, label]) => (
                  <button key={String(v)} type="button" onClick={() => setUsaScaglioni(v)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${usaScaglioni === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {draft.billing_model === "provvigione" && usaScaglioni && (
              <ScaglioniEditor righe={righeScaglioni} onChange={setRigheScaglioni} />
            )}
            {draft.billing_model === "provvigione" && !usaScaglioni && (
              <div className="grid gap-2 rounded-lg border border-dashed p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Provvigioni — % sul fatturato/incassato mensile del cliente (una o più)</div>
                {commLines.map((l, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_4rem_auto] items-center gap-2">
                    <Input value={l.etichetta} onChange={(e) => setCommLines((cs) => cs.map((c, j) => (j === i ? { ...c, etichetta: e.target.value } : c)))} placeholder={i === 0 ? "Etichetta (es. Fatturato)" : "Etichetta (es. Prodotto B)"} className="h-9 min-w-0" />
                    <Select value={l.base} onValueChange={(v) => setCommLines((cs) => cs.map((c, j) => (j === i ? { ...c, base: v } : c)))}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{COMM_BASE.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="relative">
                      <Input type="number" value={l.percentuale} onChange={(e) => setCommLines((cs) => cs.map((c, j) => (j === i ? { ...c, percentuale: Number(e.target.value) } : c)))} className="h-9 pr-5" aria-label="Percentuale" />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => setCommLines((cs) => cs.filter((_, j) => j !== i))} aria-label="Rimuovi riga"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-fit gap-1.5" onClick={() => setCommLines((cs) => [...cs, { etichetta: "", base: "fatturato", percentuale: 0 }])}><Plus className="h-3.5 w-3.5" /> Aggiungi provvigione</Button>
                <p className="text-[11px] text-muted-foreground">Ogni mese, nel registro incassi, inserisci la base (fatturato/incassato del cliente) e il sistema calcola la provvigione dovuta.</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Dal</Label>
                <Input type="date" value={draft.data_inizio ?? ""} onChange={(e) => setDraft((d) => ({ ...d, data_inizio: e.target.value }))} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Commerciale</Label>
              <Input value={draft.commerciale ?? ""} onChange={(e) => setDraft((d) => ({ ...d, commerciale: e.target.value }))} placeholder="Chi ha portato/gestisce il cliente (per le provvigioni)" />
            </div>
            <div className="grid gap-1.5">
              <Label>Note</Label>
              <Textarea rows={2} value={draft.note ?? ""} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder="Note (opzionale)" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            <Button disabled={!canSave || save.isPending} onClick={() => save.mutate(draft)} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{isEdit ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare "{deleteTarget?.cliente_nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              La relazione cliente-servizio verrà eliminata. Gli incassi già registrati per questo cliente non saranno più visibili qui. L'azione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) del.mutate(deleteTarget.id); }}
            >
              {del.isPending ? "Eliminazione…" : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ServiceBillingsDialog client={billClient} open={!!billClient} onOpenChange={(v) => { if (!v) setBillClient(null); }} />

      <ChiusuraMeseDialog
        open={chiusuraOpen}
        onOpenChange={setChiusuraOpen}
        nomiServizi={new Map(lines.map((l) => [l.id, l.nome]))}
      />
    </div>
  );
}

/**
 * CommittenteDetail — la scheda di un'impresa che ti passa lavori in appalto.
 * ──────────────────────────────────────────────────────────────────────────
 * Stessa impostazione della scheda cliente (09/11/2026): un committente e' la
 * stessa riga di `profiles`, quindi anagrafica, diario, email e messaggi sono
 * gli stessi componenti. Cambiano la colonna destra e i numeri in testata:
 *
 *   1. i CONTRATTI con le condizioni concordate (giorni di pagamento, ritenuta,
 *      maggiorazioni, come si fattura, se comprende la fornitura);
 *   2. il LISTINO di quel contratto — la giornata uomo, il viaggio, il mq di
 *      posa — che e' l'unico posto dove quell'accordo esiste scritto;
 *   3. le COMMESSE che quel committente ti passa, i RENDICONTI, i documenti.
 *
 * Il listino sono prezzi: chi non ha «Importi delle commesse» non lo vede, e
 * non lo vede nemmeno interrogando il database (policy su appalto_tariffe).
 * Senza quel permesso anche gli euro del diario, delle commesse e delle fatture
 * spariscono dalla pagina: qui sono nascosti a video, la lettura resta la stessa.
 *
 * Fase 1 del Modulo Appaltatori (28/10/2026) — vedi docs/piano-commessa-appalto.md.
 */
import { useCondizioniDocumento } from "@/hooks/useCondizioniDocumento";
import { datiDaAccordo } from "@/lib/contratti/contrattoCliente";
import { caricaDatiSocietari } from "../../../supabase/functions/_shared/datiSocietari";
import { lazy, Suspense, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays, ChevronDown, CreditCard, Download, ExternalLink, FileSignature, FileText, HardHat,
  Loader2, Mail, MapPin, Pencil, Phone, Plus, Trash2, Upload, Euro, AlertTriangle, ClipboardList, Lock, Receipt, FilePen,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useToast } from "@/hooks/use-toast";
import { logger } from "@/utils/logger";
import { parseDecimalIT, formatDecimalIT } from "@/lib/parseDecimalIT";
import { euro, oggiRoma, type SchedaCliente } from "@/lib/clienti/schedaCliente";
import { azioniCommittente, type NumeriCommittente } from "@/lib/appalto/numeriScheda";
import { contrattoDiOggi } from "@/lib/appalto/contratti";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalAppalto } from "@/components/orders/SalAppalto";
import { CaricaListinoDialog } from "@/components/committenti/CaricaListinoDialog";
import { DocumentiContratto } from "@/components/committenti/DocumentiContratto";
import { ColonnaAnagrafica, useAnagraficaChiusa } from "@/components/clients/ColonnaAnagrafica";
import { ChiediASilvio } from "@/components/silvio/ChiediASilvio";
import { CustomerProfileCard } from "@/components/clients/CustomerProfileCard";
import { CustomerActivityTimeline } from "@/components/clients/CustomerActivityTimeline";
import { CustomerComposeBar } from "@/components/clients/CustomerComposeBar";
import { CustomerBusinessTabs } from "@/components/clients/CustomerBusinessTabs";
import { KpiCard } from "@/components/clients/KpiCard";
import { RigaNumeri, type NumeroScheda } from "@/components/clients/RigaNumeri";
import { CosaFareAdesso } from "@/components/clients/CosaFareAdesso";
import { TestataScheda } from "@/components/clients/TestataScheda";
import { AzioniContattoScheda, AzioniContattoSchedaMobile, IconaScheda, linkWhatsApp } from "@/components/clients/AzioniContattoScheda";
import { AiCallButton } from "@/components/telephony/AiCallButton";
import { PannelloLateraleScheda, type SezioneLaterale } from "@/components/clients/PannelloLateraleScheda";
import { VoceEliminaCliente } from "@/components/clients/VoceEliminaCliente";
import DistanceFromBase from "@/components/customers/DistanceFromBase";
import { ContactCallHistory } from "@/components/telephony/ContactCallHistory";
import { emailVera, useComunicazioniScheda, useContattoCollegato } from "@/hooks/useComunicazioniScheda";
import { useSchermoStretto } from "@/hooks/useSchermoStretto";
import type { ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { queryKeys } from "@/lib/queryKeys";
import { eventiCommittente, type RendicontoNelDiario } from "@/lib/appalto/diarioCommittente";
import { PreventiviCommittente, type PreventivoScheda } from "@/components/committenti/PreventiviCommittente";
import { preventivoDaRichiamare } from "@/lib/preventivi/preventiviCommittente";

const EmailComposeDialog = lazy(() =>
  import("@/pages/azienda/email/components/EmailComposeDialog").then((m) => ({ default: m.EmailComposeDialog }))
);
const AppointmentDialog = lazy(() =>
  import("@/components/appointments/AppointmentDialog").then((m) => ({ default: m.AppointmentDialog }))
);

/* ─── Tipi ─────────────────────────────────────────────────────────── */

interface Committente {
  id: string; business_name: string | null; first_name: string | null; last_name: string;
  email: string; phone: string | null; fiscal_code: string | null; vat_number: string | null;
  address: string | null; city: string | null; postal_code: string | null; province: string | null;
  country: string | null; site_address: string | null; site_city: string | null;
  site_postal_code: string | null; site_province: string | null; notes: string | null;
  created_at: string; salesperson_id: string | null; marketing_contact_id: string | null;
  is_business: boolean | null; customer_type: string | null;
}

interface Contratto {
  id: string; company_id: string; committente_id: string; nome: string;
  valido_dal: string; valido_al: string | null;
  giorni_pagamento: number; ritenuta_pct: number;
  maggiorazione_straordinario_pct: number; maggiorazione_festivo_pct: number;
  modo_fatturazione: "per_commessa" | "mensile_cumulativa";
  regime_iva: "ordinaria" | "reverse_charge";
  include_fornitura: boolean; riferimento_committente: string | null;
  condizioni: string | null; note: string | null; attivo: boolean; created_at?: string | null;
}

interface Tariffa {
  id: string; contratto_id: string; tipo: string; codice: string | null;
  descrizione: string; unita_misura: string; prezzo_unitario: number;
  maggiorazione_straordinario_pct: number | null; maggiorazione_festivo_pct: number | null;
  qualifica: string | null; note: string | null; ordine: number; attivo: boolean;
}

interface Lavoro {
  id: string; order_code: string | null; description: string | null; quote_id: string | null;
  total_amount: number | null; created_at: string;
  work_start_date: string | null; work_end_date: string | null;
  valorizzazione: string | null; tetto_importo: number | null;
  /* La fase vera della commessa sta in `order_statuses`, non nella vecchia
     colonna `orders.status`, che su queste righe contiene ancora le sigle dei
     dati storici ("in_progress") e finiva a video cosi' com'era. */
  fase: { name: string | null; color: string | null } | null;
}

const TIPI_TARIFFA: Array<{ v: string; label: string }> = [
  { v: "manodopera", label: "Manodopera" },
  { v: "trasporto", label: "Trasporto" },
  { v: "lavorazione", label: "Lavorazione" },
  { v: "nolo", label: "Nolo" },
  { v: "materiale", label: "Materiale" },
  { v: "forfait", label: "Forfait" },
];

const UNITA: Array<{ v: string; label: string }> = [
  { v: "ora", label: "ora" }, { v: "giornata", label: "giornata" },
  { v: "uomo_giorno", label: "uomo/giorno" }, { v: "viaggio", label: "viaggio" },
  { v: "km", label: "km" }, { v: "mq", label: "m²" }, { v: "ml", label: "m" },
  { v: "mc", label: "m³" }, { v: "kg", label: "kg" }, { v: "cad", label: "cad" },
  { v: "corpo", label: "a corpo" },
];

const etichettaUnita = (v: string) => UNITA.find((u) => u.v === v)?.label ?? v;
const etichettaTipo = (v: string) => TIPI_TARIFFA.find((t) => t.v === v)?.label ?? v;

/** Le date si scrivono come le legge chi le legge: 07/09/2026, non 2026-09-07. */
const giornoIT = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return g && m && a ? `${g}/${m}/${a}` : iso;
};

const nomeCommittente = (c: Committente | null | undefined) =>
  c?.business_name?.trim() || [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || "Committente";

const SEZIONI: SezioneLaterale[] = [
  { key: "contratti", icon: FileSignature, label: "Contratti" },
  { key: "listino", icon: Euro, label: "Listino concordato" },
  { key: "preventivi", icon: FilePen, label: "Preventivi" },
  { key: "commesse", icon: ClipboardList, label: "Commesse" },
  { key: "rendiconti", icon: Receipt, label: "Rendiconti", larga: true },
  { key: "documenti", icon: FileText, label: "Documenti / Fatture" },
  { key: "email", icon: Mail, label: "Email" },
  { key: "appuntamenti", icon: CalendarDays, label: "Appuntamenti" },
];

/* ─── Pagina ───────────────────────────────────────────────────────── */

export default function CommittenteDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const permessi = usePermissions();

  const companyId = effectiveCompany?.id ?? null;
  const puoModificare = permessi.isAdmin || permessi.canEditCustomers;
  const vedeImporti = permessi.canViewOrderAmounts;

  const condizioniAzienda = useCondizioniDocumento("appalto");
  const [contrattoSelId, setContrattoSelId] = useState<string | null>(null);
  const [tariffaForm, setTariffaForm] = useState<Partial<Tariffa> | null>(null);
  const [prezzoGrezzo, setPrezzoGrezzo] = useState("");
  const [daEliminare, setDaEliminare] = useState<{ tipo: "contratto" | "tariffa"; id: string; nome: string } | null>(null);
  // Sugli schermi larghi il pannello parte aperto sui contratti: e' il motivo per cui si apre questa scheda.
  const [sezione, setSezione] = useState<string | null>(() =>
    typeof window !== "undefined" && window.matchMedia?.("(min-width: 1280px)").matches ? "contratti" : null);
  const schermoStretto = useSchermoStretto();
  const [anagraficaChiusa, setAnagraficaChiusa] = useAnagraficaChiusa();
  // Da telefono il pannello a destra non c'e': un numero porta alla sua scheda, in fondo alla pagina.
  const apriSezione = (chiave: string) => {
    setSezione(chiave);
    if (schermoStretto) requestAnimationFrame(() => document.getElementById("sezioni-committente")?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
  };
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContext, setComposeContext] = useState<ComposeContext>({ mode: "new" });
  const [appuntamentoOpen, setAppuntamentoOpen] = useState(false);
  const [chiamataAi, setChiamataAi] = useState(false);
  const [caricaListino, setCaricaListino] = useState(false);
  const [vediFuoriUso, setVediFuoriUso] = useState(false);

  /* ── Dati ── */

  const committente = useQuery({
    // Non ["committente", …]: la pagina del contratto usa quella chiave con meno colonne,
    // e dalla cache arriverebbe una riga senza customer_type e created_at.
    queryKey: ["committente-scheda", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Committente | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, business_name, first_name, last_name, email, phone, fiscal_code, vat_number, address, city, postal_code, province, country, site_address, site_city, site_postal_code, site_province, notes, created_at, salesperson_id, marketing_contact_id, is_business, customer_type")
        .eq("id", id!)
        .eq("company_id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as Committente) ?? null;
    },
  });

  // Stessa lettura e stessa chiave della scheda cliente: fatture, appuntamenti e
  // commesse del diario. La lettura tiene i permessi di chi guarda.
  const { data: scheda } = useQuery({
    queryKey: ["scheda-cliente", id, companyId],
    enabled: !!id && !!companyId && !!committente.data,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("scheda_cliente", { p_customer_id: id, p_company_id: companyId });
      if (error) throw new Error("Non riesco a leggere fatture e appuntamenti del committente: riprova tra poco.");
      return (data ?? null) as SchedaCliente | null;
    },
  });
  const comunicazioni = useComunicazioniScheda(id, companyId ?? undefined, committente.data?.email);
  const { data: contattoCollegato } = useContattoCollegato(committente.data?.marketing_contact_id);

  const contratti = useQuery({
    queryKey: ["appalto-contratti", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Contratto[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_contratti")
        .select("*")
        .eq("company_id", companyId)
        .eq("committente_id", id)
        .order("valido_dal", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Contratto[];
    },
  });

  const contrattoAttivo = useMemo(() => {
    const lista = contratti.data ?? [];
    if (contrattoSelId) return lista.find((c) => c.id === contrattoSelId) ?? contrattoDiOggi(lista);
    return contrattoDiOggi(lista);
  }, [contratti.data, contrattoSelId]);

  const tariffe = useQuery({
    queryKey: ["appalto-tariffe", contrattoAttivo?.id],
    // Senza il permesso sugli importi la policy restituisce zero righe: non la
    // interroghiamo nemmeno, cosi' la pagina dice perche' invece di mostrare
    // un listino vuoto che sembra un errore.
    enabled: !!contrattoAttivo?.id && vedeImporti,
    queryFn: async (): Promise<Tariffa[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_tariffe")
        .select("*")
        .eq("contratto_id", contrattoAttivo!.id)
        .order("ordine", { ascending: true })
        .order("descrizione", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Tariffa[];
    },
  });

  const lavori = useQuery({
    queryKey: ["appalto-lavori", companyId, id],
    enabled: !!companyId && !!id,
    queryFn: async (): Promise<Lavoro[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_code, description, quote_id, total_amount, work_start_date, work_end_date, valorizzazione, tetto_importo, created_at, fase:order_statuses!orders_current_status_id_fkey(name, color)")
        .eq("company_id", companyId!)
        .eq("customer_id", id!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Lavoro[];
    },
  });

  // I preventivi fatti al committente (10/11/2026): quelli legati alla sua riga e, se ne ha uno, al suo contatto CRM.
  const marketingContactId = committente.data?.marketing_contact_id ?? null;
  const preventivi = useQuery({
    queryKey: ["preventivi-committente", companyId, id, marketingContactId],
    enabled: !!companyId && !!id && committente.isSuccess,
    queryFn: async (): Promise<PreventivoScheda[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any).from("quotes")
        .select("id, quote_number, title, total, status, created_at, sent_at, expires_at, signed_at, revision_number, parent_quote_id, refused_motivo, refused_reason, variante_id, version, source")
        .eq("company_id", companyId).is("deleted_at", null);
      q = marketingContactId ? q.or(`customer_id.eq.${id},contact_id.eq.${marketingContactId}`) : q.eq("customer_id", id);
      const { data, error } = await q.order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as PreventivoScheda[];
    },
  });

  const numeriCommittente = useQuery({
    queryKey: ["appalto-sal", id, "numeri-scheda", companyId],
    enabled: !!companyId && !!id && vedeImporti,
    staleTime: 60_000,
    queryFn: async (): Promise<NumeriCommittente> => {
      const { data, error } = await (supabase as any).rpc("scheda_committente_numeri", { p_committente_id: id, p_company_id: companyId });
      if (error) throw error;
      return data as NumeriCommittente;
    },
  });

  // Solo i fatti da mettere nel diario. Senza permesso sugli importi non si leggono, come il pannello.
  const rendicontiDiario = useQuery({
    queryKey: ["appalto-sal", id, "diario"],
    enabled: !!companyId && !!id && vedeImporti,
    staleTime: 60_000,
    queryFn: async (): Promise<RendicontoNelDiario[]> => {
      const { data, error } = await (supabase as any)
        .from("appalto_sal")
        .select("id, numero, periodo_dal, periodo_al, inviato_at, accettato_il, accettato_da_nome")
        .eq("company_id", companyId)
        .eq("committente_id", id);
      if (error) throw error;
      return (data ?? []) as RendicontoNelDiario[];
    },
  });

  /* ── Scritture ── */

  // Il PDF dell'accordo (09/11/2026): come il contratto di subappalto, col listino in Allegato A.
  const pdfAccordo = useMutation({
    mutationFn: async () => {
      if (!contrattoAttivo || !committente.data) return;
      const [{ contrattoClienteBlob }, societari, listino] = await Promise.all([
        import("@/components/contratti/ContrattoClientePDF"),
        caricaDatiSocietari(supabase, companyId),
        (supabase as any).from("appalto_tariffe").select("*").eq("contratto_id", contrattoAttivo.id).order("ordine", { ascending: true }),
      ]);
      if (listino.error) throw listino.error;
      const blob = await contrattoClienteBlob(datiDaAccordo({ accordo: contrattoAttivo, committente: committente.data, tariffe: listino.data ?? [], societari, companyId, vessatorie: condizioniAzienda.clausole.filter((x) => x.vessatoria).map((x) => x.titolo.trim()) }));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contratto ${contrattoAttivo.nome}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: (e) => toast({ title: "PDF non generato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" }),
  });

  const salvaTariffa = useMutation({
    mutationFn: async (f: Partial<Tariffa>) => {
      const riga = {
        company_id: companyId,
        contratto_id: contrattoAttivo!.id,
        tipo: f.tipo ?? "manodopera",
        codice: f.codice?.trim() || null,
        descrizione: (f.descrizione ?? "").trim(),
        unita_misura: f.unita_misura ?? "ora",
        prezzo_unitario: parseDecimalIT(prezzoGrezzo),
        maggiorazione_straordinario_pct: f.maggiorazione_straordinario_pct ?? null,
        maggiorazione_festivo_pct: f.maggiorazione_festivo_pct ?? null,
        qualifica: f.qualifica?.trim() || null,
        note: f.note || null,
        ordine: Number(f.ordine ?? 0),
        attivo: f.attivo !== false,
      };
      if (f.id) {
        const { error } = await (supabase as any).from("appalto_tariffe").update(riga).eq("id", f.id);
        if (error) throw error;
        return;
      }
      const { error } = await (supabase as any).from("appalto_tariffe").insert(riga);
      if (error) throw error;
    },
    onSuccess: () => {
      setTariffaForm(null);
      setPrezzoGrezzo("");
      queryClient.invalidateQueries({ queryKey: ["appalto-tariffe", contrattoAttivo?.id] });
      toast({ title: "Tariffa salvata" });
    },
    onError: (e) => {
      logger.error("salvaTariffa", e);
      toast({ title: "Tariffa non salvata", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  const elimina = useMutation({
    mutationFn: async (x: { tipo: "contratto" | "tariffa"; id: string }) => {
      const tabella = x.tipo === "contratto" ? "appalto_contratti" : "appalto_tariffe";
      const { error } = await (supabase as any).from(tabella).delete().eq("id", x.id);
      if (error) throw error;
    },
    onSuccess: (_d, x) => {
      setDaEliminare(null);
      if (x.tipo === "contratto") {
        setContrattoSelId(null);
        queryClient.invalidateQueries({ queryKey: ["appalto-contratti", companyId, id] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["appalto-tariffe", contrattoAttivo?.id] });
      }
      toast({ title: x.tipo === "contratto" ? "Contratto eliminato" : "Tariffa eliminata" });
    },
    onError: (e) => {
      logger.error("elimina appalto", e);
      toast({ title: "Non eliminato", description: e instanceof Error ? e.message : "Riprova", variant: "destructive" });
    },
  });

  /* ── Render ── */

  if (committente.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const c = committente.data;
  if (!c) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Committente non trovato. <Link className="underline" to="/azienda/clienti?tipo=committenti">Torna all'elenco</Link>
        </AlertDescription>
      </Alert>
    );
  }

  if (c.customer_type !== "appaltatore") {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-2">
          <span>Questo contatto è un cliente, non un committente.</span>
          <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/clienti/${c.id}`)}>
            Apri la scheda cliente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const nome = nomeCommittente(c);
  const iniziali = (nome.match(/\b\w/g) ?? []).slice(0, 2).join("").toUpperCase() || "?";
  const referente = [c.first_name, c.last_name].map((x) => (x ?? "").trim()).filter((x) => x && x !== "—" && x !== "-").join(" ");
  const email = emailVera(c.email);
  const elencoContratti = contratti.data ?? [];
  const elencoLavori = lavori.data ?? [];
  const contrattoInCorso = contrattoDiOggi(elencoContratti);
  const apriEmail = () => {
    setComposeContext({ mode: "new", initialTo: email ? [email] : undefined, initialSubject: undefined, storicoScheda: true });
    setComposeOpen(true);
  };
  const apriAppuntamento = () => setAppuntamentoOpen(true);
  const nuovoContratto = () => navigate(`/azienda/committenti/${id}/contratto/nuovo`);
  const puoCreareLavori = permessi.isAdmin || permessi.canEditOrders;
  const puoPreventivi = permessi.isAdmin || permessi.canEditPreventivi;
  const nuovoPreventivo = () => navigate(`/azienda/marketing/preventivi/nuovo?customer_id=${c.id}`);
  const nuovoLavoro = () => navigate(`/azienda/ordini/nuovo-lavoro-appaltatore?committente=${c.id}`);
  const pulsantiCrea = (
    <>
      {puoPreventivi && (
        <Button variant="outline" size="sm" className="h-9 gap-1.5 max-md:flex-1" onClick={nuovoPreventivo}>
          <FilePen className="h-3.5 w-3.5" /> Nuovo preventivo
        </Button>
      )}
      {puoCreareLavori && (
        <Button variant="outline" size="sm" className="h-9 gap-1.5 max-md:flex-1" onClick={nuovoLavoro}>
          <ClipboardList className="h-3.5 w-3.5" /> Nuovo lavoro
        </Button>
      )}
      {puoModificare && (
        <Button size="sm" className="h-9 gap-1.5 max-md:flex-1" onClick={nuovoContratto}>
          <Plus className="h-3.5 w-3.5" /> Nuovo contratto
        </Button>
      )}
    </>
  );
  const tariffeInUso = (tariffe.data ?? []).filter((t) => t.attivo);
  const tariffeFuoriUso = (tariffe.data ?? []).filter((t) => !t.attivo);
  const conteggi: Record<string, number | undefined> = {
    contratti: elencoContratti.length,
    listino: vedeImporti ? tariffeInUso.length : undefined,
    preventivi: preventivi.data?.length,
    commesse: elencoLavori.length,
    documenti: scheda?.fatture.length ?? 0,
    appuntamenti: scheda?.appuntamenti.length ?? 0,
  };
  const sezioniConNumeri = SEZIONI.map((s) => ({ ...s, conteggio: conteggi[s.key] }));

  const menuCommittente = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Altre azioni">
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {c.phone && (
          <>
            <DropdownMenuItem onClick={() => setChiamataAi(true)}>
              <Phone className="mr-2 h-3.5 w-3.5" /> Chiama con agente AI
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {/* Solo a elenco letto: finche' non si sa quante commesse ha, zero non vuol dire nessuna,
            e le commesse resterebbero senza committente. */}
        {lavori.isSuccess && (
          <VoceEliminaCliente
            id={c.id}
            commesse={elencoLavori.length}
            chi="committente"
            tornaA="/azienda/clienti?tipo=committenti"
            avviso={elencoContratti.length > 0 ? "Spariscono anche i suoi contratti e i listini." : undefined}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const pannelloContratti = (
    <div className="space-y-3 p-1">
      {puoModificare && (
        <Button size="sm" variant="outline" className="w-full" onClick={nuovoContratto}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo contratto
        </Button>
      )}
      {contratti.isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : elencoContratti.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nessun contratto. È qui che si scrivono le condizioni concordate e il listino:
          senza, una commessa in appalto non sa a quanto fatturarti il lavoro.
        </p>
      ) : (
        <>
          {elencoContratti.length > 1 && (
            <Select value={contrattoAttivo?.id ?? ""} onValueChange={setContrattoSelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {elencoContratti.map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    {k.nome} · dal {giornoIT(k.valido_dal)}{k.attivo ? "" : " (non attivo)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {contrattoAttivo && (
            <>
              <div>
                <p className="break-words font-semibold text-slate-900">{contrattoAttivo.nome}</p>
                <p className="text-xs text-slate-500">
                  Dal {giornoIT(contrattoAttivo.valido_dal)}
                  {contrattoAttivo.valido_al ? ` al ${giornoIT(contrattoAttivo.valido_al)}` : " — senza scadenza"}
                </p>
                <div className="mt-2 flex items-center gap-1">
                  <Button variant="outline" size="sm" className="gap-1" disabled={pdfAccordo.isPending} onClick={() => pdfAccordo.mutate()}>
                    {pdfAccordo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
                  </Button>
                  {puoModificare && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Modifica contratto" onClick={() => navigate(`/azienda/committenti/${id}/contratto/${contrattoAttivo.id}`)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Elimina contratto"
                        onClick={() => setDaEliminare({ tipo: "contratto", id: contrattoAttivo.id, nome: contrattoAttivo.nome })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <Voce t="Pagamento" v={`${contrattoAttivo.giorni_pagamento} gg`} />
                <Voce t="Ritenuta a garanzia" v={`${formatDecimalIT(contrattoAttivo.ritenuta_pct, { minDecimals: 0 })} %`} />
                <Voce t="Straordinario" v={`+${formatDecimalIT(contrattoAttivo.maggiorazione_straordinario_pct, { minDecimals: 0 })} %`} />
                <Voce t="Festivo" v={`+${formatDecimalIT(contrattoAttivo.maggiorazione_festivo_pct, { minDecimals: 0 })} %`} />
                <Voce t="Fatturazione" v={contrattoAttivo.modo_fatturazione === "mensile_cumulativa" ? "Mensile, tutte le commesse" : "Per commessa"} />
                <Voce t="Fornitura" v={contrattoAttivo.include_fornitura ? "Compresa" : "Sola manodopera"} />
                <Voce t="IVA" v={contrattoAttivo.regime_iva === "reverse_charge" ? "Reverse charge (N6.3)" : "Ordinaria"} />
                {contrattoAttivo.riferimento_committente && (
                  <Voce t="Loro riferimento" v={contrattoAttivo.riferimento_committente} />
                )}
              </dl>
              {vedeImporti && companyId && (
                <DocumentiContratto contrattoId={contrattoAttivo.id} committenteId={c.id} companyId={companyId} puoModificare={puoModificare} />
              )}
              {contrattoAttivo.condizioni && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Condizioni</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{contrattoAttivo.condizioni}</p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  const pannelloListino = (
    <div className="space-y-2 p-1">
      {!vedeImporti ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Lock className="h-4 w-4 shrink-0" />
          I prezzi concordati col committente li vede chi ha il permesso «Importi delle commesse».
        </p>
      ) : !contrattoAttivo ? (
        <p className="text-sm text-slate-500">Prima serve un contratto: il listino appartiene a quello.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs text-slate-500">{contrattoAttivo.nome}</p>
            {puoModificare && (
              <div className="flex shrink-0 gap-1">
              <Button size="sm" variant="outline" onClick={() => setCaricaListino(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Carica
              </Button>
              <Button size="sm" variant="outline"
                onClick={() => { setTariffaForm({ tipo: "manodopera", unita_misura: "ora", attivo: true, ordine: (tariffe.data?.length ?? 0) }); setPrezzoGrezzo(""); }}>
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Tariffa
              </Button>
              </div>
            )}
          </div>
          {tariffe.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : tariffeInUso.length === 0 && tariffeFuoriUso.length === 0 ? (
            <p className="text-sm text-slate-500">
              Listino vuoto. Aggiungi quello che a questo committente fatturi davvero: la giornata
              uomo, il viaggio, il metro quadro di posa. Se ce l'hai in Excel, caricalo.
            </p>
          ) : (
            <>
            <ul className="divide-y">
              {(vediFuoriUso ? [...tariffeInUso, ...tariffeFuoriUso] : tariffeInUso).map((t) => (
                <li key={t.id} className={cn("flex items-center gap-2 py-2", !t.attivo && "opacity-50")}>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-900">{t.descrizione}</p>
                    <p className="text-xs text-slate-500">
                      {[etichettaTipo(t.tipo), etichettaUnita(t.unita_misura), t.qualifica, t.codice].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{euro(t.prezzo_unitario, true)}</span>
                  {puoModificare && (
                    <div className="flex shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Modifica tariffa"
                        onClick={() => { setTariffaForm(t); setPrezzoGrezzo(formatDecimalIT(t.prezzo_unitario)); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Elimina tariffa"
                        onClick={() => setDaEliminare({ tipo: "tariffa", id: t.id, nome: t.descrizione })}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {tariffeFuoriUso.length > 0 && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setVediFuoriUso(!vediFuoriUso)}>
                {vediFuoriUso ? "Nascondi le voci fuori uso" : `Mostra ${tariffeFuoriUso.length} ${tariffeFuoriUso.length === 1 ? "voce fuori uso" : "voci fuori uso"}`}
              </Button>
            )}
            </>
          )}
        </>
      )}
    </div>
  );

  const pannelloCommesse = lavori.isLoading ? (
    <Skeleton className="h-24 w-full" />
  ) : elencoLavori.length === 0 ? (
    <div className="flex flex-col items-center py-8 text-center">
      <HardHat className="mb-2 h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-slate-500">Nessun lavoro da questo committente.</p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to={`/azienda/ordini/nuovo-lavoro-appaltatore?committente=${id}`}>Nuovo lavoro</Link>
      </Button>
    </div>
  ) : (
    <div className="space-y-1">
      {elencoLavori.map((l) => (
        <button key={l.id} type="button" className="group w-full rounded-md p-2.5 text-left transition-colors hover:bg-muted/50" onClick={() => navigate(`/azienda/ordini/${l.id}`)}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="break-all text-sm font-medium">{l.order_code || "—"}</p>
            {vedeImporti && (
              <span className="whitespace-nowrap text-sm font-medium tabular-nums">
                {/* Un lavoro a misura non vale zero: vale quello che
                    rendiconti. Scriverci «€ 0,00» farebbe sembrare
                    inutile un cantiere di tre mesi. */}
                {l.valorizzazione === "a_misura"
                  ? <span className="font-normal text-slate-500">a misura</span>
                  : Number(l.total_amount) > 0
                    ? euro(l.total_amount, true)
                    : l.tetto_importo
                      ? <span className="font-normal text-slate-500">max {euro(l.tetto_importo, true)}</span>
                      : "—"}
              </span>
            )}
          </div>
          {l.description && <p className="line-clamp-1 text-xs text-muted-foreground">{l.description}</p>}
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {l.fase?.name && (
              <Badge variant="outline" className="gap-1 text-xs font-normal">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: l.fase.color ?? undefined }} />
                {l.fase.name}
              </Badge>
            )}
            <span className="truncate">{[l.work_start_date, l.work_end_date].filter(Boolean).map(giornoIT).join(" → ")}</span>
            <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </button>
      ))}
    </div>
  );

  const nC = numeriCommittente.data;
  const inAttesa = numeriCommittente.isLoading ? "…" : "—";
  const quanto = (v: number | null | undefined) => (v == null ? inAttesa : euro(Number(v)));
  // Finché i numeri non ci sono, la riga sotto non deve dire niente: «rendiconti chiusi» accanto a «—» sembrerebbe zero.
  const sotto = (testo: string) => (numeriCommittente.isError ? "non disponibile, riprova" : nC ? testo : undefined);
  const numeroContratto = {
    label: "Contratto", icon: FileSignature, iconColor: "text-orange-500", largo: true,
    value: contratti.isLoading ? "…" : contrattoInCorso?.nome ?? "Nessuno",
    sub: !contrattoInCorso ? "Da scrivere"
      : [contrattoInCorso.valido_al ? `scade il ${giornoIT(contrattoInCorso.valido_al)}` : "senza scadenza",
         elencoContratti.length > 1 ? `${elencoContratti.length} contratti` : ""].filter(Boolean).join(" · "),
    onClick: () => apriSezione("contratti"),
  };
  const commesseTesto = elencoLavori.length === 1 ? "1 commessa" : `${elencoLavori.length} commesse`;
  const numeri: Array<NumeroScheda & { icon: typeof Euro; iconColor: string }> = vedeImporti ? [
    numeroContratto,
    { label: "Rendicontato", icon: ClipboardList, iconColor: "text-blue-500", value: quanto(nC?.rendicontato), sub: lavori.isLoading ? undefined : commesseTesto, onClick: () => apriSezione("commesse") },
    {
      label: "Da fatturare", icon: Receipt, iconColor: "text-indigo-500", value: quanto(nC?.da_fatturare),
      sub: sotto(Number(nC?.da_rendicontare ?? 0) > 0 ? `+ ${euro(Number(nC?.da_rendicontare))} da rendicontare` : "rendiconti chiusi"),
      onClick: () => apriSezione("rendiconti"),
    },
    {
      label: "Da incassare", icon: CreditCard, iconColor: Number(nC?.scaduto ?? 0) > 0 ? "text-red-500" : "text-emerald-500", value: quanto(nC?.da_incassare),
      sub: nC && nC.da_incassare == null ? "serve il permesso sulla fatturazione" : sotto(Number(nC?.scaduto ?? 0) > 0 ? `di cui ${euro(Number(nC?.scaduto))} scaduti` : "fatture emesse"),
      tono: Number(nC?.scaduto ?? 0) > 0 ? "rosso" : undefined,
      onClick: () => apriSezione("documenti"),
    },
    { label: "Ritenute", icon: Euro, iconColor: "text-violet-500", value: quanto(nC?.ritenute), sub: sotto("trattenute a garanzia"), onClick: () => apriSezione("rendiconti") },
  ] : [
    numeroContratto,
    { label: "Pagamento", icon: CreditCard, iconColor: "text-emerald-500", value: contrattoInCorso ? `${contrattoInCorso.giorni_pagamento} gg` : "—", sub: contrattoInCorso ? `ritenuta ${formatDecimalIT(contrattoInCorso.ritenuta_pct, { minDecimals: 0 })} %` : "Dal contratto", onClick: () => apriSezione("contratti") },
    { label: "Commesse", icon: ClipboardList, iconColor: "text-blue-500", value: lavori.isLoading ? "…" : elencoLavori.length, sub: elencoLavori.length === 0 ? "Nessun lavoro" : `l'ultima del ${new Date(elencoLavori[0].created_at).toLocaleDateString("it-IT")}`, onClick: () => apriSezione("commesse") },
    { label: "Listino", icon: Euro, iconColor: "text-violet-500", value: "—", sub: "Prezzi riservati", onClick: () => apriSezione("listino") },
  ];
  const oggi = oggiRoma();
  const daRichiamare = preventivoDaRichiamare(preventivi.data ?? [], oggi, vedeImporti);
  const azioni = [
    ...azioniCommittente(vedeImporti ? nC : null, contrattoInCorso, oggi, !contratti.isLoading && !contratti.isError),
    ...(daRichiamare ? [daRichiamare] : []),
  ];
  // da_incassare null = non si possono leggere le fatture: «—» e nessun sollecito, non «€ 0».
  const apriSollecito = (oggetto: string, testo: string) => {
    const html = testo.split("\n\n").map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</p>`).join("");
    setComposeContext({ mode: "new", initialTo: email ? [email] : undefined, initialSubject: oggetto, initialBodyHtml: html, storicoScheda: true });
    setComposeOpen(true);
  };

  const contenutoSezione = (chiave: string) => {
    if (chiave === "contratti") return pannelloContratti;
    if (chiave === "listino") return pannelloListino;
    if (chiave === "commesse") return pannelloCommesse;
    if (chiave === "preventivi") {
      return (
        <PreventiviCommittente
          committenteId={c.id}
          companyId={companyId ?? ""}
          preventivi={preventivi.data ?? []}
          caricamento={preventivi.isLoading}
          errore={preventivi.isError}
          commesse={elencoLavori}
          oggi={oggi}
          vedeImporti={vedeImporti}
          puoPreventivi={puoPreventivi}
          puoCommesse={puoCreareLavori}
        />
      );
    }
    if (chiave === "rendiconti") {
      if (!vedeImporti) {
        return (
          <p className="flex items-center gap-2 p-1 text-sm text-slate-500">
            <Lock className="h-4 w-4 shrink-0" />
            I rendiconti al committente li vede chi ha il permesso «Importi delle commesse».
          </p>
        );
      }
      return (
        <SalAppalto
          committenteId={c.id}
          modoFatturazione={contrattoAttivo?.modo_fatturazione ?? null}
          puoModificare={puoModificare}
          vedeImporti={vedeImporti}
          senzaCornice
        />
      );
    }
    return (
      <CustomerBusinessTabs
        customerId={c.id}
        companyId={companyId ?? ""}
        customerFullName={nome}
        customerEmail={email}
        orders={scheda?.ordini ?? []}
        preventivi={[]}
        tickets={[]}
        rapportini={[]}
        fatture={scheda?.fatture ?? []}
        appuntamenti={scheda?.appuntamenti ?? []}
        rate={[]}
        anagraficaCollegata={scheda?.anagrafica ?? null}
        defaultTab={chiave}
        onCreateAppointment={apriAppuntamento}
        perCommittente
        nascondiImporti={!vedeImporti}
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Testata: la stessa della scheda cliente */}
      <div className="rounded-2xl border bg-card p-3 shadow-sm md:p-4">
        <TestataScheda
          onIndietro={() => navigate("/azienda/clienti?tipo=committenti")}
          etichettaIndietro="Torna ai committenti"
          iniziali={iniziali}
          coloreAvatar="bg-gradient-to-br from-slate-800 to-slate-500"
          nome={nome}
          accantoAlNome={
            <>
              <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">Committente</Badge>
              {menuCommittente}
            </>
          }
          contatti={
            <>
              {referente && <span>Referente: <span className="font-medium text-foreground">{referente}</span></span>}
              {email && (
                <a href={`mailto:${email}`} className="inline-flex min-w-0 max-w-full items-center gap-1 transition-colors hover:text-primary">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{email}</span>
                </a>
              )}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-primary">
                  <Phone className="h-3 w-3 shrink-0" />
                  {c.phone}
                </a>
              )}
              {(c.city || c.address) && (
                <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" />{c.city || c.address}</span>
              )}
              <DistanceFromBase address={c.address} city={c.city} province={c.province} className="text-xs" />
            </>
          }
          azioni={
            <>
              <IconaScheda etichetta="Chiedi a Silvio">
                <ChiediASilvio
                  soloIcona
                  size="icon"
                  className="h-9 w-9"
                  ask={`Analizza il committente ${nome}: contratti e listino, lavori in corso, rendiconti da fare, fatture da incassare e ritenute a garanzia. Cosa devo sapere?`}
                />
              </IconaScheda>
              <AzioniContattoScheda
                telefono={c.phone}
                nome={nome}
                contactId={c.marketing_contact_id ?? undefined}
                email={email}
                onEmail={apriEmail}
                onAppuntamento={apriAppuntamento}
              />
              <div className="ml-2 flex items-center gap-1.5">{pulsantiCrea}</div>
            </>
          }
        />
        {c.phone && (
          <AiCallButton senzaPulsante aperto={chiamataAi} onAperto={setChiamataAi} phone={c.phone} contactId={c.marketing_contact_id ?? undefined} contactName={nome} />
        )}

        <AzioniContattoSchedaMobile telefono={c.phone} email={email} onEmail={apriEmail} onAppuntamento={apriAppuntamento} />

        <div className="mt-1.5 flex gap-1.5 md:hidden">{pulsantiCrea}</div>

        <div className="mt-2 grid grid-cols-2 gap-2 md:hidden">
          {numeri.map((n) => (
            <KpiCard key={n.label} icon={n.icon} iconColor={n.iconColor} label={n.label} value={n.value} subtext={n.sub} tono={n.tono} onClick={n.onClick} />
          ))}
        </div>
        <RigaNumeri numeri={numeri} />
        <CosaFareAdesso
          azioni={azioni}
          cliente={nome}
          azienda={effectiveCompany?.name ?? ""}
          email={email}
          telefono={c.phone}
          waHref={linkWhatsApp(c.phone)}
          onEmail={apriSollecito}
          onApri={apriSezione}
          pannelloScaduto="documenti"
          etichettaScaduto="Vedi fatture"
        />
      </div>

      <div className="flex flex-col gap-3 lg:h-[calc(100dvh-14rem)] lg:flex-row lg:gap-4">
        <ColonnaAnagrafica chiusa={anagraficaChiusa} onApri={() => setAnagraficaChiusa(false)}>
          <CustomerProfileCard customer={c} linkedContact={contattoCollegato} onSaved={() => committente.refetch()} perCommittente onChiudi={() => setAnagraficaChiusa(true)} />
          <ContactCallHistory contactId={c.marketing_contact_id ?? undefined} phone={c.phone} name={nome} showActions={false} />
        </ColonnaAnagrafica>

        <div className="order-1 flex min-h-[50vh] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm lg:order-none lg:min-h-0">
          <div className="min-h-0 flex-1 overflow-hidden">
            <CustomerActivityTimeline
              customerId={c.id}
              orders={scheda?.ordini ?? []}
              tickets={scheda?.ticket ?? []}
              appuntamenti={scheda?.appuntamenti ?? []}
              fatture={scheda?.fatture ?? []}
              emailConversations={comunicazioni.emailConversazioni as unknown as Parameters<typeof CustomerActivityTimeline>[0]["emailConversations"]}
              diaryMessages={comunicazioni.note}
              messaggi={comunicazioni.messaggi}
              customerCreatedAt={c.created_at}
              perCommittente
              nascondiImporti={!vedeImporti}
              eventiExtra={eventiCommittente(elencoContratti, rendicontiDiario.data ?? [], apriSezione)}
            />
          </div>
          <CustomerComposeBar customerId={c.id} customerEmail={email} customerPhone={c.phone} />
        </div>

        <PannelloLateraleScheda sezioni={sezioniConNumeri} attiva={sezione} onCambia={setSezione}>
          {/* Sullo schermo stretto le sezioni stanno nelle schede qui sotto: due copie farebbero tutte le letture due volte. */}
          {sezione && !schermoStretto ? contenutoSezione(sezione) : null}
        </PannelloLateraleScheda>
      </div>

      {schermoStretto && (
        <Tabs id="sezioni-committente" value={sezione ?? "contratti"} onValueChange={setSezione} className="scroll-mt-16 lg:hidden">
          <TabsList className="flex h-auto w-full justify-start overflow-x-auto">
            {SEZIONI.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="shrink-0 px-2 py-2 text-xs">{s.label}</TabsTrigger>
            ))}
          </TabsList>
          {SEZIONI.map((s) => (
            <TabsContent key={s.key} value={s.key} className="rounded-2xl border bg-card p-2 shadow-sm">
              {contenutoSezione(s.key)}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* ─── Dialogo tariffa ─── */}
      <Dialog open={!!tariffaForm} onOpenChange={(o) => !o && setTariffaForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tariffaForm?.id ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
            <DialogDescription>Il prezzo che fatturi a questo committente, non il tuo costo.</DialogDescription>
          </DialogHeader>
          {tariffaForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Descrizione</Label>
                <Input value={tariffaForm.descrizione ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, descrizione: e.target.value })}
                  placeholder="Giornata uomo — operaio specializzato" />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={tariffaForm.tipo ?? "manodopera"} onValueChange={(v) => setTariffaForm({ ...tariffaForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPI_TARIFFA.map((t) => <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Unità di misura</Label>
                <Select value={tariffaForm.unita_misura ?? "ora"} onValueChange={(v) => setTariffaForm({ ...tariffaForm, unita_misura: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITA.map((u) => <SelectItem key={u.v} value={u.v}>{u.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prezzo</Label>
                {/* Testo grezzo e parse all'uscita dal campo: riscrivere il numero a
                    ogni tasto cancella il separatore appena digitato (lezione 25/07). */}
                <Input
                  inputMode="decimal"
                  value={prezzoGrezzo}
                  onChange={(e) => setPrezzoGrezzo(e.target.value)}
                  onBlur={() => setPrezzoGrezzo(formatDecimalIT(parseDecimalIT(prezzoGrezzo)))}
                  placeholder="180,00"
                />
              </div>
              <div>
                <Label>Codice</Label>
                <Input value={tariffaForm.codice ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, codice: e.target.value })} />
              </div>
              {tariffaForm.tipo === "manodopera" && (
                <div className="sm:col-span-2">
                  <Label>Qualifica</Label>
                  <Input value={tariffaForm.qualifica ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, qualifica: e.target.value })}
                    placeholder="Operaio specializzato, 3° livello…" />
                </div>
              )}
              <div className="sm:col-span-2">
                <Label>Note</Label>
                <Textarea rows={2} value={tariffaForm.note ?? ""} onChange={(e) => setTariffaForm({ ...tariffaForm, note: e.target.value })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
                <Label className="cursor-pointer">In uso</Label>
                <Switch checked={tariffaForm.attivo !== false} onCheckedChange={(v) => setTariffaForm({ ...tariffaForm, attivo: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTariffaForm(null)}>Annulla</Button>
            <Button
              disabled={!tariffaForm?.descrizione?.trim() || salvaTariffa.isPending}
              onClick={() => tariffaForm && salvaTariffa.mutate(tariffaForm)}
            >
              {salvaTariffa.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Conferma eliminazione ─── */}
      <AlertDialog open={!!daEliminare} onOpenChange={(o) => !o && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare «{daEliminare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {daEliminare?.tipo === "contratto"
                ? "Sparisce anche tutto il listino di questo contratto. Se l'accordo è solo scaduto, conviene spegnerlo invece di cancellarlo."
                : "La tariffa sparisce dal listino."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => daEliminare && elimina.mutate({ tipo: daEliminare.tipo, id: daEliminare.id })}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {caricaListino && contrattoAttivo && (
        <CaricaListinoDialog
          aperto={caricaListino}
          onChiudi={() => setCaricaListino(false)}
          contratto={{ id: contrattoAttivo.id, nome: contrattoAttivo.nome }}
          altriContratti={elencoContratti.filter((k) => k.id !== contrattoAttivo.id).map((k) => ({ id: k.id, nome: k.nome }))}
          esistenti={tariffe.data ?? []}
        />
      )}

      {composeOpen && (
        <Suspense fallback={null}>
          <EmailComposeDialog open={composeOpen} onOpenChange={setComposeOpen} context={composeContext} companyIdOverride={companyId ?? undefined} />
        </Suspense>
      )}

      {appuntamentoOpen && (
        <Suspense fallback={null}>
          <AppointmentDialog
            open={appuntamentoOpen}
            onOpenChange={setAppuntamentoOpen}
            defaultTitle={`Appuntamento ${nome}`}
            defaultOrderId={lavori.data?.[0]?.id}
            showOrderSelect
            defaultAddress={c.address}
            defaultCity={c.city}
            defaultProvince={c.province}
            onSaved={() => {
              setAppuntamentoOpen(false);
              queryClient.invalidateQueries({ queryKey: ["scheda-cliente", id, companyId] });
              queryClient.invalidateQueries({ queryKey: queryKeys.calendarOrders.all });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function Voce({ t, v }: { t: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{t}</dt>
      <dd className="truncate font-medium text-slate-900">{v}</dd>
    </div>
  );
}

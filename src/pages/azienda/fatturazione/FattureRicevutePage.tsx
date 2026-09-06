import { useState, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { CollegaOrdineFatturaDialog } from "@/components/fatturazione/CollegaOrdineFatturaDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Upload,
  Search,
  Eye,
  FileText,
  CheckCircle2,
  Inbox,
  Loader2,
  Link2,
  X,
  AlertTriangle,
  Euro,
  Sparkles,
} from "lucide-react";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { toast } from "sonner";
import {
  espandiXmlDaFiles,
  eliminaDoppioniInterni,
  riepilogoEsiti,
  descriviRiepilogo,
  classificaDirezione,
  type EsitoImport,
  type FileScartato,
} from "@/lib/fatturazione/bulkXmlImport";

import { useIsMobile } from "@/hooks/use-mobile";
// ─── Types ────────────────────────────────────────────────────

interface FatturaRicevuta {
  id: string;
  company_id: string;
  sdi_id_trasmissione: string | null;
  cedente_piva: string;
  cedente_cf: string;
  cedente_ragione_sociale: string;
  cedente_paese: string;
  tipo_documento: string;
  numero_fattura: string;
  data_fattura: string;
  // Nullable: alcuni provider (es. Aruba dal cassetto SDI) non espongono gli
  // importi nella lista → restano NULL finché non si apre l'XML.
  imponibile_totale: number | null;
  iva_totale: number | null;
  totale_documento: number | null;
  xml_url: string | null;
  /** Costo generato contabilizzando: c'è = la fattura è nei conti. */
  company_cost_id: string | null;
  /** true = l'aggancio all'ordine l'ha deciso una persona, non l'automatismo. */
  aggancio_oda_manuale: boolean;
  stato: "non_letta" | "letta" | "contabilizzata" | "rifiutata";
  note: string | null;
  created_at: string;
  /** Ordine d'acquisto collegato: dal trigger automatico o a mano da qui. */
  purchase_order_id: string | null;
  /** Categoria di spesa proposta dall'AI (null = mai classificata). */
  categoria_ai: string | null;
  sottocategoria_ai: string | null;
  /** 0-1: quanto l'AI e' sicura della categoria. */
  categoria_confidenza: number | null;
}

// ─── Stato Badge ──────────────────────────────────────────────

const STATO_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  non_letta: { label: "Non letta", variant: "destructive" },
  letta: { label: "Letta", variant: "outline" },
  contabilizzata: { label: "Contabilizzata", variant: "secondary" },
  rifiutata: { label: "Rifiutata", variant: "destructive" },
};

function StatoBadge({ stato }: { stato: string }) {
  const config = STATO_CONFIG[stato] || { label: stato, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/** "materiali_edili" → "Materiali edili". Niente mappa fissa: le categorie
 *  vivono nella edge di classificazione e qui non devono essere ricopiate,
 *  altrimenti ogni categoria nuova arriva senza nome. */
function etichettaCategoria(c: string): string {
  const t = c.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ─── Component ────────────────────────────────────────────────

export default function FattureRicevutePage() {
  const isMobile = useIsMobile();
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [xmlPreview, setXmlPreview] = useState<string | null>(null);
  const [contabilizzaFattura, setContabilizzaFattura] = useState<FatturaRicevuta | null>(null);
  const [collegaFattura, setCollegaFattura] = useState<FatturaRicevuta | null>(null);
  const [progress, setProgress] = useState<{ fatte: number; totale: number } | null>(null);
  const [report, setReport] = useState<{ esiti: EsitoImport[]; scartati: FileScartato[] } | null>(null);
  const [confermaClassifica, setConfermaClassifica] = useState(false);
  const [classProgress, setClassProgress] = useState<{ fatte: number; totale: number } | null>(null);

  const { data: partitaIvaAzienda } = useQuery({
    queryKey: ["azienda-partita-iva", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data } = await supabase
        .from("companies")
        .select("vat_number")
        .eq("id", companyId)
        .maybeSingle();
      return data?.vat_number ?? null;
    },
    enabled: !!companyId,
    staleTime: 10 * 60_000,
  });

  // ─── Data Query ──────────────────────────────────────────

  const { data: fatture = [], isLoading } = useQuery({
    queryKey: ["fatture-ricevute", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      // NIENTE select("*"): portava dentro xml_raw (l'XML INTERO, decine di KB
      // per fattura) più righe e riepilogo_iva, per disegnare una tabella che
      // non li usa. Con qualche centinaio di fatture erano decine di MB a ogni
      // apertura. L'XML si carica quando lo si chiede davvero.
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .select(
          "id, company_id, sdi_id_trasmissione, cedente_piva, cedente_cf, cedente_ragione_sociale, cedente_paese, tipo_documento, numero_fattura, data_fattura, imponibile_totale, iva_totale, totale_documento, xml_url, stato, note, created_at, purchase_order_id, company_cost_id, aggancio_oda_manuale, categoria_ai, sottocategoria_ai, categoria_confidenza" as never,
        )
        .eq("company_id", companyId!)
        .order("data_fattura", { ascending: false });

      if (error) throw error;
      return (data as unknown as FatturaRicevuta[]) ?? [];
    },
  });

  // I numeri OdA degli ordini collegati: una query sola per tutta la lista,
  // così il badge mostra "ODA-2026-028" e non un uuid.
  const linkedOdaIds = useMemo(
    () => [...new Set(fatture.map((f) => f.purchase_order_id).filter(Boolean))] as string[],
    [fatture],
  );
  const { data: odaNumbers = {} } = useQuery({
    queryKey: ["fatture-oda-numbers", companyId, linkedOdaIds],
    enabled: !!companyId && linkedOdaIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("purchase_orders")
        .select("id, oda_number")
        .eq("company_id", companyId!)
        .in("id", linkedOdaIds);
      if (error) throw error;
      return Object.fromEntries(
        ((data ?? []) as Array<{ id: string; oda_number: string }>).map((o) => [o.id, o.oda_number]),
      ) as Record<string, string>;
    },
  });

  // Perché la pagina resta vuota: se il gestionale è collegato ma al token
  // manca il permesso sui documenti ricevuti, il provider risponde 403 e
  // l'import passive torna zero. Per mesi è sembrato "nessuna fattura da
  // fornitori"; adesso lo diciamo, con il gesto che lo risolve.
  const { data: integrazione } = useQuery({
    queryKey: ["billing-integration-ricevute", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_integrations")
        .select("provider, received_scope_missing, last_sync_at")
        .eq("company_id", companyId!)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as { provider: string; received_scope_missing: boolean; last_sync_at: string | null } | null;
    },
  });

  // ─── KPI ────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const totale = fatture.length;
    const nonLette = fatture.filter((f) => f.stato === "non_letta").length;
    const contabilizzate = fatture.filter((f) => f.stato === "contabilizzata").length;
    const importoTotale = fatture.reduce((s, f) => s + (f.totale_documento ?? 0), 0);
    // Fatture importate senza importi (es. cassetto SDI Aruba): il totale le
    // conta come 0 → lo dichiariamo, così il KPI non sembra falsato.
    const senzaImporto = fatture.filter((f) => f.totale_documento == null).length;
    const daClassificare = fatture.filter((f) => !f.categoria_ai).length;
    return { totale, nonLette, contabilizzate, importoTotale, senzaImporto, daClassificare };
  }, [fatture]);

  // ─── Filters ────────────────────────────────────────────

  const filtered = useMemo(() => {
    let result = fatture;
    if (statoFilter !== "all") {
      result = result.filter((f) => f.stato === statoFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.cedente_ragione_sociale?.toLowerCase().includes(q) ||
          f.numero_fattura?.toLowerCase().includes(q) ||
          f.cedente_piva?.includes(q)
      );
    }
    return result;
  }, [fatture, statoFilter, searchQuery]);

  // ─── Mutations ──────────────────────────────────────────

  const updateStatoMutation = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: string }) => {
      // Il filtro sull'azienda non è pignoleria: senza, una riga fuori dal
      // perimetro RLS fa tornare a PostgREST "0 righe aggiornate" SENZA
      // errore, e l'utente si vedeva il toast "Stato aggiornato" su una
      // scrittura mai avvenuta.
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .update({ stato, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("company_id", companyId!)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Fattura non aggiornata: non appartiene a questa azienda");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      toast.success("Stato aggiornato");
    },
    onError: (e) => toast.error(`Errore: ${e.message}`),
  });

  // La decisione umana non è una porta a senso unico: si può restituire la
  // fattura all'aggancio automatico, che riproverà al prossimo aggiornamento.
  const riattivaAutomaticoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .update({ aggancio_oda_manuale: false, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("company_id", companyId!)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Fattura non aggiornata: non appartiene a questa azienda");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      toast.success("Aggancio automatico riattivato", {
        description: "Al prossimo aggiornamento degli importi il sistema riproverà a trovare l'ordine.",
      });
    },
    onError: (e) => toast.error("Non riuscito", { description: e.message }),
  });

  // Contabilizzare = generare il COSTO, non cambiare un'etichetta. La RPC
  // crea il costo dalla fattura oppure corregge quello già nato dalla
  // ricezione dell'ODA collegato, senza mai contarlo due volte.
  const contabilizzaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("contabilizza_fattura_ricevuta", { p_fattura_id: id });
      if (error) throw error;
      return data as { esito: string; imponibile: number; fornitore_riconosciuto: boolean };
    },
    onSuccess: (esito, _id) => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      // NB: la chiave e' quella del registro condiviso — ["company-costs"]
      // scritta a mano non corrisponde a nessuna query e la pagina Costi
      // restava ferma sui dati vecchi.
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita"] });
      const dettaglio = esito.esito === "costo_aggiornato"
        ? `Il costo dell'ordine collegato è stato corretto con l'importo della fattura (${formatCurrency(esito.imponibile)} imponibile).`
        : `Creato il costo di ${formatCurrency(esito.imponibile)} imponibile${esito.fornitore_riconosciuto ? "" : " (fornitore non in anagrafica: aggiungilo per vederlo nei report fornitore)"}.`;
      toast.success(
        esito.esito === "gia_contabilizzata" ? "Fattura già contabilizzata" : "Fattura contabilizzata",
        { description: esito.esito === "gia_contabilizzata" ? "Nessun costo duplicato." : dettaglio },
      );
      setContabilizzaFattura(null);
    },
    onError: (e) => toast.error("Contabilizzazione non riuscita", { description: e.message }),
  });

  // Classificazione AI delle fatture non ancora categorizzate. La edge ne
  // prende al massimo 50 per chiamata, quindi qui si cicla finche' ne restano:
  // su uno storico appena importato sono centinaia e un solo giro lascerebbe
  // il lavoro a meta' senza dirlo.
  const classificaMutation = useMutation({
    mutationFn: async () => {
      const daFare = fatture.filter((f) => !f.categoria_ai).length;
      setClassProgress({ fatte: 0, totale: daFare });
      let fatte = 0;
      let falliteTot = 0;
      // Tetto di giri: se per qualche motivo la edge smette di consumare la
      // coda, si esce invece di girare all'infinito a spese dell'azienda.
      for (let giro = 0; giro < 40; giro++) {
        const { data, error } = await supabase.functions.invoke("ai-fattura-classify", {
          body: { company_id: companyId, classify_unclassified: true, limit: 25 },
        });
        if (error) {
          // error.message da solo dice "non-2xx": il motivo vero (crediti AI
          // esauriti, carta mancante) sta nel corpo della risposta.
          let motivo = error.message;
          try {
            const body = await (error as { context?: Response }).context?.json?.();
            if (body?.error) motivo = String(body.error);
          } catch { /* il corpo non era JSON: resta il messaggio generico */ }
          throw new Error(motivo);
        }
        const esito = data as { classified?: { error?: string }[] } | null;
        const lotto = esito?.classified ?? [];
        if (lotto.length === 0) break;
        const riuscite = lotto.filter((r) => !r.error).length;
        falliteTot += lotto.length - riuscite;
        fatte += riuscite;
        setClassProgress({ fatte, totale: Math.max(daFare, fatte) });
        // La edge ripesca chi ha `categoria_ai` NULL: le fatture fallite
        // tornerebbero nel lotto successivo all'infinito. Se un giro intero non
        // ne salva nemmeno una, il problema non e' la singola fattura — si
        // esce, invece di ripagare lo stesso errore venticinque volte.
        if (riuscite === 0) break;
      }
      return { fatte, fallite: falliteTot };
    },
    onSuccess: ({ fatte, fallite }) => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      // NB: la chiave e' quella del registro condiviso — ["company-costs"]
      // scritta a mano non corrisponde a nessuna query e la pagina Costi
      // restava ferma sui dati vecchi.
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
      toast.success(
        fatte === 0 ? "Nessuna fattura da classificare" : `${fatte} fatture classificate`,
        {
          description: fallite > 0
            ? `${fallite} non sono riuscite: restano senza categoria, puoi rilanciare.`
            : "La categoria è arrivata anche sui costi già contabilizzati.",
        },
      );
    },
    onError: (e) => toast.error("Classificazione non riuscita", { description: e.message }),
    onSettled: () => setClassProgress(null),
  });

  // Collega/scollega l'ordine d'acquisto. Lo scollegamento e' reversibile in
  // un clic, quindi niente conferma; il trigger automatico non riaggancera'
  // da solo (scatta solo su insert/update degli importi), la scelta resta.
  const linkOdaMutation = useMutation({
    mutationFn: async ({ id, odaId }: { id: string; odaId: string | null }) => {
      // aggancio_oda_manuale: da qui in poi l'automatismo non tocca più questa
      // riga. Senza, scollegare un aggancio sbagliato non serviva a niente: al
      // primo aggiornamento degli importi il trigger la riagganciava allo
      // stesso ordine, smentendo la persona in silenzio.
      const { data, error } = await supabase
        .from("fatture_ricevute" as never)
        .update({ purchase_order_id: odaId, aggancio_oda_manuale: true, updated_at: new Date().toISOString() } as never)
        .eq("id", id)
        .eq("company_id", companyId!)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Fattura non collegata: non appartiene a questa azienda");
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita"] });
      setCollegaFattura(null);
      toast.success(v.odaId ? "Fattura collegata all'ordine" : "Fattura scollegata dall'ordine");
    },
    onError: (e) => toast.error(`Errore: ${e.message}`),
  });

  // ─── File Upload Handler ────────────────────────────────

  // Import massivo: si possono selezionare tante fatture insieme, o uno zip
  // scaricato dal portale. Le fatture partono una alla volta perche' ognuna
  // deve poter fallire per conto suo senza trascinarsi dietro le altre: su un
  // carico di trecento file sapere QUALI non sono passate, e perche', e' tutto.
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    setReport(null);
    setProgress({ fatte: 0, totale: 0 });

    const { xml, scartati } = await espandiXmlDaFiles(files);
    const daImportare = eliminaDoppioniInterni(xml);

    if (daImportare.length === 0) {
      setProgress(null);
      setReport({ esiti: [], scartati });
      toast.error("Nessuna fattura da importare", {
        description: scartati[0]?.motivo ?? "I file selezionati non contengono fatture elettroniche.",
      });
      return;
    }

    setProgress({ fatte: 0, totale: daImportare.length });
    const esiti: EsitoImport[] = [];

    for (const f of daImportare) {
      // Emessa o ricevuta? Lo dice il confronto fra le partite IVA. Quando non
      // e' chiaro NON si indovina: mandare una fattura nel posto sbagliato
      // falserebbe ricavi o costi, e sistemarlo dopo e' molto piu' caro.
      const direzione = classificaDirezione(f.contenuto, partitaIvaAzienda);
      if (direzione === "incerta") {
        esiti.push({
          nome: f.nome,
          stato: "errore",
          motivo: partitaIvaAzienda
            ? "Non risulta ne' emessa ne' ricevuta da questa azienda: controlla le partite IVA nel file."
            : "Partita IVA dell'azienda non configurata: impostala in Impostazioni per poter distinguere emesse e ricevute.",
        });
        setProgress({ fatte: esiti.length, totale: daImportare.length });
        continue;
      }

      const funzione = direzione === "attiva" ? "importa-fattura-attiva-xml" : "ricevi-sdi";

      try {
        const resp = await supabase.functions.invoke(funzione, {
          body: { xml_content: f.contenuto, company_id: companyId },
        });
        if (resp.error) {
          // Il corpo della risposta porta il motivo vero (numero gia' esistente,
          // cedente sbagliato); resp.error.message da solo direbbe solo "non-2xx".
          let motivo = resp.error.message;
          try {
            const dettaglio = await (resp.error as { context?: Response }).context?.json?.();
            if (dettaglio?.error) motivo = dettaglio.error;
          } catch { /* resta il messaggio generico */ }
          esiti.push({ nome: f.nome, stato: "errore", motivo, direzione });
        } else if (resp.data?.duplicate) {
          esiti.push({ nome: f.nome, stato: "duplicata", direzione });
        } else if (resp.data?.success) {
          esiti.push({ nome: f.nome, stato: "importata", direzione });
        } else {
          esiti.push({ nome: f.nome, stato: "errore", motivo: resp.data?.error ?? "Fattura rifiutata dal sistema.", direzione });
        }
      } catch (err) {
        esiti.push({ nome: f.nome, stato: "errore", motivo: err instanceof Error ? err.message : "Errore imprevisto.", direzione });
      }
      setProgress({ fatte: esiti.length, totale: daImportare.length });
    }

    setProgress(null);
    setReport({ esiti, scartati });
    queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });

    const r = riepilogoEsiti(esiti);
    const testo = descriviRiepilogo(r);
    if (r.errori > 0 || scartati.length > 0) {
      toast.warning("Import completato con eccezioni", { description: testo });
    } else {
      toast.success("Import completato", { description: testo });
    }
  };

  // ─── Mark as read on view ──────────────────────────────

  // L'XML si va a prendere adesso, per QUESTA fattura: è il pezzo pesante e
  // serve solo quando lo si guarda.
  const handleViewXml = async (f: FatturaRicevuta) => {
    if (f.stato === "non_letta") {
      updateStatoMutation.mutate({ id: f.id, stato: "letta" });
    }
    const { data, error } = await supabase
      .from("fatture_ricevute" as never)
      .select("xml_raw" as never)
      .eq("id", f.id)
      .eq("company_id", companyId!)
      .maybeSingle();
    const xml = (data as { xml_raw: string | null } | null)?.xml_raw ?? null;
    if (error) {
      toast.error("Impossibile leggere l'XML", { description: error.message });
      return;
    }
    if (!xml) {
      toast.info("Nessun XML per questa fattura", {
        description: "Arriva dal gestionale, che espone i dati ma non il file originale.",
      });
      return;
    }
    setXmlPreview(xml);
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fatture Ricevute</h1>
          <p className="text-sm text-muted-foreground">
            Fatture passive ricevute dal Sistema di Interscambio
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.zip"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          {kpi.daClassificare > 0 && (
            <Button
              variant="outline"
              onClick={() => setConfermaClassifica(true)}
              disabled={classProgress !== null}
              title="Assegna a ogni fattura la categoria di spesa, e la porta anche sul costo"
            >
              {classProgress !== null ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2" />
              )}
              {classProgress !== null
                ? `Classificazione ${classProgress.fatte} di ${classProgress.totale}…`
                : `Classifica con l'AI (${kpi.daClassificare})`}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={progress !== null}
          >
            {progress !== null ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {progress !== null
              ? progress.totale > 0
                ? `Importazione ${progress.fatte} di ${progress.totale}…`
                : "Lettura file…"
              : "Importa XML"}
          </Button>
        </div>
      </div>

      {integrazione?.received_scope_missing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                Le fatture dei fornitori non stanno arrivando
              </p>
              <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300">
                Il collegamento con il gestionale funziona per le fatture che emetti, ma non ha il
                permesso di leggere quelle che ricevi: il provider risponde «permesso negato». Serve
                ricollegare l'account una volta, autorizzando anche i documenti ricevuti.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3 border-amber-400 bg-white hover:bg-amber-100">
                <Link to="/azienda/impostazioni/fatturazione">Ricollega il gestionale</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Resoconto dell'ultimo import: dice quante sono passate e, soprattutto,
          quali no e per quale motivo — cosi' si sa cosa ricaricare. */}
      {report && (
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span>Esito importazione</span>
              <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
                Chiudi
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="default">{riepilogoEsiti(report.esiti).importate} importate</Badge>
              {riepilogoEsiti(report.esiti).duplicate > 0 && (
                <Badge variant="secondary">{riepilogoEsiti(report.esiti).duplicate} gia&apos; presenti</Badge>
              )}
              {riepilogoEsiti(report.esiti).errori > 0 && (
                <Badge variant="destructive">{riepilogoEsiti(report.esiti).errori} non riuscite</Badge>
              )}
              {report.esiti.some((e) => e.direzione === "attiva") && (
                <Badge variant="outline">
                  {report.esiti.filter((e) => e.direzione === "attiva" && e.stato !== "errore").length} emesse
                </Badge>
              )}
              {report.esiti.some((e) => e.direzione === "passiva") && (
                <Badge variant="outline">
                  {report.esiti.filter((e) => e.direzione === "passiva" && e.stato !== "errore").length} ricevute
                </Badge>
              )}
              {report.scartati.length > 0 && (
                <Badge variant="outline">{report.scartati.length} file scartati</Badge>
              )}
            </div>

            {(report.esiti.some((e) => e.stato === "errore") || report.scartati.length > 0) && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                {report.esiti
                  .filter((e) => e.stato === "errore")
                  .map((e) => (
                    <div key={`err-${e.nome}`} className="flex gap-2">
                      <span className="shrink-0 font-medium text-destructive">{e.nome}</span>
                      <span className="text-muted-foreground">{e.motivo}</span>
                    </div>
                  ))}
                {report.scartati.map((f) => (
                  <div key={`scarto-${f.nome}`} className="flex gap-2">
                    <span className="shrink-0 font-medium text-amber-700">{f.nome}</span>
                    <span className="text-muted-foreground">{f.motivo}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Testata navy di famiglia. */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <div className="bg-[#173b67] p-4 text-white sm:p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 text-white shadow-[0_8px_18px_rgba(249,115,22,0.28)] sm:h-11 sm:w-11">
              <Inbox className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-100 sm:text-xs">Fatture ricevute</p>
              <h2 className="mt-0.5 text-base font-semibold text-white sm:text-xl">Quello che i fornitori ti mandano</h2>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard label="Totale ricevute" value={String(kpi.totale)} icon={Inbox} tone="text-orange-100" />
            <NavyStatCard
              label="Da leggere"
              value={String(kpi.nonLette)}
              icon={Eye}
              tone={kpi.nonLette > 0 ? "text-orange-300" : "text-emerald-200"}
            />
            <NavyStatCard label="Contabilizzate" value={String(kpi.contabilizzate)} icon={CheckCircle2} tone="text-emerald-200" />
            <NavyStatCard
              label="Importo totale"
              value={formatCurrency(kpi.importoTotale)}
              sub={kpi.senzaImporto > 0 ? `${kpi.senzaImporto} senza importo (non conteggiate)` : undefined}
              icon={Euro}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per fornitore, numero fattura, P.IVA..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={statoFilter} onValueChange={setStatoFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="non_letta">Non lette</SelectItem>
            <SelectItem value="letta">Lette</SelectItem>
            <SelectItem value="contabilizzata">Contabilizzate</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Inbox className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">Nessuna fattura ricevuta</p>
          <p className="text-sm">
            Le fatture arriveranno automaticamente dal SDI oppure puoi importare XML manualmente.
          </p>
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornitore</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Numero</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <TableHead className="text-right">Totale</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Ordine</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow
                  key={f.id}
                  className={f.stato === "non_letta" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium">{f.cedente_ragione_sociale}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.cedente_piva ? `P.IVA ${f.cedente_piva}` : f.cedente_cf}
                      </div>
                      {f.categoria_ai && (
                        <Badge
                          variant="outline"
                          className="mt-1 text-[10px] font-normal"
                          title={
                            f.sottocategoria_ai
                              ? `${f.sottocategoria_ai}${f.categoria_confidenza != null ? ` · sicurezza ${Math.round(f.categoria_confidenza * 100)}%` : ""}`
                              : undefined
                          }
                        >
                          {etichettaCategoria(f.categoria_ai)}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono">{f.tipo_documento}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{f.numero_fattura}</TableCell>
                  <TableCell>{formatDateShort(f.data_fattura)}</TableCell>
                  <TableCell className="text-right">
                    {f.imponibile_totale != null ? formatCurrency(f.imponibile_totale) : <span className="text-muted-foreground" title="Importo non incluso nella lista del provider: apri l'XML per il dettaglio">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    {f.iva_totale != null ? formatCurrency(f.iva_totale) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {f.totale_documento != null ? formatCurrency(f.totale_documento) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <StatoBadge stato={f.stato} />
                  </TableCell>
                  <TableCell>
                    {f.purchase_order_id ? (
                      <div className="flex items-center gap-0.5">
                        <Link
                          to={`/azienda/ordini-acquisto/${f.purchase_order_id}`}
                          title="Apri l'ordine d'acquisto"
                        >
                          <Badge variant="outline" className="font-mono text-[11px] hover:bg-orange-50 hover:border-orange-300 transition-colors">
                            {odaNumbers[f.purchase_order_id] ?? "OdA"}
                          </Badge>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title="Scollega dall'ordine" aria-label="Scollega dall'ordine"
                          disabled={linkOdaMutation.isPending}
                          onClick={() => linkOdaMutation.mutate({ id: f.id, odaId: null })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        title="Collega a un ordine d'acquisto"
                        onClick={() => setCollegaFattura(f)}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />
                        Collega
                      </Button>
                    )}
                    {/* Chi ha deciso l'aggancio si vede, e si può tornare
                        indietro: senza questo, "scollegata a mano" era uno
                        stato invisibile che spiegava perché il sistema non
                        riagganciava più. */}
                    {f.aggancio_oda_manuale && (
                      <button
                        type="button"
                        className="mt-1 block text-[10px] text-muted-foreground underline-offset-2 hover:underline"
                        title="Il sistema non riaggancia più questa fattura da solo. Clicca per restituirgliela."
                        onClick={() => riattivaAutomaticoMutation.mutate(f.id)}
                      >
                        scelto a mano · riattiva automatico
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Anteprima XML" aria-label="Anteprima XML"
                        onClick={() => void handleViewXml(f)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {/* Niente export su telefono. */}
                      {!isMobile && f.xml_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Scarica XML" aria-label="Scarica XML"
                          onClick={async () => {
                            try {
                              const { data, error } = await supabase.storage
                                .from("fatture-xml")
                                .download(f.xml_url!);
                              if (error || !data) throw error ?? new Error("File non trovato");
                              const url = URL.createObjectURL(data);
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = f.xml_url!.split("/").pop() ?? "fattura.xml";
                              a.click();
                              URL.revokeObjectURL(url);
                            } catch (err) {
                              toast.error("Impossibile scaricare l'XML", {
                                description: err instanceof Error ? err.message : undefined,
                              });
                            }
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Prima "Contabilizza" compariva SOLO su stato "letta", e
                          l'unico modo di diventare "letta" era aprire l'anteprima
                          XML — che esiste solo se l'XML c'è. Le fatture arrivate
                          dal gestionale (FIC/Aruba) non ce l'hanno: restavano
                          bloccate su "non letta" per sempre. Ora si contabilizza
                          qualunque fattura non ancora contabilizzata. */}
                      {f.stato !== "contabilizzata" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                          title="Contabilizza"
                          onClick={() => setContabilizzaFattura(f)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Contabilizza
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Contabilizza Confirmation Dialog */}
      <AlertDialog open={!!contabilizzaFattura} onOpenChange={(open) => { if (!open) setContabilizzaFattura(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contabilizza fattura ricevuta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {contabilizzaFattura?.purchase_order_id
                    ? "La fattura è collegata a un ordine: l'importo del costo già registrato alla ricezione verrà corretto con quello della fattura (nessun costo doppio)."
                    : "Verrà creato il costo corrispondente, con imponibile e IVA della fattura, visibile in Costi e nel Previsionale."}
                </p>
                {contabilizzaFattura && (
                  <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cedente</span>
                      <span className="font-medium">{contabilizzaFattura.cedente_ragione_sociale}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Numero</span>
                      <span className="font-mono">{contabilizzaFattura.numero_fattura}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Importo totale</span>
                      <span className="font-semibold">{formatCurrency(contabilizzaFattura.totale_documento)}</span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              disabled={contabilizzaMutation.isPending}
              onClick={(e) => {
                // Il dialog non si chiude da solo: se la RPC rifiuta (fattura
                // senza importi) l'errore va letto, non fatto sparire.
                e.preventDefault();
                if (contabilizzaFattura) contabilizzaMutation.mutate(contabilizzaFattura.id);
              }}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Contabilizza
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma classificazione AI: è uno strumento a consumo, quante fatture
          si stanno per pagare va detto PRIMA, non scoperto dopo sul borsellino. */}
      <AlertDialog open={confermaClassifica} onOpenChange={setConfermaClassifica}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Classificare {kpi.daClassificare} fatture con l&apos;AI?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  A ogni fattura viene assegnata una categoria di spesa (materiali, subappalti,
                  affitti, provvigioni…) leggendo fornitore e righe. Dove la fattura è già
                  contabilizzata, la categoria arriva anche sul costo.
                </p>
                <p>
                  È uno strumento a consumo: scala crediti AI dal borsellino dell&apos;azienda, una
                  volta per fattura. Rilanciarlo dopo non ripaga quelle già fatte.
                </p>
                <p className="text-muted-foreground">
                  La categoria resta modificabile a mano: è una proposta, non l&apos;ultima parola.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={classificaMutation.isPending}
              onClick={() => classificaMutation.mutate()}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              Classifica
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Collega ordine Dialog */}
      <CollegaOrdineFatturaDialog
        open={!!collegaFattura}
        onOpenChange={(o) => { if (!o) setCollegaFattura(null); }}
        companyId={companyId}
        fattura={collegaFattura}
        saving={linkOdaMutation.isPending}
        onScelto={(odaId) => {
          if (collegaFattura) linkOdaMutation.mutate({ id: collegaFattura.id, odaId });
        }}
      />

      {/* XML Preview Dialog */}
      <Dialog open={!!xmlPreview} onOpenChange={() => setXmlPreview(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Anteprima XML FatturaPA
            </DialogTitle>
          </DialogHeader>
          <pre className="overflow-auto bg-muted p-4 rounded-md text-xs font-mono max-h-[60vh] whitespace-pre-wrap">
            {xmlPreview}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}

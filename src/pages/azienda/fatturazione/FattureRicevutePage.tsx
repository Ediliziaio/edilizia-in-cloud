import { useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PagamentoRicevutaCella, etichettaTipoRicevuta, isNotaCreditoRicevuta, usePagamentiRicevute } from "@/components/fatturazione/PagamentoRicevuta";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import { CollegaOrdineFatturaDialog } from "@/components/fatturazione/CollegaOrdineFatturaDialog";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import type { QuotaOrdine } from "@/lib/fatturazione/quoteOrdini";
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
  Printer,
  FileSpreadsheet,
  Archive,
  ChevronDown,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fatturaRicevutaHtml, type FatturaRicevutaVista } from "@/lib/fatturazione/fatturaRicevutaHtml";
import { stampaPreventivoNativo } from "@/lib/fotovoltaico/htmlToPdf";
import { esportaElencoRicevute, esportaXmlRicevuteZip, type RigaRicevuta } from "@/lib/fatturazione/esportaRicevute";
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
import { bytesToBase64 } from "../../../../supabase/functions/_shared/base64";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";

import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
// ─── Types ────────────────────────────────────────────────────

/**
 * Giorni fra la data scritta in fattura e la consegna dello SDI, contati sul
 * calendario italiano: il fornitore può trasmettere fino a 12 giorni dopo
 * (15 del mese dopo per le differite), e la differenza si vede qui.
 */
export function giorniDallaFattura(f: { data_fattura: string; data_ricezione_sdi: string | null }): number | null {
  if (!f.data_ricezione_sdi || !f.data_fattura) return null;
  const arrivo = new Date(f.data_ricezione_sdi).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const giorni = Math.round((Date.parse(arrivo) - Date.parse(f.data_fattura.slice(0, 10))) / 86_400_000);
  return Number.isFinite(giorni) ? giorni : null;
}

function ArrivataIl({ f }: { f: { data_fattura: string; data_ricezione_sdi: string | null } }) {
  if (!f.data_ricezione_sdi) return <span className="text-muted-foreground" title="Data di arrivo non disponibile: fattura caricata a mano o importata">—</span>;
  const giorni = giorniDallaFattura(f);
  return (
    <span title={`Consegnata dallo SDI il ${formatDateTime(f.data_ricezione_sdi)}`}>
      {formatDateShort(f.data_ricezione_sdi)}
      {giorni != null && giorni > 0 && (
        <span className="block text-[11px] leading-tight text-muted-foreground">{giorni === 1 ? "1 giorno dopo" : `${giorni} giorni dopo`}</span>
      )}
    </span>
  );
}

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
  /** Quando lo SDI l'ha consegnata (openapi); vuota per le importate a mano. */
  data_ricezione_sdi: string | null;
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
  /** Importata come storico già registrato nel gestionale di prima (data di taglio). */
  storico_esterno?: boolean | null;
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

/** La contabilizzata dello storico (data di taglio) non è passata da qui: si dice. */
const etichettaStato = (f: { stato: string; storico_esterno?: boolean | null }) =>
  f.storico_esterno && f.stato === "contabilizzata" ? "Già registrata (storico)" : STATO_CONFIG[f.stato]?.label ?? f.stato;

function StatoBadge({ stato, storico }: { stato: string; storico?: boolean | null }) {
  const config = STATO_CONFIG[stato] || { label: stato, variant: "outline" as const };
  if (storico && stato === "contabilizzata") return <Badge variant="outline">Già registrata (storico)</Badge>;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

/** "materiali_edili" → "Materiali edili". Niente mappa fissa: le categorie
 *  vivono nella edge di classificazione e qui non devono essere ricopiate,
 *  altrimenti ogni categoria nuova arriva senza nome. */
function etichettaCategoria(c: string): string {
  const t = c.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Chip di filtro rapido: si accende/spegne e mostra quante fatture contiene. */
function ChipFiltro({ attivo, onClick, conteggio, children }: {
  attivo: boolean;
  onClick: () => void;
  conteggio?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={attivo}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        attivo
          ? "border-primary bg-primary text-primary-foreground"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {children}
      {conteggio != null && (
        <span className={`tabular-nums ${attivo ? "opacity-80" : "text-muted-foreground"}`}>{conteggio}</span>
      )}
    </button>
  );
}

/** Intestazione di colonna che si ordina al clic; la freccia dice il verso. */
function IntestazioneOrdinabile({ children, campo, ordinamento, onOrdina, className }: {
  children: ReactNode;
  campo: "data" | "fornitore" | "totale";
  ordinamento: { campo: "data" | "fornitore" | "totale"; dir: "asc" | "desc" };
  onOrdina: (campo: "data" | "fornitore" | "totale") => void;
  className?: string;
}) {
  const attiva = ordinamento.campo === campo;
  const Icona = !attiva ? ArrowUpDown : ordinamento.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onOrdina(campo)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${attiva ? "text-foreground" : ""}`}
      >
        {children}
        <Icona className={`h-3.5 w-3.5 ${attiva ? "opacity-100" : "opacity-30"}`} />
      </button>
    </TableHead>
  );
}

// ─── Component ────────────────────────────────────────────────

export default function FattureRicevutePage() {
  const isMobile = useIsMobile();
  const companyId = useEffectiveCompanyId();
  const { data: pagate } = usePagamentiRicevute(companyId);
  const pagataIl = useCallback((id: string) => pagate?.get(id) ?? null, [pagate]);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statoFilter, setStatoFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  // «__nessuna__» = mai classificata dall'AI.
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [ordineFilter, setOrdineFilter] = useState<"all" | "con" | "senza">("all");
  const [contabFilter, setContabFilter] = useState<"all" | "da_contabilizzare">("all");
  const [ordinamento, setOrdinamento] = useState<{ campo: "data" | "fornitore" | "totale"; dir: "asc" | "desc" }>({
    campo: "data",
    dir: "desc",
  });
  // Le fatture dei fornitori arrivano dall'import del gestionale: Best Infissi
  // ne ha 6.979 dal 2020 e la pagina le chiedeva TUTTE, oltre il tetto di mille
  // righe di PostgREST — che tagliava via una parte dell'anno in corso. Si parte
  // dall'anno corrente, gli altri restano un clic più in là.
  const annoCorrente = String(new Date().getFullYear());
  const [annoFilter, setAnnoFilter] = useState(annoCorrente);
  // La fattura aperta nel riepilogo leggibile (righe, totali, collegamenti).
  const [riepilogoId, setRiepilogoId] = useState<string | null>(null);
  const [fatturaVista, setFatturaVista] = useState<FatturaRicevutaVista | null>(null);
  const [esportando, setEsportando] = useState<string | null>(null);
  const [contabilizzaFattura, setContabilizzaFattura] = useState<FatturaRicevuta | null>(null);
  const [collegaFattura, setCollegaFattura] = useState<FatturaRicevuta | null>(null);
  const [progress, setProgress] = useState<{ fatte: number; totale: number } | null>(null);
  const [report, setReport] = useState<{ esiti: EsitoImport[]; scartati: FileScartato[] } | null>(null);
  const [confermaClassifica, setConfermaClassifica] = useState(false);
  const [classProgress, setClassProgress] = useState<{ fatte: number; totale: number } | null>(null);
  // Mobile: anno e stato in un pannello dal basso; una fattura si apre in un
  // riquadro dal basso con i numeri e «Contabilizza».
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const [dettaglioMobile, setDettaglioMobile] = useState<FatturaRicevuta | null>(null);
  // «Da pagare»: le fatture dei fornitori non ancora pagate (né a mano né con tutte le rate).
  const [pagamentoFilter, setPagamentoFilter] = useState<"all" | "da_pagare">("all");

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

  // Anni con fatture ricevute: due righe sole (la più vecchia e la più recente).
  const { data: estremiAnni } = useQuery({
    queryKey: ["fatture-ricevute-anni", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const base = () => supabase
        .from("fatture_ricevute" as never)
        .select("data_fattura" as never)
        .eq("company_id", companyId!)
        .not("data_fattura", "is", null)
        .limit(1);
      const [prima, ultima] = await Promise.all([
        base().order("data_fattura", { ascending: true }),
        base().order("data_fattura", { ascending: false }),
      ]);
      const primo = (prima.data as unknown as { data_fattura: string }[] | null)?.[0]?.data_fattura;
      const ultimo = (ultima.data as unknown as { data_fattura: string }[] | null)?.[0]?.data_fattura;
      return { da: primo?.slice(0, 4) ?? null, a: ultimo?.slice(0, 4) ?? null };
    },
  });

  const anniDisponibili = useMemo(() => {
    const da = Number(estremiAnni?.da ?? annoCorrente);
    const a = Number(estremiAnni?.a ?? annoCorrente);
    if (!Number.isFinite(da) || !Number.isFinite(a) || a < da) return [annoCorrente];
    return Array.from({ length: a - da + 1 }, (_, i) => String(a - i));
  }, [estremiAnni, annoCorrente]);

  const { data: fatture = [], isLoading } = useQuery({
    queryKey: ["fatture-ricevute", companyId, annoFilter],
    enabled: !!companyId,
    queryFn: async () => {
      // NIENTE select("*"): portava dentro xml_raw (l'XML INTERO, decine di KB
      // per fattura) più righe e riepilogo_iva, per disegnare una tabella che
      // non li usa. Con qualche centinaio di fatture erano decine di MB a ogni
      // apertura. L'XML si carica quando lo si chiede davvero.
      let q = supabase
        .from("fatture_ricevute" as never)
        .select(
          "id, company_id, sdi_id_trasmissione, cedente_piva, cedente_cf, cedente_ragione_sociale, cedente_paese, tipo_documento, numero_fattura, data_fattura, data_ricezione_sdi, imponibile_totale, iva_totale, totale_documento, xml_url, stato, note, created_at, purchase_order_id, company_cost_id, aggancio_oda_manuale, categoria_ai, sottocategoria_ai, categoria_confidenza, storico_esterno" as never,
        )
        .eq("company_id", companyId!)
        .order("data_fattura", { ascending: false });
      if (annoFilter !== "all") {
        q = q
          .gte("data_fattura", `${annoFilter}-01-01`)
          .lte("data_fattura", `${annoFilter}-12-31`);
      }
      const { data, error } = await q;
      return (data as unknown as FatturaRicevuta[]) ?? [];
    },
  });

  // Le fatture divise tra più ordini: una quota per ordine (30/10/2026).
  const { data: quoteOrdini = {} } = useQuery({
    queryKey: ["fatture-quote-ordini", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fattura_ricevuta_ordini")
        .select("fattura_id, purchase_order_id, importo")
        .eq("company_id", companyId!);
      if (error) throw error;
      const perFattura: Record<string, Array<{ purchase_order_id: string; importo: number }>> = {};
      for (const r of (data ?? []) as Array<{ fattura_id: string; purchase_order_id: string; importo: number }>) {
        (perFattura[r.fattura_id] ??= []).push({ purchase_order_id: r.purchase_order_id, importo: Number(r.importo) });
      }
      return perFattura;
    },
  });
  const haOrdine = useCallback(
    (f: FatturaRicevuta) => !!f.purchase_order_id || (quoteOrdini[f.id]?.length ?? 0) > 0,
    [quoteOrdini],
  );

  // I numeri OdA degli ordini collegati: una query sola per tutta la lista,
  // così il badge mostra "ODA-2026-028" e non un uuid.
  const linkedOdaIds = useMemo(
    () => [...new Set([
      ...fatture.map((f) => f.purchase_order_id),
      ...Object.values(quoteOrdini).flat().map((q) => q.purchase_order_id),
    ].filter(Boolean))] as string[],
    [fatture, quoteOrdini],
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

  const opzioniTipo = useMemo(
    // Per nome, non per sigla: «expense» e «TD01» sono entrambe «Fattura».
    () => [...new Set(fatture.map((f) => f.tipo_documento).filter(Boolean).map(etichettaTipoRicevuta))].sort(),
    [fatture],
  );
  const opzioniCategoria = useMemo(
    () => [...new Set(fatture.map((f) => f.categoria_ai).filter(Boolean) as string[])].sort(),
    [fatture],
  );
  // Conteggi dei chip rapidi, sull'intero anno (non sul risultato dei filtri).
  const conteggi = useMemo(
    () => ({
      daContabilizzare: fatture.filter((f) => !f.company_cost_id && f.stato !== "rifiutata").length,
      senzaOrdine: fatture.filter((f) => !haOrdine(f)).length,
      daPagare: fatture.filter((f) => !isNotaCreditoRicevuta(f.tipo_documento) && !pagataIl(f.id)).length,
    }),
    [fatture, haOrdine, pagataIl],
  );
  const filtriAttivi =
    (statoFilter !== "all" ? 1 : 0) +
    (tipoFilter !== "all" ? 1 : 0) +
    (categoriaFilter !== "all" ? 1 : 0) +
    (ordineFilter !== "all" ? 1 : 0) +
    (contabFilter !== "all" ? 1 : 0) +
    (pagamentoFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0);

  const azzeraFiltri = () => {
    setSearchQuery("");
    setStatoFilter("all");
    setTipoFilter("all");
    setCategoriaFilter("all");
    setOrdineFilter("all");
    setContabFilter("all");
    setPagamentoFilter("all");
  };

  const ordinaPer = (campo: "data" | "fornitore" | "totale") =>
    setOrdinamento((o) =>
      o.campo === campo
        ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: campo === "fornitore" ? "asc" : "desc" },
    );

  const filtered = useMemo(() => {
    let result = fatture;
    if (statoFilter !== "all") {
      result = result.filter((f) => f.stato === statoFilter);
    }
    if (tipoFilter !== "all") {
      result = result.filter((f) => etichettaTipoRicevuta(f.tipo_documento) === tipoFilter);
    }
    if (categoriaFilter === "__nessuna__") {
      result = result.filter((f) => !f.categoria_ai);
    } else if (categoriaFilter !== "all") {
      result = result.filter((f) => f.categoria_ai === categoriaFilter);
    }
    if (ordineFilter === "con") {
      result = result.filter((f) => haOrdine(f));
    } else if (ordineFilter === "senza") {
      result = result.filter((f) => !haOrdine(f));
    }
    if (contabFilter === "da_contabilizzare") {
      result = result.filter((f) => !f.company_cost_id && f.stato !== "rifiutata");
    }
    if (pagamentoFilter === "da_pagare") {
      result = result.filter((f) => !isNotaCreditoRicevuta(f.tipo_documento) && !pagataIl(f.id));
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
    const segno = ordinamento.dir === "asc" ? 1 : -1;
    return [...result].sort((a, b) => {
      if (ordinamento.campo === "fornitore") {
        return segno * (a.cedente_ragione_sociale ?? "").localeCompare(b.cedente_ragione_sociale ?? "", "it");
      }
      if (ordinamento.campo === "totale") {
        return segno * ((a.totale_documento ?? 0) - (b.totale_documento ?? 0));
      }
      return segno * (a.data_fattura < b.data_fattura ? -1 : a.data_fattura > b.data_fattura ? 1 : 0);
    });
  }, [fatture, statoFilter, tipoFilter, categoriaFilter, ordineFilter, contabFilter, pagamentoFilter, pagataIl, searchQuery, ordinamento, haOrdine]);

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
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
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
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
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
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
      // NB: la chiave e' quella del registro condiviso — ["company-costs"]
      // scritta a mano non corrisponde a nessuna query e la pagina Costi
      // restava ferma sui dati vecchi.
      queryClient.invalidateQueries({ queryKey: queryKeys.costs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cashflow.companyCosts(companyId) });
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita"] });
      const dettaglio = esito.esito === "costo_ridotto"
        ? `Il costo dell'ordine collegato è stato ridotto della nota di credito (${formatCurrency(Math.abs(esito.imponibile))} imponibile).`
        : esito.esito === "costo_aggiornato"
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
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
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

  // Collega/scollega gli ordini d'acquisto. Lo scollegamento e' reversibile in
  // un clic, quindi niente conferma; il trigger automatico non riaggancera'
  // da solo (scatta solo su insert/update degli importi), la scelta resta.
  // Uno, più ordini (con le quote) o nessuno: lo scrive
  // collega_fattura_a_ordini, che segna anche aggancio_oda_manuale — da qui in
  // poi l'automatismo non tocca più questa riga. Senza, scollegare un aggancio
  // sbagliato non serviva a niente: al primo aggiornamento degli importi il
  // trigger la riagganciava allo stesso ordine, smentendo la persona in silenzio.
  const linkOdaMutation = useMutation({
    mutationFn: async ({ id, quote }: { id: string; quote: QuotaOrdine[] }) => {
      const { error } = await (supabase as any).rpc("collega_fattura_a_ordini", {
        p_fattura_id: id,
        p_quote: quote,
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
      queryClient.invalidateQueries({ queryKey: ["fatture-quote-ordini"] });
      queryClient.invalidateQueries({ queryKey: ["oda-contabilita"] });
      setCollegaFattura(null);
      toast.success(
        v.quote.length === 0
          ? "Fattura scollegata dagli ordini"
          : v.quote.length === 1
            ? "Fattura collegata all'ordine"
            : `Fattura divisa tra ${v.quote.length} ordini`,
      );
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
      // Il file va al server intero anche per le emesse e per gli XML non
      // firmati. xml_content resta per compatibilità durante il deploy:
      // le funzioni nuove ricavano comunque il testo dal file originale.
      const originale = f.originale ?? f.firmato;
      const body = originale
        ? { originale_base64: bytesToBase64(originale), xml_content: f.contenuto, company_id: companyId }
        : { xml_content: f.contenuto, company_id: companyId };

      try {
        const resp = await supabase.functions.invoke(funzione, { body });
        if (resp.error) {
          // Il corpo della risposta porta il motivo vero (numero gia' esistente,
          // cedente sbagliato); resp.error.message da solo direbbe solo "non-2xx".
          let motivo = resp.error.message;
          try {
            const dettaglio = await (resp.error as { context?: Response }).context?.json?.();
            if (dettaglio?.error) motivo = dettaglio.error;
          } catch { /* resta il messaggio generico */ }
          esiti.push({ nome: f.nome, stato: "errore", motivo, direzione });
        } else if (resp.data?.duplicate && resp.data?.completed) {
          // Già registrata coi soli dati: ora ha anche il file originale.
          esiti.push({ nome: f.nome, stato: "importata", direzione });
        } else if (resp.data?.duplicate) {
          esiti.push({ nome: f.nome, stato: "duplicata", direzione });
        } else if (resp.data?.success) {
          esiti.push({ nome: f.nome, stato: "importata", direzione, ...(resp.data.warning ? {avviso:String(resp.data.warning)} : {}) });
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
    invalidaStatisticheFatturazione(queryClient,companyId);
    queryClient.invalidateQueries({ queryKey:["anagrafiche-native",companyId] });
    queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["fatture-emesse-importate", companyId] });
    queryClient.invalidateQueries({ queryKey: ["emessa-importata-dettaglio", companyId] });
    queryClient.invalidateQueries({ queryKey: ["emessa-importata-originale", companyId] });

    const r = riepilogoEsiti(esiti);
    const testo = descriviRiepilogo(r);
    if (r.errori > 0 || scartati.length > 0 || esiti.some(e => e.avviso)) {
      toast.warning("Import completato con eccezioni", { description: testo });
    } else {
      toast.success("Import completato", { description: testo });
    }
  };

  // ─── Mark as read on view ──────────────────────────────

  // La fattura leggibile (righe, totali, fornitore) con «Stampa / Salva PDF»:
  // prima per le ricevute c'era solo l'XML grezzo.
  const handleViewFattura = async (f: FatturaRicevuta) => {
    if (f.stato === "non_letta") {
      updateStatoMutation.mutate({ id: f.id, stato: "letta" });
    }
    const { data, error } = await supabase
      .from("fatture_ricevute" as never)
      .select("xml_raw" as never)
      .eq("id", f.id)
      .eq("company_id", companyId!)
      .maybeSingle();
    if (error) {
      toast.error("Impossibile leggere la fattura", { description: error.message });
      return;
    }
    const xml = (data as { xml_raw: string | null } | null)?.xml_raw ?? null;
    if (!xml) {
      toast.info("Fattura non disponibile in formato leggibile", {
        description: "Arriva dal gestionale, che espone i dati ma non il file originale.",
      });
      return;
    }
    const vista = fatturaRicevutaHtml(xml, new DOMParser());
    if (!vista) {
      toast.error("Il file non è una fattura elettronica leggibile", {
        description: "Puoi comunque scaricare il file originale.",
      });
      return;
    }
    setFatturaVista(vista);
  };

  // Il file originale nell'archivio se c'è; altrimenti l'XML salvato con la fattura
  // (le fatture importate a mano non sempre hanno la copia in archivio).
  const handleScaricaOriginale = async (f: FatturaRicevuta) => {
    try {
      let data: Blob | null = null;
      if (f.xml_url) {
        const r = await supabase.storage.from("fatture-xml").download(f.xml_url);
        if (r.error) throw r.error;
        data = r.data;
      } else {
        const r = await supabase.from("fatture_ricevute" as never).select("xml_raw" as never)
          .eq("id", f.id).eq("company_id", companyId!).maybeSingle();
        const xml = (r.data as { xml_raw: string | null } | null)?.xml_raw;
        if (!xml) throw new Error("Nessun file disponibile per questa fattura");
        data = new Blob([xml], { type: "application/xml" });
      }
      if (!data) throw new Error("File non trovato");
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.xml_url?.split("/").pop() ?? `${f.cedente_piva ?? "fattura"}_${String(f.numero_fattura).replace(/[^a-zA-Z0-9-]/g, "_")}.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Impossibile scaricare l'XML", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  // ─── Esporta ────────────────────────────────────────────
  // Quello che si vede nella lista (anno, stato e ricerca già applicati).
  const etichettaEsporta = `${annoFilter === "all" ? "tutte" : annoFilter}${statoFilter !== "all" ? `_${statoFilter}` : ""}`;
  const righeEsporta = filtered as unknown as RigaRicevuta[];

  const handleEsportaElenco = async () => {
    setEsportando("elenco");
    try {
      await esportaElencoRicevute(righeEsporta, etichettaEsporta);
      toast.success(`${righeEsporta.length} fatture esportate in Excel`);
    } catch (err) {
      toast.error("Esportazione non riuscita", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setEsportando(null);
    }
  };

  const handleEsportaXml = async () => {
    if (righeEsporta.length > 600) {
      toast.error("Troppe fatture per uno zip solo", { description: "Restringi l'elenco (per anno o per stato): al massimo 600 alla volta." });
      return;
    }
    setEsportando("xml");
    try {
      const esito = await esportaXmlRicevuteZip(supabase, companyId!, righeEsporta, etichettaEsporta, (fatte, totale) => setEsportando(`xml ${fatte}/${totale}`));
      if (esito.inclusi === 0 && esito.senzaXml === 0) toast.info("Nessuna fattura da esportare");
      else if (esito.senzaXml > 0) {
        toast.warning(`${esito.inclusi} XML esportati, ${esito.senzaXml} senza file`, { description: "Le fatture senza XML sono elencate in LEGGIMI.txt dentro lo zip." });
      } else toast.success(`${esito.inclusi} XML esportati`);
    } catch (err) {
      toast.error("Esportazione non riuscita", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setEsportando(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-6 max-sm:space-y-3">
      {/* Header — mobile: solo il titolo (importa XML e classificazione AI al desktop). */}
      <div className="flex items-center justify-between">
        {/* Senza sottotitolo: «Fatture passive ricevute dal Sistema di
            Interscambio» ripeteva il titolo con altre parole. */}
        <div>
          <h1 className="text-2xl font-bold text-foreground max-sm:text-lg">Fatture Ricevute</h1>
        </div>
        <div className="flex items-center gap-3 max-sm:hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.p7m,.zip"
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={esportando !== null || righeEsporta.length === 0} title="Esporta le fatture che vedi nella lista">
                {esportando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                {esportando?.startsWith("xml ") ? `Zip ${esportando.slice(4)}…` : "Esporta"}
                <ChevronDown className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleEsportaElenco()}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Elenco in Excel ({righeEsporta.length})
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void handleEsportaXml()}>
                <Archive className="h-4 w-4 mr-2" /> XML originali (zip)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

      {/* Mobile: una riga con il problema; la spiegazione e il bottone (che
          porta a un collegamento da fare al computer) restano al desktop. */}
      {integrazione?.received_scope_missing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30 max-sm:px-3 max-sm:py-2">
          <div className="flex items-start gap-3 max-sm:items-center max-sm:gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 max-sm:h-4 max-sm:w-4" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 max-sm:text-xs">
                Le fatture dei fornitori non stanno arrivando
              </p>
              <p className="mt-0.5 text-sm text-amber-800 dark:text-amber-300 max-sm:hidden">
                Il collegamento con il gestionale funziona per le fatture che emetti, ma non ha il
                permesso di leggere quelle che ricevi: il provider risponde «permesso negato». Serve
                ricollegare l'account una volta, autorizzando anche i documenti ricevuti.
              </p>
              {/* Da telefono la fatturazione non si imposta (solo computer o tablet). */}
              {!isMobile && (
                <Button asChild variant="outline" size="sm" className="mt-3 border-amber-400 bg-white hover:bg-amber-100">
                  <Link to="/azienda/impostazioni/fatturazione">Ricollega il gestionale</Link>
                </Button>
              )}
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

            {(report.esiti.some((e) => e.stato === "errore" || e.avviso) || report.scartati.length > 0) && (
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2 text-xs">
                {report.esiti
                  .filter((e) => e.stato === "errore" || e.avviso)
                  .map((e) => (
                    <div key={`err-${e.nome}`} className="flex gap-2">
                      <span className="shrink-0 font-medium text-destructive">{e.nome}</span>
                      <span className="text-muted-foreground">{e.motivo || e.avviso}</span>
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

      {/* Testata navy di famiglia. Mobile: due numeri (vedi sotto). */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm max-sm:hidden">
        {/* Senza il titoletto «Fatture ricevute — Quello che i fornitori ti
            mandano»: ripeteva il titolo della pagina. */}
        <div className="bg-eic-navy-deep p-4 text-white sm:p-5">
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <NavyStatCard
              label={annoFilter === "all" ? "Totale ricevute" : `Ricevute nel ${annoFilter}`}
              value={String(kpi.totale)}
              icon={Inbox}
              tone="text-orange-100"
            />
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

      {/* Mobile: «Da leggere» (filtra) e l'importo del periodo, nome e cifra. */}
      <KpiMobili
        className="sm:hidden"
        voci={[
          {
            label: "Da leggere",
            valore: String(kpi.nonLette),
            tono: kpi.nonLette > 0 ? "text-orange-600" : undefined,
            onClick: () => setStatoFilter((s) => (s === "non_letta" ? "all" : "non_letta")),
            attivo: statoFilter === "non_letta",
          },
          {
            label: "Da pagare",
            valore: String(conteggi.daPagare),
            onClick: () => setPagamentoFilter((p) => (p === "da_pagare" ? "all" : "da_pagare")),
            attivo: pagamentoFilter === "da_pagare",
          },
          { label: annoFilter === "all" ? "Importo totale" : `Importo ${annoFilter}`, valore: formatCurrency(kpi.importoTotale) },
        ]}
      />

      {/* Mobile: ricerca e bottone dei filtri (anno e stato nel pannello). */}
      <CercaConFiltri
        className="sm:hidden"
        valore={searchQuery}
        onCambia={setSearchQuery}
        segnaposto="Cerca fornitore o numero"
        filtriAttivi={(annoFilter !== annoCorrente ? 1 : 0) + (statoFilter !== "all" ? 1 : 0)}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Filtri: chip rapidi con il conteggio, poi ricerca e tendine. */}
      <div className="space-y-3 max-sm:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <ChipFiltro attivo={filtriAttivi === 0} onClick={azzeraFiltri} conteggio={fatture.length}>
            Tutte
          </ChipFiltro>
          <ChipFiltro
            attivo={statoFilter === "non_letta"}
            onClick={() => setStatoFilter((s) => (s === "non_letta" ? "all" : "non_letta"))}
            conteggio={kpi.nonLette}
          >
            Da leggere
          </ChipFiltro>
          <ChipFiltro
            attivo={contabFilter === "da_contabilizzare"}
            onClick={() => setContabFilter((c) => (c === "all" ? "da_contabilizzare" : "all"))}
            conteggio={conteggi.daContabilizzare}
          >
            Da contabilizzare
          </ChipFiltro>
          <ChipFiltro
            attivo={pagamentoFilter === "da_pagare"}
            onClick={() => setPagamentoFilter((p) => (p === "da_pagare" ? "all" : "da_pagare"))}
            conteggio={conteggi.daPagare}
          >
            Da pagare
          </ChipFiltro>
          <ChipFiltro
            attivo={ordineFilter === "senza"}
            onClick={() => setOrdineFilter((o) => (o === "senza" ? "all" : "senza"))}
            conteggio={conteggi.senzaOrdine}
          >
            Senza ordine
          </ChipFiltro>
          <ChipFiltro
            attivo={categoriaFilter === "__nessuna__"}
            onClick={() => setCategoriaFilter((c) => (c === "__nessuna__" ? "all" : "__nessuna__"))}
            conteggio={kpi.daClassificare}
          >
            Da classificare
          </ChipFiltro>
          <p className="ml-auto text-xs text-muted-foreground tabular-nums">
            Mostrando <span className="font-medium text-foreground">{filtered.length}</span> di {fatture.length}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca per fornitore, numero fattura, P.IVA..."
              className="border-0 bg-slate-50 pl-9 shadow-none focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Select value={annoFilter} onValueChange={setAnnoFilter}>
            <SelectTrigger className="w-[130px]" aria-label="Anno">
              <SelectValue placeholder="Anno" />
            </SelectTrigger>
            <SelectContent>
              {anniDisponibili.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
              <SelectItem value="all">Tutti gli anni</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statoFilter} onValueChange={setStatoFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Stato">
              <SelectValue placeholder="Stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="non_letta">Non lette</SelectItem>
              <SelectItem value="letta">Lette</SelectItem>
              <SelectItem value="contabilizzata">Contabilizzate</SelectItem>
            </SelectContent>
          </Select>
          {opzioniTipo.length > 0 && (
            <Select value={tipoFilter} onValueChange={setTipoFilter}>
              <SelectTrigger className="w-[150px]" aria-label="Tipo documento">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i tipi</SelectItem>
                {opzioniTipo.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {opzioniCategoria.length > 0 && (
            <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
              <SelectTrigger className="w-[170px]" aria-label="Categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                <SelectItem value="__nessuna__">Non classificate</SelectItem>
                {opzioniCategoria.map((c) => (
                  <SelectItem key={c} value={c}>{etichettaCategoria(c)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={ordineFilter} onValueChange={(v) => setOrdineFilter(v as "all" | "con" | "senza")}>
            <SelectTrigger className="w-[150px]" aria-label="Ordine d'acquisto">
              <SelectValue placeholder="Ordine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ordine: tutti</SelectItem>
              <SelectItem value="con">Con ordine</SelectItem>
              <SelectItem value="senza">Senza ordine</SelectItem>
            </SelectContent>
          </Select>
          {filtriAttivi > 0 && (
            <Button variant="ghost" size="sm" onClick={azzeraFiltri} className="text-muted-foreground">
              <X className="mr-1 h-3.5 w-3.5" />
              Azzera ({filtriAttivi})
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        // Mobile: una riga di testo, senza icona grande né spiegazione.
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground max-sm:py-4">
          <Inbox className="h-12 w-12 mb-4 max-sm:hidden" />
          <p className="text-lg font-medium max-sm:text-xs max-sm:font-normal">
            {fatture.length > 0 ? "Nessuna fattura con questi filtri" : "Nessuna fattura ricevuta"}
          </p>
          <p className="text-sm max-sm:hidden">
            {fatture.length > 0 ? (
              <Button variant="link" size="sm" onClick={azzeraFiltri} className="h-auto p-0">
                Azzera i filtri
              </Button>
            ) : (
              "Le fatture arriveranno automaticamente dal SDI oppure puoi importare XML manualmente."
            )}
          </p>
        </div>
      ) : (
        <>
        {/* Mobile: una riga per fattura (fornitore, numero · data, totale e
            stato); si apre un riquadro dal basso. Via la tabella a dieci colonne. */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setDettaglioMobile(f)}
              className="tap-compact flex w-full items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
            >
              {f.stato === "non_letta" && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label="Da leggere" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight">{f.cedente_ragione_sociale}</div>
                <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  N. {f.numero_fattura} · {formatDateShort(f.data_fattura)}
                  {f.data_ricezione_sdi ? ` · arrivata ${formatDateShort(f.data_ricezione_sdi)}` : ""}
                  {f.categoria_ai ? ` · ${etichettaCategoria(f.categoria_ai)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-semibold leading-tight tabular-nums">
                  {f.totale_documento != null ? formatCurrency(f.totale_documento) : "—"}
                </div>
                <div className={`mt-0.5 text-[11px] leading-tight ${pagataIl(f.id) ? "text-emerald-600" : f.stato === "contabilizzata" ? "text-green-600" : "text-muted-foreground"}`}>
                  {isNotaCreditoRicevuta(f.tipo_documento) ? etichettaStato(f) : pagataIl(f.id) ? "Pagata" : "Da pagare"}
                </div>
              </div>
            </button>
          ))}
        </div>
        <Card className="max-sm:hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <IntestazioneOrdinabile campo="fornitore" ordinamento={ordinamento} onOrdina={ordinaPer}>Fornitore</IntestazioneOrdinabile>
                <TableHead>Tipo</TableHead>
                <TableHead>Numero</TableHead>
                <IntestazioneOrdinabile campo="data" ordinamento={ordinamento} onOrdina={ordinaPer}>Data</IntestazioneOrdinabile>
                <TableHead>Arrivata il</TableHead>
                <TableHead className="text-right">Imponibile</TableHead>
                <TableHead className="text-right">IVA</TableHead>
                <IntestazioneOrdinabile campo="totale" ordinamento={ordinamento} onOrdina={ordinaPer} className="text-right">Totale</IntestazioneOrdinabile>
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
                      <button type="button" className="text-left font-medium hover:underline underline-offset-2" onClick={() => setRiepilogoId(f.id)}>
                        {f.cedente_ragione_sociale}
                      </button>
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
                    <span className="text-xs">{etichettaTipoRicevuta(f.tipo_documento)}</span>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{f.numero_fattura}</TableCell>
                  <TableCell>{formatDateShort(f.data_fattura)}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm"><ArrivataIl f={f} /></TableCell>
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
                    {/* Letta / contabilizzata e, sotto, se l'hai pagata: un clic per segnarla. */}
                    <div className="flex flex-col items-start gap-1">
                      <StatoBadge stato={f.stato} storico={f.storico_esterno} />
                      <PagamentoRicevutaCella id={f.id} numero={f.numero_fattura} tipo={f.tipo_documento} pagataIl={pagataIl(f.id)} />
                    </div>
                  </TableCell>
                  <TableCell>
                    {(quoteOrdini[f.id]?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap items-center gap-0.5">
                        {quoteOrdini[f.id].map((q) => (
                          <Link
                            key={q.purchase_order_id}
                            to={`/azienda/ordini-acquisto/${q.purchase_order_id}`}
                            title={`Quota di questa fattura: ${formatCurrency(q.importo)} (imponibile)`}
                          >
                            <Badge variant="outline" className="font-mono text-[11px] hover:bg-orange-50 hover:border-orange-300 transition-colors">
                              {odaNumbers[q.purchase_order_id] ?? "OdA"}
                              <span className="ml-1 font-sans text-muted-foreground">{formatCurrency(q.importo)}</span>
                            </Badge>
                          </Link>
                        ))}
                        {f.stato !== "contabilizzata" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title="Scollega dagli ordini" aria-label="Scollega dagli ordini"
                            disabled={linkOdaMutation.isPending}
                            onClick={() => linkOdaMutation.mutate({ id: f.id, quote: [] })}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ) : f.purchase_order_id ? (
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
                          onClick={() => linkOdaMutation.mutate({ id: f.id, quote: [] })}
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
                        title="Apri la fattura: righe, totali e collegamenti" aria-label="Apri la fattura"
                        onClick={() => setRiepilogoId(f.id)}
                      >
                        <FileText className="h-4 w-4" />
                      </Button>
                      {/* Niente export su telefono. */}
                      {!isMobile && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Scarica il file originale" aria-label="Scarica il file originale"
                          onClick={() => void handleScaricaOriginale(f)}
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
        </>
      )}

      {/* Mobile: anno e stato. */}
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={(annoFilter !== annoCorrente ? 1 : 0) + (statoFilter !== "all" ? 1 : 0)}
        onAzzera={() => { setAnnoFilter(annoCorrente); setStatoFilter("all"); }}
        risultati={isLoading ? undefined : filtered.length}
      >
        <PilloleFiltro
          titolo="Anno"
          valore={annoFilter}
          onScegli={setAnnoFilter}
          scelte={[...anniDisponibili.map((a) => ({ value: a, label: a })), { value: "all", label: "Tutti" }]}
        />
        <PilloleFiltro
          titolo="Stato"
          valore={statoFilter}
          onScegli={setStatoFilter}
          scelte={[
            { value: "all", label: "Tutti" },
            { value: "non_letta", label: "Da leggere" },
            { value: "letta", label: "Lette" },
            { value: "contabilizzata", label: "Contabilizzate" },
          ]}
        />
      </PannelloFiltri>

      {/* Mobile: la fattura in un riquadro dal basso, coi numeri e l'unica
          azione che serve da telefono (anteprima XML, file, ordine al desktop). */}
      <Sheet open={!!dettaglioMobile} onOpenChange={(o) => { if (!o) setDettaglioMobile(null); }}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl px-4 pb-6">
          {dettaglioMobile && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="pr-6 text-base leading-tight">{dettaglioMobile.cedente_ragione_sociale}</SheetTitle>
              </SheetHeader>
              <p className="mt-1 text-xs text-muted-foreground">
                N. {dettaglioMobile.numero_fattura} · {formatDateShort(dettaglioMobile.data_fattura)}
                {dettaglioMobile.data_ricezione_sdi ? ` · arrivata ${formatDateTime(dettaglioMobile.data_ricezione_sdi)}` : ""}
                {dettaglioMobile.cedente_piva ? ` · P.IVA ${dettaglioMobile.cedente_piva}` : ""}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { l: "Imponibile", v: dettaglioMobile.imponibile_totale },
                  { l: "IVA", v: dettaglioMobile.iva_totale },
                  { l: "Totale", v: dettaglioMobile.totale_documento },
                ].map((x) => (
                  <div key={x.l} className="rounded-lg border px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">{x.l}</p>
                    <p className="text-[13px] font-semibold tabular-nums">{x.v != null ? formatCurrency(x.v) : "—"}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {etichettaStato(dettaglioMobile)}
                {dettaglioMobile.categoria_ai ? ` · ${etichettaCategoria(dettaglioMobile.categoria_ai)}` : ""}
                {dettaglioMobile.purchase_order_id ? ` · ordine ${odaNumbers[dettaglioMobile.purchase_order_id] ?? "collegato"}` : ""}
                {(quoteOrdini[dettaglioMobile.id]?.length ?? 0) > 0
                  ? ` · divisa tra ${quoteOrdini[dettaglioMobile.id].map((q) => odaNumbers[q.purchase_order_id] ?? "OdA").join(", ")}`
                  : ""}
              </p>
              {!isNotaCreditoRicevuta(dettaglioMobile.tipo_documento) && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Pagamento</span>
                  <PagamentoRicevutaCella id={dettaglioMobile.id} numero={dettaglioMobile.numero_fattura} tipo={dettaglioMobile.tipo_documento} pagataIl={pagataIl(dettaglioMobile.id)} />
                </div>
              )}
              <Button
                variant="outline"
                className="mt-4 h-10 w-full"
                onClick={() => { const f = dettaglioMobile; setDettaglioMobile(null); setRiepilogoId(f.id); }}
              >
                <FileText className="h-4 w-4 mr-1" /> Vedi la fattura
              </Button>
              {dettaglioMobile.stato !== "contabilizzata" && (
                <Button
                  className="mt-2 h-10 w-full bg-green-600 hover:bg-green-700"
                  onClick={() => { setContabilizzaFattura(dettaglioMobile); setDettaglioMobile(null); }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Contabilizza
                </Button>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Contabilizza Confirmation Dialog */}
      <AlertDialog open={!!contabilizzaFattura} onOpenChange={(open) => { if (!open) setContabilizzaFattura(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Contabilizza fattura ricevuta</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {/* Mobile: basta il riepilogo sotto, senza la spiegazione. */}
                <p className="max-sm:hidden">
                  {contabilizzaFattura && (quoteOrdini[contabilizzaFattura.id]?.length ?? 0) > 0
                    ? "La fattura è divisa tra più ordini: nasce un costo solo con tutto l'imponibile, ogni ordine (e la sua commessa) prende la sua quota e il costo registrato alla ricezione scende di quella quota (nessun costo doppio). Dopo, le quote non si cambiano più."
                    : contabilizzaFattura?.purchase_order_id
                    ? "La fattura è collegata a un ordine: l'importo del costo già registrato alla ricezione verrà corretto con quello della fattura (nessun costo doppio)."
                    : "Verrà creato il costo corrispondente, con imponibile e IVA della fattura, visibile in Costi e nel Previsionale."}
                </p>
                {contabilizzaFattura && (
                  <div className="bg-muted rounded-md p-3 text-sm space-y-1 max-sm:px-3 max-sm:py-2 max-sm:text-xs">
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
        onScelto={(quote) => {
          if (collegaFattura) linkOdaMutation.mutate({ id: collegaFattura.id, quote });
        }}
      />

      {/* La fattura leggibile + stampa / PDF */}
      <Dialog open={!!fatturaVista} onOpenChange={(o) => { if (!o) setFatturaVista(null); }}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between shrink-0 space-y-0">
            <DialogTitle className="flex items-center gap-2 text-sm font-medium pr-8">
              <FileText className="h-4 w-4" />
              {fatturaVista?.titolo}
            </DialogTitle>
            <div className="flex items-center gap-2 mr-6">
              {/* Il PDF che il fornitore ha messo dentro l'XML, se c'è. */}
              {fatturaVista?.allegatiPdf.map((a) => (
                <Button
                  key={a.nome}
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  title={`Apri il PDF del fornitore (${a.nome})`}
                  onClick={() => {
                    const byte = Uint8Array.from(atob(a.base64), (c) => c.charCodeAt(0));
                    const url = URL.createObjectURL(new Blob([byte], { type: "application/pdf" }));
                    if (!window.open(url, "_blank")) toast.error("Il browser ha bloccato la nuova scheda: consenti i popup per questo sito.");
                    setTimeout(() => URL.revokeObjectURL(url), 60_000);
                  }}
                >
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> PDF del fornitore
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  if (!fatturaVista) return;
                  stampaPreventivoNativo(fatturaVista.html, fatturaVista.titolo).catch((e: unknown) =>
                    toast.error("Impossibile preparare la stampa", { description: e instanceof Error ? e.message : undefined }),
                  );
                }}
              >
                <Printer className="h-3.5 w-3.5 mr-1.5" /> Stampa / Salva PDF
              </Button>
            </div>
          </DialogHeader>
          {fatturaVista && (
            <iframe
              title={fatturaVista.titolo}
              srcDoc={fatturaVista.html}
              sandbox=""
              className="flex-1 w-full bg-white border-0"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* La fattura leggibile, anche senza XML: righe, totali e a cosa è collegata. */}
      <RiepilogoFatturaRicevuta
        fatturaId={riepilogoId}
        companyId={companyId}
        onClose={() => setRiepilogoId(null)}
        azioni={(() => {
          const f = fatture.find((x) => x.id === riepilogoId);
          if (!f) return {};
          return {
            onCollegaOrdine: () => setCollegaFattura(f),
            onContabilizza: () => setContabilizzaFattura(f),
            onVersioneCompleta: () => void handleViewFattura(f),
            onScaricaOriginale: () => void handleScaricaOriginale(f),
          };
        })()}
      />
    </div>
  );
}

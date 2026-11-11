import { useState, useMemo, useRef, useCallback, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AzioniInBloccoRicevute } from "@/components/fatturazione/AzioniInBloccoRicevute";
import type { RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";
import { PagamentoRicevutaCella, etichettaTipoRicevuta, isNotaCreditoRicevuta, usePagamentiParzialiRicevute, usePagamentiRicevute } from "@/components/fatturazione/PagamentoRicevuta";
import { imponibileIvaFornitori, importoFornitori, nonSiPaga, testoRatePagate } from "@/lib/fatturazione/noteDiCredito";
import { importoNotaCredito } from "@/lib/fatturazione/notaCreditoStorno";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { COLONNE_RICEVUTE, leggiColonne, metodiPagamento, prossimaScadenza, salvaColonne, type ColonnaRicevute } from "@/lib/fatturazione/colonneRicevute";
import { useConteggiAllegatiRicevute } from "@/components/fatturazione/AllegatiFattura";
import { Checkbox } from "@/components/ui/checkbox";
import { UsciteSenzaFattura } from "@/components/fatturazione/UsciteSenzaFattura";
import { CompletezzaFatture } from "@/components/fatturazione/CompletezzaFatture";
import { chiaveEmessa, chiaveRicevuta, errorePassaggero, identitaFattura, inParallelo, tempoRimanente } from "@/lib/fatturazione/importMassivo";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { FattureDaAssegnare } from "@/components/fatturazione/FattureDaAssegnare";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency, formatDateShort, formatDateTime } from "@/lib/formatters";
import { CollegaOrdineFatturaDialog } from "@/components/fatturazione/CollegaOrdineFatturaDialog";
import { CollegaFatturaCommesseDialog } from "@/components/fatturazione/CollegaFatturaCommesseDialog";
import { CollegaNotaCreditoDialog } from "@/components/fatturazione/CollegaNotaCreditoDialog";
import { IntegrazioneRicevutaDialog } from "@/components/fatturazione/IntegrazioneRicevutaDialog";
import { CaricaRicevutaPdfDialog } from "@/components/fatturazione/CaricaRicevutaPdfDialog";
import { serveIntegrazione } from "@/lib/fatturazione/integrazioneRicevuta";
import { useStorniNoteCredito } from "@/hooks/useStorniNoteCredito";
import { VerificaFatturaPill } from "@/components/fatturazione/VerificaFatturaPill";
import { leggiVerificheRicevute } from "@/lib/fatturazione/leggiVerificheRicevute";
import { StatoPill } from "@/components/orders/TabellaCommessa";
import { fatturaVerificata, quoteDelCosto } from "@/lib/fatturazione/ripartizioneFattura";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import { etichettaTipoFornitore } from "@/lib/fornitori/tipiFornitore";
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
  Columns3,
  Paperclip,
  Inbox,
  Loader2,
  Link2,
  RotateCcw,
  SlidersHorizontal,
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
  type XmlDaImportare,
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

/** La data della fattura. L'arrivo dallo SDI si legge passando il mouse; se è arrivata dopo, lo dice un piccolo «+3 gg». */
function DataFattura({ f }: { f: { data_fattura: string; data_ricezione_sdi: string | null } }) {
  const giorni = f.data_ricezione_sdi ? giorniDallaFattura(f) : null;
  return (
    <span title={f.data_ricezione_sdi ? `Consegnata dallo SDI il ${formatDateTime(f.data_ricezione_sdi)}` : "Data di arrivo non disponibile"}>
      {formatDateShort(f.data_fattura)}
      {giorni != null && giorni > 0 && <span className="ml-1 text-[11px] text-muted-foreground">+{giorni} gg</span>}
    </span>
  );
}

interface FatturaRicevuta {
  id: string;
  riepilogo_iva?: unknown;
  aliquota_reverse_charge?: number | null;
  cedente_indirizzo?: string | null;
  cedente_cap?: string | null;
  cedente_comune?: string | null;
  cedente_provincia?: string | null;
  pdf_storage_bucket?: string | null;
  pdf_storage_path?: string | null;
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
  ritenuta_importo: number | null;
  xml_url: string | null;
  /** Costo generato contabilizzando: c'è = la fattura è nei conti. */
  company_cost_id: string | null;
  /** true = l'aggancio all'ordine l'ha deciso una persona, non l'automatismo. */
  aggancio_oda_manuale: boolean;
  stato: "non_letta" | "letta" | "contabilizzata" | "rifiutata";
  /** Importata come storico già registrato nel gestionale di prima (data di taglio). */
  storico_esterno?: boolean | null;
  note: string | null;
  note_interne?: string | null;
  piano_pagamento?: unknown;
  netto_a_pagare?: number | null;
  rettifica_motivo?: string | null;
  created_at: string;
  /** Ordine d'acquisto collegato: dal trigger automatico o a mano da qui. */
  purchase_order_id: string | null;
  /** Categoria di spesa proposta dall'AI (null = mai classificata). */
  categoria_ai: string | null;
  sottocategoria_ai: string | null;
  /** 0-1: quanto l'AI e' sicura della categoria. */
  categoria_confidenza: number | null;
  /** Scheda dell'anagrafica collegata: il suo tipo dice se va su una commessa. */
  fornitore_id?: string | null;
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
  const permessiCosti = usePermissions();
  const { data: pagate } = usePagamentiRicevute(companyId);
  const { data: storni } = useStorniNoteCredito(companyId);
  const [collegaNota, setCollegaNota] = useState<FatturaRicevuta | null>(null);
  const [contabilizzaFattura, setContabilizzaFattura] = useState<FatturaRicevuta | null>(null);
  // Una nota di credito senza ordine non si contabilizza da sola: va detto quale fattura storna.
  const apriContabilizza = useCallback((f: FatturaRicevuta) => {
    if (isNotaCreditoRicevuta(f.tipo_documento) && !f.purchase_order_id) setCollegaNota(f);
    else setContabilizzaFattura(f);
  }, []);
  const stornataDelTutto = useCallback((f: FatturaRicevuta) => {
    const s = storni?.perFattura.get(f.id);
    // Quello che si deve al fornitore è al netto della ritenuta: con la ritenuta la nota non arriva al totale.
    return !!s && s.importo >= importoNotaCredito(f) - 0.01;
  }, [storni]);
  const pagataIl = useCallback((id: string) => pagate?.get(id) ?? null, [pagate]);
  const { data: parziali } = usePagamentiParzialiRicevute(companyId);
  const queryClient = useQueryClient();
  const [daIntegrare, setDaIntegrare] = useState<FatturaRicevuta | null>(null);
  const [pdfInCoda, setPdfInCoda] = useState<File[]>([]);
  // Quali ricevute hanno già l'integrazione: poche righe, anche con migliaia di fatture.
  const { data: integrazioni } = useQuery({
    queryKey: ["integrazioni-ricevute", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("documenti_fiscali" as never)
        .select("id, numero, stato, fattura_ricevuta_id").eq("company_id", companyId!)
        .not("fattura_ricevuta_id", "is", null).is("deleted_at", null).neq("stato", "annullata");
      if (error) throw error;
      return new Map(((data ?? []) as unknown as { id: string; numero: string; stato: string; fattura_ricevuta_id: string }[]).map((d) => [d.fattura_ricevuta_id, d]));
    },
  });
  const apriPdfRicevuta = async (f: FatturaRicevuta) => {
    const { data, error } = await supabase.storage.from(f.pdf_storage_bucket!).createSignedUrl(f.pdf_storage_path!, 300);
    if (error || !data) { toast.error("PDF non disponibile", { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank", "noopener");
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Dai Tipi dei fornitori si arriva qui con le fatture di quel fornitore già cercate.
  const [parametri] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => parametri.get("cerca") ?? "");
  const [statoFilter, setStatoFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  // «__nessuna__» = mai classificata dall'AI.
  const [categoriaFilter, setCategoriaFilter] = useState("all");
  const [ordineFilter, setOrdineFilter] = useState<"all" | "con" | "senza">("all");
  const [soloDaVerificare, setSoloDaVerificare] = useState(false);
  const [soloDaRettificare, setSoloDaRettificare] = useState(false);
  const [metodoFilter, setMetodoFilter] = useState("all");
  const [allegatiFilter, setAllegatiFilter] = useState<"all" | "con" | "senza">("all");
  const [colonne, setColonne] = useState<Set<ColonnaRicevute>>(() => leggiColonne());
  const cambiaColonna = (c: ColonnaRicevute, attiva: boolean) => setColonne((prima) => {
    const dopo = new Set(prima);
    if (attiva) dopo.add(c); else dopo.delete(c);
    salvaColonne(dopo);
    return dopo;
  });
  const { data: conteggiAllegati } = useConteggiAllegatiRicevute(companyId);
  const oggiIso = useMemo(() => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }), []);
  const [collegaCommesse, setCollegaCommesse] = useState<FatturaRicevuta | null>(null);
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
  const [collegaFattura, setCollegaFattura] = useState<FatturaRicevuta | null>(null);
  const [progress, setProgress] = useState<{ fatte: number; totale: number; inizio?: number; aggiornato?: number } | null>(null);
  // Prima di importare si dice cosa c'è nel file: quante nuove, quante già dentro.
  const [anteprima, setAnteprima] = useState<{ nuove: XmlDaImportare[]; presenti: XmlDaImportare[]; scartati: FileScartato[]; emesse: number; ricevute: number; incerte: number } | null>(null);
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
      // A pagine: PostgREST ne restituisce al massimo mille per volta, e oltre
      // quelle la lista e i numeri in alto erano tagliati senza dirlo.
      const pagina = (from: number, to: number) => {
      let q = supabase
        .from("fatture_ricevute" as never)
        .select(
          "id, company_id, sdi_id_trasmissione, cedente_piva, cedente_cf, cedente_ragione_sociale, cedente_paese, tipo_documento, numero_fattura, data_fattura, data_ricezione_sdi, imponibile_totale, iva_totale, totale_documento, ritenuta_importo, xml_url, stato, note, created_at, purchase_order_id, company_cost_id, aggancio_oda_manuale, categoria_ai, sottocategoria_ai, categoria_confidenza, storico_esterno, fornitore_id, note_interne, piano_pagamento, netto_a_pagare, rettifica_motivo, riepilogo_iva, aliquota_reverse_charge, cedente_indirizzo, cedente_cap, cedente_comune, cedente_provincia, pdf_storage_bucket, pdf_storage_path" as never,
        )
        .eq("company_id", companyId!)
        .order("data_fattura", { ascending: false })
        .order("id", { ascending: true });
      if (annoFilter !== "all") {
        q = q
          .gte("data_fattura", `${annoFilter}-01-01`)
          .lte("data_fattura", `${annoFilter}-12-31`);
      }
      return q.range(from, to) as unknown as PromiseLike<{ data: FatturaRicevuta[] | null; error: unknown }>;
      };
      return tutteLePagine<FatturaRicevuta>(pagina);
    },
  });

  // Le fatture divise tra più ordini: una quota per ordine (30/10/2026).
  // Il tipo dei fornitori collegati (materiali, subappalto, spese generali…).
  const { data: tipiFornitori = {} } = useQuery({
    queryKey: ["fatture-ricevute-tipi-fornitori", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("suppliers").select("id, tipo").eq("company_id", companyId).not("tipo", "is", null);
      if (error) throw error;
      return Object.fromEntries(((data ?? []) as Array<{ id: string; tipo: string }>).map((x) => [x.id, x.tipo])) as Record<string, string>;
    },
  });

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
  const { data: verifiche = {}, isError: erroreVerifiche, isPending: caricaVerifiche, refetch: rileggiVerifiche } = useQuery({
    queryKey: ["fatture-ricevute", "verifiche", companyId, "complete-v2"],
    enabled: !!companyId,
    queryFn: () => leggiVerificheRicevute(companyId!),
  });
  const verifichePronte = !erroreVerifiche && !caricaVerifiche;
  const verificata = useCallback((f: FatturaRicevuta) => fatturaVerificata({ stato: f.stato, verifica_manuale: verifiche[f.id] }), [verifiche]);
  // Le commesse di ogni fattura: stanno sul suo costo, una o più di una.
  const idCosti = useMemo(() => [...new Set(fatture.map((f) => f.company_cost_id).filter(Boolean))].sort() as string[], [fatture]);
  const { data: datiCosti } = useQuery({
    queryKey: ["fatture-costi-commesse", companyId, idCosti],
    enabled: !!companyId && idCosti.length > 0,
    queryFn: async () => {
      const costi: Array<{ id: string; order_id: string | null; allocations: unknown; is_paid: boolean | null; paid_date: string | null }> = [];
      for (let i = 0; i < idCosti.length; i += 100) {
        const { data, error } = await (supabase as any).from("company_costs").select("id, order_id, allocations, is_paid, paid_date").eq("company_id", companyId!).in("id", idCosti.slice(i, i + 100));
        if (error) throw error;
        costi.push(...(data ?? []));
      }
      const quote = Object.fromEntries(costi.map((c) => [c.id, quoteDelCosto(c)]));
      const idOrdini = [...new Set(Object.values(quote).flat().map((q) => q.order_id))];
      const codici = new Map<string, string>();
      for (let i = 0; i < idOrdini.length; i += 100) {
        const { data, error } = await (supabase as any).from("orders").select("id, order_code").eq("company_id", companyId!).in("id", idOrdini.slice(i, i + 100));
        if (error) throw error;
        for (const o of (data ?? []) as Array<{ id: string; order_code: string | null }>) codici.set(o.id, o.order_code ?? "Commessa");
      }
      return {
        quote: Object.fromEntries(Object.entries(quote).map(([id, q]) => [id, q.map((x) => ({ ...x, codice: codici.get(x.order_id) ?? "Commessa" }))])),
        // Il pagamento vero sta sul costo: una fattura può essere pagata senza che sia segnato su di lei.
        pagati: Object.fromEntries(costi.filter((c) => c.is_paid).map((c) => [c.id, c.paid_date])) as Record<string, string | null>,
      };
    },
  });
  const commesseDi = useCallback((f: FatturaRicevuta) => (f.company_cost_id ? datiCosti?.quote[f.company_cost_id] ?? [] : []), [datiCosti]);
  const pagataSulCosto = useCallback((f: FatturaRicevuta) => !!f.company_cost_id && !!datiCosti && f.company_cost_id in datiCosti.pagati, [datiCosti]);
  const haCollegamento = useCallback((f: FatturaRicevuta) => haOrdine(f) || commesseDi(f).length > 0, [haOrdine, commesseDi]);

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
    const importoTotale = importoFornitori(fatture);
    const { imponibile, iva } = imponibileIvaFornitori(fatture);
    // Fatture importate senza importi (es. cassetto SDI Aruba): il totale le
    // conta come 0 → lo dichiariamo, così il KPI non sembra falsato.
    const senzaImporto = fatture.filter((f) => f.totale_documento == null).length;
    const daClassificare = fatture.filter((f) => !f.categoria_ai).length;
    // Bollo, cassa o dati incompleti: quello che imponibile e IVA non spiegano si dice, non si nasconde.
    const altro = Math.round((importoTotale - imponibile - iva) * 100) / 100;
    return { totale, nonLette, contabilizzate, importoTotale, imponibile, iva, altro, senzaImporto, daClassificare };
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
      daContabilizzare: fatture.filter((f) => !f.company_cost_id && f.stato !== "rifiutata" && !storni?.perNota.has(f.id)).length,
      senzaOrdine: fatture.filter((f) => !haCollegamento(f)).length,
      daVerificare: fatture.filter((f) => f.stato !== "rifiutata" && !verificata(f) && verifiche[f.id] !== "da_rettificare").length,
      daRettificare: fatture.filter((f) => verifiche[f.id] === "da_rettificare").length,
      daPagare: fatture.filter((f) => !nonSiPaga(f.tipo_documento) && !stornataDelTutto(f) && !pagataSulCosto(f) && !pagataIl(f.id)).length,
    }),
    [fatture, haCollegamento, verificata, verifiche, pagataIl, pagataSulCosto, stornataDelTutto, storni],
  );
  // Quelli dentro «Altri filtri»: si contano sul bottone, altrimenti non si vedono.
  const opzioniMetodo = useMemo(() => [...new Set(fatture.flatMap((f) => metodiPagamento(f.piano_pagamento)))].sort(), [fatture]);
  const altriFiltriAttivi = (metodoFilter !== "all" ? 1 : 0) + (allegatiFilter !== "all" ? 1 : 0) + (statoFilter !== "all" ? 1 : 0) + (tipoFilter !== "all" ? 1 : 0) + (categoriaFilter !== "all" ? 1 : 0) + (ordineFilter !== "all" ? 1 : 0);
  const filtriAttivi =
    (statoFilter !== "all" ? 1 : 0) +
    (tipoFilter !== "all" ? 1 : 0) +
    (categoriaFilter !== "all" ? 1 : 0) +
    (ordineFilter !== "all" ? 1 : 0) +
    (contabFilter !== "all" ? 1 : 0) +
    (pagamentoFilter !== "all" ? 1 : 0) +
    (searchQuery.trim() ? 1 : 0) +
    (soloDaVerificare ? 1 : 0) +
    (soloDaRettificare ? 1 : 0) +
    (metodoFilter !== "all" ? 1 : 0) +
    (allegatiFilter !== "all" ? 1 : 0);
  const azzeraFiltri = () => {
    setSoloDaVerificare(false);
    setSoloDaRettificare(false);
    setMetodoFilter("all");
    setAllegatiFilter("all");
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
      result = result.filter((f) => haCollegamento(f));
    } else if (ordineFilter === "senza") {
      result = result.filter((f) => !haCollegamento(f));
    }
    if (soloDaVerificare && verifichePronte) result = result.filter((f) => f.stato !== "rifiutata" && !verificata(f) && verifiche[f.id] !== "da_rettificare");
    if (soloDaRettificare && verifichePronte) result = result.filter((f) => verifiche[f.id] === "da_rettificare");
    if (metodoFilter !== "all") result = result.filter((f) => metodiPagamento(f.piano_pagamento).includes(metodoFilter));
    if (allegatiFilter !== "all") result = result.filter((f) => ((conteggiAllegati?.get(f.id) ?? 0) > 0) === (allegatiFilter === "con"));
    if (contabFilter === "da_contabilizzare") {
      result = result.filter((f) => !f.company_cost_id && f.stato !== "rifiutata" && !storni?.perNota.has(f.id));
    }
    if (pagamentoFilter === "da_pagare") {
      result = result.filter((f) => !nonSiPaga(f.tipo_documento) && !stornataDelTutto(f) && !pagataSulCosto(f) && !pagataIl(f.id));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (f) =>
          f.cedente_ragione_sociale?.toLowerCase().includes(q) ||
          f.numero_fattura?.toLowerCase().includes(q) ||
          f.cedente_piva?.includes(q) ||
          f.note_interne?.toLowerCase().includes(q) ||
          f.note?.toLowerCase().includes(q) ||
          f.rettifica_motivo?.toLowerCase().includes(q)
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
  }, [fatture, haCollegamento, verificata, verifiche, verifichePronte, metodoFilter, allegatiFilter, conteggiAllegati, soloDaRettificare, pagataSulCosto, soloDaVerificare, statoFilter, tipoFilter, categoriaFilter, ordineFilter, contabFilter, pagamentoFilter, pagataIl, stornataDelTutto, storni, searchQuery, ordinamento, haOrdine]);

  // Modifiche in blocco: si selezionano le fatture che l'elenco mostra, anche dopo aver filtrato.
  const puoInBlocco = !permessiCosti.solaLettura;
  const [selezionate, setSelezionate] = useState<Set<string>>(new Set());
  const [aziendaSelezione, setAziendaSelezione] = useState(companyId);
  if (aziendaSelezione !== companyId) {
    setAziendaSelezione(companyId);
    setSelezionate(new Set());
  }
  const cambiaSelezione = useCallback((id: string, dentro: boolean) => {
    setSelezionate((prima) => {
      const dopo = new Set(prima);
      if (dentro) dopo.add(id); else dopo.delete(id);
      return dopo;
    });
  }, []);
  const righeInBlocco = useMemo<RicevutaInBlocco[]>(() => filtered.filter((f) => selezionate.has(f.id)).map((f) => ({
    id: f.id,
    numero: f.numero_fattura,
    totale: f.totale_documento,
    stato: f.stato,
    tipo: f.tipo_documento,
    pagataIl: pagataIl(f.id),
    pagataSulCosto: pagataSulCosto(f),
    verificata: verificata(f),
    stornata: stornataDelTutto(f),
    storico: !!f.storico_esterno,
    notaSenzaOrdine: isNotaCreditoRicevuta(f.tipo_documento) && !f.purchase_order_id,
    conOrdine: !!f.purchase_order_id,
    scadenze: Array.isArray(f.piano_pagamento) ? (f.piano_pagamento as Array<{ scadenza?: string | null }>).map((r) => r.scadenza ?? null) : [],
  })), [filtered, selezionate, pagataIl, pagataSulCosto, verificata, stornataDelTutto]);
  const tutteSelezionate = filtered.length > 0 && righeInBlocco.length === filtered.length;
  const selezionaTutte = useCallback(() => setSelezionate(new Set(filtered.map((f) => f.id))), [filtered]);

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
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute-tipi-fornitori"] });
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
    const tutti = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    // Un PDF non è una fattura elettronica: i suoi dati li scrive chi lo carica.
    const pdf = tutti.filter((f) => /\.pdf$/i.test(f.name));
    if (pdf.length > 0) setPdfInCoda((coda) => [...coda, ...pdf]);
    const files = tutti.filter((f) => !/\.pdf$/i.test(f.name));
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

    // Quello che è già dentro col suo file si salta: così si ricarica lo stesso archivio
    // dopo un'interruzione e si riparte da dove era.
    const presentiNoti = new Set<string>();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [ric, em] = await Promise.all([
        tutteLePagine<{ cedente_piva: string | null; cedente_cf: string | null; numero_fattura: string; data_fattura: string }>((from, to) => db.from("fatture_ricevute")
          .select("id, cedente_piva, cedente_cf, numero_fattura, data_fattura").eq("company_id", companyId).not("xml_url", "is", null).order("id").range(from, to)),
        tutteLePagine<{ invoice_number: string; issue_date: string }>((from, to) => db.from("invoices")
          .select("id, invoice_number, issue_date").eq("company_id", companyId).eq("external_provider", "xml_import").not("external_xml_url", "is", null).order("id").range(from, to)),
      ]);
      for (const r of ric) presentiNoti.add(chiaveRicevuta(r.cedente_piva || r.cedente_cf, r.numero_fattura, r.data_fattura));
      for (const e of em) presentiNoti.add(`E|${chiaveEmessa(e.invoice_number, e.issue_date)}`);
    } catch { /* senza il confronto ci pensa il server: i doppioni non si scrivono comunque */ }

    const nuove: XmlDaImportare[] = [];
    const presenti: XmlDaImportare[] = [];
    let emesse = 0; let ricevute = 0; let incerte = 0;
    for (const f of daImportare) {
      const direzione = classificaDirezione(f.contenuto, partitaIvaAzienda);
      if (direzione === "attiva") emesse++; else if (direzione === "passiva") ricevute++; else incerte++;
      const id = identitaFattura(f.contenuto);
      const chiave = id && (direzione === "attiva" ? `E|${chiaveEmessa(id.numero, id.data)}` : chiaveRicevuta(id.cedente, id.numero, id.data));
      if (chiave && presentiNoti.has(chiave)) presenti.push(f); else nuove.push(f);
    }
    setProgress(null);
    setAnteprima({ nuove, presenti, scartati, emesse, ricevute, incerte });
  };

  const importaUna = async (f: XmlDaImportare): Promise<EsitoImport> => {
      // Emessa o ricevuta? Lo dice il confronto fra le partite IVA. Quando non
      // e' chiaro NON si indovina: mandare una fattura nel posto sbagliato
      // falserebbe ricavi o costi, e sistemarlo dopo e' molto piu' caro.
      const direzione = classificaDirezione(f.contenuto, partitaIvaAzienda);
      if (direzione === "incerta") {
        return {
          nome: f.nome,
          stato: "errore",
          motivo: partitaIvaAzienda
            ? "Non risulta ne' emessa ne' ricevuta da questa azienda: controlla le partite IVA nel file."
            : "Partita IVA dell'azienda non configurata: impostala in Impostazioni per poter distinguere emesse e ricevute.",
        };
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
        let resp = await supabase.functions.invoke(funzione, { body });
        // Errori passeggeri: riprovare è innocuo, un doppione non si scrive due volte.
        for (let tentativo = 1; tentativo <= 2 && resp.error; tentativo++) {
          const stato = (resp.error as { context?: Response }).context?.status;
          if (!errorePassaggero(resp.error.message, stato)) break;
          await new Promise((ok) => setTimeout(ok, 1500 * tentativo));
          resp = await supabase.functions.invoke(funzione, { body });
        }
        if (resp.error) {
          // Il corpo della risposta porta il motivo vero (numero gia' esistente,
          // cedente sbagliato); resp.error.message da solo direbbe solo "non-2xx".
          let motivo = resp.error.message;
          try {
            const dettaglio = await (resp.error as { context?: Response }).context?.json?.();
            if (dettaglio?.error) motivo = dettaglio.error;
          } catch { /* resta il messaggio generico */ }
          return { nome: f.nome, stato: "errore", motivo, direzione };
        } else if (resp.data?.duplicate && resp.data?.completed) {
          // Già registrata coi soli dati: ora ha anche il file originale.
          return { nome: f.nome, stato: "importata", direzione };
        } else if (resp.data?.duplicate) {
          return { nome: f.nome, stato: "duplicata", direzione };
        } else if (resp.data?.success) {
          return { nome: f.nome, stato: "importata", direzione, ...(resp.data.warning ? {avviso:String(resp.data.warning)} : {}) };
        } else {
          return { nome: f.nome, stato: "errore", motivo: resp.data?.error ?? "Fattura rifiutata dal sistema.", direzione };
        }
      } catch (err) {
        return { nome: f.nome, stato: "errore", motivo: err instanceof Error ? err.message : "Errore imprevisto.", direzione };
      }
  };

  const avviaImport = async () => {
    if (!anteprima) return;
    const { nuove, presenti, scartati } = anteprima;
    setAnteprima(null);
    setReport(null);
    const inizio = Date.now();
    setProgress({ fatte: 0, totale: nuove.length, inizio, aggiornato: inizio });
    // Chi chiude la scheda a metà perde solo quelle non ancora partite: basta ricaricare il file.
    const avvisaUscita = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avvisaUscita);
    let esiti: EsitoImport[] = presenti.map((f) => ({ nome: f.nome, stato: "duplicata" as const }));
    try {
      esiti = [...esiti, ...await inParallelo(nuove, 4, importaUna, (fatte) => setProgress({ fatte, totale: nuove.length, inizio, aggiornato: Date.now() }))];
    } finally {
      window.removeEventListener("beforeunload", avvisaUscita);
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
    if (f.pdf_storage_path && f.pdf_storage_bucket) { await apriPdfRicevuta(f); return; }
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
    if (f.pdf_storage_path && f.pdf_storage_bucket) { await apriPdfRicevuta(f); return; }
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
            accept=".xml,.p7m,.zip,.pdf"
            multiple
            className="hidden"
            onChange={handleFileUpload}
          />
          {/* Il tipo del fornitore decide se la fattura va su una commessa o nelle spese generali. */}
          <Button variant="outline" asChild>
            <Link to="/azienda/documenti/tipi-fornitori">Tipi dei fornitori</Link>
          </Button>
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
                ? `Importazione ${progress.fatte} di ${progress.totale}${progress.inizio && progress.aggiornato && tempoRimanente(progress.fatte, progress.totale, progress.aggiornato - progress.inizio) ? ` · ${tempoRimanente(progress.fatte, progress.totale, progress.aggiornato - progress.inizio)}` : "…"}`
                : "Lettura file…"
              : "Importa XML o PDF"}
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
      {anteprima && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="space-y-3 p-4">
            <p className="font-medium">Cosa c'è nel file</p>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="default">{anteprima.nuove.length} da importare</Badge>
              {anteprima.presenti.length > 0 && <Badge variant="secondary">{anteprima.presenti.length} già presenti</Badge>}
              <Badge variant="outline">{anteprima.emesse} emesse</Badge>
              <Badge variant="outline">{anteprima.ricevute} ricevute</Badge>
              {anteprima.incerte > 0 && <Badge variant="destructive">{anteprima.incerte} di un'altra azienda</Badge>}
              {anteprima.scartati.length > 0 && <Badge variant="destructive">{anteprima.scartati.length} scartate</Badge>}
            </div>
            {anteprima.scartati.length > 0 && (
              <ul className="max-h-32 overflow-y-auto text-xs text-muted-foreground">
                {anteprima.scartati.slice(0, 50).map((x) => <li key={x.nome}>{x.nome}: {x.motivo}</li>)}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">Tieni aperta questa pagina fino alla fine. Se si interrompe, ricarica lo stesso file: riparte da quelle che mancano.</p>
            <div className="flex gap-2">
              <Button size="sm" disabled={anteprima.nuove.length === 0} onClick={() => void avviaImport()}>Importa {anteprima.nuove.length} fatture</Button>
              <Button size="sm" variant="outline" onClick={() => setAnteprima(null)}>Annulla</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controlli da ufficio: da telefono si parte dall'elenco. */}
      <div className="space-y-4 max-md:hidden">
        {companyId && <CompletezzaFatture companyId={companyId} />}
        {companyId && permessiCosti.canViewCosts && <UsciteSenzaFattura companyId={companyId} puoModificare={!permessiCosti.solaLettura} />}
      </div>

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
            {/* Il totale è quello che si paga ai fornitori; sotto, di quanto è merce e quanta IVA. */}
            <NavyStatCard
              label="Importo totale"
              value={formatCurrency(kpi.importoTotale)}
              sub={`Imponibile ${formatCurrency(kpi.imponibile)} + IVA ${formatCurrency(kpi.iva)}${Math.abs(kpi.altro) >= 0.01 ? ` + altro ${formatCurrency(kpi.altro)}` : ""}${kpi.senzaImporto > 0 ? ` · ${kpi.senzaImporto} senza importo` : ""}`}
              icon={Euro}
            />
          </div>
        </div>
      </div>

      {companyId && permessiCosti.canViewCosts && (
        <FattureDaAssegnare companyId={companyId} puoModificare={!permessiCosti.solaLettura} />
      )}

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
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca per fornitore, numero fattura, P.IVA..."
              className="pl-9"
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
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-1.5">
                <SlidersHorizontal className="h-4 w-4" />Altri filtri
                {altriFiltriAttivi > 0 && <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">{altriFiltriAttivi}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              {opzioniMetodo.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">Modalità di pagamento</span>
                  <Select value={metodoFilter} onValueChange={setMetodoFilter}>
                    <SelectTrigger aria-label="Modalità di pagamento"><SelectValue placeholder="Modalità" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte</SelectItem>
                      {opzioniMetodo.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label className="block space-y-1 text-sm"><span className="font-medium">Allegati</span>
                <Select value={allegatiFilter} onValueChange={(v) => setAllegatiFilter(v as "all" | "con" | "senza")}>
                  <SelectTrigger aria-label="Allegati"><SelectValue placeholder="Allegati" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte</SelectItem>
                    <SelectItem value="con">Con allegati</SelectItem>
                    <SelectItem value="senza">Senza allegati</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1 text-sm"><span className="font-medium">Stato</span>
                <Select value={statoFilter} onValueChange={setStatoFilter}>
                  <SelectTrigger aria-label="Stato"><SelectValue placeholder="Stato" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    <SelectItem value="non_letta">Non lette</SelectItem>
                    <SelectItem value="letta">Lette</SelectItem>
                    <SelectItem value="contabilizzata">Contabilizzate</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {opzioniTipo.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">Tipo di documento</span>
                  <Select value={tipoFilter} onValueChange={setTipoFilter}>
                    <SelectTrigger aria-label="Tipo documento"><SelectValue placeholder="Tipo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      {opzioniTipo.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {opzioniCategoria.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">Categoria</span>
                  <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                    <SelectTrigger aria-label="Categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte</SelectItem>
                      <SelectItem value="__nessuna__">Non classificate</SelectItem>
                      {opzioniCategoria.map((c) => <SelectItem key={c} value={c}>{etichettaCategoria(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label className="block space-y-1 text-sm"><span className="font-medium">Collegamento</span>
                <Select value={ordineFilter} onValueChange={(v) => setOrdineFilter(v as "all" | "con" | "senza")}>
                  <SelectTrigger aria-label="Collegamento"><SelectValue placeholder="Collegamento" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutte</SelectItem>
                    <SelectItem value="con">Collegate</SelectItem>
                    <SelectItem value="senza">Da collegare</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-1.5 max-sm:hidden"><Columns3 className="h-4 w-4" />Colonne</Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-60 space-y-2">
              {COLONNE_RICEVUTE.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={colonne.has(c.id)} onCheckedChange={(v) => cambiaColonna(c.id, v === true)} />
                  {c.etichetta}
                </label>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        {/* Cosa c'è da fare: a zero non serve vederlo. */}
        <div className="flex flex-wrap items-center gap-2">
          <ChipFiltro attivo={filtriAttivi === 0} onClick={azzeraFiltri} conteggio={fatture.length}>
            Tutte
          </ChipFiltro>
          {([
            { attivo: statoFilter === "non_letta", fai: () => setStatoFilter((v) => (v === "non_letta" ? "all" : "non_letta")), n: kpi.nonLette, testo: "Da leggere" },
            { attivo: soloDaVerificare, fai: () => setSoloDaVerificare((v) => !v), n: conteggi.daVerificare, testo: "Da verificare" },
            { attivo: soloDaRettificare, fai: () => setSoloDaRettificare((v) => !v), n: conteggi.daRettificare, testo: "Da rettificare" },
            { attivo: ordineFilter === "senza", fai: () => setOrdineFilter((v) => (v === "senza" ? "all" : "senza")), n: conteggi.senzaOrdine, testo: "Da collegare" },
            { attivo: contabFilter === "da_contabilizzare", fai: () => setContabFilter((v) => (v === "all" ? "da_contabilizzare" : "all")), n: conteggi.daContabilizzare, testo: "Da contabilizzare" },
            { attivo: pagamentoFilter === "da_pagare", fai: () => setPagamentoFilter((v) => (v === "da_pagare" ? "all" : "da_pagare")), n: conteggi.daPagare, testo: "Da pagare" },
            { attivo: categoriaFilter === "__nessuna__", fai: () => setCategoriaFilter((v) => (v === "__nessuna__" ? "all" : "__nessuna__")), n: kpi.daClassificare, testo: "Da classificare" },
          ]).filter((c) => (verifichePronte || !["Da verificare", "Da rettificare"].includes(c.testo)) && (c.n > 0 || c.attivo)).map((c) => (
            <ChipFiltro key={c.testo} attivo={c.attivo} onClick={c.fai} conteggio={c.n}>{c.testo}</ChipFiltro>
          ))}
          {filtriAttivi > 0 && (
            <Button variant="ghost" size="sm" onClick={azzeraFiltri} className="h-7 text-muted-foreground">
              <X className="mr-1 h-3.5 w-3.5" />Azzera
            </Button>
          )}
          <p className="ml-auto text-xs tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{filtered.length}</span> di {fatture.length}
          </p>
        </div>
      </div>

      {erroreVerifiche && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>Stati di verifica non disponibili. I filtri di verifica sono sospesi finché i dati non vengono riletti.</span><Button variant="outline" size="sm" onClick={() => void rileggiVerifiche()}>Rileggi verifiche</Button></div>}
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
        {puoInBlocco && companyId && righeInBlocco.length > 0 && (
          <AzioniInBloccoRicevute companyId={companyId} righe={righeInBlocco} filtrate={filtered.length} onSelezionaTutte={selezionaTutte} onSvuota={() => setSelezionate(new Set())} />
        )}
        {/* Mobile: una riga per fattura (fornitore, numero · data, totale e
            stato); si apre un riquadro dal basso. Via la tabella a dieci colonne. */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center">
            {puoInBlocco && (
              <label className="flex shrink-0 items-center self-stretch pl-3 pr-1">
                <Checkbox checked={selezionate.has(f.id)} onCheckedChange={(v) => cambiaSelezione(f.id, v === true)} aria-label={`Seleziona la fattura ${f.numero_fattura}`} />
              </label>
            )}
            <button
              type="button"
              onClick={() => setDettaglioMobile(f)}
              className="tap-compact flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
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
                <div className={`mt-0.5 text-[11px] leading-tight ${pagataIl(f.id) || pagataSulCosto(f) ? "text-emerald-600" : f.stato === "contabilizzata" ? "text-green-600" : "text-muted-foreground"}`}>
                  {isNotaCreditoRicevuta(f.tipo_documento) ? (storni?.perNota.has(f.id) ? "Collegata" : etichettaStato(f)) : nonSiPaga(f.tipo_documento) ? etichettaStato(f) : stornataDelTutto(f) ? "Stornata" : pagataIl(f.id) || pagataSulCosto(f) ? "Pagata" : parziali?.has(f.id) ? testoRatePagate(parziali.get(f.id)!.pagate, parziali.get(f.id)!.totali) : "Da pagare"}
                </div>
              </div>
            </button>
            </div>
          ))}
        </div>
        <Card className="max-sm:hidden">
          {/* L'elenco scorre dentro il riquadro: così la barra orizzontale resta
              a vista anche con migliaia di fatture, e l'intestazione non scappa. */}
          <Table wrapperClassName="max-h-[70vh] tabella-scorrevole">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
              <TableRow>
                {puoInBlocco && (
                  <TableHead className="w-8 pr-0">
                    <Checkbox aria-label="Seleziona tutte le fatture dell'elenco" checked={tutteSelezionate ? true : righeInBlocco.length ? "indeterminate" : false}
                      onCheckedChange={(v) => (v === true ? selezionaTutte() : setSelezionate(new Set()))} />
                  </TableHead>
                )}
                <IntestazioneOrdinabile campo="fornitore" ordinamento={ordinamento} onOrdina={ordinaPer}>Fornitore</IntestazioneOrdinabile>
                <TableHead>Numero</TableHead>
                <IntestazioneOrdinabile campo="data" ordinamento={ordinamento} onOrdina={ordinaPer}>Data</IntestazioneOrdinabile>
                {colonne.has("imponibile") && <TableHead className="text-right">Imponibile</TableHead>}
                <IntestazioneOrdinabile campo="totale" ordinamento={ordinamento} onOrdina={ordinaPer} className="text-right">Totale</IntestazioneOrdinabile>
                {colonne.has("netto") && <TableHead className="text-right">Netto</TableHead>}
                {colonne.has("stato") && <TableHead>Stato</TableHead>}
                {colonne.has("verifica") && <TableHead>Verifica</TableHead>}
                {colonne.has("pagamento") && <TableHead>Pagamento</TableHead>}
                {colonne.has("metodo") && <TableHead>Modalità</TableHead>}
                {colonne.has("scadenza") && <TableHead>Scadenza</TableHead>}
                {colonne.has("collegata") && <TableHead>Collegata a</TableHead>}
                {colonne.has("allegati") && <TableHead>Allegati</TableHead>}
                {colonne.has("note") && <TableHead>Note</TableHead>}
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow
                  key={f.id}
                  className={`[&>td]:py-1.5 ${f.stato === "non_letta" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                >
                  {puoInBlocco && (
                    <TableCell className="w-8 pr-0">
                      <Checkbox checked={selezionate.has(f.id)} onCheckedChange={(v) => cambiaSelezione(f.id, v === true)} aria-label={`Seleziona la fattura ${f.numero_fattura}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    {/* Una riga sola: P.IVA, tipo e categoria si leggono passando il mouse. */}
                    <button type="button" className="block max-w-[260px] truncate text-left font-medium underline-offset-2 hover:underline" onClick={() => setRiepilogoId(f.id)}
                      title={[
                        f.cedente_ragione_sociale,
                        f.cedente_piva ? `P.IVA ${f.cedente_piva}` : f.cedente_cf,
                        f.fornitore_id ? etichettaTipoFornitore(tipiFornitori[f.fornitore_id]) : null,
                        f.categoria_ai ? `${etichettaCategoria(f.categoria_ai)}${f.sottocategoria_ai ? ` · ${f.sottocategoria_ai}` : ""}` : null,
                      ].filter(Boolean).join("\n")}>
                      {f.cedente_ragione_sociale}
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="block max-w-[190px] truncate font-mono text-sm" title={f.numero_fattura}>{f.numero_fattura}</span>
                      {integrazioni?.get(f.id) ? (
                        <Link to={`/azienda/documenti/${integrazioni.get(f.id)!.id}`} className="whitespace-nowrap text-xs text-emerald-700 underline-offset-2 hover:underline" title={`Integrazione ${integrazioni.get(f.id)!.numero}`}>Integrata</Link>
                      ) : serveIntegrazione(f) && (
                        <button type="button" onClick={() => setDaIntegrare(f)} className={`whitespace-nowrap text-xs underline-offset-2 hover:underline ${f.pdf_storage_path ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {f.pdf_storage_path ? "Da regolarizzare" : "Integra"}
                        </button>
                      )}
                      {etichettaTipoRicevuta(f.tipo_documento) !== "Fattura" && <span className="whitespace-nowrap text-xs text-muted-foreground">{etichettaTipoRicevuta(f.tipo_documento)}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <DataFattura f={f} />
                  </TableCell>
                  {colonne.has("imponibile") && <TableCell className="text-right">
                    {f.imponibile_totale != null ? formatCurrency(f.imponibile_totale) : <span className="text-muted-foreground">—</span>}
                  </TableCell>}
                  <TableCell className="whitespace-nowrap text-right font-medium" title={f.iva_totale != null ? `IVA ${formatCurrency(f.iva_totale)}` : undefined}>
                    {f.totale_documento != null ? formatCurrency(f.totale_documento) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {colonne.has("netto") && <TableCell className="whitespace-nowrap text-right">{f.netto_a_pagare != null ? formatCurrency(f.netto_a_pagare) : <span className="text-muted-foreground">—</span>}</TableCell>}
                  {colonne.has("stato") && <TableCell><StatoBadge stato={f.stato} storico={f.storico_esterno} /></TableCell>}
                  {colonne.has("verifica") && <TableCell>
                    {f.stato === "rifiutata" ? <span className="text-muted-foreground">—</span> : !verifichePronte ? <span className="text-xs text-muted-foreground">{caricaVerifiche ? "Lettura verifica…" : "Verifica non disponibile"}</span> : <VerificaFatturaPill daRettificare={verifiche[f.id] === "da_rettificare"} motivoRettifica={f.rettifica_motivo} id={f.id} numero={f.numero_fattura} verificata={verificata(f)} puoCambiare={!!permessiCosti.canViewCosts && !permessiCosti.solaLettura} />}
                  </TableCell>}
                  {colonne.has("pagamento") && <TableCell>
                    {isNotaCreditoRicevuta(f.tipo_documento) ? (
                      f.stato === "rifiutata" ? <span className="text-muted-foreground">—</span> : (
                        <button type="button" className="whitespace-nowrap text-xs underline underline-offset-2 hover:text-foreground" onClick={() => setCollegaNota(f)}>
                          {storni?.perNota.has(f.id)
                            ? `Storna ${fatture.filter((x) => storni.perNota.get(f.id)!.fatture.includes(x.id)).map((x) => x.numero_fattura).join(", ") || "una fattura"}`
                            : <span className="text-amber-700 dark:text-amber-400">Collega alla fattura</span>}
                        </button>
                      )
                    ) : nonSiPaga(f.tipo_documento) ? <span className="text-muted-foreground">—</span> : stornataDelTutto(f) ? (
                      <StatoPill tono="grigio">Stornata</StatoPill>
                    ) : pagataSulCosto(f) && !pagataIl(f.id) ? (
                      <StatoPill tono="verde">Pagata{datiCosti?.pagati[f.company_cost_id!] ? ` ${formatDateShort(datiCosti.pagati[f.company_cost_id!]!)}` : ""}</StatoPill>
                    ) : pagataIl(f.id) ? (
                      <PagamentoRicevutaCella forma="chip" id={f.id} numero={f.numero_fattura} tipo={f.tipo_documento} pagataIl={pagataIl(f.id)} />
                    ) : (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-amber-700 dark:text-amber-400">{parziali?.has(f.id) ? testoRatePagate(parziali.get(f.id)!.pagate, parziali.get(f.id)!.totali) : "Da pagare"}<PagamentoRicevutaCella forma="icona" id={f.id} numero={f.numero_fattura} tipo={f.tipo_documento} pagataIl={pagataIl(f.id)} /></span>
                    )}
                  </TableCell>}
                  {colonne.has("metodo") && <TableCell className="whitespace-nowrap text-xs">{metodiPagamento(f.piano_pagamento).join(", ") || <span className="text-muted-foreground">—</span>}</TableCell>}
                  {colonne.has("scadenza") && <TableCell className="whitespace-nowrap text-xs">{prossimaScadenza(f.piano_pagamento, oggiIso) ? formatDateShort(prossimaScadenza(f.piano_pagamento, oggiIso)!) : <span className="text-muted-foreground">—</span>}</TableCell>}
                  {colonne.has("collegata") && <TableCell>
                    <div className="flex flex-nowrap items-center gap-1">
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
                      <div className="flex flex-nowrap items-center gap-1">
                        {commesseDi(f).slice(0, 2).map((q) => (
                          <Link key={q.order_id} to={`/azienda/ordini/${q.order_id}`} title={q.pct < 100 ? `Quota ${q.pct.toLocaleString("it-IT")}%: ${formatCurrency((Number(f.totale_documento ?? 0) * q.pct) / 100)}` : undefined}>
                            <Badge variant="outline" className="whitespace-nowrap text-[11px] hover:bg-orange-50 hover:border-orange-300">{q.codice}</Badge>
                          </Link>
                        ))}
                        {commesseDi(f).length > 2 && <span className="text-xs text-muted-foreground" title={commesseDi(f).slice(2).map((q) => q.codice).join(", ")}>+{commesseDi(f).length - 2}</span>}
                        {commesseDi(f).length ? (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title="Cambia il collegamento" aria-label={`Cambia il collegamento della fattura ${f.numero_fattura}`} onClick={() => setCollegaCommesse(f)}>
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title="Collega a una o più commesse, o a un ordine d'acquisto" onClick={() => setCollegaCommesse(f)}>
                            <Link2 className="mr-1 h-3.5 w-3.5" />Collega
                          </Button>
                        )}
                      </div>
                    )}
                    {/* Chi ha deciso l'aggancio si vede, e si può tornare indietro: senza questo, "scollegata
                        a mano" era uno stato invisibile che spiegava perché il sistema non riagganciava più. */}
                    {f.aggancio_oda_manuale && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title="Scelto a mano: il sistema non riaggancia più questa fattura da solo. Clicca per restituirgliela." aria-label="Riattiva l'aggancio automatico"
                        onClick={() => riattivaAutomaticoMutation.mutate(f.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    </div>
                  </TableCell>}
                  {colonne.has("allegati") && <TableCell>
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title="Apri la fattura per vedere o aggiungere allegati" aria-label={`Allegati della fattura ${f.numero_fattura}`} onClick={() => setRiepilogoId(f.id)}>
                      <Paperclip className="h-3.5 w-3.5" />{conteggiAllegati?.get(f.id) ?? 0}
                    </button>
                  </TableCell>}
                  {colonne.has("note") && <TableCell className="max-w-[220px] truncate text-xs" title={f.note_interne ?? undefined}>{f.note_interne || <span className="text-muted-foreground">—</span>}</TableCell>}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
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
                          className="h-8 w-8"
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
                          size="icon"
                          className="h-8 w-8 text-green-700 hover:bg-green-50 hover:text-green-800"
                          title="Contabilizza" aria-label={`Contabilizza la fattura ${f.numero_fattura}`}
                          onClick={() => apriContabilizza(f)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        {/* La barra delle modifiche in blocco è fissa: senza questo spazio coprirebbe le ultime righe. */}
        {righeInBlocco.length > 0 && <div aria-hidden="true" className="h-28" />}
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
              {!nonSiPaga(dettaglioMobile.tipo_documento) && (
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
                  onClick={() => { apriContabilizza(dettaglioMobile); setDettaglioMobile(null); }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Contabilizza
                </Button>
              )}
              {isNotaCreditoRicevuta(dettaglioMobile.tipo_documento) && dettaglioMobile.stato !== "rifiutata" && (dettaglioMobile.stato === "contabilizzata" || !!dettaglioMobile.purchase_order_id) && (
                <Button
                  variant="outline"
                  className="mt-2 h-10 w-full"
                  onClick={() => { setCollegaNota(dettaglioMobile); setDettaglioMobile(null); }}
                >
                  {storni?.perNota.has(dettaglioMobile.id) ? "Cambia la fattura stornata" : "Collega alla fattura"}
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

      {collegaCommesse && companyId && (
        <CollegaFatturaCommesseDialog companyId={companyId} onChiudi={() => setCollegaCommesse(null)}
          onScegliOrdine={collegaCommesse.stato !== "contabilizzata" ? () => { setCollegaFattura(collegaCommesse); setCollegaCommesse(null); } : undefined}
          fattura={{ id: collegaCommesse.id, numero: collegaCommesse.numero_fattura, fornitore: collegaCommesse.cedente_ragione_sociale, imponibile: collegaCommesse.imponibile_totale, totale: collegaCommesse.totale_documento, companyCostId: collegaCommesse.company_cost_id, purchaseOrderId: collegaCommesse.purchase_order_id, suOrdini: (quoteOrdini[collegaCommesse.id]?.length ?? 0) > 0 }} />
      )}
      {collegaNota && <CollegaNotaCreditoDialog nota={collegaNota} onChiudi={() => setCollegaNota(null)} />}

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

      <IntegrazioneRicevutaDialog fattura={daIntegrare} onClose={() => setDaIntegrare(null)} />
      <CaricaRicevutaPdfDialog
        file={pdfInCoda[0] ?? null}
        companyId={companyId}
        onClose={() => setPdfInCoda((coda) => coda.slice(1))}
        onCaricata={() => {
          setPdfInCoda((coda) => coda.slice(1));
          void queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
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
            onCollegaCommesse: () => { setRiepilogoId(null); setCollegaCommesse(f); },
            onContabilizza: () => apriContabilizza(f),
            onVersioneCompleta: () => void handleViewFattura(f),
            onScaricaOriginale: () => void handleScaricaOriginale(f),
          };
        })()}
      />
    </div>
  );
}

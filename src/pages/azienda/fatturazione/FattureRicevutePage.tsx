import { BOTTONE_SECONDARIO, BOTTONE_NUOVO, RICERCA_BARRA } from "@/components/orders/TestataScheda";
import { corrispondeTestoPronto, terminiRicercaRicevute, testoRicercaRicevute, type TestoRicerca } from "@/lib/fatturazione/ricercaRicevute";
import { leggiXmlRicevuta, scaricaOriginaleRicevuta } from "@/lib/fatturazione/originaleRicevuta";
import { useState, useMemo, useCallback, useEffect, useDeferredValue, type ComponentProps, type ReactNode } from "react";
import { useTestoCheSegue } from "@/hooks/useTestoCheSegue";
import { cn } from "@/lib/utils";
import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { Link, useSearchParams } from "react-router-dom";
import { useFiltriUrl } from "@/hooks/useFiltriUrl";
import { PagamentiSegnatiDaSistemare } from "@/components/fatturazione/PagamentiSegnatiDaSistemare";
import { useDebounce } from "@/hooks/useDebounce";
import { idAttivitaValido } from "../../../../shared/aiAttivita";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { useContabilizzaPerPagare } from "@/hooks/useContabilizzaPerPagare";
import { AzioniInBloccoRicevute } from "@/components/fatturazione/AzioniInBloccoRicevute";
import type { RicevutaInBlocco } from "@/lib/fatturazione/azioniInBlocco";
import { PagamentoRicevutaCella, etichettaTipoRicevuta, isNotaCreditoRicevuta } from "@/components/fatturazione/PagamentoRicevuta";
import { useSaldiRicevute, type SaldoRicevuta } from "@/hooks/useSaldiRicevute";
import { imponibileIvaFornitori, importoFornitori, nonSiPaga, testoRatePagate } from "@/lib/fatturazione/noteDiCredito";
import { importoNotaCredito } from "@/lib/fatturazione/notaCreditoStorno";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { COLONNE_RICEVUTE, leggiColonne, metodiPagamento, prossimaScadenza, salvaColonne, type ColonnaRicevute } from "@/lib/fatturazione/colonneRicevute";
import { useConteggiAllegatiRicevute } from "@/components/fatturazione/AllegatiFattura";
import { Checkbox } from "@/components/ui/checkbox";
import { UsciteSenzaFattura } from "@/components/fatturazione/UsciteSenzaFattura";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useLetturaRicevuta } from "@/hooks/useLetturaRicevuta";
import { ricevutaDaLeggere } from "@/lib/fatturazione/letturaRicevuta";
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
import { ImportaFattureDialog } from "@/components/fatturazione/ImportaFattureDialog";
import { serveIntegrazione } from "@/lib/fatturazione/integrazioneRicevuta";
import { useStorniNoteCredito } from "@/hooks/useStorniNoteCredito";
import { VerificaFatturaPill } from "@/components/fatturazione/VerificaFatturaPill";
import { leggiVerificheRicevute } from "@/lib/fatturazione/leggiVerificheRicevute";
import { StatoPill } from "@/components/orders/TabellaCommessa";
import { fatturaVerificata, quoteDelCosto } from "@/lib/fatturazione/ripartizioneFattura";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";
import { CellaProtocolloRicevuta, NumeraProtocolliRicevute, useProtocolliRicevute } from "@/components/fatturazione/ProtocolloRicevuta";
import { CellaProtocolloCommessa, NumeraProtocolliCommesse, useProtocolliCommessa } from "@/components/fatturazione/ProtocolloCommessa";
import { RiepilogoFatture, TESTI_RICEVUTE } from "@/components/fatturazione/RiepilogoFatture";
import { MonthlyTimeline } from "@/components/fatturazione/MonthlyTimeline";
import { mesiRicevute } from "@/lib/fatturazione/mesiRicevute";
import { etichettaTipoFornitore } from "@/lib/fornitori/tipiFornitore";
import type { QuotaOrdine } from "@/lib/fatturazione/quoteOrdini";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExpensePaymentDialog } from "@/components/orders/ExpensePaymentDialog";
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
  FileSpreadsheet,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  MoreHorizontal,
  Building2,
  Tags,
  Plus,
} from "lucide-react";
import { NavyStatCard } from "@/components/costi/KpiCard";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fatturaRicevutaHtml, type FatturaRicevutaVista } from "@/lib/fatturazione/fatturaRicevutaHtml";
import { FatturaRicevutaCompletaDialog } from "@/components/fatturazione/FatturaRicevutaCompletaDialog";
import { esportaElencoRicevute, esportaXmlRicevuteZip, type RigaRicevuta } from "@/lib/fatturazione/esportaRicevute";
import { toast } from "sonner";
import { invalidaStatisticheFatturazione } from "@/lib/fatturazione/invalidaStatistiche";

import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CercaConFiltri, KpiMobili, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
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

/**
 * Le due date di una fattura ricevuta (12/11/2026): quando l'ha emessa il fornitore e
 * quando è arrivata dallo SDI. Possono essere lontane (una fattura di settembre che
 * arriva oggi): ognuna ha la sua colonna, e l'arrivo dice quanti giorni dopo.
 */
function DataEmissione({ f }: { f: { data_fattura: string } }) {
  return <span>{formatDateShort(f.data_fattura)}</span>;
}

function DataArrivo({ f }: { f: { data_fattura: string; data_ricezione_sdi: string | null } }) {
  const t = useT();
  if (!f.data_ricezione_sdi) return <span className="text-muted-foreground" title={t("Data di arrivo non disponibile")}>—</span>;
  const giorni = giorniDallaFattura(f);
  return (
    <span title={t("Consegnata dallo SDI il {data_ricezione_sdi}", { data_ricezione_sdi: formatDateTime(f.data_ricezione_sdi) })}>
      {formatDateShort(f.data_ricezione_sdi)}
      {giorni != null && giorni > 0 && <span className="ml-1 text-[11px] text-muted-foreground">{t("+{giorni} gg", { giorni: String(giorni ?? "") })}</span>}
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
  da_leggere?: boolean | null;
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
  /** Protocollo del cantiere: la commessa generale e il numero dentro quella («Che12»). */
  protocollo_commessa_id?: string | null;
  protocollo_commessa_numero?: number | null;
}

/**
 * I saldi finché non sono arrivati: una mappa vuota, sempre la stessa, così la
 * striscia dei mesi si disegna subito con pagato e residuo a zero invece di
 * lasciare il posto alla testata di «tutti gli anni» e poi sostituirla.
 */
const SALDI_IN_ARRIVO: ReadonlyMap<string, SaldoRicevuta> = new Map();

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

function testoSaldo(saldo: SaldoRicevuta | undefined, t: ReturnType<typeof useT>) {
  if (!saldo) return "—";
  if (saldo.stornata) return t("Stornata");
  if (saldo.pagata_il || saldo.data_saldo) return t("Pagata");
  if (saldo.residuo == null) return t("Da verificare");
  if (saldo.residuo === 0) return saldo.pagato ? t("Pagata") : t("Nessun residuo");
  if (saldo.rate_pagate > 0 && saldo.rate_pagate < saldo.rate_totali) {
    return testoRatePagate(saldo.rate_pagate, saldo.rate_totali);
  }
  return saldo.pagato ? t("Parziale") : t("Da pagare");
}

function ImportoRicevuta({ valore, titolo }: { valore?: number | null; titolo?: string }) {
  return <span title={titolo} className={cn("whitespace-nowrap tabular-nums", valore == null && "text-muted-foreground")}>
    {valore == null ? "—" : formatCurrency(valore)}
  </span>;
}

/** La contabilizzata dello storico (data di taglio) non è passata da qui: si dice. */
const etichettaStato = (f: { stato: string; storico_esterno?: boolean | null; da_leggere?: boolean | null }, t: ReturnType<typeof useT>) => {
  if (f.stato === "non_letta" || f.stato === "letta") return ricevutaDaLeggere(f) ? t("Non letta") : t("Letta");
  const base = f.storico_esterno && f.stato === "contabilizzata" ? t("Già registrata (storico)") : STATO_CONFIG[f.stato] ? t(STATO_CONFIG[f.stato].label) : f.stato;
  return ricevutaDaLeggere(f) ? `${base} · ${t("Non letta")}` : base;
};

function StatoBadge({ stato, storico, daLeggere }: { stato: string; storico?: boolean | null; daLeggere?: boolean | null }) {
  const t = useT();
  const daAprire = ricevutaDaLeggere({ stato, da_leggere: daLeggere });
  const visuale = stato === "non_letta" || stato === "letta" ? (daAprire ? "non_letta" : "letta") : stato;
  const config = STATO_CONFIG[visuale] || { label: visuale, variant: "outline" as const };
  return <span className="inline-flex flex-wrap gap-1"><Badge variant={storico && stato === "contabilizzata" ? "outline" : config.variant}>{storico && stato === "contabilizzata" ? t("Già registrata (storico)") : t(config.label)}</Badge>{daAprire && stato !== "non_letta" && stato !== "letta" && <Badge variant="destructive">{t("Non letta")}</Badge>}</span>;
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
          // Il filtro attivo in arancio tenue, come le pillole di Commesse e Sicurezza (25/11/2026): il blu pieno
          // sembrava un bottone d'azione.
          ? "border-orange-200 bg-orange-50 text-orange-700"
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
  const tr = useT();
  // La barra di scorrimento in alto, come nei DDT (12/11/2026): la tabella è larga e quella di sistema sta in fondo.
  const [riquadroTabella, setRiquadroTabella] = useState<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const companyId = useEffectiveCompanyId();
  const lettura = useLetturaRicevuta(companyId);
  const permessiCosti = usePermissions();
  // Protocollo interno: colonna accanto al numero, per chi legge la contabilità (23/11/2026).
  const protocolli = useProtocolliRicevute(companyId);
  // Protocollo del cantiere: «Che12», un progressivo per commessa generale (25/11/2026).
  const protocolliCantiere = useProtocolliCommessa(companyId);
  const { data: storni } = useStorniNoteCredito(companyId);
  const [collegaNota, setCollegaNota] = useState<FatturaRicevuta | null>(null);
  const [contabilizzaFattura, setContabilizzaFattura] = useState<FatturaRicevuta | null>(null);
  // Una nota di credito senza ordine non si contabilizza da sola: va detto quale fattura storna.
  const apriContabilizza = useCallback((f: FatturaRicevuta) => {
    if (isNotaCreditoRicevuta(f.tipo_documento) && !f.purchase_order_id) setCollegaNota(f);
    else setContabilizzaFattura(f);
  }, []);
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
    if (error || !data) { toast.error(tr("PDF non disponibile"), { description: error?.message }); return; }
    window.open(data.signedUrl, "_blank", "noopener");
    if (ricevutaDaLeggere(f)) lettura.mutate({ id: f.id, daLeggere: false });
  };

  // Dai Tipi dei fornitori si arriva qui con le fatture di quel fornitore già cercate.
  const [parametri, setParametri] = useSearchParams();
  const fatturaDaAprire = parametri.get("fattura");
  const analisiDaAprire = parametri.get("analisi");
  // I filtri stanno nell'indirizzo e si ricordano (26/11/2026). Prima vivevano in
  // `useState`: «cerchiamo le fatture di un fornitore, entriamo in una fattura, usciamo e
  // la ricerca è sparita». Ora il tasto indietro li ritrova nell'indirizzo, e chi torna
  // all'elenco dal menu li ritrova nella memoria di sessione.
  const filtriUrl = useFiltriUrl("ricevute", {
    cerca: "", stato: "all", tipo: "all", categoria: "all", ordine: "all",
    metodo: "all", allegati: "all", daverificare: "0", darettificare: "0",
    contab: "all", pagamento: "all", mese: "",
  });
  /**
   * I filtri si cambiano anche nella forma `set(prima => dopo)`, come i `useState` che
   * queste scorciatoie hanno sostituito: i punti che la usano sono una dozzina e non
   * valeva la pena riscriverli tutti.
   */
  type Aggiorna<V> = V | ((prima: V) => V);
  const risolvi = <V,>(v: Aggiorna<V>, attuale: V): V =>
    typeof v === "function" ? (v as (p: V) => V)(attuale) : v;
  const cambiaFiltro = <V extends string>(
    chiave: Parameters<typeof filtriUrl.imposta>[0], v: Aggiorna<V>, attuale: V,
  ) => filtriUrl.imposta(chiave, risolvi(v, attuale));

  // La ricerca si digita: l'indirizzo si scrive solo quando le dita si fermano, se no ogni
  // lettera passerebbe dal router su un elenco di più di mille fatture.
  const [searchQuery, setSearchQuery] = useState(() => filtriUrl.valori.cerca);
  const ricercaFerma = useDebounce(searchQuery, 300);
  useEffect(() => {
    const testo = ricercaFerma.trim();
    if (testo === filtriUrl.valori.cerca) return;
    filtriUrl.imposta("cerca", testo);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- si scrive quando cambia la ricerca, non quando cambiano gli altri filtri
  }, [ricercaFerma]);

  const statoFilter = filtriUrl.valori.stato;
  const setStatoFilter = (v: Aggiorna<string>) => cambiaFiltro("stato", v, statoFilter);
  const tipoFilter = filtriUrl.valori.tipo;
  const setTipoFilter = (v: Aggiorna<string>) => cambiaFiltro("tipo", v, tipoFilter);
  // «__nessuna__» = mai classificata dall'AI.
  const categoriaFilter = filtriUrl.valori.categoria;
  const setCategoriaFilter = (v: Aggiorna<string>) => cambiaFiltro("categoria", v, categoriaFilter);
  const ordineFilter = filtriUrl.valori.ordine as "all" | "con" | "senza";
  const setOrdineFilter = (v: Aggiorna<"all" | "con" | "senza">) => cambiaFiltro("ordine", v, ordineFilter);
  const soloDaVerificare = filtriUrl.valori.daverificare === "1";
  const setSoloDaVerificare = (v: Aggiorna<boolean>) =>
    filtriUrl.imposta("daverificare", risolvi(v, soloDaVerificare) ? "1" : "0");
  const soloDaRettificare = filtriUrl.valori.darettificare === "1";
  const setSoloDaRettificare = (v: Aggiorna<boolean>) =>
    filtriUrl.imposta("darettificare", risolvi(v, soloDaRettificare) ? "1" : "0");
  const metodoFilter = filtriUrl.valori.metodo;
  const setMetodoFilter = (v: Aggiorna<string>) => cambiaFiltro("metodo", v, metodoFilter);
  const allegatiFilter = filtriUrl.valori.allegati as "all" | "con" | "senza";
  const setAllegatiFilter = (v: Aggiorna<"all" | "con" | "senza">) => cambiaFiltro("allegati", v, allegatiFilter);
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
  // Dal Controllo di gestione si arriva con ?filtro=da_contabilizzare.
  // Dal Controllo di gestione si arriva con «?filtro=da_contabilizzare»: resta un ingresso
  // valido, e da lì in poi vale «?contab=» come per gli altri filtri.
  const contabFilter = (parametri.get("filtro") === "da_contabilizzare" && filtriUrl.valori.contab === "all"
    ? "da_contabilizzare"
    : filtriUrl.valori.contab) as "all" | "da_contabilizzare";
  const setContabFilter = (v: Aggiorna<"all" | "da_contabilizzare">) => cambiaFiltro("contab", v, contabFilter);
  const [ordinamento, setOrdinamento] = useState<{ campo: "data" | "fornitore" | "totale"; dir: "asc" | "desc" }>({
    campo: "data",
    dir: "desc",
  });
  // Le fatture dei fornitori arrivano dall'import del gestionale: Best Infissi
  // ne ha 6.979 dal 2020 e la pagina le chiedeva TUTTE, oltre il tetto di mille
  // righe di PostgREST — che tagliava via una parte dell'anno in corso. Si parte
  // dall'anno corrente, gli altri restano un clic più in là.
  const annoCorrente = String(new Date().getFullYear());
  const [annoFilter, salvaAnno] = useState(annoCorrente);
  // Il mese scelto nella striscia (16/11/2026): filtra l'elenco e i sei numeri; cambia anno = si toglie.
  const meseScelto = filtriUrl.valori.mese || null;
  const setMeseScelto = (v: string | null) => filtriUrl.imposta("mese", v ?? "");
  // La striscia dei mesi si apre col bottone «Mesi» (25/11/2026), come nelle emesse.
  // Il perché dell'avviso «Le fatture dei fornitori non stanno arrivando»: si apre a richiesta.
  const [perchePermesso, setPerchePermesso] = useState(false);
  const setAnnoFilter = (anno: string) => {
    if (anno === annoFilter) return;
    salvaAnno(anno);
    setMeseScelto(null);
  };
  // La fattura aperta nel riepilogo leggibile (righe, totali, collegamenti).
  const [riepilogoId, setRiepilogoId] = useState<string | null>(() => idAttivitaValido(fatturaDaAprire) ? fatturaDaAprire : null);
  const [fatturaVista, setFatturaVista] = useState<(FatturaRicevutaVista & { origine: FatturaRicevuta }) | null>(null);
  const [esportando, setEsportando] = useState<string | null>(null);
  const [collegaFattura, setCollegaFattura] = useState<FatturaRicevuta | null>(null);
  // L'import vive tutto nel popup: file, anteprima riga per riga, spunte, esito.
  const [moduloUscitaAperto, setModuloUscitaAperto] = useState(false);
  const [importaAperto, setImportaAperto] = useState(false);
  // 23/11/2026: «Paga» nella riga apre il pagamento già pronto (importo, oggi, conto), con i
  // movimenti di banca della fattura. Prima c'era solo un'icona muta che segnava pagata oggi.
  const [pagaCosto, setPagaCosto] = useState<{ costId: string; importo: number } | null>(null);
  // «Paga» è lo stesso per ogni fattura: se non è ancora contabilizzata, la contabilizza e apre il pannello.
  const perPagare = useContabilizzaPerPagare();
  const pagaRiga = (f: FatturaRicevuta, importo: number) => {
    if (f.company_cost_id) { setPagaCosto({ costId: f.company_cost_id, importo }); return; }
    if (perPagare.isPending) return;
    perPagare.mutate(f.id, { onSuccess: (costId) => setPagaCosto({ costId, importo }) });
  };
  const [confermaClassifica, setConfermaClassifica] = useState(false);
  const [classProgress, setClassProgress] = useState<{ fatte: number; totale: number } | null>(null);
  // Mobile: anno e stato in un pannello dal basso; una fattura si apre in un
  // riquadro dal basso con i numeri e «Contabilizza».
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const [selezioneMobile, setDettaglioMobile] = useState<FatturaRicevuta | null>(null);
  // «Da pagare»: le fatture dei fornitori non ancora pagate (né a mano né con tutte le rate).
  const pagamentoFilter = filtriUrl.valori.pagamento as "all" | "da_pagare";
  const setPagamentoFilter = (v: Aggiorna<"all" | "da_pagare">) => cambiaFiltro("pagamento", v, pagamentoFilter);
  const { data: saldi, isError: erroreSaldi, refetch: rileggiSaldi } = useSaldiRicevute(companyId, annoFilter);
  const pagataIl = useCallback((id: string) => saldi?.get(id)?.pagata_il ?? null, [saldi]);
  const stornataDelTutto = useCallback((f: FatturaRicevuta) => {
    const saldo = saldi?.get(f.id);
    if (saldo) return saldo.stornata;
    const s = storni?.perFattura.get(f.id);
    return !!s && s.importo >= importoNotaCredito(f) - 0.01;
  }, [saldi, storni]);
  const daPagare = useCallback((f: FatturaRicevuta) => (saldi?.get(f.id)?.residuo ?? 0) > 0, [saldi]);

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

  const { data: fatture = [], isLoading, isError: erroreFatture, refetch: rileggiFatture } = useQuery({
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
          "id, da_leggere, company_id, sdi_id_trasmissione, cedente_piva, cedente_cf, cedente_ragione_sociale, cedente_paese, tipo_documento, numero_fattura, data_fattura, data_ricezione_sdi, imponibile_totale, iva_totale, totale_documento, ritenuta_importo, xml_url, stato, note, created_at, purchase_order_id, company_cost_id, aggancio_oda_manuale, categoria_ai, sottocategoria_ai, categoria_confidenza, storico_esterno, fornitore_id, note_interne, piano_pagamento, netto_a_pagare, rettifica_motivo, riepilogo_iva, aliquota_reverse_charge, cedente_indirizzo, cedente_cap, cedente_comune, cedente_provincia, pdf_storage_bucket, pdf_storage_path, protocollo_commessa_id, protocollo_commessa_numero" as never,
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
  const dettaglioMobile = selezioneMobile?.company_id === companyId && selezioneMobile
    ? fatture.find(f => f.id === selezioneMobile.id) ?? selezioneMobile
    : null;

  // Le fatture divise tra più ordini: una quota per ordine (30/10/2026).
  // Il tipo dei fornitori collegati (materiali, subappalto, spese generali…).
  const { data: tipiFornitori = {} } = useQuery({
    queryKey: ["fatture-ricevute-tipi-fornitori", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const data = await tutteLePagine((from, to) => supabase.from("suppliers").select("id, tipo")
        .eq("company_id", companyId!).not("tipo", "is", null).order("id").range(from, to));
      return Object.fromEntries(data.flatMap(x => x.tipo ? [[x.id, x.tipo] as const] : []));
    },
  });

  const { data: quoteOrdini = {}, isLoading: caricaQuote, isError: erroreQuote, refetch: rileggiQuote } = useQuery({
    queryKey: ["fatture-quote-ordini", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const data = await tutteLePagine((from, to) => supabase
        .from("fattura_ricevuta_ordini")
        .select("fattura_id, purchase_order_id, importo")
        .eq("company_id", companyId!).order("fattura_id").order("purchase_order_id").range(from, to));
      const perFattura: Record<string, Array<{ purchase_order_id: string; importo: number }>> = {};
      for (const r of data) {
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
  const { data: datiCosti, isLoading: caricaCosti, isError: erroreCosti, refetch: rileggiCosti } = useQuery({
    queryKey: ["fatture-costi-commesse", companyId, idCosti],
    enabled: !!companyId && idCosti.length > 0,
    queryFn: async () => {
      const costi: Array<{ id: string; order_id: string | null; allocations: unknown }> = [];
      for (let i = 0; i < idCosti.length; i += 100) {
        const { data, error } = await supabase.from("company_costs").select("id, order_id, allocations").eq("company_id", companyId!).in("id", idCosti.slice(i, i + 100));
        if (error) throw error;
        costi.push(...(data ?? []));
      }
      const quote = Object.fromEntries(costi.map((c) => [c.id, quoteDelCosto(c)]));
      const idOrdini = [...new Set(Object.values(quote).flat().map((q) => q.order_id))];
      const commesse = new Map<string, { codice: string; descrizione: string | null; indirizzo: string | null }>();
      // Una fattura messa su tutta l'operazione (commessa generale) si riconosce in elenco (18/11/2026).
      const generali = new Set<string>();
      for (let i = 0; i < idOrdini.length; i += 100) {
        const { data, error } = await (supabase as any).from("orders").select("id, order_code, description, work_address, workflow_kind").eq("company_id", companyId!).in("id", idOrdini.slice(i, i + 100));
        if (error) throw error;
        for (const o of (data ?? []) as Array<{ id: string; order_code: string | null; description: string | null; work_address: string | null; workflow_kind: string | null }>) {
          commesse.set(o.id, { codice: o.order_code ?? "Commessa", descrizione: o.description, indirizzo: o.work_address });
          if (o.workflow_kind === "generale") generali.add(o.id);
        }
      }
      return {
        quote: Object.fromEntries(Object.entries(quote).map(([id, allocazioni]) => [id, allocazioni.map((quota) => {
          const commessa = commesse.get(quota.order_id);
          return {
            ...quota,
            codice: commessa?.codice ?? "Commessa",
            descrizione: commessa?.descrizione ?? null,
            indirizzo: commessa?.indirizzo ?? null,
            generale: generali.has(quota.order_id),
          };
        })])),
      };
    },
  });
  function dataScadenza(f: FatturaRicevuta) {
    if (nonSiPaga(f.tipo_documento)) return "—";
    const data = prossimaScadenza(f.piano_pagamento, oggiIso);
    const piano = Array.isArray(f.piano_pagamento) ? f.piano_pagamento : [];
    const riba = piano.some(r => r?.modalita === "MP12" && (typeof r.scadenza === "string" ? r.scadenza.slice(0, 10) : null) === data);
    return [data ? formatDateShort(data) : "—", riba && "Ri.Ba."].filter(Boolean).join(" · ");
  }
  const commesseDi = useCallback((f: FatturaRicevuta) => (f.company_cost_id ? datiCosti?.quote[f.company_cost_id] ?? [] : []), [datiCosti]);
  const pagataSulCosto = useCallback((f: FatturaRicevuta) => {
    const saldo = saldi?.get(f.id);
    return saldo?.residuo === 0 && (saldo.pagato ?? 0) > 0 && !saldo.stornata;
  }, [saldi]);
  const haCollegamento = useCallback((f: FatturaRicevuta) => haOrdine(f) || commesseDi(f).length > 0, [haOrdine, commesseDi]);

  // I numeri OdA degli ordini collegati: una query sola per tutta la lista,
  // così il badge mostra "ODA-2026-028" e non un uuid.
  const linkedOdaIds = useMemo(
    () => [...new Set([
      ...fatture.map((f) => f.purchase_order_id),
      ...fatture.flatMap((f) => (quoteOrdini[f.id] ?? []).map((q) => q.purchase_order_id)),
    ].filter(Boolean))].sort() as string[],
    [fatture, quoteOrdini],
  );
  const { data: ordiniCollegati = {}, isLoading: caricaOrdini, isError: erroreOrdini, refetch: rileggiOrdini } = useQuery({
    queryKey: ["fatture-oda-numbers", companyId, linkedOdaIds],
    enabled: !!companyId && linkedOdaIds.length > 0,
    queryFn: async () => {
      const riferimenti: Record<string, { numero: string | null; cantiere: Array<string | null> }> = {};
      for (let i = 0; i < linkedOdaIds.length; i += 100) {
        const { data, error } = await supabase.from("purchase_orders")
          .select("id, oda_number, orders!purchase_orders_order_id_fkey(order_code, description, work_address)")
          .eq("company_id", companyId!)
          .in("id", linkedOdaIds.slice(i, i + 100));
        if (error) throw error;
        for (const o of data ?? []) {
          riferimenti[o.id] = {
            numero: o.oda_number,
            cantiere: o.orders ? [o.orders.order_code, o.orders.description, o.orders.work_address] : [],
          };
        }
      }
      return riferimenti;
    },
  });
  const odaNumbers = useMemo(() => Object.fromEntries(
    Object.entries(ordiniCollegati).flatMap(([id, ordine]) => ordine.numero ? [[id, ordine.numero] as const] : []),
  ), [ordiniCollegati]);
  const erroreRiferimenti = erroreQuote || erroreCosti || erroreOrdini;
  const filtraPerRiferimenti = !!searchQuery.trim() || ordineFilter !== "all";
  const ricercaRiferimentiInCorso = filtraPerRiferimenti && (caricaQuote || caricaCosti || caricaOrdini);

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
    const nonLette = fatture.filter(ricevutaDaLeggere).length;
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

  // I dodici mesi dell'anno scelto, dalle fatture già caricate (stesse regole della tabella).
  //
  // Quale testata si vede dipende SOLO dall'anno scelto, non dal fatto che i dati
  // siano arrivati: con un anno è la striscia dei mesi, con «tutti gli anni» la
  // testata blu. Prima qui c'era `|| !saldi`, e i saldi arrivano dopo (la query
  // aspetta l'azienda, che a sua volta si risolve dopo il primo disegno): partiva
  // la testata blu e mezzo secondo dopo veniva sostituita dalla striscia. È il
  // lampo che si vedeva sulle fatture ricevute (23/11/2026). I numeri dei mesi si
  // riempiono da sé quando i saldi rispondono; finché non ci sono, pagato e
  // residuo valgono zero e la striscia è già alla sua altezza definitiva.
  const mesi = useMemo(
    () => annoFilter === "all" ? null : mesiRicevute(fatture, Number(annoFilter), saldi ?? SALDI_IN_ARRIVO, oggiIso),
    [fatture, annoFilter, saldi, oggiIso],
  );
  // Striscia dei mesi solo da tablet in su, con un anno scelto e i dati letti (come prima).
  const strisciaVisibile = !erroreFatture && !isMobile;

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
      daPagare: fatture.filter(daPagare).length,
    }),
    [fatture, haCollegamento, verificata, verifiche, daPagare, storni],
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
  // Una scrittura sola dell'indirizzo, non dodici di fila: dodici avrebbero fatto gara
  // fra loro e l'ultima avrebbe vinto sulle altre.
  const azzeraFiltri = () => {
    setSearchQuery("");
    filtriUrl.azzera();
  };

  const ordinaPer = (campo: "data" | "fornitore" | "totale") =>
    setOrdinamento((o) =>
      o.campo === campo
        ? { campo, dir: o.dir === "asc" ? "desc" : "asc" }
        : { campo, dir: campo === "fornitore" ? "asc" : "desc" },
    );

  // 23/11/2026 — il campo di ricerca restava indietro di due o tre lettere
  // (un'azienda cliente, 1.294 fatture). Ogni lettera rinormalizzava il testo di
  // tutte le fatture su tutti i campi, e da quando sono contabilizzate ogni riga
  // porta anche la sua commessa. Adesso:
  //  · il testo di ogni fattura si prepara UNA volta, quando cambiano i dati;
  //  · l'elenco segue la ricerca con `useDeferredValue`: la tastiera risponde
  //    subito, e se si digita veloce React salta i filtri intermedi.
  const ricercaDifferita = useDeferredValue(searchQuery);
  const testiRicerca = useMemo(() => {
    const testi = new Map<string, TestoRicerca>();
    for (const f of fatture) {
      const ordini = [f.purchase_order_id, ...(quoteOrdini[f.id] ?? []).map(q => q.purchase_order_id)];
      testi.set(f.id, testoRicercaRicevute([
        f.cedente_ragione_sociale, f.numero_fattura, f.cedente_piva, f.cedente_cf,
        f.note_interne, f.note, f.rettifica_motivo,
        ...commesseDi(f).flatMap((c) => [c.codice, c.descrizione, c.indirizzo]),
        ...ordini.flatMap(id => {
          const ordine = id ? ordiniCollegati[id] : undefined;
          return ordine ? [ordine.numero, ...ordine.cantiere] : [];
        }),
      ]));
    }
    return testi;
  }, [fatture, commesseDi, quoteOrdini, ordiniCollegati]);

  const filtered = useMemo(() => {
    let result = fatture;
    if (meseScelto) result = result.filter((f) => f.data_fattura?.startsWith(meseScelto));
    if (statoFilter !== "all") {
      result = result.filter((f) => statoFilter === "non_letta" ? ricevutaDaLeggere(f) : statoFilter === "letta" ? !ricevutaDaLeggere(f) : f.stato === statoFilter);
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
      result = result.filter(daPagare);
    }
    const termini = terminiRicercaRicevute(ricercaDifferita);
    if (termini.length) result = result.filter((f) => corrispondeTestoPronto(termini, testiRicerca.get(f.id)));
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
  }, [fatture, haCollegamento, verificata, verifiche, verifichePronte, metodoFilter, allegatiFilter, conteggiAllegati, soloDaRettificare, daPagare, soloDaVerificare, statoFilter, tipoFilter, categoriaFilter, ordineFilter, contabFilter, pagamentoFilter, storni, ricercaDifferita, testiRicerca, ordinamento, meseScelto]);

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
  const [quanteTelefono, setQuanteTelefono] = useState(40);
  const selezionaTutte = useCallback(() => setSelezionate(new Set(filtered.map((f) => f.id))), [filtered]);

  // ─── Mutations ──────────────────────────────────────────



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
      if (!data || data.length === 0) throw new Error(tr("Fattura non aggiornata: non appartiene a questa azienda"));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fatture-ricevute"] });
      queryClient.invalidateQueries({ queryKey: ["fattura-ricevuta-riepilogo"] });
      toast.success(tr("Aggancio automatico riattivato"), {
        description: tr("Al prossimo aggiornamento degli importi il sistema riproverà a trovare l'ordine."),
      });
    },
    onError: (e) => toast.error(tr("Non riuscito"), { description: e.message }),
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
      refreshFinancialQueries(queryClient);
      const dettaglio = esito.esito === "costo_ridotto"
        ? tr("Il costo dell'ordine collegato è stato ridotto della nota di credito ({importo} imponibile).", { importo: formatCurrency(Math.abs(esito.imponibile)) })
        : esito.esito === "costo_aggiornato"
        ? tr("Il costo dell'ordine collegato è stato corretto con l'importo della fattura ({importo} imponibile).", { importo: formatCurrency(esito.imponibile) })
        : esito.fornitore_riconosciuto
        ? tr("Creato il costo di {importo} imponibile.", { importo: formatCurrency(esito.imponibile) })
        : tr("Creato il costo di {importo} imponibile (fornitore non in anagrafica: aggiungilo per vederlo nei report fornitore).", { importo: formatCurrency(esito.imponibile) });
      toast.success(
        esito.esito === "gia_contabilizzata" ? tr("Fattura già contabilizzata") : tr("Fattura contabilizzata"),
        { description: esito.esito === "gia_contabilizzata" ? tr("Nessun costo duplicato.") : dettaglio },
      );
      setContabilizzaFattura(null);
    },
    onError: (e) => toast.error(tr("Contabilizzazione non riuscita"), { description: e.message }),
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
        fatte === 0 ? tr("Nessuna fattura da classificare") : tr("{fatte} fatture classificate", { fatte: String(fatte ?? "") }),
        {
          description: fallite > 0
            ? tr("{fallite} non sono riuscite: restano senza categoria, puoi rilanciare.", { fallite: String(fallite ?? "") })
            : tr("La categoria è arrivata anche sui costi già contabilizzati."),
        },
      );
    },
    onError: (e) => toast.error(tr("Classificazione non riuscita"), { description: e.message }),
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
      refreshFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["fatture-quote-ordini"] });
      setCollegaFattura(null);
      toast.success(
        v.quote.length === 0
          ? tr("Fattura scollegata dagli ordini")
          : v.quote.length === 1
            ? tr("Fattura collegata all'ordine")
            : tr("Fattura divisa tra {n} ordini", { n: v.quote.length }),
      );
    },
    onError: (e) => toast.error(tr("Errore: {message}", { message: String(e.message ?? "") })),
  });

  // ─── Importazione ───────────────────────────────────────

  // Il popup «Importa fatture» fa tutto: più file insieme, anteprima riga per
  // riga con le spunte, duplicati segnalati, esito. Qui resta solo cosa
  // ricaricare quando ha finito.
  const dopoImportazione = () => {
    refreshFinancialQueries(queryClient);
    invalidaStatisticheFatturazione(queryClient, companyId);
    queryClient.invalidateQueries({ queryKey: ["anagrafiche-native", companyId] });
    queryClient.invalidateQueries({ queryKey: ["emessa-importata-originale", companyId] });
  };

  // ─── Mark as read on view ──────────────────────────────

  // La fattura leggibile (righe, totali, fornitore) con «Stampa / Salva PDF»:
  // prima per le ricevute c'era solo l'XML grezzo.
  const handleViewFattura = async (f: FatturaRicevuta) => {
    try {
      const { data, error } = await supabase.from("fatture_ricevute" as never)
        .select("xml_raw,indice_corpo" as never).eq("id", f.id).eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      const originale = data as { xml_raw: string | null; indice_corpo: number | null } | null;
      const xml = await leggiXmlRicevuta({ ...originale, xml_url: f.xml_url });
      if (!xml) {
        if (f.pdf_storage_path && f.pdf_storage_bucket) { await apriPdfRicevuta(f); return; }
        toast.info(tr("Fattura non disponibile in formato leggibile"), { description: tr("Il gestionale di origine ha fornito i dati senza il file originale.") });
        return;
      }
      const vista = fatturaRicevutaHtml(xml, new DOMParser(), { indiceCorpo: originale?.indice_corpo ?? 0 });
      if (!vista) throw new Error(tr("Il file non è una fattura elettronica leggibile. Puoi scaricare il file originale."));
      setFatturaVista({ ...vista, origine: f });
      if (ricevutaDaLeggere(f)) lettura.mutate({ id: f.id, daLeggere: false });
    } catch (e) {
      toast.error(tr("Impossibile leggere la fattura"), { description: e instanceof Error ? e.message : undefined });
    }
  };

  const handleScaricaOriginale = async (f: FatturaRicevuta) => {
    try {
      if (f.xml_url) { await scaricaOriginaleRicevuta(f); return; }
      const { data, error } = await supabase.from("fatture_ricevute" as never).select("xml_raw" as never)
        .eq("id", f.id).eq("company_id", companyId!).maybeSingle();
      if (error) throw error;
      const xml_raw = (data as { xml_raw: string | null } | null)?.xml_raw;
      if (!xml_raw && f.pdf_storage_path && f.pdf_storage_bucket) { await apriPdfRicevuta(f); return; }
      await scaricaOriginaleRicevuta({ ...f, xml_raw });
    } catch (e) {
      toast.error(tr("Impossibile scaricare il file originale"), { description: e instanceof Error ? e.message : undefined });
    }
  };

  // ─── Esporta ────────────────────────────────────────────
  // Quello che si vede nella lista (anno, stato e ricerca già applicati).
  const etichettaEsporta = `${annoFilter === "all" ? "tutte" : annoFilter}${statoFilter !== "all" ? `_${statoFilter}` : ""}`;
  const righeEsporta = filtered as unknown as RigaRicevuta[];

  const handleEsportaElenco = async () => {
    setEsportando("elenco");
    try {
      // Col protocollo del cantiere, dove l'azienda lo usa: in archivio si cerca da quello.
      await esportaElencoRicevute(righeEsporta, etichettaEsporta, (r) => protocolliCantiere.etichetta(r));
      toast.success(tr("{n} fatture esportate in Excel", { n: righeEsporta.length }));
    } catch (err) {
      toast.error(tr("Esportazione non riuscita"), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setEsportando(null);
    }
  };

  const handleEsportaXml = async () => {
    if (righeEsporta.length > 600) {
      toast.error(tr("Troppe fatture per uno zip solo"), { description: tr("Restringi l'elenco (per anno o per stato): al massimo 600 alla volta.") });
      return;
    }
    setEsportando("xml");
    try {
      const esito = await esportaXmlRicevuteZip(supabase, companyId!, righeEsporta, etichettaEsporta, (fatte, totale) => setEsportando(`xml ${fatte}/${totale}`));
      if (esito.inclusi === 0 && esito.senzaXml === 0) toast.info(tr("Nessuna fattura da esportare"));
      else if (esito.senzaXml > 0) {
        toast.warning(tr("{inclusi} XML esportati, {senzaXml} senza file", { inclusi: String(esito.inclusi ?? ""), senzaXml: String(esito.senzaXml ?? "") }), { description: tr("Le fatture senza XML sono elencate in LEGGIMI.txt dentro lo zip.") });
      } else toast.success(tr("{inclusi} XML esportati", { inclusi: String(esito.inclusi ?? "") }));
    } catch (err) {
      toast.error(tr("Esportazione non riuscita"), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setEsportando(null);
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Fatture che risultano pagate mentre i soldi non risultano usciti (26/11/2026):
          finché restano così il pagamento vero non si può riconciliare. */}
      <PagamentiSegnatiDaSistemare companyId={companyId ?? undefined} />
      {/* Testata come le altre pagine di Finanza (25/11/2026): titolo a 20px; in vista solo la
          classificazione AI (quando serve), l'importazione e il «Nuovo»; tipi dei fornitori ed
          esportazioni nel «⋯». Prima erano cinque bottoni da 40px. Mobile: solo il titolo e il «Nuovo». */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Senza sottotitolo: «Fatture passive ricevute dal Sistema di
            Interscambio» ripeteva il titolo con altre parole. */}
        <div>
          <h1 className="text-xl font-bold text-foreground max-sm:text-lg">{tr("Fatture Ricevute")}</h1>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-1.5">
          <div className="flex flex-wrap items-center justify-end gap-1.5 max-sm:hidden">
          {kpi.daClassificare > 0 && (
            <Button
              variant="outline"
              size="sm"
              className={BOTTONE_SECONDARIO}
              onClick={() => setConfermaClassifica(true)}
              disabled={classProgress !== null}
              title={tr("Assegna a ogni fattura la categoria di spesa, e la porta anche sul costo")}
            >
              {classProgress !== null ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {classProgress !== null
                ? tr("Classificazione {fatte} di {totale}…", { fatte: String(classProgress.fatte ?? ""), totale: String(classProgress.totale ?? "") })
                : tr("Classifica con l'AI ({daClassificare})", { daClassificare: String(kpi.daClassificare ?? "") })}
            </Button>
          )}
          <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO} onClick={() => setImportaAperto(true)}>
            <Upload />
            {tr("Importa XML o PDF")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-8 w-8" aria-label={tr("Altre azioni")} title={esportando?.startsWith("xml ") ? tr("Zip {esportando}…", { esportando: esportando.slice(4) }) : undefined}>
                {esportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {/* Il tipo del fornitore decide se la fattura va su una commessa o nelle spese generali. */}
              <DropdownMenuItem asChild>
                <Link to="/azienda/documenti/tipi-fornitori"><Tags className="h-4 w-4 mr-2" />{tr("Tipi dei fornitori")}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">{tr("Esporta")}</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={esportando !== null || righeEsporta.length === 0 || erroreFatture || erroreRiferimenti || ricercaRiferimentiInCorso}
                title={tr("Esporta le fatture che vedi nella lista")}
                onClick={() => void handleEsportaElenco()}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" /> {tr("Elenco in Excel ({n})", { n: righeEsporta.length })}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={esportando !== null || righeEsporta.length === 0 || erroreFatture || erroreRiferimenti || ricercaRiferimentiInCorso}
                onClick={() => void handleEsportaXml()}
              >
                <Archive className="h-4 w-4 mr-2" /> {tr("XML originali (zip)")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
          {companyId && permessiCosti.canViewCosts && !permessiCosti.solaLettura && (
            <Button size="sm" className={BOTTONE_NUOVO} onClick={() => setModuloUscitaAperto(true)}><Plus className="h-3.5 w-3.5" />{tr("Nuovo costo senza fattura")}</Button>
          )}
        </div>
      </div>

      {/* Mobile: una riga con il problema; la spiegazione e il bottone (che
          porta a un collegamento da fare al computer) restano al desktop.
          25/11/2026: anche al desktop è una riga sola (140 → 40px), col bottone accanto al
          titolo; la spiegazione si apre con «Perché?». */}
      {integrazione?.received_scope_missing && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-950/30 max-sm:py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 max-sm:text-xs">
              {tr("Le fatture dei fornitori non stanno arrivando")}
            </p>
            <button type="button" aria-expanded={perchePermesso} onClick={() => setPerchePermesso(v => !v)}
              className="text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300 max-sm:hidden">
              {tr("Perché?")}
            </button>
            {/* Da telefono la fatturazione non si imposta (solo computer o tablet). */}
            {!isMobile && (
              <Button asChild variant="outline" size="sm" className="ml-auto h-7 px-2.5 text-xs border-amber-400 bg-white hover:bg-amber-100">
                <Link to="/azienda/impostazioni/fatturazione">{tr("Ricollega il gestionale")}</Link>
              </Button>
            )}
          </div>
          {perchePermesso && (
            <p className="mt-1 pb-0.5 pl-7 text-sm text-amber-800 dark:text-amber-300 max-sm:hidden">
              {tr("Il collegamento con il gestionale funziona per le fatture che emetti, ma non ha il permesso di leggere quelle che ricevi: il provider risponde «permesso negato». Serve ricollegare l'account una volta, autorizzando anche i documenti ricevuti.")}
            </p>
          )}
        </div>
      )}

      {/* Sei numeri e striscia dei mesi, come nelle emesse (16/11/2026). Con «tutti gli anni»
          resta la testata di prima: la striscia è di un anno. */}
      {!erroreFatture && (mesi && !isMobile ? (
        <RiepilogoFatture mesi={mesi} meseScelto={meseScelto} testi={TESTI_RICEVUTE} etichettaDocumenti="fatture ricevute" caricamento={isLoading} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm max-sm:hidden">
        {/* Senza il titoletto «Fatture ricevute — Quello che i fornitori ti
            mandano»: ripeteva il titolo della pagina. */}
        {/* Dal tablet i quattro numeri stanno su una riga sola (prima 2×2, due righe alte sopra l'elenco). */}
        <div className="bg-eic-navy-deep p-3 text-white">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NavyStatCard
              label={annoFilter === "all" ? tr("Totale ricevute") : tr("Ricevute nel {annoFilter}", { annoFilter: String(annoFilter ?? "") })}
              value={String(kpi.totale)}
              icon={Inbox}
              tone="text-orange-100"
            />
            <NavyStatCard
              label={tr("Da leggere")}
              value={String(kpi.nonLette)}
              icon={Eye}
              tone={kpi.nonLette > 0 ? "text-orange-300" : "text-emerald-200"}
            />
            <NavyStatCard label={tr("Contabilizzate")} value={String(kpi.contabilizzate)} icon={CheckCircle2} tone="text-emerald-200" />
            {/* Il totale è quello che si paga ai fornitori; sotto, di quanto è merce e quanta IVA. */}
            <NavyStatCard
              label={tr("Importo totale")}
              value={formatCurrency(kpi.importoTotale)}
              sub={`${tr("Imponibile {imponibile} + IVA {iva}", { imponibile: formatCurrency(kpi.imponibile), iva: formatCurrency(kpi.iva) })}${Math.abs(kpi.altro) >= 0.01 ? ` ${tr("+ altro {importo}", { importo: formatCurrency(kpi.altro) })}` : ""}${kpi.senzaImporto > 0 ? ` · ${tr("{n} senza importo", { n: kpi.senzaImporto })}` : ""}`}
              icon={Euro}
            />
          </div>
        </div>
      </div>
      ))}


      {/* Mobile: «Da leggere» (filtra) e l'importo del periodo, nome e cifra. */}
      {!erroreFatture && <KpiMobili
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
      />}

      {/* Mobile: ricerca e bottone dei filtri (anno e stato nel pannello). */}
      <CercaConFiltriVeloce
        className="sm:hidden"
        valore={searchQuery}
        onCambia={setSearchQuery}
        segnaposto={tr("Cerca fornitore, fattura o note")}
        filtriAttivi={(annoFilter !== annoCorrente ? 1 : 0) + (statoFilter !== "all" ? 1 : 0)}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />

      {/* Filtri: chip rapidi con il conteggio, poi ricerca e tendine. */}
      <div className="space-y-3 max-sm:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <CampoRicercaRicevute valore={searchQuery} onCambia={setSearchQuery} />
          <Select value={annoFilter} onValueChange={setAnnoFilter}>
            <SelectTrigger className="h-8 w-[120px] text-xs" aria-label={tr("Anno")}>
              <SelectValue placeholder={tr("Anno")} />
            </SelectTrigger>
            <SelectContent>
              {anniDisponibili.map((a) => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
              <SelectItem value="all">{tr("Tutti gli anni")}</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={BOTTONE_SECONDARIO}>
                <SlidersHorizontal />{tr("Altri filtri")}
                {altriFiltriAttivi > 0 && <Badge variant="secondary" className="ml-0.5 h-5 px-1.5 text-xs">{altriFiltriAttivi}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 space-y-3">
              {opzioniMetodo.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Modalità di pagamento")}</span>
                  <Select value={metodoFilter} onValueChange={setMetodoFilter}>
                    <SelectTrigger aria-label={tr("Modalità di pagamento")}><SelectValue placeholder={tr("Modalità")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("Tutte")}</SelectItem>
                      {opzioniMetodo.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Allegati")}</span>
                <Select value={allegatiFilter} onValueChange={(v) => setAllegatiFilter(v as "all" | "con" | "senza")}>
                  <SelectTrigger aria-label={tr("Allegati")}><SelectValue placeholder={tr("Allegati")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("Tutte")}</SelectItem>
                    <SelectItem value="con">{tr("Con allegati")}</SelectItem>
                    <SelectItem value="senza">{tr("Senza allegati")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Stato")}</span>
                <Select value={statoFilter} onValueChange={setStatoFilter}>
                  <SelectTrigger aria-label={tr("Stato")}><SelectValue placeholder={tr("Stato")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("Tutti")}</SelectItem>
                    <SelectItem value="non_letta">{tr("Non lette")}</SelectItem>
                    <SelectItem value="letta">{tr("Lette")}</SelectItem>
                    <SelectItem value="contabilizzata">{tr("Contabilizzate")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {opzioniTipo.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Tipo di documento")}</span>
                  <Select value={tipoFilter} onValueChange={setTipoFilter}>
                    <SelectTrigger aria-label={tr("Tipo documento")}><SelectValue placeholder={tr("Tipo")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("Tutti")}</SelectItem>
                      {opzioniTipo.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              {opzioniCategoria.length > 0 && (
                <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Categoria")}</span>
                  <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
                    <SelectTrigger aria-label={tr("Categoria")}><SelectValue placeholder={tr("Categoria")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{tr("Tutte")}</SelectItem>
                      <SelectItem value="__nessuna__">{tr("Non classificate")}</SelectItem>
                      {opzioniCategoria.map((c) => <SelectItem key={c} value={c}>{etichettaCategoria(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              )}
              <label className="block space-y-1 text-sm"><span className="font-medium">{tr("Collegamento")}</span>
                <Select value={ordineFilter} onValueChange={(v) => setOrdineFilter(v as "all" | "con" | "senza")}>
                  <SelectTrigger aria-label={tr("Collegamento")}><SelectValue placeholder={tr("Collegamento")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tr("Tutte")}</SelectItem>
                    <SelectItem value="con">{tr("Collegate")}</SelectItem>
                    <SelectItem value="senza">{tr("Da collegare")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </PopoverContent>
          </Popover>
          {companyId && <NumeraProtocolliCommesse companyId={companyId} protocolli={protocolliCantiere} />}
          {companyId && <NumeraProtocolliRicevute companyId={companyId} protocolli={protocolli}
            anni={[...new Set(fatture.map(f => Number((f.data_ricezione_sdi ?? f.data_fattura ?? "").slice(0, 4))).filter(a => a > 2000))]} />}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(BOTTONE_SECONDARIO, "max-sm:hidden")}><Columns3 />{tr("Colonne")}</Button>
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
        {/* La striscia dei mesi è di un anno: con «tutti gli anni» non c'è. */}
        {strisciaVisibile && mesi && (
          <div id="striscia-mesi-ricevute">
            <MonthlyTimeline
              months={mesi}
              selectedMonth={meseScelto}
              onSelectMonth={setMeseScelto}
              year={Number(annoFilter)}
              onYearChange={(y) => setAnnoFilter(String(y))}
            />
          </div>
        )}
        {/* Cosa c'è da fare: a zero non serve vederlo. */}
        <div className="flex flex-wrap items-center gap-2">
          <ChipFiltro attivo={filtriAttivi === 0} onClick={azzeraFiltri} conteggio={fatture.length}>
            {tr("Tutte")}
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
              <X className="mr-1 h-3.5 w-3.5" />{tr("Azzera")}
            </Button>
          )}
          {/* Cose da sistemare che non sono filtri dell'elenco: pulsanti compatti che aprono una
              finestra, non fasce sopra la tabella (16/11/2026). I numeri mancanti nelle emesse
              stanno nella pagina delle emesse. */}
          {companyId && permessiCosti.canViewCosts && (
            <span className="ml-auto flex items-center gap-2 max-md:hidden">
              <FattureDaAssegnare companyId={companyId} puoModificare={!permessiCosti.solaLettura} variante="pillola" />
              <UsciteSenzaFattura moduloAperto={moduloUscitaAperto} onModuloChange={setModuloUscitaAperto} companyId={companyId} puoModificare={!permessiCosti.solaLettura} variante="pillola" />
            </span>
          )}
          {!erroreFatture && <p className={cn("text-xs tabular-nums text-muted-foreground", !(companyId && permessiCosti.canViewCosts) && "ml-auto")}>
            {tr("{n} di {totale}", { n: filtered.length, totale: fatture.length })}
          </p>}
        </div>
      </div>

      {erroreVerifiche && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><span>{tr("Stati di verifica non disponibili. I filtri di verifica sono sospesi finché i dati non vengono riletti.")}</span><Button variant="outline" size="sm" onClick={() => void rileggiVerifiche()}>{tr("Rileggi verifiche")}</Button></div>}
      {!isLoading && !erroreFatture && ricercaRiferimentiInCorso && <p role="status" className="text-sm text-muted-foreground">
        {tr("Ricerca nei riferimenti a ordini e cantieri in corso…")}
      </p>}
      {!erroreFatture && erroreRiferimenti && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 p-3 text-sm">
        <span>{tr("Alcuni riferimenti a ordini o cantieri non sono disponibili. La ricerca per riferimenti può essere incompleta.")}</span>
        <Button variant="outline" size="sm" onClick={() => {
          if (erroreQuote) void rileggiQuote();
          if (erroreCosti) void rileggiCosti();
          if (erroreOrdini) void rileggiOrdini();
        }}>{tr("Rileggi riferimenti")}</Button>
      </div>}
      {!erroreFatture && erroreSaldi && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 p-3 text-sm">
        <span>{tr("Pagato e residuo non disponibili.")}</span>
        <Button variant="outline" size="sm" onClick={() => void rileggiSaldi()}>{tr("Riprova pagamenti")}</Button>
      </div>}
      {/* Table */}
      {erroreFatture ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
          <span>{tr("Non riesco a caricare le fatture ricevute.")}</span>
          <Button variant="outline" size="sm" onClick={() => void rileggiFatture()}>{tr("Riprova fatture")}</Button>
        </div>
      ) : isLoading || (ricercaRiferimentiInCorso && !filtered.length) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        // Mobile: una riga di testo, senza icona grande né spiegazione.
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground max-sm:py-4">
          <Inbox className="h-12 w-12 mb-4 max-sm:hidden" />
          <p className="text-lg font-medium max-sm:text-xs max-sm:font-normal">
            {erroreRiferimenti && searchQuery.trim() ? tr("Nessun risultato nei dati disponibili") : fatture.length > 0 ? tr("Nessuna fattura con questi filtri") : tr("Nessuna fattura ricevuta")}
          </p>
          <p className="text-sm max-sm:hidden">
            {fatture.length > 0 ? (
              <Button variant="link" size="sm" onClick={azzeraFiltri} className="h-auto p-0">
                {tr("Azzera i filtri")}
              </Button>
            ) : (
              tr("Le fatture arriveranno automaticamente dal SDI oppure puoi importare XML manualmente.")
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
          {/* 40 righe, poi «Mostra altre»: con tutte in pagina era alta 19.000px (23/11/2026). */}
          {filtered.slice(0, quanteTelefono).map((f) => (
            <div key={f.id} className="flex items-center">
            {puoInBlocco && (
              <label className="flex shrink-0 items-center self-stretch pl-3 pr-1">
                <Checkbox checked={selezionate.has(f.id)} onCheckedChange={(v) => cambiaSelezione(f.id, v === true)} aria-label={tr("Seleziona la fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })} />
              </label>
            )}
            <button
              type="button"
              onClick={() => { setDettaglioMobile(f); if (ricevutaDaLeggere(f)) lettura.mutate({ id: f.id, daLeggere: false }); }}
              className="tap-compact flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left active:bg-muted"
            >
              {ricevutaDaLeggere(f) && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-label={tr("Da leggere")} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight">{f.cedente_ragione_sociale}</div>
                <div className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  {protocolli.di(f.id) && `${tr("Prot. {protocollo}", { protocollo: String(protocolli.etichetta(protocolli.di(f.id)!) ?? "") })} · `}{tr("N. {numero} · emessa {data}", { numero: String(f.numero_fattura ?? ""), data: formatDateShort(f.data_fattura) })}
                  {colonne.has("scadenza") && ` · ${tr("scad. {data}", { data: String(dataScadenza(f) ?? "") })}`}
                  {f.data_ricezione_sdi ? ` · ${tr("arrivata {data_ricezione_sdi}", { data_ricezione_sdi: formatDateShort(f.data_ricezione_sdi) })}` : ""}
                  {f.categoria_ai ? ` · ${etichettaCategoria(f.categoria_ai)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[13px] font-semibold leading-tight tabular-nums">
                  {f.totale_documento != null ? formatCurrency(f.totale_documento) : "—"}
                </div>
                <div className={`mt-0.5 whitespace-nowrap text-[11px] leading-tight ${pagataIl(f.id) || pagataSulCosto(f) ? "text-emerald-600" : "text-muted-foreground"}`}>
                  {isNotaCreditoRicevuta(f.tipo_documento) && storni?.perNota.has(f.id) ? tr("Collegata")
                    : nonSiPaga(f.tipo_documento) || f.stato === "rifiutata" ? etichettaStato(f, tr) : testoSaldo(saldi?.get(f.id), tr)}
                </div>
              </div>
            </button>
            </div>
          ))}
          {filtered.length > quanteTelefono && (
            <button type="button" onClick={() => setQuanteTelefono((n) => n + 40)} className="w-full px-3 py-2.5 text-sm font-medium text-primary">
              Mostra altre ({filtered.length - quanteTelefono})
            </button>
          )}
        </div>
        <Card className="max-sm:hidden">
          {/* L'elenco scorre dentro il riquadro: così la barra orizzontale resta
              a vista anche con migliaia di fatture, e l'intestazione non scappa. */}
          <BarraScorrimentoOrizzontale contenitore={riquadroTabella} className="mx-3 my-2" />
          <Table wrapperClassName="max-h-[70vh] tabella-scorrevole" wrapperRef={setRiquadroTabella}>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_hsl(var(--border))]">
              <TableRow>
                {puoInBlocco && (
                  <TableHead className="w-8 pr-0">
                    <Checkbox aria-label={tr("Seleziona tutte le fatture dell'elenco")} checked={tutteSelezionate ? true : righeInBlocco.length ? "indeterminate" : false}
                      onCheckedChange={(v) => (v === true ? selezionaTutte() : setSelezionate(new Set()))} />
                  </TableHead>
                )}
                {/* Numero, data, fornitore (16/11/2026): come si cerca una fattura su carta. */}
                <TableHead>{tr("Numero")}</TableHead>
                {protocolli.visibile && <TableHead className="whitespace-nowrap" title={tr("Protocollo interno: 1, 2, 3… per anno")}>{tr("Prot.")}</TableHead>}
                {protocolliCantiere.visibile && <TableHead className="whitespace-nowrap" title={tr("Protocollo del cantiere: un progressivo per commessa, che non riparte a gennaio")}>{tr("Prot. cantiere")}</TableHead>}
                <IntestazioneOrdinabile campo="data" ordinamento={ordinamento} onOrdina={ordinaPer}>{tr("Emessa il")}</IntestazioneOrdinabile>
                {colonne.has("scadenza") && <TableHead className="whitespace-nowrap">{tr("Scadenza fattura")}</TableHead>}
                <IntestazioneOrdinabile campo="fornitore" ordinamento={ordinamento} onOrdina={ordinaPer}>{tr("Fornitore")}</IntestazioneOrdinabile>
                <TableHead className="whitespace-nowrap">{tr("Arrivata il")}</TableHead>
                {colonne.has("imponibile") && <TableHead className="text-right">{tr("Imponibile")}</TableHead>}
                <IntestazioneOrdinabile campo="totale" ordinamento={ordinamento} onOrdina={ordinaPer} className="text-right">{tr("Totale")}</IntestazioneOrdinabile>
                {colonne.has("netto") && <TableHead className="whitespace-nowrap text-right">{tr("Netto a pagare")}</TableHead>}
                {colonne.has("pagato") && <TableHead className="whitespace-nowrap text-right">{tr("Pagato")}</TableHead>}
                {colonne.has("residuo") && <TableHead className="whitespace-nowrap text-right">{tr("Residuo")}</TableHead>}
                {colonne.has("pagamento") && <TableHead className="whitespace-nowrap">{tr("Pagamento")}</TableHead>}
                {colonne.has("metodo") && <TableHead>{tr("Modalità")}</TableHead>}
                {colonne.has("stato") && <TableHead>{tr("Stato")}</TableHead>}
                {colonne.has("verifica") && <TableHead>{tr("Verifica")}</TableHead>}
                {colonne.has("collegata") && <TableHead>{tr("Collegata a")}</TableHead>}
                {colonne.has("allegati") && <TableHead>{tr("Allegati")}</TableHead>}
                {colonne.has("note") && <TableHead>{tr("Note")}</TableHead>}
                <TableHead className="text-right">{tr("Azioni")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => {
                const saldo = saldi?.get(f.id);
                const metodo = metodiPagamento(f.piano_pagamento).join(", ");
                const split = (saldo?.iva_split ?? 0) > 0;
                const titoloResiduo = split ? tr("Residuo verso il fornitore. IVA split {importo}", { importo: formatCurrency(saldo!.iva_split) }) : tr("Residuo verso il fornitore");
                return (
                <TableRow
                  key={f.id}
                  onClick={event => {
                    const target = event.target;
                    if (target instanceof Element && event.currentTarget.contains(target) &&
                        !target.closest("button,a,input,label,select,textarea,[role=button],[role=checkbox],[role=combobox]")) {
                      setRiepilogoId(f.id);
                    }
                  }}
                  className={`cursor-pointer [&>td]:py-1.5 ${ricevutaDaLeggere(f) ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                >
                  {puoInBlocco && (
                    <TableCell className="w-8 pr-0">
                      <Checkbox checked={selezionate.has(f.id)} onCheckedChange={(v) => cambiaSelezione(f.id, v === true)} aria-label={tr("Seleziona la fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })} />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="block max-w-[190px] truncate font-mono text-sm" title={f.numero_fattura}>{f.numero_fattura}</span>
                      {integrazioni?.get(f.id) ? (
                        <Link to={`/azienda/documenti/${integrazioni.get(f.id)!.id}`} className="whitespace-nowrap text-xs text-emerald-700 underline-offset-2 hover:underline" title={tr("Integrazione {numero}", { numero: String(integrazioni.get(f.id)!.numero ?? "") })}>{tr("Integrata")}</Link>
                      ) : serveIntegrazione(f) && (
                        <button type="button" onClick={() => setDaIntegrare(f)} className={`whitespace-nowrap text-xs underline-offset-2 hover:underline ${f.pdf_storage_path ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}>
                          {f.pdf_storage_path ? tr("Da regolarizzare") : tr("Integra")}
                        </button>
                      )}
                      {etichettaTipoRicevuta(f.tipo_documento) !== "Fattura" && <span className="whitespace-nowrap text-xs text-muted-foreground">{etichettaTipoRicevuta(f.tipo_documento)}</span>}
                    </div>
                  </TableCell>
                  {protocolli.visibile && <TableCell><CellaProtocolloRicevuta fattura={f} protocolli={protocolli} /></TableCell>}
                  {protocolliCantiere.visibile && <TableCell><CellaProtocolloCommessa fattura={f} protocolli={protocolliCantiere} /></TableCell>}
                  <TableCell className="whitespace-nowrap">
                    <DataEmissione f={f} />
                  </TableCell>
                  {colonne.has("scadenza") && <TableCell className="whitespace-nowrap text-xs tabular-nums">{dataScadenza(f)}</TableCell>}
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
                  <TableCell className="whitespace-nowrap">
                    <DataArrivo f={f} />
                  </TableCell>
                  {colonne.has("imponibile") && <TableCell className="text-right">
                    {f.imponibile_totale != null ? formatCurrency(f.imponibile_totale) : <span className="text-muted-foreground">—</span>}
                  </TableCell>}
                  <TableCell className="whitespace-nowrap text-right font-medium" title={f.iva_totale != null ? `IVA ${formatCurrency(f.iva_totale)}` : undefined}>
                    {f.totale_documento != null ? formatCurrency(f.totale_documento) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  {colonne.has("netto") && <TableCell className="whitespace-nowrap text-right"><ImportoRicevuta valore={saldo?.dovuto} /></TableCell>}
                  {colonne.has("pagato") && <TableCell className="whitespace-nowrap text-right">
                    <ImportoRicevuta valore={saldo?.pagato} titolo={tr("Pagamenti registrati e anticipi compensati")} />
                  </TableCell>}
                  {colonne.has("residuo") && <TableCell className={cn("whitespace-nowrap text-right font-medium", daPagare(f) && "text-amber-800 dark:text-amber-400")}>
                    <ImportoRicevuta valore={saldo?.residuo} titolo={titoloResiduo} />
                  </TableCell>}
                  {colonne.has("pagamento") && <TableCell className="whitespace-nowrap">
                    {isNotaCreditoRicevuta(f.tipo_documento) ? (
                      f.stato === "rifiutata" ? <span className="text-muted-foreground">—</span> : (
                        <button type="button" className="whitespace-nowrap text-xs underline underline-offset-2 hover:text-foreground" onClick={() => setCollegaNota(f)}>
                          {storni?.perNota.has(f.id)
                            ? tr("Storna {fatture}", { fatture: fatture.filter((x) => storni.perNota.get(f.id)!.fatture.includes(x.id)).map((x) => x.numero_fattura).join(", ") || tr("una fattura") })
                            : <span className="text-amber-700 dark:text-amber-400">{tr("Collega alla fattura")}</span>}
                        </button>
                      )
                    ) : nonSiPaga(f.tipo_documento) || f.stato === "rifiutata" ? <span className="text-muted-foreground">—</span> : stornataDelTutto(f) ? (
                      <StatoPill tono="grigio">{tr("Stornata")}</StatoPill>
                    ) : pagataSulCosto(f) && !pagataIl(f.id) ? (
                      <StatoPill tono="verde">{tr("Pagata{valore}", { valore: (saldo?.data_saldo ? ` ${formatDateShort(saldo.data_saldo)}` : "") })}</StatoPill>
                    ) : pagataIl(f.id) ? (
                      <PagamentoRicevutaCella forma="chip" id={f.id} numero={f.numero_fattura} tipo={f.tipo_documento} pagataIl={pagataIl(f.id)} />
                    ) : (
                      <span className={cn("inline-flex items-center gap-1 whitespace-nowrap text-xs", daPagare(f) ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                        {testoSaldo(saldo, tr)}
                        {daPagare(f) && (permessiCosti.canViewCosts && !permessiCosti.solaLettura
                          ? <Button variant="link" size="sm" className="h-auto min-h-0 p-0 text-xs font-semibold"
                              disabled={perPagare.isPending && perPagare.variables === f.id}
                              onClick={() => pagaRiga(f, Number(saldo?.residuo ?? 0))}
                              aria-label={tr("Registra il pagamento della fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })}>{tr("Paga")}</Button>
                          : <PagamentoRicevutaCella forma="icona" id={f.id} numero={f.numero_fattura} tipo={f.tipo_documento} pagataIl={null} />)}
                      </span>
                    )}
                  </TableCell>}
                  {colonne.has("metodo") && <TableCell className="whitespace-nowrap text-xs">
                    {[metodo, split ? "Split payment" : null].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                  </TableCell>}
                  {colonne.has("stato") && <TableCell><StatoBadge stato={f.stato} storico={f.storico_esterno} daLeggere={f.da_leggere} /></TableCell>}
                  {colonne.has("verifica") && <TableCell>
                    {f.stato === "rifiutata" ? <span className="text-muted-foreground">—</span> : !verifichePronte ? <span className="text-xs text-muted-foreground">{caricaVerifiche ? tr("Lettura verifica…") : tr("Verifica non disponibile")}</span> : <VerificaFatturaPill daRettificare={verifiche[f.id] === "da_rettificare"} motivoRettifica={f.rettifica_motivo} id={f.id} numero={f.numero_fattura} verificata={verificata(f)} puoCambiare={!!permessiCosti.canViewCosts && !permessiCosti.solaLettura} />}
                  </TableCell>}
                  {colonne.has("collegata") && <TableCell>
                    <div className="flex flex-nowrap items-center gap-1">
                    {(quoteOrdini[f.id]?.length ?? 0) > 0 ? (
                      <div className="flex flex-wrap items-center gap-0.5">
                        {quoteOrdini[f.id].map((q) => (
                          <Link
                            key={q.purchase_order_id}
                            to={`/azienda/ordini-acquisto/${q.purchase_order_id}`}
                            title={tr("Quota di questa fattura: {importo} (imponibile)", { importo: formatCurrency(q.importo) })}
                          >
                            <Badge variant="outline" className="font-mono text-[11px] hover:bg-orange-50 hover:border-orange-300 transition-colors">
                              {odaNumbers[q.purchase_order_id] ?? tr("OdA")}
                              <span className="ml-1 font-sans text-muted-foreground">{formatCurrency(q.importo)}</span>
                            </Badge>
                          </Link>
                        ))}
                        {f.stato !== "contabilizzata" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            title={tr("Scollega dagli ordini")} aria-label={tr("Scollega dagli ordini")}
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
                          title={tr("Apri l'ordine d'acquisto")}
                        >
                          <Badge variant="outline" className="font-mono text-[11px] hover:bg-orange-50 hover:border-orange-300 transition-colors">
                            {odaNumbers[f.purchase_order_id] ?? tr("OdA")}
                          </Badge>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          title={tr("Scollega dall'ordine")} aria-label={tr("Scollega dall'ordine")}
                          disabled={linkOdaMutation.isPending}
                          onClick={() => linkOdaMutation.mutate({ id: f.id, quote: [] })}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-nowrap items-center gap-1">
                        {commesseDi(f).slice(0, 2).map((q) => (
                          <Link key={q.order_id} to={`/azienda/ordini/${q.order_id}`} title={q.pct < 100 ? tr("Quota {pct}%: {valore}", { pct: q.pct.toLocaleString(intlCampo()), valore: formatCurrency((Number(f.totale_documento ?? 0) * q.pct) / 100) }) : undefined}>
                            <Badge variant="outline" className="whitespace-nowrap text-[11px] hover:bg-orange-50 hover:border-orange-300"
                              title={q.generale ? tr("Su tutta l'operazione: costo comune, il piano lo divide tra le unità") : undefined}>
                              {q.generale && <Building2 className="mr-1 h-3 w-3" aria-label={tr("Operazione")} />}{q.codice}
                            </Badge>
                          </Link>
                        ))}
                        {commesseDi(f).length > 2 && <span className="text-xs text-muted-foreground" title={commesseDi(f).slice(2).map((q) => q.codice).join(", ")}>+{commesseDi(f).length - 2}</span>}
                        {commesseDi(f).length ? (
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" title={tr("Cambia il collegamento")} aria-label={tr("Cambia il collegamento della fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })} onClick={() => setCollegaCommesse(f)}>
                            <Link2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                            title={tr("Collega a una o più commesse, o a un ordine d'acquisto")} onClick={() => setCollegaCommesse(f)}>
                            <Link2 className="mr-1 h-3.5 w-3.5" />{tr("Collega")}
                          </Button>
                        )}
                      </div>
                    )}
                    {/* Chi ha deciso l'aggancio si vede, e si può tornare indietro: senza questo, "scollegata
                        a mano" era uno stato invisibile che spiegava perché il sistema non riagganciava più. */}
                    {f.aggancio_oda_manuale && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        title={tr("Scelto a mano: il sistema non riaggancia più questa fattura da solo. Clicca per restituirgliela.")} aria-label={tr("Riattiva l'aggancio automatico")}
                        onClick={() => riattivaAutomaticoMutation.mutate(f.id)}>
                        <RotateCcw className="h-3 w-3" />
                      </Button>
                    )}
                    </div>
                  </TableCell>}
                  {colonne.has("allegati") && <TableCell>
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" title={tr("Apri la fattura per vedere o aggiungere allegati")} aria-label={tr("Allegati della fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })} onClick={() => setRiepilogoId(f.id)}>
                      <Paperclip className="h-3.5 w-3.5" />{conteggiAllegati?.get(f.id) ?? 0}
                    </button>
                  </TableCell>}
                  {colonne.has("note") && <TableCell className="max-w-[220px] truncate text-xs" title={f.note_interne ?? undefined}>{f.note_interne || <span className="text-muted-foreground">—</span>}</TableCell>}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={tr("Lettura fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={lettura.isPending} onSelect={() => lettura.mutate({id:f.id,daLeggere:!ricevutaDaLeggere(f)})}>{ricevutaDaLeggere(f) ? tr("Segna come letta") : tr("Segna come non letta")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title={tr("Apri la fattura: righe, totali e collegamenti")} aria-label={tr("Apri la fattura")}
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
                          title={tr("Scarica il file originale")} aria-label={tr("Scarica il file originale")}
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
                          title={tr("Contabilizza")} aria-label={tr("Contabilizza la fattura {numero_fattura}", { numero_fattura: String(f.numero_fattura ?? "") })}
                          onClick={() => apriContabilizza(f)}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
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
        risultati={isLoading || erroreFatture ? undefined : filtered.length}
      >
        <PilloleFiltro
          titolo={tr("Anno")}
          valore={annoFilter}
          onScegli={setAnnoFilter}
          scelte={[...anniDisponibili.map((a) => ({ value: a, label: a })), { value: "all", label: tr("Tutti") }]}
        />
        <PilloleFiltro
          titolo={tr("Stato")}
          valore={statoFilter}
          onScegli={setStatoFilter}
          scelte={[
            { value: "all", label: tr("Tutti") },
            { value: "non_letta", label: tr("Da leggere") },
            { value: "letta", label: tr("Lette") },
            { value: "contabilizzata", label: tr("Contabilizzate") },
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
                {tr("N. {numero} · emessa il {data}", { numero: String(dettaglioMobile.numero_fattura ?? ""), data: formatDateShort(dettaglioMobile.data_fattura) })}
                {dettaglioMobile.data_ricezione_sdi ? ` · ${tr("arrivata dallo SDI il {data_ricezione_sdi}", { data_ricezione_sdi: formatDateTime(dettaglioMobile.data_ricezione_sdi) })}` : ""}
                {dettaglioMobile.cedente_piva ? ` · P.IVA ${dettaglioMobile.cedente_piva}` : ""}
              </p>
              {protocolli.visibile && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{tr("Protocollo interno:")} <CellaProtocolloRicevuta fattura={dettaglioMobile} protocolli={protocolli} /></p>}
              {protocolliCantiere.visibile && <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">{tr("Protocollo cantiere:")} <CellaProtocolloCommessa fattura={dettaglioMobile} protocolli={protocolliCantiere} /></p>}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[
                  { l: "Imponibile", v: dettaglioMobile.imponibile_totale },
                  { l: "IVA", v: dettaglioMobile.iva_totale },
                  { l: "Totale", v: dettaglioMobile.totale_documento },
                ].map((x) => (
                  <div key={x.l} className="rounded-lg border px-2 py-1.5">
                    <p className="text-[11px] text-muted-foreground">{tr(x.l)}</p>
                    <p className="text-[13px] font-semibold tabular-nums">{x.v != null ? formatCurrency(x.v) : "—"}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {etichettaStato(dettaglioMobile, tr)}
                {dettaglioMobile.categoria_ai ? ` · ${etichettaCategoria(dettaglioMobile.categoria_ai)}` : ""}
                {dettaglioMobile.purchase_order_id ? ` · ${odaNumbers[dettaglioMobile.purchase_order_id] ? tr("ordine {numero}", { numero: odaNumbers[dettaglioMobile.purchase_order_id] }) : tr("ordine collegato")}` : ""}
                {(quoteOrdini[dettaglioMobile.id]?.length ?? 0) > 0
                  ? ` · ${tr("divisa tra {ordini}", { ordini: quoteOrdini[dettaglioMobile.id].map((q) => odaNumbers[q.purchase_order_id] ?? "OdA").join(", ") })}`
                  : ""}
              </p>
              {!nonSiPaga(dettaglioMobile.tipo_documento) && dettaglioMobile.stato !== "rifiutata" && <>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div><dt className="text-xs text-muted-foreground">{tr("Pagato")}</dt><dd><ImportoRicevuta valore={saldi?.get(dettaglioMobile.id)?.pagato} /></dd></div>
                  <div><dt className="text-xs text-muted-foreground">{tr("Residuo")}</dt><dd><ImportoRicevuta valore={saldi?.get(dettaglioMobile.id)?.residuo} /></dd></div>
                </dl>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{testoSaldo(saldi?.get(dettaglioMobile.id), tr)}</span>
                  {/* Da telefono lo stesso pannello del computer (23/11/2026): prima qui c'era il vecchio
                      «Segna pagata», senza residuo né banca. */}
                  {!stornataDelTutto(dettaglioMobile) && !permessiCosti.canViewCosts && (pagataIl(dettaglioMobile.id) || daPagare(dettaglioMobile)) &&
                    <PagamentoRicevutaCella id={dettaglioMobile.id} numero={dettaglioMobile.numero_fattura} tipo={dettaglioMobile.tipo_documento} pagataIl={pagataIl(dettaglioMobile.id)} />}
                </div>
                {!stornataDelTutto(dettaglioMobile) && permessiCosti.canViewCosts && (dettaglioMobile.company_cost_id || (!permessiCosti.solaLettura && daPagare(dettaglioMobile))) && (
                  <Button
                    className="mt-3 h-10 w-full"
                    variant={daPagare(dettaglioMobile) && !permessiCosti.solaLettura ? "default" : "outline"}
                    disabled={perPagare.isPending}
                    onClick={() => { const f = dettaglioMobile; setDettaglioMobile(null); pagaRiga(f, Number(saldi?.get(f.id)?.residuo ?? 0)); }}
                  >
                    {perPagare.isPending ? tr("Preparo il pagamento…") : daPagare(dettaglioMobile) && !permessiCosti.solaLettura ? tr("Paga") : tr("Pagamenti e residuo")}
                  </Button>
                )}
              </>}
              <Button
                variant="outline"
                className="mt-4 h-10 w-full"
                onClick={() => { const f = dettaglioMobile; setDettaglioMobile(null); setRiepilogoId(f.id); }}
              >
                <FileText className="h-4 w-4 mr-1" /> {tr("Vedi la fattura")}
              </Button>
              <Button variant="outline" className="mt-2 h-10 w-full" disabled={lettura.isPending} onClick={() => lettura.mutate({id:dettaglioMobile.id,daLeggere:!ricevutaDaLeggere(dettaglioMobile)})}>{ricevutaDaLeggere(dettaglioMobile) ? tr("Segna come letta") : tr("Segna come non letta")}</Button>
              {dettaglioMobile.stato !== "contabilizzata" && (
                <Button
                  className="mt-2 h-10 w-full bg-green-600 hover:bg-green-700"
                  onClick={() => { apriContabilizza(dettaglioMobile); setDettaglioMobile(null); }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" /> {tr("Contabilizza")}
                </Button>
              )}
              {isNotaCreditoRicevuta(dettaglioMobile.tipo_documento) && dettaglioMobile.stato !== "rifiutata" && (dettaglioMobile.stato === "contabilizzata" || !!dettaglioMobile.purchase_order_id) && (
                <Button
                  variant="outline"
                  className="mt-2 h-10 w-full"
                  onClick={() => { setCollegaNota(dettaglioMobile); setDettaglioMobile(null); }}
                >
                  {storni?.perNota.has(dettaglioMobile.id) ? tr("Cambia la fattura stornata") : tr("Collega alla fattura")}
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
            <AlertDialogTitle>{tr("Contabilizza fattura ricevuta")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {/* Mobile: basta il riepilogo sotto, senza la spiegazione. */}
                <p className="max-sm:hidden">
                  {contabilizzaFattura && (quoteOrdini[contabilizzaFattura.id]?.length ?? 0) > 0
                    ? tr("La fattura è divisa tra più ordini: nasce un costo solo con tutto l'imponibile, ogni ordine (e la sua commessa) prende la sua quota e il costo registrato alla ricezione scende di quella quota (nessun costo doppio). Dopo, le quote non si cambiano più.")
                    : contabilizzaFattura?.purchase_order_id
                    ? tr("La fattura è collegata a un ordine: l'importo del costo già registrato alla ricezione verrà corretto con quello della fattura (nessun costo doppio).")
                    : tr("Verrà creato il costo corrispondente, con imponibile e IVA della fattura, visibile in Costi e nel Previsionale.")}
                </p>
                {contabilizzaFattura && (
                  <div className="bg-muted rounded-md p-3 text-sm space-y-1 max-sm:px-3 max-sm:py-2 max-sm:text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tr("Cedente")}</span>
                      <span className="font-medium">{contabilizzaFattura.cedente_ragione_sociale}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tr("Numero")}</span>
                      <span className="font-mono">{contabilizzaFattura.numero_fattura}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tr("Importo totale")}</span>
                      <span className="font-semibold">{formatCurrency(contabilizzaFattura.totale_documento)}</span>
                    </div>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
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
              {tr("Contabilizza")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conferma classificazione AI: è uno strumento a consumo, quante fatture
          si stanno per pagare va detto PRIMA, non scoperto dopo sul borsellino. */}
      <AlertDialog open={confermaClassifica} onOpenChange={setConfermaClassifica}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Classificare {daClassificare} fatture con l'AI?", { daClassificare: String(kpi.daClassificare ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {tr("A ogni fattura viene assegnata una categoria di spesa (materiali, subappalti, affitti, provvigioni…) leggendo fornitore e righe. Dove la fattura è già contabilizzata, la categoria arriva anche sul costo.")}
                </p>
                <p>
                  {tr("È uno strumento a consumo: scala crediti AI dal borsellino dell'azienda, una volta per fattura. Rilanciarlo dopo non ripaga quelle già fatte.")}
                </p>
                <p className="text-muted-foreground">
                  {tr("La categoria resta modificabile a mano: è una proposta, non l'ultima parola.")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={classificaMutation.isPending}
              onClick={() => classificaMutation.mutate()}
            >
              <Sparkles className="h-4 w-4 mr-1" />
              {tr("Classifica")}
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
      {pagaCosto && <ExpensePaymentDialog key={pagaCosto.costId} costId={pagaCosto.costId} importoProposto={pagaCosto.importo}
        apriInRegistrazione onClose={() => setPagaCosto(null)} />}
      <ImportaFattureDialog
        aperto={importaAperto}
        companyId={companyId}
        partitaIvaAzienda={partitaIvaAzienda}
        onChiudi={() => setImportaAperto(false)}
        onImportate={dopoImportazione}
        onPdfAMano={(f) => setPdfInCoda((coda) => [...coda, f])}
      />

      <CaricaRicevutaPdfDialog
        file={pdfInCoda[0] ?? null}
        companyId={companyId}
        onClose={() => setPdfInCoda((coda) => coda.slice(1))}
        onCaricata={() => {
          setPdfInCoda((coda) => coda.slice(1));
          refreshFinancialQueries(queryClient);
        }}
      />
      <FatturaRicevutaCompletaDialog
        vista={fatturaVista}
        onClose={() => setFatturaVista(null)}
        onScaricaOriginale={async () => { if (fatturaVista) await handleScaricaOriginale(fatturaVista.origine); }}
      />

      {/* La fattura leggibile, anche senza XML: righe, totali e a cosa è collegata. */}
      <RiepilogoFatturaRicevuta
        fatturaId={riepilogoId}
        companyId={companyId}
        apriConfronto={riepilogoId === fatturaDaAprire && parametri.get("confronto") === "1"}
        analisiDaAprire={riepilogoId === fatturaDaAprire && idAttivitaValido(analisiDaAprire) ? analisiDaAprire : undefined}
        onClose={() => {
          setRiepilogoId(null);
          if (fatturaDaAprire) {
            const sp = new URLSearchParams(parametri);
            for (const chiave of ["fattura", "confronto", "analisi"]) sp.delete(chiave);
            setParametri(sp, { replace: true });
          }
        }}
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

/**
 * I campi di ricerca stanno in componenti loro (23/11/2026): a ogni lettera si
 * ridisegna il campo, non la pagina con tutte le sue righe. La pagina riceve il
 * testo quando si smette di digitare (useTestoCheSegue).
 */
function CampoRicercaRicevute({ valore, onCambia }: { valore: string; onCambia: (testo: string) => void }) {
  const t = useT();
  const [testo, scrivi] = useTestoCheSegue(valore, onCambia);
  return (
    // Sul tablet la ricerca è un po' più stretta (224px): così «Colonne» resta sulla riga dei filtri.
    <div className={cn(RICERCA_BARRA, "max-sm:w-full sm:max-lg:w-56")}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={t("Cerca fornitore, fattura, note o riferimenti…")}
        className="h-8 pl-8 text-xs"
        value={testo}
        onChange={(e) => scrivi(e.target.value)}
      />
    </div>
  );
}

function CercaConFiltriVeloce(props: ComponentProps<typeof CercaConFiltri>) {
  const [testo, scrivi] = useTestoCheSegue(props.valore, props.onCambia);
  return <CercaConFiltri {...props} valore={testo} onCambia={scrivi} />;
}

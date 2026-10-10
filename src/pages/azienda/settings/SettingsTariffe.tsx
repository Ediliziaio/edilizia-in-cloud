import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useIsMobile } from "@/hooks/use-mobile";
import { useVertical, type Vertical } from "@/hooks/useVertical";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import { areePerTariffe, tariffaNellArea, type FiltroAreaTariffe } from "@/lib/tariffe/areeTariffe";
import { AREE_STANDARD, areaDiVerticale, nomeArea } from "@/lib/listino/areeStandard";
import { lavorazioneStandardDaCompletare } from "@/lib/listino/statoCatalogoStandard";
import {
  Plus, Pencil, Trash2, Zap, Search, Copy, MoreVertical, Calculator,
  Percent, Package, Activity, Archive, RotateCcw, Info,
  Building2, Layers3, Wallet, CheckCircle2, Paintbrush, AlertTriangle,
  FileSpreadsheet, ChevronDown, Download, FilterX, X, Link2,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import { TariffaProdottiCollegati } from "@/components/listino/TariffaProdottiCollegati";
import { TariffaVariantiEditor } from "@/components/settings/TariffaVariantiEditor";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useGovernanceThresholds } from "@/hooks/useGovernanceThresholds";
// MP-IMP-001 Fase 4 — sezioni estratte in cartella dedicata
import type {
  TipoTariffa, UnitaFatturazione, Tariffa, TipoDef, PresetId, TariffaSeed,
} from "./SettingsTariffe/types";
import {
  STANDARD_TARIFFE, PRESET_CATALOGHI, getDefaultPresetForVerticalTariffe,
} from "./SettingsTariffe/presets";
import { ImportPrezziarioDialog } from "./SettingsTariffe/ImportPrezziarioDialog";
import { ImportaPrezzarioRegionaleDialog } from "./SettingsTariffe/ImportaPrezzarioRegionaleDialog";
import { buildTariffeExportCsv } from "@/lib/tariffe/prezziarioImport";
import { countTariffaUsage, totalTariffaUsage, countTariffaUsageBulk } from "@/lib/tariffe/tariffaUsage";
import { BulkPriceAdjustDialog } from "@/components/settings/BulkPriceAdjustDialog";
import { TariffaUsageDialog } from "@/components/settings/TariffaUsageDialog";
import { AnalisiPrezzoDialog } from "@/components/listino/AnalisiPrezzoDialog";
import { costoTariffa, unitaTariffa } from "@/lib/listino/costoTariffa";
import { incidenzaFrazione } from "@/lib/listino/analisiPrezzo";
import ListinoManutenzione from "@/pages/azienda/settings/ListinoManutenzione";
import { CostoLavorazioneEditor, type DipendenteCostoLavorazione } from "@/components/settings/CostoLavorazioneEditor";
import { calcolaCostoLavorazione, campiConCostoLavorazione, costoLavorazioneModificato, GRUPPI_LAVORAZIONE, gruppoLavorazione, leggiCostoLavorazione, MODALITA_COSTO_LABEL, numeroCosto, oggettoCampi, type GruppoLavorazione } from "@/lib/tariffe/costoLavorazione";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import { testoErrore } from "@/lib/impostazioni/testoErrore";
import { parametroDaScheda, schedaDaParametro } from "./SettingsTariffe/schede";
import { NotaMargine } from "./SettingsTariffe/NotaMargine";


// ─── Constants ────────────────────────────────────────────────────────────────
/**
 * Gruppi semantici per i tab. Riduciamo da 15 tab "piatti" a 6 gruppi
 * concettuali: lavorazione (posa + manodopera sul campo), logistica (trasporto,
 * tiro, smaltimento), servizi tecnici (sopralluogo, progettazione, pratica),
 * noli/ponteggi, finiture (lattoneria, sigillatura, contorno, falso_telaio),
 * altro. Il gruppo "finiture" include tutti gli accessori perimetrali del
 * serramento — evitiamo l'etichetta "Serramento" perché ambigua rispetto al
 * vertical aziendale.
 */

// Fallback STABILE per gruppi vuoti: senza, `byGroup[g] ?? []` creava un nuovo
// array ad ogni render → l'effect di reset selezione (dep su tariffeForActiveGroup)
// ri-scattava all'infinito → "Maximum update depth exceeded" (#185) quando un
// filtro svuotava il tab attivo. Vedi system_health_metrics /impostazioni/tariffe.
const EMPTY_TARIFFE: Tariffa[] = [];

const TIPO_DEFS: TipoDef[] = [
  { value: "posa", label: "Posa", group: "lavorazione", hint: "Installazione prodotti (finestre, porte, pavimenti)" },
  { value: "manodopera", label: "Manodopera", group: "lavorazione", hint: "Lavorazione generica a ore o a corpo" },
  { value: "trasporto", label: "Trasporto", group: "logistica", hint: "Consegna in cantiere, fisso o al km" },
  { value: "tiro_piano", label: "Tiro piano", group: "logistica", hint: "Movimentazione ai piani superiori" },
  { value: "smaltimento", label: "Smaltimento", group: "logistica", hint: "Rimozione materiale dismesso" },
  { value: "sopralluogo", label: "Sopralluogo", group: "servizi", hint: "Rilievo e misurazioni in cantiere" },
  { value: "progettazione", label: "Progettazione", group: "servizi", hint: "Disegni, capitolati, pratiche tecniche" },
  { value: "pratica", label: "Pratica", group: "servizi", hint: "Pratiche edilizie e bonus fiscali" },
  { value: "nolo", label: "Nolo", group: "nolo", hint: "Noleggio attrezzature (trabattello, ponteggio)" },
  { value: "ponteggio", label: "Ponteggio", group: "nolo", hint: "Ponteggio completo + montaggio" },
  { value: "lattoneria", label: "Lattoneria", group: "finiture", hint: "Scossaline, gocciolatoi, canali" },
  { value: "sigillatura", label: "Sigillatura", group: "finiture", hint: "Silicone perimetrale, schiuma" },
  { value: "contorno", label: "Contorno", group: "finiture", hint: "Rivestimento/finitura perimetrale" },
  { value: "falso_telaio", label: "Falso telaio", group: "finiture", hint: "Predisposizione controtelaio" },
  { value: "altro", label: "Altro", group: "altro", hint: "Servizi non classificati altrove" },
];

const GROUP_DEFS: { value: TipoDef["group"] | "all"; label: string; icon: typeof Package }[] = [
  { value: "all", label: "Tutte", icon: Layers3 },
  { value: "lavorazione", label: "Lavorazione", icon: Activity },
  { value: "logistica", label: "Logistica", icon: Package },
  { value: "servizi", label: "Servizi", icon: Building2 },
  { value: "nolo", label: "Nolo", icon: Wallet },
  { value: "finiture", label: "Finiture", icon: Paintbrush },
  { value: "altro", label: "Altro", icon: Info },
];

/** Unità di fatturazione canoniche FASE 6 — la UM è FISSA alla creazione. */
const UM_FATTURAZIONE: { value: UnitaFatturazione; label: string; hint: string }[] = [
  { value: "pz", label: "pz", hint: "Al pezzo" },
  { value: "mq", label: "mq", hint: "Al metro quadro (L×H)" },
  { value: "ml", label: "ml", hint: "Al metro lineare" },
  { value: "mc", label: "mc", hint: "Al metro cubo" },
  { value: "kg", label: "kg", hint: "Al chilo" },
  { value: "gg", label: "gg", hint: "A giornata lavorativa" },
  { value: "h", label: "h", hint: "All'ora" },
  { value: "a_corpo", label: "a corpo", hint: "Importo fisso totale" },
  { value: "km", label: "km", hint: "Al chilometro" },
  { value: "piano", label: "piano", hint: "Per piano di installazione" },
];

/** Suggerimento iniziale di UM per tipo (l'utente può cambiare). */
const UM_DEFAULT_BY_TIPO: Record<string, UnitaFatturazione> = {
  posa: "pz",
  manodopera: "h",
  trasporto: "a_corpo",
  tiro_piano: "piano",
  smaltimento: "pz",
  nolo: "gg",
  sopralluogo: "a_corpo",
  progettazione: "a_corpo",
  ponteggio: "a_corpo",
  lattoneria: "ml",
  sigillatura: "ml",
  contorno: "ml",
  falso_telaio: "pz",
  pratica: "a_corpo",
  altro: "pz",
};

/**
 * Mappa unita_fatturazione → colonna legacy `unita` (CHECK: pz/mq/ml/mc/h/piano/km/fisso).
 * La conversione perde informazione (gg→h, kg→pz): chi legge l'unità deve
 * usare unita_fatturazione e ripiegare su `unita` solo se manca, altrimenti
 * un prezzo a giornata sembra a ore (vedi unitaTariffa, 05/10/2026).
 */
function legacyUnitaFrom(u: UnitaFatturazione): string {
  switch (u) {
    case "pz": case "mq": case "ml": case "mc": case "h": case "km": case "piano":
      return u;
    case "a_corpo": return "fisso";
    case "gg": return "h";
    case "kg": return "pz";
  }
}

function tipoLabel(tipo: string): string {
  return TIPO_DEFS.find((t) => t.value === tipo)?.label ?? tipo;
}
function tipoHint(tipo: string): string {
  return TIPO_DEFS.find((t) => t.value === tipo)?.hint ?? "";
}

// NOTE: categoria_prodotto and descrizione sono NOT in the tariffe_aziendali schema.
// attiva is NOT in the schema either — rimosso da tutti i payload.


/**
 * Catalogo tariffe standard pre-compilato. Ogni riga ha uno o più tag `presets`
 * che permettono all'admin di importare in blocco solo le tariffe coerenti con
 * il proprio mestiere. I prezzi sono riferimenti di mercato IT 2025 al netto
 * IVA — ogni azienda dovrà calibrarli.
 */

/**
 * Definizione dei cataloghi pronti (`PRESET_CATALOGHI`). Ogni catalogo raggruppa
 * tariffe coerenti con un mestiere/profilo aziendale tipico. L'admin può
 * importare uno o più cataloghi (con un click) oppure scegliere le singole voci.
 */

function tipoBadgeClass(tipo: string) {
  const map: Record<string, string> = {
    posa: "bg-green-100 text-green-700",
    manodopera: "bg-emerald-100 text-emerald-700",
    trasporto: "bg-blue-100 text-blue-700",
    tiro_piano: "bg-purple-100 text-purple-700",
    smaltimento: "bg-orange-100 text-orange-700",
    nolo: "bg-yellow-100 text-yellow-700",
    sopralluogo: "bg-cyan-100 text-cyan-700",
    progettazione: "bg-indigo-100 text-indigo-700",
    ponteggio: "bg-amber-100 text-amber-700",
    lattoneria: "bg-slate-100 text-slate-700",
    sigillatura: "bg-rose-100 text-rose-700",
    contorno: "bg-lime-100 text-lime-700",
    falso_telaio: "bg-teal-100 text-teal-700",
    pratica: "bg-pink-100 text-pink-700",
    altro: "bg-gray-100 text-gray-700",
  };
  return map[tipo] ?? map.altro;
}

/** Colore semaforo margine: >=25% verde, >=15% giallo, altrimenti rosso. */
function margineColor(margine: number): string {
  if (margine >= 25) return "text-emerald-600";
  if (margine >= 15) return "text-amber-600";
  return "text-rose-600";
}

/** Label umana del margine (es. "Ottimo", "Basso", "Sottocosto"). */
function margineLabel(margine: number, hasCost: boolean): string {
  if (!hasCost) return "n/d";
  if (margine < 0) return "Sottocosto";
  if (margine < 15) return "Basso";
  if (margine < 25) return "Accettabile";
  return "Ottimo";
}

/**
 * Semaforo margine della TABELLA: usa il «Margine minimo delle commesse» di
 * Approvazioni (#40), non una soglia fissa. (Il dialogo della voce e la riga dei
 * numeri usano ancora 15/25 fissi: vedi `margineColor`; la scelta di una soglia
 * sola è una decisione aperta.) Restituisce le classi per il pallino e per il
 * testo, più una label accessibile.
 * - margine non calcolabile (manca costo o vendita) → neutro
 * - < 0 → rosso (in perdita / sottocosto)
 * - < soglia → giallo (sotto la soglia minima)
 * - ≥ soglia → verde (margine sano)
 */
function margineSemaforo(
  margine: number | null,
  soglia: number,
): { dot: string; text: string; label: string } {
  if (margine == null || !Number.isFinite(margine)) {
    return { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "Margine non calcolabile" };
  }
  if (margine < 0) {
    return { dot: "bg-rose-500", text: "text-rose-600", label: "In perdita (sottocosto)" };
  }
  if (margine < soglia) {
    return { dot: "bg-amber-500", text: "text-amber-600", label: `Sotto la soglia minima (${soglia}%)` };
  }
  return { dot: "bg-emerald-500", text: "text-emerald-600", label: "Margine sano" };
}

function calcMargine(pv: number, pa: number) {
  if (!pv) return 0;
  return ((pv - pa) / pv) * 100;
}

/**
 * Sezione varianti costo: wrapper che si monta solo se l'utente ha
 * can_view_costs. Gating doppio (role check + permission) per evitare
 * anche solo un flash della UI in caso di ruolo non-admin.
 */
function TariffaVariantiSection({
  tariffaId, costoDefault, tariffaSquadraId,
}: { tariffaId: string; costoDefault: number | null; tariffaSquadraId?: string | null }) {
  const { data: perms } = useUserPermissions();
  if (!perms.can_view_costs) return null;
  return (
    <TariffaVariantiEditor
      tariffaId={tariffaId}
      costoDefault={costoDefault}
      tariffaSquadraId={tariffaSquadraId}
    />
  );
}

// ─── Riga dei numeri ──────────────────────────────────────────────────────────
/**
 * Una riga sola: quante voci ci sono, il margine medio, quante stanno sotto soglia e, se ce n'è, le basi standard da
 * completare con il pulsante per arrivarci. Prima erano due blocchi uno sopra l'altro (la striscia dei numeri e un avviso
 * blu a parte): la prima voce dell'elenco partiva più in basso per niente.
 */
function RigaNumeri({
  tariffe, isAdmin, soglia, onShowSottoSoglia, onCompletaBasi,
}: {
  tariffe: Tariffa[]; isAdmin: boolean; soglia: number;
  onShowSottoSoglia?: () => void; onCompletaBasi?: () => void;
}) {
  const idSpiegazioneBasi = useId();
  const kpi = useMemo(() => {
    const totali = tariffe.length;
    const attive = tariffe.filter((t) => t.attivo !== false).length;
    const basi = tariffe.filter(lavorazioneStandardDaCompletare).length;
    const archiviate = totali - attive - basi;
    // Media semplice dei margini delle voci che hanno sia prezzo sia costo.
    let sumMarg = 0;
    let countMarg = 0;
    let sottoSoglia = 0; // #49 — voci con margine calcolabile sotto la soglia di Approvazioni
    for (const t of tariffe) {
      const pv = t.prezzo_vendita ?? 0;
      const pc = costoTariffa(t) ?? 0;
      if (pv > 0 && pc > 0) {
        const m = calcMargine(pv, pc);
        sumMarg += m;
        countMarg += 1;
        if (m < soglia) sottoSoglia += 1;
      }
    }
    const margineMedio = countMarg > 0 ? sumMarg / countMarg : 0;
    return { totali, attive, archiviate, basi, margineMedio, countMarg, sottoSoglia };
  }, [tariffe, soglia]);

  const spiegazioneBasi = "Apri una voce, controlla cosa comprende e imposta i tuoi prezzi. Le basi non sono attive nei preventivi.";

  // Striscia unica al posto di 4 card da 130px: stessi numeri, un decimo dello
  // spazio. Il "tipo più usato" (vanity) è uscito; il conteggio per tipo vive
  // già nei tab gruppo. I bottoni (sotto soglia, completa le basi) sono i soli KPI azionabili.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
      <div className="flex items-baseline gap-1.5">
        <span className="text-lg font-bold leading-none tabular-nums">{kpi.totali}</span>
        <span className="text-muted-foreground">voci</span>
        <span className="text-xs text-muted-foreground">
          · {kpi.attive} attive{kpi.archiviate > 0 ? ` · ${kpi.archiviate} archiviate` : ""}
        </span>
      </div>
      {isAdmin && (
        <>
          <div className="hidden h-4 w-px bg-border sm:block" aria-hidden />
          <div className="flex items-baseline gap-1.5">
            <span className="text-muted-foreground">Margine medio</span>
            <span className={`text-lg font-bold leading-none tabular-nums ${kpi.countMarg > 0 ? margineColor(kpi.margineMedio) : "text-muted-foreground"}`}>
              {kpi.countMarg > 0 ? `${kpi.margineMedio.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : "—"}
            </span>
            {kpi.countMarg > 0 && (
              <span className="text-xs text-muted-foreground">su {kpi.countMarg} con costi</span>
            )}
          </div>
        </>
      )}
      {isAdmin && kpi.sottoSoglia > 0 && (
        <button
          type="button"
          onClick={onShowSottoSoglia}
          title={`Filtra le voci con margine sotto la soglia minima del ${soglia}%`}
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/70"
        >
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {kpi.sottoSoglia} sotto soglia ({soglia}%)
        </button>
      )}
      {kpi.basi > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-blue-200 bg-blue-50/60 py-1 pl-2.5 pr-1 dark:border-blue-900/50 dark:bg-blue-950/30" title={spiegazioneBasi}>
          <span className="text-xs">
            Hai {kpi.basi} {kpi.basi === 1 ? "lavorazione standard" : "lavorazioni standard"} da personalizzare
          </span>
          <span id={idSpiegazioneBasi} className="sr-only">{spiegazioneBasi}</span>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" aria-describedby={idSpiegazioneBasi} onClick={onCompletaBasi}>
            Completa le basi
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tariffa Dialog ───────────────────────────────────────────────────────────
/** Da telefono i campi sono alti 44 px (bersaglio da dito); dal tablet in su restano compatti. */
const CAMPO_DA_DITO = "max-md:h-11";

/**
 * La finestra di una voce. L'ordine è quello in cui si ragiona: prima le due scelte che decidono (il tipo di lavoro e
 * l'unità), poi il nome, il prezzo di vendita e il costo, con il margine che ne viene. Tutto il resto (codice,
 * descrizione, listino di, area, gruppo, stato, incidenza della manodopera, fonte) sta in «Altri dati», chiuso.
 * Tipo e unità partono come sempre da «Posa» e «pz».
 */
export function TariffaDialog({
  open, onClose, editing, companyId, isAdmin, currentVertical, onSaved, squadre = [], dipendenti = [], erroreDipendenti = false, gruppoIniziale = "posa",
}: {
  open: boolean; onClose: () => void; editing: Tariffa | null;
  companyId: string; isAdmin: boolean;
  currentVertical: string | null;
  onSaved: () => void;
  /** Squadre/subappaltatori per "di chi e' questo listino". */
  squadre?: Array<{ id: string; name: string | null }>;
  dipendenti?: DipendenteCostoLavorazione[];
  erroreDipendenti?: boolean;
  gruppoIniziale?: GruppoLavorazione;
}) {
  // Un id per campo, perché l'etichetta lo nomini per chi usa il lettore di schermo.
  const idBase = useId();
  const idDi = (campo: string) => `${idBase}-${campo}`;
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [codice, setCodice] = useState(editing?.codice ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [tipo, setTipo] = useState<TipoTariffa>(editing?.tipo ?? "posa");
  // FASE 6: unita_fatturazione è la nuova UM canonica (fissa alla creazione).
  // unitaTariffa e non unita_fatturazione grezza: sulle voci scritte solo
  // nella legacy `unita` è rimasto il «pz» di default, il campo è bloccato e
  // salvando l'unità vera (mq, h, km…) si perdeva (05/10/2026).
  const [unitaFatturazione, setUnitaFatturazione] = useState<UnitaFatturazione>(
    editing
      ? (unitaTariffa(editing, UM_DEFAULT_BY_TIPO[editing.tipo] ?? "pz") as UnitaFatturazione)
      : (UM_DEFAULT_BY_TIPO.posa ?? "pz"),
  );
  const [prezzoVendita, setPrezzoVendita] = useState(String(editing?.prezzo_vendita ?? ""));
  // costoTariffa, non costo_interno ?? prezzo_costo: costo_interno nasce a 0
  // (DEFAULT) e nascondeva il costo vero rimasto in prezzo_costo; salvando,
  // quello 0 finiva su tutte e tre le colonne e il costo andava perso (05/10/2026).
  const [costoInterno, setCostoInterno] = useState(
    String(costoTariffa(editing) ?? ""),
  );
  const [verticalAssociato, setVerticalAssociato] = useState<string>(
    editing ? (editing.vertical_associato ?? "") : (currentVertical ?? ""),
  );
  const [pianoBase, setPianoBase] = useState(String(editing?.piano_base ?? "1"));
  const [prezzoPianoAgg, setPrezzoPianoAgg] = useState(String(editing?.prezzo_piano_aggiuntivo ?? ""));
  const [fonte, setFonte] = useState(editing?.fonte ?? "");
  // Due decimali, non l'intero: l'analisi prezzi salva p.es. 0,3162 e
  // riaprire-e-salvare non deve arrotondarla a 32% (05/10/2026).
  const [incidenzaMdoPct, setIncidenzaMdoPct] = useState(
    editing?.incidenza_manodopera_pct != null
      ? String(Math.round(editing.incidenza_manodopera_pct * 10000) / 100)
      : "",
  );
  const [attivo, setAttivo] = useState<boolean>(editing?.attivo !== false);
  /** "" = listino aziendale generico; altrimenti id squadra. */
  const [externalTeamId, setExternalTeamId] = useState<string>(editing?.external_team_id ?? "");
  const [saving, setSaving] = useState(false);
  // Sul computo la tastiera non copre niente: chi crea una voce scrive subito il nome. Su telefono no (salirebbe da sola).
  const [focusSulNome] = useState(() => !editing && typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches);
  const costoSalvato = leggiCostoLavorazione(editing?.custom_field_values);
  const costoModificato = costoLavorazioneModificato(costoSalvato, costoTariffa(editing) ?? 0);
  const [configCosto, setConfigCosto] = useState(() => ({ ...costoSalvato, modalita: costoModificato ? "manuale" as const : costoSalvato.modalita }));
  const [gruppo, setGruppo] = useState<GruppoLavorazione>(() => editing ? gruppoLavorazione(editing) : gruppoIniziale);
  const calcoloCosto = calcolaCostoLavorazione(configCosto, numeroCosto(costoInterno) ?? (configCosto.modalita === "manuale" ? 0 : null));
  // «Altri dati» si apre a mano. Da solo si apre solo quando lì c'è da correggere qualcosa: il listino di una squadra
  // non va d'accordo con la squadra interna (vedi sotto).
  const [altriAperti, setAltriAperti] = useState(false);
  const squadraConSquadraInterna = isAdmin && configCosto.modalita === "interna" && !!externalTeamId;
  const mostraAltri = altriAperti || squadraConSquadraInterna;
  const areaDellaVoce = areaDiVerticale(verticalAssociato);
  const riepilogoAltri = [
    `Area: ${areaDellaVoce ? nomeArea(areaDellaVoce) : "comune"}`,
    `Gruppo: ${GRUPPI_LAVORAZIONE.find((g) => g.id === gruppo)?.nome ?? gruppo}`,
    ...(attivo ? [] : ["archiviata"]),
  ].join(" · ");

  // Semaforo margine live
  const pvNum = numeroCosto(prezzoVendita) ?? 0;
  const ciNum = calcoloCosto.applicato ?? 0;
  const marginePerc = pvNum > 0 ? ((pvNum - ciNum) / pvNum) * 100 : 0;
  const guadagnoUnit = pvNum - ciNum;

  // Validazioni soft (non bloccanti — warning in UI)
  const warnings: string[] = [];
  if (isAdmin && pvNum > 0 && ciNum > 0 && ciNum >= pvNum) warnings.push("Il costo è uguale o più alto del prezzo di vendita: il margine è zero o negativo.");
  if (pvNum === 0 && editing) warnings.push("Prezzo di vendita a zero — la voce non genererà importo in preventivo.");

  // Validazioni HARD — bloccano il submit
  // M1 (audit): evitare di persistere margini negativi o tariffe nuove senza prezzo.
  //   - Per tariffe esistenti lasciamo passare prezzo=0 (archive di fatto)
  //   - Per nuove tariffe forziamo prezzo>0 (non ha senso creare una tariffa a zero)
  //   - Per admin, costo uguale o maggiore del prezzo blocca (margine zero o negativo: = non ha senso commerciale)
  const blockReason: string | null = (() => {
    if (isAdmin && configCosto.modalita === "manuale" && costoInterno.trim() && numeroCosto(costoInterno) == null) return "Inserisci un costo diretto valido, maggiore o uguale a zero.";
    if (isAdmin && calcoloCosto.applicato == null) return "Completa il costo della modalità scelta: ore, operatori e costo orario oppure importo del subappalto.";
    if (squadraConSquadraInterna) return "Una squadra interna non può usare un listino riservato al subappaltatore: in «Altri dati» scegli Listino aziendale (generico).";
    if (isAdmin && pvNum > 0 && ciNum > 0 && ciNum >= pvNum) {
      return "Il costo è uguale o più alto del prezzo di vendita. Correggi prima di salvare.";
    }
    if (!editing && pvNum <= 0) {
      return "Il prezzo di vendita deve essere maggiore di 0 per una nuova voce.";
    }
    return null;
  })();

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    if (!companyId) { toast.error("Azienda non disponibile"); return; }
    if (blockReason) { toast.error(blockReason); return; }
    setSaving(true);
    try {
      const parseNonNegative = (value: string, label: string): number | null => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed.replace(",", "."));
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${label} deve essere un numero positivo o zero`);
        }
        return parsed;
      };
      const parseNonNegativeInt = (value: string, label: string, fallback: number): number => {
        const trimmed = value.trim();
        if (!trimmed) return fallback;
        const parsed = Number.parseInt(trimmed, 10);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw new Error(`${label} deve essere un numero intero positivo o zero`);
        }
        return parsed;
      };

      const prezzoVenditaValue = parseNonNegative(prezzoVendita, "Il prezzo di vendita");
      const costoInternoValue = isAdmin ? calcoloCosto.applicato! : (costoTariffa(editing) ?? 0);
      const prezzoPianoAggValue = parseNonNegative(prezzoPianoAgg, "Il prezzo del piano aggiuntivo");
      const pianoBaseValue = parseNonNegativeInt(pianoBase, "Il piano base", 1);

      // Incidenza manodopera: input in % (0..100) → frazione 0..1 in DB. null se vuoto/non valido.
      const incidenzaMdo = (() => {
        const n = Number(incidenzaMdoPct.replace(",", "."));
        return Number.isFinite(n) && n > 0 ? incidenzaFrazione(n) : null;
      })();

      const payload: Record<string, unknown> = {
        company_id: companyId,
        nome: nome.trim(),
        codice: codice.trim() || null,
        descrizione: descrizione.trim() || null,
        tipo,
        // Backward-compat: popoliamo anche la vecchia colonna `unita` con mapping
        unita: legacyUnitaFrom(unitaFatturazione),
        unita_fatturazione: unitaFatturazione,
        vertical_associato: verticalAssociato.trim() || null,
        prezzo_vendita: prezzoVenditaValue,
        fonte: fonte.trim() || null,
        incidenza_manodopera_pct: incidenzaMdo,
        attivo,
        attiva: attivo,
        // Listino per squadra: "" = generico (NULL)
        external_team_id: externalTeamId || null,
        piano_base: tipo === "tiro_piano" ? pianoBaseValue : null,
        prezzo_piano_aggiuntivo: tipo === "tiro_piano" ? prezzoPianoAggValue : null,
        custom_field_values: { ...oggettoCampi(editing?.custom_field_values), _gruppo_lavorazione: gruppo },
      };
      // costo_interno only visible/writable by admins
      if (isAdmin) {
        payload.costo_interno = costoInternoValue;
        payload.costo_default = costoInternoValue;
        // Manteniamo il legacy prezzo_costo allineato finché esiste la colonna
        payload.prezzo_costo = costoInternoValue;
        payload.custom_field_values = campiConCostoLavorazione(editing?.custom_field_values, configCosto, costoInternoValue, gruppo);
      }

      const tbl = supabase.from("tariffe_aziendali");
      if (editing) {
        const { data, error } = await tbl
          .update(payload as never)
          .eq("id", editing.id)
          .eq("company_id", companyId).select("id").single();
        if (error) throw error;
        if (!data) throw new Error("Voce non aggiornata: verifica i permessi e riprova.");
      } else {
        const { error } = await tbl.insert(payload as never);
        if (error) throw error;
      }
      toast.success(editing ? "Voce aggiornata" : "Voce creata");
      onSaved(); onClose();
    } catch (err) {
      toast.error(testoErrore(err, "Voce non salvata."));
    } finally {
      setSaving(false);
    }
  };

  const umLabel = UM_FATTURAZIONE.find((u) => u.value === unitaFatturazione)?.label ?? unitaFatturazione;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica voce" : "Nuova voce"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Modifica i dati della voce. L'unità di misura è fissa per le voci già usate in preventivo."
              : "Scegli che lavoro è e come si misura, poi scrivi il nome, il prezzo e il costo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Le due scelte che decidono: tipo di lavoro e unità. Partono da «Posa» e «pz». */}
          <div className="grid items-start gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={idDi("tipo")}>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => {
                setTipo(v as TipoTariffa);
                // Suggerisci UM di default per il tipo, ma solo se stiamo creando
                if (!editing) {
                  setUnitaFatturazione(UM_DEFAULT_BY_TIPO[v] ?? "pz");
                }
              }}>
                <SelectTrigger id={idDi("tipo")} aria-describedby={idDi("tipo-aiuto")} className={`mt-1.5 ${CAMPO_DA_DITO}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_DEFS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p id={idDi("tipo-aiuto")} className="mt-1 text-xs text-muted-foreground">
                <Info className="inline h-3 w-3 mr-1" aria-hidden />{tipoHint(tipo)}
              </p>
            </div>

            <div>
              <Label htmlFor={idDi("unita")}>
                Unità di fatturazione
                {editing && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (fissa)
                  </span>
                )}
              </Label>
              <Select
                value={unitaFatturazione}
                disabled={!!editing}
                onValueChange={(v) => setUnitaFatturazione(v as UnitaFatturazione)}
              >
                <SelectTrigger id={idDi("unita")} className={`mt-1.5 ${CAMPO_DA_DITO}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UM_FATTURAZIONE.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      <span className="font-medium">{u.label}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{u.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Nome e prezzo di vendita */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <Label htmlFor={idDi("nome")}>Nome *</Label>
              <Input
                id={idDi("nome")}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Posa finestra media (100×120)"
                aria-required="true"
                autoFocus={focusSulNome}
                className={`mt-1.5 ${CAMPO_DA_DITO}`}
              />
            </div>
            <div>
              <Label htmlFor={idDi("prezzo")}>Prezzo di vendita (€ per {umLabel})</Label>
              <Input
                id={idDi("prezzo")}
                type="number"
                min="0"
                step="0.01"
                value={prezzoVendita}
                onChange={(e) => setPrezzoVendita(e.target.value)}
                placeholder="0.00"
                className={`mt-1.5 ${CAMPO_DA_DITO}`}
              />
            </div>
          </div>

          {isAdmin && <CostoLavorazioneEditor value={configCosto} onChange={setConfigCosto} costoManuale={costoInterno} onCostoManuale={setCostoInterno} unita={umLabel} dipendenti={dipendenti} erroreDipendenti={erroreDipendenti} costoModificato={costoModificato} />}

          {/* Live example + margine */}
          {(pvNum > 0 || (isAdmin && ciNum > 0)) && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calculator className="h-4 w-4" aria-hidden />
                Anteprima economica — 1 {umLabel}
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                {isAdmin && (
                  <div className="rounded-md bg-background p-2 border">
                    <div className="text-xs text-muted-foreground">Costo</div>
                    <div className="font-semibold text-rose-600">{formatCurrency(ciNum)}</div>
                  </div>
                )}
                <div className="rounded-md bg-background p-2 border">
                  <div className="text-xs text-muted-foreground">Vendita</div>
                  <div className="font-semibold">{formatCurrency(pvNum)}</div>
                </div>
                {isAdmin && (
                  <div className="rounded-md bg-background p-2 border">
                    <div className="text-xs text-muted-foreground">Guadagno</div>
                    <div className={`font-semibold ${margineColor(marginePerc)}`}>
                      {formatCurrency(guadagnoUnit)}
                      {pvNum > 0 && (
                        <span className="ml-1 text-xs font-normal">
                          ({marginePerc.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {isAdmin && pvNum > 0 && ciNum > 0 && (
                <div className="flex items-center justify-between rounded-md bg-background px-3 py-2 text-xs border">
                  <span className="text-muted-foreground">
                    Giudizio margine:
                  </span>
                  <span className={`font-semibold ${margineColor(marginePerc)}`}>
                    {margineLabel(marginePerc, true)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tiro piano specifico */}
          {tipo === "tiro_piano" && (
            <div className="rounded-lg bg-purple-50 border border-purple-200 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
                <Info className="h-4 w-4" aria-hidden />
                Formula "Tiro al piano"
              </div>
              <p className="text-xs text-purple-700">
                <strong>Piano 0 → base:</strong> prezzo vendita base × quantità.
                <br />
                <strong>Piani ≥ {pianoBase || "1"}:</strong> base + (piano − soglia) × prezzo piano aggiuntivo.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={idDi("piano-base")}>Piano base (soglia)</Label>
                  <Input
                    id={idDi("piano-base")}
                    type="number"
                    min="0"
                    value={pianoBase}
                    onChange={(e) => setPianoBase(e.target.value)}
                    placeholder="1"
                    className={`mt-1.5 ${CAMPO_DA_DITO}`}
                  />
                </div>
                <div>
                  <Label htmlFor={idDi("piano-extra")}>Prezzo piano aggiuntivo €</Label>
                  <Input
                    id={idDi("piano-extra")}
                    type="number"
                    min="0"
                    step="0.01"
                    value={prezzoPianoAgg}
                    onChange={(e) => setPrezzoPianoAgg(e.target.value)}
                    placeholder="0.00"
                    className={`mt-1.5 ${CAMPO_DA_DITO}`}
                  />
                </div>
              </div>
              {/* Preview per 1/3/5 piani */}
              {pvNum > 0 && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
                  {[1, 3, 5].map((piano) => {
                    const soglia = parseInt(pianoBase || "1", 10);
                    const extra = parseFloat(prezzoPianoAgg) || 0;
                    const excess = Math.max(0, piano - soglia);
                    const totale = pvNum + excess * extra;
                    return (
                      <div key={piano} className="rounded-md bg-background border p-2">
                        <div className="text-muted-foreground">Piano {piano}</div>
                        <div className="font-semibold">{formatCurrency(totale)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <ul className="space-y-1 text-xs text-amber-800">
                {warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tutto il resto, chiuso: codice, descrizione, listino, area, gruppo, stato, incidenza, fonte. */}
          <details
            open={mostraAltri}
            onToggle={(e) => setAltriAperti(e.currentTarget.open)}
            className="group rounded-lg border"
          >
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span>Altri dati</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{riepilogoAltri}</span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={idDi("codice")}>Codice</Label>
                <Input
                  id={idDi("codice")}
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                  placeholder="Es. LOM241.1C.00.010"
                  aria-describedby={idDi("codice-aiuto")}
                  className={`mt-1.5 font-mono ${CAMPO_DA_DITO}`}
                />
                <p id={idDi("codice-aiuto")} className="mt-1 text-xs text-muted-foreground">
                  Codice articolo/voce. Opzionale.
                </p>
              </div>
              <div>
                <Label htmlFor={idDi("descrizione")}>Descrizione</Label>
                <Input
                  id={idDi("descrizione")}
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  placeholder="Dettagli visibili ai colleghi (es. include smontaggio)"
                  className={`mt-1.5 ${CAMPO_DA_DITO}`}
                />
              </div>

              {/* Di chi e' questo listino: aziendale (generico) o di una squadra.
                  La voce di una squadra compare nel dialog manodopera SOLO quando
                  si sceglie quella squadra. */}
              {squadre.length > 0 && (
                <div className="sm:col-span-2">
                  <Label htmlFor={idDi("listino-di")}>Listino di</Label>
                  <Select value={externalTeamId || "generico"} onValueChange={(v) => setExternalTeamId(v === "generico" ? "" : v)}>
                    <SelectTrigger id={idDi("listino-di")} aria-describedby={idDi("listino-di-aiuto")} className={`mt-1.5 ${CAMPO_DA_DITO}`}>
                      <SelectValue placeholder="Listino aziendale (generico)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="generico">Listino aziendale (generico)</SelectItem>
                      {squadre.map((sq) => (
                        <SelectItem key={sq.id} value={sq.id}>{sq.name ?? "Squadra"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id={idDi("listino-di-aiuto")} className="mt-1 text-xs text-muted-foreground">
                    Lascia il listino aziendale se la voce vale per tutti. Scegli una squadra se è riservata a lei.
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor={idDi("area")}>Area di lavoro</Label>
                <Select
                  value={verticalAssociato || "__none__"}
                  onValueChange={(v) => setVerticalAssociato(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger id={idDi("area")} aria-describedby={idDi("area-aiuto")} className={`mt-1.5 ${CAMPO_DA_DITO}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Comune / nessuna area</SelectItem>
                    {AREE_STANDARD.map((area) => <SelectItem key={area.chiave} value={area.verticale}>{area.nome}</SelectItem>)}
                    {[...new Set(["generico", "edile", "impiantistica", verticalAssociato])]
                      .filter((v) => v && !AREE_STANDARD.some((a) => a.verticale === v))
                      .map((v) => <SelectItem key={v} value={v}>{nomeArea(areaDiVerticale(v) ?? "generale")} ({v})</SelectItem>)}
                  </SelectContent>
                </Select>
                <p id={idDi("area-aiuto")} className="mt-1 text-xs text-muted-foreground">Organizza la voce nel listino. Le voci comuni restano senza un&apos;area specifica.</p>
              </div>
              <div>
                <Label htmlFor={idDi("gruppo")}>Gruppo di lavorazioni</Label>
                <select
                  id={idDi("gruppo")}
                  aria-describedby={idDi("gruppo-aiuto")}
                  value={gruppo}
                  onChange={e => setGruppo(e.target.value as GruppoLavorazione)}
                  className={`mt-1.5 h-10 w-full rounded-md border bg-background px-3 text-sm ${CAMPO_DA_DITO}`}
                >
                  {GRUPPI_LAVORAZIONE.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                </select>
                <p id={idDi("gruppo-aiuto")} className="mt-1 text-xs text-muted-foreground">All'interno dell'area, organizza la voce per fase o tipo di lavoro.</p>
              </div>

              <div>
                <Label htmlFor={idDi("stato")}>Stato</Label>
                <div className="mt-1.5 flex items-center gap-2 rounded-md border px-3 py-2">
                  <Switch id={idDi("stato")} aria-describedby={idDi("stato-testo")} checked={attivo} onCheckedChange={setAttivo} />
                  <span id={idDi("stato-testo")} className="text-sm">
                    {attivo ? "Attiva (selezionabile in preventivo)" : "Archiviata"}
                  </span>
                </div>
              </div>
              <div>
                <Label htmlFor={idDi("incidenza")}>Incidenza manodopera %</Label>
                <Input
                  id={idDi("incidenza")}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={incidenzaMdoPct}
                  onChange={(e) => setIncidenzaMdoPct(e.target.value)}
                  placeholder="Es. 35"
                  aria-describedby={idDi("incidenza-aiuto")}
                  className={`mt-1.5 ${CAMPO_DA_DITO}`}
                />
                <p id={idDi("incidenza-aiuto")} className="mt-1 text-xs text-muted-foreground">
                  Quota di manodopera sul prezzo (obbligo base d'asta nei lavori pubblici). Opzionale.
                </p>
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor={idDi("fonte")}>Fonte</Label>
                <Input
                  id={idDi("fonte")}
                  value={fonte}
                  onChange={(e) => setFonte(e.target.value)}
                  placeholder="Es. Prezzario Regione Lombardia 2024"
                  aria-describedby={idDi("fonte-aiuto")}
                  className={`mt-1.5 ${CAMPO_DA_DITO}`}
                />
                <p id={idDi("fonte-aiuto")} className="mt-1 text-xs text-muted-foreground">
                  Prezzario di provenienza (se importata).
                </p>
              </div>
            </div>
          </details>

          {/* Sprint B — Varianti Costo Manodopera: visibile solo su tariffe esistenti e solo admin */}
          {isAdmin && editing && (
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Varianti per commesse e squadre (avanzato)</summary>
              <p className="my-2 text-xs text-muted-foreground">Il calcolo sopra imposta il costo base del listino. Nei margini delle commesse, assegnazioni già bloccate e varianti predefinite hanno precedenza. Non vengono cambiate da questo salvataggio.</p>
            <TariffaVariantiSection
              tariffaId={editing.id}
              costoDefault={costoTariffa(editing)}
              tariffaSquadraId={externalTeamId || null}
            />
            </details>
          )}

          {/* Reverse panel: prodotti del listino che usano questa tariffa */}
          {editing && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-semibold mb-2">
                Prodotti collegati a questa voce
              </h3>
              <TariffaProdottiCollegati
                tariffaId={editing.id}
                tariffaName={editing.nome}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {blockReason && (
            <div id={idDi("blocco")} className="mr-auto flex items-start gap-1.5 self-center text-xs text-rose-600">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{blockReason}</span>
            </div>
          )}
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving || !!blockReason} aria-describedby={blockReason ? idDi("blocco") : undefined}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Standard Tariffe Picker Dialog ───────────────────────────────────────────
/**
 * Dialog di import catalogo standard. Offre due modalità d'uso:
 *   1. PRESET: card cliccabili che toggleano in blocco le tariffe del preset.
 *      L'admin clicca "Serramentista completo" e tutte le tariffe serramentista
 *      diventano pre-selezionate. Click di nuovo → si deselezionano.
 *   2. PICKER FINE: lista raggruppata per tipo con checkbox singole, per chi
 *      vuole scegliere una per una.
 * Le tariffe già esistenti (match per nome) sono disabilitate e non duplicabili.
 */
function StandardTariffeDialog({
  open, onClose, existing, companyId, onCreated, vertical,
}: {
  open: boolean; onClose: () => void; existing: Tariffa[];
  companyId: string; onCreated: () => void;
  /** Vertical dell'azienda — guida la pre-selezione del preset al first-run. */
  vertical: Vertical;
}) {
  const existingNames = useMemo(
    () => new Set(existing.map((t) => t.nome.trim().toLowerCase())),
    [existing],
  );
  const isExistingName = (nome: string) => existingNames.has(nome.trim().toLowerCase());

  // Default: se l'azienda è "vuota", pre-seleziona il preset coerente col
  // vertical dell'azienda (caduta su "essenziale" se vertical non mappa a
  // niente di specifico — è il comportamento storico pre-FASE 1.2).
  const [selected, setSelected] = useState<Set<string>>(() => {
    if (existing.length === 0) {
      const presetId = getDefaultPresetForVerticalTariffe(vertical);
      const presetRows = STANDARD_TARIFFE
        .filter((d) => d.presets.includes(presetId))
        .map((d) => d.nome);
      return new Set(presetRows);
    }
    return new Set();
  });
  const [creating, setCreating] = useState(false);

  const toggle = (nome: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nome)) next.delete(nome);
      else next.add(nome);
      return next;
    });
  };

  /** Toggle preset: se tutte le tariffe selezionabili del preset sono già
   *  selezionate → deseleziona le sole voci di quel preset; altrimenti aggiunge
   *  quelle mancanti (senza toccare il resto della selezione). */
  const togglePreset = (presetId: PresetId) => {
    const items = STANDARD_TARIFFE.filter((d) => d.presets.includes(presetId) && !isExistingName(d.nome));
    const allSelected = items.length > 0 && items.every((d) => selected.has(d.nome));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const d of items) next.delete(d.nome);
      } else {
        for (const d of items) next.add(d.nome);
      }
      return next;
    });
  };

  /** Quante voci di questo preset sono attualmente selezionate (sul totale importabile). */
  const presetStats = (presetId: PresetId) => {
    const all = STANDARD_TARIFFE.filter((d) => d.presets.includes(presetId));
    const importabili = all.filter((d) => !isExistingName(d.nome));
    const sel = importabili.filter((d) => selected.has(d.nome)).length;
    return { total: all.length, importabili: importabili.length, selected: sel };
  };

  const selectAll = () =>
    setSelected(new Set(STANDARD_TARIFFE.filter((d) => !isExistingName(d.nome)).map((d) => d.nome)));
  const selectNone = () => setSelected(new Set());

  const toCreate = STANDARD_TARIFFE.filter((d) => selected.has(d.nome) && !isExistingName(d.nome));

  const handleCreate = async () => {
    if (toCreate.length === 0) {
      toast.info("Nessuna voce selezionata");
      return;
    }
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setCreating(true);
    try {
      const payload = toCreate.map((d) => {
        // Il campo `presets` è solo client-side — non lo mandiamo al DB.
        const { presets: _presets, ...rest } = d;
        return {
          ...rest,
          company_id: companyId,
          // Allineiamo anche il campo legacy `unita` al nuovo unita_fatturazione
          unita: d.unita_fatturazione ? legacyUnitaFrom(d.unita_fatturazione) : "pz",
          // Il costo nelle tre colonne, come il salvataggio della voce
          // (prima costo_default restava vuoto, 05/10/2026).
          prezzo_costo: d.costo_interno,
          costo_default: d.costo_interno,
          attivo: true,
        };
      });
      const { error } = await supabase.from("tariffe_aziendali").insert(payload as never);
      if (error) throw error;
      toast.success(`${toCreate.length} voci create`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(testoErrore(err, "Voci non create."));
    } finally {
      setCreating(false);
    }
  };

  // Raggruppa per tipo per la lista fine
  const groups = useMemo(() => {
    const g = new Map<string, TariffaSeed[]>();
    for (const d of STANDARD_TARIFFE) {
      const arr = g.get(d.tipo) ?? [];
      arr.push(d);
      g.set(d.tipo, arr);
    }
    // Ordina per ordine tipo definito in TIPO_DEFS
    const tipoOrder = TIPO_DEFS.map((t) => t.value as string);
    return [...g.entries()].sort(
      (a, b) => tipoOrder.indexOf(a[0]) - tipoOrder.indexOf(b[0]),
    );
  }, []);

  const importabiliCount = STANDARD_TARIFFE.filter((d) => !isExistingName(d.nome)).length;
  const giaPresentiCount = STANDARD_TARIFFE.length - importabiliCount;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Catalogo manodopera e servizi standard</DialogTitle>
          <DialogDescription>
            Scegli un catalogo adatto al tuo mestiere per importare in blocco, oppure scegli le singole voci.
            Le voci già presenti (stesso nome) sono disabilitate.
            {giaPresentiCount > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({giaPresentiCount} di {STANDARD_TARIFFE.length} già presenti)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ─── CATALOGHI PRONTI ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Cataloghi pronti
          </h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {PRESET_CATALOGHI.map((preset) => {
              const stats = presetStats(preset.id);
              const Icon = preset.icon;
              const fullySelected = stats.importabili > 0 && stats.selected === stats.importabili;
              const partially = stats.selected > 0 && stats.selected < stats.importabili;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => togglePreset(preset.id)}
                  aria-pressed={fullySelected}
                  disabled={stats.importabili === 0}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    fullySelected
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : partially
                        ? "border-primary/50 bg-primary/[0.02]"
                        : "hover:bg-muted/40"
                  } ${stats.importabili === 0 ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`rounded-md p-1.5 shrink-0 ${preset.iconClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{preset.nome}</span>
                        {fullySelected && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {preset.descrizione}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
                          {stats.importabili}/{stats.total} voci
                        </Badge>
                        {stats.selected > 0 && (
                          <span className="text-primary font-medium">
                            {stats.selected} selezionate
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─── RIEPILOGO + AZIONI BULK ───────────────────────────────────── */}
        <div className="flex items-center justify-between py-2 border-t border-b">
          <div className="text-sm">
            <span className="font-semibold">{toCreate.length}</span>
            <span className="text-muted-foreground"> voci da importare</span>
            <span className="text-muted-foreground text-xs ml-2">
              (su {importabiliCount} disponibili)
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAll} disabled={importabiliCount === 0}>
              Seleziona tutte
            </Button>
            <Button size="sm" variant="ghost" onClick={selectNone} disabled={selected.size === 0}>
              Azzera
            </Button>
          </div>
        </div>

        {/* ─── LISTA FINE PER TIPO ───────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tutte le voci
          </h3>
          {groups.map(([tipo, items]) => (
            <div key={tipo}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${tipoBadgeClass(tipo)}`}>
                  {tipoLabel(tipo)}
                </span>
                <span className="text-xs text-muted-foreground">{items.length} voci</span>
              </div>
              <div className="space-y-1">
                {items.map((d) => {
                  const alreadyExists = isExistingName(d.nome);
                  const isChecked = selected.has(d.nome);
                  return (
                    <label
                      key={d.nome}
                      className={`flex items-start gap-3 rounded-md border p-2.5 ${
                        alreadyExists ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-muted/30"
                      } ${isChecked && !alreadyExists ? "border-primary/40 bg-primary/[0.02]" : ""}`}
                    >
                      <Checkbox
                        checked={isChecked && !alreadyExists}
                        disabled={alreadyExists}
                        onCheckedChange={() => !alreadyExists && toggle(d.nome)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{d.nome}</span>
                          {alreadyExists && (
                            <Badge variant="secondary" className="text-xs">Già presente</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {d.unita_fatturazione ?? d.unita} · {formatCurrency(d.prezzo_vendita ?? 0)}
                            {d.costo_interno != null && (
                              <span className="ml-1 text-muted-foreground/70">
                                (costo {formatCurrency(d.costo_interno)})
                              </span>
                            )}
                          </span>
                        </div>
                        {d.descrizione && (
                          <div className="text-xs text-muted-foreground mt-0.5">{d.descrizione}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.presets.map((p) => (
                            <Badge key={p} variant="outline" className="h-4 px-1.5 text-[10px] font-normal">
                              {PRESET_CATALOGHI.find((x) => x.id === p)?.nome ?? p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleCreate} disabled={creating || toCreate.length === 0}>
            {creating ? "Creazione..." : `Crea ${toCreate.length} voci`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Filtri che si ripiegano da telefono ──────────────────────────────────────
/**
 * I filtri oltre alla ricerca. Sul computo stanno in riga con la ricerca (nessun cambiamento); da telefono, chiusi sotto
 * «Filtri»: cinque campi uno sopra l'altro portavano la prima voce oltre metà schermo. Quanti ne sono attivi lo dice la
 * scritta, e ogni filtro attivo ha comunque il suo cartellino sotto la barra.
 */
function FiltriRipiegabili({ daTelefono, attivi, children }: { daTelefono: boolean; attivi: number; children: ReactNode }) {
  if (!daTelefono) return <>{children}</>;
  return (
    <details className="group rounded-md border bg-background">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <span>Filtri{attivi > 0 ? ` (${attivi})` : ""}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="flex flex-col gap-2 border-t p-2">{children}</div>
    </details>
  );
}

// ─── Pezzi di una voce: gli stessi nella tabella e nella scheda da telefono ───
/**
 * L'interruttore «attiva / archiviata». Ha un nome per chi usa il lettore di schermo: «Archivia Posa finestra».
 * `aDito`: nella scheda da telefono l'area che si tocca arriva a 44 px d'altezza (l'interruttore ne è alto 24).
 */
function InterruttoreStato({
  t, isAdmin, onToggleAttivo, aDito = false,
}: { t: Tariffa; isAdmin: boolean; onToggleAttivo: (t: Tariffa) => void; aDito?: boolean }) {
  const isAttivo = t.attivo !== false;
  const nomeInterruttore = isAdmin
    ? (isAttivo ? `Archivia ${t.nome}` : `Riattiva ${t.nome}`)
    : `${t.nome}: ${isAttivo ? "attiva" : "archiviata"}`;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center">
            <Switch
              checked={isAttivo}
              disabled={!isAdmin}
              aria-label={nomeInterruttore}
              onCheckedChange={() => onToggleAttivo(t)}
              className={aDito ? "relative before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-['']" : undefined}
            />
          </div>
        </TooltipTrigger>
        <TooltipContent>
          {!isAdmin ? (isAttivo ? "Attiva" : "Archiviata") : isAttivo ? "Archivia voce" : "Riattiva voce"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Il menu ⋮ di una voce. Chi può solo consultare ha soltanto «Dove è usata». */
function AzioniVoce({
  t, isAdmin, onEdit, onDelete, onToggleAttivo, onDuplica, onShowUsage, onAnalisi,
}: {
  t: Tariffa; isAdmin: boolean;
  onEdit: (t: Tariffa) => void; onDelete: (id: string) => void; onToggleAttivo: (t: Tariffa) => void;
  onDuplica: (t: Tariffa) => void; onShowUsage: (t: Tariffa) => void; onAnalisi: (t: Tariffa) => void;
}) {
  const isAttivo = t.attivo !== false;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Azioni per ${t.nome}`}>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => onEdit(t)}>
              <Pencil className="h-4 w-4 mr-2" />Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplica(t)}>
              <Copy className="h-4 w-4 mr-2" />Duplica
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={() => onShowUsage(t)}>
          <Link2 className="h-4 w-4 mr-2" />Dove è usata
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => onAnalisi(t)}>
              <Calculator className="h-4 w-4 mr-2" />Analisi prezzo
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleAttivo(t)}>
              {isAttivo ? (
                <><Archive className="h-4 w-4 mr-2" />Archivia</>
              ) : (
                <><RotateCcw className="h-4 w-4 mr-2" />Riattiva</>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => onDelete(t.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />Elimina
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Nome, codice e cartellini di una voce. Nella tabella una riga sola per il nome e una per i cartellini (tagliati se
 * lunghi); nella scheda da telefono vanno a capo.
 */
function NomeVoce({
  t, squadraName, aCapo = false,
}: { t: Tariffa; squadraName?: Record<string, string>; aCapo?: boolean }) {
  return (
    <>
      <div className={`flex min-w-0 gap-1.5 font-medium ${aCapo ? "flex-wrap items-center gap-y-0.5" : "items-center"}`}>
        {t.codice && (
          <Badge variant="outline" title={t.codice} className="h-4 max-w-32 shrink-0 truncate px-1.5 font-mono text-[10px] font-normal">
            {t.codice}
          </Badge>
        )}
        <span className={aCapo ? "min-w-0 break-words" : "truncate"} title={t.nome}>{t.nome}</span>
        {lavorazioneStandardDaCompletare(t) && (
          <Badge variant="secondary" title="Base standard senza prezzo: non è attiva nei preventivi." className="shrink-0 text-[10px]">Da completare</Badge>
        )}
      </div>
      <div className={`mt-0.5 flex min-w-0 gap-1.5 ${aCapo ? "flex-wrap items-center" : "items-center"}`}>
        <span className={`inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] font-medium ${tipoBadgeClass(t.tipo)}`}>
          {tipoLabel(t.tipo)}
        </span>
        {t.external_team_id && (
          <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-[10px] font-normal">
            {squadraName?.[t.external_team_id] ?? "Squadra"}
          </Badge>
        )}
        {t.vertical_associato && (
          <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px] font-normal">
            {t.vertical_associato}
          </Badge>
        )}
        <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px] font-normal">{GRUPPI_LAVORAZIONE.find(g => g.id === gruppoLavorazione(t))?.nome}</Badge>
        {t.tipo === "tiro_piano" && t.prezzo_piano_aggiuntivo != null && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            +{formatCurrency(t.prezzo_piano_aggiuntivo)}/piano oltre il {t.piano_base ?? 1}°
          </span>
        )}
        {t.descrizione && (
          <span className={`min-w-0 text-xs text-muted-foreground ${aCapo ? "break-words" : "truncate"}`} title={t.descrizione}>
            {t.descrizione}
          </span>
        )}
      </div>
    </>
  );
}

/** L'unità di una voce come si legge nella scheda da telefono, dove c'è posto: «a corpo», non «a_corpo». */
function unitaDellaVoce(t: Tariffa): string {
  const unita = unitaTariffa(t, "");
  if (!unita) return "—";
  return UM_FATTURAZIONE.find((u) => u.value === unita)?.label ?? unita;
}

/** Come è stato calcolato il costo di una voce («Costo diretto», «Squadra interna», «Subappalto»). */
function modalitaCostoVoce(t: Tariffa, costo: number): string {
  const config = leggiCostoLavorazione(t.custom_field_values);
  return MODALITA_COSTO_LABEL[costoLavorazioneModificato(config, costo) ? "manuale" : config.modalita];
}

/** Il margine con il suo pallino: il colore dice poco a chi non vede, quindi c'è anche la parola (per il lettore di schermo). */
function MargineConSemaforo({ margine, sem }: { margine: number; sem: ReturnType<typeof margineSemaforo> }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-end gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${sem.dot}`} aria-hidden />
            <span className={`text-sm font-semibold tabular-nums ${sem.text}`}>
              {margine.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </span>
            <span className="sr-only">{sem.label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>{sem.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NessunaVoceTrovata({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <Layers3 className="h-8 w-8 opacity-40" aria-hidden />
      <p className="text-sm">Nessuna voce trovata.</p>
      <p className="text-xs">{isAdmin ? "Prova a cambiare filtro o crea una nuova voce." : "Prova a cambiare filtro."}</p>
    </div>
  );
}

// ─── TariffeTable ────────────────────────────────────────────────────────────
function TariffeTable({
  items, isAdmin, soglia, selectedIds, onToggleSelect, onToggleSelectAll,
  onEdit, onDelete, onToggleAttivo, onDuplica, onShowUsage, onAnalisi, squadraName,
}: {
  items: Tariffa[];
  /** id squadra → nome, per il badge "listino di chi". */
  squadraName?: Record<string, string>;
  /** Amministratore o permesso di modificare il listino: vede costi e margini
   *  e modifica le voci. Chi ha solo il permesso di vederlo le consulta: il
   *  database gli rifiuterebbe ogni modifica (dal 26/09/2026). */
  isAdmin: boolean;
  /** Margine minimo delle commesse (Approvazioni) per il semaforo. */
  soglia: number;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (ids: string[], checked: boolean) => void;
  onEdit: (t: Tariffa) => void;
  onDelete: (id: string) => void;
  onToggleAttivo: (t: Tariffa) => void;
  onDuplica: (t: Tariffa) => void;
  onShowUsage: (t: Tariffa) => void;
  onAnalisi: (t: Tariffa) => void;
}) {
  const isMobile = useIsMobile();
  // Accessori per il sort ("tipo" è ordinabile dai tab gruppo, non serve qui)
  const accessors = useMemo(() => ({
    nome: (t: Tariffa) => t.nome.toLowerCase(),
    unita: (t: Tariffa) => unitaTariffa(t, ""),
    prezzo_vendita: (t: Tariffa) => t.prezzo_vendita ?? 0,
    costo: (t: Tariffa) => costoTariffa(t) ?? 0,
    margine: (t: Tariffa) => {
      const pv = t.prezzo_vendita ?? 0;
      const pc = costoTariffa(t) ?? 0;
      return pv > 0 && pc > 0 ? calcMargine(pv, pc) : -Infinity;
    },
    attivo: (t: Tariffa) => (t.attivo !== false ? 1 : 0),
  }), []);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(items, accessors);

  // Selezione: +1 colonna per il checkbox.
  const colCount = (isAdmin ? 7 : 5) + 1;
  const visibleIds = sortedItems.map((t) => t.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id));
  const headerChecked: boolean | "indeterminate" = allSelected ? true : someSelected ? "indeterminate" : false;

  /** Tutta la riga apre Modifica — tranne i controlli veri (switch, menu, checkbox). */
  const rowClick = (t: Tariffa) => (e: React.MouseEvent) => {
    if (!isAdmin) return;
    const el = e.target as HTMLElement;
    if (el.closest('button, a, input, [role="checkbox"], [role="switch"], [role="menu"], [role="menuitem"]')) return;
    onEdit(t);
  };

  const azioni = { onEdit, onDelete, onToggleAttivo, onDuplica, onShowUsage, onAnalisi };

  // Da telefono (sotto i 768 px) una tabella da 820 px obbligava a scorrere di lato per leggere il prezzo: ogni voce
  // diventa una scheda, con nome, prezzo, costo e margine uno sotto l'altro. Le colonne si ordinano dal computer.
  if (isMobile) {
    return (
      <div className="space-y-2">
        {isAdmin && sortedItems.length > 0 && (
          <label className="flex min-h-11 items-center gap-3 px-1 text-sm text-muted-foreground">
            <Checkbox
              checked={headerChecked}
              onCheckedChange={(v) => onToggleSelectAll(visibleIds, v === true)}
            />
            Seleziona tutte le voci visibili
          </label>
        )}
        <ul className="divide-y rounded-md border" aria-label="Elenco delle voci">
          {sortedItems.length === 0 ? (
            <li className="px-3 py-10 text-center"><NessunaVoceTrovata isAdmin={isAdmin} /></li>
          ) : sortedItems.map((t) => {
            const pv = t.prezzo_vendita ?? 0;
            const pc = costoTariffa(t) ?? 0;
            const hasBoth = pv > 0 && pc > 0;
            const margine = calcMargine(pv, pc);
            const sem = margineSemaforo(hasBoth ? margine : null, soglia);
            const isAttivo = t.attivo !== false;
            const isSelected = selectedIds.has(t.id);
            return (
              <li
                key={t.id}
                data-state={isSelected ? "selected" : undefined}
                onClick={rowClick(t)}
                className={`flex items-start gap-2 p-3 data-[state=selected]:bg-muted ${isAdmin ? "cursor-pointer" : ""} ${!isAttivo ? "opacity-60" : ""}`}
              >
                {isAdmin && (
                  // la casella è alta 16 px: l'area che si tocca arriva a 44
                  <Checkbox
                    className="relative mt-1 shrink-0 before:absolute before:-inset-3.5 before:content-['']"
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(t.id)}
                    aria-label={`Seleziona ${t.nome}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <NomeVoce t={t} squadraName={squadraName} aCapo />
                  <dl className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                    <div className="flex items-baseline gap-1">
                      <dt className="text-xs text-muted-foreground">Vendita</dt>
                      <dd className="font-medium tabular-nums">
                        {pv ? formatCurrency(pv) : <span className="text-muted-foreground">—</span>}
                        <span className="text-xs font-normal text-muted-foreground"> / {unitaDellaVoce(t)}</span>
                      </dd>
                    </div>
                    {isAdmin && (
                      <div className="flex items-baseline gap-1">
                        <dt className="text-xs text-muted-foreground">Costo</dt>
                        <dd className="tabular-nums">
                          {pc ? formatCurrency(pc) : <span className="text-muted-foreground">—</span>}
                          {pc > 0 && <span className="text-xs text-muted-foreground"> · {modalitaCostoVoce(t, pc)}</span>}
                        </dd>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="flex items-baseline gap-1">
                        <dt className="text-xs text-muted-foreground">Margine</dt>
                        <dd>{hasBoth ? <MargineConSemaforo margine={margine} sem={sem} /> : <span className="text-muted-foreground">—</span>}</dd>
                      </div>
                    )}
                  </dl>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <InterruttoreStato t={t} isAdmin={isAdmin} onToggleAttivo={onToggleAttivo} aDito />
                  <AzioniVoce t={t} isAdmin={isAdmin} {...azioni} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      {/* table-fixed: i numeri hanno larghezze fisse e TUTTO il resto va al Nome.
          Prima era il contrario (7 colonne fisse, il nome strozzato a ~190px e
          righe alte fino a 133px perché i nomi andavano a capo su 3-4 righe). */}
      <Table className="table-fixed min-w-[820px] [&_thead_th]:h-10 [&_thead_th]:px-3 [&_tbody_td]:px-3 [&_tbody_td]:py-2">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              {isAdmin && (
                <Checkbox
                  checked={headerChecked}
                  onCheckedChange={(v) => onToggleSelectAll(visibleIds, v === true)}
                  aria-label="Seleziona tutte le voci visibili"
                />
              )}
            </TableHead>
            <SortableTableHead column="attivo" label="Stato" sortConfig={sortConfig} onSort={toggleSort} className="w-[64px]" />
            <SortableTableHead column="nome" label="Nome" sortConfig={sortConfig} onSort={toggleSort} />
            <SortableTableHead column="unita" label="UM" sortConfig={sortConfig} onSort={toggleSort} className="w-[56px]" />
            <SortableTableHead column="prezzo_vendita" label="Vendita" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[104px]" />
            {isAdmin && <SortableTableHead column="costo" label="Costo" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[104px]" />}
            {isAdmin && <SortableTableHead column="margine" label="Margine" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[92px]" />}
            <TableHead className="w-[48px]"><span className="sr-only">Azioni</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center py-10">
                <NessunaVoceTrovata isAdmin={isAdmin} />
              </TableCell>
            </TableRow>
          ) : sortedItems.map((t) => {
            const pv = t.prezzo_vendita ?? 0;
            const pc = costoTariffa(t) ?? 0;
            const hasBoth = pv > 0 && pc > 0;
            const margine = calcMargine(pv, pc);
            const sem = margineSemaforo(hasBoth ? margine : null, soglia);
            const isAttivo = t.attivo !== false;
            const isSelected = selectedIds.has(t.id);
            return (
              <TableRow
                key={t.id}
                data-state={isSelected ? "selected" : undefined}
                onClick={rowClick(t)}
                className={`${isAdmin ? "cursor-pointer" : ""} ${!isAttivo ? "opacity-60" : ""}`}
              >
                <TableCell>
                  {isAdmin && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect(t.id)}
                      aria-label={`Seleziona ${t.nome}`}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <InterruttoreStato t={t} isAdmin={isAdmin} onToggleAttivo={onToggleAttivo} />
                </TableCell>
                {/* Nome: riga 1 = codice + nome (una riga, troncato); riga 2 =
                    tipo, squadra, vertical e descrizione. Il tipo era una
                    colonna da 130px: qui dice lo stesso senza rubare spazio. */}
                <TableCell>
                  <NomeVoce t={t} squadraName={squadraName} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {unitaDellaVoce(t)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                  {pv ? formatCurrency(pv) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {isAdmin && (
                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    {pc ? formatCurrency(pc) : <span className="text-muted-foreground">—</span>}
                    <span className="block text-[10px] text-muted-foreground">{modalitaCostoVoce(t, pc)}</span>
                  </TableCell>
                )}
                {isAdmin && (
                  <TableCell className="whitespace-nowrap text-right">
                    {hasBoth ? (
                      <MargineConSemaforo margine={margine} sem={sem} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <AzioniVoce t={t} isAdmin={isAdmin} {...azioni} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type StatoFilter = "all" | "attive" | "archiviate" | "standard";
type VerticalFilter = FiltroAreaTariffe;
/** Filtro per redditività (solo admin): tutte / sotto la soglia minima / in perdita. */
type MargineFilter = "all" | "sotto-soglia" | "perdita";

export default function SettingsTariffe() {
  const { effectiveCompany, role } = useAuth();
  const { vertical: currentVertical } = useVertical();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsPricing;
  const canView = isAdmin || permissions.canViewSettingsPricing;
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  // «Margine minimo delle commesse» di Approvazioni (#40) — guida il semaforo della tabella e il filtro redditività.
  // Il dialogo della voce e la riga dei numeri usano ancora 15/25 fissi (decisione aperta: una soglia sola).
  // Fallback sicuro ai default anche se la tabella non è ancora applicata.
  const { data: governance } = useGovernanceThresholds(companyId);
  const soglia = governance?.marginalita?.sogliaMinimaPerc ?? 15;

  const [activeGroup, setActiveGroup] = useState<TipoDef["group"] | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tariffa | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [standardOpen, setStandardOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRegionaleOpen, setImportRegionaleOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<VerticalFilter>("all");
  const [statoFilter, setStatoFilter] = useState<StatoFilter>("attive");
  /** Filtro listino: "tutte" | "generico" | id squadra. */
  const [squadraFilter, setSquadraFilter] = useState<string>("tutte");
  const [margineFilter, setMargineFilter] = useState<MargineFilter>("all");
  const [lavorazioneFilter, setLavorazioneFilter] = useState<GruppoLavorazione | "all">("all");
  const [usageTariffa, setUsageTariffa] = useState<Tariffa | null>(null);
  const [analisiTariffa, setAnalisiTariffa] = useState<Tariffa | null>(null);
  // Selezione multipla per azioni in blocco
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [priceAdjustOpen, setPriceAdjustOpen] = useState(false);
  const daTelefono = useIsMobile();

  // Una sola fila di schede (Manodopera e servizi | Impianti | Interventi | Prezzi di manutenzione), sincronizzata su ?tab.
  // La pagina "Listino Manutenzione" è stata accorpata qui: ?tab=manutenzione (l'indirizzo di prima) apre gli impianti.
  const [urlParams, setUrlParams] = useSearchParams();
  const scheda = schedaDaParametro(urlParams.get("tab"));
  const setScheda = (v: string) => {
    const nuova = schedaDaParametro(v);
    const next = new URLSearchParams(urlParams);
    const parametro = parametroDaScheda(nuova);
    if (parametro) next.set("tab", parametro);
    else next.delete("tab");
    setUrlParams(next, { replace: true });
  };

  // `= EMPTY_TARIFFE` e non `= []`: un array nuovo a ogni render faceva ripartire a vuoto la selezione (l'effect qui sotto)
  // di continuo finché il listino si caricava: la pagina girava a vuoto, e in prova non finiva mai di disegnarsi.
  const { data: tariffe = EMPTY_TARIFFE, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tariffe-aziendali-full", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      return loadCatalogPages<Tariffa>(async (from, to) => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, company_id, nome, descrizione, tipo, unita, unita_fatturazione, prezzo_vendita, prezzo_costo, costo_interno, costo_default, vertical_associato, piano_base, prezzo_piano_aggiuntivo, attivo, external_team_id, codice, fonte, incidenza_manodopera_pct, custom_field_values")
        .eq("company_id", companyId)
        .order("nome").order("id").range(from, to);
        return { data: data as unknown as Tariffa[], error };
      });
    },
  });

  // Squadre/subappaltatori: servono per il filtro, il badge in tabella e il
  // select nel form ("ogni squadra col suo listino").
  const { data: squadre = [] } = useQuery({
    queryKey: ["external-teams-tariffe", companyId],
    enabled: !!companyId,
    staleTime: 300_000,
    queryFn: async (): Promise<Array<{ id: string; name: string | null }>> => {
      const { data } = await supabase
        .from("external_teams")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      return data ?? [];
    },
  });
  const squadraName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const sq of squadre) m[sq.id] = sq.name ?? "Squadra";
    return m;
  }, [squadre]);

  const { data: dipendenti = [], isError: erroreDipendenti } = useQuery({
    queryKey: ["dipendenti-costo-lavorazione", companyId],
    enabled: !!companyId && dialogOpen && isAdmin && permissions.canViewEmployees && permissions.canViewCosts,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id, first_name, last_name, costo_orario").eq("company_id", companyId!).eq("is_active", true).order("last_name");
      if (error) throw error;
      return (data ?? []) as DipendenteCostoLavorazione[];
    },
  });

  // #50 — Guardia anti-eliminazione: quando si apre la conferma di delete per
  // UNA voce, conta i riferimenti per avvisare l'admin (consigliando
  // l'archiviazione). Riusa la stessa queryKey del dialog "Dove è usata", così
  // se l'utente ha appena aperto "Dove è usata" il conteggio è già in cache.
  const deleteTariffa = useMemo(
    () => (deleteId ? tariffe.find((t) => t.id === deleteId) ?? null : null),
    [deleteId, tariffe],
  );
  const { data: deleteUsage, isLoading: deleteUsageLoading } = useQuery({
    queryKey: ["tariffa-usage", deleteId],
    enabled: !!deleteId,
    staleTime: 30_000,
    queryFn: () => countTariffaUsage(deleteId as string),
  });
  const deleteUsageTotal = useMemo(
    () => (deleteUsage ? totalTariffaUsage(deleteUsage) : 0),
    [deleteUsage],
  );

  // #51 — Guardia per l'eliminazione in blocco: conteggio aggregato dei
  // riferimenti verso le voci selezionate (chiave stabile = id ordinati).
  const selectedIdsKey = useMemo(() => [...selectedIds].sort().join(","), [selectedIds]);
  const { data: bulkUsageTotal = 0, isLoading: bulkUsageLoading } = useQuery({
    queryKey: ["tariffa-usage-bulk", selectedIdsKey],
    enabled: bulkDeleteOpen && selectedIds.size > 0,
    staleTime: 30_000,
    queryFn: () => countTariffaUsageBulk([...selectedIds]),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("tariffe_aziendali")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAllTariffe(queryClient);
      toast.success("Voce eliminata");
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      toast.error(testoErrore(err, "Voce non eliminata."));
    },
  });

  const toggleAttivoMutation = useMutation({
    mutationFn: async (t: Tariffa) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const next = !(t.attivo !== false);
      const { error } = await supabase
        .from("tariffe_aziendali")
        .update({ attivo: next, attiva: next } as never)
        .eq("id", t.id)
        .eq("company_id", companyId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      invalidateAllTariffe(queryClient);
      toast.success(next ? "Voce riattivata" : "Voce archiviata");
    },
    onError: (err: unknown) => {
      toast.error(testoErrore(err, "Stato della voce non cambiato."));
    },
  });

  const duplicaMutation = useMutation({
    mutationFn: async (t: Tariffa) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const payload: Record<string, unknown> = {
        company_id: companyId,
        nome: `${t.nome} (copia)`,
        descrizione: t.descrizione ?? null,
        tipo: t.tipo,
        // Unità come costi: la copia nasce con le due colonne coerenti.
        unita: legacyUnitaFrom(unitaTariffa(t) as UnitaFatturazione),
        unita_fatturazione: unitaTariffa(t),
        vertical_associato: t.vertical_associato ?? null,
        prezzo_vendita: t.prezzo_vendita ?? null,
        // Lo stesso costo nelle tre colonne: la copia nasce coerente anche
        // quando l'originale le aveva disallineate (05/10/2026).
        costo_interno: costoTariffa(t) ?? 0,
        costo_default: costoTariffa(t) ?? 0,
        prezzo_costo: costoTariffa(t) ?? 0,
        piano_base: t.piano_base ?? null,
        prezzo_piano_aggiuntivo: t.prezzo_piano_aggiuntivo ?? null,
        attivo: t.attivo !== false,
        attiva: t.attivo !== false,
        external_team_id: t.external_team_id ?? null,
        fonte: t.fonte ?? null,
        incidenza_manodopera_pct: t.incidenza_manodopera_pct ?? null,
        custom_field_values: t.custom_field_values ?? {},
      };
      const { error } = await supabase.from("tariffe_aziendali").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAllTariffe(queryClient);
      toast.success("Voce duplicata");
    },
    onError: (err: unknown) => {
      toast.error(testoErrore(err, "Voce non duplicata."));
    },
  });

  // ─── Azioni in blocco ─────────────────────────────────────────────────────
  const bulkSetAttivoMutation = useMutation({
    mutationFn: async ({ ids, attivo }: { ids: string[]; attivo: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (ids.length === 0) return { count: 0, attivo };
      const { error } = await supabase
        .from("tariffe_aziendali")
        .update({ attivo, attiva: attivo } as never)
        .in("id", ids)
        .eq("company_id", companyId);
      if (error) throw error;
      return { count: ids.length, attivo };
    },
    onSuccess: ({ count, attivo }) => {
      invalidateAllTariffe(queryClient);
      setSelectedIds(new Set());
      toast.success(
        attivo
          ? `${count} ${count === 1 ? "voce riattivata" : "voci riattivate"}`
          : `${count} ${count === 1 ? "voce archiviata" : "voci archiviate"}`,
      );
    },
    onError: (err: unknown) => {
      toast.error(testoErrore(err, "Stato delle voci non cambiato."));
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (ids.length === 0) return 0;
      const { error } = await supabase
        .from("tariffe_aziendali")
        .delete()
        .in("id", ids)
        .eq("company_id", companyId);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      invalidateAllTariffe(queryClient);
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      toast.success(`${count} ${count === 1 ? "voce eliminata" : "voci eliminate"}`);
    },
    onError: (err: unknown) => {
      toast.error(testoErrore(err, "Voci non eliminate."));
    },
  });

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (t: Tariffa) => { setEditing(t); setDialogOpen(true); };

  // Filtri combinati
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tariffe.filter((t) => {
      // stato
      if (statoFilter === "attive" && t.attivo === false) return false;
      if (statoFilter === "archiviate" && (t.attivo !== false || lavorazioneStandardDaCompletare(t))) return false;
      if (statoFilter === "standard" && !lavorazioneStandardDaCompletare(t)) return false;
      // listino per squadra
      if (squadraFilter === "generico" && t.external_team_id) return false;
      if (squadraFilter !== "tutte" && squadraFilter !== "generico" && t.external_team_id !== squadraFilter) return false;
      // vertical
      if (!tariffaNellArea(t.vertical_associato, verticalFilter, currentVertical)) return false;
      if (lavorazioneFilter !== "all" && gruppoLavorazione(t) !== lavorazioneFilter) return false;
      // search — nome, descrizione, tipo, unità di fatturazione e vertical
      if (q) {
        const haystack = `${t.nome} ${t.descrizione ?? ""} ${tipoLabel(t.tipo)} ${unitaTariffa(t, "")} ${unitaDellaVoce(t)} ${t.vertical_associato ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // margine (redditività) — solo per voci con margine calcolabile
      if (margineFilter !== "all") {
        const pv = t.prezzo_vendita ?? 0;
        const pc = costoTariffa(t) ?? 0;
        const hasBoth = pv > 0 && pc > 0;
        if (!hasBoth) return false;
        const m = calcMargine(pv, pc);
        if (margineFilter === "perdita" && !(m < 0)) return false;
        if (margineFilter === "sotto-soglia" && !(m < soglia)) return false;
      }
      return true;
    });
  }, [tariffe, statoFilter, squadraFilter, verticalFilter, currentVertical, search, margineFilter, soglia, lavorazioneFilter]);

  // Raggruppamento per group (per i tab)
  const byGroup = useMemo(() => {
    const m: Record<string, Tariffa[]> = {};
    for (const t of filtered) {
      const def = TIPO_DEFS.find((x) => x.value === t.tipo);
      const g = def?.group ?? "altro";
      m[g] ??= [];
      m[g].push(t);
    }
    return m;
  }, [filtered]);

  const tariffeForActiveGroup = useMemo(
    () => (activeGroup === "all" ? filtered : byGroup[activeGroup] ?? EMPTY_TARIFFE),
    [activeGroup, filtered, byGroup],
  );

  // La selezione si azzera ogni volta che cambia l'insieme visibile (filtri,
  // ricerca, tab) o quando i dati si ricaricano dopo una mutazione: così non
  // restano mai selezionati id non più visibili.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [tariffeForActiveGroup]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[], checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Conteggio per stato delle voci selezionate → mostriamo "Archivia"/"Riattiva"
  // solo quando hanno effetto reale sulla selezione.
  const selectedItems = useMemo(
    () => tariffeForActiveGroup.filter((t) => selectedIds.has(t.id)),
    [tariffeForActiveGroup, selectedIds],
  );
  const selectedAttiveCount = selectedItems.filter((t) => t.attivo !== false).length;
  const selectedArchiviateCount = selectedItems.length - selectedAttiveCount;
  const bulkBusy = bulkSetAttivoMutation.isPending || bulkDeleteMutation.isPending;

  // Filtri attivi → mostra conteggio + "Azzera filtri" e gestisci lo stato "nessun risultato".
  const hasActiveFilters =
    search.trim() !== "" ||
    statoFilter !== "attive" ||
    verticalFilter !== "all" ||
    lavorazioneFilter !== "all" || squadraFilter !== "tutte" ||
    margineFilter !== "all" ||
    activeGroup !== "all";

  const resetFilters = () => {
    setSearch("");
    setStatoFilter("attive");
    setVerticalFilter("all");
    setMargineFilter("all");
    setActiveGroup("all");
    setLavorazioneFilter("all");
    setSquadraFilter("tutte");
  };

  // #48 — Filtri attivi come "chip" rimovibili singolarmente. Lo stato "attive"
  // è il default e non conta come filtro; activeGroup è già evidente dai tab
  // gruppo, quindi non viene mostrato come chip.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const q = search.trim();
    if (lavorazioneFilter !== "all") chips.push({ key: "lavorazione", label: `Lavorazioni: ${GRUPPI_LAVORAZIONE.find(g => g.id === lavorazioneFilter)?.nome}`, onRemove: () => setLavorazioneFilter("all") });
    if (q) chips.push({ key: "search", label: `Cerca: "${q}"`, onRemove: () => setSearch("") });
    if (statoFilter !== "attive")
      chips.push({
        key: "stato",
        label: statoFilter === "standard" ? "Stato: basi da completare" : statoFilter === "archiviate" ? "Stato: archiviate" : "Stato: tutte",
        onRemove: () => setStatoFilter("attive"),
      });
    if (verticalFilter !== "all")
      chips.push({
        key: "vertical",
        label:
          verticalFilter === "current"
            ? `Area: ${nomeArea(areaDiVerticale(currentVertical) ?? "generale")}`
            : verticalFilter === "global" ? "Area: comuni / non assegnate" : `Area: ${nomeArea(verticalFilter.slice(5))}`,
        onRemove: () => setVerticalFilter("all"),
      });
    if (margineFilter !== "all")
      chips.push({
        key: "margine",
        label: margineFilter === "perdita" ? "Redditività: in perdita" : "Redditività: sotto soglia",
        onRemove: () => setMargineFilter("all"),
      });
    return chips;
  }, [search, statoFilter, verticalFilter, margineFilter, currentVertical, lavorazioneFilter]);

  // Esporta in CSV ciò che è attualmente filtrato (round-trip con l'import).
  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("Nessuna voce da esportare con i filtri attuali");
      return;
    }
    // Costo e unità esportati sono quelli che la pagina mostra (costoTariffa,
    // unitaTariffa), non le colonne grezze: per molte voci costo_interno è lo
    // 0 di default e unita_fatturazione il «pz» di default (05/10/2026).
    const csv = buildTariffeExportCsv(
      filtered.map((t) => ({ ...t, costo_interno: costoTariffa(t) ?? undefined, unita_fatturazione: unitaTariffa(t, "") || undefined })),
      { includeCosto: isAdmin },
    );
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `manodopera-servizi-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Esportate ${filtered.length} voci in CSV`);
  };

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      {/* Una sola testata: il titolo «Listino» e le sue schede le mette già il layout. Qui una fila sola di schede
          (la manodopera e, accanto, le tre parti di Manutenzione) e, a destra, i pulsanti della manodopera. */}
      <Tabs value={scheda} onValueChange={setScheda}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList
            aria-label="Manodopera e servizi, impianti, interventi e prezzi di manutenzione"
            className="h-auto w-full justify-start gap-1 overflow-x-auto sm:w-auto"
          >
            <TabsTrigger value="manodopera" className="shrink-0">Manodopera e servizi</TabsTrigger>
            <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
            <TabsTrigger value="impianti" className="shrink-0">Impianti</TabsTrigger>
            <TabsTrigger value="interventi" className="shrink-0">Interventi</TabsTrigger>
            <TabsTrigger value="prezzi" className="shrink-0">Prezzi di manutenzione</TabsTrigger>
          </TabsList>
          {scheda === "manodopera" && (
            <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto [&>*]:max-sm:flex-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 dark:border-orange-900/50 dark:hover:bg-orange-950/40"
                  >
                    <Layers3 className="h-4 w-4 mr-1.5" aria-hidden />
                    {isAdmin ? "Importa / Esporta" : "Esporta"}
                    <ChevronDown className="h-4 w-4 ml-1 opacity-60" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {/* Aggiungere voci è modificare il listino: chi lo vede e basta esporta soltanto. */}
                  {isAdmin && (
                    <>
                      <DropdownMenuLabel>Aggiungi in blocco</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setStandardOpen(true)} className="gap-2 cursor-pointer">
                        <Zap className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex flex-col">
                          <span>Catalogo standard</span>
                          <span className="text-xs text-muted-foreground">Voci tipiche del tuo settore</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setImportOpen(true)} className="gap-2 cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex flex-col">
                          <span>Importa prezziario</span>
                          <span className="text-xs text-muted-foreground">Carica un CSV o Excel</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setImportRegionaleOpen(true)} className="gap-2 cursor-pointer">
                        <Library className="h-4 w-4 text-orange-500 shrink-0" />
                        <div className="flex flex-col">
                          <span>Importa da prezzario regionale</span>
                          <span className="text-xs text-muted-foreground">Voci dai prezzari ufficiali regionali</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel>Esporta</DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={exportCsv}
                    disabled={tariffe.length === 0}
                    className="gap-2 cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-orange-500 shrink-0" />
                    <div className="flex flex-col">
                      <span>Esporta in CSV</span>
                      <span className="text-xs text-muted-foreground">Scarica il listino filtrato</span>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={openNew}
                  className="bg-gradient-to-br from-orange-500 to-eic-amber hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
                >
                  <Plus className="h-4 w-4 mr-1.5" aria-hidden />Nuova voce
                </Button>
              )}
            </div>
          )}
        </div>

        <TabsContent value="manodopera" className="mt-4 space-y-4">
      <h2 className="sr-only">Manodopera e servizi</h2>

      {!isAdmin && (
        <Alert>
          <AlertDescription>
            Stai consultando il listino: le voci le modifica chi ha il permesso «Listino &amp; Prezzi» in modifica.
          </AlertDescription>
        </Alert>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <h2 className="mb-1 font-medium leading-none tracking-tight">Manodopera e servizi non caricati</h2>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{testoErrore(error, "Non riesco a leggere le voci.")}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* I numeri e l'avviso delle basi da completare, in una riga sola. */}
      <RigaNumeri
        tariffe={tariffe}
        isAdmin={isAdmin}
        soglia={soglia}
        onShowSottoSoglia={() => {
          setMargineFilter("sotto-soglia");
          setActiveGroup("all");
        }}
        onCompletaBasi={() => {
          setStatoFilter("standard"); setActiveGroup("all"); setSearch("");
          setVerticalFilter("all"); setSquadraFilter("tutte"); setMargineFilter("all"); setLavorazioneFilter("all");
        }}
      />

      {/* Filter bar — senza Card: bordo e padding non aggiungevano niente,
          solo ~40px in più prima della tabella. Una riga sola su desktop.
          L'area di lavoro si sceglie qui, una volta sola (prima c'era anche una griglia di 13 pulsanti
          che cambiava lo stesso filtro). */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca per nome, tipo, unità o area…"
              aria-label="Cerca tra le voci"
              className="h-9 pl-9 max-md:h-11"
            />
          </div>
          <FiltriRipiegabili
            daTelefono={daTelefono}
            attivi={[statoFilter !== "attive", verticalFilter !== "all", lavorazioneFilter !== "all", squadraFilter !== "tutte", margineFilter !== "all"].filter(Boolean).length}
          >
          <Select value={statoFilter} onValueChange={(v) => setStatoFilter(v as StatoFilter)}>
            <SelectTrigger aria-label="Filtra per stato della voce" className="h-9 w-full md:w-[180px] max-md:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="attive">Solo attive</SelectItem>
              <SelectItem value="standard">Basi da completare</SelectItem>
              <SelectItem value="archiviate">Solo archiviate</SelectItem>
              <SelectItem value="all">Tutte</SelectItem>
            </SelectContent>
          </Select>
          <Select value={verticalFilter} onValueChange={(v) => setVerticalFilter(v as VerticalFilter)}>
            <SelectTrigger aria-label="Filtra per area di lavoro" className="h-9 w-full md:w-[220px] max-md:h-11">
              <SelectValue placeholder="Filtra per area" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le aree</SelectItem>
              <SelectItem value="global">Comuni / non assegnate</SelectItem>
              {areePerTariffe(tariffe).map((area) => (
                <SelectItem key={area.chiave} value={`area:${area.chiave}`}>{area.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <select aria-label="Filtra per gruppo di lavorazioni" value={lavorazioneFilter} onChange={e => { setLavorazioneFilter(e.target.value as GruppoLavorazione | "all"); setActiveGroup("all"); }} className="h-9 w-full rounded-md border bg-background px-3 text-sm md:w-[230px] max-md:h-11">
            <option value="all">Tutte le lavorazioni</option>
            {GRUPPI_LAVORAZIONE.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
          {squadre.length > 0 && (
            <Select value={squadraFilter} onValueChange={setSquadraFilter}>
              <SelectTrigger aria-label="Filtra per listino" className="h-9 w-full md:w-[180px] max-md:h-11">
                <SelectValue placeholder="Listino" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tutte">Tutti i listini</SelectItem>
                <SelectItem value="generico">Listino aziendale (generico)</SelectItem>
                {squadre.map((sq) => (
                  <SelectItem key={sq.id} value={sq.id}>{sq.name ?? "Squadra"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isAdmin && (
            <Select value={margineFilter} onValueChange={(v) => setMargineFilter(v as MargineFilter)}>
              <SelectTrigger aria-label="Filtra per redditività" className="h-9 w-full md:w-[160px] max-md:h-11">
                <SelectValue placeholder="Redditività" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i margini</SelectItem>
                <SelectItem value="sotto-soglia">Sotto soglia (&lt;{soglia}%)</SelectItem>
                <SelectItem value="perdita">In perdita (&lt;0%)</SelectItem>
              </SelectContent>
            </Select>
          )}
          </FiltriRipiegabili>
        </div>
        {(activeFilterChips.length > 0 || (tariffe.length > 0 && hasActiveFilters)) && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {activeFilterChips.map((c) => (
              <Badge
                key={c.key}
                variant="secondary"
                className="gap-1 py-0.5 pl-2 pr-1 font-normal"
              >
                <span className="max-w-[200px] truncate">{c.label}</span>
                <button
                  type="button"
                  onClick={c.onRemove}
                  aria-label={`Rimuovi filtro: ${c.label}`}
                  className="ml-0.5 rounded-sm p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <span className="ml-1">
              <span className="font-medium text-foreground">{tariffeForActiveGroup.length}</span>{" "}
              {tariffeForActiveGroup.length === 1 ? "voce" : "voci"}
              {tariffeForActiveGroup.length !== tariffe.length && ` su ${tariffe.length} totali`}
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={resetFilters}>
              <FilterX className="h-3.5 w-3.5 mr-1" />Azzera filtri
            </Button>
          </div>
        )}
      </div>

      {/* Tabs per gruppo + conteggio. I gruppi a zero voci spariscono (prima
          "Nolo" e "Altro" vuoti facevano andare la barra a capo su due righe
          centrate); "Tutte" resta sempre, e resta anche il gruppo attivo se un
          filtro lo svuota — così il tab selezionato non sparisce sotto i piedi. */}
      <Tabs value={activeGroup} onValueChange={(v) => setActiveGroup(v as typeof activeGroup)}>
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto">
          {GROUP_DEFS.filter((g) => {
            if (g.value === "all" || g.value === activeGroup) return true;
            return (byGroup[g.value]?.length ?? 0) > 0;
          }).map((g) => {
            const count = g.value === "all" ? filtered.length : (byGroup[g.value]?.length ?? 0);
            const Icon = g.icon;
            return (
              <TabsTrigger key={g.value} value={g.value} className="shrink-0 gap-1.5">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {g.label}
                {count > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {count}
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value={activeGroup} className="mt-4">
          {isLoading ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Caricamento…
              </CardContent>
            </Card>
          ) : tariffe.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                  <Layers3 className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h2 className="font-semibold">Nessuna voce ancora</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isAdmin
                      ? "Inizia creando le voci standard del tuo settore o aggiungine una nuova."
                      : "Le voci le aggiunge chi ha il permesso di modificare il listino."}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex justify-center gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => setStandardOpen(true)}>
                      <Zap className="h-4 w-4 mr-2" />Usa il catalogo standard
                    </Button>
                    <Button variant="outline" onClick={() => setImportOpen(true)}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" />Importa prezziario
                    </Button>
                    <Button onClick={openNew}>
                      <Plus className="h-4 w-4 mr-2" />Nuova voce
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : tariffeForActiveGroup.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                  <Search className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h2 className="font-semibold">Nessun risultato</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nessuna voce corrisponde ai filtri o alla ricerca attuali.
                  </p>
                  {verticalFilter.startsWith("area:") && (
                    <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
                      Le voci senza area sono in «Comuni / non assegnate». Puoi aprirle e scegliere l&apos;area di lavoro:
                      il nome della lavorazione, da solo, non la assegna automaticamente.
                    </p>
                  )}
                </div>
                <div className="flex justify-center">
                  <Button variant="outline" onClick={resetFilters}>
                    <FilterX className="h-4 w-4 mr-2" />Azzera filtri
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {selectedIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-900/50 dark:bg-orange-950/30">
                  <span className="text-sm font-medium text-orange-900 dark:text-orange-200">
                    {selectedIds.size} {selectedIds.size === 1 ? "voce selezionata" : "voci selezionate"}
                  </span>
                  <div className="flex-1" />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={bulkBusy}
                    onClick={() => setPriceAdjustOpen(true)}
                  >
                    <Percent className="h-4 w-4 mr-1.5" />
                    Adegua prezzi
                  </Button>
                  {selectedArchiviateCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={() =>
                        bulkSetAttivoMutation.mutate({ ids: selectedItems.filter((t) => t.attivo === false).map((t) => t.id), attivo: true })
                      }
                    >
                      <RotateCcw className="h-4 w-4 mr-1.5" />
                      Riattiva{selectedArchiviateCount !== selectedIds.size ? ` (${selectedArchiviateCount})` : ""}
                    </Button>
                  )}
                  {selectedAttiveCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={() =>
                        bulkSetAttivoMutation.mutate({ ids: selectedItems.filter((t) => t.attivo !== false).map((t) => t.id), attivo: false })
                      }
                    >
                      <Archive className="h-4 w-4 mr-1.5" />
                      Archivia{selectedAttiveCount !== selectedIds.size ? ` (${selectedAttiveCount})` : ""}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    disabled={bulkBusy}
                    onClick={() => setBulkDeleteOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Elimina
                  </Button>
                  <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={clearSelection}>
                    <X className="h-4 w-4 mr-1.5" />
                    Deseleziona
                  </Button>
                </div>
              )}
              <TariffeTable
                squadraName={squadraName}
                items={tariffeForActiveGroup}
                isAdmin={isAdmin}
                soglia={soglia}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onEdit={openEdit}
                onDelete={setDeleteId}
                onToggleAttivo={(t) => toggleAttivoMutation.mutate(t)}
                onDuplica={(t) => duplicaMutation.mutate(t)}
                onShowUsage={setUsageTariffa}
                onAnalisi={setAnalisiTariffa}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Come si legge il margine — m2 (audit): visibile anche al first-run, non solo quando l'utente ha già
          creato voci. Serve a spiegare il margine PRIMA che popoli il listino. */}
      {isAdmin && governance && (
        <NotaMargine soglia={soglia} puoCambiare={permissions.isAdmin || permissions.canViewCosts} />
      )}

        </TabsContent>

        {scheda !== "manodopera" && (
          <TabsContent value={scheda} className="mt-4">
            <ListinoManutenzione scheda={scheda} />
          </TabsContent>
        )}
      </Tabs>

      {/* Dialogs */}
      {dialogOpen && (
        <TariffaDialog
            squadre={squadre}
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          companyId={companyId}
          isAdmin={isAdmin}
          currentVertical={verticalFilter.startsWith("area:") ? (AREE_STANDARD.find(a => a.chiave === verticalFilter.slice(5))?.verticale ?? verticalFilter.slice(5)) : verticalFilter === "global" ? null : currentVertical}
          gruppoIniziale={lavorazioneFilter === "all" ? "posa" : lavorazioneFilter}
          dipendenti={permissions.canViewEmployees && permissions.canViewCosts ? dipendenti : []}
          erroreDipendenti={erroreDipendenti}
          onSaved={() => invalidateAllTariffe(queryClient)}
        />
      )}

      {standardOpen && (
        <StandardTariffeDialog
          open={standardOpen}
          onClose={() => setStandardOpen(false)}
          existing={tariffe}
          companyId={companyId}
          onCreated={() => invalidateAllTariffe(queryClient)}
          vertical={currentVertical ?? "generico"}
        />
      )}

      {importOpen && (
        <ImportPrezziarioDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          existing={tariffe}
          companyId={companyId}
          isAdmin={isAdmin}
          onImported={() => invalidateAllTariffe(queryClient)}
        />
      )}

      {importRegionaleOpen && (
        <ImportaPrezzarioRegionaleDialog
          open={importRegionaleOpen}
          onOpenChange={setImportRegionaleOpen}
          companyId={companyId}
          isAdmin={isAdmin}
          onImported={() => invalidateAllTariffe(queryClient)}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Elimina {deleteTariffa ? `«${deleteTariffa.nome}»` : "voce"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Se preferisci puoi archiviare la voce:
              non sarà più selezionabile nei nuovi preventivi ma potrai riattivarla in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* #50 — Guardia: avvisa se la voce è ancora collegata. */}
          {deleteUsageLoading ? (
            <div className="text-xs text-muted-foreground">Verifica dei collegamenti in corso…</div>
          ) : deleteUsageTotal > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">
                    Questa voce è collegata in {deleteUsageTotal}{" "}
                    {deleteUsageTotal === 1 ? "punto" : "punti"}.
                  </span>{" "}
                  Eliminandola resteranno riferimenti vuoti (preventivi, kit e pacchetti, listini…).
                  Ti consigliamo di <span className="font-medium">archiviarla</span> invece di eliminarla.
                </div>
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            {deleteTariffa && deleteTariffa.attivo !== false && (
              <Button
                variant="outline"
                onClick={() => {
                  toggleAttivoMutation.mutate(deleteTariffa);
                  setDeleteId(null);
                }}
              >
                <Archive className="h-4 w-4 mr-2" />Archivia invece
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {priceAdjustOpen && (
        <BulkPriceAdjustDialog
          open={priceAdjustOpen}
          onClose={() => setPriceAdjustOpen(false)}
          items={selectedItems}
          isAdmin={isAdmin}
          companyId={companyId}
          onApplied={clearSelection}
        />
      )}

      {usageTariffa && (
        <TariffaUsageDialog
          open={!!usageTariffa}
          onClose={() => setUsageTariffa(null)}
          tariffa={usageTariffa}
        />
      )}

      <AnalisiPrezzoDialog
        tariffa={analisiTariffa}
        onClose={() => setAnalisiTariffa(null)}
      />

      <AlertDialog open={bulkDeleteOpen} onOpenChange={(v) => !v && setBulkDeleteOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Elimina {selectedIds.size} {selectedIds.size === 1 ? "voce" : "voci"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile ed elimina definitivamente le voci selezionate.
              Se preferisci puoi archiviarle: non saranno più selezionabili nei nuovi preventivi
              ma potrai riattivarle in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* #51 — Guardia: avvisa se le voci selezionate sono ancora collegate. */}
          {bulkUsageLoading ? (
            <div className="text-xs text-muted-foreground">Verifica dei collegamenti in corso…</div>
          ) : bulkUsageTotal > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <span className="font-medium">
                    Le voci selezionate sono collegate complessivamente in {bulkUsageTotal}{" "}
                    {bulkUsageTotal === 1 ? "punto" : "punti"}.
                  </span>{" "}
                  Eliminarle lascerà riferimenti vuoti (preventivi, kit e pacchetti, listini…).
                  Ti consigliamo di <span className="font-medium">archiviarle</span> invece di eliminarle.
                </div>
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            {selectedAttiveCount > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  bulkSetAttivoMutation.mutate({
                    ids: selectedItems.filter((t) => t.attivo !== false).map((t) => t.id),
                    attivo: false,
                  });
                  setBulkDeleteOpen(false);
                }}
              >
                <Archive className="h-4 w-4 mr-2" />Archivia invece
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

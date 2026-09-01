import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useVertical, type Vertical } from "@/hooks/useVertical";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { invalidateAllTariffe } from "@/lib/tariffeQueryKeys";
import {
  Plus, Pencil, Trash2, Zap, Search, Copy, MoreVertical, Calculator,
  TrendingUp, Percent, Package, Activity, Archive, RotateCcw, Info,
  Building2, Layers3, Wallet, CheckCircle2, Wrench, Paintbrush, AlertTriangle,
  FileSpreadsheet, ChevronDown, Download, FilterX, X, ClipboardList, Link2,
  Library,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import ListinoManutenzione from "@/pages/azienda/settings/ListinoManutenzione";


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

/** Mappa unita_fatturazione → colonna legacy `unita` (CHECK: pz/mq/ml/mc/h/piano/km/fisso). */
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
 * Definizione dei preset cataloghi. Ogni preset raggruppa tariffe coerenti
 * con un mestiere/profilo aziendale tipico. L'admin può importare uno o più
 * preset (con un click) oppure pickare le singole voci manualmente.
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
 * Semaforo margine ancorato alla soglia minima di governance (#40), così la
 * pagina riflette la policy aziendale invece di una soglia fissa. Restituisce
 * le classi per il pallino e per il testo, più una label accessibile.
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
  tariffaId, costoDefault,
}: { tariffaId: string; costoDefault: number | null }) {
  const { data: perms } = useUserPermissions();
  if (!perms?.can_view_costs) return null;
  return <TariffaVariantiEditor tariffaId={tariffaId} costoDefault={costoDefault} />;
}

// ─── KPI Header ───────────────────────────────────────────────────────────────
function KpiHeader({
  tariffe, isAdmin, soglia, onShowSottoSoglia,
}: { tariffe: Tariffa[]; isAdmin: boolean; soglia: number; onShowSottoSoglia?: () => void }) {
  const kpi = useMemo(() => {
    const totali = tariffe.length;
    const attive = tariffe.filter((t) => t.attivo !== false).length;
    const archiviate = totali - attive;
    // Margine medio pesato per prezzo_vendita (solo tariffe con entrambi i valori)
    let sumMarg = 0;
    let countMarg = 0;
    let sottoSoglia = 0; // #49 — voci con margine calcolabile sotto la soglia governance
    for (const t of tariffe) {
      const pv = t.prezzo_vendita ?? 0;
      const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
      if (pv > 0 && pc > 0) {
        const m = calcMargine(pv, pc);
        sumMarg += m;
        countMarg += 1;
        if (m < soglia) sottoSoglia += 1;
      }
    }
    const margineMedio = countMarg > 0 ? sumMarg / countMarg : 0;
    // Top tipo
    const byTipo = new Map<string, number>();
    for (const t of tariffe) byTipo.set(t.tipo, (byTipo.get(t.tipo) ?? 0) + 1);
    const topTipo = [...byTipo.entries()].sort((a, b) => b[1] - a[1])[0];
    return { totali, attive, archiviate, margineMedio, countMarg, sottoSoglia, topTipo };
  }, [tariffe, soglia]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Voci totali
              </div>
              <div className="mt-1 text-2xl font-bold">{kpi.totali}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {kpi.attive} attive · {kpi.archiviate} archiviate
              </div>
            </div>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Layers3 className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Attive
              </div>
              <div className="mt-1 text-2xl font-bold">{kpi.attive}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {kpi.totali > 0 ? `${((kpi.attive / kpi.totali) * 100).toFixed(0)}% del totale` : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
      {isAdmin && (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Margine medio
                </div>
                <div className={`mt-1 text-2xl font-bold ${kpi.countMarg > 0 ? margineColor(kpi.margineMedio) : "text-muted-foreground"}`}>
                  {kpi.countMarg > 0 ? `${kpi.margineMedio.toFixed(1)}%` : "—"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  su {kpi.countMarg} voci con costi
                </div>
                {kpi.sottoSoglia > 0 && (
                  <button
                    type="button"
                    onClick={onShowSottoSoglia}
                    title={`Filtra le voci con margine sotto la soglia minima del ${soglia}%`}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/70"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {kpi.sottoSoglia} sotto soglia ({soglia}%)
                  </button>
                )}
              </div>
              <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
                <Percent className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tipo più usato
              </div>
              <div className="mt-1 text-2xl font-bold">
                {kpi.topTipo ? tipoLabel(kpi.topTipo[0]) : "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {kpi.topTipo ? `${kpi.topTipo[1]} voci` : "Nessuna voce ancora"}
              </div>
            </div>
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tariffa Dialog ───────────────────────────────────────────────────────────
function TariffaDialog({
  open, onClose, editing, companyId, isAdmin, currentVertical, onSaved, squadre = [],
}: {
  open: boolean; onClose: () => void; editing: Tariffa | null;
  companyId: string; isAdmin: boolean;
  currentVertical: string | null;
  onSaved: () => void;
  /** Squadre/subappaltatori per "di chi e' questo listino". */
  squadre?: Array<{ id: string; name: string | null }>;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [codice, setCodice] = useState(editing?.codice ?? "");
  const [descrizione, setDescrizione] = useState(editing?.descrizione ?? "");
  const [tipo, setTipo] = useState<TipoTariffa>(editing?.tipo ?? "posa");
  // FASE 6: unita_fatturazione è la nuova UM canonica (fissa alla creazione)
  const [unitaFatturazione, setUnitaFatturazione] = useState<UnitaFatturazione>(
    editing?.unita_fatturazione ?? UM_DEFAULT_BY_TIPO[editing?.tipo ?? "posa"] ?? "pz",
  );
  const [prezzoVendita, setPrezzoVendita] = useState(String(editing?.prezzo_vendita ?? ""));
  const [costoInterno, setCostoInterno] = useState(
    String(editing?.costo_interno ?? editing?.prezzo_costo ?? ""),
  );
  const [verticalAssociato, setVerticalAssociato] = useState<string>(
    editing?.vertical_associato ?? (currentVertical ?? ""),
  );
  const [pianoBase, setPianoBase] = useState(String(editing?.piano_base ?? "1"));
  const [prezzoPianoAgg, setPrezzoPianoAgg] = useState(String(editing?.prezzo_piano_aggiuntivo ?? ""));
  const [fonte, setFonte] = useState(editing?.fonte ?? "");
  const [incidenzaMdoPct, setIncidenzaMdoPct] = useState(
    editing?.incidenza_manodopera_pct != null
      ? String(Math.round(editing.incidenza_manodopera_pct * 100))
      : "",
  );
  const [attivo, setAttivo] = useState<boolean>(editing?.attivo !== false);
  /** "" = listino aziendale generico; altrimenti id squadra. */
  const [externalTeamId, setExternalTeamId] = useState<string>(editing?.external_team_id ?? "");
  const [saving, setSaving] = useState(false);

  // Semaforo margine live
  const pvNum = parseFloat(prezzoVendita) || 0;
  const ciNum = parseFloat(costoInterno) || 0;
  const marginePerc = pvNum > 0 ? ((pvNum - ciNum) / pvNum) * 100 : 0;
  const guadagnoUnit = pvNum - ciNum;

  // Validazioni soft (non bloccanti — warning in UI)
  const warnings: string[] = [];
  if (isAdmin && pvNum > 0 && ciNum > 0 && ciNum >= pvNum) warnings.push("Il costo è ≥ del prezzo di vendita: margine negativo.");
  if (pvNum === 0 && editing) warnings.push("Prezzo di vendita a zero — la tariffa non genererà importo in preventivo.");

  // Validazioni HARD — bloccano il submit
  // M1 (audit): evitare di persistere margini negativi o tariffe nuove senza prezzo.
  //   - Per tariffe esistenti lasciamo passare prezzo=0 (archive di fatto)
  //   - Per nuove tariffe forziamo prezzo>0 (non ha senso creare una tariffa a zero)
  //   - Per admin, margine negativo blocca (uso il `>=` perché = non ha senso commerciale)
  const blockReason: string | null = (() => {
    if (isAdmin && pvNum > 0 && ciNum > 0 && ciNum >= pvNum) {
      return "Il costo è ≥ del prezzo di vendita. Correggi prima di salvare.";
    }
    if (!editing && pvNum <= 0) {
      return "Il prezzo di vendita deve essere maggiore di 0 per una nuova tariffa.";
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
        const parsed = Number.parseFloat(trimmed);
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

      const prezzoVenditaValue = parseNonNegative(prezzoVendita, "Prezzo vendita");
      const costoInternoValue = parseNonNegative(costoInterno, "Costo interno") ?? 0;
      const prezzoPianoAggValue = parseNonNegative(prezzoPianoAgg, "Prezzo piano aggiuntivo");
      const pianoBaseValue = parseNonNegativeInt(pianoBase, "Piano base", 1);

      // Incidenza manodopera: input in % (0..100) → frazione 0..1 in DB. null se vuoto/non valido.
      const incidenzaMdo = (() => {
        const n = Number(incidenzaMdoPct.replace(",", "."));
        return Number.isFinite(n) && n > 0 ? Math.min(1, n / 100) : null;
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
        // Listino per squadra: "" = generico (NULL)
        external_team_id: externalTeamId || null,
        piano_base: tipo === "tiro_piano" ? pianoBaseValue : null,
        prezzo_piano_aggiuntivo: tipo === "tiro_piano" ? prezzoPianoAggValue : null,
      };
      // costo_interno only visible/writable by admins
      if (isAdmin) {
        payload.costo_interno = costoInternoValue;
        // Manteniamo il legacy prezzo_costo allineato finché esiste la colonna
        payload.prezzo_costo = costoInternoValue;
      }

      const tbl = supabase.from("tariffe_aziendali");
      if (editing) {
        const { error } = await tbl
          .update(payload as never)
          .eq("id", editing.id)
          .eq("company_id", companyId);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload as never);
        if (error) throw error;
      }
      toast.success(editing ? "Voce aggiornata" : "Voce creata");
      onSaved(); onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore salvataggio");
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
              : "Compila i campi per creare una nuova voce di manodopera, posa o servizio."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Anagrafica */}
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <div>
                <Label>Nome *</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Es. Posa finestra media (100×120)"
                />
              </div>
              <div>
                <Label>Codice</Label>
                <Input
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                  placeholder="Es. LOM241.1C.00.010"
                  className="font-mono"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Codice articolo/voce. Opzionale.
                </p>
              </div>
            </div>
            <div>
              <Label>Descrizione</Label>
              <Input
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Dettagli visibili ai colleghi (es. include smontaggio)"
              />
            </div>
          </div>

          {/* Tipo + Unità */}
          <div className="grid gap-3 sm:grid-cols-2 items-start">
            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => {
                setTipo(v as TipoTariffa);
                // Suggerisci UM di default per il tipo, ma solo se stiamo creando
                if (!editing) {
                  setUnitaFatturazione(UM_DEFAULT_BY_TIPO[v] ?? "pz");
                }
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPO_DEFS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                <Info className="inline h-3 w-3 mr-1" />{tipoHint(tipo)}
              </p>
            </div>

            <div>
              <Label>
                Unità di fatturazione
                {editing && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (fissa)
                  </span>
                )}
              </Label>
              <Select
                value={unitaFatturazione}
                onValueChange={(v) => setUnitaFatturazione(v as UnitaFatturazione)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          {/* Di chi e' questo listino: aziendale (generico) o di una squadra.
              La voce di una squadra compare nel dialog manodopera SOLO quando
              si sceglie quella squadra. */}
          {squadre.length > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Listino di</Label>
              <Select value={externalTeamId || "generico"} onValueChange={(v) => setExternalTeamId(v === "generico" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Listino aziendale (generico)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="generico">Listino aziendale (generico)</SelectItem>
                  {squadre.map((sq) => (
                    <SelectItem key={sq.id} value={sq.id}>{sq.name ?? "Squadra"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          </div>

          {/* Vertical + Attivo */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Vertical associato</Label>
              <Select
                value={verticalAssociato || "__none__"}
                onValueChange={(v) => setVerticalAssociato(v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Globale (nessun vertical)</SelectItem>
                  <SelectItem value="serramentista">Serramentista</SelectItem>
                  <SelectItem value="generico">Generico</SelectItem>
                  <SelectItem value="edile">Edile</SelectItem>
                  <SelectItem value="impiantistica">Impiantistica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Stato</Label>
                <div className="mt-1.5 flex items-center gap-2 rounded-md border px-3 py-2">
                  <Switch checked={attivo} onCheckedChange={setAttivo} />
                  <span className="text-sm">
                    {attivo ? "Attiva (selezionabile in preventivo)" : "Archiviata"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Prezzi */}
          <div className="grid gap-3 sm:grid-cols-2">
            {isAdmin && (
              <div>
                <Label>Costo interno (€ per {umLabel})</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costoInterno}
                  onChange={(e) => setCostoInterno(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Costo reale (posatore, attrezzatura). Non visibile al cliente.
                </p>
              </div>
            )}
            <div>
              <Label>Prezzo vendita (€ per {umLabel})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={prezzoVendita}
                onChange={(e) => setPrezzoVendita(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Incidenza manodopera + Fonte */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Incidenza manodopera %</Label>
              <Input
                type="number"
                min="0"
                max="100"
                step="1"
                value={incidenzaMdoPct}
                onChange={(e) => setIncidenzaMdoPct(e.target.value)}
                placeholder="Es. 35"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Quota di manodopera sul prezzo (obbligo base d'asta nei lavori pubblici). Opzionale.
              </p>
            </div>
            <div>
              <Label>Fonte</Label>
              <Input
                value={fonte}
                onChange={(e) => setFonte(e.target.value)}
                placeholder="Es. Prezzario Regione Lombardia 2024"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Prezzario di provenienza (se importata).
              </p>
            </div>
          </div>

          {/* Live example + margine */}
          {(pvNum > 0 || (isAdmin && ciNum > 0)) && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calculator className="h-4 w-4" />
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
                          ({marginePerc.toFixed(1)}%)
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
                <Info className="h-4 w-4" />
                Formula "Tiro al piano"
              </div>
              <p className="text-xs text-purple-700">
                <strong>Piano 0 → base:</strong> prezzo vendita base × quantità.
                <br />
                <strong>Piani ≥ {pianoBase || "1"}:</strong> base + (piano − soglia) × prezzo piano aggiuntivo.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Piano base (soglia)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={pianoBase}
                    onChange={(e) => setPianoBase(e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div>
                  <Label>Prezzo piano aggiuntivo €</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={prezzoPianoAgg}
                    onChange={(e) => setPrezzoPianoAgg(e.target.value)}
                    placeholder="0.00"
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
                {warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
              </ul>
            </div>
          )}

          {/* Sprint B — Varianti Costo Manodopera: visibile solo su tariffe esistenti e solo admin */}
          {isAdmin && editing && (
            <TariffaVariantiSection
              tariffaId={editing.id}
              costoDefault={editing.costo_interno ?? editing.prezzo_costo ?? null}
            />
          )}

          {/* Reverse panel: prodotti del listino che usano questa tariffa */}
          {editing && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <span className="text-emerald-700">🔗</span>
                Prodotti collegati a questa tariffa
              </h4>
              <TariffaProdottiCollegati
                tariffaId={editing.id}
                tariffaName={editing.nome}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          {blockReason && (
            <div className="mr-auto text-xs text-rose-600 self-center">
              ⚠ {blockReason}
            </div>
          )}
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving || !!blockReason}>
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
      toast.info("Nessuna tariffa selezionata");
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
          // Allineiamo legacy prezzo_costo al costo_interno
          prezzo_costo: d.costo_interno,
          attivo: true,
        };
      });
      const { error } = await supabase.from("tariffe_aziendali").insert(payload as never);
      if (error) throw error;
      toast.success(`${toCreate.length} voci create`);
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore creazione tariffe");
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
            Scegli un preset adatto al tuo mestiere per importare in blocco, oppure pick le singole voci.
            Le voci già presenti (stesso nome) sono disabilitate.
            {giaPresentiCount > 0 && (
              <span className="ml-1 text-muted-foreground">
                ({giaPresentiCount} di {STANDARD_TARIFFE.length} già presenti)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* ─── PRESET PICKER ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Preset cataloghi
          </div>
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
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Tutte le voci
          </div>
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

// ─── TariffeTable ────────────────────────────────────────────────────────────
function TariffeTable({
  items, isAdmin, soglia, selectedIds, onToggleSelect, onToggleSelectAll,
  onEdit, onDelete, onToggleAttivo, onDuplica, onShowUsage, onAnalisi, squadraName,
}: {
  items: Tariffa[];
  /** id squadra → nome, per il badge "listino di chi". */
  squadraName?: Record<string, string>;
  isAdmin: boolean;
  /** Soglia minima di margine (% governance) per il semaforo. */
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
  // Accessori per il sort
  const accessors = useMemo(() => ({
    tipo: (t: Tariffa) => tipoLabel(t.tipo),
    nome: (t: Tariffa) => t.nome.toLowerCase(),
    unita: (t: Tariffa) => t.unita_fatturazione ?? t.unita ?? "",
    prezzo_vendita: (t: Tariffa) => t.prezzo_vendita ?? 0,
    costo: (t: Tariffa) => t.costo_interno ?? t.prezzo_costo ?? 0,
    margine: (t: Tariffa) => {
      const pv = t.prezzo_vendita ?? 0;
      const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
      return pv > 0 && pc > 0 ? calcMargine(pv, pc) : -Infinity;
    },
    attivo: (t: Tariffa) => (t.attivo !== false ? 1 : 0),
  }), []);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(items, accessors);

  // Selezione: +1 colonna per il checkbox.
  const colCount = (isAdmin ? 8 : 6) + 1;
  const visibleIds = sortedItems.map((t) => t.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIds.some((id) => selectedIds.has(id));
  const headerChecked: boolean | "indeterminate" = allSelected ? true : someSelected ? "indeterminate" : false;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[44px]">
              <Checkbox
                checked={headerChecked}
                onCheckedChange={(v) => onToggleSelectAll(visibleIds, v === true)}
                aria-label="Seleziona tutte le voci visibili"
              />
            </TableHead>
            <SortableTableHead column="attivo" label="Stato" sortConfig={sortConfig} onSort={toggleSort} className="w-[90px]" />
            <SortableTableHead column="tipo" label="Tipo" sortConfig={sortConfig} onSort={toggleSort} className="w-[130px]" />
            <SortableTableHead column="nome" label="Nome" sortConfig={sortConfig} onSort={toggleSort} />
            <SortableTableHead column="unita" label="UM" sortConfig={sortConfig} onSort={toggleSort} className="w-[80px]" />
            <SortableTableHead column="prezzo_vendita" label="Vendita" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[130px]" />
            {isAdmin && <SortableTableHead column="costo" label="Costo" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[130px]" />}
            {isAdmin && <SortableTableHead column="margine" label="Margine" sortConfig={sortConfig} onSort={toggleSort} className="text-right w-[110px]" />}
            <TableHead className="text-right w-[60px]">Azioni</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.length === 0 ? (
            <TableRow>
              <TableCell colSpan={colCount} className="text-center py-10">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Layers3 className="h-8 w-8 opacity-40" />
                  <p className="text-sm">Nessuna tariffa trovata.</p>
                  <p className="text-xs">Prova a cambiare filtro o crea una nuova tariffa.</p>
                </div>
              </TableCell>
            </TableRow>
          ) : sortedItems.map((t) => {
            const pv = t.prezzo_vendita ?? 0;
            const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
            const hasBoth = pv > 0 && pc > 0;
            const margine = calcMargine(pv, pc);
            const sem = margineSemaforo(hasBoth ? margine : null, soglia);
            const isAttivo = t.attivo !== false;
            const isSelected = selectedIds.has(t.id);
            return (
              <TableRow
                key={t.id}
                data-state={isSelected ? "selected" : undefined}
                className={!isAttivo ? "opacity-60" : undefined}
              >
                <TableCell>
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleSelect(t.id)}
                    aria-label={`Seleziona ${t.nome}`}
                  />
                </TableCell>
                <TableCell>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center">
                          <Switch
                            checked={isAttivo}
                            onCheckedChange={() => onToggleAttivo(t)}
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isAttivo ? "Archivia tariffa" : "Riattiva tariffa"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>
                  <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tipoBadgeClass(t.tipo)}`}>
                    {tipoLabel(t.tipo)}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {t.codice && (
                      <Badge variant="outline" className="mr-1.5 h-4 px-1.5 font-mono text-[10px] font-normal align-middle">
                        {t.codice}
                      </Badge>
                    )}
                    {t.nome}
                    {t.external_team_id && (
                      <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] font-normal align-middle">
                        {squadraName?.[t.external_team_id] ?? "Squadra"}
                      </Badge>
                    )}
                    {t.tipo === "tiro_piano" && t.prezzo_piano_aggiuntivo != null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        +{formatCurrency(t.prezzo_piano_aggiuntivo)}/piano oltre il {t.piano_base ?? 1}°
                      </span>
                    )}
                  </div>
                  {t.descrizione && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{t.descrizione}</div>
                  )}
                  {t.vertical_associato && (
                    <div className="mt-0.5">
                      <Badge variant="outline" className="text-[10px] font-normal h-4 px-1.5">
                        {t.vertical_associato}
                      </Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {t.unita_fatturazione ?? t.unita ?? "—"}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {pv ? formatCurrency(pv) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                {isAdmin && (
                  <TableCell className="text-right">
                    {pc ? formatCurrency(pc) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                )}
                {isAdmin && (
                  <TableCell className="text-right">
                    {hasBoth ? (
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <span className={`h-2 w-2 rounded-full shrink-0 ${sem.dot}`} aria-hidden />
                              <span className={`text-sm font-semibold ${sem.text}`}>
                                {margine.toFixed(1)}%
                              </span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>{sem.label}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="h-4 w-4 mr-2" />Modifica
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplica(t)}>
                        <Copy className="h-4 w-4 mr-2" />Duplica
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onShowUsage(t)}>
                        <Link2 className="h-4 w-4 mr-2" />Dove è usata
                      </DropdownMenuItem>
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
                    </DropdownMenuContent>
                  </DropdownMenu>
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
type StatoFilter = "all" | "attive" | "archiviate";
type VerticalFilter = "all" | "current" | "global";
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

  // Soglia minima di margine (governance #40) — guida semaforo e filtro redditività.
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
  const [usageTariffa, setUsageTariffa] = useState<Tariffa | null>(null);
  const [analisiTariffa, setAnalisiTariffa] = useState<Tariffa | null>(null);
  // Selezione multipla per azioni in blocco
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [priceAdjustOpen, setPriceAdjustOpen] = useState(false);

  // Sezione di primo livello (Manodopera e Servizi | Manutenzione), sincronizzata su ?tab.
  // La pagina "Listino Manutenzione" è stata accorpata qui: ?tab=manutenzione apre il modulo.
  const [urlParams, setUrlParams] = useSearchParams();
  const section: "manodopera" | "manutenzione" =
    urlParams.get("tab") === "manutenzione" ? "manutenzione" : "manodopera";
  const setSection = (v: string) => {
    const next = new URLSearchParams(urlParams);
    if (v === "manutenzione") next.set("tab", "manutenzione");
    else next.delete("tab");
    setUrlParams(next, { replace: true });
  };

  const { data: tariffe = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tariffe-aziendali-full", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, company_id, nome, descrizione, tipo, unita, unita_fatturazione, prezzo_vendita, prezzo_costo, costo_interno, vertical_associato, piano_base, prezzo_piano_aggiuntivo, attivo, external_team_id, codice, fonte")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Tariffa[];
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
      toast.success("Tariffa eliminata");
      setDeleteId(null);
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore eliminazione tariffa");
    },
  });

  const toggleAttivoMutation = useMutation({
    mutationFn: async (t: Tariffa) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const next = !(t.attivo !== false);
      const { error } = await supabase
        .from("tariffe_aziendali")
        .update({ attivo: next } as never)
        .eq("id", t.id)
        .eq("company_id", companyId);
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      invalidateAllTariffe(queryClient);
      toast.success(next ? "Tariffa riattivata" : "Tariffa archiviata");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento stato");
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
        unita: t.unita ?? null,
        unita_fatturazione: t.unita_fatturazione ?? null,
        vertical_associato: t.vertical_associato ?? null,
        prezzo_vendita: t.prezzo_vendita ?? null,
        costo_interno: t.costo_interno ?? t.prezzo_costo ?? 0,
        prezzo_costo: t.prezzo_costo ?? t.costo_interno ?? 0,
        piano_base: t.piano_base ?? null,
        prezzo_piano_aggiuntivo: t.prezzo_piano_aggiuntivo ?? null,
        attivo: true,
      };
      const { error } = await supabase.from("tariffe_aziendali").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAllTariffe(queryClient);
      toast.success("Tariffa duplicata");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore duplicazione");
    },
  });

  // ─── Azioni in blocco ─────────────────────────────────────────────────────
  const bulkSetAttivoMutation = useMutation({
    mutationFn: async ({ ids, attivo }: { ids: string[]; attivo: boolean }) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      if (ids.length === 0) return { count: 0, attivo };
      const { error } = await supabase
        .from("tariffe_aziendali")
        .update({ attivo } as never)
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
      toast.error(err instanceof Error ? err.message : "Errore aggiornamento stato");
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
      toast.error(err instanceof Error ? err.message : "Errore eliminazione");
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
      if (statoFilter === "archiviate" && t.attivo !== false) return false;
      // listino per squadra
      if (squadraFilter === "generico" && t.external_team_id) return false;
      if (squadraFilter !== "tutte" && squadraFilter !== "generico" && t.external_team_id !== squadraFilter) return false;
      // vertical
      if (verticalFilter === "current" && t.vertical_associato !== currentVertical) return false;
      if (verticalFilter === "global" && t.vertical_associato) return false;
      // search — nome, descrizione, tipo, unità di fatturazione e vertical
      if (q) {
        const haystack = `${t.nome} ${t.descrizione ?? ""} ${tipoLabel(t.tipo)} ${t.unita_fatturazione ?? t.unita ?? ""} ${t.vertical_associato ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // margine (redditività) — solo per voci con margine calcolabile
      if (margineFilter !== "all") {
        const pv = t.prezzo_vendita ?? 0;
        const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
        const hasBoth = pv > 0 && pc > 0;
        if (!hasBoth) return false;
        const m = calcMargine(pv, pc);
        if (margineFilter === "perdita" && !(m < 0)) return false;
        if (margineFilter === "sotto-soglia" && !(m < soglia)) return false;
      }
      return true;
    });
  }, [tariffe, statoFilter, squadraFilter, verticalFilter, currentVertical, search, margineFilter, soglia]);

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
    margineFilter !== "all" ||
    activeGroup !== "all";

  const resetFilters = () => {
    setSearch("");
    setStatoFilter("attive");
    setVerticalFilter("all");
    setMargineFilter("all");
    setActiveGroup("all");
  };

  // #48 — Filtri attivi come "chip" rimovibili singolarmente. Lo stato "attive"
  // è il default e non conta come filtro; activeGroup è già evidente dai tab
  // gruppo, quindi non viene mostrato come chip.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; onRemove: () => void }[] = [];
    const q = search.trim();
    if (q) chips.push({ key: "search", label: `Cerca: "${q}"`, onRemove: () => setSearch("") });
    if (statoFilter !== "attive")
      chips.push({
        key: "stato",
        label: statoFilter === "archiviate" ? "Stato: archiviate" : "Stato: tutte",
        onRemove: () => setStatoFilter("attive"),
      });
    if (verticalFilter !== "all")
      chips.push({
        key: "vertical",
        label:
          verticalFilter === "current"
            ? `Vertical: ${currentVertical || "corrente"}`
            : "Vertical: globali",
        onRemove: () => setVerticalFilter("all"),
      });
    if (margineFilter !== "all")
      chips.push({
        key: "margine",
        label: margineFilter === "perdita" ? "Redditività: in perdita" : "Redditività: sotto soglia",
        onRemove: () => setMargineFilter("all"),
      });
    return chips;
  }, [search, statoFilter, verticalFilter, margineFilter, currentVertical]);

  // Esporta in CSV ciò che è attualmente filtrato (round-trip con l'import).
  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.info("Nessuna voce da esportare con i filtri attuali");
      return;
    }
    const csv = buildTariffeExportCsv(filtered, { includeCosto: isAdmin });
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
    <div className="space-y-6">
      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="manodopera" className="gap-1.5">
            <Wrench className="h-3.5 w-3.5" />
            Manodopera e Servizi
          </TabsTrigger>
          <TabsTrigger value="manutenzione" className="gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Manutenzione
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manodopera" className="mt-6 space-y-6">
      {/* Header — palette arancione coerente con Listino Prodotti & Template */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shrink-0 shadow-sm">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Manodopera e Servizi</h1>
            <p className="text-sm text-muted-foreground">
              Listino operativo per posa, manodopera, trasporto, pratiche e servizi. Ogni voce ha un prezzo di vendita
              {isAdmin ? " e un costo interno (solo admin)" : ""}. Usate automaticamente nel preventivatore.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 dark:border-orange-900/50 dark:hover:bg-orange-950/40"
              >
                <Layers3 className="h-4 w-4 mr-1.5" />
                Importa / Esporta
                <ChevronDown className="h-4 w-4 ml-1 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
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
          <Button
            size="sm"
            onClick={openNew}
            className="bg-gradient-to-br from-orange-500 to-amber-400 hover:from-orange-600 hover:to-amber-500 text-white shadow-sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />Nuova voce
          </Button>
        </div>
      </div>

      {/* KPI */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Manodopera e servizi non caricati</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error instanceof Error ? error.message : "Errore durante il caricamento delle tariffe."}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <KpiHeader
        tariffe={tariffe}
        isAdmin={isAdmin}
        soglia={soglia}
        onShowSottoSoglia={() => {
          setMargineFilter("sotto-soglia");
          setActiveGroup("all");
        }}
      />

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, tipo, unità o vertical…"
                className="pl-9"
              />
            </div>
            <Select value={statoFilter} onValueChange={(v) => setStatoFilter(v as StatoFilter)}>
              <SelectTrigger className="w-full md:w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attive">Solo attive</SelectItem>
                <SelectItem value="archiviate">Solo archiviate</SelectItem>
                <SelectItem value="all">Tutte</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verticalFilter} onValueChange={(v) => setVerticalFilter(v as VerticalFilter)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filtra vertical" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i vertical</SelectItem>
                <SelectItem value="current">Solo {currentVertical || "corrente"}</SelectItem>
                <SelectItem value="global">Solo globali</SelectItem>
              </SelectContent>
            </Select>
            {squadre.length > 0 && (
              <Select value={squadraFilter} onValueChange={setSquadraFilter}>
                <SelectTrigger className="w-full md:w-[220px]">
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
                <SelectTrigger className="w-full md:w-[200px]">
                  <SelectValue placeholder="Redditività" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti i margini</SelectItem>
                  <SelectItem value="sotto-soglia">Sotto soglia (&lt;{soglia}%)</SelectItem>
                  <SelectItem value="perdita">In perdita (&lt;0%)</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          {activeFilterChips.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
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
            </div>
          )}
          {tariffe.length > 0 && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                <span className="font-medium text-foreground">{tariffeForActiveGroup.length}</span>{" "}
                {tariffeForActiveGroup.length === 1 ? "voce" : "voci"}
                {tariffeForActiveGroup.length !== tariffe.length && ` su ${tariffe.length} totali`}
              </span>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={resetFilters}>
                  <FilterX className="h-3.5 w-3.5 mr-1" />Azzera filtri
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs per gruppo + conteggio */}
      <Tabs value={activeGroup} onValueChange={(v) => setActiveGroup(v as typeof activeGroup)}>
        <TabsList className="flex-wrap h-auto gap-1">
          {GROUP_DEFS.map((g) => {
            const count = g.value === "all" ? filtered.length : (byGroup[g.value]?.length ?? 0);
            const Icon = g.icon;
            return (
              <TabsTrigger key={g.value} value={g.value} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
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
                  <Layers3 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Nessuna voce ancora</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Inizia creando le voci standard del tuo settore o aggiungine una nuova.
                  </p>
                </div>
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
              </CardContent>
            </Card>
          ) : tariffeForActiveGroup.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                  <Search className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Nessun risultato</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Nessuna voce corrisponde ai filtri o alla ricerca attuali.
                  </p>
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

      {/* Hint margine — m2 (audit): visibile anche al first-run, non solo
          quando l'utente ha già creato tariffe. Serve a educare l'admin sulla
          semantica del margine PRIMA che popoli il catalogo. */}
      {isAdmin && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Come si usa il margine:</strong> è calcolato sul prezzo di
            vendita (standard CFO: <code>margine% = (vendita − costo) / vendita × 100</code>).
            Il semaforo segue la <strong>soglia minima di redditività</strong> definita nelle
            soglie di governance (attuale: <span className="font-medium text-foreground">{soglia}%</span>):{" "}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />sano (≥ {soglia}%)</span>,{" "}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-500" />sotto soglia (0–{soglia}%)</span>,{" "}
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-rose-500" />in perdita (&lt; 0%, salvataggio bloccato)</span>.
            Usa il filtro <em>Redditività</em> per isolare le voci da rivedere. Le tariffe
            archiviate non compaiono nel preventivatore ma restano riattivabili.
          </div>
        </div>
      )}

        </TabsContent>

        <TabsContent value="manutenzione" className="mt-6">
          <ListinoManutenzione embedded />
        </TabsContent>
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
          currentVertical={currentVertical}
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
              Elimina {deleteTariffa ? `«${deleteTariffa.nome}»` : "tariffa"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Se preferisci puoi archiviare la tariffa:
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
                  Eliminandola resteranno riferimenti vuoti (preventivi, bundle, listini…).
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
                  Eliminarle lascerà riferimenti vuoti (preventivi, bundle, listini…).
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

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical, type Vertical } from "@/hooks/useVertical";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Pencil, Trash2, Zap, Search, Copy, MoreVertical, Calculator,
  TrendingUp, Percent, Package, Activity, Archive, RotateCcw, Info,
  Building2, Layers3, Wallet, CheckCircle2, Hammer, HardHat, Wrench,
  ClipboardList, Sparkles, Paintbrush, Bath, Sun, PaintBucket, Cloud,
  Construction, Shovel, Waves, AlertTriangle,
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
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import { TariffaVariantiEditor } from "@/components/settings/TariffaVariantiEditor";
import { useUserPermissions } from "@/hooks/useUserPermissions";

// ─── Types ────────────────────────────────────────────────────────────────────
// FASE 6: tipo esteso con tariffe serramentista + unita_fatturazione canonica.
type TipoTariffa =
  | "posa" | "trasporto" | "tiro_piano" | "smaltimento" | "nolo" | "pratica"
  | "manodopera" | "sopralluogo" | "progettazione" | "ponteggio"
  | "lattoneria" | "sigillatura" | "contorno" | "falso_telaio"
  | "altro";

type UnitaFatturazione =
  | "pz" | "mq" | "ml" | "mc" | "kg" | "gg" | "h" | "a_corpo" | "km" | "piano";

interface Tariffa {
  id: string;
  company_id: string;
  nome: string;
  tipo: TipoTariffa;
  /** Legacy: colonna `unita` CHECK (pz/mq/ml/mc/h/piano/km/fisso). Resta per retro-compat. */
  unita?: string;
  /** FASE 6: source-of-truth UM. */
  unita_fatturazione?: UnitaFatturazione;
  prezzo_vendita?: number;
  /** Legacy alias di costo_interno. */
  prezzo_costo?: number;
  /** FASE 6: costo interno (posatore, attrezzatura, etc.). */
  costo_interno?: number;
  vertical_associato?: string | null;
  descrizione?: string | null;
  attivo?: boolean;
  piano_base?: number;
  prezzo_piano_aggiuntivo?: number;
}

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
interface TipoDef {
  value: TipoTariffa;
  label: string;
  group: "lavorazione" | "logistica" | "servizi" | "nolo" | "finiture" | "altro";
  hint: string;
}

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
 * Id dei preset cataloghi disponibili. Ogni tariffa standard può appartenere
 * a più preset (es. "Manodopera generica" è utile sia al serramentista sia
 * all'edile). I preset sono indipendenti dal `vertical_associato` della
 * tariffa (che è invece un campo DB).
 */
type PresetId =
  | "essenziale" | "serramentista" | "edile" | "impiantista" | "servizi"
  | "bagno" | "fotovoltaico" | "pittura" | "tetti_ripasso" | "tetti_rifacimento"
  | "scavi" | "piscine";

/**
 * Mappa il `vertical` dell'azienda ai `PresetId` di tariffe da pre-selezionare.
 * Invocata solo alla prima apertura del dialog quando `existing.length === 0`.
 *
 * Razionale:
 *  - `serramentista`, `tende_da_sole`, `vetrate` → `serramentista` (installazione
 *    e manodopera di serramenti, tende e vetrate sono molto simili).
 *  - `tetti` → `tetti_ripasso` (ordinario più frequente).
 *  - `bagno` → `bagno`.
 *  - `ristrutturazione` → `edile` (ampio, tutto murario/fissaggi).
 *  - `caldaie`, `clima` → `impiantista` (posa + manutenzione impianti).
 *  - `generico` → `essenziale` (selezione minima trasversale, come default
 *    storico: non rompiamo il comportamento pre-FASE 1.2).
 */
function getDefaultPresetForVerticalTariffe(vertical: Vertical): PresetId {
  switch (vertical) {
    case "serramentista":
    case "tende_da_sole":
    case "vetrate":
      return "serramentista";
    case "tetti":
      return "tetti_ripasso";
    case "bagno":
      return "bagno";
    case "ristrutturazione":
      return "edile";
    case "caldaie":
    case "clima":
      return "impiantista";
    case "generico":
    default:
      return "essenziale";
  }
}

interface TariffaSeed extends Omit<Tariffa, "id" | "company_id"> {
  presets: PresetId[];
}

/**
 * Catalogo tariffe standard pre-compilato. Ogni riga ha uno o più tag `presets`
 * che permettono all'admin di importare in blocco solo le tariffe coerenti con
 * il proprio mestiere. I prezzi sono riferimenti di mercato IT 2025 al netto
 * IVA — ogni azienda dovrà calibrarli.
 */
const STANDARD_TARIFFE: TariffaSeed[] = [
  // ─── POSA ──────────────────────────────────────────────────────────────────
  { nome: "Posa finestra singola", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Finestra battente o scorrevole fino a 120×140 cm, regolazione completa", presets: ["essenziale", "serramentista"] },
  { nome: "Posa portafinestra scorrevole", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 120, costo_interno: 80, descrizione: "Portafinestra scorrevole fino a 2 ante, registrazione carrelli", presets: ["serramentista"] },
  { nome: "Posa alzante-scorrevole", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 220, costo_interno: 160, descrizione: "Sistema alzante-scorrevole grande luce, movimentazione + registrazione", presets: ["serramentista"] },
  { nome: "Posa porta interna", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 65, costo_interno: 40, descrizione: "Porta interna battente, cerniere + maniglia + regolazione", presets: ["essenziale", "serramentista"] },
  { nome: "Posa porta blindata", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Blindata classe 3+, fissaggio + registrazione serrature", presets: ["serramentista"] },
  { nome: "Posa persiana", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 95, costo_interno: 60, descrizione: "Persiana battente in legno o alluminio, cardini + registro", presets: ["serramentista"] },
  { nome: "Posa tapparella motorizzata", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 110, costo_interno: 70, descrizione: "Tapparella + motore tubolare + cablaggio + programmazione finecorsa", presets: ["serramentista"] },
  { nome: "Posa cassonetto coibentato", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 75, costo_interno: 45, descrizione: "Cassonetto monoblocco pre-assemblato (non include muratura)", presets: ["serramentista"] },
  { nome: "Posa zanzariera", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 45, costo_interno: 28, descrizione: "Zanzariera verticale o laterale a rullo", presets: ["serramentista"] },
  { nome: "Posa pavimento ceramica", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Ceramica o gres con colla cementizia su sottofondo pronto", presets: ["essenziale", "edile"] },
  { nome: "Posa battiscopa", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Battiscopa in legno, MDF o ceramica — taglio + silicone", presets: ["edile"] },
  { nome: "Posa rivestimento bagno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 22, costo_interno: 14, descrizione: "Ceramica a parete o mosaico, stuccatura inclusa", presets: ["essenziale", "edile"] },
  { nome: "Posa cappotto termico", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 25, costo_interno: 16, descrizione: "Cappotto EPS/XPS con rasatura base + rete", presets: ["essenziale", "edile"] },

  // ─── MANODOPERA ────────────────────────────────────────────────────────────
  { nome: "Manodopera generica", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 45, costo_interno: 30, descrizione: "Aiuto operaio orario per piccole lavorazioni", presets: ["essenziale", "impiantista", "edile"] },
  { nome: "Manodopera specializzata", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 60, costo_interno: 40, descrizione: "Operaio qualificato con abilitazioni (es. patentino saldatore)", presets: ["serramentista", "impiantista", "edile"] },
  { nome: "Ora straordinaria", tipo: "manodopera", unita_fatturazione: "h", prezzo_vendita: 70, costo_interno: 50, descrizione: "Oltre l'orario ordinario o notturna (+50% rispetto base)", presets: ["serramentista", "impiantista", "edile"] },
  { nome: "Giornata operaio", tipo: "manodopera", unita_fatturazione: "gg", prezzo_vendita: 320, costo_interno: 220, descrizione: "Giornata di 8 ore — operaio base con attrezzatura personale", presets: ["edile"] },

  // ─── LOGISTICA ─────────────────────────────────────────────────────────────
  { nome: "Trasporto fisso cantiere", tipo: "trasporto", unita_fatturazione: "a_corpo", prezzo_vendita: 65, costo_interno: 40, descrizione: "Consegna singola in cantiere (zona locale entro 30 km)", presets: ["essenziale", "serramentista", "edile", "impiantista"] },
  { nome: "Trasporto al km", tipo: "trasporto", unita_fatturazione: "km", prezzo_vendita: 0.8, costo_interno: 0.5, descrizione: "Consegna extra-zona, fatturazione al km A/R", presets: ["essenziale", "serramentista", "edile", "impiantista"] },
  { nome: "Tiro al piano", tipo: "tiro_piano", unita_fatturazione: "piano", prezzo_vendita: 12, costo_interno: 8, piano_base: 1, prezzo_piano_aggiuntivo: 5, descrizione: "Base + extra per piano senza ascensore", presets: ["essenziale", "serramentista", "edile"] },
  { nome: "Tiro al piano con autoscala", tipo: "tiro_piano", unita_fatturazione: "piano", prezzo_vendita: 60, costo_interno: 45, piano_base: 1, prezzo_piano_aggiuntivo: 25, descrizione: "Autoscala + operatore per cantieri 4+ piani", presets: ["serramentista", "edile"] },
  { nome: "Smaltimento serramento", tipo: "smaltimento", unita_fatturazione: "pz", prezzo_vendita: 22, costo_interno: 15, descrizione: "Rimozione serramento esistente + conferimento in discarica", presets: ["serramentista"] },
  { nome: "Smaltimento porta", tipo: "smaltimento", unita_fatturazione: "pz", prezzo_vendita: 35, costo_interno: 22, descrizione: "Rimozione porta + telaio esistenti con sigillatura provvisoria", presets: ["serramentista"] },
  { nome: "Smaltimento materiale edile", tipo: "smaltimento", unita_fatturazione: "mc", prezzo_vendita: 95, costo_interno: 70, descrizione: "Materiale di risulta al metro cubo (calcinacci, imballi)", presets: ["edile"] },

  // ─── NOLO ──────────────────────────────────────────────────────────────────
  { nome: "Trabattello giornaliero", tipo: "nolo", unita_fatturazione: "gg", prezzo_vendita: 55, costo_interno: 35, descrizione: "Noleggio trabattello standard fino a 6 m", presets: ["essenziale", "edile", "impiantista"] },
  { nome: "Ponteggio mq/sett", tipo: "nolo", unita_fatturazione: "mq", prezzo_vendita: 9, costo_interno: 6, descrizione: "Ponteggio al mq settimanale (solo noleggio)", presets: ["essenziale", "edile"] },
  { nome: "Ponteggio completo mq/mese", tipo: "ponteggio", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 20, descrizione: "Ponteggio + montaggio + smontaggio + PIMUS al mq/mese", presets: ["edile"] },
  { nome: "Nolo minipala a caldo", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 75, costo_interno: 55, descrizione: "Minipala con operatore abilitato", presets: ["edile"] },
  { nome: "Nolo generatore", tipo: "nolo", unita_fatturazione: "gg", prezzo_vendita: 40, costo_interno: 25, descrizione: "Gruppo elettrogeno da cantiere 5–10 kVA", presets: ["edile", "impiantista"] },

  // ─── FINITURE (lattoneria / sigillatura / contorno / falso telaio) ─────────
  { nome: "Lattoneria soglia finestra", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 18, costo_interno: 11, descrizione: "Soglia esterna in alluminio verniciato a misura", presets: ["serramentista"] },
  { nome: "Lattoneria scossalina", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 22, costo_interno: 13, descrizione: "Scossalina superiore alluminio/rame con piegatura a sagoma", presets: ["serramentista", "edile"] },
  { nome: "Lattoneria canale di gronda", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 28, costo_interno: 17, descrizione: "Canale di gronda in lamiera zincata con pluviali", presets: ["edile"] },
  { nome: "Sigillatura silicone perimetrale", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 4, costo_interno: 2.2, descrizione: "Silicone neutro + nastro primer perimetrale", presets: ["essenziale", "serramentista"] },
  { nome: "Sigillatura poliuretanica", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Schiuma poliuretanica alta densità per tenuta aria/acqua", presets: ["serramentista"] },
  { nome: "Contorno cartongesso", tipo: "contorno", unita_fatturazione: "ml", prezzo_vendita: 14, costo_interno: 8, descrizione: "Rivestimento cartongesso perimetrale + rasatura + angolari", presets: ["serramentista"] },
  { nome: "Contorno intonachino", tipo: "contorno", unita_fatturazione: "ml", prezzo_vendita: 11, costo_interno: 6, descrizione: "Intonachino di ripristino perimetrale dopo smontaggio", presets: ["serramentista", "edile"] },
  { nome: "Falso telaio acciaio zincato", tipo: "falso_telaio", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Controtelaio standard in acciaio zincato + fissaggi", presets: ["serramentista"] },
  { nome: "Falso telaio in legno", tipo: "falso_telaio", unita_fatturazione: "pz", prezzo_vendita: 65, costo_interno: 40, descrizione: "Controtelaio in legno d'abete sezione 7×2,5 cm", presets: ["serramentista"] },

  // ─── SERVIZI TECNICI ───────────────────────────────────────────────────────
  { nome: "Sopralluogo tecnico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 80, costo_interno: 50, descrizione: "Rilievo misure + verifica vincoli tecnici in cantiere", presets: ["serramentista", "servizi", "edile"] },
  { nome: "Sopralluogo condominio", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 150, costo_interno: 100, descrizione: "Sopralluogo con accesso condominiale + relazione", presets: ["serramentista", "servizi"] },
  { nome: "Progettazione esecutiva", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 350, costo_interno: 200, descrizione: "Disegni esecutivi + capitolato tecnico", presets: ["servizi"] },
  { nome: "Direzione lavori", tipo: "progettazione", unita_fatturazione: "gg", prezzo_vendita: 280, costo_interno: 180, descrizione: "Direzione lavori in cantiere con SAL", presets: ["servizi"] },
  { nome: "Pratica CIL", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 250, costo_interno: 150, descrizione: "Comunicazione Inizio Lavori comunale", presets: ["servizi", "serramentista"] },
  { nome: "Pratica Ecobonus/Superbonus", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 900, costo_interno: 550, descrizione: "Asseverazione tecnica + comunicazione ENEA + visti", presets: ["servizi", "serramentista"] },
  { nome: "Certificazione energetica APE", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "APE post-intervento (unità abitativa)", presets: ["servizi"] },

  // ─── RISTRUTTURAZIONE BAGNO ─────────────────────────────────────────────────
  { nome: "Demolizione bagno completo", tipo: "manodopera", unita_fatturazione: "a_corpo", prezzo_vendita: 950, costo_interno: 650, descrizione: "Demolizione rivestimenti parete + pavimento bagno fino a 6 mq", presets: ["bagno", "edile"] },
  { nome: "Rimozione sanitari esistenti", tipo: "smaltimento", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "Smontaggio vasca/piatto doccia + wc + bidet + lavabo con conferimento", presets: ["bagno"] },
  { nome: "Posa piatto doccia filo pavimento", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 220, costo_interno: 140, descrizione: "Piatto doccia integrato a pavimento con sifone e impermeabilizzazione", presets: ["bagno"] },
  { nome: "Posa sanitari completi", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 320, costo_interno: 200, descrizione: "Installazione wc + bidet + lavabo + miscelatori con collegamenti", presets: ["bagno"] },
  { nome: "Posa miscelatore incasso", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 85, costo_interno: 55, descrizione: "Miscelatore a incasso doccia o vasca con staffa e collaudo", presets: ["bagno"] },
  { nome: "Posa box doccia", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Box doccia cristallo temperato 6/8 mm con profili e guarnizioni", presets: ["bagno"] },
  { nome: "Posa mosaico bagno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 35, descrizione: "Mosaico vetro o ceramica parete doccia, stuccatura epossidica inclusa", presets: ["bagno"] },
  { nome: "Impermeabilizzazione doccia", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Guaina liquida cementizia piatto doccia + fascia perimetrale", presets: ["bagno", "edile"] },
  { nome: "Stuccatura epossidica", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 8, descrizione: "Stuccatura epossidica antimacchia per rivestimenti bagno/cucina", presets: ["bagno"] },
  { nome: "Posa scaldasalviette", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 120, costo_interno: 75, descrizione: "Termoarredo scaldasalviette con attacco idraulico e valvole", presets: ["bagno", "impiantista"] },

  // ─── FOTOVOLTAICO ──────────────────────────────────────────────────────────
  { nome: "Sopralluogo fotovoltaico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 150, costo_interno: 90, descrizione: "Rilievo tetto + verifica ombreggiamenti + dimensionamento preliminare", presets: ["fotovoltaico", "servizi"] },
  { nome: "Progettazione impianto FV", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 450, costo_interno: 280, descrizione: "Schema unifilare + relazione tecnica + calcolo producibilità PVGIS", presets: ["fotovoltaico", "servizi"] },
  { nome: "Posa struttura FV su tetto", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 45, costo_interno: 28, descrizione: "Staffe e profili alluminio complanari a tetto per modulo FV", presets: ["fotovoltaico"] },
  { nome: "Posa modulo fotovoltaico", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 55, costo_interno: 35, descrizione: "Installazione pannello 400-450 Wp, fissaggio morsetti + allineamento", presets: ["fotovoltaico"] },
  { nome: "Cablaggio stringa FV", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Cavo solare 6 mm² + connettori MC4 + passaggio canalina", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Posa inverter stringa", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Inverter 3-6 kW con sezionatore DC + quadro AC + messa a terra", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Posa sistema di accumulo", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 450, costo_interno: 300, descrizione: "Batteria litio 5-10 kWh con BMS e integrazione inverter ibrido", presets: ["fotovoltaico", "impiantista"] },
  { nome: "Pratica GSE Scambio sul Posto", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 350, costo_interno: 200, descrizione: "Richiesta convenzione GSE SSP + documentazione TICA", presets: ["fotovoltaico", "servizi"] },
  { nome: "Pratica E-Distribuzione", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 280, costo_interno: 180, descrizione: "Preventivo connessione + comunicazione fine lavori E-Distribuzione", presets: ["fotovoltaico", "servizi"] },

  // ─── PITTURA ────────────────────────────────────────────────────────────────
  { nome: "Preparazione fondo parete", tipo: "manodopera", unita_fatturazione: "mq", prezzo_vendita: 5, costo_interno: 3, descrizione: "Carteggiatura, spolvero e applicazione fondo isolante prima di pittura", presets: ["pittura"] },
  { nome: "Rasatura parete", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 11, costo_interno: 7, descrizione: "Rasatura a gesso o calce per fondi irregolari, doppia mano", presets: ["pittura", "edile"] },
  { nome: "Stuccatura crepe e fori", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 85, costo_interno: 55, descrizione: "Stuccatura puntuale crepe, fori chiodi e imperfezioni localizzate", presets: ["pittura"] },
  { nome: "Tinteggiatura interna", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 8, costo_interno: 4.5, descrizione: "Due mani di pittura lavabile idropittura traspirante", presets: ["pittura", "essenziale"] },
  { nome: "Tinteggiatura esterna", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 9, descrizione: "Pittura al silossanico o acrilsilossanico facciata esterna", presets: ["pittura", "edile"] },
  { nome: "Verniciatura infissi legno", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 32, costo_interno: 20, descrizione: "Sverniciatura + primer + smalto finestra/persiana (entrambi i lati)", presets: ["pittura", "serramentista"] },
  { nome: "Decorativo effetto spatolato", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 16, descrizione: "Applicazione pittura decorativa a spatola, due tonalità", presets: ["pittura"] },
  { nome: "Protezione mobili e pavimenti", tipo: "manodopera", unita_fatturazione: "a_corpo", prezzo_vendita: 95, costo_interno: 55, descrizione: "Telonatura pavimenti + protezione mobili + mascheratura infissi", presets: ["pittura"] },

  // ─── RIPASSO TETTI ─────────────────────────────────────────────────────────
  { nome: "Sopralluogo copertura", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 120, costo_interno: 75, descrizione: "Verifica stato manto + elementi di lattoneria + relazione fotografica", presets: ["tetti_ripasso", "tetti_rifacimento", "servizi"] },
  { nome: "Ripasso coppi esistenti", tipo: "manodopera", unita_fatturazione: "mq", prezzo_vendita: 18, costo_interno: 11, descrizione: "Rimozione + ricollocazione coppi per riallineamento falda", presets: ["tetti_ripasso"] },
  { nome: "Sostituzione coppi rotti", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 8, costo_interno: 4, descrizione: "Sostituzione puntuale coppo rotto o mancante (materiale escluso)", presets: ["tetti_ripasso"] },
  { nome: "Pulizia canali e pluviali", tipo: "manodopera", unita_fatturazione: "ml", prezzo_vendita: 4, costo_interno: 2.5, descrizione: "Rimozione foglie e detriti da canali di gronda + lavaggio pluviali", presets: ["tetti_ripasso"] },
  { nome: "Impermeabilizzazione lattoneria", tipo: "sigillatura", unita_fatturazione: "ml", prezzo_vendita: 9, costo_interno: 5, descrizione: "Sigillatura giunti scossaline e raccordi camino con bitume-poliuretano", presets: ["tetti_ripasso"] },
  { nome: "Sigillatura comignolo", tipo: "sigillatura", unita_fatturazione: "pz", prezzo_vendita: 140, costo_interno: 85, descrizione: "Risanamento raccordo camino-manto con fascia autoadesiva + malta", presets: ["tetti_ripasso"] },
  { nome: "Trattamento antimuschio", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 6, costo_interno: 3.5, descrizione: "Applicazione biocida antimuschio su coppi + risciacquo a bassa pressione", presets: ["tetti_ripasso"] },

  // ─── RIFACIMENTO TETTI ─────────────────────────────────────────────────────
  { nome: "Rimozione manto esistente", tipo: "smaltimento", unita_fatturazione: "mq", prezzo_vendita: 14, costo_interno: 8, descrizione: "Smontaggio coppi/tegole esistenti e conferimento in discarica", presets: ["tetti_rifacimento"] },
  { nome: "Rimozione amianto (sub-appalto)", tipo: "smaltimento", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 40, descrizione: "Bonifica eternit con ditta iscritta albo gestori — piano di lavoro ASL", presets: ["tetti_rifacimento", "servizi"] },
  { nome: "Posa freno al vapore", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 8, costo_interno: 4, descrizione: "Telo traspirante/freno vapore sottotegola con nastri di sigillatura", presets: ["tetti_rifacimento"] },
  { nome: "Posa isolante tetto", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 22, costo_interno: 14, descrizione: "Pannello isolante XPS/lana roccia sp. 10-12 cm posato tra listelli", presets: ["tetti_rifacimento", "edile"] },
  { nome: "Posa listelli ventilazione", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 9, costo_interno: 5, descrizione: "Listellatura doppio orditura per camera di ventilazione sotto manto", presets: ["tetti_rifacimento"] },
  { nome: "Posa manto coppi nuovo", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 28, costo_interno: 18, descrizione: "Posa coppi o tegole canadesi (esclusi coppi di colmo)", presets: ["tetti_rifacimento"] },
  { nome: "Lattoneria tetto completa", tipo: "lattoneria", unita_fatturazione: "ml", prezzo_vendita: 32, costo_interno: 20, descrizione: "Scossaline + canali + pluviali alluminio o rame preverniciato", presets: ["tetti_rifacimento"] },
  { nome: "Posa lucernario", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 280, costo_interno: 180, descrizione: "Velux o equivalente con raccordi di tenuta e rivestimenti interni", presets: ["tetti_rifacimento"] },
  { nome: "Sigillatura comignoli nuovi", tipo: "sigillatura", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Rifacimento raccordo camino/manto nuovo con piombo e fascia EPDM", presets: ["tetti_rifacimento"] },
  { nome: "Noleggio ponteggio per tetto", tipo: "ponteggio", unita_fatturazione: "mq", prezzo_vendita: 32, costo_interno: 22, descrizione: "Ponteggio perimetrale + parasassi + PIMUS per lavori copertura", presets: ["tetti_rifacimento"] },

  // ─── SCAVI ─────────────────────────────────────────────────────────────────
  { nome: "Sopralluogo geotecnico", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 180, costo_interno: 110, descrizione: "Rilievo quote + verifica terreno + individuazione sottoservizi", presets: ["scavi", "servizi"] },
  { nome: "Scavo sbancamento generale", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 14, costo_interno: 9, descrizione: "Sbancamento con escavatore fino a 2 m di profondità, terreno normale", presets: ["scavi", "edile"] },
  { nome: "Scavo fondazione continua", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 28, costo_interno: 18, descrizione: "Scavo fondazione a sezione obbligata per travi rovesce o cordoli", presets: ["scavi", "edile"] },
  { nome: "Scavo pozzo nero o fossa", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 38, costo_interno: 25, descrizione: "Scavo fossa per vasca biologica, pozzetto perdente o Imhoff", presets: ["scavi"] },
  { nome: "Trasporto terra a discarica", tipo: "trasporto", unita_fatturazione: "mc", prezzo_vendita: 22, costo_interno: 15, descrizione: "Carico e trasporto terra di risulta con autocarro ribaltabile", presets: ["scavi"] },
  { nome: "Reinterro e costipamento", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 9, costo_interno: 5, descrizione: "Reinterro con terra a strati + costipamento a piastra vibrante", presets: ["scavi"] },
  { nome: "Nolo escavatore cingolato", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 90, costo_interno: 65, descrizione: "Escavatore 3-6 t con operatore abilitato", presets: ["scavi", "edile"] },
  { nome: "Nolo autocarro ribaltabile", tipo: "nolo", unita_fatturazione: "h", prezzo_vendita: 75, costo_interno: 55, descrizione: "Autocarro 3,5 t o 35 q con autista per trasporto materiali", presets: ["scavi", "edile"] },
  { nome: "Smaltimento terra contaminata", tipo: "smaltimento", unita_fatturazione: "mc", prezzo_vendita: 140, costo_interno: 100, descrizione: "Conferimento terra di scavo con analisi chimiche al mc", presets: ["scavi", "servizi"] },

  // ─── REALIZZAZIONE PISCINE ─────────────────────────────────────────────────
  { nome: "Sopralluogo piscina", tipo: "sopralluogo", unita_fatturazione: "a_corpo", prezzo_vendita: 250, costo_interno: 150, descrizione: "Rilievo area + verifica allacciamenti + studio esposizione", presets: ["piscine", "servizi"] },
  { nome: "Progettazione piscina", tipo: "progettazione", unita_fatturazione: "a_corpo", prezzo_vendita: 1400, costo_interno: 900, descrizione: "Progetto esecutivo piscina inclusa idraulica di filtraggio", presets: ["piscine", "servizi"] },
  { nome: "Scavo vasca piscina", tipo: "manodopera", unita_fatturazione: "mc", prezzo_vendita: 24, costo_interno: 15, descrizione: "Scavo vasca piscina con sagomatura pareti e fondo", presets: ["piscine", "scavi"] },
  { nome: "Armatura pareti piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 55, costo_interno: 35, descrizione: "Rete elettrosaldata + ferri di parete + casseri per getto cls", presets: ["piscine"] },
  { nome: "Impermeabilizzazione piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 45, costo_interno: 28, descrizione: "Doppia guaina cementizia bicomponente + angolari rinforzati", presets: ["piscine"] },
  { nome: "Posa rivestimento mosaico piscina", tipo: "posa", unita_fatturazione: "mq", prezzo_vendita: 75, costo_interno: 48, descrizione: "Mosaico vetro o gres 2,5×2,5 cm con colla + stucco specifico piscine", presets: ["piscine"] },
  { nome: "Impianto filtraggio piscina", tipo: "posa", unita_fatturazione: "a_corpo", prezzo_vendita: 1800, costo_interno: 1200, descrizione: "Pompa + filtro a sabbia + skimmer + bocchette + tubazioni PVC", presets: ["piscine", "impiantista"] },
  { nome: "Illuminazione subacquea LED", tipo: "posa", unita_fatturazione: "pz", prezzo_vendita: 180, costo_interno: 110, descrizione: "Faro LED a bassa tensione con nicchia stagna e trasformatore", presets: ["piscine", "impiantista"] },
  { nome: "Pratica edilizia piscina", tipo: "pratica", unita_fatturazione: "a_corpo", prezzo_vendita: 800, costo_interno: 480, descrizione: "SCIA o permesso di costruire + deposito al genio civile se richiesto", presets: ["piscine", "servizi"] },
  { nome: "Bordo sfioratore skimmer", tipo: "posa", unita_fatturazione: "ml", prezzo_vendita: 95, costo_interno: 60, descrizione: "Bordo piscina in gres antiscivolo con canale sfioratore perimetrale", presets: ["piscine"] },
];

/**
 * Definizione dei preset cataloghi. Ogni preset raggruppa tariffe coerenti
 * con un mestiere/profilo aziendale tipico. L'admin può importare uno o più
 * preset (con un click) oppure pickare le singole voci manualmente.
 */
const PRESET_CATALOGHI: Array<{
  id: PresetId;
  nome: string;
  descrizione: string;
  icon: typeof Sparkles;
  iconClass: string;
}> = [
  {
    id: "essenziale",
    nome: "Essenziale",
    descrizione: "Set base universale: posa, manodopera, trasporto, tiro piano, smaltimento. Parti da qui se sei incerto.",
    icon: Sparkles,
    iconClass: "bg-primary/10 text-primary",
  },
  {
    id: "serramentista",
    nome: "Serramentista completo",
    descrizione: "Posa finestre, porte, persiane, tapparelle + finiture (lattoneria, sigillatura, contorno, falso telaio) + pratiche bonus.",
    icon: HardHat,
    iconClass: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "edile",
    nome: "Edile generico",
    descrizione: "Posa pavimenti e rivestimenti, cappotto termico, ponteggi, noli, smaltimento materiale, manodopera specializzata.",
    icon: Hammer,
    iconClass: "bg-orange-100 text-orange-700",
  },
  {
    id: "impiantista",
    nome: "Impiantista",
    descrizione: "Manodopera a ore (generica + specializzata), trasporti, nolo trabattello e generatore per interventi impianti.",
    icon: Wrench,
    iconClass: "bg-blue-100 text-blue-700",
  },
  {
    id: "servizi",
    nome: "Servizi tecnici",
    descrizione: "Sopralluoghi, progettazione, direzione lavori, pratiche Ecobonus/Superbonus, APE.",
    icon: ClipboardList,
    iconClass: "bg-indigo-100 text-indigo-700",
  },
  {
    id: "bagno",
    nome: "Ristrutturazione bagno",
    descrizione: "Demolizione, rimozione sanitari, impermeabilizzazione, posa piatto doccia, sanitari, box e rivestimenti completi.",
    icon: Bath,
    iconClass: "bg-cyan-100 text-cyan-700",
  },
  {
    id: "fotovoltaico",
    nome: "Fotovoltaico",
    descrizione: "Sopralluogo + progetto, posa struttura, moduli, cablaggio, inverter, accumulo, pratiche GSE e E-Distribuzione.",
    icon: Sun,
    iconClass: "bg-yellow-100 text-yellow-700",
  },
  {
    id: "pittura",
    nome: "Pittura e decorazioni",
    descrizione: "Preparazione fondi, rasatura, stuccatura, tinteggiature interne/esterne, verniciature infissi e decorativi.",
    icon: PaintBucket,
    iconClass: "bg-fuchsia-100 text-fuchsia-700",
  },
  {
    id: "tetti_ripasso",
    nome: "Ripasso tetti",
    descrizione: "Manutenzione coperture: ripasso coppi, sostituzioni puntuali, pulizia canali, antimuschio, sigillature.",
    icon: Cloud,
    iconClass: "bg-sky-100 text-sky-700",
  },
  {
    id: "tetti_rifacimento",
    nome: "Rifacimento tetti",
    descrizione: "Rimozione manto (incluso amianto), freno vapore, isolante, listelli ventilazione, nuovo manto, lattoneria e lucernari.",
    icon: Construction,
    iconClass: "bg-stone-200 text-stone-700",
  },
  {
    id: "scavi",
    nome: "Scavi a terra",
    descrizione: "Sbancamento, fondazioni, scavi puntuali, nolo escavatore, trasporto terra e reinterro.",
    icon: Shovel,
    iconClass: "bg-amber-100 text-amber-700",
  },
  {
    id: "piscine",
    nome: "Realizzazione piscine",
    descrizione: "Progetto + scavo + armatura + impermeabilizzazione + rivestimento mosaico + impianto di filtraggio e illuminazione.",
    icon: Waves,
    iconClass: "bg-teal-100 text-teal-700",
  },
];

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
  tariffe, isAdmin,
}: { tariffe: Tariffa[]; isAdmin: boolean }) {
  const kpi = useMemo(() => {
    const totali = tariffe.length;
    const attive = tariffe.filter((t) => t.attivo !== false).length;
    const archiviate = totali - attive;
    // Margine medio pesato per prezzo_vendita (solo tariffe con entrambi i valori)
    let sumMarg = 0;
    let countMarg = 0;
    for (const t of tariffe) {
      const pv = t.prezzo_vendita ?? 0;
      const pc = t.costo_interno ?? t.prezzo_costo ?? 0;
      if (pv > 0 && pc > 0) {
        sumMarg += calcMargine(pv, pc);
        countMarg += 1;
      }
    }
    const margineMedio = countMarg > 0 ? sumMarg / countMarg : 0;
    // Top tipo
    const byTipo = new Map<string, number>();
    for (const t of tariffe) byTipo.set(t.tipo, (byTipo.get(t.tipo) ?? 0) + 1);
    const topTipo = [...byTipo.entries()].sort((a, b) => b[1] - a[1])[0];
    return { totali, attive, archiviate, margineMedio, countMarg, topTipo };
  }, [tariffe]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tariffe totali
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
                  su {kpi.countMarg} tariffe con costi
                </div>
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
                {kpi.topTipo ? `${kpi.topTipo[1]} tariffe` : "Nessuna tariffa ancora"}
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
  open, onClose, editing, companyId, isAdmin, currentVertical, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Tariffa | null;
  companyId: string; isAdmin: boolean;
  currentVertical: string | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
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
  const [attivo, setAttivo] = useState<boolean>(editing?.attivo !== false);
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

      const payload: Record<string, unknown> = {
        company_id: companyId,
        nome: nome.trim(),
        descrizione: descrizione.trim() || null,
        tipo,
        // Backward-compat: popoliamo anche la vecchia colonna `unita` con mapping
        unita: legacyUnitaFrom(unitaFatturazione),
        unita_fatturazione: unitaFatturazione,
        vertical_associato: verticalAssociato.trim() || null,
        prezzo_vendita: prezzoVenditaValue,
        attivo,
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
      toast.success(editing ? "Tariffa aggiornata" : "Tariffa creata");
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
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Modifica i dati della tariffa. L'unità di misura è fissa per le tariffe già usate in preventivo."
              : "Compila i campi per creare una nuova tariffa di servizio o lavorazione."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Anagrafica */}
          <div className="grid gap-3">
            <div>
              <Label>Nome *</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Es. Posa finestra media (100×120)"
              />
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
          <div className="grid gap-3 sm:grid-cols-2">
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
      toast.success(`${toCreate.length} tariffe create`);
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
          <DialogTitle>Catalogo tariffe standard</DialogTitle>
          <DialogDescription>
            Scegli un preset adatto al tuo mestiere per importare in blocco, oppure pick le singole voci.
            Le tariffe già presenti (stesso nome) sono disabilitate.
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
                          {stats.importabili}/{stats.total} tariffe
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
            <span className="text-muted-foreground"> tariffe da importare</span>
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
            Tutte le tariffe
          </div>
          {groups.map(([tipo, items]) => (
            <div key={tipo}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${tipoBadgeClass(tipo)}`}>
                  {tipoLabel(tipo)}
                </span>
                <span className="text-xs text-muted-foreground">{items.length} tariffe</span>
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
            {creating ? "Creazione..." : `Crea ${toCreate.length} tariffe`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TariffeTable ────────────────────────────────────────────────────────────
function TariffeTable({
  items, isAdmin, onEdit, onDelete, onToggleAttivo, onDuplica,
}: {
  items: Tariffa[];
  isAdmin: boolean;
  onEdit: (t: Tariffa) => void;
  onDelete: (id: string) => void;
  onToggleAttivo: (t: Tariffa) => void;
  onDuplica: (t: Tariffa) => void;
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

  const colCount = isAdmin ? 8 : 6;

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
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
            const isAttivo = t.attivo !== false;
            return (
              <TableRow key={t.id} className={!isAttivo ? "opacity-60" : undefined}>
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
                    {t.nome}
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
                      <span className={`text-sm font-semibold ${margineColor(margine)}`}>
                        {margine.toFixed(1)}%
                      </span>
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

export default function SettingsTariffe() {
  const { effectiveCompany, role } = useAuth();
  const { vertical: currentVertical } = useVertical();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();

  const [activeGroup, setActiveGroup] = useState<TipoDef["group"] | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Tariffa | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [standardOpen, setStandardOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [verticalFilter, setVerticalFilter] = useState<VerticalFilter>("all");
  const [statoFilter, setStatoFilter] = useState<StatoFilter>("attive");

  const { data: tariffe = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["tariffe-aziendali-full", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, company_id, nome, descrizione, tipo, unita, unita_fatturazione, prezzo_vendita, prezzo_costo, costo_interno, vertical_associato, piano_base, prezzo_piano_aggiuntivo, attivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as unknown as Tariffa[];
    },
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
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
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
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
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
      queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] });
      toast.success("Tariffa duplicata");
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Errore duplicazione");
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
      // vertical
      if (verticalFilter === "current" && t.vertical_associato !== currentVertical) return false;
      if (verticalFilter === "global" && t.vertical_associato) return false;
      // search
      if (q) {
        const haystack = `${t.nome} ${t.descrizione ?? ""} ${tipoLabel(t.tipo)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tariffe, statoFilter, verticalFilter, currentVertical, search]);

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

  const tariffeForActiveGroup = activeGroup === "all"
    ? filtered
    : byGroup[activeGroup] ?? [];

  if (!companyId) return null;

  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Wrench className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Tariffe Aziendali</h1>
            <p className="text-sm text-muted-foreground">
              Tariffe di posa, manodopera, trasporto e servizi. Ogni tariffa ha un prezzo di vendita
              {isAdmin ? " e un costo interno (solo admin)" : ""}. Usate automaticamente nel preventivatore.
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setStandardOpen(true)}>
            <Zap className="h-4 w-4 mr-1.5" />Catalogo standard
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1.5" />Nuova tariffa
          </Button>
        </div>
      </div>

      {/* KPI */}
      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Tariffe non caricate</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error instanceof Error ? error.message : "Errore durante il caricamento delle tariffe."}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <KpiHeader tariffe={tariffe} isAdmin={isAdmin} />

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-3 md:grid-cols-[1fr,auto,auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome, descrizione o tipo…"
                className="pl-9"
              />
            </div>
            <Select value={statoFilter} onValueChange={(v) => setStatoFilter(v as StatoFilter)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="attive">Solo attive</SelectItem>
                <SelectItem value="archiviate">Solo archiviate</SelectItem>
                <SelectItem value="all">Tutte</SelectItem>
              </SelectContent>
            </Select>
            <Select value={verticalFilter} onValueChange={(v) => setVerticalFilter(v as VerticalFilter)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filtra vertical" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i vertical</SelectItem>
                <SelectItem value="current">Solo {currentVertical || "corrente"}</SelectItem>
                <SelectItem value="global">Solo globali</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
                  <h3 className="font-semibold">Nessuna tariffa ancora</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Inizia creando le tariffe standard del tuo settore o aggiungine una nuova.
                  </p>
                </div>
                <div className="flex justify-center gap-2">
                  <Button variant="outline" onClick={() => setStandardOpen(true)}>
                    <Zap className="h-4 w-4 mr-2" />Usa il catalogo standard
                  </Button>
                  <Button onClick={openNew}>
                    <Plus className="h-4 w-4 mr-2" />Nuova tariffa
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <TariffeTable
              items={tariffeForActiveGroup}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={setDeleteId}
              onToggleAttivo={(t) => toggleAttivoMutation.mutate(t)}
              onDuplica={(t) => duplicaMutation.mutate(t)}
            />
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
            Punta al <span className="text-emerald-700 font-medium">25%+</span> per una
            redditività industriale sana. Sotto il <span className="text-amber-700 font-medium">15%</span>
            la tariffa è a rischio, sotto <span className="text-rose-700 font-medium">0%</span> è
            in perdita e il salvataggio viene bloccato. Le tariffe archiviate non compaiono
            nel preventivatore ma restano riattivabili.
          </div>
        </div>
      )}

      {/* Dialogs */}
      {dialogOpen && (
        <TariffaDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          editing={editing}
          companyId={companyId}
          isAdmin={isAdmin}
          currentVertical={currentVertical}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] })}
        />
      )}

      {standardOpen && (
        <StandardTariffeDialog
          open={standardOpen}
          onClose={() => setStandardOpen(false)}
          existing={tariffe}
          companyId={companyId}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["tariffe-aziendali-full", companyId] })}
          vertical={currentVertical ?? "generico"}
        />
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tariffa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. Se preferisci puoi archiviare la tariffa:
              non sarà più selezionabile nei nuovi preventivi ma potrai riattivarla in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

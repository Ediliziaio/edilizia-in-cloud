import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useVertical, type Vertical } from "@/hooks/useVertical";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  Plus, Pencil, Trash2, Sparkles, Flame, Zap as ZapIcon,
  Sun, Bath, PaintBucket, Cloud, Construction, Shovel, Waves, CheckCircle2,
  Search, ShieldAlert, ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface TipoImpianto {
  id: string;
  company_id: string;
  nome: string;
  icona: string | null;
  ordine: number | null;
  attivo: boolean;
}

/**
 * Allineato al CHECK constraint DB (migration 20260814000001_listino_prezzi.sql):
 *   categoria IN ('manutenzione_ordinaria','manutenzione_straordinaria',
 *                  'guasto','installazione','sopralluogo').
 * DEFAULT DB = 'manutenzione_ordinaria'.
 */
type CategoriaIntervento =
  | "manutenzione_ordinaria"
  | "manutenzione_straordinaria"
  | "guasto"
  | "installazione"
  | "sopralluogo";

interface TipoIntervento {
  id: string;
  company_id: string;
  nome: string;
  categoria: CategoriaIntervento | null;
  durata_stimata_h: number | null;
  attivo: boolean;
}

interface ListinoPrezzo {
  id: string;
  company_id: string;
  tipo_impianto_id: string;
  tipo_intervento_id: string;
  /** Nome DB reale: migration 20260814000001 usa `prezzo_base NUMERIC(10,2)`. */
  prezzo_base: number;
  /** Nome DB reale: `iva_percentuale INTEGER CHECK IN (0,4,10,22)`. */
  iva_percentuale: number;
  /** CHECK DB: unita IN ('intervento','ora','mq','ml','pz'). */
  unita: string;
  /** Permette di disattivare una riga senza cancellarla. DEFAULT true. */
  attivo: boolean;
  /** Note libere (opzionale). */
  note: string | null;
  /** Finestra di validità (opzionale): se valorizzata, il prezzo è attivo solo nel range. */
  valido_dal: string | null;
  valido_al: string | null;
  tipo_impianto?: TipoImpianto;
  tipo_intervento?: TipoIntervento;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ICONE_IMPIANTO = ["🔥", "🌡️", "💧", "⚡", "☀️", "🔧", "🏠", "❄️", "🛠️", "⚙️"];

const CATEGORIE_INTERVENTO: { value: CategoriaIntervento; label: string; color: string }[] = [
  { value: "manutenzione_ordinaria",     label: "Manutenzione ordinaria",     color: "bg-green-100 text-green-700" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria", color: "bg-amber-100 text-amber-700" },
  { value: "guasto",                     label: "Guasto / emergenza",         color: "bg-red-100 text-red-700" },
  { value: "installazione",              label: "Installazione",              color: "bg-blue-100 text-blue-700" },
  { value: "sopralluogo",                label: "Sopralluogo",                color: "bg-yellow-100 text-yellow-700" },
];

/**
 * Allineati ai CHECK DB (migration 20260814000001_listino_prezzi.sql L.37-38):
 *   iva_percentuale IN (0,4,10,22)  — niente 5% (non esiste in IT)
 *   unita IN ('intervento','ora','mq','ml','pz') — niente "giorno"
 */
const UNITA_OPTIONS = ["intervento", "ora", "mq", "ml", "pz"] as const;
const IVA_OPTIONS = [0, 4, 10, 22] as const;

/** Label user-friendly per l'unità. */
const UNITA_LABEL: Record<(typeof UNITA_OPTIONS)[number], string> = {
  intervento: "A intervento",
  ora: "Ora",
  mq: "Metro quadro",
  ml: "Metro lineare",
  pz: "Pezzo",
};

// ─── Preset templates ─────────────────────────────────────────────────────────
/**
 * Id dei preset listino disponibili. Ogni impianto/intervento/tariffa può
 * appartenere a più preset (es. "Condizionatore split" è utile sia al
 * termoidraulico sia al bagno moderno). L'admin può importare uno o più preset
 * con un click dal dialog template, oppure scegliere singole voci.
 */
type PresetListinoId =
  | "termoidraulica" | "elettrico" | "bagno" | "fotovoltaico"
  | "pittura" | "tetti_ripasso" | "tetti_rifacimento" | "scavi" | "piscine";

/**
 * Mappa il `vertical` dell'azienda ai preset di listino manutenzione che
 * saranno pre-selezionati nel dialog "Importa da template".
 *
 * Razionale delle scelte:
 *  - `caldaie` / `clima` → `termoidraulica` (include pompe di calore, VRF,
 *    caldaie, radiatori — tutti gli impianti idronici + raffreddamento).
 *  - `tetti` → `tetti_ripasso` (manutenzione ordinaria è il caso d'uso
 *    dominante; `tetti_rifacimento` è uno straordinario raro).
 *  - `bagno` → `bagno` (sanitari, rubinetti, scarichi, box doccia).
 *  - `ristrutturazione` → `pittura` + `bagno` + `elettrico` (lavori misti
 *    tipici del ristrutturatore generico).
 *  - `serramentista`, `tende_da_sole`, `vetrate`, `generico` → nessun preset
 *    auto-selezionato perché non esiste un listino manutenzione dedicato a
 *    quei settori; l'utente sceglierà manualmente se vuole comunque importare.
 *
 * Se in futuro si aggiungono nuovi preset (o nuovi vertical), aggiornare
 * questa mappa tenendo presente che un vertical può mappare a PIÙ preset
 * (vedi ristrutturazione).
 */
function getDefaultPresetsForVertical(vertical: Vertical): PresetListinoId[] {
  switch (vertical) {
    case "caldaie":
    case "clima":
      return ["termoidraulica"];
    case "tetti":
      return ["tetti_ripasso"];
    case "bagno":
      return ["bagno"];
    case "ristrutturazione":
      return ["pittura", "bagno", "elettrico"];
    case "serramentista":
    case "tende_da_sole":
    case "vetrate":
    case "generico":
    default:
      return [];
  }
}

interface ImpiantoSeed {
  nome: string;
  icona: string;
  ordine: number;
  presets: PresetListinoId[];
}

interface InterventoSeed {
  nome: string;
  categoria: CategoriaIntervento;
  durata_stimata_h: number;
  presets: PresetListinoId[];
}

interface TariffaListinoSeed {
  impianto: string;
  intervento: string;
  prezzo: number;
  unita: string;
  iva_pct: number;
  presets: PresetListinoId[];
}

/**
 * Catalogo impianti pre-compilato. Ogni riga ha uno o più `presets` che la
 * agganciano ai template. L'ordine è solo di default: l'utente può
 * riordinare in seguito.
 */
const STANDARD_IMPIANTI: ImpiantoSeed[] = [
  // Termoidraulica / elettrico (classici)
  { nome: "Caldaia",              icona: "🔥", ordine: 10,  presets: ["termoidraulica"] },
  { nome: "Condizionatore",       icona: "❄️", ordine: 20,  presets: ["termoidraulica", "bagno"] },
  { nome: "Impianto Idraulico",   icona: "💧", ordine: 30,  presets: ["termoidraulica", "bagno"] },
  { nome: "Pompa di calore",      icona: "🌡️", ordine: 35,  presets: ["termoidraulica"] },
  { nome: "Impianto Elettrico",   icona: "⚡", ordine: 40,  presets: ["elettrico", "bagno"] },
  { nome: "Quadro elettrico",     icona: "🔌", ordine: 45,  presets: ["elettrico"] },
  { nome: "Allarme / antifurto",  icona: "🚨", ordine: 50,  presets: ["elettrico"] },
  { nome: "Videosorveglianza",    icona: "📹", ordine: 55,  presets: ["elettrico"] },
  // Bagno
  { nome: "Sanitari",             icona: "🚽", ordine: 60,  presets: ["bagno"] },
  { nome: "Box doccia / vasca",   icona: "🛁", ordine: 65,  presets: ["bagno"] },
  { nome: "Rubinetteria",         icona: "🚿", ordine: 70,  presets: ["bagno"] },
  // Fotovoltaico
  { nome: "Impianto Fotovoltaico",icona: "☀️", ordine: 80,  presets: ["fotovoltaico"] },
  { nome: "Inverter FV",          icona: "🔋", ordine: 85,  presets: ["fotovoltaico"] },
  { nome: "Sistema di accumulo",  icona: "🔋", ordine: 90,  presets: ["fotovoltaico"] },
  // Pittura / pareti
  { nome: "Pareti interne",       icona: "🖌️", ordine: 100, presets: ["pittura"] },
  { nome: "Facciate esterne",     icona: "🏢", ordine: 105, presets: ["pittura"] },
  { nome: "Infissi in legno",     icona: "🚪", ordine: 110, presets: ["pittura"] },
  // Tetti
  { nome: "Copertura a falda",    icona: "🏠", ordine: 120, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  { nome: "Canali di gronda",     icona: "🌧️", ordine: 125, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  { nome: "Lucernari",            icona: "🪟", ordine: 130, presets: ["tetti_rifacimento"] },
  { nome: "Comignoli",            icona: "🏭", ordine: 135, presets: ["tetti_ripasso", "tetti_rifacimento"] },
  // Scavi
  { nome: "Area di cantiere",     icona: "⛏️", ordine: 140, presets: ["scavi"] },
  { nome: "Sottoservizi",         icona: "🚧", ordine: 145, presets: ["scavi"] },
  // Piscine
  { nome: "Vasca piscina",        icona: "🏊", ordine: 150, presets: ["piscine"] },
  { nome: "Impianto filtraggio",  icona: "⚙️", ordine: 155, presets: ["piscine"] },
  { nome: "Illuminazione piscina",icona: "💡", ordine: 160, presets: ["piscine"] },
];

/**
 * Catalogo interventi pre-compilato. Ciascun intervento ha un nome specifico
 * al contesto del preset (es. "Pulizia pannelli FV") così che nel listino
 * risulti chiaro quale servizio stiamo offrendo.
 */
const STANDARD_INTERVENTI: InterventoSeed[] = [
  // Generici (termoidraulica + elettrico)
  { nome: "Manutenzione ordinaria", categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "piscine"] },
  { nome: "Riparazione guasto",     categoria: "guasto",                     durata_stimata_h: 3, presets: ["termoidraulica", "elettrico", "bagno"] },
  { nome: "Sopralluogo",            categoria: "sopralluogo",                durata_stimata_h: 1, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "pittura", "tetti_ripasso", "tetti_rifacimento", "scavi", "piscine"] },
  { nome: "Installazione",          categoria: "installazione",              durata_stimata_h: 6, presets: ["termoidraulica", "elettrico", "bagno", "fotovoltaico", "piscine"] },
  // Fotovoltaico specifici
  { nome: "Pulizia pannelli FV",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 3, presets: ["fotovoltaico"] },
  { nome: "Controllo producibilità",categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["fotovoltaico"] },
  { nome: "Sostituzione inverter",  categoria: "guasto",                     durata_stimata_h: 4, presets: ["fotovoltaico"] },
  // Pittura specifici
  { nome: "Ritocco localizzato",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["pittura"] },
  { nome: "Tinteggiatura completa", categoria: "installazione",              durata_stimata_h: 8, presets: ["pittura"] },
  { nome: "Rasatura + stucco",      categoria: "installazione",              durata_stimata_h: 4, presets: ["pittura"] },
  // Tetti ripasso
  { nome: "Pulizia canali",         categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["tetti_ripasso"] },
  { nome: "Ripasso coppi",          categoria: "manutenzione_straordinaria", durata_stimata_h: 4, presets: ["tetti_ripasso"] },
  { nome: "Trattamento antimuschio",categoria: "manutenzione_ordinaria",     durata_stimata_h: 3, presets: ["tetti_ripasso"] },
  { nome: "Sostituzione coppi rotti", categoria: "guasto",                   durata_stimata_h: 2, presets: ["tetti_ripasso"] },
  // Tetti rifacimento
  { nome: "Rimozione manto",        categoria: "installazione",              durata_stimata_h: 8, presets: ["tetti_rifacimento"] },
  { nome: "Posa nuovo manto",       categoria: "installazione",              durata_stimata_h: 10,presets: ["tetti_rifacimento"] },
  { nome: "Impermeabilizzazione",   categoria: "installazione",              durata_stimata_h: 6, presets: ["tetti_rifacimento", "piscine", "bagno"] },
  // Scavi
  { nome: "Sbancamento",            categoria: "installazione",              durata_stimata_h: 8, presets: ["scavi"] },
  { nome: "Scavo fondazione",       categoria: "installazione",              durata_stimata_h: 6, presets: ["scavi"] },
  { nome: "Reinterro",              categoria: "installazione",              durata_stimata_h: 4, presets: ["scavi"] },
  // Piscine
  { nome: "Apertura stagionale",    categoria: "manutenzione_ordinaria",     durata_stimata_h: 4, presets: ["piscine"] },
  { nome: "Chiusura invernale",     categoria: "manutenzione_ordinaria",     durata_stimata_h: 4, presets: ["piscine"] },
  { nome: "Pulizia vasca",          categoria: "manutenzione_ordinaria",     durata_stimata_h: 2, presets: ["piscine"] },
  { nome: "Controllo pH e clorazione", categoria: "manutenzione_ordinaria",  durata_stimata_h: 1, presets: ["piscine"] },
];

/**
 * Catalogo tariffe standard. Ogni riga è una coppia impianto × intervento
 * con prezzo di riferimento. Solo le tariffe con tutti e tre i campi
 * (impianto, intervento, prezzo) saranno inserite; se mancano
 * impianti/interventi del preset, vengono creati contestualmente.
 */
const STANDARD_TARIFFE_LISTINO: TariffaListinoSeed[] = [
  // ─── TERMOIDRAULICA ─────────────────────────────────────────────────────────
  { impianto: "Caldaia",            intervento: "Manutenzione ordinaria", prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Caldaia",            intervento: "Riparazione guasto",     prezzo: 80,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Caldaia",            intervento: "Sopralluogo",            prezzo: 60,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Manutenzione ordinaria", prezzo: 90,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Riparazione guasto",     prezzo: 90,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Condizionatore",     intervento: "Installazione",          prezzo: 280, unita: "intervento", iva_pct: 10, presets: ["termoidraulica"] },
  { impianto: "Impianto Idraulico", intervento: "Riparazione guasto",     prezzo: 75,  unita: "ora",        iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Impianto Idraulico", intervento: "Sopralluogo",            prezzo: 55,  unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Pompa di calore",    intervento: "Manutenzione ordinaria", prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["termoidraulica"] },
  { impianto: "Pompa di calore",    intervento: "Installazione",          prezzo: 850, unita: "intervento", iva_pct: 10, presets: ["termoidraulica"] },

  // ─── ELETTRICO ──────────────────────────────────────────────────────────────
  { impianto: "Impianto Elettrico", intervento: "Manutenzione ordinaria", prezzo: 95,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Impianto Elettrico", intervento: "Riparazione guasto",     prezzo: 70,  unita: "ora",        iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Impianto Elettrico", intervento: "Sopralluogo",            prezzo: 55,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Quadro elettrico",   intervento: "Installazione",          prezzo: 450, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Allarme / antifurto",intervento: "Installazione",          prezzo: 650, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Allarme / antifurto",intervento: "Manutenzione ordinaria", prezzo: 80,  unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Videosorveglianza",  intervento: "Installazione",          prezzo: 850, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },
  { impianto: "Videosorveglianza",  intervento: "Manutenzione ordinaria", prezzo: 110, unita: "intervento", iva_pct: 22, presets: ["elettrico"] },

  // ─── BAGNO ──────────────────────────────────────────────────────────────────
  { impianto: "Sanitari",           intervento: "Installazione",          prezzo: 320, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Sanitari",           intervento: "Riparazione guasto",     prezzo: 85,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Installazione",          prezzo: 380, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Riparazione guasto",     prezzo: 75,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Rubinetteria",       intervento: "Installazione",          prezzo: 85,  unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Rubinetteria",       intervento: "Riparazione guasto",     prezzo: 65,  unita: "ora",        iva_pct: 22, presets: ["bagno"] },
  { impianto: "Impianto Idraulico", intervento: "Installazione",          prezzo: 550, unita: "intervento", iva_pct: 10, presets: ["bagno"] },
  { impianto: "Box doccia / vasca", intervento: "Impermeabilizzazione",   prezzo: 35,  unita: "mq",         iva_pct: 10, presets: ["bagno"] },

  // ─── FOTOVOLTAICO ───────────────────────────────────────────────────────────
  { impianto: "Impianto Fotovoltaico", intervento: "Manutenzione ordinaria", prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Pulizia pannelli FV",    prezzo: 6,   unita: "mq",         iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Controllo producibilità",prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Impianto Fotovoltaico", intervento: "Installazione",          prezzo: 1800,unita: "intervento", iva_pct: 10, presets: ["fotovoltaico"] },
  { impianto: "Inverter FV",           intervento: "Sostituzione inverter",  prezzo: 380, unita: "intervento", iva_pct: 22, presets: ["fotovoltaico"] },
  { impianto: "Sistema di accumulo",   intervento: "Installazione",          prezzo: 1200,unita: "intervento", iva_pct: 10, presets: ["fotovoltaico"] },

  // ─── PITTURA ────────────────────────────────────────────────────────────────
  { impianto: "Pareti interne",     intervento: "Tinteggiatura completa", prezzo: 9,   unita: "mq",         iva_pct: 22, presets: ["pittura"] },
  { impianto: "Pareti interne",     intervento: "Ritocco localizzato",    prezzo: 85,  unita: "intervento", iva_pct: 22, presets: ["pittura"] },
  { impianto: "Pareti interne",     intervento: "Rasatura + stucco",      prezzo: 12,  unita: "mq",         iva_pct: 22, presets: ["pittura"] },
  { impianto: "Facciate esterne",   intervento: "Tinteggiatura completa", prezzo: 16,  unita: "mq",         iva_pct: 10, presets: ["pittura"] },
  { impianto: "Facciate esterne",   intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["pittura"] },
  { impianto: "Infissi in legno",   intervento: "Tinteggiatura completa", prezzo: 32,  unita: "mq",         iva_pct: 22, presets: ["pittura"] },

  // ─── RIPASSO TETTI ──────────────────────────────────────────────────────────
  { impianto: "Copertura a falda",  intervento: "Ripasso coppi",          prezzo: 18,  unita: "mq",         iva_pct: 10, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Sostituzione coppi rotti",prezzo: 8,  unita: "pz",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Trattamento antimuschio",prezzo: 6,   unita: "mq",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Canali di gronda",   intervento: "Pulizia canali",         prezzo: 4,   unita: "ml",         iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Comignoli",          intervento: "Riparazione guasto",     prezzo: 140, unita: "intervento", iva_pct: 22, presets: ["tetti_ripasso"] },
  { impianto: "Copertura a falda",  intervento: "Sopralluogo",            prezzo: 120, unita: "intervento", iva_pct: 22, presets: ["tetti_ripasso", "tetti_rifacimento"] },

  // ─── RIFACIMENTO TETTI ──────────────────────────────────────────────────────
  { impianto: "Copertura a falda",  intervento: "Rimozione manto",        prezzo: 14,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Copertura a falda",  intervento: "Posa nuovo manto",       prezzo: 28,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Copertura a falda",  intervento: "Impermeabilizzazione",   prezzo: 18,  unita: "mq",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Canali di gronda",   intervento: "Installazione",          prezzo: 32,  unita: "ml",         iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Lucernari",          intervento: "Installazione",          prezzo: 280, unita: "intervento", iva_pct: 10, presets: ["tetti_rifacimento"] },
  { impianto: "Comignoli",          intervento: "Installazione",          prezzo: 180, unita: "intervento", iva_pct: 10, presets: ["tetti_rifacimento"] },

  // ─── SCAVI ──────────────────────────────────────────────────────────────────
  { impianto: "Area di cantiere",   intervento: "Sopralluogo",            prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Sbancamento",            prezzo: 14,  unita: "mq",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Scavo fondazione",       prezzo: 28,  unita: "ml",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Area di cantiere",   intervento: "Reinterro",              prezzo: 9,   unita: "mq",         iva_pct: 10, presets: ["scavi"] },
  { impianto: "Sottoservizi",       intervento: "Installazione",          prezzo: 32,  unita: "ml",         iva_pct: 10, presets: ["scavi"] },

  // ─── PISCINE ────────────────────────────────────────────────────────────────
  { impianto: "Vasca piscina",      intervento: "Sopralluogo",            prezzo: 250, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Installazione",          prezzo: 12000,unita: "intervento",iva_pct: 10, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Impermeabilizzazione",   prezzo: 45,  unita: "mq",         iva_pct: 10, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Apertura stagionale",    prezzo: 180, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Chiusura invernale",     prezzo: 160, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Pulizia vasca",          prezzo: 95,  unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Vasca piscina",      intervento: "Controllo pH e clorazione", prezzo: 60, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Impianto filtraggio",intervento: "Manutenzione ordinaria", prezzo: 140, unita: "intervento", iva_pct: 22, presets: ["piscine"] },
  { impianto: "Impianto filtraggio",intervento: "Installazione",          prezzo: 1800,unita: "intervento", iva_pct: 10, presets: ["piscine"] },
  { impianto: "Illuminazione piscina", intervento: "Installazione",       prezzo: 180, unita: "intervento", iva_pct: 10, presets: ["piscine"] },
];

/**
 * Definizione dei preset listino. Ogni card descrive un pacchetto di
 * impianti + interventi + tariffe coerenti con un contesto specifico.
 */
const PRESET_LISTINO_CARDS: Array<{
  id: PresetListinoId;
  nome: string;
  descrizione: string;
  icon: typeof Sparkles;
  iconClass: string;
}> = [
  {
    id: "termoidraulica",
    nome: "Termoidraulica",
    descrizione: "Caldaie, condizionatori, pompe di calore e impianto idraulico — set classico assistenza termoidraulica.",
    icon: Flame,
    iconClass: "bg-orange-100 text-orange-700",
  },
  {
    id: "elettrico",
    nome: "Elettrico & sicurezza",
    descrizione: "Impianti elettrici, quadri, allarmi e videosorveglianza con tariffe di manutenzione e installazione.",
    icon: ZapIcon,
    iconClass: "bg-yellow-100 text-yellow-700",
  },
  {
    id: "bagno",
    nome: "Ristrutturazione bagno",
    descrizione: "Sanitari, box doccia, rubinetterie + impermeabilizzazioni — il pacchetto completo per un bagno nuovo.",
    icon: Bath,
    iconClass: "bg-cyan-100 text-cyan-700",
  },
  {
    id: "fotovoltaico",
    nome: "Fotovoltaico",
    descrizione: "Installazione + manutenzione pannelli, pulizia, controllo producibilità, sostituzione inverter, accumulo.",
    icon: Sun,
    iconClass: "bg-amber-100 text-amber-700",
  },
  {
    id: "pittura",
    nome: "Pittura e decorazioni",
    descrizione: "Tinteggiature interne/esterne, rasature, stucchi, verniciatura infissi — tariffe al mq e a corpo.",
    icon: PaintBucket,
    iconClass: "bg-fuchsia-100 text-fuchsia-700",
  },
  {
    id: "tetti_ripasso",
    nome: "Ripasso tetti",
    descrizione: "Manutenzione coperture: ripasso coppi, pulizia canali, antimuschio, sostituzioni puntuali.",
    icon: Cloud,
    iconClass: "bg-sky-100 text-sky-700",
  },
  {
    id: "tetti_rifacimento",
    nome: "Rifacimento tetti",
    descrizione: "Rimozione manto, posa nuovo manto, impermeabilizzazione, lucernari, comignoli, canali.",
    icon: Construction,
    iconClass: "bg-stone-200 text-stone-700",
  },
  {
    id: "scavi",
    nome: "Scavi a terra",
    descrizione: "Sbancamento, scavo fondazione, reinterro, sottoservizi — tariffe al mq e al metro lineare.",
    icon: Shovel,
    iconClass: "bg-amber-100 text-amber-800",
  },
  {
    id: "piscine",
    nome: "Realizzazione piscine",
    descrizione: "Costruzione vasca + impermeabilizzazione + apertura/chiusura stagionale + impianto filtraggio.",
    icon: Waves,
    iconClass: "bg-teal-100 text-teal-700",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoriaBadge(cat: CategoriaIntervento | null) {
  const found = CATEGORIE_INTERVENTO.find((c) => c.value === cat);
  return found ?? { label: cat ?? "—", color: "bg-gray-100 text-gray-700" };
}

// ─── TipiImpianto Dialog ──────────────────────────────────────────────────────

function ImpiantoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoImpianto | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [icona, setIcona] = useState(editing?.icona ?? "🔧");
  const [ordine, setOrdine] = useState(String(editing?.ordine ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        icona: icona || null,
        ordine: ordine.trim() !== "" ? parseInt(ordine, 10) : null,
        attivo,
      };
      if (editing) {
        const { error } = await (supabase.from("tipi_impianto") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("tipi_impianto") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo impianto aggiornato" : "Tipo impianto creato");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo impianto" : "Nuovo tipo impianto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Caldaia" />
          </div>
          <div>
            <Label>Icona</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {ICONE_IMPIANTO.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcona(ic)}
                  className={`text-xl p-1.5 rounded border-2 transition-colors ${
                    icona === ic ? "border-orange-500 bg-orange-50" : "border-transparent hover:border-gray-200"
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordine</Label>
              <Input
                type="number" min="0"
                value={ordine}
                onChange={(e) => setOrdine(e.target.value)}
                placeholder="1"
              />
            </div>
            <div className="flex flex-col gap-2 justify-end">
              <Label>Attivo</Label>
              <Switch checked={attivo} onCheckedChange={setAttivo} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── TipiIntervento Dialog ────────────────────────────────────────────────────

function InterventoDialog({
  open, onClose, editing, companyId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: TipoIntervento | null;
  companyId: string; onSaved: () => void;
}) {
  const [nome, setNome] = useState(editing?.nome ?? "");
  const [categoria, setCategoria] = useState<CategoriaIntervento>(editing?.categoria ?? "manutenzione_ordinaria");
  const [durata, setDurata] = useState(String(editing?.durata_stimata_h ?? ""));
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!nome.trim()) { toast.error("Il nome è obbligatorio"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        nome: nome.trim(),
        categoria,
        durata_stimata_h: durata.trim() !== "" ? parseFloat(durata) : null,
        attivo,
      };
      if (editing) {
        const { error } = await (supabase.from("tipi_intervento") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("tipi_intervento") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tipo intervento aggiornato" : "Tipo intervento creato");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tipo intervento" : "Nuovo tipo intervento"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Manutenzione ordinaria" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={(v) => setCategoria(v as CategoriaIntervento)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIE_INTERVENTO.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Durata stimata (h)</Label>
              <Input
                type="number" min="0" step="0.5"
                value={durata}
                onChange={(e) => setDurata(e.target.value)}
                placeholder="2"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Label>Attivo</Label>
            <Switch checked={attivo} onCheckedChange={setAttivo} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Listino Dialog ───────────────────────────────────────────────────────────

function ListinoDialog({
  open, onClose, editing, companyId, tipiImpianto, tipiIntervento, onSaved,
}: {
  open: boolean; onClose: () => void; editing: ListinoPrezzo | null;
  companyId: string;
  tipiImpianto: TipoImpianto[];
  tipiIntervento: TipoIntervento[];
  onSaved: () => void;
}) {
  const [impiantoId, setImpiantoId] = useState(editing?.tipo_impianto_id ?? "");
  const [interventoId, setInterventoId] = useState(editing?.tipo_intervento_id ?? "");
  const [prezzo, setPrezzo] = useState(String(editing?.prezzo_base ?? ""));
  const [iva, setIva] = useState(String(editing?.iva_percentuale ?? "22"));
  const [unita, setUnita] = useState(editing?.unita ?? "intervento");
  const [attivo, setAttivo] = useState(editing?.attivo ?? true);
  const [note, setNote] = useState(editing?.note ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!impiantoId) { toast.error("Seleziona un tipo impianto"); return; }
    if (!interventoId) { toast.error("Seleziona un tipo intervento"); return; }
    if (!prezzo.trim() || isNaN(parseFloat(prezzo))) { toast.error("Inserisci un prezzo valido"); return; }
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        tipo_impianto_id: impiantoId,
        tipo_intervento_id: interventoId,
        prezzo_base: parseFloat(prezzo),
        iva_percentuale: parseInt(iva, 10),
        unita,
        attivo,
        note: note.trim() || null,
      };
      if (editing) {
        const { error } = await (supabase.from("listino_prezzi") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("listino_prezzi") as any).insert(payload);
        if (error) throw error;
      }
      toast.success(editing ? "Tariffa aggiornata" : "Tariffa creata");
      onSaved(); onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifica tariffa" : "Nuova tariffa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo impianto *</Label>
            <Select value={impiantoId} onValueChange={setImpiantoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona impianto..." /></SelectTrigger>
              <SelectContent>
                {tipiImpianto.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.icona ? `${t.icona} ` : ""}{t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo intervento *</Label>
            <Select value={interventoId} onValueChange={setInterventoId} disabled={!!editing}>
              <SelectTrigger><SelectValue placeholder="Seleziona intervento..." /></SelectTrigger>
              <SelectContent>
                {tipiIntervento.filter((t) => t.attivo).map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Prezzo €</Label>
              <Input
                type="number" min="0" step="0.01"
                value={prezzo}
                onChange={(e) => setPrezzo(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>IVA %</Label>
              <Select value={iva} onValueChange={setIva}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {IVA_OPTIONS.map((v) => (
                    <SelectItem key={v} value={String(v)}>{v}%</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unità</Label>
              <Select value={unita} onValueChange={setUnita}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITA_OPTIONS.map((u) => (
                    <SelectItem key={u} value={u}>{UNITA_LABEL[u]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Note (opzionale)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Es. tariffa valida solo fuori orario"
            />
          </div>
          <div className="flex items-center gap-3">
            <Label>Tariffa attiva</Label>
            <Switch checked={attivo} onCheckedChange={setAttivo} />
            <span className="text-xs text-muted-foreground">
              {attivo ? "Visibile in preventivi e interventi" : "Nascosta (bozza)"}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ListinoManutenzione() {
  const { effectiveCompany, role } = useAuth();
  const { vertical } = useVertical();
  const companyId = effectiveCompany?.id as string | undefined;
  const queryClient = useQueryClient();
  // Solo admin azienda (e super admin) possono editare prezzi/tariffe. Un
  // commerciale non ha mai titolo per modificare il listino: vedrebbe UI ma
  // tutti i write fallirebbero via RLS generando solo toast di errore.
  const isAdmin = role === "company_admin" || role === "super_admin";

  const [activeTab, setActiveTab] = useState("impianti");

  // Impianti state
  const [impiantoDialogOpen, setImpiantoDialogOpen] = useState(false);
  const [editingImpianto, setEditingImpianto] = useState<TipoImpianto | null>(null);
  const [deleteImpiantoId, setDeleteImpiantoId] = useState<string | null>(null);

  // Interventi state
  const [interventoDialogOpen, setInterventoDialogOpen] = useState(false);
  const [editingIntervento, setEditingIntervento] = useState<TipoIntervento | null>(null);
  const [deleteInterventoId, setDeleteInterventoId] = useState<string | null>(null);

  // Listino state
  const [listinoDialogOpen, setListinoDialogOpen] = useState(false);
  const [editingListino, setEditingListino] = useState<ListinoPrezzo | null>(null);
  const [deleteListinoId, setDeleteListinoId] = useState<string | null>(null);

  // Template seed state
  const [creatingDemo, setCreatingDemo] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: tipiImpianto = [], isLoading: loadingImpianti } = useQuery({
    queryKey: ["tipi-impianto", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tipi_impianto") as any)
        .select("id, company_id, nome, icona, ordine, attivo")
        .eq("company_id", companyId)
        .order("ordine", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as TipoImpianto[];
    },
  });

  const { data: tipiIntervento = [], isLoading: loadingInterventi } = useQuery({
    queryKey: ["tipi-intervento", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("tipi_intervento") as any)
        .select("id, company_id, nome, categoria, durata_stimata_h, attivo")
        .eq("company_id", companyId)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as TipoIntervento[];
    },
  });

  const { data: listino = [], isLoading: loadingListino } = useQuery({
    queryKey: ["listino-prezzi", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase.from("listino_prezzi") as any)
        .select(`
          id, company_id, tipo_impianto_id, tipo_intervento_id,
          prezzo_base, iva_percentuale, unita, attivo, note, valido_dal, valido_al,
          tipo_impianto:tipi_impianto(id, nome, icona),
          tipo_intervento:tipi_intervento(id, nome)
        `)
        .eq("company_id", companyId)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ListinoPrezzo[];
    },
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const deleteImpiantoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("tipi_impianto") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      toast.success("Tipo impianto eliminato");
      setDeleteImpiantoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteInterventoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("tipi_intervento") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      toast.success("Tipo intervento eliminato");
      setDeleteInterventoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteListinoMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("listino_prezzi") as any)
        .delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });
      toast.success("Tariffa eliminata");
      setDeleteListinoId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Template seed ────────────────────────────────────────────────────────
  /**
   * Importa un sottoinsieme del catalogo standard (impianti + interventi +
   * tariffe) filtrato per una selezione di preset e/o una selezione fine di
   * singole tariffe. La funzione è idempotente: voci già presenti (matching
   * per `nome` per impianti/interventi e per la coppia impianto-intervento
   * per il listino) vengono saltate, così l'operazione è sicura anche se
   * rilanciata a valle di un'importazione parziale.
   */
  const seedFromTemplate = async (params: {
    selectedPresets: PresetListinoId[];
    selectedTariffeKeys?: Set<string>; // `${impianto}::${intervento}` — override puntuale
  }) => {
    if (!companyId) return;
    // M3 (audit): guard lato parent. Se creatingDemo è già true (click rapido
    // che scavalca il disabled), evitiamo il secondo batch in corso.
    if (creatingDemo) return;
    const { selectedPresets, selectedTariffeKeys } = params;

    // Se l'utente ha selezionato esplicitamente singole tariffe, usiamo quelle;
    // altrimenti prendiamo tutte le tariffe dei preset attivi.
    const tariffeTarget = selectedTariffeKeys && selectedTariffeKeys.size > 0
      ? STANDARD_TARIFFE_LISTINO.filter((t) =>
          selectedTariffeKeys.has(`${t.impianto}::${t.intervento}`))
      : STANDARD_TARIFFE_LISTINO.filter((t) =>
          t.presets.some((p) => selectedPresets.includes(p)));

    if (tariffeTarget.length === 0) {
      toast.info("Nessuna tariffa selezionata");
      return;
    }

    // Impianti e interventi necessari: solo quelli referenziati dalle tariffe
    // selezionate (così non creiamo righe inutili).
    const impiantiNomi = new Set(tariffeTarget.map((t) => t.impianto));
    const interventiNomi = new Set(tariffeTarget.map((t) => t.intervento));

    setCreatingDemo(true);
    try {
      // 1. Inserisci gli impianti mancanti
      const existingImpNomi = new Set(tipiImpianto.map((t) => t.nome));
      const impiantiToInsert = STANDARD_IMPIANTI
        .filter((d) => impiantiNomi.has(d.nome) && !existingImpNomi.has(d.nome))
        .map((d) => ({
          company_id: companyId,
          nome: d.nome,
          icona: d.icona,
          ordine: d.ordine,
          attivo: true,
        }));

      let insertedImpianti: TipoImpianto[] = [];
      if (impiantiToInsert.length > 0) {
        const { data, error } = await (supabase.from("tipi_impianto") as any)
          .insert(impiantiToInsert).select("id, nome");
        if (error) throw error;
        insertedImpianti = (data ?? []) as TipoImpianto[];
      }

      // 2. Inserisci gli interventi mancanti
      const existingIntNomi = new Set(tipiIntervento.map((t) => t.nome));
      const interventiToInsert = STANDARD_INTERVENTI
        .filter((d) => interventiNomi.has(d.nome) && !existingIntNomi.has(d.nome))
        .map((d) => ({
          company_id: companyId,
          nome: d.nome,
          categoria: d.categoria,
          durata_stimata_h: d.durata_stimata_h,
          attivo: true,
        }));

      let insertedInterventi: TipoIntervento[] = [];
      if (interventiToInsert.length > 0) {
        const { data, error } = await (supabase.from("tipi_intervento") as any)
          .insert(interventiToInsert).select("id, nome");
        if (error) throw error;
        insertedInterventi = (data ?? []) as TipoIntervento[];
      }

      // 3. Build lookup: esistenti + appena inseriti
      const impByNome = new Map<string, string>([
        ...tipiImpianto.map((t) => [t.nome, t.id] as const),
        ...insertedImpianti.map((t) => [t.nome, t.id] as const),
      ]);
      const intByNome = new Map<string, string>([
        ...tipiIntervento.map((t) => [t.nome, t.id] as const),
        ...insertedInterventi.map((t) => [t.nome, t.id] as const),
      ]);

      // 4. Inserisci le tariffe evitando duplicati
      const existingKeys = new Set(
        listino.map((l) => `${l.tipo_impianto_id}::${l.tipo_intervento_id}`),
      );

      const listinoToInsert = tariffeTarget
        .map((d) => {
          const impId = impByNome.get(d.impianto);
          const intId = intByNome.get(d.intervento);
          if (!impId || !intId) return null;
          const key = `${impId}::${intId}`;
          if (existingKeys.has(key)) return null;
          return {
            company_id: companyId,
            tipo_impianto_id: impId,
            tipo_intervento_id: intId,
            prezzo_base: d.prezzo,
            iva_percentuale: d.iva_pct,
            unita: d.unita,
            attivo: true,
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (listinoToInsert.length > 0) {
        const { error } = await (supabase.from("listino_prezzi") as any)
          .insert(listinoToInsert);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
      queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
      queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });

      const totale = impiantiToInsert.length + interventiToInsert.length + listinoToInsert.length;
      if (totale === 0) {
        toast.info("Tutti gli elementi del template sono già presenti");
      } else {
        toast.success(
          `Template importato: ${impiantiToInsert.length} impianti, ${interventiToInsert.length} interventi, ${listinoToInsert.length} tariffe`,
        );
      }
      setTemplateDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreatingDemo(false);
    }
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] });
    queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] });
    queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] });
  };

  if (!companyId) return null;

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">Accesso riservato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Solo l&apos;amministratore dell&apos;azienda può modificare il
              listino manutenzione. Se devi aggiornare un prezzo, chiedi al
              titolare di farlo da questa pagina.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header pattern h-10 w-10 bg-primary/10 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold leading-tight">Listino Prezzi Manutenzione</h1>
            <p className="text-sm text-muted-foreground">
              Tipi di impianto, tipi di intervento e listino prezzi. Usati dal modulo Manutenzione
              per calcolare automaticamente i preventivi di intervento.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTemplateDialogOpen(true)}
          disabled={creatingDemo}
          className="shrink-0"
        >
          <Sparkles className="h-4 w-4 mr-1.5" />
          {creatingDemo ? "Importazione..." : "Importa da template"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="impianti">
            Tipi Impianto
            {tipiImpianto.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiImpianto.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="interventi">
            Tipi Intervento
            {tipiIntervento.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{tipiIntervento.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="tariffe">
            Tariffe
            {listino.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs">{listino.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Tipi Impianto ── */}
        <TabsContent value="impianti" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingImpianto(null); setImpiantoDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />Nuovo impianto
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Icona</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-20">Ordine</TableHead>
                  <TableHead className="w-20">Attivo</TableHead>
                  <TableHead className="text-right w-24">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingImpianti ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : tipiImpianto.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nessun tipo impianto. Aggiungine uno o clicca "Importa da template".
                    </TableCell>
                  </TableRow>
                ) : tipiImpianto.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xl">{t.icona ?? "🔧"}</TableCell>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="text-muted-foreground">{t.ordine ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.attivo ? "default" : "secondary"}>
                        {t.attivo ? "Attivo" : "Disattivo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost" size="icon"
                          onClick={() => { setEditingImpianto(t); setImpiantoDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          className="text-destructive"
                          onClick={() => setDeleteImpiantoId(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 2: Tipi Intervento ── */}
        <TabsContent value="interventi" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingIntervento(null); setInterventoDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1" />Nuovo intervento
            </Button>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-36">Categoria</TableHead>
                  <TableHead className="w-36">Durata stimata</TableHead>
                  <TableHead className="w-20">Attivo</TableHead>
                  <TableHead className="text-right w-24">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingInterventi ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Caricamento...
                    </TableCell>
                  </TableRow>
                ) : tipiIntervento.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nessun tipo intervento. Aggiungine uno o clicca "Importa da template".
                    </TableCell>
                  </TableRow>
                ) : tipiIntervento.map((t) => {
                  const cat = categoriaBadge(t.categoria);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.nome}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                          {cat.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.durata_stimata_h != null ? `${t.durata_stimata_h}h` : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.attivo ? "default" : "secondary"}>
                          {t.attivo ? "Attivo" : "Disattivo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setEditingIntervento(t); setInterventoDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive"
                            onClick={() => setDeleteInterventoId(t.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Tab 3: Tariffe ── */}
        <TabsContent value="tariffe" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={() => { setEditingListino(null); setListinoDialogOpen(true); }}
              disabled={tipiImpianto.length === 0 || tipiIntervento.length === 0}
            >
              <Plus className="h-4 w-4 mr-1" />Nuova tariffa
            </Button>
          </div>
          {tipiImpianto.length === 0 || tipiIntervento.length === 0 ? (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
              Aggiungi prima almeno un tipo impianto e un tipo intervento, oppure clicca "Importa da template".
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Impianto</TableHead>
                    <TableHead>Intervento</TableHead>
                    <TableHead className="w-28">Prezzo</TableHead>
                    <TableHead className="w-16">IVA</TableHead>
                    <TableHead className="w-28">Unità</TableHead>
                    <TableHead className="text-right w-24">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingListino ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Caricamento...
                      </TableCell>
                    </TableRow>
                  ) : listino.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        Nessuna tariffa configurata. Aggiungine una o clicca "Importa da template".
                      </TableCell>
                    </TableRow>
                  ) : listino.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">
                        {l.tipo_impianto
                          ? `${l.tipo_impianto.icona ?? ""} ${l.tipo_impianto.nome}`.trim()
                          : <span className="text-muted-foreground italic">—</span>
                        }
                      </TableCell>
                      <TableCell>
                        {l.tipo_intervento?.nome ?? <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        {l.prezzo_base != null && l.prezzo_base > 0
                          ? formatCurrency(l.prezzo_base)
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-200">€0</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.iva_percentuale ?? 22}%</TableCell>
                      <TableCell className="text-muted-foreground">{l.unita}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => { setEditingListino(l); setListinoDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="text-destructive"
                            onClick={() => setDeleteListinoId(l.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialogs ── */}

      {impiantoDialogOpen && (
        <ImpiantoDialog
          key={editingImpianto?.id ?? "new-impianto"}
          open={impiantoDialogOpen}
          onClose={() => setImpiantoDialogOpen(false)}
          editing={editingImpianto}
          companyId={companyId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tipi-impianto", companyId] })}
        />
      )}

      {interventoDialogOpen && (
        <InterventoDialog
          key={editingIntervento?.id ?? "new-intervento"}
          open={interventoDialogOpen}
          onClose={() => setInterventoDialogOpen(false)}
          editing={editingIntervento}
          companyId={companyId}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["tipi-intervento", companyId] })}
        />
      )}

      {listinoDialogOpen && (
        <ListinoDialog
          key={editingListino?.id ?? "new-listino"}
          open={listinoDialogOpen}
          onClose={() => setListinoDialogOpen(false)}
          editing={editingListino}
          companyId={companyId}
          tipiImpianto={tipiImpianto}
          tipiIntervento={tipiIntervento}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["listino-prezzi", companyId] })}
        />
      )}

      {/* ── Delete Confirmations ── */}

      {/* m1 (audit): counter cascade — quante tariffe di listino saranno
          impattate dall'eliminazione del tipo. Calcoliamo client-side sul
          `listino` già caricato. Post-B2 il DB ha FK RESTRICT, quindi
          l'eliminazione con count > 0 fallirà con errore 23503 — preveniamo
          lato UI mostrando il counter e disabilitando il button. */}
      <AlertDialog open={!!deleteImpiantoId} onOpenChange={(v) => !v && setDeleteImpiantoId(null)}>
        <AlertDialogContent>
          {(() => {
            const impiantoInUso = listino.filter((l) => l.tipo_impianto_id === deleteImpiantoId).length;
            const blocked = impiantoInUso > 0;
            const impiantoNome = tipiImpianto.find((t) => t.id === deleteImpiantoId)?.nome ?? "questo tipo";
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina tipo impianto</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">Impossibile eliminare.</span>{" "}
                        Ci sono <strong>{impiantoInUso}</strong>{" "}
                        {impiantoInUso === 1 ? "tariffa di listino associata" : "tariffe di listino associate"} a
                        {" "}<em>{impiantoNome}</em>.
                        Rimuovi prima le tariffe, oppure <strong>disattiva</strong> il tipo dall'interruttore in lista
                        (il tipo non compare più nel preventivatore ma preserva lo storico).
                      </>
                    ) : (
                      <>Questa azione è irreversibile. Nessuna tariffa è attualmente collegata a <em>{impiantoNome}</em>.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => !blocked && deleteImpiantoId && deleteImpiantoMutation.mutate(deleteImpiantoId)}
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteInterventoId} onOpenChange={(v) => !v && setDeleteInterventoId(null)}>
        <AlertDialogContent>
          {(() => {
            const interventoInUso = listino.filter((l) => l.tipo_intervento_id === deleteInterventoId).length;
            const blocked = interventoInUso > 0;
            const interventoNome = tipiIntervento.find((t) => t.id === deleteInterventoId)?.nome ?? "questo tipo";
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina tipo intervento</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blocked ? (
                      <>
                        <span className="text-rose-700 font-medium">Impossibile eliminare.</span>{" "}
                        Ci sono <strong>{interventoInUso}</strong>{" "}
                        {interventoInUso === 1 ? "tariffa di listino associata" : "tariffe di listino associate"} a
                        {" "}<em>{interventoNome}</em>.
                        Rimuovi prima le tariffe, oppure <strong>disattiva</strong> il tipo.
                      </>
                    ) : (
                      <>Questa azione è irreversibile. Nessuna tariffa è attualmente collegata a <em>{interventoNome}</em>.</>
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground"
                    disabled={blocked}
                    onClick={() => !blocked && deleteInterventoId && deleteInterventoMutation.mutate(deleteInterventoId)}
                  >
                    Elimina
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteListinoId} onOpenChange={(v) => !v && setDeleteListinoId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina tariffa</AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è irreversibile. La tariffa verrà rimossa definitivamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteListinoId && deleteListinoMutation.mutate(deleteListinoId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Template picker ── */}
      {templateDialogOpen && (
        <StandardListinoDialog
          open={templateDialogOpen}
          onClose={() => setTemplateDialogOpen(false)}
          existingCount={tipiImpianto.length + tipiIntervento.length + listino.length}
          onImport={seedFromTemplate}
          importing={creatingDemo}
          vertical={vertical}
        />
      )}
    </div>
  );
}

// ─── Standard Listino Dialog (template picker) ────────────────────────────────
/**
 * Dialog "Importa da template" speculare a StandardTariffeDialog di
 * SettingsTariffe. Permette all'admin di:
 *  - scegliere uno o più preset professionali (card cliccabili) → importa in
 *    blocco tutte le tariffe coerenti con quel preset.
 *  - oppure accedere alla lista fine di tutte le ~70 tariffe standard e
 *    selezionare con checkbox quelle di interesse.
 *
 * La funzione di import è idempotente: voci già presenti vengono saltate.
 */
function StandardListinoDialog({
  open, onClose, existingCount, onImport, importing, vertical,
}: {
  open: boolean;
  onClose: () => void;
  existingCount: number;
  onImport: (params: {
    selectedPresets: PresetListinoId[];
    selectedTariffeKeys?: Set<string>;
  }) => void | Promise<void>;
  importing: boolean;
  /** Vertical dell'azienda corrente — usato per pre-selezionare i preset
   *  "giusti" quando l'utente apre il dialog per la prima volta. */
  vertical: Vertical;
}) {
  // Preset selezionati di default:
  //   - azienda vuota (first run) → preset derivati dal vertical (se la mappa
  //     ritorna qualcosa); se il vertical non ha mapping (es. serramentista),
  //     la selezione parte vuota e l'utente sceglie manualmente.
  //   - azienda già popolata → nessuna pre-selezione, per evitare di forzare
  //     import duplicati implicitamente.
  const [selectedPresets, setSelectedPresets] = useState<Set<PresetListinoId>>(
    () => {
      if (existingCount !== 0) return new Set<PresetListinoId>();
      const presets = getDefaultPresetsForVertical(vertical);
      return new Set<PresetListinoId>(presets);
    },
  );
  // Selezione fine sulle singole righe della lista.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");

  const togglePreset = (id: PresetListinoId) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTariffa = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Righe filtrate: per preset se selezionato qualcosa; altrimenti tutte.
  // Ricerca su impianto / intervento.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = selectedPresets.size > 0
      ? STANDARD_TARIFFE_LISTINO.filter((t) =>
          t.presets.some((p) => selectedPresets.has(p)))
      : STANDARD_TARIFFE_LISTINO;
    if (!q) return base;
    return base.filter((t) =>
      t.impianto.toLowerCase().includes(q) ||
      t.intervento.toLowerCase().includes(q),
    );
  }, [selectedPresets, search]);

  // Conteggio totale righe che verranno importate.
  const countTotal = selectedKeys.size > 0
    ? selectedKeys.size
    : STANDARD_TARIFFE_LISTINO.filter((t) =>
        t.presets.some((p) => selectedPresets.has(p))).length;

  const handleImport = () => {
    // M3 (audit): guard anti-double-click. Se il React state `importing` non è
    // ancora diventato true, un secondo click qui prima del re-render avvierebbe
    // due batch concorrenti. Usare un early-return esplicito è più robusto del
    // solo `disabled` sul Button.
    if (importing) return;
    if (countTotal === 0) {
      toast.info("Seleziona almeno un template o una tariffa");
      return;
    }
    onImport({
      selectedPresets: Array.from(selectedPresets),
      selectedTariffeKeys: selectedKeys.size > 0 ? selectedKeys : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      // M3 (audit): durante l'import non permettere chiusura (backdrop/ESC).
      // Proteggiamo l'utente dal chiudere a metà importazione, che
      // lascerebbe uno stato parziale senza feedback.
      onOpenChange={(next) => {
        if (importing) return;
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        onEscapeKeyDown={(e) => { if (importing) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (importing) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Importa da template
          </DialogTitle>
          <DialogDescription>
            Scegli uno o più pacchetti professionali per popolare il listino in
            blocco, oppure seleziona singole tariffe dalla lista. Voci già
            esistenti non verranno duplicate.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* ── Card preset ── */}
          <div>
            <div className="text-sm font-semibold mb-2">
              Pacchetti professionali
              {existingCount === 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (consigliato se parti da zero)
                </span>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PRESET_LISTINO_CARDS.map((p) => {
                const active = selectedPresets.has(p.id);
                const Icon = p.icon;
                const countPreset = STANDARD_TARIFFE_LISTINO.filter((t) =>
                  t.presets.includes(p.id)).length;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePreset(p.id)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`rounded-md p-1.5 ${p.iconClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold text-sm truncate">{p.nome}</div>
                          {active && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {p.descrizione}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {countPreset} tariffe
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Lista fine tariffe ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold">
                Seleziona singole tariffe
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (opzionale — sovrascrive la selezione dei pacchetti)
                </span>
              </div>
              <div className="relative w-60">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cerca impianto o intervento..."
                  className="pl-8 h-8 text-xs"
                />
              </div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <div className="max-h-[280px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Impianto</TableHead>
                      <TableHead>Intervento</TableHead>
                      <TableHead className="w-24 text-right">Prezzo</TableHead>
                      <TableHead className="w-16">IVA</TableHead>
                      <TableHead className="w-20">Unità</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">
                          Nessuna tariffa trovata con i filtri correnti
                        </TableCell>
                      </TableRow>
                    ) : rows.map((t) => {
                      const key = `${t.impianto}::${t.intervento}`;
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Checkbox
                              checked={selectedKeys.has(key)}
                              onCheckedChange={() => toggleTariffa(key)}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{t.impianto}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.intervento}</TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(t.prezzo)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.iva_pct}%</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.unita}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between gap-3 border-t pt-3">
          <div className="text-xs text-muted-foreground">
            {countTotal > 0
              ? `${countTotal} tariffe da importare${existingCount > 0 ? " (duplicati ignorati)" : ""}`
              : "Nessuna tariffa selezionata"}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Annulla</Button>
            <Button onClick={handleImport} disabled={importing || countTotal === 0}>
              {importing ? "Importazione..." : `Importa ${countTotal > 0 ? countTotal : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

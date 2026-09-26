/**
 * StepImmobile — dati del cantiere, dell'immobile e della piscina.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie
 * (specchio d'acqua) mq, anno e piani, tipo intervento, tipo piscina (interrata /
 * fuori terra / skimmer / sfioro) e tipo costruzione (cemento / vetroresina /
 * pannelli / liner). Tutti controllati, salvano sul progetto via `onChange`.
 *
 * NB: la tabella `pis_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Waves, MapPin } from "lucide-react";
import type { PisProgetto } from "@/types/piscine";
import type { PisFormPatch } from "./types";
import type { SalesIntervention } from "@/lib/moduli-vendita/areas";
import { InterventoScelto } from "@/components/moduli/InterventoScelto";

interface Props {
  form: Partial<PisProgetto>;
  onChange: <K extends keyof PisFormPatch>(key: K, value: PisFormPatch[K]) => void;
  /** L'intervento della libreria, se il preventivo nasce da un modello. */
  model?: SalesIntervention;
}

/** Tipi di intervento tipici per una piscina. */
const TIPI_INTERVENTO = [
  { value: "nuova_costruzione", label: "Nuova costruzione" },
  { value: "ristrutturazione", label: "Ristrutturazione piscina" },
  { value: "impianto_trattamento", label: "Rifacimento impianto di trattamento" },
  { value: "copertura", label: "Copertura / tapparella" },
  { value: "manutenzione", label: "Manutenzione" },
  { value: "altro", label: "Altro" },
] as const;

/** Tipo di piscina. */
const TIPI_PISCINA = [
  { value: "interrata", label: "Interrata" },
  { value: "fuori_terra", label: "Fuori terra" },
  { value: "skimmer", label: "A skimmer" },
  { value: "sfioro", label: "A sfioro" },
  { value: "idromassaggio", label: "Idromassaggio / SPA" },
] as const;

/** Tipo di costruzione/struttura della vasca. */
const TIPI_COSTRUZIONE = [
  { value: "cemento_armato", label: "Cemento armato (gunite/casseri)" },
  { value: "vetroresina", label: "Vetroresina (monoblocco)" },
  { value: "pannelli_acciaio", label: "Pannelli in acciaio" },
  { value: "pannelli_pvc", label: "Pannelli in PVC" },
  { value: "liner", label: "Liner / membrana armata" },
] as const;

/** Tipi di immobile. */
const TIPI_IMMOBILE = [
  { value: "appartamento", label: "Appartamento" },
  { value: "villa", label: "Villa / villetta" },
  { value: "casa_indipendente", label: "Casa indipendente" },
  { value: "hotel", label: "Hotel / struttura ricettiva" },
  { value: "centro_sportivo", label: "Centro sportivo / wellness" },
  { value: "altro", label: "Altro" },
] as const;

/** Coerce numerico controllato: stringa vuota → null, altrimenti numero. */
const toNum = (raw: string): number | null => {
  const t = raw.trim();
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

/** Come `toNum`, per le colonne intere del DB: con un decimale ogni salvataggio falliva. */
const toInt = (raw: string): number | null => {
  const v = toNum(raw);
  return v == null ? null : Math.trunc(v);
};

export default function StepImmobile({ form, onChange, model }: Props) {
  const isMobile = useIsMobile();
  return (
    <Card>
      {/* Telefono: colonna con spazi fissi, così il titolo nascosto non lascia un buco in cima. */}
      <CardContent className="p-4 sm:p-5 space-y-4 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0 max-sm:p-3">
        {/* Telefono: il titolo lo dice già il passo in alto. */}
        <div className="flex items-center gap-2 max-sm:hidden">
          <div className="h-8 w-8 rounded-md bg-cyan-50 text-cyan-600 flex items-center justify-center max-sm:hidden">
            <Waves className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dati piscina e cantiere</h2>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">
              Tipo di intervento, tipo piscina, struttura e indirizzo del cantiere.
            </p>
          </div>
        </div>

        {/* Tipo intervento + tipo piscina */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Tipo di intervento</Label>
            {model ? <InterventoScelto intervento={model} /> : <Select
              value={form.tipo_intervento ?? ""}
              onValueChange={(v) => onChange("tipo_intervento", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Seleziona il tipo di intervento" />
              </SelectTrigger>
              <SelectContent>
                {TIPI_INTERVENTO.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>}
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Tipo di piscina</Label>
            <Select
              value={form.tipo_piscina ?? ""}
              onValueChange={(v) => onChange("tipo_piscina", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Interrata / fuori terra / sfioro" />
              </SelectTrigger>
              <SelectContent>
                {TIPI_PISCINA.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Indirizzo cantiere */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12">
            <Label className="text-xs flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Indirizzo cantiere
            </Label>
            <Input
              value={form.cantiere_indirizzo ?? ""}
              onChange={(e) => onChange("cantiere_indirizzo", e.target.value || null)}
              placeholder="Via Tortona 33"
              className="h-9"
            />
          </div>
          <div className="col-span-5 sm:col-span-6">
            <Label className="text-xs">Città</Label>
            <Input
              value={form.cantiere_citta ?? ""}
              onChange={(e) => onChange("cantiere_citta", e.target.value || null)}
              placeholder="Milano"
              className="h-9"
            />
          </div>
          <div className="col-span-3">
            <Label className="text-xs">Provincia</Label>
            <Input
              value={form.cantiere_provincia ?? ""}
              onChange={(e) => onChange("cantiere_provincia", (e.target.value || null)?.toUpperCase() ?? null)}
              placeholder="MI"
              maxLength={2}
              className="h-9 uppercase"
            />
          </div>
          <div className="col-span-4 sm:col-span-3">
            <Label className="text-xs">CAP</Label>
            <Input
              value={form.cantiere_cap ?? ""}
              onChange={(e) => onChange("cantiere_cap", e.target.value || null)}
              placeholder="20121"
              className="h-9"
            />
          </div>
        </div>

        {/* Immobile + piscina */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Contesto</Label>
            <Select
              value={form.immobile_tipo ?? ""}
              onValueChange={(v) => onChange("immobile_tipo", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent>
                {TIPI_IMMOBILE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Struttura vasca</Label>
            <Select
              value={form.tipo_costruzione ?? ""}
              onValueChange={(v) => onChange("tipo_costruzione", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Cemento / vetroresina / pannelli" />
              </SelectTrigger>
              <SelectContent>
                {TIPI_COSTRUZIONE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Specchio acqua (m²)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={form.immobile_superficie_mq ?? ""}
              onChange={(e) => onChange("immobile_superficie_mq", toNum(e.target.value))}
              placeholder="32"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Anno immobile</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              value={form.immobile_anno ?? ""}
              onChange={(e) => onChange("immobile_anno", toInt(e.target.value))}
              placeholder="2010"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Note dimensioni (es. 8×4 m, h 1,5 m)</Label>
            <Input
              value={form.immobile_piani != null ? String(form.immobile_piani) : ""}
              onChange={(e) => onChange("immobile_piani", toInt(e.target.value))}
              placeholder="Profondità media in cm"
              type="number"
              step={1}
              inputMode="numeric"
              className="h-9 tabular-nums"
            />
          </div>
        </div>

        {/* Vincoli / note */}
        <div>
          <Label className="text-xs">Vincoli e note</Label>
          <Textarea
            value={form.note ?? ""}
            onChange={(e) => onChange("note", e.target.value || null)}
            placeholder={isMobile ? "Vincoli, accessi, orari…" : "Es. accesso mezzi per lo scavo, falda/terreno, distanze dai confini, posizione locale tecnico, allaccio acqua/elettrico, permessi…"}
            className="min-h-20 text-sm max-sm:min-h-16"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5 max-sm:hidden">
            Vincoli edilizi/urbanistici (distanze, permessi) e annotazioni utili per il preventivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

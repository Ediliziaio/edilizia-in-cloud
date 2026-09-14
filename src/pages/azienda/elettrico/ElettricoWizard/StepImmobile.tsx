/**
 * StepImmobile — dati del cantiere, dell'immobile e dell'impianto elettrico.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie mq,
 * anno e piani, tipo intervento, numero punti (luce/presa) e livello impianto
 * (CEI 64-8: liv. 1 base / 2 standard / 3 domotico). Tutti controllati,
 * salvano sul progetto via `onChange`.
 *
 * NB: la tabella `ele_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Zap, MapPin } from "lucide-react";
import type { EleProgetto } from "@/types/elettrico";
import type { EleFormPatch } from "./types";

interface Props {
  form: Partial<EleProgetto>;
  onChange: <K extends keyof EleFormPatch>(key: K, value: EleFormPatch[K]) => void;
}

/** Tipi di intervento tipici per un impianto elettrico. */
const TIPI_INTERVENTO = [
  { value: "nuovo_impianto", label: "Nuovo impianto" },
  { value: "rifacimento", label: "Rifacimento impianto esistente" },
  { value: "adeguamento_norma", label: "Adeguamento a norma (CEI 64-8)" },
  { value: "ampliamento", label: "Ampliamento (nuovi punti)" },
  { value: "domotica", label: "Domotica / building automation" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria" },
  { value: "altro", label: "Altro" },
] as const;

/** Livello impianto secondo CEI 64-8 (residenziale). */
const LIVELLI_IMPIANTO = [
  { value: "livello_1", label: "Livello 1 — Base" },
  { value: "livello_2", label: "Livello 2 — Standard" },
  { value: "livello_3", label: "Livello 3 — Domotico" },
] as const;

/** Tipi di immobile. */
const TIPI_IMMOBILE = [
  { value: "appartamento", label: "Appartamento" },
  { value: "villa", label: "Villa / villetta" },
  { value: "casa_indipendente", label: "Casa indipendente" },
  { value: "ufficio", label: "Ufficio" },
  { value: "negozio", label: "Negozio / commerciale" },
  { value: "capannone", label: "Capannone" },
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

export default function StepImmobile({ form, onChange }: Props) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
            <Zap className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dati impianto e cantiere</h2>
            <p className="text-[11px] text-muted-foreground">
              Tipo di intervento, livello impianto, n. punti e indirizzo del cantiere.
            </p>
          </div>
        </div>

        {/* Tipo intervento + livello impianto */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Tipo di intervento</Label>
            <Select
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
            </Select>
          </div>
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Livello impianto (CEI 64-8)</Label>
            <Select
              value={form.livello_impianto ?? ""}
              onValueChange={(v) => onChange("livello_impianto", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Base / Standard / Domotico" />
              </SelectTrigger>
              <SelectContent>
                {LIVELLI_IMPIANTO.map((t) => (
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
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Città</Label>
            <Input
              value={form.cantiere_citta ?? ""}
              onChange={(e) => onChange("cantiere_citta", e.target.value || null)}
              placeholder="Milano"
              className="h-9"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Provincia</Label>
            <Input
              value={form.cantiere_provincia ?? ""}
              onChange={(e) => onChange("cantiere_provincia", (e.target.value || null)?.toUpperCase() ?? null)}
              placeholder="MI"
              maxLength={2}
              className="h-9 uppercase"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">CAP</Label>
            <Input
              value={form.cantiere_cap ?? ""}
              onChange={(e) => onChange("cantiere_cap", e.target.value || null)}
              placeholder="20121"
              className="h-9"
            />
          </div>
        </div>

        {/* Immobile + impianto */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">Tipo immobile</Label>
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
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">N. punti (luce/presa)</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              min={1}
              value={form.numero_punti ?? ""}
              onChange={(e) => onChange("numero_punti", toInt(e.target.value))}
              placeholder="60"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Superficie (m²)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={form.immobile_superficie_mq ?? ""}
              onChange={(e) => onChange("immobile_superficie_mq", toNum(e.target.value))}
              placeholder="85"
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
              placeholder="1995"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Piani</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              min={0}
              value={form.immobile_piani ?? ""}
              onChange={(e) => onChange("immobile_piani", toInt(e.target.value))}
              placeholder="1"
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
            placeholder="Es. posizione quadro/contatore, tracce a vista vietate, necessità certificazione DM 37/08, condominio con orari cantiere…"
            className="min-h-20 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Vincoli edilizi/condominiali e annotazioni utili per il preventivo (es. dichiarazione di conformità).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

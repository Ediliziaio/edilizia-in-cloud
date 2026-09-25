/**
 * StepImmobile — dati del cantiere, dell'immobile e dell'impianto di climatizzazione.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie mq,
 * anno e piani, tipo intervento, numero unità interne e tipologia impianto
 * (split/multisplit/VRF). Tutti controllati, salvano sul progetto via `onChange`.
 *
 * NB: la tabella `clm_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Wind, MapPin } from "lucide-react";
import type { ClmProgetto } from "@/types/climatizzazione";
import type { ClmFormPatch } from "./types";

interface Props {
  form: Partial<ClmProgetto>;
  onChange: <K extends keyof ClmFormPatch>(key: K, value: ClmFormPatch[K]) => void;
}

/** Tipi di intervento tipici per un impianto di climatizzazione. */
const TIPI_INTERVENTO = [
  { value: "nuovo_impianto", label: "Nuovo impianto" },
  { value: "sostituzione", label: "Sostituzione impianto esistente" },
  { value: "ampliamento", label: "Ampliamento (aggiunta unità)" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria" },
  { value: "manutenzione_ordinaria", label: "Manutenzione / sanificazione" },
  { value: "altro", label: "Altro" },
] as const;

/** Tipologie di impianto di climatizzazione. */
const TIPI_IMPIANTO = [
  { value: "monosplit", label: "Monosplit (1 interna)" },
  { value: "multisplit", label: "Multisplit (1 esterna + N interne)" },
  { value: "vrf", label: "VRF / VRV (commerciale)" },
  { value: "canalizzato", label: "Canalizzato / a cassetta" },
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
      <CardContent className="p-4 sm:p-5 space-y-4 max-sm:p-3 max-sm:space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sky-50 text-sky-600 flex items-center justify-center">
            <Wind className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dati impianto e cantiere</h2>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">
              Tipo di intervento, tipologia impianto, n. unità interne e indirizzo del cantiere.
            </p>
          </div>
        </div>

        {/* Tipo intervento + tipologia impianto */}
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
            <Label className="text-xs">Tipologia impianto</Label>
            <Select
              value={form.tipologia_impianto ?? ""}
              onValueChange={(v) => onChange("tipologia_impianto", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Split / multisplit / VRF" />
              </SelectTrigger>
              <SelectContent>
                {TIPI_IMPIANTO.map((t) => (
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
            <Label className="text-xs">N. unità interne</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              min={1}
              value={form.numero_unita_interne ?? ""}
              onChange={(e) => onChange("numero_unita_interne", toInt(e.target.value))}
              placeholder="3"
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
            placeholder="Es. unità esterna su balcone condominiale, distanze dai confini, accesso difficoltoso, posizione quadro elettrico…"
            className="min-h-20 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Vincoli edilizi/condominiali (posizione motore, canaline a vista) e annotazioni utili per il preventivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

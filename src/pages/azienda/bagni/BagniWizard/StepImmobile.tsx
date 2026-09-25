/**
 * StepImmobile — dati del cantiere e dell'immobile + tipo intervento.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie mq,
 * anno e piani, tipo intervento (select) e vincoli/note. Tutti controllati,
 * salvano sul progetto via `onChange`.
 *
 * NB: la tabella `bgn_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Home, MapPin, Calculator, Accessibility, AlertTriangle } from "lucide-react";
import { calcRivestimenti } from "@/lib/bagni/calcoli";
import type { BgnProgetto } from "@/types/bagni";
import type { BgnFormPatch } from "./types";
import type { SalesIntervention } from "@/lib/moduli-vendita/areas";
import { InterventoScelto } from "@/components/moduli/InterventoScelto";

interface Props {
  form: Partial<BgnProgetto>;
  onChange: <K extends keyof BgnFormPatch>(key: K, value: BgnFormPatch[K]) => void;
  /** L'intervento della libreria, se il preventivo nasce da un modello. */
  model?: SalesIntervention;
}

/** Tipi di intervento tipici per un bagno. */
const TIPI_INTERVENTO = [
  { value: "rifacimento_completo", label: "Rifacimento completo" },
  { value: "rifacimento_parziale", label: "Rifacimento parziale" },
  { value: "nuovo_bagno", label: "Nuovo bagno" },
  { value: "sostituzione_sanitari", label: "Sostituzione sanitari/rubinetteria" },
  { value: "vasca_in_doccia", label: "Trasformazione vasca in doccia" },
  { value: "abbattimento_barriere", label: "Abbattimento barriere architettoniche" },
  { value: "altro", label: "Altro" },
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

export default function StepImmobile({ form, onChange, model }: Props) {
  // Calcolatore rivestimenti (puro, nessuno stato): pavimento + pareti dal perimetro × altezza.
  const riv = form.perimetro_ml != null && form.perimetro_ml > 0
    ? calcRivestimenti(form.immobile_superficie_mq ?? 0, form.perimetro_ml, form.altezza_rivestimento_m ?? 2.1)
    : null;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
            <Home className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dati del bagno e cantiere</h2>
            <p className="text-[11px] text-muted-foreground">
              Tipo di intervento, numero di bagni, superficie e indirizzo del cantiere.
            </p>
          </div>
        </div>

        {/* Tipo intervento */}
        <div>
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

        {/* Immobile */}
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
            <Label className="text-xs">N. bagni</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              min={1}
              value={form.numero_bagni ?? ""}
              onChange={(e) => onChange("numero_bagni", toInt(e.target.value))}
              placeholder="1"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Superficie bagno (m²)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              value={form.immobile_superficie_mq ?? ""}
              onChange={(e) => onChange("immobile_superficie_mq", toNum(e.target.value))}
              placeholder="6"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Anno</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              value={form.immobile_anno ?? ""}
              onChange={(e) => onChange("immobile_anno", toInt(e.target.value))}
              placeholder="1975"
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

        {/* ─── Calcolatore rivestimenti ───────────────────────────────────────── */}
        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-semibold text-slate-800">Calcolatore rivestimenti</span>
          </div>
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Perimetro bagno (m)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.perimetro_ml ?? ""}
                onChange={(e) => onChange("perimetro_ml", toNum(e.target.value))}
                placeholder="10" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Altezza rivestimento (m)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.altezza_rivestimento_m ?? ""}
                onChange={(e) => onChange("altezza_rivestimento_m", toNum(e.target.value))}
                placeholder="2,1" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              {riv ? (
                <p className="text-[11px] text-slate-700">
                  Pavimento: <span className="font-semibold tabular-nums">{riv.pavimento_mq} m²</span> · Rivestimento pareti:{" "}
                  <span className="font-semibold tabular-nums">≈ {riv.rivestimento_mq} m²</span>. Usa questi m² nelle voci pavimento/rivestimento del computo.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Inserisci perimetro e altezza: stimo i m² di pavimento (= superficie bagno) e di rivestimento pareti.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Bagno accessibile ──────────────────────────────────────────────── */}
        <div className="rounded-xl border p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="bgn-accessibile" className="flex items-center gap-1.5 text-xs font-medium text-slate-800 cursor-pointer">
              <Accessibility className="h-3.5 w-3.5 text-blue-600" />
              Bagno accessibile (disabili / anziani)
            </Label>
            <Switch id="bgn-accessibile" checked={form.accessibile ?? false} onCheckedChange={(v) => onChange("accessibile", v)} />
          </div>
          {form.accessibile && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              <p className="text-[11px] text-blue-900">
                Bagno accessibile: valuta <strong>maniglioni</strong>, <strong>piatto doccia a filo pavimento</strong> e sanitari ergonomici.
                Questi interventi rientrano nel <strong>Bonus Barriere 75%</strong> — impostalo dai chip incentivi nello step Economia.
              </p>
            </div>
          )}
        </div>

        {/* Vincoli / note */}
        <div>
          <Label className="text-xs">Vincoli e note</Label>
          <Textarea
            value={form.note ?? ""}
            onChange={(e) => onChange("note", e.target.value || null)}
            placeholder="Es. immobile in zona vincolata, condominio con orari cantiere, accesso difficoltoso…"
            className="min-h-20 text-sm"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Vincoli edilizi/condominiali e annotazioni utili per il preventivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

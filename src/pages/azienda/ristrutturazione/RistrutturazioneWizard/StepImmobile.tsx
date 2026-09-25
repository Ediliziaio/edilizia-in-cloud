/**
 * StepImmobile — dati del cantiere e dell'immobile + tipo intervento.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie mq,
 * anno e piani, tipo intervento (select) e vincoli/note. Tutti controllati,
 * salvano sul progetto via `onChange`.
 *
 * NB: la tabella `rst_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Home, MapPin, Calculator } from "lucide-react";
import { stimaSuperficiVani } from "@/lib/ristrutturazione/calcoli";
import type { RstProgetto } from "@/types/ristrutturazione";
import type { RstFormPatch } from "./types";

interface Props {
  form: Partial<RstProgetto>;
  onChange: <K extends keyof RstFormPatch>(key: K, value: RstFormPatch[K]) => void;
}

/** Tipi di intervento tipici per una ristrutturazione. */
const TIPI_INTERVENTO = [
  { value: "ristrutturazione_completa", label: "Ristrutturazione completa" },
  { value: "ristrutturazione_parziale", label: "Ristrutturazione parziale" },
  { value: "ristrutturazione_bagno", label: "Ristrutturazione bagno" },
  { value: "ristrutturazione_cucina", label: "Ristrutturazione cucina" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria" },
  { value: "efficientamento_energetico", label: "Efficientamento energetico" },
  { value: "ampliamento", label: "Ampliamento" },
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

export default function StepImmobile({ form, onChange }: Props) {
  // Stima superfici da vani (puro, nessuno stato): pavimenti/soffitti/pareti/tinteggiature.
  const superfici = form.immobile_superficie_mq != null && form.immobile_superficie_mq > 0
    ? stimaSuperficiVani(form.immobile_superficie_mq, form.altezza_media_m ?? 2.7, form.numero_vani ?? 1)
    : null;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4 max-sm:p-3 max-sm:space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center max-sm:hidden">
            <Home className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Cantiere e immobile</h2>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">
              Indirizzo del cantiere, dati dell'immobile e tipo di intervento.
            </p>
          </div>
        </div>

        {/* Tipo intervento */}
        <div>
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

        {/* Immobile */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-7 sm:col-span-6">
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
          <div className="col-span-5 sm:col-span-6">
            <Label className="text-xs">Superficie (mq)</Label>
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

        {/* ─── Calcolatore superfici da vani ──────────────────────────────────── */}
        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-semibold text-slate-800">Calcolatore superfici</span>
            <span className="text-[10px] text-muted-foreground max-sm:hidden">— stima da superficie + n. vani + altezza</span>
          </div>
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">N. vani</Label>
              <Input
                type="number" step={1} inputMode="numeric" min={1}
                value={form.numero_vani ?? ""}
                onChange={(e) => onChange("numero_vani", toInt(e.target.value))}
                placeholder="4" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Altezza media (m)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.altezza_media_m ?? ""}
                onChange={(e) => onChange("altezza_media_m", toNum(e.target.value))}
                placeholder="2,7" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              {superfici ? (
                <p className="text-[11px] text-slate-700">
                  Stima: <span className="font-semibold tabular-nums">{superfici.pavimenti} m²</span> pavimenti/soffitti ·{" "}
                  <span className="font-semibold tabular-nums">≈ {superfici.pareti} m²</span> pareti ·{" "}
                  <span className="font-semibold tabular-nums">≈ {superfici.tinteggiature} m²</span> tinteggiature. Da usare nel computo.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground max-sm:hidden">
                  Inserisci la superficie (sopra), il n. di vani e l'altezza: stimo pavimenti, pareti e tinteggiature.
                </p>
              )}
            </div>
          </div>
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
          <p className="text-[10px] text-muted-foreground mt-0.5 max-sm:hidden">
            Vincoli edilizi/condominiali e annotazioni utili per il preventivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

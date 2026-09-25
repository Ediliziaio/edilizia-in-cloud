/**
 * StepImmobile — dati del cantiere e dell'immobile + tipo intervento.
 *
 * Campi: indirizzo/città/provincia/CAP cantiere, tipo immobile, superficie mq,
 * anno e piani, tipo intervento (select) e vincoli/note. Tutti controllati,
 * salvano sul progetto via `onChange`.
 *
 * NB: la tabella `tet_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Home, MapPin, Calculator, ShieldAlert, AlertTriangle, HardHat } from "lucide-react";
import { calcSuperficieFalda, stimaLattoneria } from "@/lib/tetti/calcoli";
import type { TetProgetto } from "@/types/tetti";
import type { TetFormPatch } from "./types";
import type { TETTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/tettiTemplateModules";

interface Props {
  form: Partial<TetProgetto>;
  model?: typeof TETTI_TEMPLATE_MODULES[number];
  onChange: <K extends keyof TetFormPatch>(key: K, value: TetFormPatch[K]) => void;
}

/** Tipi di intervento tipici per una copertura/tetto. */
const TIPI_INTERVENTO = [
  { value: "rifacimento_completo", label: "Rifacimento completo" },
  { value: "rifacimento_parziale", label: "Rifacimento parziale" },
  { value: "coibentazione", label: "Coibentazione / isolamento" },
  { value: "sostituzione_manto", label: "Sostituzione manto di copertura" },
  { value: "lattoneria", label: "Rifacimento lattoneria" },
  { value: "linee_vita", label: "Installazione linee vita" },
  { value: "manutenzione_straordinaria", label: "Manutenzione straordinaria" },
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
  // Derivati roof-specific (puri, nessuno stato): superficie reale di falda + stima lattoneria.
  const piantaMq = form.superficie_pianta_mq;
  const faldaMq = piantaMq != null && piantaMq > 0 ? calcSuperficieFalda(piantaMq, form.pendenza_pct ?? 0) : null;
  const lattoneria = form.perimetro_ml != null && form.perimetro_ml > 0 ? stimaLattoneria(form.perimetro_ml) : null;
  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-4 max-sm:p-3 max-sm:space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center">
            <Home className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Dati della copertura e cantiere</h2>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">
              Tipo di intervento, numero di falde, superficie e indirizzo del cantiere.
            </p>
          </div>
        </div>

        {/* Tipo intervento */}
        <div>
          <Label className="text-xs">Tipo di intervento</Label>
          {model ? <div className="mt-1 rounded-lg border bg-muted/30 p-3">
            <p className="font-medium">{model.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">Intervento scelto all'inizio del preventivo.</p>
            <ul className="mt-2 space-y-1 text-sm">{model.needs.map(need => <li key={need}>• {need}</li>)}</ul>
          </div> : <Select
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
            <Label className="text-xs">N. falde</Label>
            <Input
              type="number"
              step={1}
              inputMode="numeric"
              min={1}
              value={form.numero_falde ?? ""}
              onChange={(e) => onChange("numero_falde", toInt(e.target.value))}
              placeholder="2"
              className="h-9 tabular-nums"
            />
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">Superficie copertura (m²)</Label>
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
              placeholder="2"
              className="h-9 tabular-nums"
            />
          </div>
        </div>

        {/* ─── Calcolatore copertura (roof-specific) ──────────────────────────── */}
        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-3">
          <div className="flex items-center gap-1.5">
            <Calculator className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-semibold text-slate-800">Calcolatore copertura</span>
          </div>

          {/* Calcolatore falde: pianta + pendenza → superficie reale */}
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Superficie in pianta (m²)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.superficie_pianta_mq ?? ""}
                onChange={(e) => onChange("superficie_pianta_mq", toNum(e.target.value))}
                placeholder="120" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Pendenza (%)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.pendenza_pct ?? ""}
                onChange={(e) => onChange("pendenza_pct", toNum(e.target.value))}
                placeholder="30" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-12 sm:col-span-6">
              {faldaMq !== null ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2">
                  <span className="text-[11px] text-muted-foreground">
                    Superficie reale di falda{" "}
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ≈ {faldaMq.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²
                    </span>
                  </span>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
                    onClick={() => onChange("immobile_superficie_mq", Math.round(faldaMq * 10) / 10)}
                  >
                    Applica
                  </Button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Inserisci pianta e pendenza: la falda inclinata è più grande della proiezione in pianta.
                </p>
              )}
            </div>
          </div>

          {/* Stima lattoneria dal perimetro */}
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">Perimetro edificio (m)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.perimetro_ml ?? ""}
                onChange={(e) => onChange("perimetro_ml", toNum(e.target.value))}
                placeholder="48" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-12 sm:col-span-9">
              {lattoneria ? (
                <p className="text-[11px] text-slate-700">
                  Stima lattoneria:{" "}
                  <span className="font-semibold tabular-nums">≈ {lattoneria.gronde_ml} m</span> di gronde/scossaline e{" "}
                  <span className="font-semibold tabular-nums">~{lattoneria.pluviali_n}</span> pluviali. Valori di partenza, regolabili nel computo.
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Inserisci il perimetro per una stima rapida di gronde e pluviali.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─── Amianto / sicurezza ────────────────────────────────────────────── */}
        <div className="rounded-xl border p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="tet-amianto" className="flex items-center gap-1.5 text-xs font-medium text-slate-800 cursor-pointer">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              Presenza di amianto / eternit
            </Label>
            <Switch id="tet-amianto" checked={form.amianto ?? false} onCheckedChange={(v) => onChange("amianto", v)} />
          </div>
          {form.amianto && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[11px] text-rose-900">
                Copertura con amianto: obbligo di <strong>piano di lavoro e notifica all'ASL</strong> (D.Lgs. 81/08) e
                smaltimento da ditta autorizzata. Nel listino trovi il capitolo <strong>"Bonifica e smaltimento amianto"</strong> da
                aggiungere al computo.
              </p>
            </div>
          )}
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
            <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-[11px] text-slate-600">
              Lavori in quota &gt; 2 m: previsti <strong>ponteggio</strong> e <strong>linea vita</strong> (UNI 11578) — voci già
              presenti nei capitoli "Allestimento cantiere e ponteggi" e "Sicurezza e opere accessorie".
            </p>
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
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Vincoli edilizi/condominiali e annotazioni utili per il preventivo.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

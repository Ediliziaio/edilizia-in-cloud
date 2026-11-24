/**
 * StepImmobile — dati dell'immobile + tipo intervento.
 * L'indirizzo dei lavori (via, città, CAP, provincia) sta nel passo Cliente.
 *
 * Campi: tipo immobile, superficie mq,
 * anno e piani, tipo intervento (select) e vincoli/note. Tutti controllati,
 * salvano sul progetto via `onChange`.
 *
 * NB: la tabella `tet_progetti` non ha una colonna dedicata "vincoli": usiamo
 * il campo generale `note` del progetto per annotare vincoli edilizi/condominiali.
 */
import { Fragment, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Home, Calculator, ShieldAlert, AlertTriangle, HardHat } from "lucide-react";
import { calcSuperficieFalda, stimaLattoneria } from "@/lib/tetti/calcoli";
import type { TetProgetto } from "@/types/tetti";
import type { TetFormPatch } from "./types";
import type { TETTI_TEMPLATE_MODULES } from "@/lib/moduli-vendita/tettiTemplateModules";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

/** Mette pezzi di interfaccia (grassetti, numeri) al posto dei segnaposto di una frase già tradotta. */
function conPezzi(frase: string, pezzi: Record<string, ReactNode>): ReactNode[] {
  return frase.split(/(\{\w+\})/).map((p, i) => {
    const nome = /^\{(\w+)\}$/.exec(p)?.[1];
    return <Fragment key={i}>{nome && nome in pezzi ? pezzi[nome] : p}</Fragment>;
  });
}

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
  const tr = useT();
  const isMobile = useIsMobile();
  // Derivati roof-specific (puri, nessuno stato): superficie reale di falda + stima lattoneria.
  const piantaMq = form.superficie_pianta_mq;
  const faldaMq = piantaMq != null && piantaMq > 0 ? calcSuperficieFalda(piantaMq, form.pendenza_pct ?? 0) : null;
  const lattoneria = form.perimetro_ml != null && form.perimetro_ml > 0 ? stimaLattoneria(form.perimetro_ml) : null;
  return (
    <Card>
      {/* Telefono: colonna con spazi fissi, così il titolo nascosto non lascia un buco in cima. */}
      <CardContent className="p-4 sm:p-5 space-y-4 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0 max-sm:p-3">
        {/* Telefono: il titolo lo dice già il passo in alto. */}
        <div className="flex items-center gap-2 max-sm:hidden">
          <div className="h-8 w-8 rounded-md bg-orange-50 text-orange-600 flex items-center justify-center max-sm:hidden">
            <Home className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{tr("Dati della copertura")}</h2>
            <p className="text-[11px] text-muted-foreground max-sm:hidden">
              {tr("Tipo di intervento, numero di falde e superficie.")}
            </p>
          </div>
        </div>

        {/* Tipo intervento */}
        <div>
          <Label className="text-xs">{tr("Tipo di intervento")}</Label>
          {/* Telefono: solo il nome dell'intervento, come InterventoScelto negli altri moduli. */}
          {model ? <div className="mt-1 rounded-lg border bg-muted/30 p-3 max-sm:py-2">
            <p className="font-medium">{model.title}</p>
            <p className="mt-1 text-xs text-muted-foreground max-sm:hidden">{tr("Intervento scelto all'inizio del preventivo.")}</p>
            <ul className="mt-2 space-y-1 text-sm max-sm:hidden">{model.needs.map(need => <li key={need}>• {need}</li>)}</ul>
          </div> : <Select
            value={form.tipo_intervento ?? ""}
            onValueChange={(v) => onChange("tipo_intervento", v)}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={tr("Seleziona il tipo di intervento")} />
            </SelectTrigger>
            <SelectContent>
              {TIPI_INTERVENTO.map((t) => (
                <SelectItem key={t.value} value={t.value}>{tr(t.label)}</SelectItem>
              ))}
            </SelectContent>
          </Select>}
        </div>

        {/* Immobile */}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 sm:col-span-6">
            <Label className="text-xs">{tr("Tipo immobile")}</Label>
            <Select
              value={form.immobile_tipo ?? ""}
              onValueChange={(v) => onChange("immobile_tipo", v)}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={tr("Seleziona")} />
              </SelectTrigger>
              <SelectContent>
                {TIPI_IMMOBILE.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{tr(t.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-6 sm:col-span-3">
            <Label className="text-xs">{tr("N. falde")}</Label>
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
            <Label className="text-xs"><span className="max-sm:hidden">{tr("Superficie copertura")}</span><span className="sm:hidden">{tr("Superficie")}</span> (m²)</Label>
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
            <Label className="text-xs">{tr("Anno")}</Label>
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
            <Label className="text-xs">{tr("Piani")}</Label>
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
        {/* Telefono: niente riquadro né titolo, i campi stanno col resto del modulo. */}
        <div className="rounded-xl border border-orange-100 bg-orange-50/40 p-3 space-y-3 max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
          <div className="flex items-center gap-1.5 max-sm:hidden">
            <Calculator className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-semibold text-slate-800">{tr("Calcolatore copertura")}</span>
          </div>

          {/* Calcolatore falde: pianta + pendenza → superficie reale */}
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs"><span className="max-sm:hidden">{tr("Superficie in pianta")}</span><span className="sm:hidden">{tr("In pianta")}</span> (m²)</Label>
              <Input
                type="number" inputMode="decimal" min={0}
                value={form.superficie_pianta_mq ?? ""}
                onChange={(e) => onChange("superficie_pianta_mq", toNum(e.target.value))}
                placeholder="120" className="h-9 tabular-nums"
              />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">{tr("Pendenza (%)")}</Label>
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
                    {tr("Superficie reale di falda")}{" "}
                    <span className="font-semibold text-slate-900 tabular-nums">
                      ≈ {faldaMq.toLocaleString(intlCampo(), { maximumFractionDigits: 1 })} m²
                    </span>
                  </span>
                  <Button
                    type="button" size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
                    onClick={() => onChange("immobile_superficie_mq", Math.round(faldaMq * 10) / 10)}
                  >
                    {tr("Applica")}
                  </Button>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground max-sm:hidden">
                  {tr("Inserisci pianta e pendenza: la falda inclinata è più grande della proiezione in pianta.")}
                </p>
              )}
            </div>
          </div>

          {/* Stima lattoneria dal perimetro */}
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-6 sm:col-span-3">
              <Label className="text-xs">{tr("Perimetro edificio (m)")}</Label>
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
                  {conPezzi(tr("Stima lattoneria: {gronde} di gronde/scossaline e {pluviali} pluviali"), {
                    gronde: <span className="font-semibold tabular-nums">≈ {lattoneria.gronde_ml} m</span>,
                    pluviali: <span className="font-semibold tabular-nums">~{lattoneria.pluviali_n}</span>,
                  })}<span className="max-sm:hidden">. {tr("Valori di partenza, regolabili nel computo.")}</span>
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground max-sm:hidden">
                  {tr("Inserisci il perimetro per una stima rapida di gronde e pluviali.")}
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
              {tr("Presenza di amianto / eternit")}
            </Label>
            <Switch id="tet-amianto" checked={form.amianto ?? false} onCheckedChange={(v) => onChange("amianto", v)} />
          </div>
          {form.amianto && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <p className="text-[11px] text-rose-900">
                <span className="max-sm:hidden">
                  {conPezzi(tr("Copertura con amianto: obbligo di {obbligo} (D.Lgs. 81/08) e smaltimento da ditta autorizzata. Nel listino trovi il capitolo {capitolo} da aggiungere al computo."), {
                    obbligo: <strong>{tr("piano di lavoro e notifica all'ASL")}</strong>,
                    capitolo: <strong>"Bonifica e smaltimento amianto"</strong>,
                  })}
                </span>
                <span className="sm:hidden">{conPezzi(tr("Servono {cosa} e smaltimento da ditta autorizzata."), { cosa: <strong>{tr("piano di lavoro, notifica all'ASL")}</strong> })}</span>
              </p>
            </div>
          )}
          {/* Telefono no: promemoria fisso, le voci sono già nel listino. */}
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 max-sm:hidden">
            <HardHat className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <p className="text-[11px] text-slate-600">
              {conPezzi(tr("Verifica nel computo le opere di sicurezza previste per l’intervento, incluse le eventuali voci di {ponteggio} e {lineaVita}. Aggiungi le voci necessarie nei capitoli {capitolo1} e {capitolo2}."), {
                ponteggio: <strong>{tr("ponteggio")}</strong>,
                lineaVita: <strong>{tr("linea vita")}</strong>,
                capitolo1: "\"Allestimento cantiere e ponteggi\"",
                capitolo2: "\"Sicurezza e opere accessorie\"",
              })}
            </p>
          </div>
        </div>

        {/* Vincoli / note */}
        <div>
          <Label className="text-xs">{tr("Vincoli e note")}</Label>
          <Textarea
            value={form.note ?? ""}
            onChange={(e) => onChange("note", e.target.value || null)}
            placeholder={isMobile ? tr("Vincoli, accessi, orari…") : tr("Es. immobile in zona vincolata, condominio con orari cantiere, accesso difficoltoso…")}
            className="min-h-20 text-sm max-sm:min-h-16"
          />
          <p className="text-[10px] text-muted-foreground mt-0.5 max-sm:hidden">
            {tr("Vincoli edilizi/condominiali e annotazioni utili per il preventivo.")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

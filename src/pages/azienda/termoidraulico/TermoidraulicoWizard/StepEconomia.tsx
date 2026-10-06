/**
 * StepEconomia — parametri economici del preventivo (Task 19): sconto, IVA,
 * detrazione, prezzo scritto a mano. Riepilogo, totali e margine non sono qui:
 * li mostra l'anteprima a destra del preventivo (`components/preventivatore`).
 *
 * I tre parametri (`sconto_pct`, `iva_pct`, `detrazione_pct`) sono controllati
 * via `form`/`onChange`: l'autosave del wizard li persiste su `idr_progetti`.
 * I totali si ricalcolano con `useMemo` (nessun setState-in-effect, nessun
 * `Date.now()`/`Math.random()` in render).
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, BadgePercent, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { calcTotaliComputo } from "@/lib/termoidraulico/calcoli";
import { INCENTIVI_TERMOIDRAULICO } from "@/lib/preventivi/incentivi";
import type { IdrComputoVoce, IdrProgetto } from "@/types/termoidraulico";
import type { IdrFormPatch } from "./types";
import { FinanziamentoQuoteToggle } from "@/components/moduli/FinanziamentoQuoteToggle";
import { ScontoGlobaleField } from "@/components/preventivi/ScontoGlobaleField";
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";
import { useIdrTemplatePdf } from "@/hooks/useTermoidraulicoProgetto";
import { ContoTermicoEconomia } from "@/components/termoidraulico/contoTermico/ContoTermicoEconomia";
import { leggiDatiContoTermico } from "@/lib/contoTermico/dati";
import { FullElectricEconomia } from "@/components/termoidraulico/fullElectric/FullElectricEconomia";
import { leggiDatiFullElectric } from "@/lib/fullElectric/dati";

interface Props {
  form: Partial<IdrProgetto>;
  onChange: <K extends keyof IdrFormPatch>(key: K, value: IdrFormPatch[K]) => void;
  computo: IdrComputoVoce[];
  /** L'intervento della libreria: col Conto Termico e la Casa Full Electric la detrazione generica lascia il posto ai loro incentivi. */
  model?: { id: string } | null;
  /** Dal pulsante del computo vuoto: porta al passo Computo. */
  onVaiAlPasso?: (passo: "computo") => void;
}

/** Coerce numerico controllato: stringa vuota → 0, clamp [0,100] per le percentuali. */
const toPct = (raw: string): number => {
  const t = raw.trim();
  if (t === "") return 0;
  const v = Number(t.replace(",", "."));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
};

export default function StepEconomia({ form, onChange, computo, model, onVaiAlPasso }: Props) {
  const contoTermico = model?.id === "conto-termico";
  const fullElectric = model?.id === "full-electric";
  // Prezzo scritto a mano e incentivi propri: la detrazione generica non serve.
  const incentiviPropri = contoTermico || fullElectric;
  // Template del modulo (cached): serve a mostrare la rata solo se la promo è attiva.
  const { data: template } = useIdrTemplatePdf();
  const scontoPct = Number(form.sconto_pct ?? 0);
  // IVA di riserva = default della colonna iva_pct del modulo (22), non 10 (05/10/2026).
  const ivaPct = Number(form.iva_pct ?? 22);

  // Totali ricalcolati live (puro, memoizzato): single source of truth dei numeri.
  const totali = useMemo(
    () =>
      calcTotaliComputo(
        computo.map((v) => ({
          capitolo_nome: v.capitolo_nome,
          quantita: v.quantita,
          prezzo_unitario: v.prezzo_unitario,
          sconto_pct: v.sconto_pct,
          costo_materiali: v.costo_materiali,
          costo_manodopera: v.costo_manodopera,
        })),
        // Il prezzo scritto a mano prende il posto della somma delle righe.
        { sconto_pct: scontoPct, iva_pct: ivaPct, prezzo_manuale: form.prezzo_manuale ?? null },
      ),
    [computo, scontoPct, ivaPct, form.prezzo_manuale],
  );

  // Prezzo pieno prima dello sconto globale: la somma delle righe o il prezzo scritto.
  const imponibileLordo = totali.imponibileLordo;

  const hasComputo = computo.length > 0;

  return (
    // Telefono: colonna con spazi fissi, così il titolo nascosto non lascia un buco in cima.
    <div className="space-y-3 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0">
      {/* Header */}
      {/* Telefono: il titolo lo dice già il passo in alto. */}
      <div className="max-sm:hidden">
        <h2 className="text-sm font-semibold text-slate-900">Economia</h2>
        <p className="text-[11px] text-muted-foreground max-sm:hidden">
          Sconto, IVA ed eventuale detrazione fiscale. I totali sono nell'anteprima del preventivo.
        </p>
      </div>

      {!hasComputo && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="flex-1 text-[11px] text-amber-900">
            <span className="max-sm:hidden">Il computo è ancora vuoto: torna allo step <span className="font-medium">Computo</span> per
            aggiungere le lavorazioni.</span>
            <span className="sm:hidden">Computo vuoto: le lavorazioni si aggiungono nel passo Computo.</span>
          </p>
          {onVaiAlPasso && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 self-center border-amber-200 bg-white px-2.5 text-[11px] text-amber-900 hover:bg-amber-50"
              onClick={() => onVaiAlPasso("computo")}
            >
              Vai al Computo
            </Button>
          )}
        </div>
      )}

      {/* I campi che cambiano il prezzo. I totali li mostra l'anteprima del preventivo. */}
      <div className="max-w-3xl space-y-3 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0">
        {/* Parametri economici */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Percent className="h-4 w-4 text-orange-600" /> Parametri
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PrezzoPreventivoAMano
              id="idr-prezzo-manuale"
              companyId={form.company_id}
              value={form.prezzo_manuale}
              sommaVoci={totali.sommaVoci}
              onCommit={(v) => onChange("prezzo_manuale", v)}
              sempre={incentiviPropri}
            />
            {/* Prezzo: sconto (con i tasti veloci) e IVA, le due leve che cambiano il totale. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] items-start gap-3">
              <ScontoGlobaleField
                id="idr-sconto"
                value={form.sconto_pct ?? 0}
                onCommit={(v) => onChange("sconto_pct", v)}
                imponibileLordo={imponibileLordo}
                tipoLavoro="termoidraulico"
                conScontoRapido
                ivaPct={ivaPct}
              />
              <PctField
                id="idr-iva"
                label="IVA"
                value={form.iva_pct ?? 22}
                onCommit={(v) => onChange("iva_pct", v)}
                hint="In edilizia spesso 10% (termoidraulico) o 4% (prima casa)."
              />
            </div>
            {/* Rata nel PDF: compare solo se la promo è configurata nel template,
                con la rata concreta sul totale corrente (scelta per-preventivo). */}
            <FinanziamentoQuoteToggle
              rawPromo={(template as unknown as { finanziamento_promo?: unknown } | undefined)?.finanziamento_promo}
              total={totali.totale}
              value={form.mostra_finanziamento}
              onChange={(v) => onChange("mostra_finanziamento", v)}
              rateScelte={form.finanziamento_rate}
              onChangeRate={(n) => onChange("finanziamento_rate", n)}
            />
            {/* Detrazione fiscale e incentivi rapidi: dopo il prezzo e il pagamento. */}
            {!incentiviPropri && (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] items-start gap-3">
                <PctField
                  id="idr-detrazione"
                  label="Detrazione / bonus"
                  value={form.detrazione_pct ?? 0}
                  onCommit={(v) => onChange("detrazione_pct", v)}
                  hint="Opzionale: % di detrazione fiscale (es. 50%) — importo indicativo."
                  icon={BadgePercent}
                />
                {/* Preset incentivi termoidraulico: 1-click → imposta detrazione + massimale di spesa */}
                <div>
                  <p className="mb-1 text-[10px] text-muted-foreground max-sm:hidden">Incentivi rapidi (termoidraulico):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {INCENTIVI_TERMOIDRAULICO.map((inc) => {
                      const active =
                        Number(form.detrazione_pct ?? 0) === inc.pct &&
                        (form.massimale_detrazione ?? null) === inc.massimale;
                      return (
                        <button
                          key={inc.key}
                          type="button"
                          title={inc.hint}
                          onClick={() => {
                            onChange("detrazione_pct", inc.pct);
                            onChange("massimale_detrazione", inc.massimale);
                          }}
                          className={cn(
                            "tap-compact rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors",
                            active
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50/50",
                          )}
                        >
                          {inc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        {contoTermico && (
          <div>
            <ContoTermicoEconomia
              dati={leggiDatiContoTermico(form.conto_termico)}
              onChange={(dati) => onChange("conto_termico", dati)}
              prezzoIvaInclusa={totali.totale}
              ivaPct={ivaPct}
            />
          </div>
        )}
        {fullElectric && (
          <div>
            <FullElectricEconomia
              dati={leggiDatiFullElectric(form.full_electric)}
              onChange={(dati) => onChange("full_electric", dati)}
              prezzoIvaInclusa={totali.totale}
              ivaPct={ivaPct}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Campo percentuale controllato ──────────────────────────────────────────
interface PctFieldProps {
  id: string;
  label: string;
  value: number;
  onCommit: (value: number) => void;
  hint?: string;
  icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

function PctField({ id, label, value, onCommit, hint, icon: Icon }: PctFieldProps) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="flex items-center gap-1 text-xs">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="0.5"
          value={Number.isFinite(value) ? String(value) : "0"}
          onChange={(e) => onCommit(toPct(e.target.value))}
          className="h-9 pr-7 text-sm tabular-nums"
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          %
        </span>
      </div>
      {/* Telefono no: i suggerimenti sotto i campi. */}
      {hint && <p className="text-[10px] text-muted-foreground max-sm:hidden">{hint}</p>}
    </div>
  );
}


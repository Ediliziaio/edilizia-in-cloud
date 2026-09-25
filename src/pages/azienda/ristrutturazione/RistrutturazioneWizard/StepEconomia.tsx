/**
 * StepEconomia — parametri economici e riepilogo del preventivo (Task 19).
 *
 * Mostra:
 *  - riepilogo totali PER CAPITOLO + complessivo (da `calcTotaliComputo`)
 *  - input sconto globale %, IVA %, detrazione/bonus % (opzionale)
 *  - importo detraibile indicativo (= imponibile × detrazione%)
 *  - margine complessivo (€/%)
 *
 * I tre parametri (`sconto_pct`, `iva_pct`, `detrazione_pct`) sono controllati
 * via `form`/`onChange`: l'autosave del wizard li persiste su `rst_progetti`.
 * I totali si ricalcolano con `useMemo` (nessun setState-in-effect, nessun
 * `Date.now()`/`Math.random()` in render). Numeri it-IT EUR via `formatCurrency`.
 *
 * Nota sul calcolo: `calcTotaliComputo` ritorna `perCapitolo[].imponibile` come
 * somma delle righe (LORDA, pre sconto globale) mentre `imponibile` top-level è
 * POST sconto globale. Per coerenza visiva mostriamo i subtotali per capitolo e,
 * sotto, una riga esplicita "Sconto globale" che riconcilia con l'imponibile.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Euro, Percent, TrendingUp, BadgePercent, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcTotaliComputo, calcRigaImporto } from "@/lib/ristrutturazione/calcoli";
import { INCENTIVI_RISTRUTTURAZIONE, calcDetraibile, superaMassimale } from "@/lib/preventivi/incentivi";
import type { RstComputoVoce, RstProgetto } from "@/types/ristrutturazione";
import type { RstFormPatch } from "./types";
import { FinanziamentoQuoteToggle } from "@/components/moduli/FinanziamentoQuoteToggle";
import { ScontoGlobaleField } from "@/components/preventivi/ScontoGlobaleField";
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";
import { useRstTemplatePdf } from "@/hooks/useRistrutturazioneProgetto";

interface Props {
  form: Partial<RstProgetto>;
  onChange: <K extends keyof RstFormPatch>(key: K, value: RstFormPatch[K]) => void;
  computo: RstComputoVoce[];
}

/** Coerce numerico controllato: stringa vuota → 0, clamp [0,100] per le percentuali. */
const toPct = (raw: string): number => {
  const t = raw.trim();
  if (t === "") return 0;
  const v = Number(t.replace(",", "."));
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, v));
};

export default function StepEconomia({ form, onChange, computo }: Props) {
  // Template del modulo (cached): serve a mostrare la rata solo se la promo è attiva.
  const { data: template } = useRstTemplatePdf();
  const scontoPct = Number(form.sconto_pct ?? 0);
  const ivaPct = Number(form.iva_pct ?? 22);
  const detrazionePct = Number(form.detrazione_pct ?? 0);

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

  // Somma delle righe (per il riepilogo per capitolo) e prezzo pieno prima dello
  // sconto globale: coincidono, tranne quando il prezzo è scritto a mano.
  const lordoCapitoli = totali.sommaVoci;
  const imponibileLordo = totali.imponibileLordo;
  const scontoGlobaleEur = Math.max(0, imponibileLordo - totali.imponibile);
  const massimale = form.massimale_detrazione ?? null;
  const detraibileEur = calcDetraibile(totali.imponibile, detrazionePct, massimale);
  const oltreMassimale = detrazionePct > 0 && superaMassimale(totali.imponibile, massimale);

  // Riepilogo per ambiente (computo per stanza): solo se almeno una voce ha un ambiente.
  const perAmbiente = useMemo(() => {
    if (!computo.some((v) => v.ambiente?.trim())) return [] as Array<{ ambiente: string; importo: number; voci: number }>;
    const map = new Map<string, { ambiente: string; importo: number; voci: number }>();
    for (const v of computo) {
      const amb = v.ambiente?.trim() || "Non assegnato";
      const imp = calcRigaImporto({ quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, sconto_pct: v.sconto_pct });
      const cur = map.get(amb) ?? { ambiente: amb, importo: 0, voci: 0 };
      cur.importo += imp;
      cur.voci += 1;
      map.set(amb, cur);
    }
    return [...map.values()].sort((a, b) => b.importo - a.importo);
  }, [computo]);

  const hasComputo = computo.length > 0;

  return (
    // Telefono: colonna con spazi fissi, così il titolo nascosto non lascia un buco in cima.
    <div className="space-y-3 max-sm:flex max-sm:flex-col max-sm:gap-3 max-sm:space-y-0">
      {/* Header */}
      {/* Telefono: il titolo lo dice già il passo in alto. */}
      <div className="max-sm:hidden">
        <h2 className="text-sm font-semibold text-slate-900">Economia</h2>
        <p className="text-[11px] text-muted-foreground max-sm:hidden">
          Sconto, IVA, eventuale detrazione fiscale e riepilogo del preventivo.{" "}
          {totali.prezzoManuale ? "I totali partono dal prezzo scritto nei Parametri." : "I totali derivano dal computo."}
        </p>
      </div>

      {!hasComputo && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-[11px] text-amber-900">
            <span className="max-sm:hidden">Il computo è ancora vuoto: torna allo step <span className="font-medium">Computo</span> per
            aggiungere le lavorazioni. Qui vedrai i totali aggregati.</span>
            <span className="sm:hidden">Computo vuoto: le lavorazioni si aggiungono nel passo Computo.</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
        {/* ─── Riepilogo per capitolo — telefono: nascosto finché è vuoto ─── */}
        {/* Telefono no: gli stessi capitoli coi totali stanno nel riepilogo del passo PDF. */}
        <Card className="max-sm:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Euro className="h-4 w-4 text-orange-600" /> Riepilogo per capitolo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {totali.perCapitolo.length === 0 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">
                Nessuna voce nel computo.
              </p>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 text-left font-medium">Capitolo</th>
                      <th className="px-2 py-2 text-right font-medium">Voci</th>
                      <th className="px-4 py-2 text-right font-medium">Imponibile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totali.perCapitolo.map((c) => (
                      <tr key={c.nome} className="border-b last:border-0">
                        <td className="px-4 py-2 font-medium text-slate-800">{c.nome}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{c.voci}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                          {formatCurrency(c.imponibile)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td className="px-4 py-2 text-xs font-medium text-muted-foreground" colSpan={2}>
                        Subtotale lavorazioni
                      </td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(lordoCapitoli)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── Parametri + totali complessivi ──────────────────────────────── */}
        <div className="space-y-3">
          {/* Parametri economici */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm">
                <Percent className="h-4 w-4 text-orange-600" /> Parametri
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <PrezzoPreventivoAMano
                id="rst-prezzo-manuale"
                companyId={form.company_id}
                value={form.prezzo_manuale}
                sommaVoci={totali.sommaVoci}
                onCommit={(v) => onChange("prezzo_manuale", v)}
              />
              <ScontoGlobaleField
                id="rst-sconto"
                value={form.sconto_pct ?? 0}
                onCommit={(v) => onChange("sconto_pct", v)}
                imponibileLordo={imponibileLordo}
                tipoLavoro="ristrutturazione"
              />
              {/* Telefono: IVA e detrazione affiancate. */}
              <div className="space-y-3 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2 max-sm:space-y-0">
                <PctField
                  id="rst-iva"
                  label="IVA"
                  value={form.iva_pct ?? 22}
                  onCommit={(v) => onChange("iva_pct", v)}
                  hint="In edilizia spesso 10% (ristrutturazione) o 4% (prima casa)."
                />
                <PctField
                  id="rst-detrazione"
                  label="Detrazione / bonus"
                  value={form.detrazione_pct ?? 0}
                  onCommit={(v) => onChange("detrazione_pct", v)}
                  hint="Opzionale: % di detrazione fiscale (es. 50%) — importo indicativo."
                  icon={BadgePercent}
                />
              </div>
              {/* Rata nel PDF: compare solo se la promo è configurata nel template,
                  con la rata concreta sul totale corrente (scelta per-preventivo). */}
              <FinanziamentoQuoteToggle
                rawPromo={(template as unknown as { finanziamento_promo?: unknown } | undefined)?.finanziamento_promo}
                total={totali.totale}
                value={form.mostra_finanziamento}
                onChange={(v) => onChange("mostra_finanziamento", v)}
              />
              {/* Preset incentivi ristrutturazione: 1-click → imposta detrazione + massimale di spesa */}
              <div>
                <p className="mb-1 text-[10px] text-muted-foreground max-sm:hidden">Incentivi rapidi (con massimale):</p>
                <div className="flex flex-wrap gap-1.5">
                  {INCENTIVI_RISTRUTTURAZIONE.map((inc) => {
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
            </CardContent>
          </Card>

          {/* Totali complessivi */}
          <Card className="border-orange-200 bg-gradient-to-b from-orange-50/50 to-transparent">
            <CardContent className="space-y-2 p-4">
              {/* Telefono: senza sconto è uguale all'imponibile netto, una riga basta. */}
              <div className={scontoGlobaleEur > 0 ? undefined : "max-sm:hidden"}>
                <SummaryRow label={totali.prezzoManuale ? "Prezzo del preventivo" : "Imponibile (lordo)"} value={imponibileLordo} muted />
              </div>
              {scontoGlobaleEur > 0 && (
                <SummaryRow
                  label={`Sconto globale (${scontoPct.toLocaleString("it-IT")}%)`}
                  value={-scontoGlobaleEur}
                  tone="discount"
                />
              )}
              <SummaryRow label="Imponibile netto" value={totali.imponibile} />
              <SummaryRow label={`IVA (${ivaPct.toLocaleString("it-IT")}%)`} value={totali.iva} muted />
              <div className="my-1 border-t" />
              <SummaryRow label="Totale" value={totali.totale} emphasize />

              {detrazionePct > 0 && (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-800">
                      <BadgePercent className="h-3.5 w-3.5" />
                      Detrazione indicativa ({detrazionePct.toLocaleString("it-IT")}%)
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-emerald-700">
                      {formatCurrency(detraibileEur)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-emerald-700/80 max-sm:hidden">
                    {massimale != null
                      ? `Calcolata sul tetto di spesa di ${formatCurrency(massimale)}${oltreMassimale ? " — spesa oltre il massimale" : ""}. `
                      : "Stima su imponibile netto. "}
                    Non sostituisce la valutazione di un fiscalista.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Margine complessivo */}
          <Card className="max-sm:hidden">
            <CardContent className="flex items-center justify-between gap-2 p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-800">Margine complessivo</p>
                  <p className="text-[10px] text-muted-foreground">Imponibile netto − costi</p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "text-base font-bold tabular-nums",
                    totali.margineEur >= 0 ? "text-emerald-600" : "text-rose-600",
                  )}
                >
                  {formatCurrency(totali.margineEur)}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] tabular-nums",
                    totali.margineEur >= 0
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-rose-200 bg-rose-50 text-rose-700",
                  )}
                >
                  {totali.marginePct.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Riepilogo per ambiente (computo per stanza) ─── */}
      {perAmbiente.length > 0 && (
        <Card className="max-sm:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4 text-orange-600" /> Riepilogo per ambiente
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {perAmbiente.map((a) => (
                  <tr key={a.ambiente} className="border-b last:border-0">
                    <td className="px-4 py-2 font-medium text-slate-800">{a.ambiente}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{a.voci} voci</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(a.importo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-[10px] text-muted-foreground max-sm:hidden">
              Importi lordi per ambiente (pre sconto globale). Assegna l'ambiente alle voci nello step Computo (dettagli voce).
            </p>
          </CardContent>
        </Card>
      )}
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

// ─── Riga di riepilogo ──────────────────────────────────────────────────────
function SummaryRow({
  label, value, muted, emphasize, tone,
}: {
  label: string;
  value: number;
  muted?: boolean;
  emphasize?: boolean;
  tone?: "discount";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          emphasize ? "text-sm font-semibold text-slate-900" : "text-xs",
          muted ? "text-muted-foreground" : tone === "discount" ? "text-rose-600" : "text-slate-700",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasize ? "text-lg font-bold text-orange-600" : "text-sm font-medium",
          muted ? "text-muted-foreground" : tone === "discount" ? "text-rose-600" : "text-slate-900",
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}

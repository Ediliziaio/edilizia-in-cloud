/**
 * StepEconomia — parametri economici del preventivo (Task 19): sconto, IVA,
 * detrazione, prezzo scritto a mano. Riepilogo, totali e margine non sono qui:
 * li mostra l'anteprima a destra del preventivo (`components/preventivatore`).
 *
 * I tre parametri (`sconto_pct`, `iva_pct`, `detrazione_pct`) sono controllati
 * via `form`/`onChange`: l'autosave del wizard li persiste su `rst_progetti`.
 * I totali si ricalcolano con `useMemo` (nessun setState-in-effect, nessun
 * `Date.now()`/`Math.random()` in render).
 */
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Percent, BadgePercent, Info, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcTotaliComputo, calcRigaImporto } from "@/lib/ristrutturazione/calcoli";
import { INCENTIVI_RISTRUTTURAZIONE } from "@/lib/preventivi/incentivi";
import type { RstComputoVoce, RstProgetto } from "@/types/ristrutturazione";
import type { RstFormPatch } from "./types";
import { FinanziamentoQuoteToggle } from "@/components/moduli/FinanziamentoQuoteToggle";
import { PianoPagamentoCard } from "@/components/moduli/PianoPagamentoCard";
import { ObiettivoETempiCard } from "@/components/moduli/ObiettivoETempiCard";
import { CronoprogrammaCard } from "@/components/moduli/CronoprogrammaCard";
import { ScontoGlobaleField } from "@/components/preventivi/ScontoGlobaleField";
import { PrezzoPreventivoAMano } from "@/components/preventivi/PrezzoPreventivoAMano";
import { useRstTemplatePdf } from "@/hooks/useRistrutturazioneProgetto";

interface Props {
  form: Partial<RstProgetto>;
  onChange: <K extends keyof RstFormPatch>(key: K, value: RstFormPatch[K]) => void;
  computo: RstComputoVoce[];
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

export default function StepEconomia({ form, onChange, computo, onVaiAlPasso }: Props) {
  // Template del modulo (cached): serve a mostrare la rata solo se la promo è attiva.
  const { data: template } = useRstTemplatePdf();
  const scontoPct = Number(form.sconto_pct ?? 0);
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
          bene_significativo: v.bene_significativo === true,
          opzionale: v.opzionale,
        })),
        // Il prezzo scritto a mano prende il posto della somma delle righe.
        {
          sconto_pct: scontoPct,
          iva_pct: ivaPct,
          prezzo_manuale: form.prezzo_manuale ?? null,
          iva_beni_significativi: form.iva_beni_significativi === true,
        },
      ),
    [computo, scontoPct, ivaPct, form.prezzo_manuale, form.iva_beni_significativi],
  );
  const vociBeniSignificativi = computo.filter((v) => v.bene_significativo).length;

  // Prezzo pieno prima dello sconto globale: la somma delle righe o il prezzo scritto.
  const imponibileLordo = totali.imponibileLordo;

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
              id="rst-prezzo-manuale"
              companyId={form.company_id}
              value={form.prezzo_manuale}
              sommaVoci={totali.sommaVoci}
              onCommit={(v) => onChange("prezzo_manuale", v)}
            />
            {/* Prezzo: sconto (con i tasti veloci) e IVA, le due leve che cambiano il totale. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] items-start gap-3">
              <ScontoGlobaleField
                id="rst-sconto"
                value={form.sconto_pct ?? 0}
                onCommit={(v) => onChange("sconto_pct", v)}
                imponibileLordo={imponibileLordo}
                tipoLavoro="ristrutturazione"
                conScontoRapido
                ivaPct={ivaPct}
              />
              <PctField
                id="rst-iva"
                label="IVA"
                value={form.iva_pct ?? 22}
                onCommit={(v) => onChange("iva_pct", v)}
                hint="In edilizia spesso 10% (ristrutturazione) o 4% (prima casa)."
              />
            </div>
            {/* Beni significativi (DM 29/12/1999): solo con l'IVA al 10% della manutenzione. */}
            {ivaPct === 10 && (
              <div className="rounded-lg border p-3">
                <label htmlFor="rst-beni-significativi" className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    id="rst-beni-significativi"
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-orange-600"
                    checked={form.iva_beni_significativi === true}
                    onChange={(e) => onChange("iva_beni_significativi", e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Applica le regole dei beni significativi</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Infissi, caldaie, sanitari e rubinetteria, climatizzatori, ascensori… hanno il 10% solo fino al
                      valore del resto dei lavori: la parte che lo supera va al 22% (DM 29/12/1999). Segna le voci nel
                      Computo, in «Dettagli voce».
                    </span>
                  </span>
                </label>
                {form.iva_beni_significativi === true && (
                  <p className="mt-2 text-[11px] text-slate-700">
                    {vociBeniSignificativi === 0
                      ? "Nessuna voce segnata come bene significativo: l'IVA resta tutta al 10%."
                      : totali.ivaRipartita
                        ? totali.ivaRipartita.imponibile22 > 0
                          ? `Beni significativi ${formatCurrency(totali.ivaRipartita.beniSignificativi)}: al 10% ${formatCurrency(totali.ivaRipartita.imponibile10)}, al 22% ${formatCurrency(totali.ivaRipartita.imponibile22)}. IVA ${formatCurrency(totali.iva)}.`
                          : `Beni significativi ${formatCurrency(totali.ivaRipartita.beniSignificativi)}: non superano il resto dei lavori, tutto resta al 10%.`
                        : ""}
                  </p>
                )}
              </div>
            )}
            {/* Rata nel PDF: compare solo se la promo è configurata nel template,
                con la rata concreta sul totale corrente (scelta per-preventivo). */}
            <FinanziamentoQuoteToggle
              rawPromo={(template as unknown as { finanziamento_promo?: unknown } | undefined)?.finanziamento_promo}
              total={totali.totale}
              value={form.mostra_finanziamento}
              onChange={(v) => onChange("mostra_finanziamento", v)}
              rateScelte={form.finanziamento_rate}
              onChangeRate={(n) => onChange("finanziamento_rate", n)}
              finanziaria={{
                tabellaId: form.finanziamento_tabella_id ?? null,
                tanPct: form.finanziamento_tan_pct ?? null,
                rata: form.finanziamento_rata ?? null,
                importo: form.finanziamento_importo ?? null,
              }}
              onChangeFinanziaria={(s) => {
                onChange("finanziamento_rate", s.rate);
                onChange("finanziamento_tabella_id", s.tabellaId);
                onChange("finanziamento_tan_pct", s.tanPct);
                onChange("finanziamento_rata", s.rata);
                onChange("finanziamento_importo", s.importo);
              }}
            />
            <PianoPagamentoCard
              piano={form.piano_pagamento}
              onChange={(p) => onChange("piano_pagamento", p)}
              totale={totali.totale}
              testoDelModello={(template as unknown as { payment_terms_text?: string | null } | undefined)?.payment_terms_text}
              modulo="ristrutturazione"
            />
            <CronoprogrammaCard
              fasi={form.cronoprogramma}
              onChange={(fasi) => onChange("cronoprogramma", fasi)}
              fasiDelModello={(template as unknown as { cronoprogramma?: unknown } | undefined)?.cronoprogramma}
              modulo="ristrutturazione"
            />
            {/* Detrazione fiscale e incentivi rapidi: dopo il prezzo e il pagamento. */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(16rem,100%),1fr))] items-start gap-3">
              <PctField
                id="rst-detrazione"
                label="Detrazione / bonus"
                value={form.detrazione_pct ?? 0}
                onCommit={(v) => onChange("detrazione_pct", v)}
                hint="Opzionale: % di detrazione fiscale (es. 50%) — importo indicativo."
                icon={BadgePercent}
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
            </div>
          </CardContent>
        </Card>
        <ObiettivoETempiCard righe={computo} base={totali} />
      </div>

      {/* ─── Riepilogo per ambiente (computo per stanza) ─── */}
      {perAmbiente.length > 0 && (
        <Card className="max-w-3xl max-sm:hidden">
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
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{a.voci} {a.voci === 1 ? "voce" : "voci"}</td>
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


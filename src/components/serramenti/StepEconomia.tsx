/**
 * StepEconomia — Step 6 wizard: forbice prezzo + Ecobonus + ROI 10 anni.
 *
 * Sezioni:
 *  - Riepilogo BOM (auto-calcolato)
 *  - Sconto / range forbice
 *  - Configurazione finanziamento (anticipo % + piani)
 *  - Detrazione fiscale (50/65%)
 *  - Calcolo risparmio energetico
 *  - Grafico cashflow 10 anni
 */
import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Euro, TrendingUp, Leaf, Calculator, Calendar, HelpCircle,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { calcolaTotale, forbicePrezzo } from "@/lib/serramenti/calcoli";
import {
  calcolaEcobonus, calcolaCashflow, calcolaPianoFinanziamento,
} from "@/lib/serramenti/ecobonus";
import {
  calcolaRisparmio, zonaDaCap, bollettaMediaRiscaldamento,
  type ZonaClimatica,
} from "@/lib/serramenti/risparmio";
import type {
  SrProgettoRow, SrProgettoDetail, SrPianoFinanziamento, SrCashflowRiga,
} from "@/types/serramenti";
import {
  SrCard, SrKpi, SrCallout, formatEuro, formatPct, formatNumero,
} from "@/lib/serramenti/wizardUI";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  form: Partial<SrProgettoRow>;
  onChange: <K extends keyof SrProgettoRow>(key: K, value: SrProgettoRow[K]) => void;
}

export function StepEconomia({ detail, form, onChange }: Props) {
  // ─── Calcoli BOM ──────────────────────────────────────────────────────────
  const totaleCalc = useMemo(() =>
    calcolaTotale(
      detail.serramenti,
      detail.accessori,
      {
        iva_percentuale: form.iva_percentuale ?? 22,
        sconto_percentuale: form.sconto_percentuale ?? 0,
        sconto_importo: form.sconto_importo ?? 0,
      },
      detail.servizi ?? detail.manodopera ?? [],
    ),
    [detail.serramenti, detail.accessori, detail.servizi, detail.manodopera, form.iva_percentuale, form.sconto_percentuale, form.sconto_importo],
  );

  const forbice = useMemo(() => forbicePrezzo(totaleCalc.totale_iva_inclusa, 12), [totaleCalc.totale_iva_inclusa]);

  // Salva totale_min/max nel progetto quando cambia il calc
  useEffect(() => {
    if (forbice.min !== Number(form.totale_min ?? 0)) {
      onChange("totale_min", forbice.min);
    }
    if (forbice.max !== Number(form.totale_max ?? 0)) {
      onChange("totale_max", forbice.max);
    }
  }, [forbice.min, forbice.max]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Finanziamento ────────────────────────────────────────────────────────
  const [anticipoPct, setAnticipoPct] = useState(form.fin_anticipo_pct ?? 40);
  const [piano1Mesi, setPiano1Mesi] = useState(120);
  const [piano1Tasso, setPiano1Tasso] = useState(5.5);
  const [piano2Mesi, setPiano2Mesi] = useState(60);
  const [piano2Tasso, setPiano2Tasso] = useState(0);

  const finCalc = useMemo(() => calcolaPianoFinanziamento({
    importo_totale: forbice.media,
    anticipo_pct: anticipoPct,
    piani: [
      { nome: "Estesa", durata_mesi: piano1Mesi, tasso_annuo_pct: piano1Tasso },
      { nome: "Standard", durata_mesi: piano2Mesi, tasso_annuo_pct: piano2Tasso },
    ],
  }), [forbice.media, anticipoPct, piano1Mesi, piano1Tasso, piano2Mesi, piano2Tasso]);

  // ─── Ecobonus ─────────────────────────────────────────────────────────────
  const [bonusAttivo, setBonusAttivo] = useState((form.detrazione_aliquota ?? 50) > 0);
  const [aliquota, setAliquota] = useState<50 | 65>((form.detrazione_aliquota === 65 ? 65 : 50));

  const ecobonusCalc = useMemo(() =>
    bonusAttivo
      ? calcolaEcobonus({ imponibile_eur: forbice.media, aliquota })
      : null,
    [bonusAttivo, forbice.media, aliquota],
  );

  // ─── Risparmio energetico ─────────────────────────────────────────────────
  const [risparmioAttivo, setRisparmioAttivo] = useState(form.risparmio_calcolato ?? false);
  const [m2Casa, setM2Casa] = useState(100);
  const [uwAttuale, setUwAttuale] = useState(2.8);
  const [uwNuovo, setUwNuovo] = useState(1.1);
  const [bollettaAttuale, setBollettaAttuale] = useState<number>(0);

  const zonaClimatica: ZonaClimatica = useMemo(() => {
    const cap = form.cantiere_cap || form.cliente_cap;
    return (form.cantiere_zona_climatica as ZonaClimatica) || zonaDaCap(cap);
  }, [form.cantiere_zona_climatica, form.cantiere_cap, form.cliente_cap]);

  useEffect(() => {
    if (bollettaAttuale === 0) {
      setBollettaAttuale(bollettaMediaRiscaldamento(zonaClimatica, m2Casa));
    }
  }, [zonaClimatica, m2Casa]); // eslint-disable-line react-hooks/exhaustive-deps

  const risparmioCalc = useMemo(() =>
    risparmioAttivo && totaleCalc.metri_quadri > 0
      ? calcolaRisparmio({
          zona_climatica: zonaClimatica,
          m2_serramenti: totaleCalc.metri_quadri,
          uw_attuale: uwAttuale,
          uw_nuovo: uwNuovo,
          bolletta_attuale_anno: bollettaAttuale || undefined,
        })
      : null,
    [risparmioAttivo, totaleCalc.metri_quadri, zonaClimatica, uwAttuale, uwNuovo, bollettaAttuale],
  );

  // ─── Cashflow 10 anni ─────────────────────────────────────────────────────
  const cashflow = useMemo(() => {
    if (!risparmioCalc || !ecobonusCalc) return null;
    return calcolaCashflow({
      costo_iniziale: forbice.media,
      risparmio_eur_anno: risparmioCalc.risparmio_eur_anno,
      detrazione_eur_anno: ecobonusCalc.rata_annuale,
      inflazione_energia_pct: 3,
    });
  }, [risparmioCalc, ecobonusCalc, forbice.media]);

  // Salva finanziamento + detrazione nel progetto
  const handleSalvaCalcoli = () => {
    const piani: SrPianoFinanziamento[] = finCalc.piani.map((p) => ({
      nome: p.nome, mesi: p.mesi, tasso: p.tasso,
      rata_mese: p.rata_mese, anticipo: finCalc.anticipo, finanziato: finCalc.finanziato,
    }));
    onChange("fin_anticipo_pct", anticipoPct);
    onChange("fin_piani", piani);
    if (ecobonusCalc) {
      onChange("detrazione_aliquota", ecobonusCalc.aliquota);
      onChange("detrazione_eur_totale", ecobonusCalc.detrazione_totale);
      onChange("detrazione_eur_anno", ecobonusCalc.rata_annuale);
    } else {
      onChange("detrazione_aliquota", null);
    }
    if (risparmioCalc) {
      onChange("risparmio_calcolato", true);
      onChange("risparmio_eur_anno", risparmioCalc.risparmio_eur_anno);
      onChange("co2_risparmiata_t_anno", risparmioCalc.co2_risparmiata_kg_anno / 1000);
      onChange("cantiere_zona_climatica", risparmioCalc.zona_climatica);
    } else {
      onChange("risparmio_calcolato", false);
    }
    if (cashflow) {
      onChange("payback_anni", cashflow.payback_anni);
    }
  };

  return (
    <div className="space-y-3">
      {/* Riepilogo BOM */}
      <SrCard
        title="Riepilogo composizione"
        description={`${detail.serramenti.length} serramenti (posa inclusa) · ${detail.accessori.length} accessori · ${(detail.servizi ?? detail.manodopera ?? []).length} servizi · ${formatNumero(totaleCalc.metri_quadri, 2)} m²`}
        icon={<Calculator className="h-4 w-4" />}
      >
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <SrKpi label="Serramenti" value={formatEuro(totaleCalc.imponibile_serramenti)} hint="Posa inclusa nei prezzi" />
          <SrKpi label="Accessori" value={formatEuro(totaleCalc.imponibile_accessori)} />
          <SrKpi label="Servizi" value={formatEuro(totaleCalc.imponibile_servizi)} hint="Trasporto, ENEA, ecc." />
          <SrKpi label="Imponibile" value={formatEuro(totaleCalc.imponibile_netto)} hint={totaleCalc.sconto > 0 ? `Sconto: -${formatEuro(totaleCalc.sconto)}` : undefined} />
          <SrKpi label="IVA inclusa" value={formatEuro(totaleCalc.totale_iva_inclusa)} variant="primary" />
        </div>
      </SrCard>

      {/* Sconto + forbice */}
      <SrCard
        title="Forbice prezzo (PDF cliente)"
        description="Il prezzo definitivo si fissa con sopralluogo e scelta materiali. Mostra una forbice indicativa."
        icon={<Euro className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Sconto %</Label>
            <Input
              type="number"
              min={0} max={100} step={0.5}
              defaultValue={form.sconto_percentuale ?? 0}
              onBlur={(e) => onChange("sconto_percentuale", Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Sconto fisso (€)</Label>
            <Input
              type="number"
              min={0} step={10}
              defaultValue={form.sconto_importo ?? 0}
              onBlur={(e) => onChange("sconto_importo", Math.max(0, Number(e.target.value) || 0))}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">IVA %</Label>
            <Input
              type="number"
              defaultValue={form.iva_percentuale ?? 22}
              onBlur={(e) => onChange("iva_percentuale", Number(e.target.value) || 22)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs">Validità (giorni)</Label>
            <Input
              type="number"
              defaultValue={form.valido_fino_giorni ?? 15}
              onBlur={(e) => onChange("valido_fino_giorni", Number(e.target.value) || 15)}
              className="h-9 text-xs"
            />
          </div>
          <div className="col-span-12 mt-1">
            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-[10px] uppercase font-semibold text-emerald-900 mb-1">Il tuo investimento stimato</p>
              <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                {formatEuro(forbice.min)} – {formatEuro(forbice.max)}
                <span className="text-xs font-normal opacity-70 ml-2">IVA inclusa</span>
              </p>
              <p className="text-[10px] text-emerald-800 mt-1">Media: {formatEuro(forbice.media)}</p>
            </div>
          </div>
        </div>
      </SrCard>

      {/* Finanziamento */}
      <SrCard
        title="Simulazione finanziamento"
        description="Anticipo + 2 piani di rateizzazione (estesa e standard). Compare nella pagina 2 del PDF."
        icon={<Euro className="h-4 w-4" />}
      >
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Label className="text-xs">Anticipo %</Label>
            <Input
              type="number"
              min={0} max={100} step={5}
              value={anticipoPct}
              onChange={(e) => setAnticipoPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="h-9 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {formatEuro(finCalc.anticipo)} su {formatEuro(forbice.media)}
            </p>
          </div>
          <div className="col-span-12 md:col-span-8">
            <Label className="text-xs">Finanziato</Label>
            <div className="h-9 px-3 flex items-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
              {formatEuro(finCalc.finanziato)}
            </div>
          </div>
          {/* Piano 1 (Estesa) */}
          <div className="col-span-12 grid grid-cols-12 gap-2 mt-2">
            <div className="col-span-12">
              <p className="text-xs font-semibold uppercase text-emerald-900">Piano Estesa</p>
            </div>
            <div className="col-span-4 md:col-span-3">
              <Label className="text-xs">Durata (mesi)</Label>
              <Input type="number" value={piano1Mesi} onChange={(e) => setPiano1Mesi(Number(e.target.value) || 0)} className="h-9 text-xs" />
            </div>
            <div className="col-span-4 md:col-span-3">
              <Label className="text-xs">Tasso TAN %</Label>
              <Input type="number" step={0.1} value={piano1Tasso} onChange={(e) => setPiano1Tasso(Number(e.target.value) || 0)} className="h-9 text-xs" />
            </div>
            <div className="col-span-4 md:col-span-6">
              <Label className="text-xs">Rata mensile</Label>
              <div className="h-9 px-3 flex items-center text-sm font-bold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                {formatEuro(finCalc.piani[0]?.rata_mese, 0)}/mese
              </div>
            </div>
          </div>
          {/* Piano 2 (Standard) */}
          <div className="col-span-12 grid grid-cols-12 gap-2 mt-2">
            <div className="col-span-12">
              <p className="text-xs font-semibold uppercase text-emerald-900">Piano Standard</p>
            </div>
            <div className="col-span-4 md:col-span-3">
              <Label className="text-xs">Durata (mesi)</Label>
              <Input type="number" value={piano2Mesi} onChange={(e) => setPiano2Mesi(Number(e.target.value) || 0)} className="h-9 text-xs" />
            </div>
            <div className="col-span-4 md:col-span-3">
              <Label className="text-xs">Tasso TAN %</Label>
              <Input type="number" step={0.1} value={piano2Tasso} onChange={(e) => setPiano2Tasso(Number(e.target.value) || 0)} className="h-9 text-xs" />
            </div>
            <div className="col-span-4 md:col-span-6">
              <Label className="text-xs">Rata mensile</Label>
              <div className="h-9 px-3 flex items-center text-sm font-bold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
                {formatEuro(finCalc.piani[1]?.rata_mese, 0)}/mese
              </div>
            </div>
          </div>
        </div>
      </SrCard>

      {/* Ecobonus */}
      <SrCard
        title="Detrazione fiscale (Ecobonus)"
        description="Detrazione IRPEF recuperata in 10 quote annuali."
        icon={<Calendar className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between border rounded-md p-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Includi nel preventivo</p>
              <p className="text-[10px] text-muted-foreground">Aliquota Ecobonus 50% (Bonus Casa) o 65%</p>
            </div>
            <Switch checked={bonusAttivo} onCheckedChange={setBonusAttivo} />
          </div>
          {bonusAttivo && (
            <>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 md:col-span-4">
                  <Label className="text-xs">Aliquota</Label>
                  <Select value={String(aliquota)} onValueChange={(v) => setAliquota(Number(v) as 50 | 65)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50% Bonus Casa</SelectItem>
                      <SelectItem value="65">65% Ecobonus</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {ecobonusCalc && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SrKpi label="Base detraibile" value={formatEuro(ecobonusCalc.base_calcolo)} hint="Max 60.000 €" />
                  <SrKpi label="Aliquota" value={formatPct(ecobonusCalc.aliquota)} />
                  <SrKpi label="Detrazione totale" value={formatEuro(ecobonusCalc.detrazione_totale)} variant="success" />
                  <SrKpi label="Rata annuale × 10 anni" value={formatEuro(ecobonusCalc.rata_annuale)} variant="success" />
                </div>
              )}
            </>
          )}
        </div>
      </SrCard>

      {/* Risparmio energetico */}
      <SrCard
        title="Risparmio energetico (per il PDF)"
        description="Mostra al cliente quanto risparmierà ogni anno in bolletta + il payback completo dopo la detrazione."
        icon={<Leaf className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between border rounded-md p-2.5 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Calcola risparmio in bolletta</p>
              <p className="text-[10px] text-muted-foreground">
                Zona climatica rilevata: <span className="font-semibold">{zonaClimatica}</span> ·
                m² serramenti: {formatNumero(totaleCalc.metri_quadri, 2)}
              </p>
            </div>
            <Switch checked={risparmioAttivo} onCheckedChange={setRisparmioAttivo} />
          </div>
          {risparmioAttivo && (
            <>
              <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs flex items-center gap-1">
                    Uw attuale (W/m²K)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-emerald-600">
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold mb-1">Uw — Trasmittanza termica del serramento</p>
                        <p className="text-[11px]">Quanto calore disperde il serramento attuale (W per m² per °C di differenza). Più basso = meglio isola. Riferimenti tipici:</p>
                        <ul className="text-[11px] mt-1 space-y-0.5">
                          <li>• <strong>5.0</strong>: singolo vetro anni '70-'80</li>
                          <li>• <strong>2.8</strong>: vetrocamera vecchia (anni '90)</li>
                          <li>• <strong>2.0</strong>: PVC standard senza taglio termico</li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="number" step={0.1} value={uwAttuale}
                    onChange={(e) => setUwAttuale(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Singolo vetro: ~5.0 · Vecchia vetrocamera: ~2.8</p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs flex items-center gap-1">
                    Uw nuovo (W/m²K)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="text-muted-foreground hover:text-emerald-600">
                          <HelpCircle className="h-3 w-3" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs font-semibold mb-1">Uw del nuovo serramento</p>
                        <p className="text-[11px]">Valore dichiarato dal produttore (lo trovi in scheda tecnica). Riferimenti:</p>
                        <ul className="text-[11px] mt-1 space-y-0.5">
                          <li>• <strong>1.4</strong>: PVC standard con vetrocamera basso-em.</li>
                          <li>• <strong>1.1</strong>: PVC/Alluminio premium</li>
                          <li>• <strong>0.8</strong>: triplo vetro con argon e warm-edge</li>
                          <li>• Soglia minima Ecobonus zona E: <strong>≤ 1.4</strong></li>
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <Input
                    type="number" step={0.1} value={uwNuovo}
                    onChange={(e) => setUwNuovo(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Standard: 1.4 · Performante: 1.1 · Triplo vetro: 0.8</p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">m² casa</Label>
                  <Input
                    type="number" value={m2Casa}
                    onChange={(e) => setM2Casa(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="col-span-6 md:col-span-3">
                  <Label className="text-xs">Bolletta riscaldamento attuale (€/anno)</Label>
                  <Input
                    type="number" value={bollettaAttuale}
                    onChange={(e) => setBollettaAttuale(Number(e.target.value) || 0)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
              {risparmioCalc && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <SrKpi
                    label="Risparmio /anno"
                    value={formatEuro(risparmioCalc.risparmio_eur_anno)}
                    hint={`${formatNumero(risparmioCalc.risparmio_kwh_anno, 0)} kWh`}
                    variant="success"
                  />
                  {risparmioCalc.risparmio_pct != null && (
                    <SrKpi label="% bolletta" value={formatPct(risparmioCalc.risparmio_pct, 1)} variant="success" />
                  )}
                  <SrKpi
                    label="CO₂ /anno"
                    value={formatNumero(risparmioCalc.co2_risparmiata_kg_anno / 1000, 2)}
                    unit="t"
                    variant="success"
                    hint="Equivalente a ~5 alberi/anno"
                  />
                  <SrKpi
                    label="Zona climatica"
                    value={zonaClimatica}
                    hint={`${risparmioCalc.gradi_giorno} GG`}
                  />
                </div>
              )}
              </TooltipProvider>
            </>
          )}
        </div>
      </SrCard>

      {/* Cashflow 10 anni */}
      {cashflow && (
        <SrCard
          title="Cashflow 10 anni — vista cliente"
          description="Confronta investimento vs. risparmio bolletta + detrazione fiscale anno per anno."
          icon={<TrendingUp className="h-4 w-4" />}
          variant="highlight"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <SrKpi label="Investimento" value={formatEuro(forbice.media)} />
            <SrKpi label="Recuperato in 10 anni" value={formatEuro(cashflow.totale_recuperato_10y)} variant="success" />
            <SrKpi label="% Recupero" value={formatPct(cashflow.pct_recuperato_10y, 0)} variant={cashflow.pct_recuperato_10y >= 100 ? "success" : "warning"} />
            <SrKpi
              label="Payback"
              value={cashflow.payback_anni != null ? formatNumero(cashflow.payback_anni, 1) : ">10"}
              unit={cashflow.payback_anni != null ? "anni" : ""}
              variant={cashflow.payback_anni != null && cashflow.payback_anni <= 10 ? "success" : "warning"}
            />
          </div>
          <CashflowChart righe={cashflow.righe} costoIniziale={forbice.media} />
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Anno</TableHead>
                  <TableHead className="text-[10px]">Risparmio bolletta</TableHead>
                  <TableHead className="text-[10px]">Detrazione</TableHead>
                  <TableHead className="text-[10px]">Flusso anno</TableHead>
                  <TableHead className="text-[10px]">Cumulato</TableHead>
                  <TableHead className="text-[10px]">Netto vs. investimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashflow.righe.map((r) => (
                  <TableRow key={r.anno}>
                    <TableCell className="text-xs font-semibold">{r.anno}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.risparmio_bolletta)}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.detrazione)}</TableCell>
                    <TableCell className="text-xs font-semibold text-emerald-700">{formatEuro(r.flusso_anno)}</TableCell>
                    <TableCell className="text-xs">{formatEuro(r.cumulato)}</TableCell>
                    <TableCell className={`text-xs font-semibold ${r.netto >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                      {r.netto >= 0 ? "+" : ""}{formatEuro(r.netto)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SrCard>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSalvaCalcoli} className="bg-emerald-700 hover:bg-emerald-800">
          Applica calcoli al progetto
        </Button>
      </div>

      {detail.serramenti.length === 0 && (
        <SrCallout variant="warning">
          ⚠️ Aggiungi almeno un serramento nello Step 4 per calcolare il prezzo.
        </SrCallout>
      )}
    </div>
  );
}

// ─── Cashflow SVG chart (semplice, inline) ──────────────────────────────────

function CashflowChart({ righe, costoIniziale }: { righe: SrCashflowRiga[]; costoIniziale: number }) {
  const W = 600, H = 200, PAD = 30;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const maxValue = Math.max(costoIniziale, ...righe.map((r) => r.cumulato));
  const minValue = Math.min(0, ...righe.map((r) => r.netto));
  const range = maxValue - minValue || 1;

  const yScale = (v: number) => PAD + innerH - ((v - minValue) / range) * innerH;
  const xScale = (i: number) => PAD + (i / (righe.length - 1 || 1)) * innerW;

  const linePath = righe
    .map((r, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(r.cumulato)}`)
    .join(" ");

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-2xl border border-emerald-100 rounded-md bg-white">
        {/* Asse 0 */}
        <line x1={PAD} y1={yScale(0)} x2={W - PAD} y2={yScale(0)} stroke="#cbd5e1" strokeDasharray="2,2" />
        {/* Investimento line */}
        <line
          x1={PAD} y1={yScale(costoIniziale)}
          x2={W - PAD} y2={yScale(costoIniziale)}
          stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4,4"
        />
        <text x={W - PAD - 4} y={yScale(costoIniziale) - 4} textAnchor="end" fontSize="9" fill="#f43f5e">
          Investimento {formatEuro(costoIniziale)}
        </text>
        {/* Cumulato area */}
        <path
          d={`${linePath} L ${xScale(righe.length - 1)} ${yScale(0)} L ${xScale(0)} ${yScale(0)} Z`}
          fill="#2D7D5C20"
        />
        {/* Cumulato line */}
        <path d={linePath} fill="none" stroke="#2D7D5C" strokeWidth={2} />
        {/* Punti */}
        {righe.map((r, i) => (
          <g key={r.anno}>
            <circle cx={xScale(i)} cy={yScale(r.cumulato)} r={3} fill="#2D7D5C" />
            <text x={xScale(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#475569">
              {r.anno}
            </text>
          </g>
        ))}
        {/* Y axis labels */}
        <text x={4} y={yScale(maxValue) + 4} fontSize="9" fill="#475569">{formatEuro(maxValue)}</text>
        <text x={4} y={yScale(0) + 4} fontSize="9" fill="#475569">€ 0</text>
      </svg>
    </div>
  );
}

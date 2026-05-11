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
  Wallet, Tag, CreditCard, Plus, Trash2,
} from "lucide-react";
import { useDiscountRules } from "@/hooks/useDiscountRules";
import {
  useTabelleFinanziamentoAttive,
  useTabellaFinanziamentoRighe,
  findMigliorRiga,
  getDurateUniche,
} from "@/hooks/useTabelleFinanziamento";
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

  // ─── Sconto: collegamento alle regole azienda ────────────────────────────
  const { data: discountRules = [] } = useDiscountRules();
  // Quando l'utente seleziona una regola, auto-applichiamo sconto_max_pct
  // come default editabile (l'utente può comunque alzare/abbassare).
  const selectedDiscountRule = useMemo(
    () => discountRules.find((r) => r.id === form.discount_rule_id) ?? null,
    [discountRules, form.discount_rule_id],
  );

  // ─── Finanziamento ────────────────────────────────────────────────────────
  const [anticipoPct, setAnticipoPct] = useState(form.fin_anticipo_pct ?? 40);
  // Modalità: "tabella" usa eic_tabelle_finanziamento (no TAN/TAEG manuali),
  // "manuale" usa i 2 piani Estesa/Standard come prima (fallback).
  const [finModalita, setFinModalita] = useState<"tabella" | "manuale">(
    form.fin_tabella_id ? "tabella" : "manuale",
  );
  const { data: tabelleFinanziamento = [] } = useTabelleFinanziamentoAttive();
  const [tabellaId, setTabellaId] = useState<string | null>(form.fin_tabella_id ?? null);
  const { data: righeTabella = [] } = useTabellaFinanziamentoRighe(tabellaId);
  const durateDisponibili = useMemo(() => getDurateUniche(righeTabella), [righeTabella]);
  const [durataTabella, setDurataTabella] = useState<number | null>(null);
  // Auto-seleziona la prima durata disponibile quando cambia tabella
  useEffect(() => {
    if (durateDisponibili.length > 0 && durataTabella === null) {
      setDurataTabella(durateDisponibili[0]);
    }
  }, [durateDisponibili]); // eslint-disable-line react-hooks/exhaustive-deps

  const [piano1Mesi, setPiano1Mesi] = useState(120);
  const [piano1Tasso, setPiano1Tasso] = useState(5.5);
  const [piano2Mesi, setPiano2Mesi] = useState(60);
  const [piano2Tasso, setPiano2Tasso] = useState(0);

  // ─── Modalità pagamento cliente ──────────────────────────────────────────
  type Milestone = { label: string; percentuale: number; when?: string | null };
  const milestoneDefault: Milestone[] = [
    { label: "Acconto alla firma", percentuale: 30, when: "Firma contratto" },
    { label: "Inizio lavori", percentuale: 40, when: "Consegna materiale in cantiere" },
    { label: "Saldo", percentuale: 30, when: "Fine collaudo" },
  ];
  const [milestones, setMilestones] = useState<Milestone[]>(
    (form.pagamento_milestones as Milestone[] | null) ?? milestoneDefault,
  );
  // Sync con prop: se il progetto viene re-fetchato (es. dopo refresh, edit
  // su altra tab), aggiorniamo lo state locale per non mostrare valori stale.
  // Confronto JSON per evitare loop infinito su reference uguali ma identità diversa.
  const formMilestonesKey = JSON.stringify(form.pagamento_milestones ?? null);
  useEffect(() => {
    const incoming = (form.pagamento_milestones as Milestone[] | null) ?? milestoneDefault;
    setMilestones(incoming);
  }, [formMilestonesKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const milestonesTotale = milestones.reduce((acc, m) => acc + (Number(m.percentuale) || 0), 0);
  const milestonesOk = milestonesTotale === 100;

  const finCalc = useMemo(() => calcolaPianoFinanziamento({
    importo_totale: forbice.media,
    anticipo_pct: anticipoPct,
    piani: [
      { nome: "Estesa", durata_mesi: piano1Mesi, tasso_annuo_pct: piano1Tasso },
      { nome: "Standard", durata_mesi: piano2Mesi, tasso_annuo_pct: piano2Tasso },
    ],
  }), [forbice.media, anticipoPct, piano1Mesi, piano1Tasso, piano2Mesi, piano2Tasso]);

  // Quando uso una tabella finanziamento configurata: cerco la riga ottimale
  // (importo×durata→importo_rata) dal listino fornitore. Niente TAN/TAEG
  // manuali, il PDF mostra esattamente i dati della tabella.
  const importoFinanziato = Math.max(0, forbice.media - (forbice.media * anticipoPct) / 100);
  const rigaTabellaScelta = useMemo(() => {
    if (finModalita !== "tabella" || !durataTabella || righeTabella.length === 0) return null;
    return findMigliorRiga(righeTabella, importoFinanziato, durataTabella);
  }, [finModalita, durataTabella, righeTabella, importoFinanziato]);

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
    // Se uso una tabella finanziamento configurata, costruisco UN SOLO piano
    // basato sulla riga scelta (TAN/TAEG/rata letti dalla tabella). Altrimenti
    // fallback ai 2 piani manuali Estesa/Standard.
    let piani: SrPianoFinanziamento[];
    if (finModalita === "tabella" && rigaTabellaScelta) {
      piani = [{
        nome: tabelleFinanziamento.find((t) => t.id === tabellaId)?.nome_prodotto ?? "Finanziamento",
        mesi: rigaTabellaScelta.durata_mesi,
        tasso: rigaTabellaScelta.tan ?? 0,
        rata_mese: rigaTabellaScelta.importo_rata,
        anticipo: finCalc.anticipo,
        finanziato: importoFinanziato,
      }];
      onChange("fin_tabella_id", tabellaId);
      onChange("fin_tabella_riga_id", rigaTabellaScelta.id);
    } else {
      piani = finCalc.piani.map((p) => ({
        nome: p.nome, mesi: p.mesi, tasso: p.tasso,
        rata_mese: p.rata_mese, anticipo: finCalc.anticipo, finanziato: finCalc.finanziato,
      }));
      onChange("fin_tabella_id", null);
      onChange("fin_tabella_riga_id", null);
    }
    onChange("fin_anticipo_pct", anticipoPct);
    onChange("fin_piani", piani);
    // Persisti modalità pagamento se l'utente l'ha personalizzata
    onChange("pagamento_milestones", milestones);
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
        {/* Regola sconto aziendale — auto-popola il campo "Sconto %" */}
        {discountRules.length > 0 && (
          <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
              <Tag className="h-3.5 w-3.5" />
              Regola sconto applicata
            </div>
            <Select
              value={form.discount_rule_id ?? "none"}
              onValueChange={(v) => {
                if (v === "none") {
                  onChange("discount_rule_id", null);
                } else {
                  onChange("discount_rule_id", v);
                  const rule = discountRules.find((r) => r.id === v);
                  if (rule) {
                    // Imposta lo sconto al massimo consentito dalla regola
                    onChange("sconto_percentuale", rule.sconto_max_pct);
                  }
                }
              }}
            >
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Nessuna regola (sconto manuale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nessuna regola (sconto manuale) —</SelectItem>
                {discountRules.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name} — max {r.sconto_max_pct}%
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedDiscountRule && (
              <p className="text-[11px] text-emerald-700">
                Margine minimo richiesto: {selectedDiscountRule.margine_min_pct}% ·
                Sconto max: {selectedDiscountRule.sconto_max_pct}%
                {selectedDiscountRule.approva_oltre_pct != null
                  ? ` · Approvazione oltre ${selectedDiscountRule.approva_oltre_pct}%`
                  : ""}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
            <Label className="text-xs flex items-center justify-between">
              <span>Sconto %</span>
              {selectedDiscountRule && (form.sconto_percentuale ?? 0) > selectedDiscountRule.sconto_max_pct && (
                <span className="text-[10px] text-amber-600">⚠ supera regola</span>
              )}
            </Label>
            <Input
              type="number"
              min={0} max={100} step={0.5}
              key={`sconto-${form.sconto_percentuale}`}
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

      {/* Modalità di pagamento cliente */}
      <SrCard
        title="Modalità di pagamento cliente"
        description="Acconto e step di pagamento. Compare nel PDF come piano concordato. La somma delle percentuali deve fare 100%."
        icon={<Wallet className="h-4 w-4" />}
      >
        <div className="space-y-2">
          {milestones.map((m, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5">
                <Label className="text-xs">Step {idx + 1}</Label>
                <Input
                  value={m.label}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setMilestones(next);
                  }}
                  className="h-9 text-xs"
                  placeholder="es. Acconto alla firma"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">%</Label>
                <Input
                  type="number"
                  min={0} max={100} step={5}
                  value={m.percentuale}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], percentuale: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                    setMilestones(next);
                  }}
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-4">
                <Label className="text-xs">Quando</Label>
                <Input
                  value={m.when ?? ""}
                  onChange={(e) => {
                    const next = [...milestones];
                    next[idx] = { ...next[idx], when: e.target.value || null };
                    setMilestones(next);
                  }}
                  placeholder="es. Consegna materiale"
                  className="h-9 text-xs"
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setMilestones(milestones.filter((_, i) => i !== idx))}
                  disabled={milestones.length <= 1}
                  className="h-9 w-9 text-rose-600 hover:bg-rose-50"
                  title="Rimuovi step"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {/* Importo calcolato sul medio */}
              <div className="col-span-12 text-[11px] text-muted-foreground -mt-1 pl-1">
                ≈ {formatEuro((forbice.media * (Number(m.percentuale) || 0)) / 100)} IVA inclusa
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t mt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMilestones([...milestones, { label: "", percentuale: 0, when: null }])}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" /> Aggiungi step
            </Button>
            <div
              className={`text-sm font-bold inline-flex items-center gap-1.5 ${milestonesOk ? "text-emerald-700" : "text-amber-600"}`}
              role="status"
              aria-live="polite"
            >
              {milestonesOk && (
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              )}
              Totale: {milestonesTotale}%
              {!milestonesOk && (
                <span className="text-xs font-normal ml-1">
                  ({milestonesTotale > 100 ? `−${milestonesTotale - 100}%` : `+${100 - milestonesTotale}%`} per arrivare a 100%)
                </span>
              )}
            </div>
          </div>
        </div>
      </SrCard>

      {/* Finanziamento */}
      <SrCard
        title="Simulazione finanziamento"
        description="Scegli una tabella finanziaria configurata oppure imposta manualmente. La rata si calcola da importo + durata."
        icon={<CreditCard className="h-4 w-4" />}
      >
        {/* Switch modalità: tabella vs manuale */}
        <div className="flex gap-2 mb-3 p-1 bg-muted rounded-md w-fit" role="tablist" aria-label="Modalità finanziamento">
          <button
            type="button"
            role="tab"
            aria-selected={finModalita === "tabella"}
            onClick={() => setFinModalita("tabella")}
            className={`px-3 py-1 text-xs rounded transition-colors ${finModalita === "tabella" ? "bg-white shadow-sm font-semibold text-emerald-700" : "text-muted-foreground hover:text-foreground"}`}
          >
            Da tabella configurata
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={finModalita === "manuale"}
            onClick={() => setFinModalita("manuale")}
            className={`px-3 py-1 text-xs rounded transition-colors ${finModalita === "manuale" ? "bg-white shadow-sm font-semibold text-emerald-700" : "text-muted-foreground hover:text-foreground"}`}
          >
            Manuale (TAN libero)
          </button>
        </div>

        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-6 md:col-span-3">
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
          <div className="col-span-6 md:col-span-9">
            <Label className="text-xs">Importo finanziato</Label>
            <div className="h-9 px-3 flex items-center text-sm font-semibold text-emerald-700 bg-emerald-50 rounded-md border border-emerald-200">
              {formatEuro(importoFinanziato)}
            </div>
          </div>

          {finModalita === "tabella" ? (
            <>
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Tabella finanziamento</Label>
                {tabelleFinanziamento.length === 0 ? (
                  <SrCallout variant="info" className="text-[11px]">
                    Nessuna tabella configurata. Vai in{" "}
                    <a href="/azienda/impostazioni/finanziamenti" className="underline font-semibold">
                      Impostazioni → Finanziamenti
                    </a>{" "}
                    per caricarla.
                  </SrCallout>
                ) : (
                  <Select
                    value={tabellaId ?? "none"}
                    onValueChange={(v) => {
                      const next = v === "none" ? null : v;
                      setTabellaId(next);
                      setDurataTabella(null);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Seleziona tabella..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Nessuna —</SelectItem>
                      {tabelleFinanziamento.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome_prodotto}{t.finanziaria_nome ? ` · ${t.finanziaria_nome}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="col-span-12 md:col-span-6">
                <Label className="text-xs">Durata (mesi)</Label>
                <Select
                  value={durataTabella ? String(durataTabella) : ""}
                  onValueChange={(v) => setDurataTabella(Number(v))}
                  disabled={durateDisponibili.length === 0}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={durateDisponibili.length === 0 ? "Seleziona prima tabella" : "Scegli durata..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {durateDisponibili.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d} mesi ({Math.round(d / 12 * 10) / 10} anni)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {rigaTabellaScelta && (
                <div className="col-span-12 mt-2 rounded-md border border-emerald-300 bg-emerald-50/50 p-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase text-emerald-700 font-semibold">Rata mensile</p>
                      <p className="text-2xl font-bold text-emerald-900 tabular-nums">
                        {formatEuro(rigaTabellaScelta.importo_rata, 0)}
                      </p>
                      <p className="text-[10px] text-emerald-700">× {rigaTabellaScelta.numero_rate} rate</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-emerald-700 font-semibold">TAN</p>
                      <p className="text-lg font-bold text-emerald-900 tabular-nums">
                        {rigaTabellaScelta.tan != null ? `${rigaTabellaScelta.tan}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-emerald-700 font-semibold">TAEG</p>
                      <p className="text-lg font-bold text-emerald-900 tabular-nums">
                        {rigaTabellaScelta.taeg != null ? `${rigaTabellaScelta.taeg}%` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-emerald-700 font-semibold">Totale dovuto</p>
                      <p className="text-lg font-bold text-emerald-900 tabular-nums">
                        {formatEuro(rigaTabellaScelta.importo_totale_dovuto ?? rigaTabellaScelta.importo_rata * rigaTabellaScelta.numero_rate, 0)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[10px] text-center text-emerald-700/80 mt-2">
                    Valori letti dalla tabella ufficiale: TAN e TAEG sono pre-calcolati, niente input manuali.
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Modalità manuale (legacy) */}
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
            </>
          )}
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

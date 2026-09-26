/**
 * Il riquadro Casa Full Electric nel passo Economia del preventivo
 * termoidraulico (modello «full-electric»). Il prezzo resta quello del
 * preventivo (scritto a mano o dalle righe); qui si scrivono i pezzi del
 * sistema, le bollette di oggi, le stime di domani e gli incentivi, e in cima si
 * vede subito cosa ottiene il cliente: gli stessi numeri del PDF.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TriangleAlert, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { anniTesto, euro } from "@/lib/contoTermico/calcoli";
import { calcolaFullElectric, co2Testo, kwh } from "@/lib/fullElectric/calcoli";
import { economiaFullElectric, type DatiFullElectric, type PezzoFullElectric } from "@/lib/fullElectric/dati";
import { COMPONENTI_FULL_ELECTRIC, type ComponenteFullElectric } from "@/lib/fullElectric/regole";
import { CampoNumero, CampoTesto, Scelta, SchedaTecnica } from "@/components/termoidraulico/campiEconomia";

interface Props {
  dati: DatiFullElectric;
  onChange: (dati: DatiFullElectric) => void;
  /** Il totale del preventivo, IVA inclusa. */
  prezzoIvaInclusa: number;
  ivaPct: number;
}

const TIPI = Object.keys(COMPONENTI_FULL_ELECTRIC) as ComponenteFullElectric[];

function Sezione({ titolo, children }: { titolo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titolo}</p>
      {children}
    </div>
  );
}

export function FullElectricEconomia({ dati, onChange, prezzoIvaInclusa, ivaPct }: Props) {
  const cambia = (patch: Partial<DatiFullElectric>) => onChange({ ...dati, ...patch });
  const r = useMemo(() => calcolaFullElectric(economiaFullElectric(dati, prezzoIvaInclusa, ivaPct)), [dati, prezzoIvaInclusa, ivaPct]);
  const presenti = new Set(dati.componenti.map((c) => c.tipo));
  // I pezzi restano nell'ordine del racconto, qualunque sia l'ordine dei clic.
  const alterna = (tipo: ComponenteFullElectric) => {
    const componenti: PezzoFullElectric[] = presenti.has(tipo)
      ? dati.componenti.filter((c) => c.tipo !== tipo)
      : TIPI.filter((t) => t === tipo || presenti.has(t)).map((t) => dati.componenti.find((c) => c.tipo === t) ?? { tipo: t, titolo: COMPONENTI_FULL_ELECTRIC[t], dettaglio: "" });
    cambia({ componenti });
  };
  const aggiornaPezzo = (tipo: ComponenteFullElectric, patch: Partial<PezzoFullElectric>) =>
    cambia({ componenti: dati.componenti.map((c) => (c.tipo === tipo ? { ...c, ...patch } : c)) });
  const senzaProduzione = presenti.has("fotovoltaico") && dati.produzione_kwh <= 0;
  const oltreIConsumi = dati.produzione_kwh > 0 && dati.consumo_kwh > 0 && r.energia.coperturaPct >= 95;

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <Zap className="h-4 w-4 text-orange-600" /> Casa Full Electric
        </CardTitle>
        {/* Telefono: niente spiegazione, i campi e il riquadro verde bastano. */}
        <p className="text-[11px] text-muted-foreground max-sm:hidden">
          Energia e bollette non le calcola il preventivo: scrivile dal tuo software o dalla simulazione. Il prezzo è quello del preventivo, IVA inclusa: {euro(prezzoIvaInclusa)}.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 max-sm:space-y-4">
        {/* In cima: è quello che si guarda mentre si scrivono prezzo e stime. */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-xs font-semibold text-emerald-900">Cosa ottiene il cliente</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
            {[
              ["Risparmio all'anno", euro(Math.max(0, r.risparmioAnnuo))],
              ["Bolletta di domani", euro(r.bollette.domani.totale)],
              ["Dal suo tetto", `${r.energia.coperturaPct}% dei consumi`],
              ["Incentivi stimati", euro(r.incentivi.totale)],
              ["Dopo gli incentivi", euro(r.costoNetto)],
              ["Spesa ripagata", r.anniDiRientro != null ? `in ${anniTesto(r.anniDiRientro)}` : "oltre il periodo"],
              [`In ${dati.anni} anni`, euro(r.beneficioFinale)],
              ["CO2 evitata", `${co2Testo(r.ambiente.co2EvitataKg)} l'anno`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-wide text-emerald-800/80">{k}</dt>
                <dd className="font-semibold tabular-nums text-emerald-950">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <Sezione titolo="Il sistema">
          <div className="flex flex-wrap gap-1.5">
            {TIPI.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={presenti.has(t)}
                onClick={() => alterna(t)}
                className={cn(
                  "tap-compact rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:h-8",
                  presenti.has(t) ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200",
                )}
              >
                {COMPONENTI_FULL_ELECTRIC[t]}
              </button>
            ))}
          </div>
          {dati.componenti.map((p) => (
            <div key={p.tipo} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor={`fe-${p.tipo}-titolo`} className="text-[11px] text-muted-foreground">{COMPONENTI_FULL_ELECTRIC[p.tipo]}</Label>
                <Input id={`fe-${p.tipo}-titolo`} defaultValue={p.titolo} placeholder={COMPONENTI_FULL_ELECTRIC[p.tipo]} className="h-8 text-xs"
                  onBlur={(e) => e.target.value.trim() !== p.titolo && aggiornaPezzo(p.tipo, { titolo: e.target.value.trim() || COMPONENTI_FULL_ELECTRIC[p.tipo] })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`fe-${p.tipo}-dettaglio`} className="text-[11px] text-muted-foreground max-sm:sr-only">Dettaglio (modello, potenza…)</Label>
                <Input id={`fe-${p.tipo}-dettaglio`} defaultValue={p.dettaglio} placeholder="Es. 14 moduli da 430 W" className="h-8 text-xs"
                  onBlur={(e) => e.target.value.trim() !== p.dettaglio && aggiornaPezzo(p.tipo, { dettaglio: e.target.value.trim() })} />
              </div>
            </div>
          ))}
          <CampoTesto id="fe-attuale" etichetta="Cosa si lascia" valore={dati.impianto_attuale} segnaposto="Caldaia a gas e piano cottura a gas" onCommit={(impianto_attuale) => cambia({ impianto_attuale })} />
        </Sezione>

        <Sezione titolo="Oggi, in un anno">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CampoNumero id="fe-spesa-gas" etichetta="Spesa per il gas" valore={dati.spesa_gas || null} suffisso="€" onCommit={(v) => cambia({ spesa_gas: Math.max(0, v ?? 0) })} />
            <CampoNumero id="fe-spesa-luce" etichetta="Spesa per la luce" valore={dati.spesa_luce || null} suffisso="€" onCommit={(v) => cambia({ spesa_luce: Math.max(0, v ?? 0) })} />
            <CampoNumero id="fe-gas-smc" etichetta="Gas consumato" valore={dati.gas_smc || null} suffisso="Smc" onCommit={(v) => cambia({ gas_smc: Math.max(0, v ?? 0) })} aiuto="Per la CO2 evitata." />
            <CampoNumero id="fe-luce-kwh" etichetta="Luce consumata" valore={dati.luce_kwh || null} suffisso="kWh" onCommit={(v) => cambia({ luce_kwh: Math.max(0, v ?? 0) })} />
          </div>
        </Sezione>

        <Sezione titolo="Domani, in un anno (stime)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CampoNumero id="fe-produzione" etichetta="Produzione del fotovoltaico" valore={dati.produzione_kwh || null} suffisso="kWh" onCommit={(v) => cambia({ produzione_kwh: Math.max(0, v ?? 0) })} />
            <CampoNumero id="fe-consumo" etichetta="Consumi della casa elettrica" valore={dati.consumo_kwh || null} suffisso="kWh" onCommit={(v) => cambia({ consumo_kwh: Math.max(0, v ?? 0) })} aiuto="Luce di oggi più pompa di calore e induzione." />
            <CampoNumero id="fe-autoconsumo" etichetta="Produzione usata in casa" valore={dati.autoconsumo_pct} suffisso="%" onCommit={(v) => cambia({ autoconsumo_pct: Math.min(100, Math.max(0, v ?? 0)) })} aiuto="Con la batteria di solito 60-70%." />
            <CampoNumero id="fe-prezzo-luce" etichetta="Prezzo della luce" valore={dati.prezzo_luce} suffisso="€/kWh" onCommit={(v) => cambia({ prezzo_luce: Math.max(0, v ?? 0) })} />
            <CampoNumero id="fe-prezzo-immissione" etichetta="Energia venduta alla rete" valore={dati.prezzo_immissione} suffisso="€/kWh" onCommit={(v) => cambia({ prezzo_immissione: Math.max(0, v ?? 0) })} />
            <CampoNumero id="fe-quota-fissa" etichetta="Quote fisse della luce" valore={dati.quota_fissa || null} suffisso="€/anno" onCommit={(v) => cambia({ quota_fissa: Math.max(0, v ?? 0) })} />
          </div>
          {/* Telefono no: bollette e copertura sono già nel riquadro verde in cima. */}
          <p className="text-[11px] text-muted-foreground max-sm:hidden">
            {`Con questi numeri: ${kwh(r.energia.autoconsumo)} dal tetto, ${kwh(r.energia.dallaRete)} dalla rete, ${kwh(r.energia.immessa)} venduti. Bolletta di domani ${euro(r.bollette.domani.totale)} contro ${euro(r.bollette.oggi.totale)} di oggi.`}
          </p>
          {senzaProduzione || oltreIConsumi ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {senzaProduzione
                ? "C'è il fotovoltaico ma la produzione è a zero: il PDF mostrerebbe un tetto che non produce."
                : "Il tetto copre quasi tutti i consumi: d'inverno la casa prende comunque energia dalla rete. Ricontrolla la quota usata in casa."}
            </p>
          ) : null}
        </Sezione>

        <Sezione titolo="Incentivi (stime)">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Detrazione per la casa</Label>
              <Scelta<number | null>
                valore={dati.detrazione_pct}
                opzioni={[{ valore: 50, etichetta: "50%" }, { valore: 36, etichetta: "36%" }, { valore: null, etichetta: "Nessuna" }]}
                onChange={(detrazione_pct) => cambia({ detrazione_pct })}
              />
              {dati.detrazione_pct ? (
                <CampoNumero id="fe-detraibile" etichetta="Spesa detraibile, IVA inclusa" valore={dati.importo_detraibile} suffisso="€"
                  onCommit={(v) => cambia({ importo_detraibile: v && v > 0 ? v : null })}
                  aiuto="Fotovoltaico, batteria e lavori collegati. Vuoto = tutto il prezzo." />
              ) : null}
            </div>
            <div className="space-y-1.5">
              <CampoNumero id="fe-ct" etichetta="Conto Termico sulla pompa di calore" valore={dati.contributo_ct || null} suffisso="€"
                onCommit={(v) => cambia({ contributo_ct: Math.max(0, v ?? 0) })}
                aiuto="Dal simulatore del GSE. Non vale sulla spesa già in detrazione." />
              {dati.contributo_ct > 0 ? (
                <Scelta
                  valore={dati.modalita_ct}
                  opzioni={[{ valore: "sconto_in_fattura", etichetta: "Sconto in fattura" }, { valore: "rimborso", etichetta: "Glielo versa il GSE" }]}
                  onChange={(modalita_ct) => cambia({ modalita_ct })}
                />
              ) : null}
            </div>
          </div>
        </Sezione>

        <Sezione titolo="Il conto negli anni">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CampoNumero id="fe-aumento" etichetta="Aumento energia all'anno" valore={dati.aumento_energia_pct} suffisso="%" onCommit={(v) => cambia({ aumento_energia_pct: Math.min(10, Math.max(0, v ?? 0)) })} />
            <CampoNumero id="fe-anni" etichetta="Anni del conto" valore={dati.anni} suffisso="anni" onCommit={(v) => cambia({ anni: Math.min(30, Math.max(5, Math.round(v ?? 20))) })} />
          </div>
        </Sezione>

        <SchedaTecnica
          etichetta="Scheda del sistema (nel PDF)"
          righe={dati.caratteristiche}
          onChange={(caratteristiche) => cambia({ caratteristiche })}
          segnaposto={["Potenza del fotovoltaico", "6 kWp"]}
        />
      </CardContent>
    </Card>
  );
}

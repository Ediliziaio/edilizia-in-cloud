import {createFullFvTemplate} from "@/lib/moduli-vendita/fullFvModules";
import {buildFvPreviewBase} from "@/lib/moduli-vendita/fvPreviewData";
import {renderFvPdfHtml} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { describe, expect, it } from "vitest";
import { analisiConsumiIniziale } from "../../../supabase/functions/_shared/fvBollette";
import {
  consigliaModuliFv,
  simulaEnergiaFv,
} from "../../../supabase/functions/_shared/fvSimulazioneEnergetica";
import {
  calcolaEconomiaAzienda,
  creaSnapshotEconomia,
  parametriEconomiaIniziali,
  snapshotEconomiaValido,
} from "../../../supabase/functions/_shared/fvEconomiaAzienda";
import { economiaDaConsumiFv } from "@/lib/fotovoltaico/economiaDaConsumi";
import { calcolaCassaCumulata } from "@/lib/fotovoltaico/finanziaria";
import { calcolaEnergyFlows } from "../../../supabase/functions/_shared/fvCalcoli";
import {
  htmlBilancioEnergia,
  svgBilancioEnergia,
} from "../../../supabase/functions/_shared/fvBilancioEnergia";
const a = analisiConsumiIniziale(true);
a.correzioni = {
  consumoAnnuo: 6000,
  spesaAnnua: 1800,
  costiFissiAnnui: 360,
  costiEvitabiliAnnui: 1440,
};
a.prezzoImmissione = .08;
a.profilo.aumentoConsumiPct = 20;
const f = simulaEnergiaFv({
  consumoAnnuo: 6000,
  produzioneAnnua: 8000,
  batteriaKwh: 10,
  costoEvitabileKwh: .24,
  prezzoImmissione: .08,
  profilo: a.profilo,
});
describe("Un unico bilancio per scenari, finanza privata e aziendale e PDF", () => {
  it("i flussi della cassa privata corrispondono alla simulazione oraria", () => {
    const c = calcolaCassaCumulata({
      investimento_iniziale: 12000,
      produzione_anno_1_kwh: 8000,
      autoconsumo_pct: .99,
      consumo_annuo_kwh: 6000,
      costo_kwh_attuale: .24,
      prezzo_rid_kwh: .08,
      detrazione_annua_eur: 0,
      durata_detrazione_anni: 0,
      inflazione_energia_pct: 0,
      inflazione_rid_pct: 0,
      degradazione_pannelli_pct: 0,
      costo_manutenzione_anno_eur: 0,
      costo_sostituzione_inverter_eur: 0,
      bilancio_orario: { profilo: a.profilo, capacitaAccumulo: 10 },
    });
    expect(c[1].risparmio_bolletta_eur).toBeCloseTo(f.risparmioAcquisti, 1);
    expect(c[1].ricavi_rid_eur).toBeCloseTo(f.ricaviImmissione, 1);
    expect(c[25].flusso).toBe(c[1].flusso);
  });
  it("l'azienda mantiene consumi futuri, fissi e ricavi uguali al motore", () => {
    const p = economiaDaConsumiFv({
        ...parametriEconomiaIniziali(6000, .24),
        dataPreventivo: "2026-11-20",
        dataInizio: "2027-01-01",
        degrado: 0,
      }, {
        analisi_consumi: a,
        consumo_annuo_kwh: 6000,
        costo_kwh_attuale: .24,
        con_accumulo: true,
        capacita_accumulo_kwh: 10,
      }, 8000),
      input = {
        companyId: "azienda-test",
        imponibile: 12000,
        iva: 0,
        produzioneAnnua: 8000,
        parametri: p,
      },
      r = calcolaEconomiaAzienda(input);
    const mesi = r.mesi.slice(1, 13);
    expect(mesi.reduce((s, m) => s + m.autoconsumo, 0)).toBeCloseTo(
      f.autoconsumo,
      1,
    );
    expect(mesi.reduce((s, m) => s + m.immissione, 0)).toBeCloseTo(
      f.immessa,
      1,
    );
    expect(mesi.reduce((s, m) => s + m.bollettaPrima, 0)).toBeCloseTo(
      7200 * .24 + 360,
      1,
    );
    expect(r.risparmioPrimoAnno).toBeCloseTo(f.risparmioAcquisti, 1);
    expect(r.avvisi.join(" ")).not.toContain("senza curva oraria");
    const snapshot = creaSnapshotEconomia(input);
    expect(snapshotEconomiaValido(JSON.parse(JSON.stringify(snapshot)), input))
      .toBe(true);
  });
  it("nel PDF le perdite della batteria sono distinte dalle immissioni", () => {
    const flussi = calcolaEnergyFlows({
      potenza_kwp: 6,
      produzione_kwh: 8000,
      consumo_annuo_kwh: 6000,
      has_accumulo: true,
      capacita_accumulo_kwh: 10,
      analisi_consumi: a,
    });
    expect(flussi.autoconsumo_kwh).toBeCloseTo(f.autoconsumo, 6);
    expect(flussi.ceduto_rete_kwh).toBeCloseTo(f.immessa, 6);
    const html = htmlBilancioEnergia(flussi, 7200, {
      tipo: "casa",
      hasAccumulo: true,
    });
    expect(html).toContain("perdite e residuo accumulo");
    expect(html).not.toContain("non separano");
    expect(html).not.toContain("IT001E");
    expect(svgBilancioEnergia(flussi, 7200, "produzione")).toContain(
      "distinti dalle immissioni",
    );
  });
  it.each(["spesa", "autoconsumo", "copertura"] as const)(
    "raccomanda moduli fisici per l'obiettivo %s",
    (obiettivo) => {
      const input = {
          massimo: 50,
          watt: 450,
          consumoAnnuo: 6000,
          resaKwhKwp: 1200,
          profilo: a.profilo,
          obiettivo,
          copertura: .8,
        },
        r = consigliaModuliFv(input)!;
      expect(r.consigliati).toBeGreaterThan(0);
      expect(r.consigliati).toBeLessThanOrEqual(50);
      expect(Number.isInteger(r.consigliati)).toBe(true);
      if (obiettivo === "copertura") {
        expect(r.obiettivoRaggiungibile).toBe(false);
      }
      if (obiettivo === "spesa") {
        const calcola = (n: number) =>
          simulaEnergiaFv({
            consumoAnnuo: 6000,
            produzioneAnnua: n * .45 * 1200,
            batteriaKwh: 0,
            costoEvitabileKwh: 1,
            prezzoImmissione: 0,
            profilo: a.profilo,
          }).autoconsumo;
        expect(calcola(r.consigliati)).toBeGreaterThanOrEqual(
          calcola(50) * .98,
        );
        if (r.consigliati > 1) {
          expect(calcola(r.consigliati - 1)).toBeLessThan(
            calcola(50) * .98,
          );
        }
      }
    },
  );
});

it("il documento aziendale con accumulo e consumi futuri mantiene un bilancio fisico valido",()=>{const template=createFullFvTemplate({},"azienda-test","aziendale"),d=buildFvPreviewBase(template),a=analisiConsumiIniziale(true);a.profilo.aumentoConsumiPct=20;const parametri=economiaDaConsumiFv({...parametriEconomiaIniziali(6000,.24),dataPreventivo:"2026-11-20",dataInizio:"2027-01-01"},{analisi_consumi:a,consumo_annuo_kwh:6000,costo_kwh_attuale:.24,con_accumulo:true,capacita_accumulo_kwh:10},8000);d.economia_azienda=creaSnapshotEconomia({companyId:"azienda-test",imponibile:12000,iva:.22,produzioneAnnua:8000,parametri});expect(()=>renderFvPdfHtml(d)).not.toThrow();const html=renderFvPdfHtml(d);expect(html).toContain("perdite e residuo accumulo");expect(html).toContain("7.200");});

import {describe,it,expect} from "vitest";
import {confrontoFinanziamentoCasa,confrontoPagamentoAzienda,htmlConfrontoFinanziamentoCasa,htmlConfrontoPagamentoAzienda} from "../../../supabase/functions/_shared/fvConfrontoPagamento";
import {datiCasaTettoReale,documentoCasaTettoReale} from "../../../dev/fotovoltaico-locale/casaTettoReale";
import {posaCasaTracciata} from "../../../dev/fotovoltaico-locale/campioneAreaTracciata";
import {creaSnapshotEconomia,parametriEconomiaIniziali} from "../../../supabase/functions/_shared/fvEconomiaAzienda";
import {CONDIZIONI_VUOTE,type TabellaNoleggio} from "../../../supabase/functions/_shared/noleggioOperativo";
const fin={finanziaria:"Ipotesi locale",durata_mesi:60,rata_mensile:85,tan_perc:null as number|null,taeg_perc:null as number|null,importo_finanziato:4282};
describe("rata e canoni confrontati con lo stesso risparmio energetico",()=>{
 it("non mostra il finanziamento se non è scelto o se il cliente è aziendale",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata);expect(confrontoFinanziamentoCasa(d)).toBeNull();
  d.finanziamento=fin;expect(htmlConfrontoFinanziamentoCasa(d)).toBe("");
  d.modalita_pagamento=null;expect(confrontoFinanziamentoCasa(d)).not.toBeNull();
  d.economia_azienda_richiesta=true;expect(htmlConfrontoFinanziamentoCasa(d)).toBe("");
 });
 it("confronta bolletta residua più rata con la bolletta precedente e non nasconde lo scoperto",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata,fin),c=confrontoFinanziamentoCasa(d)!;
  expect(c.prima).toBeCloseTo(1300/12);expect(c.risparmio).toBeCloseTo(19.28);expect(c.differenza).toBeCloseTo(65.72);expect(c.dopo-c.prima).toBeCloseTo(c.differenza);
  const h=htmlConfrontoFinanziamentoCasa(d);expect(h).toContain("65,72");expect(h).toContain("in più");expect(h).toContain("5.100,00");expect(h).not.toContain("Tutto qui");expect(h).not.toContain("Costo netto reale");
  expect(d.scenario.cassa_anno_per_anno[0].cumulato).toBe(0);expect(d.scenario.cassa_anno_per_anno[1].cumulato).toBeCloseTo(231.36-100-1020);
  const doc=documentoCasaTettoReale("foto",undefined,posaCasaTracciata,{finanziamento:fin});expect(doc.pagine).toBe(13);expect(doc.html).toContain('data-fv-section="piano_pagamento"');
 });
 it("conserva il vantaggio firmato quando il risparmio copre la rata senza dichiarare gratis l’impianto",()=>{
  const d=datiCasaTettoReale(posaCasaTracciata,{...fin,rata_mensile:10,importo_finanziato:600}),c=confrontoFinanziamentoCasa(d)!;
  expect(c.differenza).toBeCloseTo(-9.28);const h=htmlConfrontoFinanziamentoCasa(d);expect(h).toContain("9,28");expect(h).toContain("in meno");expect(h).toContain("può coprire");expect(h).not.toContain("gratis");
 });
 it("rispetta il canone trimestrale e tiene separati IVA, avvio e fiscalità",()=>{
  const t:TabellaNoleggio={versione:1,id:"t",companyId:"a",fornitore:"Test",nome:"Test",revisione:"1",dal:"2026-01-01",al:"2027-12-31",attiva:true,prova:true,fonte:null,condizioni:{...CONDIZIONI_VUOTE,canoniAnticipati:true,fine:"restituzione"},righe:[{importoDa:1000,importoA:500000,durataMesi:60,periodoMesi:3,coefficiente:5.4,unita:"percentuale_periodo"}]};
  const s=creaSnapshotEconomia({companyId:"a",imponibile:12000,iva:.22,produzioneAnnua:12000,parametri:{...parametriEconomiaIniziali(24000,.2),dataPreventivo:"2026-11-10",dataInizio:"2027-01-01",modo:"noleggio",tabellaNoleggio:t,quotaAutoconsumo:1,degrado:0,costiFissiAnnui:1200}}),c=confrontoPagamentoAzienda(s);
  expect(c.prima).toBe(500);expect(c.residua).toBe(300);expect(c.pagamento).toBe(216);expect(c.periodo).toBe(3);expect(c.dopo).toBe(516);expect(c.differenza).toBe(16);expect(c.avvio).toBe(790.56);expect(c.fiscalitaAnnua).toBe(0);
  const h=htmlConfrontoPagamentoAzienda(s);expect(h).toContain("Noleggio operativo");expect(h).toContain("Ogni 3 mesi");expect(h).toContain("790,56");expect(h).not.toContain("deducibile al 100%");
 });
});

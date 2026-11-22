import type { DiscountRule } from "@/hooks/useDiscountRules";
import type { WizardData } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/types";
import { analisiConsumiIniziale } from "../../../supabase/functions/_shared/fvBollette";
import { type DisegnoCommercialeFv } from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { resaMappaFv } from "../../../supabase/functions/_shared/fvMappa";
import { consigliaModuliFv, simulaEnergiaFv } from "../../../supabase/functions/_shared/fvSimulazioneEnergetica";
import { anteprimaFotovoltaico, stimaProduzioneFv } from "./anteprima";
import { type ArticoloFv, type ListinoComponentiFv, righeComponentiFv } from "./componentiConfigurazione";
import { datiDalDisegno } from "./disegnoPreventivo";

export type IdPropostaImpiantoFv = "contenuta" | "consigliata" | "accumulo";
export type PropostaImpiantoFv = {
  id: IdPropostaImpiantoFv;
  configurazione: WizardData;
  flussi: ReturnType<typeof simulaEnergiaFv>;
  prezzo: number | null;
  beneficio: number | null;
  posaValorizzata: boolean;
  rientro: number | null;
  saldo10: number | null;
  prezzoCorpoDaRivedere: boolean;
  incrementoAccumulo?: { costo: number; beneficio: number; saldo10: number };
};

/** Confronto finito di taglie con lo stesso motore di energia e prezzo del preventivo. */
export function proposteImpiantoFv(data: WizardData, listino: ListinoComponentiFv, regoleSconto: DiscountRule[], piano?: DisegnoCommercialeFv | null) {
  const a = data.analisi_consumi ?? analisiConsumiIniziale(data.cliente_tipo === "azienda");
  const watt = Number(listino.pannelli.find(p => p.id === data.pannello_id)?.potenza_w);
  const consumo = Number(data.consumo_annuo_kwh), resa = stimaProduzioneFv({ ...data, potenza_kwp: 1 });
  if (data.kit_bundle_id || data.tetto_mock || !Number.isFinite(watt) || watt <= 0 || !Number.isFinite(consumo) || consumo <= 0 || !Number.isFinite(resa) || resa <= 0) return null;
  const riferimento = Math.ceil(consumo * (1 + a.profilo.aumentoConsumiPct / 100) / resa * 1000 / watt);
  const massimo = piano ? piano.pannelli.length : Math.min(2000, Math.max(1, riferimento));
  if (!Number.isInteger(massimo) || massimo < 1 || massimo > 2000) return null;
  const oreFalda = new Map(piano?.mappa?.solare?.map(f => [f.faldaId, f.ore]) ?? []);
  const posa = piano ? [...piano.pannelli].sort((x, y) => (oreFalda.get(y.faldaId) ?? 0) - (oreFalda.get(x.faldaId) ?? 0)) : [];
  const energetica = consigliaModuliFv({ massimo, watt, consumoAnnuo: consumo, resaKwhKwp: resa, profilo: a.profilo, obiettivo: a.obiettivo, copertura: a.coperturaObiettivo, pesiProduzioneMensili: resaMappaFv(piano)?.pesiMensili });
  if (!energetica) return null;
  const costoConfermato = data.costo_kwh_attuale != null && Number.isFinite(data.costo_kwh_attuale) && data.costo_kwh_attuale >= 0;
  const costruisci = (n: number, batteria?: ArticoloFv): Omit<PropostaImpiantoFv, "id"> => {
    const conAccumulo = !!batteria, capacita = conAccumulo ? Number(batteria.capacita_kwh) : 0;
    const prezzoCorpoDaRivedere = (data.prezzo_vendita_manuale ?? 0) > 0 &&
      (n !== data.numero_pannelli_scelti || conAccumulo !== data.con_accumulo || (conAccumulo && String(batteria.id) !== data.accumulo_id));
    const configurazione: WizardData = {
      ...data,
      ...(piano ? datiDalDisegno({ ...piano, pannelli: posa.slice(0, n) }, watt, data.prodotti_extra) : { layout_overlay: { modalita: "senza_mappa" }, numero_pannelli_scelti: n, potenza_kwp: n * watt / 1000 }),
      con_accumulo: conAccumulo, capacita_accumulo_kwh: capacita, accumulo_id: batteria ? String(batteria.id) : null,
      ...(prezzoCorpoDaRivedere ? { prezzo_vendita_manuale: null } : {}),
    };
    const flussi = simulaEnergiaFv({ consumoAnnuo: consumo, produzioneAnnua: stimaProduzioneFv(configurazione), batteriaKwh: capacita,
      costoEvitabileKwh: costoConfermato ? data.costo_kwh_attuale! : 0, prezzoImmissione: a.prezzoImmissione, profilo: a.profilo,
      pesiProduzioneMensili: resaMappaFv(configurazione.layout_overlay)?.pesiMensili });
    const righe = righeComponentiFv(configurazione, listino);
    const prezziConfermati = !!data.inverter_id && righe.some(r => r.categoria === "inverter") && righe.some(r => r.categoria === "pannello") &&
      righe.every(r => Number.isFinite(r.prezzo_unitario_vendita) && r.prezzo_unitario_vendita > 0) && (!conAccumulo || righe.some(r => r.categoria === "accumulo"));
    const totale = prezziConfermati && !prezzoCorpoDaRivedere ? anteprimaFotovoltaico(configurazione, { listino, regoleSconto, impiantoConfigurato: true }).totaleDocumento : null;
    const prezzo = totale != null && Number.isFinite(totale) && totale > 0 ? totale : null;
    const posaValorizzata = (configurazione.prezzo_vendita_manuale ?? 0) > 0 || data.manodopera_righe.some(r => r.ore > 0 && r.tariffa_oraria_vendita > 0);
    const beneficio = costoConfermato ? flussi.risparmioAcquisti + flussi.ricaviImmissione : null;
    const rientro = posaValorizzata && prezzo != null && beneficio != null && beneficio > 0 ? prezzo / beneficio : null;
    const saldo10 = posaValorizzata && prezzo != null && beneficio != null ? beneficio * 10 - prezzo : null;
    return { configurazione, flussi, prezzo, beneficio, posaValorizzata, rientro, saldo10, prezzoCorpoDaRivedere };
  };
  // Tutte le taglie fino a 40; oltre, un campione esplicito più la taglia energetica.
  const quantita = new Set<number>([1, massimo, energetica.consigliati, Math.max(1, Math.min(massimo, Math.round(data.numero_pannelli_scelti || 1)))]);
  for (let i = 1; i <= Math.min(massimo, 40); i++) quantita.add(Math.max(1, Math.round(i * massimo / Math.min(massimo, 40))));
  let valutate: Omit<PropostaImpiantoFv, "id">[];
  try { valutate = [...quantita].sort((a, b) => a - b).map(n => costruisci(n)); }
  catch { return null; }
  const conPrezzi = valutate.filter(s => s.saldo10 != null);
  const massimaCopertura = Math.max(...valutate.map(s => s.flussi.coperturaConsumi));
  const massimoAutoconsumo = Math.max(...valutate.map(s => s.flussi.autoconsumo));
  const energetiche = a.obiettivo === "autoconsumo"
    ? valutate.filter(s => s.flussi.quotaProduzioneUsata >= .7).at(-1) ?? valutate[0]
    : a.obiettivo === "copertura"
    ? valutate.find(s => s.flussi.coperturaConsumi >= a.coperturaObiettivo) ?? valutate.reduce((best, s) => s.flussi.coperturaConsumi > best.flussi.coperturaConsumi ? s : best)
    : valutate.find(s => s.flussi.autoconsumo >= massimoAutoconsumo * .98) ?? valutate.at(-1)!;
  const migliore = conPrezzi.length && a.obiettivo === "spesa"
    ? conPrezzi.reduce((best, s) => s.saldo10! > best.saldo10! ? s : best)
    : energetiche;
  const contenuta = valutate.find(s => s.configurazione.numero_pannelli_scelti <= migliore.configurazione.numero_pannelli_scelti &&
    (s.beneficio != null && migliore.beneficio != null ? s.beneficio >= migliore.beneficio * .6 : s.flussi.autoconsumo >= migliore.flussi.autoconsumo * .6)) ?? migliore;
  const batterie = listino.accumuli.filter(p => Number.isFinite(Number(p.capacita_kwh)) && Number(p.capacita_kwh) > 0 && Number(p.capacita_kwh) <= 100000).sort((x, y) =>
    Math.abs(Number(x.capacita_kwh) - consumo / 365 * .5) - Math.abs(Number(y.capacita_kwh) - consumo / 365 * .5));
  const scelta = batterie.find(p => p.id === data.accumulo_id);
  const confrontate = [...new Set([...(scelta ? [scelta] : []), ...batterie.slice(0, 8)])];
  const conAccumulo = confrontate.flatMap(b => { try { return [costruisci(migliore.configurazione.numero_pannelli_scelti, b)]; } catch { return []; } });
  const prezzate = conAccumulo.filter(s => s.saldo10 != null);
  const accumulo = prezzate.length ? prezzate.reduce((best, s) => s.saldo10! > best.saldo10! ? s : best) : conAccumulo[0];
  const proposte: PropostaImpiantoFv[] = [{ ...contenuta, id: "contenuta" }, { ...migliore, id: "consigliata" }];
  if (accumulo) proposte.push({ ...accumulo, id: "accumulo", ...(accumulo.prezzo != null && migliore.prezzo != null && accumulo.beneficio != null && migliore.beneficio != null ? {
    incrementoAccumulo: { costo: accumulo.prezzo - migliore.prezzo, beneficio: accumulo.beneficio - migliore.beneficio,
      saldo10: (accumulo.beneficio - migliore.beneficio) * 10 - (accumulo.prezzo - migliore.prezzo) },
  } : {}) });
  return { proposte, confronti: valutate.length, massimo, senzaMappa: !piano,
    obiettivoRaggiunto: a.obiettivo === "copertura" ? massimaCopertura >= a.coperturaObiettivo : a.obiettivo === "autoconsumo" ? migliore.flussi.quotaProduzioneUsata >= .7 : true,
    criterio: conPrezzi.length && a.obiettivo === "spesa"
    ? "Saldo semplice a 10 anni più alto tra le taglie confrontate, con prezzi delle voci inserite e posa valorizzata. Tariffe costanti; incentivi, manutenzione e costo del denaro esclusi."
    : energetica.criterio, prezziDisponibili: conPrezzi.length > 0 };
}

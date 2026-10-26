import { describe, expect, it } from 'vitest';
import { calcObiettivoMargine, type BaseEconomica, type RigaCosto } from '@/lib/preventivi/obiettivoMargine';
import { ASSUNZIONI_TEMPI_PREDEFINITE, stimaTempiDaComputo } from '@/lib/preventivi/stimaTempi';

const righe: RigaCosto[] = [
  { descrizione: 'Demolizione pavimento', capitolo_nome: 'Demolizioni', quantita: 10, costo_materiali: 2, costo_manodopera: 18 },
  { descrizione: 'Posa gres', capitolo_nome: 'Pavimenti', quantita: 10, costo_materiali: 30, costo_manodopera: 24 },
  { descrizione: 'Sanitari sospesi', capitolo_nome: 'Sanitari', quantita: 1, costo_materiali: 400, costo_manodopera: 0 },
];
// costi: demolizione 200, posa 540, sanitari 400 = 1140 (materiali 720, manodopera 420)
const base: BaseEconomica = { imponibile: 1800, totale: 1980, costoTot: 1140, righeSenzaCosto: 0 };

describe('calcolo a ritroso del margine', () => {
  it('dà il tetto di costo e lo sforo sul prezzo attuale', () => {
    const e = calcObiettivoMargine(righe, base, { marginePct: 40, prezzo: null, prezzoIvato: false });
    if (e.stato !== 'sforo') throw new Error(`atteso sforo, ${e.stato}`);
    expect(e.tettoCosto).toBe(1080);
    expect(e.scarto).toBe(60);
    expect(e.margineAlPrezzoPct).toBe(36.7);
    expect(e.prezzoMinimoNetto).toBe(1900);
    expect(e.prezzoMinimoIvato).toBe(2090);
    expect(e.materiali).toBe(720);
    expect(e.manodopera).toBe(420);
    expect(e.quotaMaterialiPct).toBe(63.2);
  });
  it('il taglio suggerito è proporzionale al peso e somma allo scarto', () => {
    const e = calcObiettivoMargine(righe, base, { marginePct: 40, prezzo: null, prezzoIvato: false });
    if (e.stato !== 'sforo') throw new Error('atteso sforo');
    expect(e.voci[0].descrizione).toBe('Posa gres');
    expect(e.voci.reduce((s, v) => s + v.taglio, 0)).toBeCloseTo(60, 1);
  });
  it('prezzo IVA inclusa: toglie l’IVA con l’aliquota effettiva del preventivo', () => {
    const e = calcObiettivoMargine(righe, base, { marginePct: 30, prezzo: 2200, prezzoIvato: true });
    if (e.stato === 'non_valido' || e.stato === 'costi_incompleti') throw new Error(e.stato);
    expect(e.prezzoNetto).toBe(2000);
    expect(e.tettoCosto).toBe(1400);
    expect(e.stato).toBe('ok');
    expect(e.scarto).toBe(-260);
  });
  it('costi incompleti: il tetto c’è, scarto e prezzo minimo no', () => {
    const e = calcObiettivoMargine(righe, { ...base, righeSenzaCosto: 2 }, { marginePct: 25, prezzo: 1800, prezzoIvato: false });
    expect(e).toEqual({ stato: 'costi_incompleti', righeSenzaCosto: 2, prezzoNetto: 1800, tettoCosto: 1350 });
  });
  it('rifiuta margini impossibili e prezzo assente', () => {
    expect(calcObiettivoMargine(righe, base, { marginePct: 100, prezzo: null, prezzoIvato: false }).stato).toBe('non_valido');
    expect(calcObiettivoMargine(righe, base, { marginePct: -1, prezzo: null, prezzoIvato: false }).stato).toBe('non_valido');
    expect(calcObiettivoMargine([], { imponibile: 0, totale: 0, costoTot: 0, righeSenzaCosto: 0 }, { marginePct: 20, prezzo: null, prezzoIvato: false }).stato).toBe('non_valido');
  });
  it('margine 0%: il tetto è il prezzo', () => {
    const e = calcObiettivoMargine(righe, base, { marginePct: 0, prezzo: null, prezzoIvato: false });
    if (e.stato === 'non_valido' || e.stato === 'costi_incompleti') throw new Error(e.stato);
    expect(e.tettoCosto).toBe(1800);
    expect(e.stato).toBe('ok');
  });
});

describe('stima di tempi e personale', () => {
  const a = { ...ASSUNZIONI_TEMPI_PREDEFINITE, costoOrario: 30, operai: 2, oreGiorno: 8, resaPct: 100 };
  it('ore-persona = costo manodopera ÷ costo orario; giorni sulla squadra', () => {
    const t = stimaTempiDaComputo(righe, a);
    if (t.stato !== 'ok') throw new Error(t.stato);
    expect(t.orePersona).toBe(14); // 420 € / 30 €/h
    expect(t.giorniLavorativi).toBe(1); // 14 h su 2 operai × 8 h = 16 h/giorno
    expect(t.vociConManodopera).toBe(2);
    expect(t.vociSenzaManodopera).toBe(1);
    expect(t.perCapitolo[0]).toMatchObject({ nome: 'Pavimenti', ore: 8 });
  });
  it('la resa allunga i tempi', () => {
    const t = stimaTempiDaComputo(righe, { ...a, resaPct: 50 });
    if (t.stato !== 'ok') throw new Error(t.stato);
    expect(t.giorniLavorativi).toBe(2); // 14 h su 2 × 4 h = 8 h/giorno
  });
  it('operai necessari per chiudere in N giorni', () => {
    const grandi = righe.map(r => ({ ...r, quantita: Number(r.quantita) * 20 }));
    const t = stimaTempiDaComputo(grandi, a, 5);
    if (t.stato !== 'ok') throw new Error(t.stato);
    expect(t.orePersona).toBe(280);
    expect(t.operaiPerTarget).toEqual({ giorni: 5, operai: 7 }); // 280 / (5 × 8)
  });
  it('senza manodopera nelle voci non inventa ore', () => {
    expect(stimaTempiDaComputo([righe[2]], a)).toEqual({ stato: 'senza_manodopera', voci: 1 });
  });
  it('assunzioni fuori scala sono rifiutate con il motivo', () => {
    expect(stimaTempiDaComputo(righe, { ...a, operai: 0 }).stato).toBe('non_valido');
    expect(stimaTempiDaComputo(righe, { ...a, resaPct: 5 }).stato).toBe('non_valido');
    expect(stimaTempiDaComputo(righe, { ...a, costoOrario: 0 }).stato).toBe('non_valido');
  });
});

import { dataFine, scenariPrezzo, scenariSquadra } from '@/lib/preventivi/scenariPreventivo';

describe('scenari «e se…»', () => {
  it('prezzo: margine a parità di costi', () => {
    const s = scenariPrezzo(base, [-10, 0, -10]);
    expect(s.map(x => x.variazionePct)).toEqual([-10, 0]);
    expect(s[0]).toMatchObject({ prezzoNetto: 1620, prezzoIvato: 1782, margineEur: 480, marginePct: 29.6 });
    expect(s[1]).toMatchObject({ prezzoNetto: 1800, margineEur: 660, marginePct: 36.7 });
  });
  it('prezzo: costi incompleti = nessun margine', () => {
    expect(scenariPrezzo({ ...base, righeSenzaCosto: 1 }, [0])[0]).toMatchObject({ margineEur: null, marginePct: null });
    expect(scenariPrezzo({ imponibile: 0, totale: 0, costoTot: 0, righeSenzaCosto: 0 })).toEqual([]);
  });
  it('squadra: meno operai = più giorni, il confronto è con oggi', () => {
    const grandi = righe.map(r => ({ ...r, quantita: Number(r.quantita) * 20 }));
    const a = { ...ASSUNZIONI_TEMPI_PREDEFINITE, costoOrario: 30, operai: 4, oreGiorno: 8, resaPct: 100 };
    const s = scenariSquadra(grandi, a); // 280 h
    expect(s.map(x => [x.operai, x.giorniLavorativi])).toEqual([[3, 12], [4, 9], [5, 7], [6, 6]]);
    expect(s.find(x => x.operai === 4)?.giorniRispettoAOggi).toBe(0);
    expect(s.find(x => x.operai === 3)?.giorniRispettoAOggi).toBe(3);
  });
  it('data di fine: salta i fine settimana', () => {
    expect(dataFine('2026-10-26', 5)).toBe('2026-10-30'); // lun→ven
    expect(dataFine('2026-10-26', 6)).toBe('2026-11-02'); // salta sab e dom
    expect(dataFine('2026-10-31', 1)).toBe('2026-11-02'); // parte di sabato: primo giorno lavorativo lunedì
    expect(dataFine('boh', 3)).toBeNull();
  });
});

import { margineChatIntent, margineChatReply } from '@/lib/preventivi/margineChat';

describe('domanda di margine in chat', () => {
  it('riconosce prezzo e margine in frasi naturali', () => {
    expect(margineChatIntent('Voglio fare il lavoro a 18.000 € con il 25% di margine')).toMatchObject({ prezzo: 18000, marginePct: 25, ivaInclusa: false });
    expect(margineChatIntent('quanto posso spendere se vendo a 12500 euro e voglio un margine del 30%')).toMatchObject({ prezzo: 12500, marginePct: 30 });
    expect(margineChatIntent('margine 20% su € 9.800,50')).toMatchObject({ prezzo: 9800.5, marginePct: 20 });
    expect(margineChatIntent('lavoro da 18k, 25% di margine')).toMatchObject({ prezzo: 18000, marginePct: 25 });
  });
  it('IVA: inclusa solo se detta, con l’aliquota della frase', () => {
    expect(margineChatIntent('a 11.000 € IVA inclusa con 30% di margine, IVA 10%')).toMatchObject({ ivaInclusa: true, ivaPct: 10 });
    expect(margineChatIntent('a 11.000 € più IVA con 30% di margine')).toMatchObject({ ivaInclusa: false });
  });
  it('non scambia altre frasi per domande di margine', () => {
    expect(margineChatIntent('aggiungi la demolizione del pavimento, 25 mq')).toBeNull();
    expect(margineChatIntent('il margine è importante')).toBeNull();
    expect(margineChatIntent('sconto del 10% sul totale di 5000 euro')).toBeNull();
    expect(margineChatIntent('x'.repeat(500) + ' margine 20% 1000 euro')).toBeNull();
  });
  it('risponde col tetto di costo, senza inventare costi', () => {
    const r = margineChatReply({ prezzo: 18000, marginePct: 25, ivaInclusa: false, ivaPct: null });
    expect(r).toContain('13.500,00');
    expect(r).toContain('Obiettivo di margine e tempi');
    expect(margineChatReply({ prezzo: 11000, marginePct: 30, ivaInclusa: true, ivaPct: 10 })).toContain('7.000,00');
    expect(margineChatReply({ prezzo: 11000, marginePct: 30, ivaInclusa: true, ivaPct: null })).toContain('aliquota');
    expect(margineChatReply({ prezzo: 1000, marginePct: 99, ivaInclusa: false, ivaPct: null })).toContain('da 0%');
  });
});

import { consigliPreventivo } from '@/lib/preventivi/consigli';
import { dataPrima } from '@/lib/preventivi/scenariPreventivo';

describe('consigli operativi', () => {
  const fe = (v: number) => `${v} €`;
  const grandi = righe.map(r => ({ ...r, quantita: Number(r.quantita) * 20 }));
  const ass = { ...ASSUNZIONI_TEMPI_PREDEFINITE, costoOrario: 30, operai: 2, oreGiorno: 8, resaPct: 100 };
  it('data di ordine: giorni lavorativi prima dell’inizio', () => {
    expect(dataPrima('2026-11-02', 3)).toBe('2026-10-28'); // lun 2/11 meno 3 lavorativi: ven, gio, mer
    expect(dataPrima('2026-11-02', 0)).toBe('2026-11-02');
    expect(dataPrima('boh', 3)).toBeNull();
  });
  it('sforo: prezzo minimo o taglio, partendo dalla voce più pesante', () => {
    const margine = calcObiettivoMargine(righe, base, { marginePct: 40, prezzo: null, prezzoIvato: false });
    const c = consigliPreventivo({ margine, tempi: stimaTempiDaComputo(righe, ass), operaiOggi: 2, inizioIso: '', consegnaGiorni: 0, formatEuro: fe });
    expect(c[0]).toContain('2090 €');
    expect(c[0]).toContain('Posa gres');
  });
  it('margine rispettato: dice quanto sconto si può concedere', () => {
    const margine = calcObiettivoMargine(righe, base, { marginePct: 20, prezzo: null, prezzoIvato: false });
    const c = consigliPreventivo({ margine, tempi: stimaTempiDaComputo(righe, ass), operaiOggi: 2, inizioIso: '', consegnaGiorni: 0, formatEuro: fe });
    expect(c[0]).toMatch(/sconto/);
  });
  it('squadra, date e ordine materiali', () => {
    const margine = calcObiettivoMargine(righe, base, { marginePct: 20, prezzo: null, prezzoIvato: false });
    const tempi = stimaTempiDaComputo(grandi, ass, 5); // 280 h in 5 giorni → 7 operai
    const c = consigliPreventivo({ margine, tempi, operaiOggi: 2, inizioIso: '2026-11-02', consegnaGiorni: 3, formatEuro: fe });
    const testo = c.join(' | ');
    expect(testo).toContain('Per chiudere in 5 giorni inserisci 5 persone in più');
    expect(consigliPreventivo({ margine, tempi: stimaTempiDaComputo(grandi, ass, 1), operaiOggi: 2, inizioIso: '', consegnaGiorni: 0, formatEuro: fe }).join(' ')).toContain('in 1 giorno inserisci');
    expect(testo).toContain('finisci il 25/11/2026'); // 280 h / (2 × 8 h) = 18 giorni lavorativi dal lunedì 2/11
    expect(testo).toContain('ordina i materiali entro il 28/10/2026');
  });
  it('costi incompleti: chiede il costo invece di consigliare', () => {
    const margine = calcObiettivoMargine(righe, { ...base, righeSenzaCosto: 2 }, { marginePct: 20, prezzo: null, prezzoIvato: false });
    const c = consigliPreventivo({ margine, tempi: { stato: 'senza_manodopera', voci: 1 }, operaiOggi: 2, inizioIso: '', consegnaGiorni: 0, formatEuro: fe });
    expect(c).toHaveLength(1);
    expect(c[0]).toContain('Completa il costo');
  });
});

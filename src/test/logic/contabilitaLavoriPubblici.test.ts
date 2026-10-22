import { describe, expect, it, vi } from "vitest";
import { proponiSezioneQuadro, quadroEconomicoCompleto, sezioneVoce, type VoceQuadro } from "@/lib/computo/quadroEconomico";
import {
  calcolaSal, certificatoPagamento, confrontoVariante, elencoPrezzi, numeroDigitato, prezzoRibassato, progressiviLibretto, quantitaRiga, quantitaRighe,
  registroContabilita, vociContratto, type RegistrazioneLibretto, type VoceComputoContabile, type VoceContratto,
} from "@/lib/computo/contabilitaLavori";

/** Dati inventati (repo pubblico): un piccolo computo con lavori, sicurezza e somme a disposizione. */
const voce = (o: Partial<VoceComputoContabile> & { id: string; importo: number; q?: number; p?: number }): VoceComputoContabile => ({
  ordine: Number(o.id.replace(/\D/g, "")) || 0, numero_ordine: o.id, codice_tariffa: `T.${o.id}`, descrizione_breve: o.descrizione_breve ?? `Voce ${o.id}`,
  descrizione_estesa: null, unita_misura: "m²", quantita: o.q ?? 1, prezzo_unitario_computo: o.p ?? o.importo, importo_computo: o.importo,
  is_sicurezza: false, a_corpo: false, ...o,
});

const computo: VoceComputoContabile[] = [
  voce({ id: "1", importo: 60000, q: 1000, p: 60, super_categoria: "Opere edili", descrizione_breve: "Massetto in sabbia e cemento" }),
  voce({ id: "2", importo: 30000, q: 1, p: 30000, a_corpo: true, super_categoria: "Opere edili", descrizione_breve: "Impianto elettrico a corpo, compresi prove e collaudo" }),
  voce({ id: "3", importo: 10000, q: 100, p: 100, is_sicurezza: true, super_categoria: "Oneri della sicurezza", descrizione_breve: "Ponteggio" }),
  voce({ id: "4", importo: 10000, super_categoria: "Somme a disposizione", descrizione_breve: "IVA 10% sui lavori" }),
  voce({ id: "5", importo: 8000, super_categoria: "Spese tecniche", descrizione_breve: "Direzione dei lavori e contabilità" }),
  voce({ id: "6", importo: 320, descrizione_breve: "Inarcassa 4% sulle spese tecniche" }),
  voce({ id: "7", importo: 1500, descrizione_breve: "Visto di conformità" }),
];

describe("quadro economico: lavori e somme a disposizione", () => {
  it("propone le somme a disposizione per parole chiave, senza confondere i lavori", () => {
    const sezioni = computo.map(v => sezioneVoce(v));
    expect(sezioni).toEqual(["lavori", "lavori", "lavori", "somme_a_disposizione", "somme_a_disposizione", "somme_a_disposizione", "somme_a_disposizione"]);
    expect(proponiSezioneQuadro({ importo_computo: 1, is_sicurezza: false, a_corpo: false, descrizione_breve: "Fornitura di pavimento (IVA esclusa)" }).sezione).toBe("lavori");
    expect(proponiSezioneQuadro({ importo_computo: 1, is_sicurezza: false, a_corpo: false, descrizione_breve: "Collaudo statico" }).motivo).toBe("collaudo");
    expect(proponiSezioneQuadro({ importo_computo: 1, is_sicurezza: false, a_corpo: false, descrizione_breve: "Imprevisti e arrotondamenti" }).sezione).toBe("somme_a_disposizione");
    // Una voce di sicurezza resta lavoro anche se parla di coordinamento.
    expect(proponiSezioneQuadro({ importo_computo: 1, is_sicurezza: true, a_corpo: false, descrizione_breve: "Riunioni di coordinamento della sicurezza" }).sezione).toBe("lavori");
  });

  it("la scelta fatta a mano vale sulla proposta", () => {
    const v: VoceQuadro = { importo_computo: 1, is_sicurezza: false, a_corpo: false, descrizione_breve: "Allacciamento alla rete fognaria", quadro_voce: "lavori" };
    expect(proponiSezioneQuadro(v).sezione).toBe("somme_a_disposizione");
    expect(sezioneVoce(v)).toBe("lavori");
  });

  it("A = a misura + a corpo; ribasso solo su A − sicurezza; B a parte; A + B = totale del documento", () => {
    const q = quadroEconomicoCompleto(computo, 10);
    expect(q.lavori_a_misura).toBe(70000); // 60.000 + 10.000 di sicurezza a misura
    expect(q.lavori_a_corpo).toBe(30000);
    expect(q.quadro.importo_lavori).toBe(100000);
    expect(q.quadro.oneri_sicurezza).toBe(10000);
    expect(q.quadro.soggetto_a_ribasso).toBe(90000);
    expect(q.quadro.ribasso_euro).toBe(9000);
    expect(q.quadro.importo_contrattuale).toBe(91000);
    expect(q.totale_somme).toBe(19820);
    expect(q.somme.map(s => s.capitolo)).toEqual(["Somme a disposizione", "Spese tecniche", "Senza capitolo"]);
    expect(q.totale_intervento).toBe(119820);
    expect(q.totale_computo).toBe(119820);
  });
});

const contratto: VoceContratto[] = vociContratto(computo);
const reg = (id: string, numero: number, data: string, voce_radice: string, quantita: number): RegistrazioneLibretto => ({ id, numero, data, voce_radice, quantita });

describe("elenco prezzi e libretto", () => {
  it("nella contabilità entrano solo i lavori; prezzo ribassato al centesimo, sicurezza piena", () => {
    expect(contratto.map(v => v.numero)).toEqual(["1", "2", "3"]);
    const elenco = elencoPrezzi(contratto, 12.345);
    expect(elenco.map(r => [r.numero, r.prezzo, r.prezzo_ribassato])).toEqual([["1", 60, 52.59], ["2", 30000, 26296.5], ["3", 100, 100]]);
    expect(prezzoRibassato(10, 33.333, false)).toBe(6.67);
  });

  it("righe di misura: par.ug. × lung. × larg. × H, oppure la quantità scritta", () => {
    expect(quantitaRiga({ parti_uguali: 2, lunghezza: 4.5, larghezza: 3 })).toBe(27);
    expect(quantitaRiga({ quantita: 12.5, lunghezza: 99 })).toBe(12.5);
    expect(quantitaRighe([{ lunghezza: 10, larghezza: 2 }, { parti_uguali: -1, lunghezza: 1, larghezza: 2 }])).toBe(18);
  });

  it("progressivo per voce in ordine di data, con avviso oltre la quantità di contratto", () => {
    const p = progressiviLibretto([
      reg("b", 2, "2026-03-10", "3", 70), reg("a", 1, "2026-02-01", "3", 40), reg("c", 3, "2026-03-11", "1", 200),
    ], contratto);
    expect(p.get("a")).toMatchObject({ progressivo: 40, eccedenza: 0 });
    expect(p.get("b")).toMatchObject({ progressivo: 110, quantita_contratto: 100, eccedenza: 10 });
    expect(p.get("c")?.progressivo).toBe(200);
  });
});

describe("registro di contabilità", () => {
  const libretto = [
    reg("1", 1, "2026-02-10", "1", 300), reg("2", 2, "2026-02-20", "2", 0.25), reg("3", 3, "2026-02-20", "3", 30),
    reg("4", 4, "2026-03-15", "1", 200), reg("5", 5, "2026-03-20", "2", 0.25), reg("6", 6, "2026-03-20", "3", 20),
  ];

  it("cumula le quantità fino alla data e applica il ribasso al totale dei lavori, sicurezza a misura", () => {
    const r = registroContabilita(contratto, libretto, { ribasso_percentuale: 10, sicurezza_modo: "a_misura", fino_al: "2026-02-28" });
    expect(r.righe.map(x => [x.numero, x.quantita, x.importo_lordo])).toEqual([["1", 300, 18000], ["2", 0.25, 7500], ["3", 30, 3000]]);
    expect(r.lavori_lordo).toBe(25500);
    expect(r.ribasso).toBe(2550);
    expect(r.lavori_netti).toBe(22950);
    expect(r.sicurezza).toBe(3000);
    expect(r.totale).toBe(25950);
    const tutto = registroContabilita(contratto, libretto, { ribasso_percentuale: 10, sicurezza_modo: "a_misura" });
    expect(tutto.righe[0]).toMatchObject({ quantita: 500, percentuale_eseguita: 50 });
    expect(tutto.totale).toBe(45000 * 0.9 + 5000);
  });

  it("sicurezza in proporzione ai lavori eseguiti", () => {
    const r = registroContabilita(contratto, libretto, { ribasso_percentuale: 10, sicurezza_modo: "proporzionale", fino_al: "2026-02-28" });
    // 25.500 / 90.000 dei lavori → 28,333…% di 10.000 di sicurezza
    expect(r.sicurezza).toBe(2833.33);
    expect(r.totale).toBe(25783.33);
  });
});

describe("SAL e certificato di pagamento", () => {
  const libretto = [reg("1", 1, "2026-02-10", "1", 300), reg("2", 2, "2026-02-20", "2", 0.25), reg("3", 3, "2026-02-20", "3", 30),
    reg("4", 4, "2026-03-15", "1", 200), reg("5", 5, "2026-03-20", "2", 0.25), reg("6", 6, "2026-03-20", "3", 20)];
  const opz = { ribasso_percentuale: 10, sicurezza_modo: "a_misura" as const };

  it("SAL n. 1: ritenuta 0,50%, recupero dell'anticipazione al 20%, nessun precedente", () => {
    const s = calcolaSal(registroContabilita(contratto, libretto, { ...opz, fino_al: "2026-02-28" }),
      { importo_contrattuale: 91000, anticipazione_percentuale: 20, sal_precedenti: 0 });
    expect(s.totale_a_oggi).toBe(25950);
    expect(s.ritenuta).toBe(129.75);
    expect(s.anticipazione).toBe(18200);
    expect(s.recupero_anticipazione).toBe(5190);
    expect(s.netto_a_oggi).toBe(20630.25);
    expect(s.importo_sal).toBe(20630.25);
  });

  it("SAL n. 2: tutto in progressivo, si detraggono i SAL precedenti", () => {
    const s = calcolaSal(registroContabilita(contratto, libretto, opz),
      { importo_contrattuale: 91000, anticipazione_percentuale: 20, sal_precedenti: 20630.25 });
    expect(s.totale_a_oggi).toBe(45500);
    expect(s.ritenuta).toBe(227.5);
    expect(s.recupero_anticipazione).toBe(9100);
    expect(s.netto_a_oggi).toBe(36172.5);
    expect(s.importo_sal).toBe(15542.25);
  });

  it("il recupero dell'anticipazione non supera l'anticipazione", () => {
    const tutto = [reg("x", 1, "2026-05-01", "1", 1000), reg("y", 2, "2026-05-01", "2", 1), reg("z", 3, "2026-05-01", "3", 100)];
    const s = calcolaSal(registroContabilita(contratto, tutto, opz), { importo_contrattuale: 91000, anticipazione_percentuale: 20, sal_precedenti: 0, ritenuta_percentuale: 0.5 });
    expect(s.totale_a_oggi).toBe(91000);
    expect(s.recupero_anticipazione).toBe(18200);
  });

  it("certificato: IVA e split payment", () => {
    expect(certificatoPagamento(20630.25, 10, true)).toEqual({ imponibile: 20630.25, aliquota_iva: 10, iva: 2063.03, totale: 22693.28, split_payment: true, da_pagare_impresa: 20630.25 });
    expect(certificatoPagamento(1000, 22, false).da_pagare_impresa).toBe(1220);
  });
});

describe("perizia di variante", () => {
  it("confronto contratto / variante / differenza con nuovo prezzo e variazione %", () => {
    const variante: VoceContratto[] = [
      { ...contratto[0], voce_id: "v1", quantita: 1100, importo: 66000 },
      { ...contratto[1], voce_id: "v2" },
      { ...contratto[2], voce_id: "v3", quantita: 80, importo: 8000 },
      { radice: "np1", voce_id: "np1", numero: "NP.1", tariffa: "NP.1", descrizione: "Nuovo prezzo: drenaggio", unita_misura: "m", quantita: 50, prezzo: 40, importo: 2000, is_sicurezza: false, a_corpo: false, nuovo_prezzo: true, ordine: 99 },
    ];
    const c = confrontoVariante(contratto, variante, 10);
    expect(c.righe.map(r => [r.numero, r.esito, r.differenza])).toEqual([["1", "aumentata", 6000], ["2", "invariata", 0], ["3", "ridotta", -2000], ["NP.1", "nuova", 2000]]);
    expect(c.contratto).toEqual({ lavori: 90000, sicurezza: 10000, importo_contrattuale: 91000 });
    // lavori 98.000 − 10% + sicurezza 8.000 = 96.200
    expect(c.variante.importo_contrattuale).toBe(96200);
    expect(c.differenza).toBe(5200);
    expect(c.percentuale).toBe(5.7143);
    expect(c.oltre_quinto).toBe(false);
  });

  it("voce soppressa e variante oltre il quinto d'obbligo", () => {
    const c = confrontoVariante(contratto, [{ ...contratto[2] }], 0);
    expect(c.righe.filter(r => r.esito === "soppressa").map(r => r.numero)).toEqual(["1", "2"]);
    expect(c.oltre_quinto).toBe(true);
  });
});

describe("numeri scritti all'italiana", () => {
  it("virgola decimale, punto delle migliaia; senza virgola il punto è decimale", () => {
    expect([numeroDigitato("1.234,5"), numeroDigitato("4,50"), numeroDigitato("4.50"), numeroDigitato(""), numeroDigitato("abc")]).toEqual([1234.5, 4.5, 4.5, null, NaN]);
  });
});

describe("stampe PDF della contabilità", () => {
  it("elenco prezzi, libretto, registro, SAL, certificato e confronto si generano senza errori", async () => {
    const st = await import("@/lib/computo/stampeContabilita");
    const creati: Blob[] = [];
    const origCreate = URL.createObjectURL; const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = ((b: Blob) => { creati.push(b); return "blob:x"; }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = () => {};
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const h = { lavori: "Lavori di prova", stazioneAppaltante: "Comune di Prova", cig: "A1", cup: "B2", impresa: "Impresa di prova", ribasso: 10 };
    const libretto = [reg("1", 1, "2026-02-10", "1", 300), reg("2", 2, "2026-02-20", "3", 30)];
    const registro = registroContabilita(contratto, libretto, { ribasso_percentuale: 10, sicurezza_modo: "a_misura" });
    const sal = calcolaSal(registro, { importo_contrattuale: 91000, anticipazione_percentuale: 20, sal_precedenti: 0 });
    try {
      await st.stampaElencoPrezzi(elencoPrezzi(contratto, 10), h);
      await st.stampaLibretto(libretto.map(r => ({ numero: r.numero, data: r.data, voce: r.voce_radice, tariffa: "", descrizione: "Voce", unita_misura: "m²",
        righe: [{ descrizione: "Piano terra", lunghezza: 10, larghezza: 30 }], quantita: r.quantita, annotazioni: null, firmatario: "Ing. Prova", firmato: true,
        progressivo: undefined, sal: 1 })), h);
      await st.stampaRegistro(registro, "2026-02-28", h);
      await st.stampaSal({ ...sal, numero: 1, data: "2026-03-01", lavori_a_tutto: "2026-02-28", sicurezza_modo: "a_misura", ribasso_percentuale: 10, stato: "approvato" },
        [{ numero: "1", tariffa: "T.1", descrizione: "Massetto", unita_misura: "m²", is_sicurezza: false, prezzo: 60, quantita_precedente: 0, quantita_a_oggi: 300, importo_a_oggi: 18000 }], h);
      await st.stampaCertificato({ ...certificatoPagamento(sal.importo_sal, 10, true), numero: 1, data: "2026-03-05", salNumero: 1, lavoriATutto: "2026-02-28" }, sal, h);
      await st.stampaConfrontoVariante(confrontoVariante(contratto, contratto.slice(0, 2), 10), "Variante 1", h);
    } finally {
      URL.createObjectURL = origCreate; URL.revokeObjectURL = origRevoke; click.mockRestore();
    }
    expect(creati).toHaveLength(6);
    expect(creati.every(b => b.type === "application/pdf" && b.size > 1000)).toBe(true);
  }, 30_000);
});

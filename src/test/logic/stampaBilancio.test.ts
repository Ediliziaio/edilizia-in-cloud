/**
 * Conto economico e Stato patrimoniale da stampare (09/11/2026).
 *
 * La cosa che conta: se attivo e passivo non quadrano, il foglio lo dice in
 * testa. Nei dati veri non quadrano quasi mai — mancano crediti tributari,
 * anticipi, cassa contanti — e stampare due colonne che non tornano senza
 * dirlo significa farlo scoprire al commercialista.
 */
import { describe, expect, it } from "vitest";
import {
  differenzaLeggibile,
  htmlContoEconomico,
  htmlStatoPatrimoniale,
  vociAttivo,
  vociPassivo,
} from "@/lib/contabilita/stampaBilancio";

const azienda = { ragione_sociale: "Edil Prova S.r.l.", partita_iva: "01234567890" };

const attivo = {
  imm_immateriali: 5000, imm_materiali: 120000, imm_finanziarie: 0, attivo_fisso: 125000,
  rimanenze: 40000, crediti_clienti: 210000, crediti_tributari: 0, anticipi_fornitori: 0,
  liquidita_differite: 250000, cassa: 0, banche_positive: 60000, liquidita_immediate: 60000,
  attivo_circolante: 350000, totale: 475000,
};
const passivo = {
  capitale_sociale: 50000, riserve: 80000, utile_esercizio: 45000, rettifica_patrimoniale: 0,
  mezzi_propri: 175000, fondo_tfr: 30000, fondi_rischi: 0, mutui_mlt: 90000, pas_consolidato: 120000,
  banche_negative: 20000, debiti_fornitori: 150000, debiti_tributari: 10000, debiti_personale: 0,
  debiti_previdenziali: 0, pas_corrente: 180000, totale: 475000,
};

describe("Lo stato patrimoniale", () => {
  it("mette attivo e passivo nell'ordine giusto, coi subtotali in evidenza", () => {
    const a = vociAttivo(attivo);
    expect(a[0].label).toBe("Immobilizzazioni immateriali");
    expect(a.find((v) => v.label === "Attivo fisso")).toMatchObject({ valore: 125000, forte: true });
    expect(a[a.length - 1]).toMatchObject({ label: "Totale attivo", valore: 475000, forte: true });
    const p = vociPassivo(passivo);
    expect(p[p.length - 1]).toMatchObject({ label: "Totale passivo", valore: 475000, forte: true });
  });

  it("la rettifica patrimoniale compare solo se c'è", () => {
    expect(vociPassivo(passivo).some((v) => /Rettifica/.test(v.label))).toBe(false);
    expect(vociPassivo({ ...passivo, rettifica_patrimoniale: 1200 }).some((v) => /Rettifica/.test(v.label))).toBe(true);
  });

  it("quando quadra lo dice e basta", () => {
    const html = htmlStatoPatrimoniale({
      azienda, attivo: vociAttivo(attivo), passivo: vociPassivo(passivo), anno: 2026,
      quadratura: { differenza: 0, quadrato: true },
    });
    expect(html).toContain("Quadra");
    expect(html).not.toContain("ATTENZIONE");
  });

  it("quando NON quadra lo scrive in testa, con la differenza e dove guardare", () => {
    const html = htmlStatoPatrimoniale({
      azienda, attivo: vociAttivo(attivo), passivo: vociPassivo({ ...passivo, totale: 320000 }), anno: 2026,
      quadratura: { differenza: 155000, quadrato: false },
    });
    expect(html).toContain("ATTENZIONE");
    expect(html).toContain("155.000,00");
    expect(html).toMatch(/crediti tributari/);
  });

  it("una differenza di centesimi si dice a parole, non con tre decimali", () => {
    expect(differenzaLeggibile(0.004)).toBe("meno di un euro");
    expect(differenzaLeggibile(-1200)).toContain("1.200,00");
  });

  it("dice che è riclassificato, non il bilancio da depositare", () => {
    const html = htmlStatoPatrimoniale({
      azienda, attivo: vociAttivo(attivo), passivo: vociPassivo(passivo), anno: 2026,
      quadratura: { differenza: 0, quadrato: true },
    });
    expect(html).toMatch(/non sono quelli del bilancio civilistico/);
  });
});

describe("Il conto economico", () => {
  const voci = [
    { codice: "01", label: "Ricavi delle vendite", valore: 800000 },
    { codice: "02", label: "Costi per materie prime", valore: -300000 },
    { codice: "E", label: "EBITDA", valore: 120000, forte: true },
  ];

  it("mette la percentuale sui ricavi accanto a ogni voce", () => {
    const html = htmlContoEconomico({ azienda, voci, anno: 2026 });
    expect(html).toContain("% ricavi");
    expect(html).toContain("15%"); // EBITDA 120.000 su 800.000
    expect(html).toContain("-37,5%");
  });

  it("dice che le imposte sono una stima, quando lo sono", () => {
    const html = htmlContoEconomico({ azienda, voci, anno: 2026, aliquotaImposte: 24 });
    expect(html).toMatch(/stima al 24%/);
    expect(html).toMatch(/le calcola il commercialista/);
  });

  it("col periodo parziale scrive i mesi, non solo l'anno", () => {
    expect(htmlContoEconomico({ azienda, voci, anno: 2026, mesi: "Gen-Mar" }))
      .toContain("Esercizio 2026 · Gen-Mar");
    expect(htmlContoEconomico({ azienda, voci, anno: 2026 }))
      .toContain("Esercizio 2026");
  });

  it("senza ricavi non divide per zero", () => {
    const html = htmlContoEconomico({ azienda, voci: [{ label: "Costi", valore: -100 }], anno: 2026 });
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("NaN");
  });
});

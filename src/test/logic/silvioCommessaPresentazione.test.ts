/** Come il popup «Crea con Silvio» mostra il piano (fase 1, lotto 1.5): funzioni pure. */
import { describe, expect, it } from "vitest";
import { fondi, pianoVuoto, applica } from "../../../shared/silvio-commessa/fondi.ts";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import { scritturaDalPiano } from "@/lib/silvio-commessa/scrittura";
import {
  contiDellaBarra, domandaDiSilvio, elencoControlla, fineLavori, marginePrevisto, pianoProposto, prossimoLunedi,
  rifiutoInParole, stimaLettura, testoValore,
} from "@/components/silvio-commessa/presentazione";

const AZIENDA = "d2000000-0000-4000-a000-000000000002";
const preventivo: Frammento = {
  fonte: { tipo: "preventivo", id: "q1", etichetta: "preventivo PR-0142" },
  aree: {
    cliente: { "cliente.nome": { valore: { client_name: "Mario Rossi" }, fiducia: 1, stato: "fatto" } },
    economia: { "economia.total_amount": { valore: 48500, fiducia: 1, stato: "fatto" } },
    costi: { "costi.previsti": { valore: [{ fase: "Demolizioni", importo: 30000, vociSenzaCosto: 0 }], fiducia: 1, stato: "fatto" } },
    fasi: {
      "fasi.order_work_phases": {
        valore: [{ name: "Demolizioni", start_date: "2026-11-09", end_date: "2026-11-11" }, { name: "Impianti", start_date: "2026-11-12", end_date: "2026-11-18" }],
        fiducia: 1, stato: "fatto",
      },
    },
    cantiere: { "cantiere.materials_location": { valore: "cortile", fiducia: 0.5, stato: "proposta" } },
  },
};
const contratto: Frammento = {
  fonte: { tipo: "contratto", etichetta: "Contratto.pdf" },
  aree: { economia: { "economia.total_amount": { valore: 47900, fiducia: 0.9, stato: "fatto" } } },
};

describe("presentazione del popup", () => {
  it("i rifiuti dell'annullamento diventano parole", () => {
    expect(rifiutoInParole("Non si può annullare: qualcuno ci ha già lavorato sopra (company_costs)."))
      .toBe("Non si può annullare: dopo Silvio qualcuno ha aggiunto un costo su questa commessa. Toglilo prima, oppure tieni la commessa com'è.");
    expect(rifiutoInParole("Non si può annullare: qualcuno ci ha già lavorato sopra (campo_rapportini).")).toMatch(/un rapportino/);
    expect(rifiutoInParole("Non si può annullare: qualcuno ha già modificato order_work_phases creati da Silvio."))
      .toBe("Non si può annullare: qualcuno ha già modificato una fase che Silvio aveva preparato.");
    expect(rifiutoInParole("Non si può annullare: «total_amount» è stato cambiato dopo Silvio.")).toBe("Non si può annullare: «Importo» è stato cambiato dopo Silvio.");
    expect(rifiutoInParole("Non si può annullare: qualcuno ci ha già lavorato sopra (tabella_nuova).")).toMatch(/un dato collegato/);
  });

  it("stima il costo prima di leggere: zero per le regole", () => {
    expect(stimaLettura({ ai: false, immagine: false, fonte: "computo", lettore: "computo_xpwe" })).toBe(0);
    expect(stimaLettura({ ai: true, immagine: true, fonte: "documento", lettore: "silvio_commessa" })).toBe(0.005);
    expect(stimaLettura({ ai: true, immagine: false, fonte: "contratto", lettore: "silvio_commessa" }, 200_000)).toBe(0.01);
    expect(stimaLettura({ ai: true, immagine: false, fonte: "contratto", lettore: "silvio_commessa" }, 50_000_000)).toBe(0.04);
  });

  it("margine, fine lavori, testi e conti della barra", () => {
    const piano = fondi(pianoVuoto(AZIENDA), preventivo);
    expect(marginePrevisto(piano)).toEqual({ euro: 18500, percento: 38 });
    expect(fineLavori(piano)).toBe("2026-11-18");
    expect(testoValore("fasi.order_work_phases", piano.aree.fasi!["fasi.order_work_phases"].valore)).toBe("2 fasi · 9 nov → 18 nov");
    const s = scritturaDalPiano(piano);
    const conti = contiDellaBarra(piano, s, 0.04);
    // La proposta 🟡 (dove si scaricano i materiali) aspetta: non è pronta.
    expect(conti.aspettano).toBeGreaterThanOrEqual(1);
    expect(elencoControlla(piano, s).find((g) => g.area === "cantiere")?.voci[0]).toMatchObject({ fuori: "proposta da confermare" });
  });

  it("una domanda alla volta: prima il conflitto, poi l'inizio lavori", () => {
    let piano = fondi(fondi(pianoVuoto(AZIENDA), preventivo), contratto);
    const d = domandaDiSilvio(piano, scritturaDalPiano(piano), new Date(2026, 9, 31));
    expect(d?.testo).toMatch(/Contratto\.pdf dice 47\.900/);
    expect(d?.risposte).toHaveLength(2);
    piano = applica(piano, { tipo: "scegli_fonte", area: "economia", chiave: "economia.total_amount", fonte: "contratto" }).piano;
    const dopo = domandaDiSilvio(piano, scritturaDalPiano(piano), new Date(2026, 9, 31));
    expect(dopo?.testo).toMatch(/Quando iniziano i lavori/);
    expect(dopo?.risposte[0].etichetta).toBe("Inizio lun 2 nov");
    expect(prossimoLunedi(new Date(2026, 10, 2))).toBe("2026-11-09");
  });

  it("il proposto per le correzioni è il piano senza le modifiche della persona", () => {
    const base = fondi(pianoVuoto(AZIENDA), preventivo);
    const { piano, storia } = applica(base, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 50000 });
    expect(pianoProposto(piano, storia).aree.economia!["economia.total_amount"].valore).toBe(48500);
  });
});

describe("Controlla, per chi non vede gli importi (visto a schermo il 2/11)", () => {
  it("il motivo di una voce d'importo rimasta fuori non cita le cifre", () => {
    const motivo = "Le rate fanno 48.500,00 €, il totale con l'IVA è 52.690,00 €";
    const piano = {
      companyId: "az", conflitti: [], fonti: [],
      aree: { pagamenti: { "pagamenti.rate": { valore: [{ label: "Acconto", type: "deposit", amount: 48500 }], fiducia: 1, stato: "attenzione", fonte: { tipo: "preventivo", etichetta: "preventivo" } } } },
    } as unknown as Parameters<typeof elencoControlla>[0];
    const scrittura = { escluse: [{ chiave: "pagamenti.rate", etichetta: "Rate", motivo }] } as unknown as Parameters<typeof elencoControlla>[1];
    const voce = (vede: boolean) => elencoControlla(piano, scrittura, vede).flatMap((g) => g.voci).find((v) => v.chiave === "pagamenti.rate")!;
    expect(voce(true).fuori).toBe(motivo);
    expect(voce(false).fuori).not.toMatch(/\d/);
    expect(voce(false).testo).not.toMatch(/\d/);
  });
});

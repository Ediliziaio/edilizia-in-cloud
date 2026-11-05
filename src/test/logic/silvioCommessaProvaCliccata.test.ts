/**
 * I difetti trovati cliccando il popup «Crea con Silvio» come una persona (2/11/2026), con file
 * veri e AI finta. Qui quelli che stanno nei conti e nelle parole. Dati di prova inventati.
 */
import { describe, expect, it } from "vitest";
import type { Frammento } from "../../../shared/silvio-commessa/piano.ts";
import { applica, fondi, pianoVuoto } from "../../../shared/silvio-commessa/fondi.ts";
import { frammentoDaRispostaAI } from "../../../shared/silvio-commessa/letturaAI.ts";
import { avvisiDiRipresa } from "../../../shared/silvio-commessa/quadratura.ts";
import { scritturaDalPiano, type ScritturaCommessa } from "@/lib/silvio-commessa/scrittura";
import { cosaDecidere, cosaScriveCrea, domandaDiSilvio, testoDaDecidere } from "@/components/silvio-commessa/presentazione";

const AZ = "d2000000-0000-4000-a000-000000000002";
const TESTO = "--- Pagina 1 ---\nIl corrispettivo è di € 48.000,00 oltre IVA al 10 %.\n30 % alla firma; 70 % alla fine dei lavori.";

const risposta = {
  aree: {
    economia: {
      "economia.total_amount": { valore: 48000, citazione: "Il corrispettivo è di € 48.000,00", dove: "pagina 1", fiducia: 0.9 },
      "economia.vat_rate": { valore: 10, citazione: "oltre IVA al 10 %", dove: "pagina 1", fiducia: 0.9 },
    },
    pagamenti: {
      "pagamenti.rate": {
        valore: [{ label: "Alla firma", type: "deposit", percent: 30 }, { label: "Alla fine", type: "balance", percent: 70 }],
        citazione: "30 % alla firma; 70 % alla fine dei lavori", dove: "pagina 1", fiducia: 0.9,
      },
    },
  },
};
const contratto = () => frammentoDaRispostaAI(JSON.stringify(risposta), { fonte: { tipo: "contratto", id: "c", etichetta: "contratto.pdf" }, testo: TESTO });

const conRateInEuro: Frammento = {
  fonte: { tipo: "contratto", id: "c", etichetta: "contratto.pdf" },
  aree: {
    cliente: { "cliente.nome": { valore: { client_name: "Arnaldo Bressanin" }, fiducia: 0.9, stato: "fatto" } },
    fasi: { "fasi.work_start_date": { valore: "2026-11-16", fiducia: 0.9, stato: "fatto" } },
    cantiere: { "cantiere.indirizzo": { valore: { indirizzo_lavori: "Via delle Ortensie 14" }, fiducia: 0.9, stato: "fatto" } },
    economia: {
      "economia.total_amount": { valore: 10000, fiducia: 0.9, stato: "fatto" },
      "economia.vat_rate": { valore: 10, fiducia: 0.9, stato: "fatto" },
    },
    pagamenti: {
      "pagamenti.rate": { valore: [{ label: "Acconto", type: "deposit", amount: 3300 }, { label: "Saldo", type: "balance", amount: 7700 }], fiducia: 0.9, stato: "fatto" },
    },
  },
} as unknown as Frammento;

describe("Il totale cambia dopo la lettura", () => {
  it("le rate scritte in percentuale seguono il totale: non spariscono dalla commessa", () => {
    const piano = fondi(pianoVuoto(AZ), contratto());
    expect(scritturaDalPiano(piano).rate.map((r) => r.amount)).toEqual([15840, 36960]);
    const { piano: dopo } = applica(piano, { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 50000 });
    expect(dopo.aree.pagamenti?.["pagamenti.rate"]?.stato).not.toBe("attenzione");
    expect(scritturaDalPiano(dopo).rate.map((r) => r.amount)).toEqual([16500, 38500]);
  });

  it("le rate in euro che non tornano più si dicono in «Da decidere»: prima era «Niente da decidere» e sparivano", () => {
    const { piano } = applica(fondi(pianoVuoto(AZ), conRateInEuro), { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 12000 });
    const scrittura = scritturaDalPiano(piano);
    expect(scrittura.rate).toEqual([]);
    const d = cosaDecidere(piano, scrittura);
    expect(d.nonTornano.map((n) => n.chiave)).toEqual(["pagamenti.rate"]);
    expect(d.nonTornano[0].testo).toMatch(/Le rate fanno 11\.000,00 €/);
    expect(d.totale).toBeGreaterThanOrEqual(1);
    expect(testoDaDecidere(d)).toMatch(/1 conto che non torna/);
    const q = domandaDiSilvio(piano, scrittura);
    expect(q?.testo).toMatch(/Le rate fanno 11\.000,00 €/);
    expect(q?.risposte).toEqual([{ etichetta: "Sistema le rate", apri: "pagamenti.rate" }]);
  });

  it("chi non vede gli importi non legge le cifre delle rate", () => {
    const { piano } = applica(fondi(pianoVuoto(AZ), conRateInEuro), { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 12000 });
    expect(cosaDecidere(piano, scritturaDalPiano(piano), undefined, { vedeImporti: false }).nonTornano).toEqual([]);
  });
});

describe("Il cliente che ferma «Crea»", () => {
  const conNome = fondi(pianoVuoto(AZ), {
    fonte: { tipo: "contratto", id: "c", etichetta: "contratto.pdf" },
    aree: {
      cliente: { "cliente.nome": { valore: { client_name: "Arnaldo Bressanin" }, fiducia: 0.9, stato: "fatto" } },
      fasi: { "fasi.work_start_date": { valore: "2026-11-16", fiducia: 0.9, stato: "fatto" } },
      economia: { "economia.total_amount": { valore: 1000, fiducia: 0.9, stato: "fatto" } },
      cantiere: { "cantiere.indirizzo": { valore: { indirizzo_lavori: "Via delle Ortensie 14" }, fiducia: 0.9, stato: "fatto" } },
    },
  } as unknown as Frammento);
  const altri = [{ id: "x", first_name: "Luisa", last_name: "Marchetto", email: null as string | null }];
  const lui = [{ id: "y", first_name: "Arnaldo", last_name: "Bressanin", email: null as string | null }];

  it("Silvio lo chiede e sta in «Da decidere» se non si ritrova nel gestionale", () => {
    const s = scritturaDalPiano(conNome);
    const q = domandaDiSilvio(conNome, s, new Date(), true, true, altri);
    expect(q?.testo).toMatch(/«Arnaldo Bressanin» non è ancora nel gestionale/);
    expect(q?.risposte[0]).toEqual({ etichetta: "Scegli o crea il cliente", apri: "cliente.customer_id" });
    expect(cosaDecidere(conNome, s, undefined, { clienti: altri }).domande.map((v) => v.chiave)).toContain("cliente.customer_id");
  });

  it("se si ritrova, non si chiede niente", () => {
    const s = scritturaDalPiano(conNome);
    expect(domandaDiSilvio(conNome, s, new Date(), true, true, lui)?.testo ?? "").not.toMatch(/gestionale/);
    expect(cosaDecidere(conNome, s, undefined, { clienti: lui }).domande.map((v) => v.chiave)).not.toContain("cliente.customer_id");
  });
});

describe("Le parole della barra e della chat", () => {
  it("«Nasce con» conta le persone, non le righe: una persona su due fasi è una persona", () => {
    const s = {
      ...scritturaDalPiano(pianoVuoto(AZ)),
      squadra: [{ employee_id: "e1", fase: "Ponteggio" }, { employee_id: "e1", fase: "Manto" }],
      ditte: [{ external_team_id: "d1", fase: "Guaina", costo_previsto: 0 }, { external_team_id: "d1", fase: "Lattonerie", costo_previsto: 0 }, { external_team_id: "d2", fase: "Ponteggio", costo_previsto: 0 }],
    } as unknown as ScritturaCommessa;
    expect(cosaScriveCrea(s)).toBe("1 persona e 2 ditte");
  });

  it("una bozza nuova ripresa non racconta che «qualcosa è cambiato» mentre era ferma", () => {
    const { piano } = applica(fondi(pianoVuoto(AZ), conRateInEuro), { tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 12000 });
    const [testo] = avvisiDiRipresa(piano);
    expect(testo).toMatch(/Le rate fanno/);
    expect(testo).not.toMatch(/Mentre la bozza era ferma/);
    expect(avvisiDiRipresa({ ...piano, orderId: "o1" })[0]).toMatch(/Mentre la bozza era ferma/);
  });

  it("quello che ha scritto la persona non è «una mia proposta»", () => {
    const { piano } = applica(fondi(pianoVuoto(AZ), { ...conRateInEuro, aree: { ...conRateInEuro.aree, pagamenti: {} } } as unknown as Frammento), {
      tipo: "cambia_valore", area: "economia", chiave: "economia.total_amount", valore: 12000, proposta: true,
    } as never);
    const q = domandaDiSilvio(piano, scritturaDalPiano(piano));
    expect(q?.testo).toMatch(/«Importo»: 12\.000\s€ al posto di 10\.000\s€/);
    expect(q?.testo).not.toMatch(/mia proposta/);
  });
});

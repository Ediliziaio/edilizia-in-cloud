/**
 * Come si misura una commessa decide quali documenti l'app propone (lotto 2 del modello
 * avanzamento/rendiconto/SAL, 28/11/2026).
 *
 * La regola da non rompere: la modalità AGGIUNGE viste, non le toglie a chi le sta già usando.
 * Al 28/11/2026 ci sono 147 commesse `semplice` con un SAL verbale emesso.
 */
import { describe, expect, it } from "vitest";
import {
  MODALITA_LAVORO,
  etichettaModalita,
  modalitaValida,
  siMisuraSulComputo,
  siRendicontaAListino,
  mostraRendicontoAlCommittente,
} from "@/lib/orders/modalitaLavoro";
import { mostraSalAlCliente } from "@/lib/orders/detailNavigation";

const base = {
  salEsistenti: 0,
  inAppalto: false,
  figliaDiGenerale: false,
  rate: [] as Array<{ trigger_evento?: string | null }>,
  aziendaUsaSal: false,
};

describe("i quattro modi di lavorare una commessa", () => {
  it("sono quattro, e quello di partenza è l'acconto e saldo", () => {
    expect(MODALITA_LAVORO.map((m) => m.value)).toEqual(["semplice", "computo", "economia", "computo_ed_economia"]);
    expect(modalitaValida(null)).toBe("semplice");
    expect(modalitaValida("pippo")).toBe("semplice");
    expect(modalitaValida("economia")).toBe("economia");
    expect(etichettaModalita("computo")).toBe("A computo");
    expect(etichettaModalita(undefined)).toBe(etichettaModalita("semplice"));
  });
  it("il computo e il listino non si escludono", () => {
    expect(siMisuraSulComputo("computo_ed_economia")).toBe(true);
    expect(siRendicontaAListino("computo_ed_economia")).toBe(true);
    expect(siMisuraSulComputo("economia")).toBe(false);
    expect(siRendicontaAListino("computo")).toBe(false);
    expect(siMisuraSulComputo("semplice")).toBe(false);
    expect(siRendicontaAListino(null)).toBe(false);
  });
});

describe("«SAL al cliente» e la modalità", () => {
  it("una commessa che si misura sul computo ha sempre il suo SAL", () => {
    expect(mostraSalAlCliente({ ...base, modalita: "computo" })).toBe(true);
    // Il caso C deciso dal titolare: in appalto, col computo, si fattura il SAL — e prima la
    // vista spariva proprio perché era in appalto.
    expect(mostraSalAlCliente({ ...base, inAppalto: true, modalita: "computo_ed_economia" })).toBe(true);
  });
  it("una commessa in economia non se lo vede comparire per la modalità", () => {
    expect(mostraSalAlCliente({ ...base, modalita: "economia" })).toBe(false);
  });
  it("chi non ha dichiarato niente si comporta come prima", () => {
    expect(mostraSalAlCliente({ ...base, modalita: null })).toBe(false);
    expect(mostraSalAlCliente({ ...base, modalita: "semplice", aziendaUsaSal: true })).toBe(true);
    expect(mostraSalAlCliente({ ...base, modalita: "semplice", inAppalto: true, aziendaUsaSal: true })).toBe(false);
  });
  it("un SAL già fatto non sparisce, qualunque modalità", () => {
    expect(mostraSalAlCliente({ ...base, salEsistenti: 3, modalita: "economia", inAppalto: true })).toBe(true);
  });
});

describe("il rendiconto del periodo", () => {
  it("resta dove è sempre stato: sui lavori in appalto non dichiarati", () => {
    expect(mostraRendicontoAlCommittente({ modalita: null, inAppalto: true })).toBe(true);
    expect(mostraRendicontoAlCommittente({ modalita: "semplice", inAppalto: true })).toBe(true);
  });
  it("in appalto col solo computo non si propone: quello si fattura col SAL", () => {
    expect(mostraRendicontoAlCommittente({ modalita: "computo", inAppalto: true })).toBe(false);
  });
  it("in appalto a listino, o col computo più gli extra, si propone", () => {
    expect(mostraRendicontoAlCommittente({ modalita: "economia", inAppalto: true })).toBe(true);
    expect(mostraRendicontoAlCommittente({ modalita: "computo_ed_economia", inAppalto: true })).toBe(true);
  });
  it("fuori dall'appalto la vista non si apre vuota, nemmeno in economia", () => {
    expect(mostraRendicontoAlCommittente({ modalita: "economia", inAppalto: false })).toBe(false);
  });
  it("un rendiconto già scritto tiene aperta la vista comunque", () => {
    expect(mostraRendicontoAlCommittente({ modalita: "computo", inAppalto: false, rendicontiEsistenti: 1 })).toBe(true);
  });
});

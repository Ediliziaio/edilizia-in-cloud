import { describe, expect, it } from "vitest";
import {
  contaPerFase, cosaFareOra, fasePratica, filtraBacheca, oraFine, ordinaBacheca, prossimaAzione, quando,
  type SopralluogoBacheca,
} from "@/lib/sopralluoghi/bacheca";

const adesso = new Date(2026, 9, 1, 12, 0, 0); // 1 ottobre 2026, ore 12
const giorno = (delta: number, ora = 10) => new Date(2026, 9, 1 + delta, ora, 0, 0).toISOString();
let n = 0;
const s = (extra: Partial<SopralluogoBacheca> = {}): SopralluogoBacheca => ({
  id: `s${n++}`, code: `SOP-2026-${String(n).padStart(4, "0")}`, status: "draft", scheduled_at: null, address: "Via Roma 1", city: "Lodi",
  contact_id: null, client_id: null, technician_id: null, estimate_id: null, order_id: null, created_at: giorno(-2), ...extra,
});

describe("fase della pratica", () => {
  it("bozza senza data = da pianificare; con data = pianificato; poi in corso, completato, firmato, preventivo", () => {
    expect(fasePratica(s())).toBe("da_pianificare");
    expect(fasePratica(s({ scheduled_at: giorno(2) }))).toBe("pianificato");
    expect(fasePratica(s({ status: "in_progress" }))).toBe("in_corso");
    expect(fasePratica(s({ status: "completed" }))).toBe("completato");
    expect(fasePratica(s({ status: "reviewed" }))).toBe("completato");
    expect(fasePratica(s({ status: "signed" }))).toBe("firmato");
    expect(fasePratica(s({ status: "converted" }))).toBe("preventivo");
    expect(fasePratica(s({ status: "completed", estimate_id: "e1" }))).toBe("preventivo");
    expect(fasePratica(s({ status: "archived" }))).toBeNull();
    expect(fasePratica(s({ status: "cancelled" }))).toBeNull();
  });
});

describe("quando e cosa fare", () => {
  it("etichette di data", () => {
    expect(quando(null, adesso).testo).toBe("Senza data");
    expect(quando(giorno(0, 15), adesso)).toEqual({ testo: "Oggi 15:00", tono: "oggi" });
    expect(quando(giorno(1, 9), adesso).testo).toBe("Domani 09:00");
    expect(quando(giorno(3, 11), adesso).testo).toBe("dom 4 ott 11:00");
    expect(quando(giorno(-3), adesso)).toEqual({ testo: "In ritardo di 3 giorni", tono: "ritardo" });
    expect(quando(giorno(-1), adesso).testo).toBe("In ritardo di 1 giorno");
    expect(quando(giorno(-3), adesso, true).tono).toBe("normale"); // già fatto: nessun ritardo
  });
  it("prossima azione per fase; appuntamento annullato", () => {
    expect(prossimaAzione(s(), adesso)).toBe("Fissa data e tecnico");
    expect(prossimaAzione(s({ scheduled_at: giorno(-2) }), adesso)).toBe("Data passata: ripianifica o avvia");
    expect(prossimaAzione(s({ status: "completed" }), adesso)).toBe("Fai firmare il cliente");
    expect(prossimaAzione(s({ status: "signed" }), adesso)).toBe("Crea il preventivo");
    expect(prossimaAzione(s({ status: "converted" }), adesso)).toBeNull();
    expect(prossimaAzione(s({ scheduled_at: giorno(2), appuntamento_stato: "annullato" }), adesso)).toBe("Appuntamento annullato: ripianifica");
  });
  it("cosa fare ora: oggi, in ritardo, bozze ferme da più di 14 giorni, finiti senza preventivo", () => {
    const righe = [
      s({ scheduled_at: giorno(0, 15) }),                       // oggi
      s({ scheduled_at: giorno(-2) }),                           // in ritardo
      s({ created_at: giorno(-30) }),                            // bozza ferma
      s({ created_at: giorno(-3) }),                             // bozza recente: no
      s({ status: "completed" }), s({ status: "signed" }),       // senza preventivo
      s({ status: "converted" }), s({ status: "archived", created_at: giorno(-90) }),
    ];
    const c = cosaFareOra(righe, adesso);
    expect([c.oggi.length, c.inRitardo.length, c.bozzeFerme.length, c.senzaPreventivo.length]).toEqual([1, 1, 1, 2]);
  });
});

describe("filtri, conteggi e ordine", () => {
  const righe = [
    s({ code: "A", scheduled_at: giorno(0, 15), technician_id: "t1", cliente_nome: "Mario Rossi", cliente_telefono: "333111" }),
    s({ code: "B", scheduled_at: giorno(4), technician_id: "t2", cliente_nome: "Anna Verdi" }),
    s({ code: "C", scheduled_at: giorno(-5) }),
    s({ code: "D" }),
    s({ code: "E", status: "signed", technician_id: "t1" }),
    s({ code: "F", status: "cancelled" }),
  ];
  const codici = (x: SopralluogoBacheca[]) => x.map((r) => r.code).sort().join("");
  it("per fase, periodo, tecnico, testo (anche nome e telefono) e senza preventivo", () => {
    expect(codici(filtraBacheca(righe, { fase: "pianificato" }, adesso))).toBe("ABC");
    expect(codici(filtraBacheca(righe, { periodo: "oggi" }, adesso))).toBe("A");
    expect(codici(filtraBacheca(righe, { periodo: "settimana" }, adesso))).toBe("AB");
    expect(codici(filtraBacheca(righe, { periodo: "in_ritardo" }, adesso))).toBe("C");
    expect(codici(filtraBacheca(righe, { periodo: "senza_data" }, adesso))).toBe("DE");
    expect(codici(filtraBacheca(righe, { tecnico: "t1" }, adesso))).toBe("AE");
    expect(codici(filtraBacheca(righe, { tecnico: "nessuno" }, adesso))).toBe("CD");
    expect(codici(filtraBacheca(righe, { testo: "rossi" }, adesso))).toBe("A");
    expect(codici(filtraBacheca(righe, { testo: "333" }, adesso))).toBe("A");
    expect(codici(filtraBacheca(righe, { soloSenzaPreventivo: true }, adesso))).toBe("E");
    expect(codici(filtraBacheca(righe, {}, adesso))).toBe("ABCDE"); // l'annullato non c'è
  });
  it("conta per fase e ordina: in ritardo e oggi prima, poi per data, poi senza data", () => {
    const c = contaPerFase(righe);
    expect(c).toMatchObject({ da_pianificare: 1, pianificato: 3, firmato: 1, preventivo: 0 });
    expect(ordinaBacheca(righe.filter((r) => r.status !== "cancelled"), adesso).map((r) => r.code).join("")).toBe("CABDE");
  });
  it("ora di fine dell'appuntamento", () => {
    expect(oraFine("10:00", 60)).toBe("11:00");
    expect(oraFine("23:30", 120)).toBe("23:59");
    expect(oraFine("09:15", 5)).toBe("09:30");
  });
});

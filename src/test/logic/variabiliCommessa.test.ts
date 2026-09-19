import { describe, it, expect } from "vitest";
import {
  costruisciVariabiliCommessa, dataBreve, dataEstesa, euro, ibanLeggibile,
  scegliFatturaDaAllegare, sostituisciVariabiliCommessa, type OrdineVariabili,
} from "../../../supabase/functions/_shared/variabiliCommessa";

describe("formati italiani", () => {
  it("data estesa col giorno della settimana, senza slittare di fuso", () => {
    expect(dataEstesa("2026-09-25")).toBe("venerdì 25 settembre 2026");
    expect(dataEstesa("2026-01-01T00:00:00+00:00")).toBe("giovedì 1 gennaio 2026");
    expect(dataEstesa("2026-02-31")).toBe("");
    expect(dataEstesa(null)).toBe("");
  });
  it("data breve", () => {
    expect(dataBreve("2026-09-05")).toBe("05/09/2026");
    expect(dataBreve("")).toBe("");
  });
  it("euro con punto delle migliaia e virgola", () => {
    expect(euro(1234.5)).toBe("1.234,50 €");
    expect(euro("18000")).toBe("18.000,00 €");
    expect(euro(0)).toBe("0,00 €");
    expect(euro(null)).toBe("");
    expect(euro("abc")).toBe("");
  });
  it("IBAN a gruppi di quattro", () => {
    expect(ibanLeggibile("it60x0542811101000000123456")).toBe("IT60 X054 2811 1010 0000 0123 456");
    expect(ibanLeggibile(null)).toBe("");
  });
});

describe("costruisciVariabiliCommessa", () => {
  const ordine: OrdineVariabili = {
    order_code: "ORD-2026-0042", total_amount: 10000, deposit_amount: 3000, balance_amount: null,
    expected_date: "2026-10-12", indirizzo_lavori: "Via Roma 1, Bari",
  };

  it("cliente dal profilo, saldo ricavato da totale meno acconto", () => {
    const v = costruisciVariabiliCommessa({
      ordine,
      cliente: { first_name: "Mario", last_name: "Rossi", email: "mario@example.com" },
      azienda: { nome: "Green Energy Group", iban: "IT60X0542811101000000123456" },
      fase: "Fattura acconto",
    });
    expect(v["cliente.nome_completo"]).toBe("Mario Rossi");
    expect(v["commessa.saldo"]).toBe("7.000,00 €");
    expect(v["commessa.data_installazione"]).toBe("lunedì 12 ottobre 2026");
    expect(v["azienda.intestatario_conto"]).toBe("Green Energy Group");
    expect(v["commessa.fase"]).toBe("Fattura acconto");
  });

  it("senza profilo usa i dati copiati sulla commessa", () => {
    const v = costruisciVariabiliCommessa({
      ordine: { ...ordine, client_name: "Anna Maria Bianchi", client_email: "anna@example.com" },
    });
    expect(v["cliente.nome"]).toBe("Anna");
    expect(v["cliente.cognome"]).toBe("Maria Bianchi");
    expect(v["cliente.email"]).toBe("anna@example.com");
  });

  it("il saldo scritto sulla commessa vince sul calcolo", () => {
    const v = costruisciVariabiliCommessa({ ordine: { ...ordine, balance_amount: 6500 } });
    expect(v["commessa.saldo"]).toBe("6.500,00 €");
  });
});

describe("sostituisciVariabiliCommessa", () => {
  const v = { "commessa.codice": "ORD-1", "cliente.nome": "Mario" };
  it("sostituisce, svuota i refusi dei suoi prefissi e lascia stare il resto", () => {
    const out = sostituisciVariabiliCommessa(
      "Ciao {{ cliente.nome }}, commessa {{commessa.codice}} {{commessa.codce}} {{contatto.nome}} {{unsubscribe_url}}",
      v,
    );
    expect(out).toBe("Ciao Mario, commessa ORD-1  {{contatto.nome}} {{unsubscribe_url}}");
  });
});

describe("scegliFatturaDaAllegare", () => {
  it("preferisce la cartella fatture e il file più recente", () => {
    const scelta = scegliFatturaDaAllegare([
      { file_name: "foto.jpg", created_at: "2026-09-10T10:00:00Z", cartella: "Foto" },
      { file_name: "acconto.pdf", created_at: "2026-09-11T10:00:00Z", cartella: "Fatture" },
      { file_name: "saldo.pdf", created_at: "2026-09-15T10:00:00Z", cartella: "Fatture" },
      { file_name: "fattura_vecchia.pdf", created_at: "2026-09-20T10:00:00Z", cartella: null },
    ]);
    expect(scelta?.file_name).toBe("saldo.pdf");
  });
  it("senza cartella guarda il nome del file; niente fattura = null", () => {
    expect(scegliFatturaDaAllegare([
      { file_name: "Fattura 12.pdf", created_at: "2026-09-10T10:00:00Z" },
    ])?.file_name).toBe("Fattura 12.pdf");
    expect(scegliFatturaDaAllegare([{ file_name: "contratto.pdf", created_at: "2026-09-10T10:00:00Z" }])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  componiRegistro, dettagliModifica, filtraRegistro, perGiorno, personeRegistro, righeEsportazione, valoreLeggibile, voceDaAzione, type AzioneRegistro,
} from "@/lib/orders/registroCommessa";

const azione = (a: Partial<AzioneRegistro>): AzioneRegistro => ({
  id: 1, quando: "2026-11-02T10:00:00+00:00", user_id: "u1", chi: "Mario Rossi", azione: "update", tabella: "order_items",
  record_id: "r1", etichetta: "Piastrelle", campi: ["quantity"], valori: { quantity: { da: 10, a: 20 } }, volte: 1, ...a,
});

describe("registro della commessa", () => {
  it("una modifica dice chi, su cosa e da quale valore a quale", () => {
    const v = voceDaAzione(azione({}))!;
    expect(v).toMatchObject({ chi: "Mario Rossi", titolo: "ha modificato un articolo", oggetto: "Piastrelle", area: "Articoli", tipo: "modificato" });
    expect(v.dettagli).toEqual(["Quantità: 10 → 20"]);
  });

  it("valori leggibili: soldi, date, sì/no, vuoto; gli stati col nome e gli id nascosti", () => {
    expect(valoreLeggibile("total_amount", 1234.5).replace(/\s/g, " ")).toBe("1.234,50 €");
    expect(valoreLeggibile("is_paid", true)).toBe("sì");
    expect(valoreLeggibile("start_date", "2026-01-31")).toBe("31/01/2026");
    expect(valoreLeggibile("note", null)).toBe("vuoto");
    expect(valoreLeggibile("status", "in_corso")).toBe("In corso");
    const id = "0d23e34f-353e-43e6-ace9-b4e05d035509";
    expect(valoreLeggibile("current_status_id", id, { [id]: "Lavori in corso" })).toBe("Lavori in corso");
    expect(valoreLeggibile("supplier_id", id)).toBe("altro collegamento");
  });

  it("senza i valori (azioni vecchie o nascoste) resta il nome del campo", () => {
    expect(dettagliModifica({ campi: ["total_amount", "description"], valori: null })).toEqual(["Importo totale", "Descrizione"]);
  });

  it("un'azione fatta solo di campi tecnici non è una voce; l'eliminazione sì", () => {
    expect(voceDaAzione(azione({ campi: ["version", "updated_by"], valori: null }))).toBeNull();
    expect(voceDaAzione(azione({ azione: "delete", campi: null, valori: null }))).toMatchObject({ tipo: "eliminato", titolo: "ha eliminato un articolo" });
  });

  it("la stessa azione non compare due volte; senza persona lo dice", () => {
    const voci = componiRegistro({
      azioni: [
        azione({ id: 1, azione: "insert", tabella: "order_attachments", record_id: "a1", campi: null, valori: null, etichetta: "doc.pdf" }),
        azione({ id: 2, azione: "update", tabella: "orders", campi: ["current_status_id"], valori: { current_status_id: { da: null, a: null } }, quando: "2026-11-02T10:00:00+00:00" }),
      ],
      eventi: [
        { id: "e1", event_type: "allegato_caricato", actor_name: "Mario Rossi", created_at: "2026-11-02T10:00:00+00:00", descrizione: "doc.pdf", etichetta: "Allegato caricato" },
        { id: "e2", event_type: "stato_cambiato", actor_name: "Mario Rossi", created_at: "2026-11-02T10:00:30+00:00", descrizione: "A → B", etichetta: "Stato cambiato" },
        { id: "e3", event_type: "stato_cambiato", actor_name: "Anna Verdi", created_at: "2026-05-01T10:00:00+00:00", descrizione: "X → Y", etichetta: "Stato cambiato" },
        { id: "e4", event_type: "acconto_ricevuto", actor_name: null, created_at: "2026-05-02T10:00:00+00:00", descrizione: "Acconto", etichetta: "Acconto ricevuto" },
        { id: "e5", event_type: "ordine_creato", actor_name: null, created_at: "2026-04-01T10:00:00+00:00", descrizione: "C-1", etichetta: "Commessa creata" },
      ],
      audit: [{ id: "attachment-a1", audit_type: "documento", title: "Documento caricato", description: "doc.pdf", actor_name: "Mario Rossi", created_at: "2026-11-02T10:00:00+00:00" }],
      messaggi: [{ id: "m1", channel: "email", direction: "out", subject: "Sollecito", body: "Buongiorno", to_name: "Cliente Srl", status: "failed", failed_reason: "casella piena", sent_by_name: "Mario Rossi", created_at: "2026-11-01T09:00:00+00:00" }],
      creatoDa: "Paola Neri",
    });
    expect(voci.map((v) => v.id)).toEqual(["azione-2", "audit-attachment-a1", "messaggio-m1", "evento-e4", "evento-e3", "evento-e5"]);
    expect(voci.find((v) => v.id === "evento-e4")).toMatchObject({ senzaPersona: true, chi: "Automatico o non registrato" });
    expect(voci.find((v) => v.id === "evento-e5")).toMatchObject({ senzaPersona: false, chi: "Paola Neri" });
    expect(voci.find((v) => v.id === "messaggio-m1")).toMatchObject({ titolo: "ha inviato un'email a Cliente Srl", area: "Comunicazioni", dettagli: ["Non consegnato: casella piena"] });
  });

  it("filtri per persona, area, tipo, periodo e testo; persone e giorni", () => {
    const voci = [
      voceDaAzione(azione({ id: 1, quando: "2026-11-02T10:00:00" }))!,
      voceDaAzione(azione({ id: 2, chi: "Anna Verdi", tabella: "tasks", etichetta: "Chiamare", azione: "delete", campi: null, valori: null, quando: "2026-11-01T10:00:00" }))!,
      voceDaAzione(azione({ id: 3, chi: null, quando: "2026-11-02T11:00:00" }))!,
    ];
    expect(filtraRegistro(voci, { persona: "Anna Verdi" }).map((v) => v.id)).toEqual(["azione-2"]);
    expect(filtraRegistro(voci, { area: "Articoli" })).toHaveLength(2);
    expect(filtraRegistro(voci, { tipo: "eliminato" })).toHaveLength(1);
    expect(filtraRegistro(voci, { dal: "2026-11-02" })).toHaveLength(2);
    expect(filtraRegistro(voci, { al: "2026-11-01" })).toHaveLength(1);
    expect(filtraRegistro(voci, { testo: "20" }).length).toBe(2);
    expect(personeRegistro(voci).map((p) => p.nome)).toEqual(["Mario Rossi", "Anna Verdi", "Persona non indicata"]);
    expect(perGiorno(voci).map((g) => [g.giorno, g.voci.length])).toEqual([["2026-11-02", 2], ["2026-11-01", 1]]);
    expect(righeEsportazione([voci[0]])[0]).toMatchObject({ chi: "Mario Rossi", dettagli: "Quantità: 10 → 20" });
  });
});

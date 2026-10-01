import { describe, expect, it } from "vitest";
import {
  FINE_SCHEDA, INIZIO_SCHEDA, indirizzoDelContatto, schedaClienteEvento, senzaSchedaCliente,
} from "../../../supabase/functions/_shared/descrizioneAppuntamentoGoogle";

describe("scheda cliente nella descrizione di Google Calendar", () => {
  it("indirizzo completo con CAP, città e provincia", () => {
    expect(indirizzoDelContatto({ address: "Via Laurana 6", city: "Milano", postal_code: "20159", province: "mi" })).toBe("Via Laurana 6, 20159 Milano (MI)");
  });
  it("non ripete la città se è già nella via, e regge i dati incompleti", () => {
    expect(indirizzoDelContatto({ address: "Via Fratelli Cairoli 32a, Lissone", city: "LISSONE", province: "MB" })).toBe("Via Fratelli Cairoli 32a, Lissone (MB)");
    expect(indirizzoDelContatto({ address: "via strada delle fontane 57a", city: "capiago intimiano", province: "CO" })).toBe("via strada delle fontane 57a, capiago intimiano (CO)");
    expect(indirizzoDelContatto({ city: "Monza" })).toBe("Monza");
    expect(indirizzoDelContatto(null)).toBe("");
  });
  it("la scheda ha nome, telefono, email, indirizzo e mappa", () => {
    const s = schedaClienteEvento({ first_name: "Maria", last_name: "D'Ambrosio", phone: "+393401480228", email: "m@x.it", address: "Via Laurana 6", city: "Milano", postal_code: "20159", province: "MI" });
    expect(s.startsWith(INIZIO_SCHEDA)).toBe(true);
    expect(s.endsWith(FINE_SCHEDA)).toBe(true);
    expect(s).toContain("Cliente: Maria D'Ambrosio");
    expect(s).toContain("Telefono: +393401480228");
    expect(s).toContain("Indirizzo del cliente: Via Laurana 6, 20159 Milano (MI)");
    expect(s).toContain("https://www.google.com/maps/search/?api=1&query=Via%20Laurana%206%2C%2020159%20Milano%20(MI)");
  });
  it("il luogo dell'appuntamento si scrive solo se diverso da casa del cliente", () => {
    const c = { first_name: "Giulia", address: "Via Roma 5", city: "Monza" };
    expect(schedaClienteEvento(c, "Via Roma, 5, 20900 Monza MB, Italia")).not.toContain("Luogo dell'appuntamento");
    expect(schedaClienteEvento(c, "Il Bagno Group, Viale Valassina 27, Lissone")).toContain("Luogo dell'appuntamento: Il Bagno Group, Viale Valassina 27, Lissone");
  });
  it("senza dati utili non scrive nulla; senza indirizzo manca solo quella riga", () => {
    expect(schedaClienteEvento({})).toBe("");
    expect(schedaClienteEvento(null)).toBe("");
    const s = schedaClienteEvento({ first_name: "Roberta", phone: "+393480081394" });
    expect(s).toContain("Telefono");
    expect(s).not.toContain("Indirizzo del cliente");
  });
  it("quando l'evento rientra da Google il blocco si toglie e la nota resta", () => {
    const scheda = schedaClienteEvento({ first_name: "Maria", address: "Via Laurana 6", city: "Milano" });
    const nota = "Portare campioni piastrelle";
    const daGoogle = `${nota}\n\n${scheda}\n\ncrm_appointment_id=x`;
    const pulita = senzaSchedaCliente(daGoogle);
    expect(pulita).toContain(nota);
    expect(pulita).not.toContain("Scheda cliente");
    expect(pulita).not.toContain("Via Laurana");
    expect(senzaSchedaCliente(senzaSchedaCliente(daGoogle))).toBe(pulita);
  });
});

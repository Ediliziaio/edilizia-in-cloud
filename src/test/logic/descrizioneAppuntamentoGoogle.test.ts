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

import { descrizioneDaModello, MODELLO_DESCRIZIONE_STANDARD } from "../../../supabase/functions/_shared/descrizioneAppuntamentoGoogle";

describe("modello di descrizione scritto nel calendario (come in GHL)", () => {
  const contatto = { first_name: "Maria", last_name: "D'Ambrosio", phone: "+393401480228", email: "", address: "Via Laurana 6", city: "Milano", postal_code: "20159", province: "MI" };

  it("sostituisce nome, cognome, telefono e indirizzo; la riga con la variabile vuota sparisce", () => {
    const d = descrizioneDaModello("Nome: {{nome}} {{cognome}}\nTel: {{telefono}}\nEmail: {{email}}\nDove: {{indirizzo_completo}}", { contatto });
    expect(d).toContain("Nome: Maria D'Ambrosio");
    expect(d).toContain("Tel: +393401480228");
    expect(d).toContain("Dove: Via Laurana 6, 20159 Milano (MI)");
    expect(d).not.toContain("Email");
  });
  it("accetta le variabili del selettore dei flussi (contact.first_name, contatto.full_name, appointment.date)", () => {
    const d = descrizioneDaModello("{{contatto.full_name}} · {{contact.phone}} · {{contact.address}} · {{appointment.date}} {{appointment.time}}", {
      contatto, data: "2026-10-03", ora: "10:00:00",
    });
    expect(d).toContain("Maria D'Ambrosio · +393401480228 · Via Laurana 6 · 3 ottobre 2026 10:00");
  });
  it("il testo fisso resta, anche senza variabili", () => {
    const d = descrizioneDaModello("Portare il metro laser\nCliente: {{nome_completo}}", { contatto });
    expect(d).toContain("Portare il metro laser");
    expect(d).toContain("Cliente: Maria D'Ambrosio");
  });
  it("i campi personalizzati passano dal resolver; vuoti = riga tolta; sconosciuti non si stampano", () => {
    const custom = (testo: string) => testo.replace("{{contact.piano}}", "2° piano").replace("{{contact.citofono}}", "");
    const d = descrizioneDaModello("Piano: {{contact.piano}}\nCitofono: {{contact.citofono}}\nBoh: {{variabile_che_non_esiste}}", { contatto }, custom);
    expect(d).toContain("Piano: 2° piano");
    expect(d).not.toContain("Citofono");
    expect(d).not.toContain("Boh");
    expect(d).not.toContain("{{");
  });
  it("modello vuoto = scheda standard; senza nessun dato non scrive nulla", () => {
    expect(descrizioneDaModello("  ", { contatto })).toBe(descrizioneDaModello(MODELLO_DESCRIZIONE_STANDARD, { contatto }));
    expect(descrizioneDaModello("Tel: {{telefono}}", { contatto: {} })).toBe("");
  });
  it("il blocco col modello si toglie quando l'evento rientra da Google", () => {
    const d = descrizioneDaModello("Tel: {{telefono}}", { contatto });
    expect(senzaSchedaCliente(`nota mia\n\n${d}\n\ncrm_sync=true`)).not.toContain("Tel:");
  });
});

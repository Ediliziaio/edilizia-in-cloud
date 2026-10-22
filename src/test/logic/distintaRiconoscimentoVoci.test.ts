import { describe, expect, it } from "vitest";
import { catalogoComeScomposizioni } from "@/lib/distinta/scomposizioniStandard";
import { normalizzaTesto, pesoParolaChiave, trovaScomposizione } from "@/lib/distinta/generaDistinta";

const catalogo = catalogoComeScomposizioni();
const riconosce = (descrizione: string, unita: string | null = "cad") =>
  trovaScomposizione(catalogo, { testo: normalizzaTesto(descrizione), unita })?.id ?? null;

describe("riconoscimento voce → scomposizione: le parole specifiche pesano di più", () => {
  it("peso delle parole chiave", () => {
    expect(pesoParolaChiave("deviat")).toBe(25);
    expect(pesoParolaChiave("emergenza")).toBe(25);
    expect(pesoParolaChiave("a parete")).toBe(3);
    expect(pesoParolaChiave("soffit")).toBe(3);
    expect(pesoParolaChiave("punto luce")).toBe(10);
  });

  // Descrizioni come si trovano nei computi di impianti elettrici, antincendio e clima.
  const casi: [string, string, string?][] = [
    // Elettrico: la funzione (deviato, invertito, emergenza) batte la posizione.
    ["Punto luce deviato a parete", "EL-PUNTO-LUCE-DEV"],
    ["Punto luce deviato a parete con comando da due posizioni, tubo corrugato e cavi FS17", "EL-PUNTO-LUCE-DEV"],
    ["Punto luce deviato a soffitto", "EL-PUNTO-LUCE-DEV"],
    ["Punto luce invertito a parete da tre posizioni", "EL-PUNTO-LUCE-INV"],
    ["Punto luce invertito a soffitto", "EL-PUNTO-LUCE-INV"],
    ["Punto luce a parete per lampada di emergenza", "EL-LAMPADA-EMERGENZA"],
    ["Punto luce a soffitto per illuminazione di emergenza autonoma", "EL-LAMPADA-EMERGENZA"],
    ["Punto luce interrotto con comando a parete", "EL-PUNTO-LUCE-PARETE"],
    ["Punto luce a soffitto, comando interrotto", "EL-PUNTO-LUCE-SOFFITTO"],
    ["Punto luce semplice", "EL-PUNTO-LUCE-INT"],
    ["Punto presa Schuko 16A a parete", "EL-PRESA-SCHUKO"],
    ["Punto presa dati RJ45 cat. 6 da incasso a parete", "EL-PRESA-DATI-RJ45"],
    ["Punto presa TV terrestre a parete", "EL-PRESA-TV"],
    ["Punto presa 10/16A da incasso a parete", "EL-PUNTO-PRESA-10-16"],
    ["Interruttore magnetotermico differenziale 2P 16A Idn 0,03 A", "EL-INT-MAGNETOTERMICO-DIFF"],
    ["Interruttore differenziale puro 2P 40A tipo A", "EL-INT-DIFFERENZIALE"],
    // Antincendio.
    ["Rivelatore ottico di fumo a soffitto con base", "AI-RIVELATORE-OTTICO"],
    ["Rivelatore termovelocimetrico a soffitto", "AI-RIVELATORE-TERMOVELOCIMETRICO"],
    ["Pulsante manuale di allarme incendio a parete a rottura vetro", "AI-PULSANTE-ALLARME"],
    ["Pannello ottico acustico segnalatore di allarme incendio a parete", "AI-SEGNALATORE-OTTICO-ACUSTICO"],
    ["Centrale di rivelazione incendi a 2 loop a parete", "AI-CENTRALE"],
    ["Cavo resistente al fuoco FTE29OHM16 2x1,5 in tubo a vista", "AI-CAVO-FTE29OHM16", "m"],
    // Climatizzazione.
    ["Unità interna split a parete 9000 BTU", "CL-SPLIT"],
    ["Ventilconvettore a soffitto a due tubi", "CL-FANCOIL"],
    ["Termostato ambiente a parete programmabile", "CL-TERMOSTATO"],
    ["Linea frigorifera in rame preisolato a parete 1/4-3/8", "CL-LINEA-FRIGORIFERA", "m"],
    ["Scarico condensa in tubo PVC a parete", "CL-SCARICO-CONDENSA", "m"],
  ];

  it.each(casi)("«%s» → %s", (descrizione, atteso, unita) => {
    expect(riconosce(descrizione, unita ?? "cad")).toBe(atteso);
  });

  it("almeno 15 descrizioni provate", () => {
    expect(casi.length).toBeGreaterThanOrEqual(15);
  });
});

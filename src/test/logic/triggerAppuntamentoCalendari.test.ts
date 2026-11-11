/**
 * Chi ENTRA in un flusso di appuntamenti si decide sul calendario (11/11/2026).
 *
 * Il guasto: il trigger «Appuntamento prenotato» aveva un filtro per UN solo
 * calendario, e Il Bagno Group ne ha otto — sette showroom più quello delle
 * chiamate. Senza filtro, «DVS 7 · Nutrimento pre-appuntamento» iscriveva OGNI
 * appuntamento dell'azienda e lasciava decidere alle condizioni, dopo: 93
 * iscrizioni per 3 invii.
 *
 * Il 10/11 Giusy si è fissata a mano una «call conoscitiva» sul proprio
 * calendario, per sé. Il flusso del nutrimento showroom è partito lo stesso,
 * perché le condizioni guardavano il TIPO dell'appuntamento e il tipo era
 * «generico» — «Telefonata» la tendina non ce l'aveva. Andrea si è preso
 * «Parcheggio davanti all'ingresso dello showroom» per una telefonata.
 *
 * Adesso il trigger accetta un ELENCO di calendari: il flusso showroom si
 * iscrive solo per i sette showroom, quello delle chiamate solo per il
 * Calendario Giusy. Chi non c'entra non entra proprio.
 */
import { describe, expect, it } from "vitest";
import { matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";

const CAL_CHIAMATE = "8c97dd8b-3b17-4f55-b3b2-c9330df83924"; // Calendario Giusy
const SHOWROOM = [
  "8eecba1d-a0ee-477d-b2b8-b9754c5c1b55", // Alice - Lissone
  "736c3efc-2126-4949-9a06-3a8af74ad118", // Valentina - Lissone
  "8590fbce-1668-493e-9ee6-a199a3ed8a2c", // Camilla - Lissone
  "cabc4532-83da-4f27-ad4e-85a271ec09b9", // Giovanna - Nova Milanese
  "9fa3460f-e8d6-4b75-a6ba-c6c111ed5f43", // Giuseppe - Inverigo
  "91b90922-2e12-4686-9788-67d3a0d35807", // Marco - Fino Mornasco
];

const evento = (calendario: string | null, tipo = "generico") => ({
  event_type: "appointment_created",
  appointment_type: tipo,
  ...(calendario === null ? {} : { calendar_id: calendario }),
});

/** DVS 7 · Nutrimento pre-appuntamento, come sta in produzione. */
const DVS7 = { item_id: "appuntamento_creato", calendari_filtro: SHOWROOM };
/** DVS 6 · Promemoria prima chiamata, come sta in produzione. */
const DVS6 = { item_id: "appuntamento_creato", calendario_id: CAL_CHIAMATE };

describe("la «call conoscitiva» che Giusy si è fissata da sola", () => {
  it("non entra nel flusso showroom", () => {
    expect(matchesAutomationTriggerConfig(DVS7, evento(CAL_CHIAMATE))).toBe(false);
  });

  it("prima ci entrava, perché il trigger non filtrava niente", () => {
    expect(matchesAutomationTriggerConfig({ item_id: "appuntamento_creato" }, evento(CAL_CHIAMATE))).toBe(true);
  });

  it("entra nel flusso delle chiamate", () => {
    expect(matchesAutomationTriggerConfig(DVS6, evento(CAL_CHIAMATE))).toBe(true);
  });
});

describe("l'elenco dei calendari", () => {
  it.each(SHOWROOM)("lo showroom %s entra nel nutrimento", (cal) => {
    expect(matchesAutomationTriggerConfig(DVS7, evento(cal))).toBe(true);
  });

  it("un calendario che non è nell'elenco resta fuori", () => {
    expect(matchesAutomationTriggerConfig(DVS7, evento("575e1a29-1ffa-4b88-958b-5b5f86ae200d"))).toBe(false);
  });

  it("il tipo non c'entra più: conta solo il calendario", () => {
    for (const tipo of ["generico", "altro", "telefonata", "cliente", "appuntamento"]) {
      expect(matchesAutomationTriggerConfig(DVS7, evento(CAL_CHIAMATE, tipo))).toBe(false);
      expect(matchesAutomationTriggerConfig(DVS7, evento(SHOWROOM[0], tipo))).toBe(true);
    }
  });

  it("un evento senza calendario non entra: non si sa da dove arrivi", () => {
    expect(matchesAutomationTriggerConfig(DVS7, evento(null))).toBe(false);
  });

  it("elenco vuoto vuol dire «nessun filtro», come prima", () => {
    expect(matchesAutomationTriggerConfig({ item_id: "appuntamento_creato", calendari_filtro: [] }, evento(CAL_CHIAMATE))).toBe(true);
  });

  it("le voci vuote nell'elenco non aprono la porta a tutti", () => {
    const sporco = { item_id: "appuntamento_creato", calendari_filtro: ["", "  ", SHOWROOM[0]] };
    expect(matchesAutomationTriggerConfig(sporco, evento(SHOWROOM[0]))).toBe(true);
    expect(matchesAutomationTriggerConfig(sporco, evento(CAL_CHIAMATE))).toBe(false);
  });

  it("il filtro a calendario singolo continua a funzionare", () => {
    expect(matchesAutomationTriggerConfig(DVS6, evento(SHOWROOM[0]))).toBe(false);
  });

  it("singolo ed elenco insieme valgono tutti e due", () => {
    const entrambi = { item_id: "appuntamento_creato", calendario_id: SHOWROOM[0], calendari_filtro: SHOWROOM };
    expect(matchesAutomationTriggerConfig(entrambi, evento(SHOWROOM[0]))).toBe(true);
    expect(matchesAutomationTriggerConfig(entrambi, evento(SHOWROOM[1]))).toBe(false);
  });
});

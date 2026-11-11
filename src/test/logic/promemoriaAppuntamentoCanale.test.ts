/**
 * I promemoria devono parlare del canale giusto (11/11/2026).
 *
 * Il caso vero: Andrea, lead «dvs ai» di Il Bagno Group, appuntamento alle
 * 14:30 dell'11/11 sul Calendario Giusy — che è il calendario delle CHIAMATE,
 * quello che l'agente usa per prenota_chiamata. Ha ricevuto
 * `ilbagno_promemoria_3_ore` («Parcheggio davanti all'ingresso dello
 * showroom») alle 11:31 e `ilbagno_promemoria_30_minuti` («tra mezz'ora ti
 * aspettiamo in showroom») alle 14:01. Era una telefonata.
 *
 * L'AI non c'entra: quell'appuntamento l'aveva creato una persona a mano il
 * 10/11, e il tipo che la tendina scrive in quel caso è `generico`
 * (MarketingAppointmentDialog) — `telefonata` la tendina non ce l'ha proprio.
 * A sbagliare erano i due flussi:
 *
 * - DVS 6 (chiamate) partiva solo con `tipo_filtro: "telefonata"`, cioè solo
 *   per gli appuntamenti che aveva fissato l'agente: su quello fatto a mano
 *   non è mai partito.
 * - DVS 7 (showroom) escludeva per tipo — telefonata, videocall,
 *   rilievo_tecnico — e prendeva tutto il resto. `generico` finiva lì dentro.
 *
 * Adesso il canale si legge dal CALENDARIO, che è il dato affidabile: il
 * Calendario Giusy è delle chiamate, gli altri sono gli showroom. Un tipo
 * nuovo non riapre il buco.
 */
import { describe, expect, it } from "vitest";
import { evaluateAutomationFilters, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";

/** Calendario Giusy: le chiamate dell'agente di Il Bagno Group. */
const CAL_CHIAMATE = "8c97dd8b-3b17-4f55-b3b2-c9330df83924";
/** Calendario Camilla - Lissone: uno showroom. */
const CAL_SHOWROOM = "8590fbce-1668-493e-9ee6-a199a3ed8a2c";

/** Il trigger di DVS 6 come sta in produzione dall'11/11/2026. */
const TRIGGER_DVS6 = { item_id: "appuntamento_creato", calendario_id: CAL_CHIAMATE };

/** Le condizioni di DVS 7 come stanno in produzione dall'11/11/2026 (AND). */
const CONDIZIONI_DVS7 = [
  { field: "tags", operator: "contains", value: "dvs ai" },
  { field: "tags", operator: "not_contains", value: "stop nutrimento" },
  { field: "appointment_type", operator: "not_equals", value: "telefonata" },
  { field: "appointment_type", operator: "not_equals", value: "videocall" },
  { field: "appointment_type", operator: "not_equals", value: "rilievo_tecnico" },
  { field: "calendar_id", operator: "not_equals", value: CAL_CHIAMATE },
];

const dvs7 = (p: Record<string, unknown>) =>
  evaluateAutomationFilters({ logic: "AND", conditions: CONDIZIONI_DVS7 }, p);

const andrea = {
  tags: ["dvs ai", "dvs", "replied"],
  appointment_type: "generico",
  calendar_id: CAL_CHIAMATE,
};

describe("il caso Andrea, 11/11/2026", () => {
  it("prima: il flusso showroom lo prendeva — ed era una chiamata", () => {
    const vecchio = CONDIZIONI_DVS7.filter((c) => c.field !== "calendar_id");
    expect(evaluateAutomationFilters({ logic: "AND", conditions: vecchio }, andrea)).toBe(true);
  });

  it("adesso il flusso showroom lo lascia stare", () => {
    expect(dvs7(andrea)).toBe(false);
  });

  it("adesso il flusso delle chiamate lo prende", () => {
    expect(matchesAutomationTriggerConfig(TRIGGER_DVS6, {
      event_type: "appointment_created",
      appointment_type: "generico",
      calendar_id: CAL_CHIAMATE,
    })).toBe(true);
  });

  it("prima no: il trigger voleva il tipo «telefonata», che la tendina non scrive", () => {
    expect(matchesAutomationTriggerConfig({ item_id: "appuntamento_creato", tipo_filtro: "telefonata" }, {
      event_type: "appointment_created",
      appointment_type: "generico",
      calendar_id: CAL_CHIAMATE,
    })).toBe(false);
  });
});

describe("una visita vera in showroom resta nel flusso showroom", () => {
  const visita = { tags: ["dvs ai"], appointment_type: "appuntamento", calendar_id: CAL_SHOWROOM };

  it("DVS 7 la prende", () => {
    expect(dvs7(visita)).toBe(true);
  });

  it("DVS 6 non la prende: non è sul calendario delle chiamate", () => {
    expect(matchesAutomationTriggerConfig(TRIGGER_DVS6, {
      event_type: "appointment_created",
      appointment_type: "appuntamento",
      calendar_id: CAL_SHOWROOM,
    })).toBe(false);
  });
});

describe("il canale si legge dal calendario, non dal tipo", () => {
  it.each(["generico", "altro", "telefonata", "cliente", "conferma_ordine"])(
    "tipo «%s» sul calendario delle chiamate: mai messaggi da showroom",
    (tipo) => {
      expect(dvs7({ ...andrea, appointment_type: tipo })).toBe(false);
    },
  );

  it.each(["generico", "altro", "telefonata"])(
    "tipo «%s» sul calendario delle chiamate: il promemoria della chiamata parte",
    (tipo) => {
      expect(matchesAutomationTriggerConfig(TRIGGER_DVS6, {
        event_type: "appointment_created",
        appointment_type: tipo,
        calendar_id: CAL_CHIAMATE,
      })).toBe(true);
    },
  );

  it("chi non è un lead dell'agente non entra nel nutrimento showroom", () => {
    expect(dvs7({ tags: ["showroom lissone"], appointment_type: "appuntamento", calendar_id: CAL_SHOWROOM })).toBe(false);
  });

  it("«stop nutrimento» ferma tutto anche in showroom", () => {
    expect(dvs7({ tags: ["dvs ai", "stop nutrimento"], appointment_type: "appuntamento", calendar_id: CAL_SHOWROOM })).toBe(false);
  });
});

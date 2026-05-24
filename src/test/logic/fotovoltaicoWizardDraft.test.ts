import { beforeEach, describe, expect, it } from "vitest";
import {
  loadPersistedDraft,
  savePersistedDraft,
} from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
import {
  INITIAL,
  LS_KEY_NEW,
  TOTAL_STEPS,
} from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";

describe("fotovoltaico wizard draft persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null and removes drafts with invalid JSON", () => {
    window.localStorage.setItem(LS_KEY_NEW, "{broken");

    expect(loadPersistedDraft(null)).toBeNull();
    expect(window.localStorage.getItem(LS_KEY_NEW)).toBeNull();
  });

  it("returns null and removes drafts without wizard data", () => {
    window.localStorage.setItem(
      LS_KEY_NEW,
      JSON.stringify({
        step: 3,
        completedSteps: [1, 2],
        savedAt: Date.now(),
      }),
    );

    expect(loadPersistedDraft(null)).toBeNull();
    expect(window.localStorage.getItem(LS_KEY_NEW)).toBeNull();
  });

  it("clamps corrupted step and completed steps into the valid wizard range", () => {
    window.localStorage.setItem(
      LS_KEY_NEW,
      JSON.stringify({
        step: 999,
        data: { ...INITIAL, cliente_nome: "Ada" },
        completedSteps: [-1, 1, 1, TOTAL_STEPS + 5, 4],
        savedAt: Date.now(),
      }),
    );

    expect(loadPersistedDraft(null)).toMatchObject({
      step: TOTAL_STEPS,
      completedSteps: [1, 4],
      data: { cliente_nome: "Ada" },
    });
  });

  it("normalizes old partial drafts by merging default wizard fields", () => {
    window.localStorage.setItem(
      LS_KEY_NEW,
      JSON.stringify({
        step: 2,
        data: { cliente_nome: "Mario", cliente_email: "mario@example.com" },
        completedSteps: [1],
        savedAt: Date.now(),
      }),
    );

    const draft = loadPersistedDraft(null);

    expect(draft?.data.cliente_nome).toBe("Mario");
    expect(draft?.data.cliente_email).toBe("mario@example.com");
    expect(draft?.data.costo_kwh_attuale).toBe(INITIAL.costo_kwh_attuale);
    expect(draft?.data.finanziamento_modalita).toBe(INITIAL.finanziamento_modalita);
  });

  it("saves and reloads a valid draft", () => {
    savePersistedDraft(null, {
      step: 3,
      data: { ...INITIAL, comune: "Milano" },
      completedSteps: [1, 2],
    });

    expect(loadPersistedDraft(null)).toMatchObject({
      step: 3,
      completedSteps: [1, 2],
      data: { comune: "Milano" },
    });
  });
});

/**
 * Il preventivo aggiorna il contatto del CRM collegato (07/11/2026).
 *
 * Florin: «se aggiungo un campo, tipo il codice fiscale, quando faccio il preventivo, quel campo aggiorna il
 * resto; idem l'indirizzo». Solo quello che si cambia adesso, mai i dati vecchi di un preventivo riaperto.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ scritture: [] as Array<{ id: string; cambi: Record<string, string> }>, permesso: true }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      update: (cambi: Record<string, string>) => ({
        eq: (_c: string, id: string) => ({
          select: async () => {
            db.scritture.push({ id, cambi });
            return { data: db.permesso ? [{ id }] : [], error: null as unknown };
          },
        }),
      }),
    }),
  },
}));

import { cambiDaMandare, useAggiornaContattoDalPreventivo, type DatiClientePreventivo } from "@/lib/preventivatore/aggiornaContatto";

beforeEach(() => { vi.useFakeTimers(); db.scritture = []; db.permesso = true; });
afterEach(() => { vi.useRealTimers(); });

describe("Cosa va al contatto", () => {
  it("solo i campi cambiati e non vuoti, coi nomi del CRM", () => {
    const base: DatiClientePreventivo = { nome: "Mario", codiceFiscale: null, email: "mario@esempio.it" };
    expect(cambiDaMandare(base, { nome: "Mario", codiceFiscale: "rssmra80a01l219x", email: "" })).toEqual({ fiscal_code: "RSSMRA80A01L219X" });
  });

  it("l'indirizzo dei lavori va al contatto solo se il contatto un indirizzo non ce l'ha", () => {
    const adesso = { indirizzo: "Via Roma 1", citta: "Torino" };
    expect(cambiDaMandare({}, adesso, { indirizzoSoloSeVuoto: true, contattoHaIndirizzo: true })).toEqual({});
    expect(cambiDaMandare({}, adesso, { indirizzoSoloSeVuoto: true, contattoHaIndirizzo: false })).toEqual({ address: "Via Roma 1", city: "Torino" });
  });
});

describe("Mentre si scrive il preventivo", () => {
  const usa = (id: string | null, dati: DatiClientePreventivo) =>
    renderHook(({ i, d }) => useAggiornaContattoDalPreventivo(i, d), { initialProps: { i: id, d: dati } });

  it("aprire un preventivo non scrive niente sul contatto", async () => {
    usa("c1", { nome: "Mario", codiceFiscale: "VECCHIO" });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(db.scritture).toEqual([]);
  });

  it("aggiunto il codice fiscale, poco dopo arriva al contatto", async () => {
    const h = usa("c1", { nome: "Mario", codiceFiscale: null });
    h.rerender({ i: "c1", d: { nome: "Mario", codiceFiscale: "RSSMRA80A01L219X" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(db.scritture).toEqual([{ id: "c1", cambi: { fiscal_code: "RSSMRA80A01L219X" } }]);
  });

  it("senza contatto collegato non scrive niente", async () => {
    const h = usa(null, { nome: "Mario" });
    h.rerender({ i: null, d: { nome: "Luigi" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(db.scritture).toEqual([]);
  });

  it("se il contatto non si può modificare (solo i propri, permesso), si ferma senza riprovare", async () => {
    db.permesso = false;
    const h = usa("c1", { nome: "Mario" });
    h.rerender({ i: "c1", d: { nome: "Mario", telefono: "333" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    h.rerender({ i: "c1", d: { nome: "Mario", telefono: "3334" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
    expect(db.scritture).toHaveLength(1);
  });
});

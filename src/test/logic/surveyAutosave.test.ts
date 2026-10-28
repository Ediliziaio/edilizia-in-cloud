import { describe, expect, it } from "vitest";
import { QueryClient, MutationObserver } from "@tanstack/query-core";
import { sameSurveyJson, mergeSurveyAreaEdit } from "@/lib/surveys/autosave";
describe("Autosalvataggio sopralluoghi", () => {
  it("non considera diversi gli stessi dati JSONB restituiti con ordine chiavi diverso", () => {
    expect(
      sameSurveyJson(
        { tipo: "appartamento", scenario: "clima", nested: { b: 2, a: 1 } },
        { nested: { a: 1, b: 2 }, scenario: "clima", tipo: "appartamento" },
      ),
    ).toBe(true);
    expect(sameSurveyJson({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameSurveyJson({ n: 0 }, { n: "0" })).toBe(false);
    expect(sameSurveyJson({ a: undefined }, {})).toBe(true);
  });
  it("mantiene tutte le modifiche rapide senza sostituire area_data con uno snapshot vecchio", () => {
    let area = {
      name: "Soggiorno",
      position: 0,
      area_data: { custom_azienda: "conservato" },
    };
    area = {
      ...area,
      ...mergeSurveyAreaEdit(area, { area_data: { superficie: 20 } }),
    } as typeof area;
    area = {
      ...area,
      ...mergeSurveyAreaEdit(area, { area_data: { altezza: 2.7 } }),
    } as typeof area;
    area = {
      ...area,
      ...mergeSurveyAreaEdit(area, { area_data: { note: "TEST" } }),
    } as typeof area;
    expect(area.area_data).toEqual({
      custom_azienda: "conservato",
      superficie: 20,
      altezza: 2.7,
      note: "TEST",
    });
    expect(mergeSurveyAreaEdit(area, { name: "Nuovo nome" }).area_data).toEqual(
      area.area_data,
    );
    expect(
      mergeSurveyAreaEdit(area, { area_data: { superficie: null } }).area_data,
    ).toHaveProperty("superficie", null);
  });
  it("lo scope delle mutation serializza realmente le scritture anche con rete lenta", async () => {
    const client = new QueryClient(),
      starts: number[] = [],
      finishes: number[] = [];
    let release!: () => void;
    const first = new Promise<void>((resolve) => {
      release = resolve;
    });
    const options = {
      scope: { id: "test-company:test-survey:areas" },
      retry: false as const,
      mutationFn: async (n: number) => {
        starts.push(n);
        if (n === 1) await first;
        finishes.push(n);
        return n;
      },
    };
    const a = new MutationObserver(client, options),
      b = new MutationObserver(client, options),
      c = new MutationObserver(client, options);
    const jobs = [a.mutate(1), b.mutate(2), c.mutate(3)];
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toEqual([1]);
    release();
    await Promise.all(jobs);
    expect(starts).toEqual([1, 2, 3]);
    expect(finishes).toEqual([1, 2, 3]);
    client.clear();
  });
});

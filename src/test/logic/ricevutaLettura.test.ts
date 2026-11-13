import { it, expect } from "vitest";
import { ricevutaDaLeggere } from "@/lib/fatturazione/letturaRicevuta";
it("mantiene la compatibilità con lo storico senza dedurre la lettura dalle note", () => {
  expect(ricevutaDaLeggere({ stato: "non_letta" })).toBe(true);
  expect(ricevutaDaLeggere({ stato: "letta" })).toBe(false);
  expect(ricevutaDaLeggere({ stato: "contabilizzata" })).toBe(false);
});
it("la scelta manuale è indipendente dallo stato contabile", () => {
  expect(ricevutaDaLeggere({ stato: "contabilizzata", da_leggere: true })).toBe(
    true,
  );
  expect(ricevutaDaLeggere({ stato: "rifiutata", da_leggere: true })).toBe(
    true,
  );
  expect(ricevutaDaLeggere({ stato: "non_letta", da_leggere: false })).toBe(
    false,
  );
});

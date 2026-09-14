/**
 * Il riscaldamento delle caselle non consuma il tetto delle email ai clienti.
 *
 * Dall'11/09 il warm-up prenotava ogni suo invio sul contatore giornaliero della
 * casella (outreach_prenota_invio). Con le caselle nuove il tetto del giorno è
 * 3 e cresce di uno al giorno, il warm-up parte da 2 e cresce allo stesso passo:
 * a ogni casella restava una sola email per i clienti. ThermoDMR, 14/09: 9
 * email ai clienti in tutta la giornata, con 2.628 contatti in coda. Il
 * titolare ha scelto di tenere il warm-up fuori dal tetto.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { warmupTargetForDay } from "../../../supabase/functions/_shared/outreach-warmup";

const ROOT = join(__dirname, "../../..");
const warmup = readFileSync(join(ROOT, "supabase/functions/outreach-warmup/index.ts"), "utf8");
const dispatcher = readFileSync(join(ROOT, "supabase/functions/outreach-dispatch/index.ts"), "utf8");

describe("warm-up fuori dal tetto delle email ai clienti", () => {
  it("il warm-up non prenota i suoi invii sul contatore della casella", () => {
    expect(warmup).not.toMatch(/rpc\(\s*["']outreach_prenota_invio["']/);
  });

  it("le email ai clienti invece continuano a prenotarlo", () => {
    expect(dispatcher).toMatch(/outreach_prenota_invio/);
  });

  it("il volume del warm-up resta limitato dalla sua curva", () => {
    expect(warmupTargetForDay(0)).toBe(2);
    expect(warmupTargetForDay(3)).toBe(5);
    expect(warmupTargetForDay(30)).toBe(8);
  });
});

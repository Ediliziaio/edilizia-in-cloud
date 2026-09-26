/**
 * Quando una risposta dell'outreach apre un'opportunità (_shared/outreach-opportunity-trigger.ts).
 *
 * Portato dai test Deno accanto alla funzione, che nessuno eseguiva: né la CI né
 * vitest guardano dentro supabase/functions (25/09/2026). Stessi casi.
 */
import { expect, it } from "vitest";

const assertEquals = (attuale: unknown, atteso: unknown) => expect(attuale).toEqual(atteso);

import { shouldCreateOpportunity } from "../../../supabase/functions/_shared/outreach-opportunity-trigger";

it("shouldCreateOpportunity: email interested → true", () => {
  assertEquals(shouldCreateOpportunity("email", "interested"), true);
});

it("shouldCreateOpportunity: email question → true (contatto tiepido: merita una scheda)", () => {
  assertEquals(shouldCreateOpportunity("email", "question"), true);
});

it("shouldCreateOpportunity: email not_interested/unsubscribe/auto_reply/other → false", () => {
  assertEquals(shouldCreateOpportunity("email", "not_interested"), false);
  assertEquals(shouldCreateOpportunity("email", "unsubscribe"), false);
  assertEquals(shouldCreateOpportunity("email", "auto_reply"), false);
  assertEquals(shouldCreateOpportunity("email", "other"), false);
});

it("shouldCreateOpportunity: whatsapp appuntamento → true", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "appuntamento"), true);
});

it("shouldCreateOpportunity: whatsapp da_ricontattare → true (contatto tiepido)", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "da_ricontattare"), true);
});

it("shouldCreateOpportunity: whatsapp non_interessato/incerto → false", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "non_interessato"), false);
  assertEquals(shouldCreateOpportunity("whatsapp", "incerto"), false);
});

it("shouldCreateOpportunity: whatsapp 'cliente' → false (l'AI non lo assegna mai, ma la funzione non deve trattarlo come segnale di creazione)", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "cliente"), false);
});

it("shouldCreateOpportunity: label nullo o vuoto → false", () => {
  assertEquals(shouldCreateOpportunity("email", null), false);
  assertEquals(shouldCreateOpportunity("email", undefined), false);
  assertEquals(shouldCreateOpportunity("email", ""), false);
});

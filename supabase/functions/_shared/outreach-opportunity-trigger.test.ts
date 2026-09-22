import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { shouldCreateOpportunity } from "./outreach-opportunity-trigger.ts";

Deno.test("shouldCreateOpportunity: email interested → true", () => {
  assertEquals(shouldCreateOpportunity("email", "interested"), true);
});

Deno.test("shouldCreateOpportunity: email question → false (segnale troppo debole da solo)", () => {
  assertEquals(shouldCreateOpportunity("email", "question"), false);
});

Deno.test("shouldCreateOpportunity: email not_interested/unsubscribe/auto_reply/other → false", () => {
  assertEquals(shouldCreateOpportunity("email", "not_interested"), false);
  assertEquals(shouldCreateOpportunity("email", "unsubscribe"), false);
  assertEquals(shouldCreateOpportunity("email", "auto_reply"), false);
  assertEquals(shouldCreateOpportunity("email", "other"), false);
});

Deno.test("shouldCreateOpportunity: whatsapp appuntamento → true", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "appuntamento"), true);
});

Deno.test("shouldCreateOpportunity: whatsapp da_ricontattare/non_interessato/incerto → false", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "da_ricontattare"), false);
  assertEquals(shouldCreateOpportunity("whatsapp", "non_interessato"), false);
  assertEquals(shouldCreateOpportunity("whatsapp", "incerto"), false);
});

Deno.test("shouldCreateOpportunity: whatsapp 'cliente' → false (l'AI non lo assegna mai, ma la funzione non deve trattarlo come segnale di creazione)", () => {
  assertEquals(shouldCreateOpportunity("whatsapp", "cliente"), false);
});

Deno.test("shouldCreateOpportunity: label nullo o vuoto → false", () => {
  assertEquals(shouldCreateOpportunity("email", null), false);
  assertEquals(shouldCreateOpportunity("email", undefined), false);
  assertEquals(shouldCreateOpportunity("email", ""), false);
});

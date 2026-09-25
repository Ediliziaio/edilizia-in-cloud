/**
 * Il punteggio dei calendari proposti (suggest-calendars/scoring.ts).
 *
 * Portato dai test Deno accanto alla funzione, che nessuno eseguiva: né la CI né
 * vitest guardano dentro supabase/functions (25/09/2026). Stessi casi.
 */
import { expect, it } from "vitest";

const assertEquals = (attuale: unknown, atteso: unknown, messaggio?: string) =>
  expect(attuale, messaggio).toEqual(atteso);

import {
  haversineKm,
  haversineEstimate,
  timeToMinutes,
  minutesToTime,
  calculateScore,
  determineStatus,
} from "../../../supabase/functions/suggest-calendars/scoring";

// --- haversineKm ---

it("haversineKm: Milano-Roma ~480 km", () => {
  const km = haversineKm(45.4642, 9.19, 41.9028, 12.4964);
  // Should be approximately 477-480 km
  assertEquals(km > 470 && km < 490, true, `Expected ~480 km, got ${km}`);
});

it("haversineKm: same point = 0", () => {
  const km = haversineKm(45.0, 9.0, 45.0, 9.0);
  assertEquals(km, 0);
});

// --- haversineEstimate ---

it("haversineEstimate: applies 1.3x factor and 50km/h speed", () => {
  const est = haversineEstimate(45.4642, 9.19, 45.4842, 9.21);
  const rawKm = haversineKm(45.4642, 9.19, 45.4842, 9.21);
  const expectedKm = Math.round(rawKm * 1.3 * 10) / 10;
  assertEquals(est.km, expectedKm);
  assertEquals(est.minutes, Math.round((expectedKm / 50) * 60));
  assertEquals(est.isEstimate, true);
});

// --- timeToMinutes ---

it("timeToMinutes: 09:30 → 570", () => {
  assertEquals(timeToMinutes("09:30"), 570);
});

it("timeToMinutes: 00:00 → 0", () => {
  assertEquals(timeToMinutes("00:00"), 0);
});

it("timeToMinutes: 23:59 → 1439", () => {
  assertEquals(timeToMinutes("23:59"), 1439);
});

// --- minutesToTime ---

it("minutesToTime: 570 → 09:30", () => {
  assertEquals(minutesToTime(570), "09:30");
});

it("minutesToTime: 0 → 00:00", () => {
  assertEquals(minutesToTime(0), "00:00");
});

it("minutesToTime: 1440 → 00:00 (wraps)", () => {
  assertEquals(minutesToTime(1440), "00:00");
});

// --- calculateScore ---

it("calculateScore: base formula = minutes*2 + km", () => {
  const score = calculateScore(30, 25, 60, 100, 250);
  assertEquals(score, 30 * 2 + 25); // 85
});

it("calculateScore: +1000 penalty when travel > maxTravelMinutes", () => {
  const score = calculateScore(65, 50, 60, 100, 250);
  assertEquals(score, 65 * 2 + 50 + 1000); // 1180
});

it("calculateScore: +500 penalty when simKm > maxKm", () => {
  const score = calculateScore(30, 25, 60, 300, 250);
  assertEquals(score, 30 * 2 + 25 + 500); // 585
});

it("calculateScore: both penalties stack", () => {
  const score = calculateScore(65, 50, 60, 300, 250);
  assertEquals(score, 65 * 2 + 50 + 1000 + 500); // 1680
});

// --- determineStatus ---

it("determineStatus: OK when values well below limits", () => {
  const r = determineStatus(20, 60, 100, 250, true);
  assertEquals(r.status, "OK");
});

it("determineStatus: WARNING when travel 80-100% of limit", () => {
  const r = determineStatus(50, 60, 100, 250, true);
  assertEquals(r.status, "WARNING");
  assertEquals(r.reason.includes("vicino al limite"), true);
});

it("determineStatus: WARNING when km 80-100% of limit", () => {
  const r = determineStatus(20, 60, 210, 250, true);
  assertEquals(r.status, "WARNING");
  assertEquals(r.reason.includes("vicini al limite"), true);
});

it("determineStatus: BLOCKED when travel exceeds limit", () => {
  const r = determineStatus(65, 60, 100, 250, true);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason.includes("supera il limite"), true);
});

it("determineStatus: BLOCKED when km exceeds limit", () => {
  const r = determineStatus(20, 60, 300, 250, true);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason.includes("superano il limite"), true);
});

it("determineStatus: BLOCKED when no suggested times", () => {
  const r = determineStatus(20, 60, 100, 250, false);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason, "Nessuno slot orario disponibile");
});

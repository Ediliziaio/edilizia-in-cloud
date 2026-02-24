import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  haversineKm,
  haversineEstimate,
  timeToMinutes,
  minutesToTime,
  calculateScore,
  determineStatus,
} from "./scoring.ts";

// --- haversineKm ---

Deno.test("haversineKm: Milano-Roma ~480 km", () => {
  const km = haversineKm(45.4642, 9.19, 41.9028, 12.4964);
  // Should be approximately 477-480 km
  assertEquals(km > 470 && km < 490, true, `Expected ~480 km, got ${km}`);
});

Deno.test("haversineKm: same point = 0", () => {
  const km = haversineKm(45.0, 9.0, 45.0, 9.0);
  assertEquals(km, 0);
});

// --- haversineEstimate ---

Deno.test("haversineEstimate: applies 1.3x factor and 50km/h speed", () => {
  const est = haversineEstimate(45.4642, 9.19, 45.4842, 9.21);
  const rawKm = haversineKm(45.4642, 9.19, 45.4842, 9.21);
  const expectedKm = Math.round(rawKm * 1.3 * 10) / 10;
  assertEquals(est.km, expectedKm);
  assertEquals(est.minutes, Math.round((expectedKm / 50) * 60));
  assertEquals(est.isEstimate, true);
});

// --- timeToMinutes ---

Deno.test("timeToMinutes: 09:30 → 570", () => {
  assertEquals(timeToMinutes("09:30"), 570);
});

Deno.test("timeToMinutes: 00:00 → 0", () => {
  assertEquals(timeToMinutes("00:00"), 0);
});

Deno.test("timeToMinutes: 23:59 → 1439", () => {
  assertEquals(timeToMinutes("23:59"), 1439);
});

// --- minutesToTime ---

Deno.test("minutesToTime: 570 → 09:30", () => {
  assertEquals(minutesToTime(570), "09:30");
});

Deno.test("minutesToTime: 0 → 00:00", () => {
  assertEquals(minutesToTime(0), "00:00");
});

Deno.test("minutesToTime: 1440 → 00:00 (wraps)", () => {
  assertEquals(minutesToTime(1440), "00:00");
});

// --- calculateScore ---

Deno.test("calculateScore: base formula = minutes*2 + km", () => {
  const score = calculateScore(30, 25, 60, 100, 250);
  assertEquals(score, 30 * 2 + 25); // 85
});

Deno.test("calculateScore: +1000 penalty when travel > maxTravelMinutes", () => {
  const score = calculateScore(65, 50, 60, 100, 250);
  assertEquals(score, 65 * 2 + 50 + 1000); // 1180
});

Deno.test("calculateScore: +500 penalty when simKm > maxKm", () => {
  const score = calculateScore(30, 25, 60, 300, 250);
  assertEquals(score, 30 * 2 + 25 + 500); // 585
});

Deno.test("calculateScore: both penalties stack", () => {
  const score = calculateScore(65, 50, 60, 300, 250);
  assertEquals(score, 65 * 2 + 50 + 1000 + 500); // 1680
});

// --- determineStatus ---

Deno.test("determineStatus: OK when values well below limits", () => {
  const r = determineStatus(20, 60, 100, 250, true);
  assertEquals(r.status, "OK");
});

Deno.test("determineStatus: WARNING when travel 80-100% of limit", () => {
  const r = determineStatus(50, 60, 100, 250, true);
  assertEquals(r.status, "WARNING");
  assertEquals(r.reason.includes("vicino al limite"), true);
});

Deno.test("determineStatus: WARNING when km 80-100% of limit", () => {
  const r = determineStatus(20, 60, 210, 250, true);
  assertEquals(r.status, "WARNING");
  assertEquals(r.reason.includes("vicini al limite"), true);
});

Deno.test("determineStatus: BLOCKED when travel exceeds limit", () => {
  const r = determineStatus(65, 60, 100, 250, true);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason.includes("supera il limite"), true);
});

Deno.test("determineStatus: BLOCKED when km exceeds limit", () => {
  const r = determineStatus(20, 60, 300, 250, true);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason.includes("superano il limite"), true);
});

Deno.test("determineStatus: BLOCKED when no suggested times", () => {
  const r = determineStatus(20, 60, 100, 250, false);
  assertEquals(r.status, "BLOCKED");
  assertEquals(r.reason, "Nessuno slot orario disponibile");
});

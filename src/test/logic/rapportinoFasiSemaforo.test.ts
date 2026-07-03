/**
 * Test contratto — Dichiarazione per fasi + semaforo tempi (Fase C spec
 * docs/superpowers/specs/2026-07-03-rapportino-flow-design.md).
 * Verifica il wiring statico: fasi_lavorate nel rapportino mobile, hook
 * useOrderScheduleHealth, badge OrderScheduleBadge montato in OrderDetail,
 * progress bar fasi in OrderWorkPhases e migration con la RPC.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const r = (p: string) => resolve(process.cwd(), p);

const CAMPO_RAPPORTINO = r("src/pages/campo/CampoRapportino.tsx");
const HOOK_HEALTH = r("src/hooks/useOrderScheduleHealth.ts");
const BADGE = r("src/components/orders/OrderScheduleBadge.tsx");
const ORDER_DETAIL = r("src/pages/azienda/OrderDetail.tsx");
const ORDER_WORK_PHASES = r("src/components/orders/OrderWorkPhases.tsx");
const MIGRATION = r("supabase/migrations/20270703140000_rapportino_fasi_schedule_health.sql");

describe("Fasi lavorate — rapportino mobile (CampoRapportino)", () => {
  it("salva fasi_lavorate e mostra il blocco 'Su cosa hai lavorato oggi?'", () => {
    const src = readFileSync(CAMPO_RAPPORTINO, "utf8");
    expect(src).toContain("fasi_lavorate");
    expect(src).toContain("Su cosa hai lavorato oggi?");
    expect(src).toContain('from("order_work_phases")');
  });

  it("non regredisce mai l'avanzamento fase (max attuale/dichiarata) e non blocca su errore", () => {
    const src = readFileSync(CAMPO_RAPPORTINO, "utf8");
    expect(src).toContain("Math.max(Number(attuale?.percentuale) || 0, dich.percentuale)");
    expect(src).toContain('"completata"');
    expect(src).toContain('"in_corso"');
    expect(src).toContain("console.warn");
  });
});

describe("Semaforo tempi — hook e badge", () => {
  it("useOrderScheduleHealth.ts esiste e chiama la RPC order_schedule_health", () => {
    expect(existsSync(HOOK_HEALTH)).toBe(true);
    const src = readFileSync(HOOK_HEALTH, "utf8");
    expect(src).toContain("order_schedule_health");
    expect(src).toContain("p_order_id");
    expect(src).toContain("staleTime: 60_000");
  });

  it("OrderScheduleBadge.tsx esiste con i 3 stati e nasconde non_configurato", () => {
    expect(existsSync(BADGE)).toBe(true);
    const src = readFileSync(BADGE, "utf8");
    expect(src).toContain("non_configurato");
    expect(src).toContain("In linea");
    expect(src).toContain("In anticipo");
    expect(src).toContain("In ritardo di");
    expect(src).toContain("fase_critica");
    expect(src).toContain("Tooltip");
  });

  it("OrderDetail monta OrderScheduleBadge", () => {
    const src = readFileSync(ORDER_DETAIL, "utf8");
    expect(src).toContain("OrderScheduleBadge");
  });
});

describe("Vista fasi arricchita — OrderWorkPhases", () => {
  it("mostra percentuale reale e atteso a oggi per ogni fase", () => {
    const src = readFileSync(ORDER_WORK_PHASES, "utf8");
    expect(src).toContain("useOrderScheduleHealth");
    expect(src).toContain("percentuale");
    expect(src).toContain("atteso");
  });
});

describe("Migration Fase C", () => {
  it("20270703140000_rapportino_fasi_schedule_health.sql contiene la RPC e le colonne", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    const src = readFileSync(MIGRATION, "utf8");
    expect(src).toContain("order_schedule_health");
    expect(src).toContain("fasi_lavorate");
    expect(src).toContain("percentuale");
  });
});

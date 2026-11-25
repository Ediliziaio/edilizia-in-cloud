import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Contratto della migrazione che ridà al dipendente i propri dati dopo la regola
// restrittiva su employees (office_financial_select, 12/11/2026): una sottoquery su
// employees dentro una policy rispetta l'RLS di employees, quindi «questa riga è mia»
// smetteva di valere e l'operaio non vedeva più cedolini, assenze, allegati, note spese.
const sql = readFileSync(
  process.env.MIGRAZIONE_DATI_DIPENDENTE ??
    "supabase/migrations/20290606110000_dati_del_dipendente_senza_diritti_ufficio.sql",
  "utf8",
);
const corpo = sql.replace(/--[^\n]*/g, "");

describe("i dati del dipendente non passano dalla tabella employees", () => {
  it("il riconoscimento della propria scheda è una funzione definer, chiusa ad anon", () => {
    expect(corpo).toMatch(
      /create or replace function public\.e_mia_scheda_dipendente\(p_employee uuid\)[\s\S]*security definer[\s\S]*set search_path = ''/,
    );
    expect(corpo).toMatch(/revoke all on function public\.e_mia_scheda_dipendente\(uuid\) from public, anon/);
    expect(corpo).toMatch(/grant execute on function public\.e_mia_scheda_dipendente\(uuid\) to authenticated/);
  });

  it("ogni policy riscritta usa la funzione e non più una sottoquery su employees", () => {
    const policy = /create policy[\s\S]*?;/g;
    const riscritte = corpo.match(policy) ?? [];
    expect(riscritte.length).toBeGreaterThanOrEqual(10);
    for (const p of riscritte) {
      expect(p, `questa policy legge ancora employees: ${p.slice(0, 120)}`).not.toMatch(
        /from\s+(public\.)?employees\b(?!_visibili)/,
      );
    }
  });

  it("le tabelle del dipendente sono tutte coperte", () => {
    for (const tabella of [
      "public.hr_cedolini",
      "public.cedolini_legacy",
      "public.hr_assenze",
      "public.work_logs",
      "public.expense_reports",
      "public.leave_requests",
      "public.leave_balances",
      "public.employee_attachments",
      "public.hr_onboarding_steps",
    ]) {
      expect(corpo, `manca ${tabella}`).toContain(`on ${tabella}`);
    }
  });

  it("il cedolino in bozza resta all'ufficio", () => {
    expect(corpo).toMatch(/stato <> 'bozza' and public\.e_mia_scheda_dipendente\(employee_id\)/);
  });

  it("la vista dei cedolini prende il nome dalla proiezione, non dalla tabella", () => {
    expect(corpo).toMatch(/create or replace view public\.cedolini[\s\S]*security_invoker = true/);
    expect(corpo).toMatch(/left join public\.employees_visibili e on e\.id = c\.employee_id/);
  });
});

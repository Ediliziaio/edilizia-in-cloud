import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * «Pianifica» sceglie il tecnico con la funzione unica del database PRIMA di toccare
 * l'appuntamento: altrimenti il trigger «il rilievo segue l'appuntamento» lo assegnerebbe
 * lui, con l'app operai sempre accesa e la spunta ignorata.
 */
const passi: string[] = [];
const assegna = vi.fn(async (_id: string, _tecnico: string | null, appOperai: boolean) => {
  passi.push(`assegna:${appOperai}`);
  return { tecnico: _tecnico, app_operai: appOperai, notificato: true };
});
let rilievo: Record<string, unknown> = {};
const appuntamentoInserito: Record<string, unknown>[] = [];

vi.mock("@/lib/api/surveys", () => ({ assegnaTecnicoSopralluogo: (...a: [string, string | null, boolean]) => assegna(...a) }));
vi.mock("@/integrations/supabase/client", () => {
  const catena = (tabella: string) => {
    let operazione = "select";
    const c: Record<string, unknown> = {};
    const nessunErrore: { message: string } | null = null;
    const fine = (): { data: unknown; error: { message: string } | null } => {
      if (tabella === "surveys" && operazione === "select") return { data: rilievo, error: nessunErrore };
      if (tabella === "marketing_calendars") return { data: [], error: nessunErrore };
      if (tabella === "appointments" && operazione === "insert") return { data: { id: "app-nuovo" }, error: nessunErrore };
      return { data: null, error: nessunErrore };
    };
    for (const m of ["select", "eq", "order", "is", "limit"]) c[m] = () => c;
    c.update = (v: Record<string, unknown>) => { operazione = "update"; passi.push(`${tabella}.update:${Object.keys(v).join(",")}`); return c; };
    c.insert = (v: Record<string, unknown>) => { operazione = "insert"; appuntamentoInserito.push(v); passi.push(`${tabella}.insert`); return c; };
    c.maybeSingle = async () => fine();
    c.single = async () => fine();
    c.then = (ok: (r: unknown) => unknown) => Promise.resolve(fine()).then(ok);
    return c;
  };
  return { supabase: { from: (t: string) => catena(t) } };
});

import { pianificaSopralluogo } from "@/lib/api/surveysBoard";

const base = { surveyId: "sop", companyId: "az", data: "2026-12-01", ora: "10:30", durataMin: 60, tecnicoId: "op", userId: "uff" };

describe("Pianifica: il tecnico passa dalla funzione unica", () => {
  beforeEach(() => { passi.length = 0; appuntamentoInserito.length = 0; assegna.mockClear(); });

  it("assegna prima di spostare l'appuntamento, rispettando la spunta", async () => {
    rilievo = { id: "sop", code: "SOP-1", tipo: "tecnico", appointment_id: "app-1" };
    const esito = await pianificaSopralluogo({ ...base, appOperai: false });
    expect(passi).toEqual(["surveys.update:scheduled_at", "assegna:false", "appointments.update:appointment_date,appointment_time,appointment_end_time,assigned_to,status"]);
    expect(esito).toMatchObject({ appointmentId: "app-1", spostato: true, appOperai: false });
  });

  it("non scrive più technician_id a mano e crea l'appuntamento del tipo giusto", async () => {
    rilievo = { id: "sop", code: "SOP-2", tipo: "tecnico", appointment_id: null };
    await pianificaSopralluogo(base);
    expect(passi.some((p) => p.includes("technician_id"))).toBe(false);
    expect(passi).toEqual(["surveys.update:scheduled_at", "assegna:true", "appointments.insert", "surveys.update:appointment_id"]);
    expect(appuntamentoInserito[0].appointment_type).toBe("rilievo_tecnico");
  });

  it("il commerciale resta un sopralluogo preventivo in agenda", async () => {
    rilievo = { id: "sop", code: "SOP-3", tipo: "commerciale", appointment_id: null };
    await pianificaSopralluogo(base);
    expect(appuntamentoInserito[0].appointment_type).toBe("sopralluogo_preventivo");
  });
});

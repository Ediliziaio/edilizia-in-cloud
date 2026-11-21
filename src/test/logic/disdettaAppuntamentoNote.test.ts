import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync("supabase/functions/public-booking-gestisci/index.ts", "utf8");
const disdetta = source.slice(source.indexOf('if (azione === "annulla")'), source.indexOf("// ── SPOSTAMENTO"));

function esegui(reason: string, scritta = true) {
  const patch = vi.fn();
  const calendario = vi.fn();
  const avvisa = vi.fn();
  const app = { id: "a", calendar_id: "cal", company_id: "c", appointment_date: "2026-11-20", appointment_time: "12:00:00", status: "confermato", title: "Sopralluogo", updated_at: "2026-11-20T08:00:00Z" };
  const risposta = { error: null as null, data: scritta ? { id: app.id } : null };
  const query = { eq: () => query, select: () => query, maybeSingle: async () => risposta };
  const admin = { from: () => ({ update: (values: unknown) => { patch(values); return query; } }) };
  const annulla = runInNewContext(`async () => { ${disdetta} }`, {
    azione: "annulla", body: { reason }, app, admin, cal: {}, emailCliente: null, quandoVecchio: "oggi",
    sincronizzaCalendariEsterni: calendario, avvisaTitolare: avvisa, json: (b: unknown, status = 200) => ({ b, status }),
  });
  return { risultato: annulla(), patch, calendario, avvisa };
}

describe("Disdetta da link pubblico", () => {
  it.each(["Trasferta", ""])("preserva la descrizione e conserva il motivo %j", async motivo => {
    const { risultato, patch, calendario, avvisa } = esegui(motivo);
    await expect(risultato).resolves.toMatchObject({ status: 200 });
    const dati = patch.mock.calls[0][0];
    expect(dati).not.toHaveProperty("description");
    expect(dati).toMatchObject({ status: "annullato", cancelled_reason: motivo || null });
    expect(calendario).toHaveBeenCalledTimes(1);
    expect(avvisa).toHaveBeenCalledTimes(1);
  });

  it("evita notifiche e aggiornamento del calendario se l'appuntamento è cambiato", async () => {
    const { risultato, calendario, avvisa } = esegui("Trasferta", false);
    await expect(risultato).resolves.toMatchObject({ status: 409 });
    expect(calendario).not.toHaveBeenCalled();
    expect(avvisa).not.toHaveBeenCalled();
  });
});

// Development-only visual fixture. No provider, microphone, CRM writes or private data.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { FishAssistanceSetup } from "../../src/components/agenti/FishAssistanceSetup";
import { SilvioAssistanceActivitiesView } from "../../src/components/silvio/SilvioAssistanceActivities";
import type { FishAssistanceActivity } from "../../src/lib/fishAssistanceActivities";
import "../../src/index.css";
const base: FishAssistanceActivity = {
  id: "fixture-one",
  company_id: "fixture",
  agent_id: "fixture",
  session_id: "fixture",
  task_id: "fixture",
  calendar_id: "fixture",
  customer_id: null,
  customer_updated_at: null,
  identity_verified_at: "2026-11-17T10:00:00Z",
  ticket_id: "12345678-1234-4123-8123-123456789012",
  ticket_action: "created",
  appointment_id: null,
  stage: "needs_office",
  reason: "no_slots",
  created_at: "2026-11-17T10:00:00Z",
  updated_at: "2026-11-17T10:00:00Z",
  customerName: "Cliente dimostrativo",
  problem:
    "La finestra della camera non si chiude completamente. Richiesto un controllo della maniglia.",
  appointment: null,
};
const rows: FishAssistanceActivity[] = [
  base,
  {
    ...base,
    id: "fixture-two",
    customerName: "Secondo cliente dimostrativo",
    stage: "scheduled",
    reason: null,
    appointment_id: "fixture-appointment",
    appointment: { date: "2026-11-25", time: "10:00", status: "confermato" },
    problem: "Verifica della guarnizione dopo la posa.",
  },
];
function Preview() {
  const [calendar, setCalendar] = useState("");
  return (
    <MemoryRouter>
      <main className="min-h-screen bg-[#f7f7f5] px-4 py-6 text-foreground sm:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
            Anteprima grafica locale · dati fittizi · nessuna chiamata o
            scrittura nel gestionale
          </p>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Assistenza, con Silvio
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Un percorso semplice, dal primo contatto all’appuntamento.
            </p>
          </div>
          <FishAssistanceSetup
            calendarId={calendar}
            calendars={[
              {
                id: "fixture-calendar",
                name: "Agenda assistenza",
                duration_minutes: 30,
              },
            ]}
            onCalendarChange={setCalendar}
          />
          <div className="rounded-2xl border bg-background p-5">
            <SilvioAssistanceActivitiesView
              activities={rows}
              onRefresh={() => {}}
              canConfigure={false}
            />
          </div>
        </div>
      </main>
    </MemoryRouter>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);

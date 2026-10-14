import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarViewNavigation } from "@/components/calendar/CalendarViewNavigation";
import { CalendarGanttView } from "@/components/calendar/CalendarGanttView";
import { CalendarHeatmapView } from "@/components/calendar/CalendarHeatmapView";
import type { CalendarOrder } from "@/types/calendar";
import { TooltipProvider } from "@/components/ui/tooltip";

const state = vi.hoisted(() => ({
  readonly: false,
  edit: true,
  drag: null as null | ((e: unknown) => Promise<void>),
  calls: [] as unknown[],
  dragOptions: [] as { id: string; disabled: boolean }[],
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "me" }, effectiveCompany: { id: "company" } }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: false,
    solaLettura: state.readonly,
    canEditOrders: state.edit,
    canViewScadenzario: true,
  }),
}));
vi.mock("@/components/calendar/CalendarDayDetailsDialog", () => ({
  CalendarDayDetailsDialog: ({
    open,
    date,
    initialEventKey,
    events,
  }: {
    open: boolean;
    date: Date;
    initialEventKey?: string;
    events: unknown[];
  }) =>
    open ? (
      <div role="dialog" aria-label="Dettagli condivisi">
        {date.toISOString().slice(0, 10)} · {initialEventKey} · {events.length}{" "}
        eventi
      </div>
    ) : null,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (e: unknown) => Promise<void>;
  }) => {
    state.drag = onDragEnd;
    return children;
  },
  PointerSensor: vi.fn(),
  useSensors: (): unknown[] => [],
  useSensor: (): null => null,
  useDraggable: (options: { id: string; disabled: boolean }) => {
    state.dragOptions.push(options);
    return {
      attributes: { "aria-disabled": options.disabled },
      listeners: {},
      setNodeRef: vi.fn(),
      isDragging: false,
    };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      state.calls.push({ method: "from", args: [table] });
      for (const method of ["update", "eq", "select"])
        builder[method] = (...args: unknown[]) => {
          state.calls.push({ method, args });
          return builder;
        };
      builder.single = async (): Promise<{
        data: { id: string };
        error: null;
      }> => ({ data: { id: "order" }, error: null });
      return builder;
    },
  },
}));
const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Casa",
  expected_date: null,
  work_start_date: "2026-09-01",
  work_end_date: "2026-09-30",
  warehouse_arrival_date: null,
  created_at: "",
  customer_id: "c",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
  work_phases: [
    {
      id: "phase-a",
      name: "Demolizione",
      position: 0,
      start_date: "2026-10-05",
      end_date: "2026-10-06",
      status: "completata",
      percentuale: 100,
    },
    {
      id: "phase-b",
      name: "Posa",
      position: 1,
      start_date: "2026-10-12",
      end_date: "2026-10-14",
      status: "in_corso",
      percentuale: 35,
    },
  ],
  resource_bookings: [
    {
      resourceId: "worker",
      resourceName: "Mario Bianchi",
      resourceType: "employee",
      phase_id: "phase-b",
      start_date: "2026-10-12",
      end_date: "2026-10-13",
    },
  ],
};
function page(component: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <TooltipProvider>{component}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  state.readonly = false;
  state.edit = true;
  state.calls = [];
  state.dragOptions = [];
  state.drag = null;
});
afterEach(cleanup);
describe("Modalità distinte, dati e dettagli condivisi", () => {
  it("Gantt, Squadre e Carico sono strumenti separati dal selettore del periodo", () => {
    const onViewChange = vi.fn();
    page(
      <CalendarViewNavigation
        view="gantt"
        onViewChange={onViewChange}
        isMobile={false}
        canViewTeam
      />,
    );
    const nav = within(
      screen.getByRole("navigation", { name: "Strumenti del calendario" }),
    );
    expect(
      nav.getByRole("button", { name: "Gantt" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.click(nav.getByRole("button", { name: "Squadre e persone" }));
    expect(onViewChange).toHaveBeenCalledWith("teams");
  });
  it("il calendario ha il proprio selettore e non espone Squadre senza accesso", () => {
    page(
      <CalendarViewNavigation
        view="month"
        onViewChange={vi.fn()}
        isMobile={false}
        canViewTeam={false}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Periodo del calendario" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Squadre e persone" }),
    ).toBeNull();
  });
  it("su mobile mantiene mese e agenda senza strumenti che richiedono una timeline ampia", () => {
    page(
      <CalendarViewNavigation
        view="agenda"
        onViewChange={vi.fn()}
        isMobile
        canViewTeam
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Strumenti del calendario" }),
    ).toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Periodo del calendario" }),
    ).toBeTruthy();
  });
  it("le barre delle fasi restano cliccabili in sola lettura e aprono il dettaglio corretto", () => {
    state.readonly = true;
    page(
      <CalendarGanttView
        orders={[order]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
        zoom="month"
        onZoomChange={vi.fn()}
      />,
    );
    const bar = screen.getByRole("button", { name: "Dettagli Posa · ORD-1" });
    expect(bar.getAttribute("aria-disabled")).toBeNull();
    expect(state.dragOptions.every((o) => o.disabled)).toBe(true);
    fireEvent.click(bar);
    expect(screen.getByRole("dialog").textContent).toContain(
      "lavoro:order:phase-b",
    );
  });
  it("un drag non modifica le date generali di una commessa a fasi", async () => {
    page(
      <CalendarGanttView
        orders={[order]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
        zoom="month"
        onZoomChange={vi.fn()}
      />,
    );
    await state.drag!({
      active: { data: { current: { order, period: { phase_id: "phase-b" } } } },
      delta: { x: 56 },
    });
    expect(state.calls).toEqual([]);
  });
  it("il drag delle sole date generali aggiorna entrambi gli estremi nella stessa azienda", async () => {
    const legacy: CalendarOrder = {
      ...order,
      work_phases: undefined,
      work_start_date: "2026-10-01",
      work_end_date: "2026-10-02",
    };
    page(
      <CalendarGanttView
        orders={[legacy]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
        zoom="month"
        onZoomChange={vi.fn()}
      />,
    );
    await state.drag!({
      active: {
        data: {
          current: {
            order: legacy,
            period: { start_date: "2026-10-01", end_date: "2026-10-02" },
          },
        },
      },
      delta: { x: 56 },
    });
    expect(state.calls).toContainEqual({
      method: "update",
      args: [{ work_start_date: "2026-10-03", work_end_date: "2026-10-04" }],
    });
    expect(state.calls).toContainEqual({
      method: "eq",
      args: ["company_id", "company"],
    });
    expect(state.calls).toContainEqual({ method: "eq", args: ["id", "order"] });
  });
  it("il ruolo senza modifica non può spostare neppure le date generali", async () => {
    state.edit = false;
    const legacy: CalendarOrder = {
      ...order,
      work_phases: undefined,
      work_start_date: "2026-10-01",
      work_end_date: "2026-10-02",
    };
    page(
      <CalendarGanttView
        orders={[legacy]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
        zoom="month"
        onZoomChange={vi.fn()}
      />,
    );
    await state.drag!({
      active: {
        data: {
          current: {
            order: legacy,
            period: { start_date: "2026-10-01", end_date: "2026-10-02" },
          },
        },
      },
      delta: { x: 56 },
    });
    expect(state.calls).toEqual([]);
  });
  it("Carico non colora tutto l'intervallo generale e apre i dettagli della giornata", () => {
    page(
      <CalendarHeatmapView
        orders={[order]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "venerdì 9 ottobre 2026: 0 cantieri",
      }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: "lunedì 12 ottobre 2026: 1 cantieri",
      }),
    );
    expect(screen.getByRole("dialog").textContent).toContain("1 eventi");
  });
  it("il carico della persona termina con la sua assegnazione, non con tutta la fase", () => {
    page(
      <CalendarHeatmapView
        orders={[order]}
        employees={[
          { id: "worker", first_name: "Mario", last_name: "Bianchi" },
        ]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Per persona" }));
    expect(
      screen.getByRole("button", {
        name: "Mario Bianchi · 13 ott: 1 cantieri",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Mario Bianchi · 14 ott: 0 cantieri",
      }),
    ).toBeTruthy();
  });
});

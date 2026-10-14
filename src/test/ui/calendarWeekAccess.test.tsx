import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CalendarOrder } from "@/types/calendar";
const state = vi.hoisted(() => ({
  readonly: false,
  edit: true,
  company: "company" as string | null,
  drag: undefined as undefined | ((e: unknown) => void),
  calls: [] as { method: string; args: unknown[] }[],
  error: false,
  invalidate: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "me" },
    effectiveCompany: state.company ? { id: state.company } : null,
  }),
}));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    isLoading: false,
    solaLettura: state.readonly,
    canEditOrders: state.edit,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/components/calendar/EditOrderDatesDialog", () => ({
  EditOrderDatesDialog: (): null => null,
}));
vi.mock("@/components/appointments/AppointmentDialog", () => ({
  AppointmentDialog: (): null => null,
}));
vi.mock("@dnd-kit/core", () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (e: unknown) => void;
  }) => {
    state.drag = onDragEnd;
    return children;
  },
  useDroppable: () => ({ setNodeRef: vi.fn() }),
  useDraggable: ({ id, disabled }: { id: string; disabled: boolean }) => ({
    setNodeRef: vi.fn(),
    isDragging: false,
    attributes: { "data-testid": id, "data-disabled": String(disabled) },
    listeners: {},
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const b: Record<string, unknown> = {};
      for (const method of ["update", "eq", "select"])
        b[method] = (...args: unknown[]) => {
          state.calls.push({ method, args });
          return b;
        };
      b.single = async () => ({
        data: state.error ? null : { id: "order" },
        error: state.error ? { message: "Rifiutato" } : null,
      });
      return b;
    },
  },
}));
import { CalendarWeekView } from "@/components/calendar/CalendarWeekView";
const order: CalendarOrder = {
  id: "order",
  order_code: "ORD-1",
  description: "Casa",
  expected_date: "2026-10-14",
  warehouse_arrival_date: "2026-10-16",
  work_start_date: "2026-10-14",
  work_end_date: "2026-10-15",
  created_at: "",
  customer_id: "c",
  current_status_id: null,
  customer: { first_name: "Anna", last_name: "Rossi" },
  status: null,
};
function page() {
  render(
    <MemoryRouter>
      <CalendarWeekView
        orders={[order]}
        currentDate={new Date(2026, 9, 14)}
        onDateChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}
function drag() {
  act(() =>
    state.drag!({
      active: {
        data: {
          current: {
            eventType: "order",
            id: "order",
            label: "Posa",
            date: "2026-10-14",
          },
        },
      },
      over: { id: "day-2026-10-15" },
    }),
  );
}
beforeEach(() => {
  state.readonly = false;
  state.edit = true;
  state.company = "company";
  state.calls = [];
  state.error = false;
  state.invalidate.mockClear();
});
afterEach(cleanup);
describe("Trascinamento del calendario settimanale", () => {
  it("solo la posa ha il trascinamento di una data commessa, non lavorazioni e merce", () => {
    page();
    expect(screen.getAllByTestId(/^order-/)).toHaveLength(1);
    expect(screen.getByTestId(/^order-/).getAttribute("data-disabled")).toBe(
      "false",
    );
  });
  it.each(["readonly", "permission", "company"])(
    "%s impedisce il trascinamento e la conferma di scrittura",
    (condition) => {
      if (condition === "readonly") state.readonly = true;
      else if (condition === "permission") state.edit = false;
      else state.company = null;
      page();
      expect(screen.getByTestId(/^order-/).getAttribute("data-disabled")).toBe(
        "true",
      );
      drag();
      expect(screen.queryByRole("button", { name: "Conferma" })).toBeNull();
      expect(state.calls).toEqual([]);
    },
  );
  it("la conferma aggiorna la posa nell'azienda corrente e richiede una riga salvata", async () => {
    page();
    drag();
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalled());
    expect(state.calls).toContainEqual({
      method: "update",
      args: [{ expected_date: "2026-10-15" }],
    });
    expect(state.calls).toContainEqual({
      method: "eq",
      args: ["company_id", "company"],
    });
    expect(state.calls).toContainEqual({ method: "select", args: ["id"] });
  });
  it("un aggiornamento rifiutato non invalida i dati come se fosse riuscito", async () => {
    state.error = true;
    page();
    drag();
    fireEvent.click(screen.getByRole("button", { name: "Conferma" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Conferma" })).toBeNull(),
    );
    expect(state.invalidate).not.toHaveBeenCalled();
  });
});

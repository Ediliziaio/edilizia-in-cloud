import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderQuickActions } from "@/components/orders/OrderQuickActions";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload }) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/telephony/SoftphoneProvider", () => ({ useSoftphoneOptional: () : null => null }));
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({ QuickContactSendDialog: () : null => null }));
vi.mock("@/components/appointments/AppointmentDialog", () => ({ AppointmentDialog: () : null => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const base = { orderId: "order", orderCode: "ORD-001", companyId: "company", customer: null as null, getPdfBlob: async (): Promise<null> => null };

describe("Pianificazione nelle azioni rapide", () => {
  it("riusa i callback di attività e flusso senza eseguire richieste al mount", () => {
    const task = vi.fn(); const flow = vi.fn();
    render(<OrderQuickActions {...base} onCreateTask={task} onApplyPlaybook={flow} />);
    expect(task).not.toHaveBeenCalled(); expect(flow).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Nuova attività" }));
    expect(task).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Applica flusso" }));
    expect(flow).toHaveBeenCalledTimes(1);
  });
  it("disabilita l'applicazione mentre il flusso viene creato", () => {
    const flow = vi.fn();
    render(<OrderQuickActions {...base} onApplyPlaybook={flow} applyingPlaybook />);
    const button = screen.getByRole("button", { name: "Applico…" });
    expect(button).toBeDisabled(); fireEvent.click(button); expect(flow).not.toHaveBeenCalled();
  });
  it("resta compatibile con chiamanti che non forniscono azioni di pianificazione", () => {
    render(<OrderQuickActions {...base} />);
    expect(screen.queryByRole("button", { name: "Nuova attività" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Applica flusso" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appuntamento" })).toBeInTheDocument();
  });
  it("rende raggiungibile Gestisci flusso dal menu", async () => {
    const manage = vi.fn();
    render(<OrderQuickActions {...base} onManagePlaybook={manage} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Altre azioni/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Gestisci flusso" }));
    expect(manage).toHaveBeenCalledTimes(1);
  });
});

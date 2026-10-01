import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderQuickActions } from "@/components/orders/OrderQuickActions";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload }) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/telephony/SoftphoneProvider", () => ({ useSoftphoneOptional: () : null => null }));
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({ QuickContactSendDialog: ({ defaultChannel, onOpenChange }: { defaultChannel: string; onOpenChange: (open: boolean) => void }) => <div role="dialog">Canale {defaultChannel}<button onClick={() => onOpenChange(false)}>Chiudi</button></div> }));
vi.mock("@/components/appointments/AppointmentDialog", () => ({ AppointmentDialog: () : null => null }));
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.mobile = false; });
const base = { orderId: "order", orderCode: "ORD-001", companyId: "company", customer: null as null, getPdfBlob: async (): Promise<null> => null };

describe("Pianificazione nelle azioni rapide", () => {
  it("su mobile mostra solo tre pulsanti e conserva contatti e fattura nel menu", async () => {
    mocks.mobile = true;
    const invoice = vi.fn(); const task = vi.fn(); const files = vi.fn();
    render(<OrderQuickActions {...base} customer={{ name: "Test", email: "test@example.invalid", phone: "+390000000000" }} onCreateTask={task} onOpenFiles={files} onCreateInvoice={invoice} />);
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Nuova attività" })).toHaveTextContent("Attività");
    fireEvent.click(screen.getByRole("button", { name: "Documenti" }));
    expect(files).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Nuova attività" }));
    expect(task).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    for (const name of ["Email", "WhatsApp", "SMS", "Appuntamento", "Crea fattura"]) expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Documenti" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Crea fattura" }));
    expect(invoice).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("su mobile spiega i comandi disabilitati senza attivarli", async () => {
    mocks.mobile = true;
    const invoice = vi.fn();
    render(<OrderQuickActions {...base} onCreateInvoice={invoice} invoiceDisabled invoiceHint="Fatturazione non attiva" />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "SMS" })).toHaveAttribute("aria-disabled", "true");
    const item = screen.getByRole("menuitem", { name: "Crea fattura" });
    expect(item).toHaveTextContent("Fatturazione non attiva");
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(invoice).not.toHaveBeenCalled();
  });
  it("espone email, WhatsApp e SMS separati senza inviare al click", () => {
    render(<OrderQuickActions {...base} customer={{ name: "Cliente test", email: "test@example.invalid", phone: "+390000000000" }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const [label, channel] of [["Email", "email"], ["WhatsApp", "whatsapp"], ["SMS", "sms"]]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("dialog")).toHaveTextContent(`Canale ${channel}`);
      fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    }
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("disabilita i canali senza recapiti e rispetta la disponibilità delle fatture", () => {
    const invoice = vi.fn();
    const view = render(<OrderQuickActions {...base} onCreateInvoice={invoice} invoiceDisabled invoiceHint="Fatturazione non attiva" />);
    for (const name of ["Email", "WhatsApp", "SMS", "Crea fattura"]) expect(screen.getByRole("button", { name })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Crea fattura" }));
    expect(invoice).not.toHaveBeenCalled();
    view.rerender(<OrderQuickActions {...base} onCreateInvoice={invoice} />);
    fireEvent.click(screen.getByRole("button", { name: "Crea fattura" }));
    expect(invoice).toHaveBeenCalledOnce();
    view.rerender(<OrderQuickActions {...base} />);
    expect(screen.queryByRole("button", { name: "Crea fattura" })).not.toBeInTheDocument();
  });
  it("riusa i callback di attività e flusso senza eseguire richieste al mount", async () => {
    const task = vi.fn(); const flow = vi.fn();
    render(<OrderQuickActions {...base} onCreateTask={task} onApplyPlaybook={flow} />);
    expect(task).not.toHaveBeenCalled(); expect(flow).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Nuova attività" }));
    expect(task).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Applica flusso" }));
    expect(flow).toHaveBeenCalledTimes(1);
  });
  it("disabilita l'applicazione mentre il flusso viene creato", async () => {
    const flow = vi.fn();
    render(<OrderQuickActions {...base} onApplyPlaybook={flow} applyingPlaybook />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    const button = await screen.findByRole("menuitem", { name: "Applico…" });
    expect(button).toHaveAttribute("aria-disabled", "true"); fireEvent.click(button); expect(flow).not.toHaveBeenCalled();
  });
  it("resta compatibile con chiamanti che non forniscono azioni di pianificazione", () => {
    render(<OrderQuickActions {...base} />);
    expect(screen.queryByRole("button", { name: "Nuova attività" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Applica flusso" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Appuntamento" })).toHaveLength(1);
  });
  it("rende raggiungibile Gestisci flusso dal menu", async () => {
    const manage = vi.fn();
    render(<OrderQuickActions {...base} onManagePlaybook={manage} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Altre azioni/ }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Gestisci flusso" }));
    expect(manage).toHaveBeenCalledTimes(1);
  });
});

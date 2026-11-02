import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrderQuickActions } from "@/components/orders/OrderQuickActions";

const mocks = vi.hoisted(() => ({ from: vi.fn(), upload: vi.fn(), mobile: false }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.mobile }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, storage: { from: () => ({ upload: mocks.upload }) } } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/telephony/SoftphoneProvider", () => ({ useSoftphoneOptional: () : null => null }));
vi.mock("@/components/contacts/QuickContactSendDialog", () => ({ QuickContactSendDialog: ({ defaultChannel, onOpenChange, azioniExtra }: { defaultChannel: string; onOpenChange: (open: boolean) => void; azioniExtra?: React.ReactNode }) => <div role="dialog">Canale {defaultChannel}{azioniExtra}<button onClick={() => onOpenChange(false)}>Chiudi</button></div> }));
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
    for (const name of ["Contatta", "Appuntamento", "Crea fattura"]) expect(await screen.findByRole("menuitem", { name })).toBeInTheDocument();
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
    expect(await screen.findByRole("menuitem", { name: "Contatta" })).toHaveAttribute("aria-disabled", "true");
    const item = screen.getByRole("menuitem", { name: "Crea fattura" });
    expect(item).toHaveTextContent("Fatturazione non attiva");
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(invoice).not.toHaveBeenCalled();
  });
  it("un solo «Contatta»: apre il popup senza inviare, con Chiama e Invia PDF dentro", () => {
    render(<OrderQuickActions {...base} customer={{ name: "Cliente test", email: "test@example.invalid", phone: "+390000000000" }} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const name of ["Email", "WhatsApp", "SMS", "Chiama", "Invia PDF"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Contatta" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Canale email");
    for (const name of ["Chiama", "Invia PDF"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("senza email «Contatta» parte da WhatsApp e non offre il PDF", () => {
    render(<OrderQuickActions {...base} customer={{ name: "Cliente test", email: null, phone: "+390000000000" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Contatta" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Canale whatsapp");
    expect(screen.getByRole("button", { name: "Chiama" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Invia PDF" })).not.toBeInTheDocument();
  });
  it("disabilita i canali senza recapiti e rispetta la disponibilità delle fatture", () => {
    const invoice = vi.fn();
    const view = render(<OrderQuickActions {...base} onCreateInvoice={invoice} invoiceDisabled invoiceHint="Fatturazione non attiva" />);
    for (const name of ["Contatta", "Crea fattura"]) expect(screen.getByRole("button", { name })).toBeDisabled();
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
  it("il menu non ha il flusso aziendale né voci spente: senza telefono niente Chiama", async () => {
    render(<OrderQuickActions {...base} customer={{ name: "Mario", email: "m@x.it", phone: null }} onOpenFirma={vi.fn()} onOpenNotes={vi.fn()} onOpenOps={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Altre azioni/ }), { key: "Enter" });
    const voci = (await screen.findAllByRole("menuitem")).map((v) => v.textContent);
    expect(voci).toEqual(["Firma", "Note interne", "Responsabile"]);
    expect(screen.queryByText("Flusso di lavoro")).not.toBeInTheDocument();
  });
  it("«Altre azioni» è l'unico menu: registro, PDF, duplica ed elimina in fondo", async () => {
    const elimina = vi.fn();
    render(<OrderQuickActions {...base} onOpenRegistro={vi.fn()} onScaricaPdf={vi.fn()} onDuplica={vi.fn()} onElimina={elimina} onModifica={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    const voci = (await screen.findAllByRole("menuitem")).map((v) => v.textContent);
    expect(voci).toEqual(["Registro attività", "Scarica PDF", "Duplica", "Elimina"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Elimina" }));
    expect(elimina).toHaveBeenCalledOnce();
  });
  it("da telefono il menu ha anche Modifica e non lo Scarica PDF", async () => {
    mocks.mobile = true;
    const modifica = vi.fn();
    render(<OrderQuickActions {...base} onScaricaPdf={vi.fn()} onModifica={modifica} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Altre azioni" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Modifica commessa" }));
    expect(modifica).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menuitem", { name: "Scarica PDF" })).not.toBeInTheDocument();
  });
});

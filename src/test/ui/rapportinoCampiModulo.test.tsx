import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampiModuloLettura } from "@/components/campo/CampiModuloLettura";
import { RapportinoBlocchi } from "@/components/campo/RapportinoBlocchi";
import { CampiDaCompletare } from "@/components/orders/CampiDaCompletare";
import { SCHEMA_COME_OGGI, type CampoModulo, type ValoreCampo } from "../../../supabase/functions/_shared/moduliCantiere";

const db = vi.hoisted(() => ({ update: vi.fn(), condizioni: [] as Array<[string, unknown]>, risposta: { data: { id: "r1" } as unknown, error: null as unknown } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    update: (v: unknown) => { db.update(v); return q; },
    eq: (c: string, v: unknown) => { db.condizioni.push([c, v]); return q; },
    select: () => q, maybeSingle: async () => db.risposta,
  });
  return q;
} } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/common/ImgRiservata", () => ({ ImgRiservata: () => null }));

const campo: CampoModulo = { chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", obbligatorio: true, chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno" };
const schema = { ...SCHEMA_COME_OGGI, campi: [campo] };
const report = (p = {}) => ({ id: "r1", descrizione_lavori: "Posa", role_type: "employee", lavoro_completato: false, approvato: false, stato: "inviato", campi_extra: [], ...p });
const avvolgi = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
beforeEach(() => { db.update.mockClear(); db.condizioni = []; db.risposta = { data: { id: "r1" }, error: null }; });
afterEach(cleanup);

describe("CampiModuloLettura", () => {
  it("con niente non mostra niente", () => {
    const { container } = render(<CampiModuloLettura valori={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("mostra etichetta e valore come erano allora", () => {
    const v: ValoreCampo[] = [{ chiave: "x", etichetta: "Nome di allora", tipo: "boolean", valore: true, stampa: "mai" }];
    render(<CampiModuloLettura valori={v} />);
    expect(screen.getByText("Nome di allora")).toBeInTheDocument();
    expect(screen.getByText("Sì")).toBeInTheDocument();
  });
});

describe("RapportinoBlocchi", () => {
  const v = [{ chiave: "x", etichetta: "Pezzi posati", tipo: "number", valore: 3, stampa: "interno" }];
  it("mostra i valori anche senza fasi, materiali né foto", () => {
    render(<RapportinoBlocchi report={{ campi_extra: v }} />);
    expect(screen.getByText("Pezzi posati")).toBeInTheDocument();
  });
  it("nella vista compatta non li elenca", () => {
    render(<RapportinoBlocchi compatto report={{ campi_extra: v }} />);
    expect(screen.queryByText("Pezzi posati")).toBeNull();
  });
});

describe("Valori per fase", () => {
  const voce = { chiave: "pz", etichetta: "Pezzi posati", tipo: "number", valore: 3, stampa: "interno", phase_id: "f1", fase_nome: "Nome di allora" };
  const fasi = [{ phase_id: "f1", percentuale: 50, nome: "Posa infissi" }];
  it("stanno nella scheda della loro fase", () => {
    render(<RapportinoBlocchi report={{ fasi_lavorate: fasi, campi_extra: [voce] }} />);
    const scheda = screen.getByText("Posa infissi").closest("section")!;
    expect(scheda).toHaveTextContent("Pezzi posati");
    expect(scheda).toHaveTextContent("3");
    expect(screen.queryByText("Altre informazioni")).toBeNull();
  });
  it("se la fase non è nel rapportino restano visibili col nome salvato", () => {
    render(<RapportinoBlocchi report={{ fasi_lavorate: [], campi_extra: [voce] }} />);
    expect(screen.getByText("Altre informazioni")).toBeInTheDocument();
    expect(screen.getByText(/Nome di allora/)).toBeInTheDocument();
  });
  it("la vista compatta non li mostra", () => {
    render(<RapportinoBlocchi compatto report={{ fasi_lavorate: fasi, campi_extra: [voce] }} />);
    expect(screen.queryByText("Pezzi posati")).toBeNull();
  });
});

describe("CampiDaCompletare", () => {
  it("senza nulla di mancante non mostra nulla", () => {
    const { container } = avvolgi(<CampiDaCompletare report={report({ campi_extra: [{ chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 2, stampa: "interno" }] })} schema={schema} puoModificare onSalvato={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("dice cosa manca e chi non può modificare non ha il pulsante", () => {
    avvolgi(<CampiDaCompletare report={report()} schema={schema} puoModificare={false} onSalvato={vi.fn()} />);
    expect(screen.getByText("Da completare: Pezzi posati")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Completa" })).toBeNull();
  });
  it("un rapportino approvato non si completa", () => {
    avvolgi(<CampiDaCompletare report={report({ approvato: true, stato: "approvato" })} schema={schema} puoModificare onSalvato={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Completa" })).toBeNull();
  });
  it("l'ufficio completa e salva senza toccare i valori già scritti", async () => {
    const onSalvato = vi.fn();
    const altro = { chiave: "tolto", etichetta: "Vecchio", tipo: "text", valore: "x", stampa: "interno" };
    avvolgi(<CampiDaCompletare report={report({ campi_extra: [altro] })} schema={schema} puoModificare onSalvato={onSalvato} />);
    fireEvent.click(screen.getByRole("button", { name: "Completa" }));
    fireEvent.change(screen.getByLabelText("Pezzi posati"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(db.update).toHaveBeenCalled());
    // Il PDF già generato non contiene questi valori: si rifà.
    expect(db.update).toHaveBeenCalledWith({ pdf_url: null, campi_extra: [
      { chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", valore: 7, stampa: "interno" }, altro,
    ] });
    expect(db.condizioni).toContainEqual(["approvato", false]);
    await waitFor(() => expect(onSalvato).toHaveBeenCalled());
  });
  it("se il rapportino è stato approvato nel frattempo lo dice", async () => {
    const { toast } = await import("sonner");
    db.risposta = { data: null, error: null };
    avvolgi(<CampiDaCompletare report={report()} schema={schema} puoModificare onSalvato={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Completa" }));
    fireEvent.change(screen.getByLabelText("Pezzi posati"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Il rapportino è cambiato nel frattempo: ricarica e riprova."));
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuliCantiereConfig } from "@/components/settings/ModuliCantiereConfig";
import { SCHEMA_COME_OGGI, type CampoModulo, type ModuloSchema } from "../../../supabase/functions/_shared/moduliCantiere";

const stato = vi.hoisted(() => ({
  salva: vi.fn(async (_m: unknown) => "id"),
  rapportino: [] as unknown[], verbale: [] as unknown[], uso: {} as Record<string, number>,
  puoModificare: true, mobile: false, guard: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "c1" }, role: "company_staff" }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ isLoading: false, canEditSettingsOrders: stato.puoModificare }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => stato.mobile }));
vi.mock("@/hooks/useSettingsDraftGuard", () => ({ useSettingsDraftGuard: (d: boolean) => { stato.guard(d); return { confermaUscita: () => true }; } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useModuliCantiere", () => ({
  useModuliAzienda: (_c: string, tipo: "rapportino" | "verbale") => ({ data: tipo === "rapportino" ? stato.rapportino : stato.verbale, isLoading: false, isError: false, refetch: vi.fn() }),
  useUsoModulo: () => ({ data: stato.uso }),
  useSalvaModulo: () => ({ isPending: false, mutateAsync: stato.salva }),
}));

const campo = (p: Partial<CampoModulo> = {}): CampoModulo => ({
  chiave: "pezzi", etichetta: "Pezzi posati", tipo: "number", obbligatorio: false,
  chi: "tutti", ditte: "tutti", quando: "sempre", livello: "rapportino", stampa: "interno", ...p,
});
const conModello = (schema: Partial<ModuloSchema>) => { stato.rapportino = [{ id: "m1", tipo: "rapportino", nome: "Rapportino", attivo: true, schema: { ...SCHEMA_COME_OGGI, ...schema } }]; };
const salvato = () => stato.salva.mock.calls[0][0] as { id?: string | null; tipo: string; nome: string; schema: ModuloSchema; attivo?: boolean };
const salva = () => fireEvent.click(screen.getByRole("button", { name: "Salva" }));

beforeEach(() => {
  vi.clearAllMocks();
  stato.rapportino = []; stato.verbale = []; stato.uso = {}; stato.puoModificare = true; stato.mobile = false;
});
afterEach(cleanup);

describe("con la barra della pagina", () => {
  it("non mostra un secondo «Salva» e salva quando glielo chiede la pagina", async () => {
    let stato: { modificato: boolean; salva: () => Promise<boolean> } | undefined;
    render(<ModuliCantiereConfig tipo="rapportino" onStato={s => { stato = s; }} />);
    expect(stato?.modificato).toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Parti dal modello Serramenti" }));
    await waitFor(() => expect(stato?.modificato).toBe(true));
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
    await expect(stato!.salva()).resolves.toBe(true);
  });
});

describe("Parti del rapportino", () => {
  it("ore e descrizione sono sempre attive, senza interruttore", () => {
    render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(screen.getByText("Ore")).toBeInTheDocument();
    expect(screen.getByText("Descrizione dei lavori")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Ore" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Mezzi e attrezzi" })).toBeChecked();
  });
  it.each([
    ["Materiali", "Il consumo materiali della commessa non si aggiorna più dai rapportini."],
    ["Mezzi e attrezzi", "Le giornate e i costi dei mezzi non si registrano più dai rapportini."],
    ["Fasi e lavorazioni", "Avanzamento fasi e cronoprogramma non si aggiornano più dai rapportini."],
    ["Avanzamento", "La percentuale di avanzamento non si aggiorna più dai rapportini."],
  ])("spegnere %s spiega la conseguenza", (parte, testo) => {
    render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(screen.queryByText(testo)).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: parte }));
    expect(screen.getByText(testo)).toBeInTheDocument();
  });
  it("salva la parte spenta e chiede conferma uscendo con modifiche", async () => {
    render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(stato.guard).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("switch", { name: "Mezzi e attrezzi" }));
    expect(stato.guard).toHaveBeenLastCalledWith(true);
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato()).toMatchObject({ tipo: "rapportino", nome: "Rapportino" });
    expect(salvato().schema.blocchi.mezzi).toBe(false);
  });
});

describe("Campi propri", () => {
  it("aggiungere un campo genera la chiave, rinominarlo non la cambia", async () => {
    conModello({ campi: [campo()] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.change(screen.getByLabelText("Nome del campo 1"), { target: { value: "Pezzi montati" } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un campo" }));
    fireEvent.change(screen.getByLabelText("Nome del campo 2"), { target: { value: "Pezzi montati" } });
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    const { campi } = salvato().schema;
    expect(campi[0]).toMatchObject({ chiave: "pezzi", etichetta: "Pezzi montati" });
    expect(campi[1].chiave).toBe("pezzi_montati");
  });
  it("una scelta senza opzioni blocca il salvataggio", async () => {
    const { toast } = await import("sonner");
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un campo" }));
    fireEvent.change(screen.getByLabelText("Nome del campo 1"), { target: { value: "Esito" } });
    fireEvent.change(screen.getByLabelText("Tipo del campo 1"), { target: { value: "select" } });
    salva();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(stato.salva).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Opzioni del campo 1"), { target: { value: "Sì, No, Forse" } });
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().schema.campi[0].opzioni).toEqual(["Sì", "No", "Forse"]);
  });
  it("un campo con dati ha il tipo bloccato e lo dice", () => {
    conModello({ campi: [campo()] }); stato.uso = { pezzi: 3 };
    render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(screen.getByLabelText("Tipo del campo 1")).toBeDisabled();
    expect(screen.getByLabelText("Dove, campo 1")).toBeDisabled();
    expect(screen.getByText("Il tipo non si cambia: 3 documenti contengono già questo campo.")).toBeInTheDocument();
  });
  it("eliminare un campo con dati lo archivia dopo conferma e si può riattivare", async () => {
    conModello({ campi: [campo()] }); stato.uso = { pezzi: 3 };
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina il campo 1" }));
    expect(conferma).toHaveBeenCalled();
    expect(screen.queryByLabelText("Nome del campo 1")).toBeNull();
    const archiviati = screen.getByRole("region", { name: "Archiviati" });
    expect(within(archiviati).getByText("Pezzi posati")).toBeInTheDocument();
    fireEvent.click(within(archiviati).getByRole("button", { name: "Riattiva Pezzi posati" }));
    expect(screen.getByLabelText("Nome del campo 1")).toHaveValue("Pezzi posati");
    fireEvent.click(screen.getByRole("button", { name: "Elimina il campo 1" }));
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().schema.campi[0].archiviato).toBe(true);
    conferma.mockRestore();
  });
  it("eliminare un campo senza dati lo toglie davvero", async () => {
    conModello({ campi: [campo()] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Elimina il campo 1" }));
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().schema.campi).toEqual([]);
  });
  it("mostra le scelte di ogni campo e l'unità solo per i numeri", () => {
    conModello({ campi: [campo()] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    for (const n of ["Chi lo compila, campo 1", "Quali ditte, campo 1", "Quando, campo 1", "Dove, campo 1", "Nel PDF, campo 1"]) expect(screen.getByLabelText(n)).toBeInTheDocument();
    expect(screen.getByLabelText("Unità del campo 1")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Tipo del campo 1"), { target: { value: "text" } });
    expect(screen.queryByLabelText("Unità del campo 1")).toBeNull();
  });
  it("si riordina con su e giù", async () => {
    conModello({ campi: [campo(), campo({ chiave: "b", etichetta: "Secondo", tipo: "text" })] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Sposta su il campo 2" }));
    expect(screen.getByLabelText("Nome del campo 1")).toHaveValue("Secondo");
  });
});

describe("Modelli pronti", () => {
  it("riempie la bozza senza salvare", () => {
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Parti dal modello Serramenti" }));
    expect(screen.getByLabelText("Nome del campo 1")).toHaveValue("Pezzi posati");
    expect(stato.salva).not.toHaveBeenCalled();
  });
  it("se ci sono già campi chiede conferma, e tenendo i dati li archivia", async () => {
    conModello({ campi: [campo({ chiave: "vecchio", etichetta: "Vecchio", tipo: "text" })] }); stato.uso = { vecchio: 2 };
    const conferma = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ModuliCantiereConfig tipo="rapportino" />);
    fireEvent.click(screen.getByRole("button", { name: "Parti dal modello Edile" }));
    expect(screen.getByLabelText("Nome del campo 1")).toHaveValue("Vecchio");
    conferma.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Parti dal modello Edile" }));
    expect(screen.getByLabelText("Nome del campo 1")).toHaveValue("Sicurezza verificata");
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().schema.campi.find(c => c.chiave === "vecchio")?.archiviato).toBe(true);
    conferma.mockRestore();
  });
});

describe("Anteprima", () => {
  it("mostra la vista operaio e la vista capo senza scrivere dati", () => {
    conModello({ campi: [campo({ etichetta: "Per tutti", chiave: "a", tipo: "text" }), campo({ etichetta: "Solo capo", chiave: "b", tipo: "text", chi: "capo" })] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    const a = screen.getByRole("region", { name: "Anteprima del modulo" });
    expect(within(a).getByLabelText("Per tutti")).toBeInTheDocument();
    expect(within(a).queryByLabelText("Solo capo")).toBeNull();
    fireEvent.click(within(a).getByRole("button", { name: "Vista capo" }));
    expect(within(a).getByLabelText("Solo capo")).toBeInTheDocument();
    fireEvent.change(within(a).getByLabelText("Solo capo"), { target: { value: "prova" } });
    expect(stato.salva).not.toHaveBeenCalled();
    expect(stato.guard).toHaveBeenLastCalledWith(false);
  });
});

describe("Permessi e telefono", () => {
  it("senza permesso è tutto in sola lettura", () => {
    stato.puoModificare = false;
    conModello({ campi: [campo()] });
    render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(screen.getByRole("switch", { name: "Mezzi e attrezzi" })).toBeDisabled();
    expect(screen.getByLabelText("Nome del campo 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salva" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aggiungi un campo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Parti dal modello/ })).toBeNull();
  });
  it("da telefono la sezione non c'è", () => {
    stato.mobile = true;
    const { container } = render(<ModuliCantiereConfig tipo="rapportino" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Verbali", () => {
  const verbale = (p = {}) => ({ id: "v1", tipo: "verbale", nome: "Serramenti", attivo: true, schema: { ...SCHEMA_COME_OGGI, voci: ["Vetri integri"], campi: [] as CampoModulo[], dal_cantiere: false }, ...p });
  it("crea un modello da uno pronto, senza salvarlo finché non si conferma", async () => {
    render(<ModuliCantiereConfig tipo="verbale" />);
    fireEvent.click(screen.getByRole("button", { name: "Nuovo verbale da Fotovoltaico" }));
    expect(screen.getByLabelText("Nome del modello")).toHaveValue("Fotovoltaico");
    expect(screen.getByLabelText("Voce 1")).toHaveValue("Moduli e fissaggi");
    expect(stato.salva).not.toHaveBeenCalled();
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato()).toMatchObject({ id: null, tipo: "verbale", nome: "Fotovoltaico" });
    expect(salvato().schema.dal_cantiere).toBe(true);
  });
  it("modifica voci e permesso dal cantiere di un modello esistente", async () => {
    stato.verbale = [verbale()];
    render(<ModuliCantiereConfig tipo="verbale" />);
    fireEvent.click(screen.getByRole("button", { name: "Apri il modello Serramenti" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi una voce" }));
    fireEvent.change(screen.getByLabelText("Voce 2"), { target: { value: "Maniglie" } });
    fireEvent.click(screen.getByRole("switch", { name: "Compilabile dal capo in cantiere" }));
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().id).toBe("v1");
    expect(salvato().schema.voci).toEqual(["Vetri integri", "Maniglie"]);
    expect(salvato().schema.dal_cantiere).toBe(true);
  });
  it("disattivare un modello lo salva spento", async () => {
    stato.verbale = [verbale()];
    render(<ModuliCantiereConfig tipo="verbale" />);
    fireEvent.click(screen.getByRole("button", { name: "Apri il modello Serramenti" }));
    fireEvent.click(screen.getByRole("switch", { name: "Modello attivo" }));
    salva();
    await waitFor(() => expect(stato.salva).toHaveBeenCalled());
    expect(salvato().attivo).toBe(false);
  });
  it("nei campi del verbale chiede solo cosa serve al verbale, e per il cliente di partenza", async () => {
    stato.verbale = [verbale()];
    render(<ModuliCantiereConfig tipo="verbale" />);
    fireEvent.click(screen.getByRole("button", { name: "Apri il modello Serramenti" }));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi un campo" }));
    expect(screen.queryByLabelText("Chi lo compila, campo 1")).toBeNull();
    expect(screen.queryByLabelText("Dove, campo 1")).toBeNull();
    expect(screen.getByLabelText("Nel PDF, campo 1")).toHaveValue("cliente");
  });
});

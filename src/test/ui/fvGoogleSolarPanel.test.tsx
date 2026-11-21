import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FvGoogleSolarPanel } from "@/components/fotovoltaico/tetto/FvGoogleSolarPanel";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), misure: vi.fn() }));
vi.mock(
  "@/integrations/supabase/client",
  () => ({ supabase: { functions: { invoke: mocks.invoke } } }),
);
vi.mock("@/lib/fotovoltaico/solarRaster", () => ({
  rasterSolarFv: async () => ({
    w: 100,
    h: 100,
    gps: (x: number, y: number) => ({
      lat: 45 + y * .000001,
      lng: 9 + x * .000001,
    }),
    passo: .1,
  }),
  jpegSolarFv: () => "data:image/jpeg;base64,QUJD",
  misureTettoSolarFv: mocks.misure,
}));
const mappa = {
  versione: 1 as const,
  origine: { lat: 45, lng: 9 },
  ricerca: { indirizzo: "Demo", posizione: { lat: 45, lng: 9 } },
  distanzaOstacoli: .3,
  falde: [{
    id: "f1",
    nome: "Falda 1",
    punti: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }],
    inclinazione: 20,
    azimut: 180,
    inclinazioneStimata: true,
  }],
};
const props = () => ({
  progettoId: "id-progetto",
  posizione: mappa.origine,
  mappa,
  modificabile: true,
  pannelli: 5,
  onFoto: vi.fn(),
  onMisure: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.invoke.mockImplementation(async (
    _nome,
    { body }: { body: { azione: string } },
  ) => ({
    data: body.azione === "insights"
      ? {
        fonte: "solar_api",
        segmenti: [],
        superficie_tetto_disponibile_mq: 100,
      }
      : body.azione === "layers"
      ? { imagery_date: "2025-06-15", qualitaGoogle: "HIGH", disponibile: true }
      : body.azione === "salva_foto"
      ? { path: "foto-salvata.jpg" }
      : { contenuto: "QUJD" },
    error: null,
  }));
  mocks.misure.mockReturnValue({
    altezza: 5.5,
    falde: mappa.falde,
    scarto: .05,
    terreno: 100,
  });
});
afterEach(cleanup);
describe("Analisi Solar esplicita e protezione della posa", () => {
  it("non chiama Google all'apertura e non permette analisi in sola lettura", () => {
    const p = props();
    render(<FvGoogleSolarPanel {...p} modificabile={false} />);
    expect(
      screen.getByRole("button", { name: "Analizza questo tetto con Google" }),
    ).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("mantiene il disegno se il provider non copre il tetto", async () => {
    const p = props();
    mocks.invoke.mockResolvedValue({
      data: { error: "NOT_FOUND", message: "Edificio non coperto" },
    });
    render(<FvGoogleSolarPanel {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Analizza questo tetto con Google" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Edificio non coperto",
    );
    expect(p.onFoto).not.toHaveBeenCalled();
    expect(p.onMisure).not.toHaveBeenCalled();
  });
  it("salva la foto solo dopo conferma e impedisce di alterare le falde con moduli già posati", async () => {
    const p = props();
    render(<FvGoogleSolarPanel {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Analizza questo tetto con Google" }),
    );
    await screen.findByAltText("Anteprima della foto Google Solar del tetto");
    expect(p.onFoto).not.toHaveBeenCalled();
    expect(
      mocks.invoke.mock.calls.some(([, options]) =>
        options.body.azione === "insights"
      ),
    ).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: "Usa la foto Google Solar" }),
    );
    await waitFor(() =>
      expect(p.onFoto).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "foto-salvata.jpg",
          data: "2025-06-15",
          risoluzione: .1,
        }),
      )
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Misura le falde disegnate" }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Applica le misure alle falde",
      }),
    ).toBeDisabled();
    expect(p.onMisure).not.toHaveBeenCalled();
  });
  it("ignora una risposta arrivata dopo lo spostamento del pin", async () => {
    let rispondi!: (v: unknown) => void;
    mocks.invoke.mockImplementationOnce(() =>
      new Promise((r) => {
        rispondi = r;
      })
    );
    const p = props(), r = render(<FvGoogleSolarPanel {...p} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Analizza questo tetto con Google" }),
    );
    r.rerender(<FvGoogleSolarPanel {...p} posizione={{ lat: 46, lng: 10 }} />);
    await act(async () => {
      rispondi({ data: { fonte: "solar_api", segmenti: [] } });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Analizza questo tetto con Google",
        }),
      ).not.toBeDisabled()
    );
    expect(screen.queryByAltText("Anteprima della foto Google Solar del tetto"))
      .toBeNull();
    expect(p.onFoto).not.toHaveBeenCalled();
  });
});

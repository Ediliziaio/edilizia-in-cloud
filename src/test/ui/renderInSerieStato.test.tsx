import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RenderInSerieDialog } from "@/components/planimetrie/RenderInSerieDialog";
import bilocale from "../../../shared/planimetrie/esempi/bilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";

const mocks = vi.hoisted(() => ({ invalidateQueries: vi.fn(), avvia: vi.fn(async () => "sessione"), stati: vi.fn(async () => new Map([["sessione", { stato: "pronto", url: "/render.png" }]])) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "demo" }, user: { id: "utente" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { balance: 10, unlimited: true } }), useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("@/lib/planimetrie/render/renderInSerie", () => ({ avviaRenderStanza: mocks.avvia, statoSessioni: mocks.stati, lavoriDaFare: (stanze: Array<{ id: string; nome: string }>, idee: Array<{ id: string }>) => idee.flatMap((idea) => stanze.map((s) => ({ chiave: `${s.id}:${idea.id}`, localeId: s.id, localeNome: s.nome, idea }))) }));

const stanze = () => [{ id: "a", nome: "Soggiorno", destinazione: "soggiorno" }, { id: "b", nome: "Camera", destinazione: "camera" }];
const vista = () => <MemoryRouter><RenderInSerieDialog aperto onChiudi={() => undefined} planimetriaId="pianta" versione={1} documento={bilocale as unknown as Planimetria} livelloId="pt" ambito="fatto" stanze={stanze()} /></MemoryRouter>;
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

describe("la finestra dei render in serie conserva lo stato", () => {
  it("un aggiornamento della pianta non riseleziona le stanze escluse", () => {
    const view = render(vista());
    fireEvent.click(screen.getByRole("checkbox", { name: "Camera" }));
    expect(screen.getByRole("button", { name: "Fai 1 render" })).toBeEnabled();
    view.rerender(vista());
    expect(screen.getByRole("checkbox", { name: "Camera" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Fai 1 render" })).toBeEnabled();
  });
  it("gli esiti restano visibili dopo il completamento e l'aggiornamento della galleria", async () => {
    vi.useFakeTimers();
    const view = render(vista());
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Fai 2 render" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(screen.getByText(/2 di 2 pronti/)).toBeInTheDocument();
    view.rerender(vista());
    expect(screen.getByText(/2 di 2 pronti/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fai 2 render" })).not.toBeInTheDocument();
  });
});

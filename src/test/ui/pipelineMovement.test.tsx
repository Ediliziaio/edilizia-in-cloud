import { PipelineCardHeading } from "@/components/orders/PipelineDrag";
import "@testing-library/jest-dom/vitest";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OperationalBoard } from "@/components/orders/OperationalBoard";
import { usePipelineTransition } from "@/hooks/usePipelineTransition";
const state = vi.hoisted(() => ({
  save: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/api/pipelineTransitions", () => ({
  savePipelineTransition: state.save,
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: state.invalidate }),
}));
vi.mock("@/hooks/useEffectiveCompanyId", () => ({
  useEffectiveCompanyId: () => "co",
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user" } }),
}));
vi.mock("sonner", () => ({
  toast: { success: state.success, error: state.error },
}));
function App({ readonly = false }: { readonly?: boolean }) {
  const movement = usePipelineTransition({
    kind: "survey",
    enabled: !readonly,
  });
  return (
    <>
      <OperationalBoard
        label="Test pipeline"
        onMove={
          readonly
            ? undefined
            : (_id, target) =>
                movement.request(
                  {
                    id: "1",
                    label: "SOP-1",
                    status: "draft",
                    stage: "da_pianificare",
                    href: "/detail",
                  },
                  target,
                )
        }
        disabled={movement.saving}
        getLabel={() => "SOP-1"}
        columns={[
          {
            id: "da_pianificare",
            label: "Da pianificare",
            hint: "",
            accent: "",
            items: [{ id: "1" }],
          },
          {
            id: "in_corso",
            label: "In corso",
            hint: "",
            accent: "",
            items: [],
          },
          { id: "firmato", label: "Firmato", hint: "", accent: "", items: [] },
        ]}
        renderCard={() => (
          <PipelineCardHeading>
            <a href="/detail">Apri scheda</a>
          </PipelineCardHeading>
        )}
      />
      {movement.dialog}
    </>
  );
}
function open(readonly = false) {
  render(
    <MemoryRouter>
      <App readonly={readonly} />
    </MemoryRouter>,
  );
}
async function choose(target: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name: "Sposta SOP-1" }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  await screen.findByRole("menu");
  fireEvent.click(screen.getByRole("menuitem", { name: target }));
}
beforeEach(() => {
  state.save.mockReset().mockResolvedValue(undefined);
  state.invalidate.mockReset().mockResolvedValue(undefined);
  state.success.mockReset();
  state.error.mockReset();
});
afterEach(cleanup);
describe("Spostamento delle schede", () => {
  it("offre la scheda trascinabile e il menu; annullare non scrive sul database", async () => {
    open();
    expect(
      screen.getByRole("group", { name: "Trascina SOP-1" }),
    ).toBeInTheDocument();
    await choose("In corso");
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Porta il sopralluogo in corso",
    );
    fireEvent.click(screen.getByRole("button", { name: "Annulla" }));
    expect(state.save).not.toHaveBeenCalled();
  });
  it("salva una sola volta e aggiorna le viste collegate dopo la conferma", async () => {
    open();
    await choose("In corso");
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma spostamento" }),
    );
    await waitFor(() => expect(state.success).toHaveBeenCalled());
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: "in_progress" }),
      "co",
      "user",
    );
    expect(state.invalidate).toHaveBeenCalledWith({
      queryKey: ["sopralluoghi-bacheca"],
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("un errore non sposta la scheda e lascia il dialogo disponibile", async () => {
    state.save.mockRejectedValue(new Error("Permesso negato"));
    open();
    await choose("In corso");
    fireEvent.click(
      screen.getByRole("button", { name: "Conferma spostamento" }),
    );
    await waitFor(() => expect(state.error).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Apri scheda")).toBeInTheDocument();
    expect(state.success).not.toHaveBeenCalled();
  });
  it("firmare apre il flusso dedicato, senza scrivere uno stato fittizio", async () => {
    open();
    await choose("Firmato");
    expect(screen.getByRole("dialog")).toHaveTextContent("firma effettiva");
    expect(
      screen.getByRole("button", { name: "Apri e completa il passaggio" }),
    ).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("in sola lettura nasconde tutti i comandi di spostamento", () => {
    open(true);
    expect(
      screen.queryByRole("group", { name: "Trascina SOP-1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sposta SOP-1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Apri scheda" }),
    ).toBeInTheDocument();
  });
});

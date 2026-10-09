/**
 * L'avviso sulle maggiorazioni dei modelli copiati resta invariato.
 * Le nuove linee di infissi usano invece il catalogo geometrico atomico, senza tariffe Demo.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvvisoInstallazioneModello } from "@/components/listino/AvvisoInstallazioneModello";
import { ModelliInfissiDialog } from "@/components/listino/ModelliInfissiDialog";
import type { AnteprimaInstallazione } from "@/lib/listino/modelliArea";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  pending: false,
  refetch: vi.fn(),
  anteprima: { data: undefined as unknown, isLoading: false },
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/hooks/useOrganizzaListino", () => ({
  useOrganizzaListino: () => ({ preparaModelliInfissi: { mutateAsync: mocks.mutateAsync, isPending: mocks.pending } }),
}));
// Nessuna attesa mentre si scrive: qui conta quello che parte, non il ritardo.
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }));
vi.mock("@/hooks/useModelliArea", () => ({
  useModelliDisponibili: () => ({ data: [{ id: "modello-1", nome: "Infissi con disegno automatico" }] }),
  useModelliAreaMutations: () => ({ installa: { mutateAsync: mocks.mutateAsync } }),
  useAnteprimaInstallazione: () => ({ ...mocks.anteprima, refetch: mocks.refetch }),
}));

const anteprima = (extra: Partial<AnteprimaInstallazione> = {}): AnteprimaInstallazione => ({
  modello: "Infissi con disegno automatico",
  prodotti_nuovi: 40,
  prodotti_gia_presenti: 0,
  maggiorazioni_copiabili: 0,
  assi: [],
  installazione_recente: null,
  ...extra,
});

const DA_COPIARE = anteprima({
  maggiorazioni_copiabili: 160,
  assi: [
    { asse: "Colore", varianti: 80 },
    { asse: "Telaio", varianti: 40 },
    { asse: "Tipologia Vetro", varianti: 40 },
  ],
});


beforeEach(() => {
  mocks.pending = false;
  mocks.mutateAsync.mockReset();
  mocks.refetch.mockReset();
  Object.values(mocks.toast).forEach((f) => f.mockReset());
  mocks.anteprima = { data: undefined, isLoading: false };
});
afterEach(cleanup);

describe("l'avviso sulle maggiorazioni", () => {
  const monta = (props: Partial<React.ComponentProps<typeof AvvisoInstallazioneModello>> = {}) => {
    const onCopia = vi.fn();
    render(
      <AvvisoInstallazioneModello anteprima={undefined} caricamento={false} copia onCopia={onCopia} {...props} />,
    );
    return { onCopia };
  };

  it("non dice niente se non c'è niente da copiare", () => {
    const { container } = render(
      <AvvisoInstallazioneModello anteprima={anteprima()} caricamento={false} copia onCopia={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });

  it("mentre controlla lo dice, e non mostra scelte a metà", () => {
    monta({ caricamento: true });
    expect(screen.getByRole("status").textContent).toMatch(/Controllo cosa hai già nel listino/);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("se c'è da copiare dice su cosa e lascia scegliere", () => {
    const { onCopia } = monta({ anteprima: DA_COPIARE });
    expect(screen.getByText(/Colore, Telaio e Tipologia Vetro/)).toBeTruthy();
    expect(screen.getByText(/160 varianti dei prodotti nuovi arrivano senza la tua/)).toBeTruthy();
    const casella = screen.getByRole("checkbox", { name: /Copia le mie maggiorazioni sui prodotti nuovi/ });
    expect(casella.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(casella);
    expect(onCopia).toHaveBeenCalledWith(false);
  });

  it("se il modello è appena stato aggiunto lo dice con l'ora", () => {
    monta({ anteprima: anteprima({ installazione_recente: "2026-10-05T08:35:11.930987+00:00" }) });
    expect(screen.getByRole("status").textContent).toMatch(/Questo modello è stato aggiunto alle 10:35/);
  });
});

describe("linee di infissi: protezioni della creazione standard", () => {
  const monta = () => render(<ModelliInfissiDialog open onOpenChange={vi.fn()} companyId="azienda-1" giaPresenti={[]} />);
  const scrivi = (nome: string) => {
    fireEvent.change(screen.getByLabelText("Nome della linea"), { target: { value: nome } });
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi linea" }));
  };
  it("un retry già completato non promette prodotti nuovi", async () => {
    mocks.mutateAsync.mockResolvedValue({ prodotti_nuovi: 0, linee: 1 });
    monta(); scrivi("PVC Salamander 76");
    fireEvent.click(screen.getByRole("button", { name: "Prepara le linee" }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Le configurazioni sono già presenti", expect.anything()));
  });
  it("durante la transazione non consente di cambiare i nomi o chiudere", () => {
    mocks.pending = true; monta();
    expect((screen.getByLabelText("Nome della linea") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Non ora" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Creo le linee/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("un errore mostra il messaggio del database e non dichiara un successo parziale", async () => {
    mocks.mutateAsync.mockRejectedValue(new Error("Non puoi modificare il listino di questa azienda"));
    monta(); scrivi("PVC Salamander 76"); scrivi("PVC Rehau");
    fireEvent.click(screen.getByRole("button", { name: "Prepara le linee" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Linee non create", { description: "Non puoi modificare il listino di questa azienda" }));
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });
  it("oltre 20 linee si ferma prima di chiamare il database", () => {
    monta();
    for (let i = 0; i < 21; i++) scrivi(`Linea ${i}`);
    const pulsante = screen.getByRole("button", { name: "Prepara le linee" }) as HTMLButtonElement;
    expect(pulsante.disabled).toBe(true);
    fireEvent.click(pulsante);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });
});

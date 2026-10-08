/**
 * Installare un modello di listino: l'avviso sulle maggiorazioni e la finestra «Modelli di infissi» (06/10/2026).
 *
 * «Modelli di infissi» è la finestra da cui è partito l'incidente di Renova Solution (05/10): una chiamata per ogni
 * nome di linea, e ogni variante dei prodotti nuovi arrivata a «nessuna maggiorazione». Qui si prova quello che
 * l'utente vede e quello che la finestra manda al database, con l'hook al posto del database.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvvisoInstallazioneModello } from "@/components/listino/AvvisoInstallazioneModello";
import { ModelliInfissiDialog } from "@/components/listino/ModelliInfissiDialog";
import type { AnteprimaInstallazione } from "@/lib/listino/modelliArea";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  anteprima: { data: undefined as unknown, isLoading: false },
  toast: { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
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

const esitoCon = (prodotti: number) => ({ prodotti_nuovi: prodotti });

beforeEach(() => {
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

describe("«Modelli di infissi»: cosa manda al database", () => {
  const monta = () =>
    render(<ModelliInfissiDialog open onOpenChange={vi.fn()} companyId="azienda-1" giaPresenti={[]} />);

  const scrivi = (nome: string) => {
    fireEvent.change(screen.getByLabelText("Nome del modello"), { target: { value: nome } });
    fireEvent.click(screen.getByRole("button", { name: /^Aggiungi$/ }));
  };
  const crea = (n: number) =>
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Crea ${n} ${n === 1 ? "modello" : "modelli"}$`) }));

  it("con maggiorazioni da copiare la scelta di default è «copia» e parte col nome giusto", async () => {
    mocks.anteprima = { data: DA_COPIARE, isLoading: false };
    mocks.mutateAsync.mockResolvedValue(esitoCon(40));
    monta();
    scrivi("PVC Salamander 76");
    crea(1);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      modelloId: "modello-1",
      companyId: "azienda-1",
      modelli: ["PVC Salamander 76"],
      copiaMaggiorazioni: true,
    });
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
  });

  it("se si toglie la spunta, i prodotti nuovi restano come il modello", async () => {
    mocks.anteprima = { data: DA_COPIARE, isLoading: false };
    mocks.mutateAsync.mockResolvedValue(esitoCon(40));
    monta();
    scrivi("PVC Salamander 76");
    fireEvent.click(screen.getByRole("checkbox", { name: /Copia le mie maggiorazioni/ }));
    crea(1);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync.mock.calls[0][0].copiaMaggiorazioni).toBe(false);
  });

  it("se non c'è niente da copiare non passa nessuna scelta: il database resta la rete di sicurezza", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    mocks.mutateAsync.mockResolvedValue(esitoCon(40));
    monta();
    scrivi("PVC Aluplast");
    crea(1);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(mocks.mutateAsync.mock.calls[0][0].copiaMaggiorazioni).toBeUndefined();
  });

  it("un nome appena aggiunto non ferma gli altri e non è un errore", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    mocks.mutateAsync
      .mockRejectedValueOnce({ hint: "installazione_recente", message: "Questo modello è già stato aggiunto alle 10:35: non lo aggiungo di nuovo." })
      .mockResolvedValueOnce(esitoCon(40));
    monta();
    scrivi("PVC Salamander 76");
    scrivi("PVC Aluplast Ideal 5000");
    crea(2);
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledTimes(2));
    expect(mocks.mutateAsync.mock.calls.map((c) => c[0].modelli)).toEqual([["PVC Salamander 76"], ["PVC Aluplast Ideal 5000"]]);
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Creato: 1 modello, 40 prodotti con disegno"));
    expect(mocks.toast.error).not.toHaveBeenCalled();
  });

  it("se erano tutti appena aggiunti lo dice, senza dire «creato»", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    mocks.mutateAsync.mockRejectedValue({ hint: "installazione_recente", message: "x" });
    monta();
    scrivi("PVC Salamander 76");
    crea(1);
    await waitFor(() => expect(mocks.toast.info).toHaveBeenCalledWith("Questo modello è già stato aggiunto da poco"));
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("se il database chiede la scelta, ci si ferma, si avvisa e si rifà l'anteprima", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    mocks.mutateAsync.mockRejectedValue({
      hint: "maggiorazioni_da_scegliere",
      message: "Hai già prodotti con maggiorazioni sulle stesse varianti (Colore): scegli se copiarle sui prodotti nuovi o lasciarli senza.",
    });
    monta();
    scrivi("PVC Salamander 76");
    scrivi("PVC Aluplast");
    crea(2);
    await waitFor(() => expect(mocks.toast.warning).toHaveBeenCalled());
    // Il primo nome ha fermato tutto: il secondo non parte.
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mocks.refetch).toHaveBeenCalled();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it("un errore vero resta un errore, col messaggio del database", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    mocks.mutateAsync.mockRejectedValue({ message: "Solo l'amministratore dell'azienda può aggiungere un'area da un modello" });
    monta();
    scrivi("PVC Salamander 76");
    crea(1);
    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("Non è andata fino in fondo", {
        description: "Solo l'amministratore dell'azienda può aggiungere un'area da un modello",
      }),
    );
  });

  it("due click veloci sul pulsante mandano una sola installazione per nome", async () => {
    mocks.anteprima = { data: anteprima(), isLoading: false };
    let finisci: (v: unknown) => void = () => {};
    mocks.mutateAsync.mockReturnValue(new Promise((ok) => (finisci = ok)));
    monta();
    scrivi("PVC Salamander 76");
    const pulsante = screen.getByRole("button", { name: /^Crea 1 modello$/ });
    fireEvent.click(pulsante);
    fireEvent.click(pulsante);
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    finisci(esitoCon(40));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalled());
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("finché l'anteprima non è arrivata il pulsante resta spento", () => {
    mocks.anteprima = { data: undefined, isLoading: true };
    monta();
    scrivi("PVC Salamander 76");
    const pulsante = screen.getByRole("button", { name: /^Crea 1 modello$/ }) as HTMLButtonElement;
    expect(pulsante.disabled).toBe(true);
  });
});

import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), hydrate: vi.fn(), save: vi.fn(), backup: vi.fn() }));
vi.mock("@/lib/computo/cloudComputo", () => ({
  leggiComputoCloud: mocks.read, preparaAllegatiCloud: mocks.hydrate, salvaComputoCloud: mocks.save,
  improntaComputo: async (b: unknown) => JSON.stringify(b),
  ConflittoComputoCloud: class extends Error { constructor() { super("Il computo è stato modificato da un altro dispositivo."); } },
}));
vi.mock("@/lib/computo/backupComputo", () => ({ creaBackupComputo: mocks.backup }));
// L'editor vero è grande: qui basta che faccia quello che fa lui verso l'involucro. Appena
// montato ripete la bozza com'è (senza modifiche), poi segnala ogni modifica.
vi.mock("@/components/computo/ComputoNativoEditor", async () => {
  const { useEffect } = await import("react");
  return { default: function EditorFinto({ storageKey, cloud }: { storageKey: string; cloud: { status: string; onChange: (b: unknown) => void } }) {
    const leggi = () => JSON.parse(localStorage.getItem(storageKey) ?? JSON.stringify({ titolo: "Nuovo computo metrico" }));
    useEffect(() => { cloud.onChange(leggi()); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- come l'editor: una volta, al montaggio
    return <div>
      <p>{leggi().titolo}</p><p data-testid="stato">{cloud.status}</p>
      <input aria-label="Campo dell'editor" />
      <button onClick={() => cloud.onChange({ ...leggi(), titolo: "Modificato" })}>Modifica test</button>
    </div>;
  } };
});
import ComputoCloudEditor from "@/components/computo/ComputoCloudEditor";
import { ConflittoComputoCloud } from "@/lib/computo/cloudComputo";
import { bozzaVuota } from "@/lib/computo/editorNativo";
const remote = { id: "draft", revision: 2, bozza: { ...bozzaVuota(), titolo: "Titolo remoto" }, updatedAt: "oggi" };
const props = { storageKey: "test-cloud-ui", companyId: "demo2", draftId: "draft" };
const stato = () => screen.getByTestId("stato");
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear(); mocks.hydrate.mockResolvedValue(undefined); mocks.read.mockResolvedValue(remote);
  mocks.save.mockImplementation(async (_c: string, _id: string, _s: string, bozza: unknown, revision: number) => ({ id: "draft", revision: revision + 1, bozza, updatedAt: "ora" }));
});
afterEach(cleanup);

describe("apertura del computo salvato nel gestionale", () => {
  it("su un dispositivo vuoto recupera prima gli allegati, poi apre la bozza", async () => {
    render(<ComputoCloudEditor {...props} />);
    await screen.findByText("Titolo remoto"); expect(mocks.hydrate).toHaveBeenCalledWith("demo2", "draft", props.storageKey, remote.bozza);
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(remote.bozza);
    expect(stato()).toHaveTextContent("Salvato");
  });
  it("non sostituisce una copia locale modificata senza conferma, e non la salva", async () => {
    const local = { ...bozzaVuota(), titolo: "Lavoro locale" }; localStorage.setItem(props.storageKey, JSON.stringify(local));
    render(<ComputoCloudEditor {...props} />);
    await screen.findByText(/versione del computo diversa/); expect(screen.getByText("Lavoro locale")).toBeVisible();
    expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(local);
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await new Promise(r => setTimeout(r, 1800));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(stato()).toHaveTextContent("Salvataggio fermo");
  });
  it("aggiorna una cache non modificata quando il server ha una revisione nuova", async () => {
    const old = { ...bozzaVuota(), titolo: "Vecchia revisione" };
    localStorage.setItem(props.storageKey, JSON.stringify(old)); localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ revision: 1, digest: JSON.stringify(old) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto"); expect(screen.queryByText("Vecchia revisione")).not.toBeInTheDocument();
  });
  it("riapre modifiche locali non inviate se la revisione remota non è cambiata, e alla prima modifica le salva", async () => {
    localStorage.setItem(props.storageKey, JSON.stringify({ ...remote.bozza, titolo: "Modifica ancora locale" }));
    localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ revision: remote.revision, digest: JSON.stringify(remote.bozza) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Modifica ancora locale");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mocks.save.mock.calls[0][4]).toBe(remote.revision);
  });
  it("un errore allegati mantiene intatta la copia locale e consente un nuovo tentativo", async () => {
    mocks.hydrate.mockRejectedValueOnce(new Error("Allegato non disponibile"));
    const old = { ...bozzaVuota(), titolo: "Vecchia revisione" };
    localStorage.setItem(props.storageKey, JSON.stringify(old)); localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ digest: JSON.stringify(old) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByRole("alert");
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(old);
    fireEvent.click(screen.getByRole("button", { name: "Riprova" })); await screen.findByText("Titolo remoto");
  });
  it("se il gestionale non risponde non salva con una revisione ignota", async () => {
    mocks.read.mockRejectedValue(new Error("Offline"));
    render(<ComputoCloudEditor {...props} />); await screen.findByRole("alert"); fireEvent.click(screen.getByText("Continua con la copia su questo computer"));
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await new Promise(r => setTimeout(r, 1800));
    expect(mocks.save).not.toHaveBeenCalled();
    expect(stato()).toHaveTextContent("Non collegato al gestionale");
  });
});

describe("salvataggio automatico", () => {
  it("un computo nuovo non toccato non lascia righe vuote nel gestionale; alla prima modifica si salva", async () => {
    mocks.read.mockResolvedValue(null);
    render(<ComputoCloudEditor {...props} />);
    await waitFor(() => expect(stato()).toHaveTextContent("Si salva da solo alla prima modifica"));
    await new Promise(r => setTimeout(r, 1800));
    expect(mocks.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mocks.save.mock.calls[0][4]).toBe(0);
  });
  it("salva da solo dopo una pausa, senza pulsanti, e dice a che ora", async () => {
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto");
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    expect(mocks.save).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(mocks.save.mock.calls[0][3]).toMatchObject({ titolo: "Modificato" });
    await waitFor(() => expect(stato()).toHaveTextContent(/^Salvato alle \d{2}:\d{2}$/));
  });
  it("mentre salva l'editor resta scrivibile", async () => {
    let finisci: () => void = () => {};
    mocks.save.mockImplementationOnce((_c: string, _id: string, _s: string, bozza: unknown, revision: number) =>
      new Promise(r => { finisci = () => r({ id: "draft", revision: revision + 1, bozza, updatedAt: "ora" }); }));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto");
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await waitFor(() => expect(stato()).toHaveTextContent("Salvataggio…"), { timeout: 3000 });
    expect(screen.getByLabelText("Campo dell'editor")).toBeEnabled();
    finisci();
    await waitFor(() => expect(stato()).toHaveTextContent("Salvato alle"));
  });
  it("se un altro dispositivo ha salvato nel frattempo, si ferma invece di sovrascrivere", async () => {
    mocks.save.mockRejectedValueOnce(new ConflittoComputoCloud());
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto");
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await screen.findByText(/modificato da un altro dispositivo/, {}, { timeout: 3000 });
    expect(stato()).toHaveTextContent("Salvataggio fermo");
    expect(screen.getByRole("button", { name: "Scarica la mia copia e riapri quella salvata" })).toBeEnabled();
  });
  it("un errore di rete non perde niente e lo dice", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Salvataggio non riuscito. Dati e allegati restano su questo computer."));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto");
    fireEvent.click(screen.getByRole("button", { name: "Modifica test" }));
    await waitFor(() => expect(stato()).toHaveTextContent(/^Non salvato: Salvataggio non riuscito/), { timeout: 3000 });
  });
});

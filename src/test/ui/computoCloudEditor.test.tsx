import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ read: vi.fn(), hydrate: vi.fn(), save: vi.fn(), backup: vi.fn() }));
vi.mock("@/lib/computo/cloudComputo", () => ({
  leggiComputoCloud: mocks.read, preparaAllegatiCloud: mocks.hydrate, salvaComputoCloud: mocks.save,
  improntaComputo: async (b: unknown) => JSON.stringify(b),
  ConflittoComputoCloud: class extends Error {},
}));
vi.mock("@/lib/computo/backupComputo", () => ({ creaBackupComputo: mocks.backup }));
vi.mock("@/components/computo/ComputoNativoEditor", () => ({ default: ({ storageKey, cloud }: { storageKey: string; cloud: { status: string; disabled: boolean; onSave: (b: unknown) => void } }) => <div>
  <p>{JSON.parse(localStorage.getItem(storageKey) ?? "{}").titolo}</p><p>{cloud.status}</p>
  <button disabled={cloud.disabled} onClick={() => { cloud.onSave(JSON.parse(localStorage.getItem(storageKey) ?? "{}")); }}>Salva cloud test</button>
</div> }));
import ComputoCloudEditor from "@/components/computo/ComputoCloudEditor";
import { bozzaVuota } from "@/lib/computo/editorNativo";
const remote = { id: "draft", revision: 2, bozza: { ...bozzaVuota(), titolo: "Titolo remoto" }, updatedAt: "oggi" };
const props = { storageKey: "test-cloud-ui", companyId: "demo2", draftId: "draft" };
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.hydrate.mockResolvedValue(undefined); mocks.read.mockResolvedValue(remote); });
afterEach(cleanup);
describe("apertura computo Supabase", () => {
  it("su un dispositivo vuoto recupera prima gli allegati, poi apre la bozza", async () => {
    render(<ComputoCloudEditor {...props} />);
    await screen.findByText("Titolo remoto"); expect(mocks.hydrate).toHaveBeenCalledWith("demo2", "draft", props.storageKey, remote.bozza);
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(remote.bozza);
    expect(screen.getByRole("button", { name: "Salva cloud test" })).toBeEnabled();
  });
  it("non sostituisce una copia locale modificata senza conferma", async () => {
    const local = { ...bozzaVuota(), titolo: "Lavoro locale" }; localStorage.setItem(props.storageKey, JSON.stringify(local));
    render(<ComputoCloudEditor {...props} />);
    await screen.findByText(/contengono modifiche diverse/); expect(screen.getByText("Lavoro locale")).toBeVisible();
    expect(screen.getByRole("button", { name: "Salva cloud test" })).toBeDisabled(); expect(mocks.hydrate).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(local);
  });
  it("aggiorna una cache non modificata quando il server ha una revisione nuova", async () => {
    const old = { ...bozzaVuota(), titolo: "Vecchia revisione" };
    localStorage.setItem(props.storageKey, JSON.stringify(old)); localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ revision: 1, digest: JSON.stringify(old) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Titolo remoto"); expect(screen.queryByText("Vecchia revisione")).not.toBeInTheDocument();
  });
  it("riapre modifiche locali non inviate se la revisione remota non è cambiata", async () => {
    localStorage.setItem(props.storageKey, JSON.stringify({ ...remote.bozza, titolo: "Modifica ancora locale" }));
    localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ revision: remote.revision, digest: JSON.stringify(remote.bozza) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByText("Modifica ancora locale");
    expect(screen.getByRole("button", { name: "Salva cloud test" })).toBeEnabled(); expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("un errore allegati mantiene intatta la copia locale e consente un nuovo tentativo", async () => {
    mocks.hydrate.mockRejectedValueOnce(new Error("Allegato non disponibile"));
    const old = { ...bozzaVuota(), titolo: "Vecchia revisione" };
    localStorage.setItem(props.storageKey, JSON.stringify(old)); localStorage.setItem(`${props.storageKey}:supabase`, JSON.stringify({ digest: JSON.stringify(old) }));
    render(<ComputoCloudEditor {...props} />); await screen.findByRole("alert");
    expect(JSON.parse(localStorage.getItem(props.storageKey)!)).toEqual(old);
    fireEvent.click(screen.getByRole("button", { name: /Riprova Supabase/ })); await screen.findByText("Titolo remoto");
  });
  it("se Supabase è offline non autorizza un salvataggio con revisione ignota", async () => {
    mocks.read.mockRejectedValue(new Error("Offline"));
    render(<ComputoCloudEditor {...props} />); await screen.findByRole("alert"); fireEvent.click(screen.getByText("Continua con la copia locale"));
    expect(screen.getByRole("button", { name: "Salva cloud test" })).toBeDisabled();
    await waitFor(() => expect(mocks.save).not.toHaveBeenCalled());
  });
});

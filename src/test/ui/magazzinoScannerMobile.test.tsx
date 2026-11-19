import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import type {LookupResult} from "@/hooks/warehouse/useBarcodeLookup";
import type {BatchScanEntry} from "@/components/warehouse/BatchBarcodeScanner";
interface CameraOptions {paused?: boolean; manualMode: boolean; onScan: (raw: string) => void; onCameraError?: () => void;}
const state = vi.hoisted(() => ({camera: null as CameraOptions | null, error: null as string | null, lookup: vi.fn()}));
vi.mock("@/hooks/warehouse/useBatchScannerCamera", () => ({useBatchScannerCamera: (options: CameraOptions) => {
  state.camera = options;
  return {videoRef: {current: null as null}, cameraError: state.error, cameraReady: true, isStarting: false, torchOn: false, torchSupported: false, toggleTorch: vi.fn(), handleTapFocus: vi.fn()};
}}));
vi.mock("@/hooks/warehouse/useBarcodeLookup", () => ({useBarcodeLookup: () => ({isPending: false, mutateAsync: state.lookup})}));
vi.mock("@/lib/mobile/native-network", () => ({onNetworkChange: () => (): void => undefined}));
vi.mock("@/lib/mobile/native-haptics", () => ({successFeedback: vi.fn(), errorFeedback: vi.fn()}));
vi.mock("sonner", () => ({toast: {warning: vi.fn(), error: vi.fn(), success: vi.fn()}}));
import {BatchBarcodeScanner} from "@/components/warehouse/BatchBarcodeScanner";
import {BarcodeScanner} from "@/components/warehouse/BarcodeScanner";
const entry = (quantity = 2): BatchScanEntry => ({clientUuid: "existing", rawCode: "old", stockItemId: "s", itemName: "Cavo elettrico", trackingMode: "fungible", quantity, serialNumbers: [], scannedAt: 1, odaItemId: "line", unitOfMeasure: "m"});
const matched: LookupResult = {rawScan: "code", parsedPrimary: "code", gs1Detected: false, action: {kind: "accept_item", itemId: "s"}, rows: [{match_type: "item", stock_item_id: "s", stock_unit_id: null, item_name: "Cavo elettrico", item_tracking_mode: "fungible", supplier_id: null, supplier_name: null}]};
beforeEach(() => {state.camera = null; state.error = null; state.lookup.mockReset().mockResolvedValue(matched);});
async function search(code = "new") {
  fireEvent.click(screen.getByRole("button", {name: "Inserimento manuale"}));
  fireEvent.change(screen.getByLabelText("Codice manuale"), {target: {value: code}});
  fireEvent.click(screen.getByRole("button", {name: "Cerca codice manuale"}));
  return screen.findByLabelText(/Quantità/);
}
it("pausa e riprende la fotocamera mantenendo gli articoli raccolti", () => {
  render(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="carico" initialEntries={[entry()]} />);
  fireEvent.click(screen.getByRole("button", {name: "Pausa"}));
  expect(state.camera?.paused).toBe(true); expect(screen.getByText("Cavo elettrico", {selector: "p"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Riprendi"})); expect(state.camera?.paused).toBe(false);
  expect(screen.getByRole("button", {name: "Accendi torcia"})).toBeDisabled();
});
it("la conferma ODA rispetta il residuo e somma tutta la quantità scelta", async () => {
  const changed = vi.fn();
  render(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="oda_receive" confirmEachScan initialEntries={[entry()]} onEntriesChange={changed} allowedOdaItems={[{stockItemId: "s", odaItemId: "line", qtyPending: 5}]} />);
  const input = await search(); expect(state.camera?.paused).toBe(true);
  expect(screen.getByRole("button", {name: "Conferma (1)"})).toBeDisabled();
  fireEvent.change(input, {target: {value: "4"}}); expect(screen.getByRole("button", {name: "Conferma e aggiungi"})).toBeDisabled();
  fireEvent.change(input, {target: {value: "3"}}); fireEvent.click(screen.getByRole("button", {name: "Conferma e aggiungi"}));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({quantity: 5})]));
});
it("accetta la virgola decimale e non permette di superare un residuo frazionario", async () => {
  const changed = vi.fn();
  render(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="oda_receive" confirmEachScan initialEntries={[entry(0.25)]} onEntriesChange={changed} allowedOdaItems={[{stockItemId: "s", odaItemId: "line", qtyPending: 1}]} />);
  const input = await search(); expect(input).toHaveValue("0.75");
  fireEvent.change(input, {target: {value: "0,8"}}); expect(screen.getByRole("button", {name: "Conferma e aggiungi"})).toBeDisabled();
  fireEvent.change(input, {target: {value: "0,75"}}); fireEvent.click(screen.getByRole("button", {name: "Conferma e aggiungi"}));
  await waitFor(() => expect(changed).toHaveBeenLastCalledWith([expect.objectContaining({quantity: 1})]));
});
it("scarta il risultato di una ricerca arrivato dopo la chiusura", async () => {
  let resolve!: (value: LookupResult) => void; state.lookup.mockImplementation(() => new Promise<LookupResult>(done => {resolve = done;}));
  const changed = vi.fn(); const {rerender} = render(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="carico" onEntriesChange={changed} />);
  act(() => { void state.camera?.onScan("pending"); }); rerender(<BatchBarcodeScanner open={false} onOpenChange={vi.fn()} mode="carico" onEntriesChange={changed} />);
  await act(async () => resolve(matched)); expect(changed.mock.calls.every(([rows]) => rows.length === 0)).toBe(true);
});
it("mostra l’errore reale e permette di riprovare senza perdere le righe", () => {
  state.error = "Permesso fotocamera negato.";
  render(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="carico" initialEntries={[entry()]} />);
  act(() => state.camera?.onCameraError?.()); expect(screen.getByText(/Permesso fotocamera negato/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Riprova fotocamera"})); expect(state.camera?.manualMode).toBe(false);
  expect(screen.getByText("Cavo elettrico", {selector: "p"})).toBeTruthy();
});
it("lo scanner singolo consegna il codice una sola volta anche con due letture ravvicinate", () => {
  const scan = vi.fn(), close = vi.fn(); render(<BarcodeScanner open onOpenChange={close} onScan={scan} />);
  act(() => {state.camera?.onScan(" QR-1 "); state.camera?.onScan("QR-1");});
  expect(scan).toHaveBeenCalledExactlyOnceWith("QR-1"); expect(close).toHaveBeenCalledExactlyOnceWith(false);
});
it("a scanner chiuso non apre la fotocamera e al nuovo ingresso riparte senza una ricerca precedente", () => {
  const {rerender} = render(<BatchBarcodeScanner open={false} onOpenChange={vi.fn()} mode="lookup" />); expect(state.camera).toBeNull();
  rerender(<BatchBarcodeScanner open onOpenChange={vi.fn()} mode="lookup" />); expect(state.camera?.manualMode).toBe(false);
});

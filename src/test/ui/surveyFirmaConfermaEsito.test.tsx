import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const state = vi.hoisted(() => ({ save: vi.fn(), upload: vi.fn(), success: vi.fn(), error: vi.fn(), legacy: vi.fn(), signed: true }));
vi.mock("@/lib/api/surveys", () => ({ uploadMedia: state.upload, updateSurvey: state.save, getSurvey: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: () => ({ eq: async () => { state.legacy(); return { data: null as null, error: new Error("Salvataggio rifiutato") }; } }) }) } }));
vi.mock("sonner", () => ({ toast: { success: state.success, error: state.error } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { survey: { client_signature_at: state.signed ? "2026-01-01T12:00:00Z" : null, status: state.signed ? "signed" : "draft" } }, isLoading: false, isError: false, refetch: vi.fn() }) }));
import { SignaturePad } from "@/components/surveys/engine/SignaturePad";
import FirmaCliente from "@/pages/azienda/sopralluoghi/FirmaCliente";
beforeEach(() => {
  state.save.mockReset(); state.upload.mockReset(); state.success.mockClear(); state.error.mockClear(); state.legacy.mockClear(); state.signed = true;
  state.upload.mockResolvedValue({ url: "https://example.invalid/firma-simulata.png" });
  vi.stubGlobal("PointerEvent", MouseEvent);
  const context = { scale: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn() } as unknown as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => callback(new Blob(["firma solo simulata"], { type: "image/png" })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() {
  const confirmed = vi.fn();
  render(<SignaturePad surveyId="sopralluogo-demo" onConfirm={confirmed} />);
  const canvas = document.querySelector("canvas")!;
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10 });
  fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20 });
  fireEvent.pointerUp(canvas);
  return confirmed;
}
it("non annuncia una firma registrata se il server rifiuta il salvataggio e consente di riprovare", async () => {
  state.save.mockRejectedValueOnce(new Error("Salvataggio rifiutato")).mockResolvedValueOnce(undefined);
  const confirmed = setup();
  fireEvent.click(screen.getByRole("button", { name: "Conferma firma" }));
  await waitFor(() => expect(state.error).toHaveBeenCalled());
  expect(state.success).not.toHaveBeenCalled();
  expect(confirmed).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Conferma firma" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Conferma firma" }));
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
  expect(state.save).toHaveBeenCalledTimes(2);
  expect(state.success).toHaveBeenCalledTimes(1);
});
it("una conferma in corso impedisce invii duplicati e modifiche al nome", async () => {
  let resolve!: () => void;
  state.save.mockImplementation(() => new Promise<void>((r) => { resolve = r; }));
  const confirmed = setup();
  const button = screen.getByRole("button", { name: "Conferma firma" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(state.save).toHaveBeenCalledOnce());
  expect(state.upload).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "Nome firmatario (opzionale)" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Annulla firma" })).toBeDisabled();
  await act(async () => resolve());
  expect(confirmed).toHaveBeenCalledOnce();
});
it("un sopralluogo già firmato non riapre il riquadro per una nuova firma", () => {
  render(<MemoryRouter initialEntries={["/azienda/sopralluoghi/sopralluogo-demo/firma"]}><Routes><Route path="/azienda/sopralluoghi/:id/firma" element={<FirmaCliente />} /></Routes></MemoryRouter>);
  expect(screen.getByText("Sopralluogo già firmato")).toBeInTheDocument();
  expect(document.querySelector("canvas")).toBeNull();
  expect(state.upload).not.toHaveBeenCalled();
  expect(state.save).not.toHaveBeenCalled();
});

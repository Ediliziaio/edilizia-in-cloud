import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RilievoSuCarta } from "@/components/sopralluoghi/RilievoSuCarta";
import type { SurveyDetail } from "@/lib/api/surveys";

/** Il sopralluogo su carta: foto e PDF del foglio al posto del modulo (piano sopralluoghi, lotto 8). */
const s = vi.hoisted(() => ({ carica: vi.fn(), togli: vi.fn(), invalida: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: s.invalida }) }));
vi.mock("@/lib/commesse/riduciFoto", () => ({ riduciFile: async (f: File) => ({ file: f, ridotta: false, byteOriginali: f.size }) }));
vi.mock("@/lib/api/surveys", () => ({
  uploadMedia: async (...a: unknown[]) => { s.carica(...a); return {}; },
  deleteMedia: async (id: string) => { s.togli(id); },
}));
beforeEach(() => { s.carica.mockClear(); s.togli.mockClear(); s.invalida.mockClear(); });
afterEach(cleanup);

const detail = (media: unknown[] = []) => ({ survey: { id: "sop", company_id: "az" }, media } as unknown as SurveyDetail);

it("carica più fogli: il PDF come documento, la foto come foto, nel rilievo giusto", async () => {
  render(<RilievoSuCarta detail={detail()} canEdit />);
  expect(screen.getByText("Ancora nessun foglio caricato.")).toBeTruthy();
  const pdf = new File(["%PDF"], "rilievo.pdf", { type: "application/pdf" });
  const foto = new File(["x"], "foglio.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Carica foto o PDF del rilievo"), { target: { files: [pdf, foto] } });
  await waitFor(() => expect(s.carica).toHaveBeenCalledTimes(2));
  expect(s.carica.mock.calls[0]).toEqual(["sop", pdf, expect.objectContaining({ type: "document", expectedCompanyId: "az" })]);
  expect(s.carica.mock.calls[1]).toEqual(["sop", foto, expect.objectContaining({ type: "photo" })]);
  await waitFor(() => expect(s.invalida).toHaveBeenCalledWith({ queryKey: ["sopralluogo", "sop"] }));
});

it("un file che non è foto né PDF non parte", async () => {
  render(<RilievoSuCarta detail={detail()} canEdit />);
  fireEvent.change(screen.getByLabelText("Carica foto o PDF del rilievo"), { target: { files: [new File(["x"], "nota.docx", { type: "application/msword" })] } });
  await waitFor(() => expect(s.invalida).toHaveBeenCalled());
  expect(s.carica).not.toHaveBeenCalled();
});

it("mostra i fogli; in sola lettura niente caricamenti né eliminazioni", () => {
  const media = [{ id: "m1", type: "document", url: "https://x/a.pdf", filename: "rilievo.pdf" }, { id: "m2", type: "photo", url: "https://x/b.jpg", filename: "foglio.jpg" }, { id: "m3", type: "audio", url: "", filename: "nota.m4a" }];
  const { unmount } = render(<RilievoSuCarta detail={detail(media)} canEdit />);
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Togli rilievo.pdf" }));
  expect(s.togli).toHaveBeenCalledWith("m1");
  unmount();
  render(<RilievoSuCarta detail={detail(media)} canEdit={false} />);
  expect(screen.queryByLabelText("Fotografa il foglio")).toBeNull();
  expect(screen.queryByRole("button", { name: /Togli/ })).toBeNull();
});

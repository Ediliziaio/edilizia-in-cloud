import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FreePhotoUpload } from "@/components/surveys/engine/FreePhotoUpload";

const stato = vi.hoisted(() => ({ upload: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/api/surveys", () => ({ uploadMedia: stato.upload, deleteMedia: vi.fn(), validateSurveyPhoto: (): string | null => null }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/campo/lingua/LinguaCampo", () => ({ useT: () => (s: string) => s }));
vi.mock("sonner", () => ({ toast: { error: stato.error } }));
beforeEach(() => { vi.clearAllMocks(); stato.upload.mockResolvedValue({ id: "foto-1", filename: "uno.jpg" }); });

it("offre fotocamera e galleria separate e salva la foto nel sopralluogo autorizzato", async () => {
  const aggiunta = vi.fn();
  render(<FreePhotoUpload surveyId="rilievo-autorizzato" media={[]} onMediaAdded={aggiunta} />);
  expect(screen.getByLabelText("Scatta foto del sopralluogo")).toHaveAttribute("capture", "environment");
  expect(screen.getByLabelText("Scegli foto del sopralluogo")).not.toHaveAttribute("capture");
  fireEvent.change(screen.getByLabelText("Scegli foto del sopralluogo"), { target: { files: [new File(["foto"], "uno.jpg", { type: "image/jpeg" })] } });
  await waitFor(() => expect(stato.upload).toHaveBeenCalledWith("rilievo-autorizzato", expect.any(File), expect.objectContaining({ type: "photo" })));
  await waitFor(() => expect(aggiunta).toHaveBeenCalledOnce());
});

it("dopo una caduta di rete conserva solo le foto non ancora caricate e le ritenta senza duplicare le prime", async () => {
  stato.upload.mockResolvedValueOnce({ id: "foto-1" }).mockRejectedValueOnce(new Error("Rete interrotta"));
  render(<FreePhotoUpload surveyId="rilievo-autorizzato" media={[]} />);
  fireEvent.change(screen.getByLabelText("Scegli foto del sopralluogo"), { target: { files: [new File(["foto"], "uno.jpg"), new File(["foto"], "due.jpg")] } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("ancora da inviare"));
  expect(screen.getByText("due.jpg")).toBeVisible();
  expect(screen.getByRole("button", { name: "Scatta foto" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Riprova caricamento foto" }));
  await waitFor(() => expect(stato.upload).toHaveBeenCalledTimes(3));
  expect(stato.upload.mock.calls[2][1].name).toBe("due.jpg");
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

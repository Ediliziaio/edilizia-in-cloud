import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect } from "vitest";
import { SurveyMediaGallery } from "@/components/sopralluoghi/SurveyMediaGallery";
import { surveyMedia } from "../fixtures/surveyDetail";
afterEach(cleanup);
describe("Foto contestuali del sopralluogo", () => {
  it("apre ingrandimento, cambia foto e ripristina lo zoom", () => {
    render(
      <SurveyMediaGallery
        media={[
          surveyMedia({ id: "a", filename: "Fronte.jpg" }),
          surveyMedia({
            id: "b",
            filename: "Retro.jpg",
            url: "https://example.invalid/retro.jpg",
          }),
        ]}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Ingrandisci Fronte.jpg" }),
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Fronte.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Ingrandisci foto" }));
    expect(screen.getByText("150%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Foto successiva" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Retro.jpg");
    expect(screen.getByText("100%")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Chiudi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("non mostra foto inventate né link non sicuri", () => {
    render(
      <SurveyMediaGallery
        media={[surveyMedia({ url: "javascript:alert(1)" })]}
      />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "File non disponibile",
    );
  });
  it("se la foto non si carica lo indica senza eliminare il riferimento", () => {
    render(<SurveyMediaGallery media={[surveyMedia()]} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText(/Immagine non disponibile/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Apri originale" })).toBeVisible();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TemplateUploader } from "@/components/documenti/TemplateUploader";

afterEach(cleanup);

describe("selezione documento template", () => {
  it("espone la selezione come pulsante e rifiuta file non supportati senza inviarli", () => {
    const onUpload = vi.fn();
    render(<TemplateUploader onUpload={onUpload} />);
    const input = screen.getByLabelText("Documento template");
    const choose = screen.getByRole("button", { name: "Seleziona documento template" });
    const open = vi.spyOn(input, "click");
    fireEvent.click(choose);
    expect(open).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { files: [new File(["demo"], "esempio.txt")] } });
    expect(screen.getByRole("alert")).toHaveTextContent("Solo file PDF e DOCX");
    expect(screen.getByRole("button", { name: "Carica template" })).toBeDisabled();
    expect(onUpload).not.toHaveBeenCalled();
  });

  it("consente di rimuovere e riselezionare il documento senza annidare pulsanti", () => {
    const onUpload = vi.fn();
    render(<TemplateUploader onUpload={onUpload} />);
    const input = screen.getByLabelText("Documento template") as HTMLInputElement;
    const file = new File(["demo"], "modello-demo.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByLabelText("Nome template *")).toHaveValue("modello-demo");
    const remove = screen.getByRole("button", { name: "Rimuovi documento template modello-demo.pdf" });
    expect(remove.parentElement?.closest("button")).toBeNull();
    fireEvent.click(remove);
    expect(input.value).toBe("");
    expect(screen.getByRole("button", { name: "Carica template" })).toBeDisabled();
    fireEvent.change(input, { target: { files: [file] } });
    expect(screen.getByRole("button", { name: "Cambia documento template" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Carica template" })).toBeEnabled();
    expect(onUpload).not.toHaveBeenCalled();
  });
});

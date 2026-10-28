import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomFieldValueEditor } from "@/components/shared/CustomFieldValueEditor";
import { CustomFieldInput } from "@/components/shared/CustomFieldInput";
afterEach(cleanup);

describe("editor custom tipizzato", () => {
  it("multiselect mantiene entrambe le scelte, inclusa un'opzione storica non più nel catalogo", () => {
    const change = vi.fn();
    render(<CustomFieldInput fieldId="m" label="Finiture" type="multiselect" options={["A", "B"]} value='["A","Vecchia"]' onChange={change} />);
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(3); fireEvent.click(boxes[1]);
    expect(change).toHaveBeenLastCalledWith(["A", "Vecchia", "B"]);
  });
  it("non conferma prima del server, blocca il doppio clic e conserva la bozza se fallisce", async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn(() => new Promise((_, r) => { reject = r; }));
    render(<CustomFieldValueEditor fieldId="t" label="Note" type="text" value="prima" onSave={save} />);
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "dopo" } });
    fireEvent.click(screen.getByRole("button", { name: "Salva campo" }));
    expect(screen.queryByText("Campo salvato")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvataggio…" })); expect(save).toHaveBeenCalledTimes(1);
    reject(new Error("rete"));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect((screen.getByLabelText("Note") as HTMLInputElement).value).toBe("dopo");
    expect(screen.queryByText("Campo salvato")).toBeNull();
  });
  it("si/no falso viene salvato come false e il messaggio arriva solo dopo il successo", async () => {
    const save = vi.fn(async () => undefined);
    render(<CustomFieldValueEditor fieldId="b" label="Accesso" type="checkbox" value="true" onSave={save} />);
    fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Salva campo" }));
    await screen.findByText("Campo salvato"); expect(save).toHaveBeenCalledWith("false");
    expect(screen.queryByRole("button", { name: "Salva campo" })).toBeNull();
  });
  it("sola lettura e file non offrono azioni di modifica", () => {
    const save = vi.fn();
    render(<><CustomFieldValueEditor fieldId="a" label="Nota" type="text" value="testo" disabled onSave={save} /><CustomFieldValueEditor fieldId="f" label="Allegato" type="file" value="file privato" onSave={save} /></>);
    expect((screen.getByLabelText("Nota") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button")).toBeNull(); expect(screen.queryByRole("link")).toBeNull(); expect(save).not.toHaveBeenCalled();
  });
  it("rifiuta una percentuale fuori intervallo senza chiamare il salvataggio", async () => {
    const save = vi.fn(); render(<CustomFieldValueEditor fieldId="p" label="Percentuale" type="percent" value="10" onSave={save} />);
    fireEvent.change(screen.getByLabelText("Percentuale"), { target: { value: "101" } }); fireEvent.click(screen.getByRole("button", { name: "Salva campo" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("tra 0 e 100")); expect(save).not.toHaveBeenCalled();
  });
  it("un aggiornamento del server aggiorna un campo pulito senza cicli di rendering", () => {
    const save = vi.fn();
    const view = render(<CustomFieldValueEditor fieldId="t" label="Dato" type="text" value="prima" onSave={save} />);
    view.rerender(<CustomFieldValueEditor fieldId="t" label="Dato" type="text" value="aggiornato" onSave={save} />);
    expect((screen.getByLabelText("Dato") as HTMLInputElement).value).toBe("aggiornato");
    expect(screen.queryByRole("button", { name: "Salva campo" })).toBeNull();
  });
  it("un refresh non sovrascrive una modifica ancora da salvare", () => {
    const save = vi.fn();
    const view = render(<CustomFieldValueEditor fieldId="t" label="Dato" type="text" value="prima" onSave={save} />);
    fireEvent.change(screen.getByLabelText("Dato"), { target: { value: "bozza" } });
    view.rerender(<CustomFieldValueEditor fieldId="t" label="Dato" type="text" value="arrivato dal server" onSave={save} />);
    expect((screen.getByLabelText("Dato") as HTMLInputElement).value).toBe("bozza"); expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Annulla modifica" }));
    expect((screen.getByLabelText("Dato") as HTMLInputElement).value).toBe("arrivato dal server");
  });
});

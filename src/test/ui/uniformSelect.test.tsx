import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { UniformSelect } from "@/components/ui/uniform-select";

beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);
function choose(option: string) {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", {name:option}));
}
describe("menu uniformi compatibili con i form", () => {
  it("conserva il vero evento select, il nome del campo e il valore vuoto", () => {
    const received = vi.fn();
    function Form() { const [value,setValue] = useState(""); return <form aria-label="Modulo"><label htmlFor="tipo">Tipo</label><UniformSelect id="tipo" name="tipo" value={value} onChange={e => { received(e.target.name,e.target.value,e.currentTarget.tagName);setValue(e.target.value); }}><option value="">Tutti</option><option value="a">Articoli</option></UniformSelect></form>; }
    render(<Form />);
    expect(screen.getByRole("combobox",{name:"Tipo"})).toHaveTextContent("Tutti");
    choose("Articoli"); expect(received).toHaveBeenLastCalledWith("tipo","a","SELECT");
    expect(new FormData(screen.getByRole("form") as HTMLFormElement).get("tipo")).toBe("a");
    choose("Tutti"); expect(received).toHaveBeenLastCalledWith("tipo","","SELECT");
  });
  it("aggiorna opzioni asincrone e valori senza perdere selezioni disabilitate", () => {
    const {rerender} = render(<UniformSelect aria-label="Fornitore" value="b" onChange={() => {}}><option value="">Caricamento</option></UniformSelect>);
    rerender(<UniformSelect aria-label="Fornitore" value="b" onChange={() => {}}><option value="a">Alfa</option><option value="b" disabled>Beta</option></UniformSelect>);
    expect(screen.getByRole("combobox")).toHaveTextContent("Beta");
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option",{name:"Beta"})).toHaveAttribute("aria-disabled","true");
  });
  it("mantiene gruppi disabilitati e voci con lo stesso valore", () => {
    render(<UniformSelect aria-label="Gruppi" defaultValue="a"><optgroup label="Non disponibili" disabled><option value="a">Alfa</option></optgroup><optgroup label="Attivi"><option value="b">Beta</option><option value="b">Beta alternativa</option></optgroup></UniformSelect>);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option",{name:"Alfa"})).toHaveAttribute("aria-disabled","true");
    expect(screen.getByRole("option",{name:"Beta alternativa"})).toBeInTheDocument();
  });
  it("mantiene la validazione required e porta il focus al menu visibile", async () => {
    render(<form aria-label="Modulo"><UniformSelect aria-label="Obbligatorio" name="campo" required defaultValue=""><option value="">Scegli</option><option value="x">Scelta</option></UniformSelect></form>);
    act(() => { expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(false); });
    expect(screen.getByRole("combobox")).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid","true"));
    choose("Scelta"); expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(true);
  });
  it("rispetta disabled e disabled ereditato dal fieldset", () => {
    render(<fieldset disabled><UniformSelect aria-label="Protetto" defaultValue="a"><option value="a">Alfa</option></UniformSelect></fieldset>);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
  it("ripristina la selezione non controllata al reset del form", async () => {
    render(<form aria-label="Modulo"><UniformSelect aria-label="Tipo" name="tipo" defaultValue="a"><option value="a">Alfa</option><option value="b">Beta</option></UniformSelect></form>);
    choose("Beta"); expect(screen.getByRole("combobox")).toHaveTextContent("Beta");
    (screen.getByRole("form") as HTMLFormElement).reset();
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Alfa"));
  });
});

it("un’etichetta avvolgente identifica un solo controllo visibile", () => {
  render(<label>Scenario da importare<UniformSelect defaultValue="a"><option value="a">Base</option><option value="b">Alternativa</option></UniformSelect></label>);
  expect(screen.getAllByLabelText("Scenario da importare")).toHaveLength(1);
  expect(screen.getByLabelText("Scenario da importare")).toBe(screen.getByRole("combobox"));
});

it("scegliere una voce non attiva il click della riga o scheda che contiene il menu", () => {
  const openRow = vi.fn();
  render(<div onClick={openRow}><UniformSelect aria-label="Stato" defaultValue="a"><option value="a">Aperto</option><option value="b">Chiuso</option></UniformSelect></div>);
  choose("Chiuso");
  expect(screen.getByRole("combobox")).toHaveTextContent("Chiuso");
  expect(openRow).not.toHaveBeenCalled();
});

it("aprire il modulo e caricare le opzioni non cancella una selezione già salvata", async () => {
  const changed = vi.fn();
  const {rerender} = render(<form><UniformSelect aria-label="Commessa" value="c1" onChange={changed}><option value="">Caricamento</option></UniformSelect></form>);
  rerender(<form><UniformSelect aria-label="Commessa" value="c1" onChange={changed}><option value="">Scegli</option><option value="c1">Commessa esistente</option></UniformSelect></form>);
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Commessa esistente"));
  expect(changed).not.toHaveBeenCalled();
});

it("supporta i gestori che aggiornano il form con una funzione", () => {
  function Form() {
    const [draft,setDraft] = useState({value:"a",edited:false});
    return <form><UniformSelect aria-label="Tipo" value={draft.value} onChange={event => {setDraft(previous => ({...previous,edited:true}));setDraft(previous => ({...previous,value:event.target.value}));}}><option value="a">Alfa</option><option value="b">Beta</option></UniformSelect><output>{draft.value}:{String(draft.edited)}</output></form>;
  }
  render(<Form />); choose("Beta"); expect(screen.getByText("b:true")).toBeInTheDocument();
});

it("il focus del menu non chiude un editor che salva o annulla su blur", () => {
  const blur = vi.fn(); const changed = vi.fn();
  render(<><UniformSelect aria-label="Responsabile" autoFocus defaultValue="a" onBlur={blur} onChange={changed}><option value="a">Alfa</option><option value="b">Beta</option></UniformSelect><button>Altro campo</button></>);
  expect(screen.getByRole("combobox")).toHaveFocus();
  choose("Beta");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(blur).not.toHaveBeenCalled();
  fireEvent.blur(screen.getByRole("combobox"),{relatedTarget:screen.getByRole("button",{name:"Altro campo"})});
  expect(blur).toHaveBeenCalledTimes(1);
});

it("si può cambiare scelta digitando con il menu chiuso", async () => {
  render(<UniformSelect aria-label="Tipo" defaultValue="a"><option value="a">Alfa</option><option value="b">Beta</option></UniformSelect>);
  fireEvent.keyDown(screen.getByRole("combobox"), {key:"b"});
  await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("b"));
});

import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
vi.mock("@/hooks/useWarehouses", () => ({
  useWarehouses: () => ({
    warehouses: [
      {
        id: "m",
        name: "Magazzino principale",
        address: "Via Roma 1",
        postal_code: "20100",
        city: "Milano",
        province: "MI",
        contact_name: "Marco",
        contact_phone: "02111",
        is_default: true,
      },
    ],
    isLoading: false,
    error: null as Error | null,
  }),
}));
import { DestinazioneDocumento } from "@/components/documentiOperativi/DestinazioneDocumento";
import type { DocumentoOperativo } from "@/lib/documentiOperativi/modello";
const doc: DocumentoOperativo = {
  tipo: "materiali",
  numero: "ODA-1",
  fornitoreId: "f",
  destinatario: { nome: "Fornitore" },
  righe: [],
  ritiroIndirizzo: "Deposito fornitore, Via Verdi 9",
  ritiroNote: "Ritiro al mattino",
};
afterEach(cleanup);
describe("Destinazione del documento", () => {
  it("compila il magazzino predefinito con indirizzo e referente", () => {
    const patch = vi.fn();
    render(
      <DestinazioneDocumento
        documento={doc}
        commessaId={null}
        onChange={patch}
      />,
    );
    expect(patch).toHaveBeenCalledWith({
      magazzinoId: "m",
      luogo: "Magazzino principale, Via Roma 1, 20100, Milano, MI",
      referenteConsegna: "Marco · 02111",
    });
  });
  it("non sostituisce un indirizzo già definito nell'ordine", () => {
    const patch = vi.fn();
    render(
      <DestinazioneDocumento
        documento={{
          ...doc,
          luogo: "Cantiere scelto",
          destinazioneTipo: "altro",
        }}
        commessaId={null}
        onChange={patch}
      />,
    );
    expect(patch).not.toHaveBeenCalled();
  });
  it("il ritiro usa l'indirizzo del singolo fornitore e non il nostro magazzino", () => {
    const patch = vi.fn();
    render(
      <DestinazioneDocumento
        documento={{ ...doc, destinazioneTipo: "altro" }}
        commessaId={null}
        onChange={patch}
      />,
    );
    fireEvent.change(screen.getByLabelText("Dove consegnare / ritirare"), {
      target: { value: "ritiro" },
    });
    expect(patch).toHaveBeenLastCalledWith({
      destinazioneTipo: "ritiro",
      magazzinoId: null,
      luogo: "Deposito fornitore, Via Verdi 9",
      referenteConsegna: "",
      noteConsegna: "Ritiro al mattino",
    });
  });
});

it("svuotare la scelta del magazzino elimina anche l'indirizzo precedente",()=>{const change=vi.fn();render(<DestinazioneDocumento documento={{...doc,destinazioneTipo:"magazzino",magazzinoId:"m",luogo:"Indirizzo precedente"}} commessaId={null} onChange={change}/>);change.mockClear();fireEvent.change(screen.getByLabelText("Magazzino di destinazione"),{target:{value:""}});expect(change).toHaveBeenCalledWith({magazzinoId:null,luogo:"",referenteConsegna:"",noteConsegna:""});});

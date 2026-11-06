import "@testing-library/jest-dom/vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { PurchaseOrderItem } from "@/hooks/usePurchaseOrders";
vi.mock("@/components/orders/ArticleCombobox", () => ({
  ArticleCombobox: ({
    onValueChange,
  }: {
    onValueChange: (v: string) => void;
  }) => (
    <button onClick={() => onValueChange("Nuovo materiale su richiesta")}>
      Scrivi nuovo articolo
    </button>
  ),
}));
import { PurchaseOrderItemRow } from "@/components/orders/PurchaseOrderItemRow";
const item = {
  id: "i",
  description: "Materiale",
  quantity: 40,
  unit_price: 95,
  discount_percent: 0,
  vat_rate: 10,
  unit_of_measure: "pz",
  quantity_received: 0,
  line_total: 3800,
  price_pending: false,
} as PurchaseOrderItem;
const apri = (row = item) => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <table>
      <tbody>
        <PurchaseOrderItemRow
          item={row}
          isEditable
          showReceived={false}
          onUpdate={onUpdate}
          onDelete={() => {}}
        />
      </tbody>
    </table>,
  );
  return onUpdate;
};
afterEach(cleanup);
describe("Inserimento articoli dell’ordine", () => {
  it("un articolo nuovo non conserva il prezzo di quello sostituito", async () => {
    const salva = apri();
    fireEvent.click(
      screen.getByRole("button", { name: "Scrivi nuovo articolo" }),
    );
    await waitFor(() =>
      expect(salva).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Nuovo materiale su richiesta",
          unit_price: 0,
          price_pending: true,
          article_template_id: null,
        }),
      ),
    );
    expect(screen.getByLabelText("Prezzo di acquisto")).toHaveValue(null);
    expect(screen.getByLabelText("Prezzo da confermare")).toBeChecked();
    expect(screen.queryByText(/3.800/)).not.toBeInTheDocument();
  });
  it("svuotare il prezzo salva uno stato in attesa senza toccare la quantità", async () => {
    const salva = apri();
    fireEvent.change(screen.getByLabelText("Prezzo di acquisto"), {
      target: { value: "" },
    });
    fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));
    await waitFor(() =>
      expect(salva).toHaveBeenCalledWith({
        unit_price: 0,
        price_pending: true,
      }),
    );
  });
  it("il prezzo zero scritto esplicitamente resta diverso da quello da confermare", async () => {
    const salva = apri({ ...item, unit_price: 0, price_pending: true });
    fireEvent.change(screen.getByLabelText("Prezzo di acquisto"), {
      target: { value: "0" },
    });
    fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));
    await waitFor(() =>
      expect(salva).toHaveBeenCalledWith({
        unit_price: 0,
        price_pending: false,
      }),
    );
  });
  it("la quantità vuota viene ripristinata senza inviare un aggiornamento invalido", () => {
    const salva = apri();
    fireEvent.change(screen.getByLabelText("Quantità"), {
      target: { value: "" },
    });
    fireEvent.blur(screen.getByLabelText("Quantità"));
    expect(salva).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Quantità")).toHaveValue(40);
  });
  it("salva il prezzo senza includere una quantità rimasta vuota nel form", async () => {
    const salva = apri();
    fireEvent.change(screen.getByLabelText("Quantità"), {
      target: { value: "" },
    });
    fireEvent.change(screen.getByLabelText("Prezzo di acquisto"), {
      target: { value: "18" },
    });
    fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));
    await waitFor(() =>
      expect(salva).toHaveBeenCalledWith({
        unit_price: 18,
        price_pending: false,
      }),
    );
  });
});

it("la creazione manuale conserva IVA zero",async()=>{const save=apri({...item,vat_rate:0});fireEvent.click(screen.getByRole("button",{name:"Scrivi nuovo articolo"}));await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({vat_rate:0})));});

it("dati aggiornati dal server si vedono senza perdere ciò che è ancora in modifica",async()=>{
 const save=vi.fn().mockResolvedValue(undefined);const draw=(value:PurchaseOrderItem)=><table><tbody><PurchaseOrderItemRow item={value} isEditable showReceived={false} onUpdate={save} onDelete={()=>{}}/></tbody></table>;
 const v=render(draw(item));fireEvent.change(screen.getByLabelText("Quantità"),{target:{value:"9"}});
 v.rerender(draw({...item,quantity:50,unit_price:18}));
 await waitFor(()=>expect(screen.getByLabelText("Prezzo di acquisto")).toHaveValue(18));expect(screen.getByLabelText("Quantità")).toHaveValue(9);
});

it("le modifiche veloci del prezzo si salvano in ordine e l'indicatore resta fino all'ultima",async()=>{
 let first!:()=>void,second!:()=>void;const save=vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{first=r;})).mockImplementationOnce(()=>new Promise<void>(r=>{second=r;}));
 render(<table><tbody><PurchaseOrderItemRow item={item} isEditable showReceived={false} onUpdate={save} onDelete={()=>{}}/></tbody></table>);
 fireEvent.change(screen.getByLabelText("Prezzo di acquisto"),{target:{value:"18"}});fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByLabelText("Prezzo di acquisto"),{target:{value:"20"}});fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));expect(save).toHaveBeenCalledTimes(1);first();await waitFor(()=>expect(save).toHaveBeenCalledTimes(2));expect(screen.getByRole("status")).toHaveTextContent("Salvataggio");expect(save.mock.calls.map(c=>c[0].unit_price)).toEqual([18,20]);second();await waitFor(()=>expect(screen.queryByRole("status")).not.toBeInTheDocument());
});

describe("Totali di una riga bloccata", () => {
  it("mostra il totale salvato quando la riga diventa non modificabile", () => {
    const props = {item, isEditable:true, showReceived:false, onUpdate:vi.fn(), onDelete:vi.fn()};
    const view = render(<table><tbody><PurchaseOrderItemRow {...props}/></tbody></table>);
    fireEvent.change(screen.getByLabelText("Quantità"),{target:{value:"2"}});
    view.rerender(<table><tbody><PurchaseOrderItemRow {...props} isEditable={false} item={{...item,line_total:3800}}/></tbody></table>);
    expect(screen.getByText(/3\.800,00/)).toBeInTheDocument();
  });
});

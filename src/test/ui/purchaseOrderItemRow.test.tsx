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
import { setupRadixMenus, scegliNelMenu } from "@/test/helpers/radixMenus";
setupRadixMenus();
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


describe("Modifica di un ordine parzialmente ricevuto", () => {
  it("non salva quantità inferiori alla merce già ricevuta", () => {
    const save = apri({ ...item, quantity_received: 12 });
    fireEvent.change(screen.getByLabelText("Quantità"), {target: {value: "11"}});
    fireEvent.blur(screen.getByLabelText("Quantità"));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Quantità")).toHaveValue(40);
  });
  it("permette di correggere quantità e prezzo preservando la ricezione", async () => {
    const save = apri({ ...item, quantity_received: 12 });
    fireEvent.change(screen.getByLabelText("Quantità"), {target: {value: "50"}});
    fireEvent.blur(screen.getByLabelText("Quantità"));
    await waitFor(() => expect(save).toHaveBeenCalledWith({quantity: 50}));
    fireEvent.change(screen.getByLabelText("Prezzo di acquisto"), {target: {value: "18"}});
    fireEvent.blur(screen.getByLabelText("Prezzo di acquisto"));
    await waitFor(() => expect(save).toHaveBeenCalledWith({unit_price: 18, price_pending: false}));
    expect(save.mock.calls.every(([patch]) => !("quantity_received" in patch))).toBe(true);
  });
  it("protegge articolo, unità di misura ed eliminazione dopo la prima ricezione", () => {
    apri({ ...item, quantity_received: 12 });
    expect(screen.queryByRole("button", {name: "Scrivi nuovo articolo"})).not.toBeInTheDocument();
    expect(screen.getByLabelText("Unità di misura")).toBeDisabled();
    expect(screen.getByRole("button", {name: "Rimuovi Materiale"})).toBeDisabled();
  });
});

describe("Unità e IVA si scelgono, non si scrivono (09/11/2026)", () => {
  it("l'unità è un menu con le unità vere, e salva la sigla", async () => {
    const salva = apri();
    await scegliNelMenu("Unità di misura", /^mq/);
    await waitFor(() =>
      expect(salva).toHaveBeenCalledWith({ unit_of_measure: "mq" }),
    );
  });

  it("l'IVA è un menu: lo zero dice perché, ed è l'inversione contabile", async () => {
    const salva = apri();
    const menu = screen.getByRole("combobox", { name: "IVA percentuale" });
    // La casella mostra la sola aliquota: nella colonna non c'è spazio.
    expect(menu).toHaveTextContent("10%");
    await scegliNelMenu("IVA percentuale", /inversione contabile/);
    await waitFor(() => expect(salva).toHaveBeenCalledWith({ vat_rate: 0 }));
  });

  it("«22,00» salvata prima si legge «22%», senza voci doppie nel menu", async () => {
    apri({ ...item, vat_rate: 22 } as PurchaseOrderItem);
    expect(screen.getByRole("combobox", { name: "IVA percentuale" }))
      .toHaveTextContent("22%");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "IVA percentuale" }), { key: "ArrowDown" });
    expect(await screen.findAllByRole("option", { name: /^22%/ })).toHaveLength(1);
  });

  it("un'unità vecchia fuori elenco non si perde e non cambia da sola", async () => {
    const salva = apri({ ...item, unit_of_measure: "bancale" } as PurchaseOrderItem);
    const menu = screen.getByRole("combobox", { name: "Unità di misura" });
    expect(menu).toHaveTextContent("bancale");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(await screen.findByRole("option", { name: /bancale/ })).toBeInTheDocument();
    expect(salva).not.toHaveBeenCalled();
  });

  it("«ML» scritto male si legge «ml», e non si riscrive da sé", () => {
    const salva = apri({ ...item, unit_of_measure: "ML" } as PurchaseOrderItem);
    expect(screen.getByRole("combobox", { name: "Unità di misura" }))
      .toHaveTextContent("ml");
    expect(salva).not.toHaveBeenCalled();
  });

  it("la riga già ricevuta non lascia cambiare l'unità", () => {
    apri({ ...item, quantity_received: 5 } as PurchaseOrderItem);
    expect(screen.getByRole("combobox", { name: "Unità di misura" })).toBeDisabled();
  });
});

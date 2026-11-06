import { describe, it, expect } from "vitest";
import { margineVoce } from "@/lib/marginalita/margineVoce";
const base = { quantity: 2, unit_price: 100, purchase_price: null, standard_cost: null };
describe("Stime di margine per voce", () => {
  it("un costo mancante non genera un margine del 100%", () => {
    expect(margineVoce(base)).toEqual({ricavo:200,costo:null,margineVoce:null,margineVocePerc:null});
  });
  it("un costo zero esplicito prevale sul costo standard", () => {
    expect(margineVoce({...base,purchase_price:0,standard_cost:30})).toEqual({ricavo:200,costo:0,margineVoce:200,margineVocePerc:100});
  });
  it("usa lo standard quando il costo d'acquisto manca", () => {
    expect(margineVoce({...base,standard_cost:40}).margineVocePerc).toBe(60);
  });
  it("una quantità zero non diventa una unità", () => {
    expect(margineVoce({...base,quantity:0,standard_cost:40})).toEqual({ricavo:0,costo:0,margineVoce:0,margineVocePerc:null});
  });
  it("il ricavo mancante e i numeri non finiti rimangono sconosciuti", () => {
    expect(margineVoce({...base,unit_price:null,standard_cost:40}).margineVoce).toBeNull();
    expect(margineVoce({...base,quantity:NaN}).ricavo).toBeNull();
  });
  it("una perdita resta negativa", () => {
    expect(margineVoce({...base,purchase_price:150})).toEqual({ricavo:200,costo:300,margineVoce:-100,margineVocePerc:-50});
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import WarehouseFlow from "@/components/landing/WarehouseFlow";
import { warehouseExample, warehouseExampleCost } from "@/lib/marketing/warehouseFlow";

let host: HTMLDivElement;
let root: Root;
function mount() { host=document.createElement("div");document.body.append(host);root=createRoot(host);act(()=>root.render(<WarehouseFlow />)); }
afterEach(()=>{if(root) act(()=>root.unmount());host?.remove();});
const group=(label:string)=>host.querySelector(`[aria-label="${label}"]`)!;
const stage=()=>host.querySelector("#warehouse-stage")!;
const text=()=>host.textContent!.replace(/\s+/g," ");

describe("Materiale, bolla e costo di commessa",()=>{
  it("keeps the price missing until the office checks the allocation, without duplicating the invoice",()=>{
    mount();
    const steps=group("Passaggi del percorso").querySelectorAll<HTMLButtonElement>("button");
    expect(steps).toHaveLength(5);
    for(let i=0;i<4;i++){act(()=>steps[i].click());expect(warehouseExampleCost(i)).toBeNull();expect(text()).toContain("Da completare");}
    act(()=>steps[4].click());
    expect(warehouseExampleCost(4)).toBe(120000);
    expect(warehouseExampleCost(4)!+warehouseExample.otherSiteCents).toBe(warehouseExample.invoiceCents);
    expect(stage().textContent).toContain("non diventano tre acquisti");
    expect(text()).toContain("1.200 € + 2.400 € = 3.600 €");
    expect(host.querySelectorAll('[aria-label="Passaggi del percorso"] [aria-pressed="true"]')).toHaveLength(1);
  });
  it("resets the example when its origin changes and does not invent a new invoice for a warehouse withdrawal",()=>{
    mount();
    const scenarios=group("Scegli la provenienza del materiale").querySelectorAll<HTMLButtonElement>("button");
    const steps=()=>group("Passaggi del percorso").querySelectorAll<HTMLButtonElement>("button");
    act(()=>steps()[4].click());
    act(()=>scenarios[2].click());
    expect(stage().textContent).toContain("Passaggio 1 di 5");
    expect(text()).toContain("Non prevista");
    expect(text()).toContain("Da completare");
    act(()=>steps()[4].click());
    expect(stage().textContent).toContain("Nessuna nuova fattura");
    expect(text()).toContain("non simuliamo un secondo acquisto");
    expect(text()).not.toContain("Totale fattura verificata");
  });
  it("explains the worker/office handoff and supports bounded previous/next navigation",()=>{
    mount();
    const scenarios=group("Scegli la provenienza del materiale").querySelectorAll<HTMLButtonElement>("button");
    act(()=>scenarios[1].click());
    const previous=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Indietro")!;
    const next=[...host.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Avanti")!;
    expect(previous.disabled).toBe(true);
    act(()=>next.click());
    expect(stage().textContent).toContain("L’ufficio verifica la registrazione");
    expect(previous.disabled).toBe(false);
    for(let i=0;i<3;i++) act(()=>next.click());
    expect(next.disabled).toBe(true);
    expect(stage().textContent).toContain("non dimostra un abbinamento automatico senza controllo");
  });
});

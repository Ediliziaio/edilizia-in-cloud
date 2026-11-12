import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ImportaBusinessPlan } from "@/components/orders/generali/piano/ImportaBusinessPlan";
import { leggiFileBusinessPlan } from "@/lib/orders/generali/businessPlanImport";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

vi.mock("@/lib/orders/generali/businessPlanImport", async () => {
  const originale = await vi.importActual<typeof import("@/lib/orders/generali/businessPlanImport")>(
    "@/lib/orders/generali/businessPlanImport",
  );
  return {
    ...originale,
    leggiFileBusinessPlan: vi.fn(async () => [
      {
        nome: "Realistico",
        righe: [
          { numero: 1, celle: ["Descrizione costi", "Costi presunti"] },
          { numero: 2, celle: ["Acquisto terreno", 400000] },
          { numero: 3, celle: ["Costruzione", null] },
          { numero: 4, celle: ["INCASSI"] },
          { numero: 5, celle: ["Unità 1", 800000] },
        ],
      },
      {
        nome: "Best",
        righe: [
          { numero: 1, celle: ["Voce", "Importo"] },
          { numero: 2, celle: ["Terreno", 350000] },
        ],
      },
    ]),
  };
});
afterEach(cleanup);
async function carica() {
  const file = new File(["xlsx"], "Piano.xlsx");
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
  fireEvent.change(screen.getByLabelText("File business plan"), { target: { files: [file] } });
  await screen.findByLabelText("Importo previsto riga 3");
}

describe("Anteprima del business plan", () => {
  it.each([[0,"Appalto",4,90000,150000],[1,"Sviluppo",6,370000,500000],[2,"Compravendita",4,230000,300000]] as const)("porta il file reale alla conferma del foglio %s %s",async(indice,nome,quante,costi,ricavi)=>{
    const originale=await vi.importActual<typeof import("@/lib/orders/generali/businessPlanImport")>("@/lib/orders/generali/businessPlanImport");
    vi.mocked(leggiFileBusinessPlan).mockImplementationOnce(originale.leggiFileBusinessPlan);
    const dati=await readFile("src/test/fixtures/importazioni/piani-tre-tipologie.xlsx");
    const bytes=new Uint8Array(dati).buffer;
    const file=new File([bytes],"piani-demo.xlsx",{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    Object.defineProperty(file,"arrayBuffer",{value:async()=>bytes});
    const importa=vi.fn();render(<ImportaBusinessPlan onImporta={importa} onAnnulla={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("File business plan"),{target:{files:[file]}});
    const scenario=await screen.findByLabelText("Scenario da importare");
    fireEvent.change(scenario,{target:{value:String(indice)}});
    expect(scenario).toHaveDisplayValue(nome);
    fireEvent.click(screen.getByLabelText(/Ho verificato scenario/));
    fireEvent.click(screen.getByRole("button",{name:`Aggiungi ${quante} voci alla bozza`}));
    expect(importa).toHaveBeenCalledOnce();
    const [voci,origine]=importa.mock.calls[0];
    expect(voci.filter((v:{tipo:string})=>v.tipo==="costo").reduce((n:number,v:{importo:number})=>n+v.importo,0)).toBe(costi);
    expect(voci.filter((v:{tipo:string})=>v.tipo==="ricavo").reduce((n:number,v:{importo:number})=>n+v.importo,0)).toBe(ricavi);
    expect(voci.every((v:{mese:string|null;figliaId?:string})=>v.mese===null&&!v.figliaId)).toBe(true);
    expect(origine).toMatchObject({file,hash:createHash("sha256").update(dati).digest("hex"),foglio:nome});
    if(nome==="Sviluppo") expect(voci.find((v:{descrizione:string})=>v.descrizione==="Imprevisti").nota).toContain("[EIC:DA_STIMARE]");
  });
  it("conserva le stime mancanti nella bozza con un blocco persistente dell'approvazione", async () => {
    const importa = vi.fn();
    render(<ImportaBusinessPlan onImporta={importa} onAnnulla={vi.fn()} />);
    await carica();
    fireEvent.click(screen.getByLabelText(/Ho verificato scenario/));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi 3 voci alla bozza" }));
    expect(
      importa.mock.calls[0][0].find((v: { descrizione: string }) => v.descrizione === "Costruzione").nota,
    ).toContain("[EIC:DA_STIMARE]");
    expect(importa.mock.calls[0][1]).toMatchObject({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      foglio: "Realistico",
    });
  });
  it("permette di completare una stima, mantenere lo zero e importare solo dopo il controllo", async () => {
    const importa = vi.fn();
    render(<ImportaBusinessPlan onImporta={importa} onAnnulla={vi.fn()} />);
    await carica();
    expect(importa).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Importa riga 3")).toBeDisabled();
    expect(screen.getByLabelText("Importa riga 3")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Importo previsto riga 3"), { target: { value: "0" } });
    expect(screen.getByLabelText("Importa riga 3")).toBeChecked();
    expect(screen.getByRole("button", { name: "Aggiungi 3 voci alla bozza" })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Ho verificato scenario/));
    fireEvent.click(screen.getByRole("button", { name: "Aggiungi 3 voci alla bozza" }));
    const voci = importa.mock.calls[0][0];
    expect(voci.find((v: { descrizione: string }) => v.descrizione === "Costruzione")).toMatchObject({
      importo: 0,
      mese: null,
      nota: expect.stringContaining("Importo modificato"),
    });
    expect(voci.every((v: { figliaId?: string }) => !v.figliaId)).toBe(true);
  });
  it("separa gli scenari e richiede un nuovo controllo dopo il cambio", async () => {
    render(<ImportaBusinessPlan onImporta={vi.fn()} onAnnulla={vi.fn()} />);
    await carica();
    fireEvent.click(screen.getByLabelText(/Ho verificato scenario/));
    fireEvent.change(screen.getByLabelText("Scenario da importare"), { target: { value: "1" } });
    await waitFor(() => expect(screen.queryByLabelText("Importo previsto riga 3")).not.toBeInTheDocument());
    expect(screen.getByLabelText(/Ho verificato scenario/)).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Aggiungi 1 voci alla bozza" })).toBeDisabled();
  });
});

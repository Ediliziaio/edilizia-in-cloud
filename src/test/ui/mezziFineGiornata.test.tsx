import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MezziFineGiornata, righeDaSalvare, type RigaMezzoGiornata,
} from "@/components/campo/MezziFineGiornata";

const state = vi.hoisted(() => ({ mezzi: [] as unknown[] }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: state.mezzi }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/mezzi/ViaggioDialog",()=>({ViaggioDialog:({mezzoId,defaultOrderId,onClose}:{mezzoId:string;defaultOrderId:string;onClose:()=>void})=><div role="dialog" aria-label="Registra viaggio">{mezzoId} · {defaultOrderId}<button onClick={onClose}>Chiudi viaggio</button></div>}));

const mezzo = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id, nome, tipo: "attrezzatura", targa: null as string | null, veicolo: false, contatore: null as number | null,
  contatore_unita: null as string | null, dove_ora: "con_te", su_mezzo: null as string | null, segnato_oggi: false, ...extra,
});

let ultimo: Record<string, RigaMezzoGiornata> = {};
function Prova() {
  const [v, setV] = useState<Record<string, RigaMezzoGiornata>>({});
  ultimo = v;
  return <MezziFineGiornata orderId="o1" companyId="c1" valori={v} onChange={setV} />;
}

afterEach(cleanup);
beforeEach(() => { ultimo = {}; });

describe("Rapportino: mezzi e attrezzi a fine giornata", () => {
  it("senza mezzi non occupa spazio", () => {
    state.mezzi = [];
    const { container } = render(<Prova />);
    expect(container).toBeEmptyDOMElement();
  });

  it("furgone: usato oggi e km; attrezzo: dove resta stasera", () => {
    state.mezzi = [
      mezzo("d", "Ducato bianco", { tipo: "furgone", veicolo: true, targa: "GF 482 KD", contatore: 84210, contatore_unita: "km" }),
      mezzo("l", "Livella laser", { dove_ora: "a_bordo", su_mezzo: "Ducato bianco" }),
      mezzo("k", "Miniescavatore", { dove_ora: "cantiere" }),
    ];
    render(<Prova />);
    // il furgone
    fireEvent.click(screen.getByRole("button", { name: /Ducato bianco · GF 482 KD/ }));
    fireEvent.change(screen.getByLabelText("Km di Ducato bianco a fine giornata"), { target: { value: "84.350" } });
    // la livella resta in cantiere, usata
    const livella = screen.getByRole("radiogroup", { name: "Dove resta Livella laser stasera" });
    expect(within(livella).getByRole("radio", { name: "Sul Ducato bianco" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(livella).getByRole("radio", { name: "In cantiere" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Usato?" })[0]);
    // il miniescavatore torna in magazzino, non usato
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Dove resta Miniescavatore stasera" })).getByRole("radio", { name: "In magazzino" }));

    expect(righeDaSalvare(ultimo)).toEqual([
      { mezzo_id: "d", usato: true, dove: "invariato", contatore: "84.350" },
      { mezzo_id: "l", usato: true, dove: "cantiere" },
      { mezzo_id: "k", usato: false, dove: "magazzino" },
    ]);
  });

  it("scegliere il posto dove sta già non sposta niente", () => {
    state.mezzi = [mezzo("k", "Miniescavatore", { dove_ora: "cantiere" })];
    render(<Prova />);
    const gruppo = screen.getByRole("radiogroup", { name: "Dove resta Miniescavatore stasera" });
    // senza furgone mio non c'è «Sul furgone»
    expect(within(gruppo).queryByRole("radio", { name: /furgone/i })).not.toBeInTheDocument();
    fireEvent.click(within(gruppo).getByRole("radio", { name: "In cantiere" }));
    expect(righeDaSalvare(ultimo)).toEqual([]);
  });
  it("apre le tratte senza uscire dal rapportino o perdere la lettura del contatore",()=>{
    state.mezzi=[mezzo("d","Ducato",{tipo:"furgone",veicolo:true,contatore:100,contatore_unita:"km"})];
    render(<Prova/>);
    fireEvent.click(screen.getByRole("button",{name:/^Ducato/}));
    fireEvent.change(screen.getByLabelText("Km di Ducato a fine giornata"),{target:{value:"180"}});
    fireEvent.click(screen.getByRole("button",{name:"Registra viaggio e tappe"}));
    expect(screen.getByRole("dialog",{name:"Registra viaggio"})).toHaveTextContent("d · o1");
    fireEvent.click(screen.getByRole("button",{name:"Chiudi viaggio"}));
    expect(screen.getByLabelText("Km di Ducato a fine giornata")).toHaveValue("180");
  });
});

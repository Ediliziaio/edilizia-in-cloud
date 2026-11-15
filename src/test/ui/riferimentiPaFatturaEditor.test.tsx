/**
 * Riferimenti PA sulla fattura (lotto 4, 15/11/2026): l'origine accanto a ogni riga
 * («dalla commessa», «dall'anagrafica», «scritto qui», «modificato qui»), il ripristino, il
 * «non dovuto» senza valori finti, le righe a cui si applica.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { RiferimentiPaFatturaEditor } from "@/components/fatturazione/RiferimentiPaFatturaEditor";
import { proponiDallaCommessa, type RiferimentoPaFattura } from "../../../supabase/functions/_shared/riferimentiPaFattura";

afterEach(cleanup);

const righe = [{ id: "r1", descrizione: "Lavori" }, { id: "r2", descrizione: "Fornitura" }];
const daCommessa = proponiDallaCommessa({ id: "ord-13", codice: "DEMO2-0013" }, [
  { id: "rp-1", tipo: "contratto", numero: "Rep. 1234/2026", data: "2026-03-01", cig: "1234567ABC", cup: "J51B21000140006" },
]);

function Prova({ iniziali, onValore }: { iniziali: RiferimentoPaFattura[]; onValore?: (v: RiferimentoPaFattura[]) => void }) {
  const [v, setV] = useState(iniziali);
  return <RiferimentiPaFatturaEditor value={v} righe={righe} onChange={(n) => { setV(n); onValore?.(n); }} />;
}

describe("RiferimentiPaFatturaEditor", () => {
  it("mostra «dalla commessa», poi «modificato qui» quando si cambia il CIG, e torna com'era", () => {
    let ultimo: RiferimentoPaFattura[] = [];
    render(<Prova iniziali={daCommessa} onValore={(v) => { ultimo = v; }} />);
    expect(screen.getByTestId("origine-riferimento").textContent).toBe("dalla commessa DEMO2-0013");
    fireEvent.change(screen.getByLabelText("CIG"), { target: { value: "z9y8x7w6v5" } });
    expect(screen.getByTestId("origine-riferimento").textContent).toBe("dalla commessa DEMO2-0013, modificato qui");
    expect(ultimo[0]).toMatchObject({ cig: "Z9Y8X7W6V5", modificato: true });
    fireEvent.click(screen.getByRole("button", { name: /Come in commessa/ }));
    expect(screen.getByTestId("origine-riferimento").textContent).toBe("dalla commessa DEMO2-0013");
    expect(ultimo[0].cig).toBe("1234567ABC");
  });

  it("CIG non dovuto: il campo del codice sparisce e si scrive il motivo", () => {
    let ultimo: RiferimentoPaFattura[] = [];
    render(<Prova iniziali={daCommessa} onValore={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "CIG non dovuto" }));
    expect(screen.queryByLabelText("CIG")).toBeNull();
    fireEvent.change(screen.getByLabelText("Motivo del CIG non dovuto"), { target: { value: "in house" } });
    expect(ultimo[0]).toMatchObject({ cig: null, cig_non_dovuto: true, cig_motivo_esclusione: "in house" });
  });

  it("riferimento scritto qui e righe a cui si applica", () => {
    let ultimo: RiferimentoPaFattura[] = [];
    render(<Prova iniziali={[]} onValore={(v) => { ultimo = v; }} />);
    fireEvent.click(screen.getByRole("button", { name: /Aggiungi riferimento/ }));
    const card = screen.getByTestId("riferimento-pa");
    expect(within(card).getByTestId("origine-riferimento").textContent).toBe("scritto qui");
    fireEvent.change(within(card).getByLabelText("Numero"), { target: { value: "OdA 5" } });
    fireEvent.click(within(card).getByRole("checkbox", { name: "Riga 2" }));
    expect(ultimo[0]).toMatchObject({ numero: "OdA 5", righe_id: ["r2"], numeri_linea: [2], origine: "manuale", modificato: false });
    expect(within(card).getByText(/Vale per: righe 2/)).toBeTruthy();
  });

  it("CIG e CUP di formato sbagliato: lo dice accanto al campo", () => {
    render(<Prova iniziali={[{ ...daCommessa[0], cig: "ABC", cup: "123" }]} />);
    expect(screen.getByText(/Il CIG ha 10 caratteri/)).toBeTruthy();
    expect(screen.getByText(/Il CUP ha 15 caratteri/)).toBeTruthy();
  });
});

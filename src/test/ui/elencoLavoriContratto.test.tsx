import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { ElencoLavoriDialog } from "@/components/orders/DitteContrattiCommessa";
import type { RigaElencoLavori } from "@/lib/subappaltatori/contrattoSubappaltoHtml";

afterEach(cleanup);

const voci: RigaElencoLavori[] = [
  { fase: "Demolizione", descrizione: "Tramezzi", unita: "mq", quantita: 10, prezzo: 15, importo: 150 },
  { fase: "Demolizione", descrizione: "Battiscopa", unita: "ml", quantita: 76, prezzo: 3, importo: 228 },
];
const tariffe = [{ id: "t1", nome: "Rasatura pareti", codice: "RAS", unita: "mq", costo: 11.5 }];
const varianti = [{ tariffa_id: "t1", external_team_id: "d1", costo: 10, is_default: true, attivo: true, sort_order: 0 }];

function Prova({ onSalva }: { onSalva: (r: RigaElencoLavori[]) => void }) {
  const [righe, setRighe] = useState(voci.map((r) => ({ ...r })));
  return <ElencoLavoriDialog titolo="Nuovo contratto" righe={righe} onRighe={setRighe} dalleVoci={voci} fasi={["Demolizione"]}
    tariffe={tariffe} dittaId="d1" varianti={varianti as never} importoPattuito={null} salvando={false}
    etichettaSalva="Crea il contratto in bozza" onSalva={() => onSalva(righe)} onChiudi={vi.fn()} />;
}

describe("elenco dei lavori del contratto (Dimora, 31/10/2026)", () => {
  it("si cambiano quantità e prezzi, si tolgono righe, si aggiunge dal listino col prezzo concordato", () => {
    const salva = vi.fn();
    render(<Prova onSalva={salva} />);
    const q = screen.getByLabelText("Quantità della riga 1");
    fireEvent.change(q, { target: { value: "14,55" } }); fireEvent.blur(q);
    const p = screen.getByLabelText("Prezzo della riga 1");
    fireEvent.change(p, { target: { value: "16" } }); fireEvent.blur(p);
    fireEvent.click(screen.getByRole("button", { name: "Togli Battiscopa" }));
    fireEvent.change(screen.getByLabelText("Cerca nel listino per il contratto"), { target: { value: "rasa" } });
    expect(screen.getByText(/concordato/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Rasatura pareti/ }));
    expect(screen.getByText(/Totale lavori/).textContent).toMatch(/242,80/);
    fireEvent.click(screen.getByRole("button", { name: "Crea il contratto in bozza" }));
    expect(salva).toHaveBeenCalledWith([
      expect.objectContaining({ descrizione: "Tramezzi", quantita: 14.55, prezzo: 16, importo: 232.8 }),
      expect.objectContaining({ descrizione: "Rasatura pareti", quantita: 1, prezzo: 10, importo: 10, codice: "RAS" }),
    ]);
  });

  it("«Riprendi le voci delle fasi» rimette l'elenco di partenza", () => {
    render(<Prova onSalva={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Togli Tramezzi" }));
    expect(screen.queryByDisplayValue("Tramezzi")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Riprendi le voci delle fasi" }));
    expect(screen.getByDisplayValue("Tramezzi")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Battiscopa")).toBeInTheDocument();
  });
});

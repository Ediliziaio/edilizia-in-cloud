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

  it("dalle voci affidate (lotto 5): da dove viene il prezzo e cosa comprende; un prezzo cambiato diventa «a mano» e gli id restano", () => {
    const affidate: RigaElencoLavori[] = [
      { fase: "Intonaci", descrizione: "Intonaco civile", unita: "mq", quantita: 300, prezzo: 14, importo: 4200, voce_id: "v1", affidamento_id: "a1", comprende: "posa", origine: "listino_ditta" },
      { fase: "Intonaci", descrizione: "Rasatura", unita: "mq", quantita: 10, prezzo: 8, importo: 80, voce_id: "v2", affidamento_id: "a2", comprende: "fornitura_e_posa", origine: "costo_aziendale" },
    ];
    const salva = vi.fn();
    function ProvaAffidate() {
      const [righe, setRighe] = useState(affidate.map((r) => ({ ...r })));
      return <ElencoLavoriDialog titolo="Nuovo contratto" righe={righe} onRighe={setRighe} dalleVoci={affidate} fasi={["Intonaci"]} daAffidamenti
        tariffe={[]} dittaId="d1" varianti={[]} importoPattuito={null} salvando={false}
        etichettaSalva="Crea il contratto in bozza" onSalva={() => salva(righe)} onChiudi={vi.fn()} />;
    }
    render(<ProvaAffidate />);
    expect(screen.getByText(/solo posa · prezzo:/)).toBeInTheDocument();
    expect(screen.getByText("listino della ditta")).toBeInTheDocument();
    expect(screen.getByText("costo nostro, non della ditta")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Riprendi le voci affidate" })).toBeInTheDocument();
    const p = screen.getByLabelText("Prezzo della riga 1");
    fireEvent.change(p, { target: { value: "13,5" } }); fireEvent.blur(p);
    expect(screen.getAllByText("a mano")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Crea il contratto in bozza" }));
    const [salvate] = salva.mock.calls[0] as [RigaElencoLavori[]];
    expect(salvate[0]).toMatchObject({ prezzo: 13.5, importo: 4050, affidamento_id: "a1", voce_id: "v1", comprende: "posa" });
  });

  it("una voce affidata senza prezzo non entra nel contratto: il salvataggio resta spento finché non c'è", () => {
    const riga: RigaElencoLavori = { fase: "Sottofondi", descrizione: "Massetto", unita: "mq", quantita: 100, prezzo: 0, importo: 0, affidamento_id: "a3", origine: "manuale" };
    function ProvaSenza() {
      const [righe, setRighe] = useState([{ ...riga }]);
      return <ElencoLavoriDialog titolo="Nuovo contratto" righe={righe} onRighe={setRighe} dalleVoci={[riga]} fasi={["Sottofondi"]} daAffidamenti
        tariffe={[]} dittaId="d1" varianti={[]} importoPattuito={null} salvando={false}
        etichettaSalva="Crea il contratto in bozza" onSalva={vi.fn()} onChiudi={vi.fn()} />;
    }
    render(<ProvaSenza />);
    expect(screen.getByRole("alert").textContent).toMatch(/voce affidata è senza prezzo/);
    expect(screen.getByRole("button", { name: "Crea il contratto in bozza" })).toBeDisabled();
    const p = screen.getByLabelText("Prezzo della riga 1");
    fireEvent.change(p, { target: { value: "12" } }); fireEvent.blur(p);
    expect(screen.getByRole("button", { name: "Crea il contratto in bozza" })).toBeEnabled();
  });
});

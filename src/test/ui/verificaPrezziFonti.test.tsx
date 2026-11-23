import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { DbFinto } from "../helpers/dbFinto";
import VerificaPrezziFonti, { type VerificaApplicata } from "@/components/computo/VerificaPrezziFonti";
import { voceVuota, type VoceEditor } from "@/lib/computo/editorNativo";
import { FONTE_MANUALE } from "@/lib/preventivi/coordinatore/computo";

const AZIENDA = "a0000000-0000-4000-a000-000000000009";
const voce = (id: string, patch: Partial<VoceEditor>): VoceEditor => ({ ...voceVuota(), id, capitolo: "Opere edili", ...patch });

function db() {
  return new DbFinto({
    preventivo_impostazioni: [] as Record<string, unknown>[],
    tariffe_aziendali: [
      { id: "t2", company_id: AZIENDA, attivo: true, codice: "MAS.030", nome: "Massetto autolivellante", descrizione: "", unita: "mq", prezzo_vendita: 0, prezzo_costo: 100, costo_interno: 0, created_at: "2026-02-01T10:00:00Z" },
      { id: "t1", company_id: AZIENDA, attivo: true, codice: "DEM.010", nome: "Demolizione pavimento in ceramica", descrizione: "", unita: "mq", prezzo_vendita: 18, prezzo_costo: 11, costo_interno: 0, created_at: "2026-03-12T10:00:00Z" },
    ],
    listini_fornitore: [], listino_fornitore_voci: [], purchase_order_items: [], quotes: [], quote_items: [], prezzario_fonte: [], prezzario_voce: [],
  });
}

const voci = [
  voce("nuova", { tariffa: "DEM.010", descrizione: "Demolizione pavimento in ceramica", unita: "mq", quantita: "40" }),
  voce("a-mano", { capitolo: "Bagno", tariffa: "DEM.010", descrizione: "Demolizione pavimento in ceramica", unita: "mq", quantita: "6", prezzo: "25", fonte: FONTE_MANUALE }),
  voce("ignota", { descrizione: "Rasatura armata con rete in fibra", unita: "mq", quantita: "" }),
];

describe("Verifica prezzi e fonti", () => {
  it("una schermata: domande con risposta, proposte con fonte, il prezzo a mano non parte spuntato", async () => {
    const onApplica = vi.fn<(e: VerificaApplicata) => void>();
    render(<VerificaPrezziFonti open onOpenChange={() => {}} companyId={AZIENDA} voci={voci} vediCosti onApplica={onApplica} db={db().client} />);
    await waitFor(() => expect(screen.getByTestId("riepilogo-verifica")).toBeInTheDocument());
    expect(screen.getByTestId("riepilogo-verifica").textContent).toContain("nessun costo AI");

    const proposte = screen.getByRole("region", { name: "Proposte" });
    const caselle = within(proposte).getAllByRole("checkbox");
    expect(caselle.map(c => c.getAttribute("aria-checked"))).toEqual(["true", "false"]);
    expect(within(proposte).getByText("sostituisce un prezzo scritto a mano")).toBeInTheDocument();
    expect(within(proposte).getAllByText(/Listino aziendale · DEM\.010/).length).toBe(2);

    const domande = screen.getByRole("region", { name: "Da completare" });
    expect(within(domande).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.change(within(domande).getByLabelText(/^Quantità di Rasatura/), { target: { value: "12,5" } });
    fireEvent.change(within(domande).getByLabelText(/^Prezzo di Rasatura/), { target: { value: "31" } });

    fireEvent.click(screen.getByRole("button", { name: "Applica 3 modifiche" }));
    const esito = onApplica.mock.calls[0][0];
    expect(esito).toMatchObject({ applicate: 1, risposteScritte: 2, cambiateNelFrattempo: 0 });
    expect(esito.voci.find(v => v.id === "nuova")).toMatchObject({ prezzo: "18", costo: "11", verifica: { stato: "verificata" } });
    expect(esito.voci.find(v => v.id === "a-mano")).toMatchObject({ prezzo: "25", fonte: FONTE_MANUALE });
    expect(esito.voci.find(v => v.id === "ignota")).toMatchObject({ quantita: "12,5", prezzo: "31", fonte: FONTE_MANUALE });
  });

  it("senza il permesso sui costi non compare alcun costo né margine", async () => {
    render(<VerificaPrezziFonti open onOpenChange={() => {}} companyId={AZIENDA} voci={voci} vediCosti={false} onApplica={() => {}} db={db().client} />);
    await waitFor(() => expect(screen.getByTestId("riepilogo-verifica")).toBeInTheDocument());
    expect(screen.queryByText(/Costo stimato|margine \d/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Margine obiettivo %")).not.toBeInTheDocument();
    expect(screen.queryByTestId("economia-verifica")).not.toBeInTheDocument();
    expect(screen.getByText(/preventivi già accettati\./)).toBeInTheDocument();
  });

  it("il margine obiettivo si vede, parte dallo standard e cambiandolo cambia il prezzo calcolato dal costo", async () => {
    localStorage.clear();
    const massetto = [voce("massetto", { tariffa: "MAS.030", descrizione: "Massetto autolivellante", unita: "mq", quantita: "10" })];
    render(<VerificaPrezziFonti open onOpenChange={() => {}} companyId={AZIENDA} voci={massetto} vediCosti onApplica={() => {}} db={db().client} />);
    await waitFor(() => expect(screen.getByTestId("margine-spiegazione").textContent).toContain("30% (standard)"));
    expect(screen.getByRole("region", { name: "Proposte" }).textContent).toContain("142,86");
    expect(screen.getByTestId("economia-verifica").textContent).toMatch(/margine 30%/);

    fireEvent.change(screen.getByLabelText("Margine obiettivo %"), { target: { value: "45" } });
    await waitFor(() => expect(screen.getByTestId("margine-spiegazione").textContent).toContain("45% (scelto da te)"), { timeout: 3000 });
    expect(screen.getByTestId("margine-spiegazione").textContent).toContain("Di solito sta tra 25% e 35%");
    expect(screen.getByRole("region", { name: "Proposte" }).textContent).toContain("181,82");
    expect(localStorage.getItem(`eic:margine-obiettivo:${AZIENDA}`)).toBe("45");

    fireEvent.change(screen.getByLabelText("Margine obiettivo %"), { target: { value: "abc" } });
    expect(screen.getByTestId("margine-spiegazione").textContent).toContain("tra 1 e 94");
  });
});

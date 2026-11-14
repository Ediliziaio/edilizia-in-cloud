import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractPreparationCard } from "@/components/orders/ContractPreparationCard";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import { prepareContract } from "@/lib/orders/contractPreparation";
import { parseContractExtract } from "@/lib/orders/contractExtract";

afterEach(cleanup);
describe("conferme del contratto nel modulo", () => {
  it("mostra ufficio e cantiere separati e i dati mancanti in italiano", () => {
    render(<ContractPreparationCard piano={prepareContract(parseContractExtract({ descrizione_lavori:"Manutenzione ricorrente ANAS", appalto_pubblico:{ presente:true, ruolo_azienda_importatrice:"mandante" } }),[],"manutenzione_stradale_su_ordine")} />);
    expect(screen.getByRole("region",{name:"Dati da confermare"})).toHaveTextContent("Confermare aliquota e regime IVA");
    expect(screen.getByRole("region",{name:"Adempimenti ufficio"})).toHaveTextContent("Non modificano l’avanzamento");
    expect(screen.getByRole("region",{name:"Lavorazioni cantiere"})).toHaveTextContent("Nessuna lavorazione esecutiva avviata");
  });
  it("mostra il saldo dichiarato nel contratto senza sostituirlo con il residuo calcolato", () => {
    render(<FinancialSummary daContratto nuova totalAmount="1000" vatRate="0" paymentType="standard" installments={[{position:0,label:"Saldo",type:"balance",amount:700,is_paid:false,amount_from_contract:true}]} numInstallments={1} balance={1000} onInstallmentsChange={vi.fn()} onNumInstallmentsChange={vi.fn()} onTotalAmountChange={vi.fn()} onVatRateChange={vi.fn()} onPaymentTypeChange={vi.fn()} />);
    expect(screen.getByText("Saldo da Pagare").parentElement).toHaveTextContent("700,00");
    expect(screen.getByRole("combobox",{name:"Aliquota IVA"})).toHaveTextContent("0%");
  });
  it("segnala la rata omessa e usa lo stesso saldo dichiarato nel riepilogo",()=>{
    render(<FinancialSummary daContratto nuova totalAmount="1000" vatRate="10" paymentType="standard" installments={[{position:0,label:"Acconto",type:"deposit",amount:100,is_paid:false},{position:1,label:"Saldo",type:"balance",amount:770,is_paid:false,amount_from_contract:true}]} numInstallments={2} balance={1000} onInstallmentsChange={vi.fn()} onNumInstallmentsChange={vi.fn()} onTotalAmountChange={vi.fn()} onVatRateChange={vi.fn()} onPaymentTypeChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Completa o correggi il piano");
    expect(screen.getByText(/1 acconto per/)).toHaveTextContent("Saldo 770,00");
  });
  it("IVA e rate assenti non diventano 22%, due rate, saldo o totale ivato", () => {
    render(<FinancialSummary daContratto nuova totalAmount="1000" vatRate="" paymentType="standard" installments={[]} numInstallments={0} balance={0} onInstallmentsChange={vi.fn()} onNumInstallmentsChange={vi.fn()} onTotalAmountChange={vi.fn()} onVatRateChange={vi.fn()} onPaymentTypeChange={vi.fn()} />);
    expect(screen.getByRole("combobox",{name:"Aliquota IVA"})).toHaveTextContent("Da confermare dal contratto");
    expect(screen.getByText("Nessuna rata: da confermare dal contratto")).toBeVisible();
    expect(screen.queryByText("Saldo da Pagare")).not.toBeInTheDocument();
    expect(screen.getByText("Da definire dopo conferma IVA")).toBeVisible();
    expect(screen.getByRole("tab",{name:"IVA Inclusa"})).toBeDisabled();
  });
});

describe("lavoro singolo: una riga con quello che manca (14/11/2026)", () => {
  const singolo = () => prepareContract(parseContractExtract({ cliente: { nome_completo: "Mario Rossi" }, descrizione_lavori: "Bagno", importo_totale_eur: 1000, iva_pct: 10 }), [], "standard");
  it("niente «Organizzazione» né «Standard selezionato automaticamente»: solo fasi e date da confermare", () => {
    render(<ContractPreparationCard piano={singolo()} confermati={{ cliente: true, importo: true, iva: true, rate: true }} />);
    expect(screen.queryByText(/Organizzazione da confermare/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Standard selezionato automaticamente/)).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Dati da confermare" })).toHaveTextContent("Dal contratto, da confermare: fasi di lavoro · date dei lavori");
  });
  it("in «Nuova commessa» non ripete cliente, importo, IVA e pagamenti, che stanno nella barra «Manca:»", () => {
    render(<ContractPreparationCard piano={singolo()} confermati={{}} nascondi={["cliente", "importo", "iva", "rate"]} />);
    expect(screen.getByRole("region", { name: "Dati da confermare" })).not.toHaveTextContent(/cliente|IVA|pagamenti/);
  });
  it("gli avvisi dell'AI sul documento restano", () => {
    const p = prepareContract(parseContractExtract({ cliente: { nome_completo: "Mario Rossi" }, descrizione_lavori: "Bagno", importo_totale_eur: 1000, iva_pct: 10, data_fine_lavori: "2027-01-31", warnings: ["La somma delle voci non torna con l'imponibile"] }), [], "standard");
    render(<ContractPreparationCard piano={p} confermati={{ cliente: true, importo: true, iva: true, rate: true }} />);
    expect(screen.getByRole("region", { name: "Dati da confermare" })).toHaveTextContent("La somma delle voci non torna");
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractPreparationCard } from "@/components/orders/ContractPreparationCard";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import { prepareContract } from "@/lib/orders/contractPreparation";
import { parseContractExtract } from "@/lib/orders/contractExtract";

afterEach(cleanup);
describe("conferme del contratto nel modulo", () => {
  it("mostra ufficio e cantiere separati e i dati mancanti in italiano", () => {
    render(<ContractPreparationCard piano={prepareContract(parseContractExtract({ descrizione_lavori:"Manutenzione ricorrente ANAS", appalto_pubblico:{ presente:true, ruolo_azienda_importatrice:"mandante" } }),[])} />);
    expect(screen.getByRole("region",{name:"Dati da confermare"})).toHaveTextContent("Confermare aliquota e regime IVA");
    expect(screen.getByRole("region",{name:"Adempimenti ufficio"})).toHaveTextContent("Non modificano l’avanzamento");
    expect(screen.getByRole("region",{name:"Lavorazioni cantiere"})).toHaveTextContent("Nessuna lavorazione esecutiva avviata");
  });
  it("mostra il saldo dichiarato nel contratto senza sostituirlo con il residuo calcolato", () => {
    render(<FinancialSummary daContratto nuova totalAmount="1000" vatRate="0" paymentType="standard" installments={[{position:0,label:"Saldo",type:"balance",amount:700,is_paid:false,amount_from_contract:true}]} numInstallments={1} balance={1000} onInstallmentsChange={vi.fn()} onNumInstallmentsChange={vi.fn()} onTotalAmountChange={vi.fn()} onVatRateChange={vi.fn()} onPaymentTypeChange={vi.fn()} />);
    expect(screen.getByText("Saldo da Pagare").parentElement).toHaveTextContent("700,00");
    expect(screen.getByRole("combobox",{name:"Aliquota IVA"})).toHaveTextContent("0%");
  });
  it("IVA e rate assenti non diventano 22%, due rate, saldo o totale ivato", () => {
    render(<FinancialSummary daContratto nuova totalAmount="1000" vatRate="" paymentType="standard" installments={[]} numInstallments={0} balance={0} onInstallmentsChange={vi.fn()} onNumInstallmentsChange={vi.fn()} onTotalAmountChange={vi.fn()} onVatRateChange={vi.fn()} onPaymentTypeChange={vi.fn()} />);
    expect(screen.getByRole("combobox",{name:"Aliquota IVA"})).toHaveTextContent("Da confermare dal contratto");
    expect(screen.getByText("Da confermare · nessuna rata impostata")).toBeVisible();
    expect(screen.queryByText("Saldo da Pagare")).not.toBeInTheDocument();
    expect(screen.getByText("Da definire dopo conferma IVA")).toBeVisible();
    expect(screen.getByRole("tab",{name:"IVA Inclusa"})).toBeDisabled();
  });
});

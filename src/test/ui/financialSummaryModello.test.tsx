// src/test/ui/financialSummaryModello.test.tsx
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FinancialSummary } from "@/components/orders/FinancialSummary";
import type { Installment } from "@/lib/orderUtils";
import { rateDaModello, ricalcolaRatePercentuali, type ModelloPagamento } from "@/lib/orders/modelliPagamento";

const modello: ModelloPagamento = {
  id: "m1", origine: "azienda", nome: "Tre rate", descrizione: "",
  righe: [
    { nome: "Alla firma", percent: 30, tipo: "deposit", evento: "firma_contratto", numero: null, preavviso: 7 },
    { nome: "SAL 1", percent: 40, tipo: "deposit", evento: "sal_numero", numero: 1, preavviso: 7 },
    { nome: "Saldo", percent: 30, tipo: "balance", evento: "fine_lavori", numero: null, preavviso: 7 },
  ],
};

/** Come il modulo di nuova commessa: un modello applicato da fuori, e il totale che ricalcola le rate da modello. */
function Prova() {
  const [totale, setTotale] = useState("1.000,00");
  const [rate, setRate] = useState<Installment[]>([
    { position: 0, label: "Acconto 1", type: "deposit", amount: 0, is_paid: false },
    { position: 1, label: "Saldo", type: "balance", amount: 0, is_paid: false },
  ]);
  return (
    <div>
      <button type="button" onClick={() => setRate(rateDaModello(modello, 1220))}>applica il modello</button>
      <div data-testid="percento">{rate.map((r) => String(r.percent ?? "-")).join("|")}</div>
      <div data-testid="importi">{rate.map((r) => String(r.amount)).join("|")}</div>
      <FinancialSummary
        totalAmount={totale} vatRate="22" paymentType="standard"
        installments={rate} onInstallmentsChange={setRate}
        numInstallments={rate.length} onNumInstallmentsChange={() => {}}
        onTotalAmountChange={(v) => { setTotale(v); setRate((prev) => ricalcolaRatePercentuali(prev, 1220 * 2)); }}
        onVatRateChange={() => {}} onPaymentTypeChange={() => {}}
        balance={0}
      />
    </div>
  );
}

const campiImporto = (): HTMLInputElement[] => Array.from(document.querySelectorAll('input[inputmode="decimal"]')) as HTMLInputElement[];

afterEach(cleanup);

describe("il riepilogo finanziario con un modello di pagamento", () => {
  it("quando le rate cambiano da fuori (un modello applicato) i campi mostrano i nuovi importi", () => {
    render(<Prova />);
    expect(campiImporto()[1].value).toBe("");
    fireEvent.click(screen.getByText("applica il modello"));
    // campi: totale, poi gli importi delle rate che non sono il saldo
    const importi = campiImporto().slice(1).map((c) => c.value);
    expect(importi).toEqual(["366,00", "488,00"]);
  });

  it("cambia il totale: le rate da modello seguono, anche nei campi", () => {
    render(<Prova />);
    fireEvent.click(screen.getByText("applica il modello"));
    const totale = campiImporto()[0];
    fireEvent.change(totale, { target: { value: "2.000" } });
    fireEvent.blur(totale);
    expect(campiImporto().slice(1).map((c) => c.value)).toEqual(["732,00", "976,00"]);
  });

  it("un importo scritto a mano toglie la percentuale di quella rata e solo di quella", () => {
    render(<Prova />);
    fireEvent.click(screen.getByText("applica il modello"));
    expect(screen.getByTestId("percento").textContent).toBe("30|40|30");
    const secondo = campiImporto()[2];
    fireEvent.change(secondo, { target: { value: "500" } });
    fireEvent.blur(secondo);
    expect(screen.getByTestId("percento").textContent).toBe("30|-|30");
    expect(screen.getByTestId("importi").textContent).toBe("366|500|366");
    expect(secondo.value).toBe("500,00");
  });

  it("uscire da un campo senza cambiarlo non toglie la percentuale", () => {
    render(<Prova />);
    fireEvent.click(screen.getByText("applica il modello"));
    const primo = campiImporto()[1];
    fireEvent.focus(primo);
    fireEvent.blur(primo);
    expect(screen.getByTestId("percento").textContent).toBe("30|40|30");
  });

  it("mentre si digita il testo non viene riscritto", () => {
    render(<Prova />);
    fireEvent.click(screen.getByText("applica il modello"));
    const primo = campiImporto()[1];
    fireEvent.change(primo, { target: { value: "12" } });
    expect(primo.value).toBe("12");
  });
});

describe("una rata «alla firma» in una commessa nuova", () => {
  const oggi = new Date().toLocaleDateString("en-CA");
  const rate: Installment[] = [
    { position: 0, label: "Acconto alla firma", type: "deposit", amount: 500, is_paid: false, trigger_evento: "firma_contratto" },
    { position: 1, label: "Saldo", type: "balance", amount: 700, is_paid: false, trigger_evento: "fine_lavori" },
  ];
  const monta = (nuova: boolean) =>
    render(
      <FinancialSummary
        totalAmount="1.000,00" vatRate="22" paymentType="standard"
        installments={rate} onInstallmentsChange={() => {}}
        numInstallments={2} onNumInstallmentsChange={() => {}}
        onTotalAmountChange={() => {}} onVatRateChange={() => {}} onPaymentTypeChange={() => {}}
        balance={700}
        dateCommessa={{ created_at: `${oggi}T09:00:00`, warehouse_arrival_date: null, work_start_date: null, work_end_date: null, expected_date: null }}
        nuova={nuova}
      />,
    );

  it("cade oggi, ma in creazione non è «Scaduta»", () => {
    monta(true);
    expect(screen.getByText("Stato Acconto alla firma")).toBeInTheDocument();
    expect(screen.queryByText("Scaduta")).not.toBeInTheDocument();
  });

  it("su una commessa che esiste già la stessa rata, non pagata, è «Scaduta»", () => {
    monta(false);
    expect(screen.getByText("Scaduta")).toBeInTheDocument();
  });
});

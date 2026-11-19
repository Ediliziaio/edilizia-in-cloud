import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Euro } from "lucide-react";
import { OrdersSummaryCard } from "@/components/orders/OrdersSummaryCard";
afterEach(cleanup);
describe("Schede del riepilogo economico", () => {
  it("non tronca al 100% il valore testuale di un'incidenza superiore al fatturato", () => {
    render(<OrdersSummaryCard id="costi" title="Costi commesse" value="125 €" note="IVA esclusa" icon={Euro} loading={false} ring={{value:125,label:"Costi / fatturato",color:"amber"}} />);
    expect(screen.getByRole("img", {name:"Costi / fatturato: 125%"})).toBeVisible();
  });
  it("nasconde il cerchio e l'importo precedente finché il dato si sta caricando", () => {
    render(<OrdersSummaryCard id="incassato" title="Incassi" value="200 €" note="IVA inclusa" icon={Euro} loading ring={{value:20,label:"Quota incassata",color:"green"}} />);
    expect(screen.getByRole("region",{name:"Incassi"})).toHaveAttribute("aria-busy","true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByText("200 €")).not.toBeInTheDocument();
  });
});

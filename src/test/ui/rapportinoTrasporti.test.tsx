import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { ArrivoRapportino } from "@/components/orders/ArrivoRapportino";
import { ARRIVI_VUOTI, campoArrivo } from "@/lib/campo/arrivoRapportino";

it("propone i mezzi e salva solo quelli confermati, ognuno con i suoi dati", () => {
  const mezzi = [
    { id: "16000000-0000-4000-8000-000000000001", nome: "Furgone Alfa" },
    { id: "16000000-0000-4000-8000-000000000002", nome: "Auto Beta" },
  ];
  function Scenario() {
    const [arrivi, setArrivi] = useState(ARRIVI_VUOTI);
    return <>
      <ArrivoRapportino valore={arrivi} onChange={setArrivi} mezzi={mezzi} suggeriti={mezzi.map(m => m.id)} />
      <output aria-label="Trasporti salvati">{JSON.stringify(campoArrivo(arrivi))}</output>
    </>;
  }
  render(<Scenario />);
  const output = screen.getByLabelText("Trasporti salvati");
  expect(output).toHaveTextContent("[]");
  fireEvent.click(screen.getByRole("button", { name: "Furgone Alfa" }));
  fireEvent.click(screen.getByRole("button", { name: "Auto Beta" }));
  const rows = within(screen.getByRole("region", { name: "Trasporto al cantiere" })).getAllByRole("listitem");
  fireEvent.change(within(rows[0]).getByLabelText("Km percorsi all’andata"), { target: { value: "18,5" } });
  expect(output).toHaveTextContent(`"mezzo_id":"${mezzi[0].id}","partenza":null,"km":18.5`);
  expect(output).toHaveTextContent(`"mezzo_id":"${mezzi[1].id}","partenza":null,"km":null`);
  fireEvent.click(screen.getByRole("button", { name: "Rimuovi Auto Beta" }));
  expect(output).not.toHaveTextContent(mezzi[1].id);
});

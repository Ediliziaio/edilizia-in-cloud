import { describe, expect, it } from "vitest";
import { righeDaElenco } from "@/lib/orders/nuovoOdaCommessa";

describe("elenco incollato → righe d'ordine", () => {
  it("legge quantità e unità in testa", () => {
    expect(righeDaElenco("10 sacchi cemento 32,5\n5 pz tubo 32\n2,5 mq rete elettrosaldata")).toEqual([
      { description: "sacchi cemento 32,5", quantity: 10, unit_of_measure: "conf" },
      { description: "tubo 32", quantity: 5, unit_of_measure: "pz" },
      { description: "rete elettrosaldata", quantity: 2.5, unit_of_measure: "mq" },
    ]);
  });
  it("legge la quantità in fondo e salta elenchi puntati, titoli e righe vuote", () => {
    expect(righeDaElenco("Materiali:\n- cemento x 10\n\n• tubo 32 (5 pz)\n1) silicone trasparente")).toEqual([
      { description: "cemento", quantity: 10, unit_of_measure: "pz" },
      { description: "tubo 32", quantity: 5, unit_of_measure: "pz" },
      { description: "silicone trasparente", quantity: 1, unit_of_measure: "pz" },
    ]);
  });
  it("non scambia una misura del nome per una quantità", () => {
    expect(righeDaElenco("tubo pvc 110\nfilo cotto n.14")).toEqual([
      { description: "tubo pvc 110", quantity: 1, unit_of_measure: "pz" },
      { description: "filo cotto n.14", quantity: 1, unit_of_measure: "pz" },
    ]);
  });
  it("un numero in testa è la quantità anche se il nome contiene misure", () => {
    expect(righeDaElenco("4 Cemento 32,5 sacco 25 kg")).toEqual([{ description: "Cemento 32,5 sacco 25 kg", quantity: 4, unit_of_measure: "pz" }]);
  });
  it("numero senza unità in testa = quantità a pezzi", () => {
    expect(righeDaElenco("3 secchi di malta\n12 staffe")).toEqual([
      { description: "secchi di malta", quantity: 3, unit_of_measure: "conf" },
      { description: "staffe", quantity: 12, unit_of_measure: "pz" },
    ]);
  });
});

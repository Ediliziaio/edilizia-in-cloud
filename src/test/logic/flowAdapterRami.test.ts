/**
 * L'editor rilegge i rami degli split dal database.
 *
 * La maniglia di uscita non si salva: si ricostruisce dall'etichetta dell'arco.
 * Prima si riconoscevano solo A e B, quindi il terzo ramo di uno split tornava
 * senza maniglia dopo il ricaricamento e l'arco ripartiva dal punto sbagliato.
 */
import { describe, expect, it } from "vitest";
import { connectionsToEdges, labelToSourceHandle } from "@/components/flow-builder/hooks/useFlowAdapter";

describe("labelToSourceHandle", () => {
  it("condizione: Sì e No", () => {
    expect(labelToSourceHandle("Sì")).toBe("yes");
    expect(labelToSourceHandle("si")).toBe("yes");
    expect(labelToSourceHandle("yes")).toBe("yes");
    expect(labelToSourceHandle("No")).toBe("no");
  });

  it("split: da A a E, con o senza percentuale", () => {
    expect(labelToSourceHandle("A")).toBe("split_0");
    expect(labelToSourceHandle("B: 40%")).toBe("split_1");
    expect(labelToSourceHandle("C")).toBe("split_2");
    expect(labelToSourceHandle("d: 10%")).toBe("split_3");
    expect(labelToSourceHandle("E")).toBe("split_4");
  });

  it("le etichette dei nodi di attesa non sono rami", () => {
    // "event" inizia per e, "timeout" per t: prima di questa regola "event"
    // sarebbe diventato il quinto ramo di uno split.
    expect(labelToSourceHandle("event")).toBeUndefined();
    expect(labelToSourceHandle("timeout")).toBeUndefined();
    expect(labelToSourceHandle("Antonella")).toBeUndefined();
  });

  it("oltre la E o senza etichetta: nessuna maniglia", () => {
    expect(labelToSourceHandle("F")).toBeUndefined();
    expect(labelToSourceHandle(null)).toBeUndefined();
    expect(labelToSourceHandle("")).toBeUndefined();
  });
});

describe("connectionsToEdges", () => {
  it("uno split a tre rami torna con tre maniglie diverse", () => {
    const base = { flow_id: "f", company_id: "c", from_node_id: "split", created_at: "2026-09-13T00:00:00Z" };
    const archi = connectionsToEdges([
      { ...base, id: "1", to_node_id: "antonella", label: "A: 50%" },
      { ...base, id: "2", to_node_id: "venusia", label: "B: 30%" },
      { ...base, id: "3", to_node_id: "terzo", label: "C" },
    ] as Parameters<typeof connectionsToEdges>[0]);
    expect(archi.map((e) => e.sourceHandle)).toEqual(["split_0", "split_1", "split_2"]);
  });
});

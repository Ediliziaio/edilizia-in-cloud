import { describe, expect, it } from "vitest";
import { itemsPreventivoDalRilievo, riempiDescrizione, righeDalRilievo, valoreLeggibile, vociComputoDalRilievo } from "@/lib/surveys/righeDalRilievo";
import type { TemplateSchema } from "@/types/surveys";

const schema = {
  version: 1,
  header_schema: [],
  area_definition: { label: "Ambiente", label_plural: "Ambienti", fields: [] },
  general_required_photos: [],
  element_types: [
    { key: "infisso", label: "Infisso", label_plural: "Infissi", required_photos: [], sections: [{ key: "s", label: "S", fields: [
      { key: "tipologia", label: "Tipologia", type: "select", options: [{ value: "finestra_2a", label: "Finestra 2 ante" }] },
      { key: "larghezza_foro", label: "L", type: "dimension" },
      { key: "altezza_foro", label: "H", type: "dimension" },
    ] }] },
    { key: "rivestimenti", label: "Rivestimenti", label_plural: "Rivestimenti", required_photos: [], sections: [] },
    { key: "nota", label: "Nota libera", label_plural: "Note", required_photos: [], sections: [] },
  ],
  output_mapping: { estimate_lines: {
    infisso: { unit: "pz", quantity_field: "quantity", description_template: "Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm — telaio {tipo_telaio}" },
    rivestimenti: { unit: "mq", description_template: "Rivestimento {pavimento_tipo_nuovo}" },
  } },
} as unknown as TemplateSchema;

const el = (id: string, area: string, tipo: string, values: Record<string, unknown>, quantity = 1, position = 0) =>
  ({ id, area_id: area, element_type: tipo, element_label: null as string | null, position, values, quantity });

describe("dal rilievo alle righe", () => {
  it("riempie la descrizione con le etichette, non coi codici", () => {
    expect(valoreLeggibile("finestra_2a", { key: "t", label: "T", type: "select", options: [{ value: "finestra_2a", label: "Finestra 2 ante" }] })).toBe("Finestra 2 ante");
    const [riga] = righeDalRilievo({ schema, ambienti: [{ id: "a", name: "Soggiorno" }], elementi: [el("1", "a", "infisso", { tipologia: "finestra_2a", larghezza_foro: 120, altezza_foro: 140, tipo_telaio: "Nuovo" }, 2)] });
    expect(riga).toMatchObject({ ambiente: "Soggiorno", descrizione: "Infisso Finestra 2 ante 120x140 cm — telaio Nuovo", unita: "pz", quantita: 2, daVerificare: false });
  });

  it("i segnaposto vuoti non lasciano «x cm» né separatori appesi", () => {
    expect(riempiDescrizione("Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm — telaio {tipo_telaio}", { tipologia: "Finestra" })).toBe("Infisso Finestra");
    expect(riempiDescrizione("Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm", { tipologia: "Finestra", larghezza_foro: 120 })).toBe("Infisso Finestra 120");
  });

  it("a mq: legge la superficie se c'è, altrimenti segnala da verificare", () => {
    const righe = righeDalRilievo({ schema, ambienti: [{ id: "a", name: "Bagno" }], elementi: [
      el("1", "a", "rivestimenti", { pavimento_tipo_nuovo: "Gres", superficie_mq: "12,5" }),
      el("2", "a", "rivestimenti", { pavimento_tipo_nuovo: "Gres" }, 1, 1),
    ] });
    expect(righe[0]).toMatchObject({ unita: "mq", quantita: 12.5, daVerificare: false });
    expect(righe[1]).toMatchObject({ unita: "mq", quantita: 1, daVerificare: true });
  });

  it("un tipo senza mappatura diventa comunque una riga, col suo nome", () => {
    const [riga] = righeDalRilievo({ schema, ambienti: [{ id: "a", name: "Cucina" }], elementi: [el("1", "a", "nota", {})] });
    expect(riga).toMatchObject({ descrizione: "Nota libera", unita: "pz", quantita: 1 });
  });

  it("segue l'ordine degli ambienti e poi degli elementi", () => {
    const righe = righeDalRilievo({ schema, ambienti: [{ id: "b", name: "Camera", position: 1 }, { id: "a", name: "Soggiorno", position: 0 }], elementi: [
      el("3", "b", "nota", {}, 1, 0), el("2", "a", "nota", {}, 1, 1), el("1", "a", "nota", {}, 1, 0),
    ] });
    expect(righe.map((r) => r.elementoId)).toEqual(["1", "2", "3"]);
  });
});

describe("le due uscite", () => {
  const righe = [
    { elementoId: "1", ambiente: "Bagno", descrizione: "WC sospeso", unita: "pz", quantita: 1, daVerificare: false, inclusa: true, prezzo: 320.456 },
    { elementoId: "2", ambiente: "Bagno", descrizione: "Rivestimento Gres", unita: "mq", quantita: 12.5, daVerificare: false, inclusa: true, prezzo: 0 },
    { elementoId: "3", ambiente: "Bagno", descrizione: "Tolta", unita: "pz", quantita: 1, daVerificare: false, inclusa: false, prezzo: 10 },
  ];
  it("preventivo: solo le righe incluse, ambiente nel nome, origine nella descrizione", () => {
    const items = itemsPreventivoDalRilievo(righe, "SOP-1", 10);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Bagno — WC sospeso", description: "Dal sopralluogo SOP-1", quantity: 1, unit_price: 320.46, vat_rate: 10, unit_of_measure: "pz", sort_order: 0 });
  });
  it("computo: ambiente come capitolo, pezzi in «cad», virgola italiana", () => {
    expect(vociComputoDalRilievo(righe, "SOP-1")).toEqual([
      { capitolo: "Bagno", descrizione: "WC sospeso", unita: "cad", quantita: "1" },
      { capitolo: "Bagno", descrizione: "Rivestimento Gres", unita: "mq", quantita: "12,5" },
    ]);
  });
});

describe("infissi: emoji e complementi", () => {
  const conComplementi = {
    ...schema,
    element_types: [{ ...schema.element_types[0], sections: [{ key: "s", label: "S", fields: [
      { key: "tipologia", label: "T", type: "select", options: [{ value: "finestra_2a", label: "Finestra 2 ante" }] },
      { key: "apertura", label: "A", type: "select", options: [{ value: "due_ante", label: "🪟 Due ante simmetriche" }] },
      { key: "tap_materiale", label: "M", type: "select", options: [{ value: "pvc", label: "PVC" }] },
    ] }] }],
    output_mapping: { estimate_lines: { infisso: { unit: "pz", description_template: "Infisso {tipologia} {larghezza_foro}x{altezza_foro} cm — {apertura}" } } },
  } as unknown as TemplateSchema;
  it("niente emoji; ogni complemento spuntato è una riga con le sue misure", () => {
    const righe = righeDalRilievo({ schema: conComplementi, ambienti: [{ id: "a", name: "Soggiorno" }], elementi: [
      el("1", "a", "infisso", { tipologia: "finestra_2a", apertura: "due_ante", larghezza_foro: 120, altezza_foro: 140, complementi: ["tapparella", "zanzariera"],
        tap_materiale: "pvc", tap_larghezza: 120, tap_altezza: 140, zan_larghezza: 118 }),
    ] });
    expect(righe.map((r) => r.descrizione)).toEqual([
      "Infisso Finestra 2 ante 120x140 cm — Due ante simmetriche",
      "Tapparella PVC 120x140 cm",
      "Zanzariera 118",
    ]);
    expect(righe[1].elementoId).toBe("1:tapparella");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  componentiDelRilievo, differenzeMisure, misureDaCampi, misureInTesto, proponiAbbinamenti,
  scartoDellaRiga, schedaDellaPosizione, valoreNelCampo, type ComponenteRilevato, type RigaMisure,
} from "@/lib/surveys/misureRilievo";
import { CAMPI_CHE_SEGUONO_LA_DIVISIONE, parteDivisa } from "@/hooks/useOrderWorkPhases";
import type { TemplateSchema } from "@/types/surveys";

const dim = (key: string, unit: string, label = key) => ({ key, unit, label, type: "dimension" });

const schema = {
  version: 1,
  element_types: [
    {
      key: "infisso", label: "Infisso", label_plural: "Infissi", required_photos: [],
      sections: [
        { key: "foro", label: "Foro", fields: [dim("larghezza_foro", "cm"), dim("altezza_foro", "cm"), dim("spessore_muro", "cm"), dim("mazzetta_sx", "cm")] },
        { key: "tap", label: "Tap", show_if: { field: "complementi", value: "tapparella", operator: "contains" }, fields: [dim("tap_larghezza", "cm"), dim("tap_altezza", "cm")] },
        { key: "zan", label: "Zan", show_if: { field: "complementi", value: "zanzariera", operator: "contains" }, fields: [dim("zan_larghezza", "cm"), dim("zan_altezza", "cm"), dim("zan_larghezza_telaio", "cm")] },
        { key: "cas", label: "Cas", show_if: { field: "complementi", value: "cassonetto", operator: "contains" }, fields: [dim("cas_larghezza", "cm"), dim("cas_altezza", "cm"), dim("cas_profondita", "cm"), dim("cas_cilindro", "cm")] },
      ],
    },
    {
      key: "rivestimenti", label: "Rivestimenti", label_plural: "Rivestimenti", required_photos: [],
      sections: [{ key: "p", label: "P", fields: [dim("pavimento_mq", "mq", "Mq pavimento"), dim("pareti_mq_totali", "mq"), dim("pareti_mq_rivestire", "mq", "Mq da rivestire")] }],
    },
    {
      key: "lattoneria", label: "Lattoneria", label_plural: "Lattoneria", required_photos: [],
      sections: [{ key: "l", label: "L", fields: [dim("gronde_ml", "ml", "Gronde"), dim("pluviali_ml", "ml", "Pluviali")] }],
    },
    {
      key: "pergola", label: "Pergola", label_plural: "Pergole", required_photos: [],
      sections: [{ key: "m", label: "M", fields: [dim("larghezza", "cm", "Larghezza"), dim("profondita", "cm", "Profondità"), dim("altezza", "cm", "Altezza")] }],
    },
    { key: "wc", label: "WC", label_plural: "WC", required_photos: [], sections: [{ key: "s", label: "S", fields: [{ key: "tipo", label: "Tipo", type: "text" }] }] },
    {
      key: "lavabo", label: "Lavabo", label_plural: "Lavabi", required_photos: [],
      sections: [{ key: "s", label: "S", fields: [{ key: "mobile", label: "Mobile", type: "compound_boolean", nested_fields: [dim("mobile_larghezza", "cm"), dim("mobile_profondita", "cm")] }] }],
    },
  ],
  output_mapping: { estimate_lines: { wc: { unit: "pz" }, lavabo: { unit: "pz" } } },
} as unknown as TemplateSchema;

describe("componenti di un elemento rilevato", () => {
  it("un infisso dà un componente per ogni complemento scelto, in millimetri", () => {
    const c = componentiDelRilievo({
      id: "e1", element_type: "infisso", element_label: "Cucina", quantity: 1,
      values: { larghezza_foro: 120, altezza_foro: "140,5", spessore_muro: 30, mazzetta_sx: 2, complementi: ["tapparella", "cassonetto"], tap_larghezza: 118, tap_altezza: 150, cas_larghezza: 120, cas_altezza: 25, cas_profondita: 22, cas_cilindro: 5, zan_larghezza: 100, zan_altezza: 100 },
    }, schema);
    expect(c.map((x) => x.componente)).toEqual(["infisso", "tapparella", "cassonetto"]);
    expect(c[0]).toMatchObject({ forma: "LxH", misuraTipo: "foro", riferimento: "Cucina", misure: { larghezza_mm: 1200, altezza_mm: 1405 } });
    expect(c[2]).toMatchObject({ forma: "LxPxH", misure: { larghezza_mm: 1200, altezza_mm: 250, profondita_mm: 220 } });
  });

  it("le sezioni nascoste non contano, anche se hanno un valore vecchio", () => {
    const c = componentiDelRilievo({ id: "e1", element_type: "infisso", values: { larghezza_foro: 120, altezza_foro: 140, complementi: [], tap_larghezza: 120, tap_altezza: 270 } }, schema);
    expect(c.map((x) => x.componente)).toEqual(["infisso"]);
  });

  it("l'unità viene dal modello: in millimetri non si moltiplica", () => {
    const inMm = { ...schema, element_types: [{ key: "infisso", label: "I", label_plural: "I", required_photos: [], sections: [{ key: "f", label: "F", fields: [dim("larghezza_foro", "mm"), dim("altezza_foro", "mm")] }] }] } as unknown as TemplateSchema;
    expect(componentiDelRilievo({ id: "e", element_type: "infisso", values: { larghezza_foro: 1200, altezza_foro: 1400 } }, inMm)[0].misure).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
  });

  it("senza modello si legge il foro in centimetri, come si è sempre fatto", () => {
    expect(componentiDelRilievo({ id: "e", element_type: "infisso", values: { larghezza_foro: 120, altezza_foro: 140 } }, null)[0].misure).toEqual({ larghezza_mm: 1200, altezza_mm: 1400 });
  });

  it("bagno: pavimento e rivestimento sono due righe a mq, i totali di controllo no", () => {
    const c = componentiDelRilievo({ id: "b", element_type: "rivestimenti", values: { pavimento_mq: 6, pareti_mq_totali: 30, pareti_mq_rivestire: 12.5 } }, schema);
    expect(c.map((x) => [x.componente, x.forma, x.misure.quantita])).toEqual([["pavimento", "mq", 6], ["pareti_rivestire", "mq", 12.5]]);
  });

  it("tetto: metri lineari per ogni lattoneria", () => {
    const c = componentiDelRilievo({ id: "t", element_type: "lattoneria", values: { gronde_ml: 24.5, pluviali_ml: 9 } }, schema);
    expect(c.map((x) => [x.componente, x.unita, x.misure.quantita])).toEqual([["gronde", "ml", 24.5], ["pluviali", "ml", 9]]);
  });

  it("pergola: larghezza, profondità e altezza", () => {
    const [c] = componentiDelRilievo({ id: "p", element_type: "pergola", values: { larghezza: 400, profondita: 300, altezza: 250 } }, schema);
    expect(c).toMatchObject({ componente: "pergola", forma: "LxPxH", misure: { larghezza_mm: 4000, profondita_mm: 3000, altezza_mm: 2500 } });
  });

  it("un sanitario senza misure si conta a pezzi, un mobile non cancella il lavabo", () => {
    expect(componentiDelRilievo({ id: "w", element_type: "wc", quantity: 2, values: { tipo: "sospeso" } }, schema)[0]).toMatchObject({ forma: "pz", misure: { quantita: 2 } });
    const l = componentiDelRilievo({ id: "l", element_type: "lavabo", values: { mobile: true, mobile_larghezza: 80, mobile_profondita: 45 } }, schema);
    expect(l.map((x) => x.componente)).toEqual(["lavabo", "mobile"]);
  });
});

const comp = (over: Partial<ComponenteRilevato>): ComponenteRilevato => ({
  elementoId: "e1", elementType: "infisso", componente: "infisso", etichetta: "Infisso", forma: "LxH",
  misure: { larghezza_mm: 1200, altezza_mm: 1400 }, unita: null, misuraTipo: "foro", quantita: 1, riferimento: "Cucina", ...over,
});
const riga = (over: Partial<RigaMisure>): RigaMisure => ({
  id: "r1", name: "Finestra PVC", riferimento: "Cucina", measure_status: "da_rilevare",
  misure_preventivo: { larghezza_mm: 1200, altezza_mm: 1400 }, ...over,
});

describe("abbinamento rilievo e righe", () => {
  it("propone per riferimento, ogni riga una volta sola", () => {
    const p = proponiAbbinamenti(
      [riga({ id: "a", riferimento: "Bagno" }), riga({ id: "b", riferimento: "Cucina" })],
      [comp({ elementoId: "e1", riferimento: "Cucina" }), comp({ elementoId: "e2", riferimento: "Bagno" })],
      "s1",
    );
    expect(p.map((x) => x.rigaId)).toEqual(["b", "a"]);
    expect(p.every((x) => x.stato === "proposta")).toBe(true);
  });

  it("senza riferimento vale la misura vicina; se è lontana non propone", () => {
    const vicina = proponiAbbinamenti([riga({ riferimento: null, name: "Articolo" })], [comp({ riferimento: null, misure: { larghezza_mm: 1210, altezza_mm: 1395 } })], "s1");
    expect(vicina[0].rigaId).toBe("r1");
    const lontana = proponiAbbinamenti([riga({ riferimento: null, name: "Articolo" })], [comp({ riferimento: null, misure: { larghezza_mm: 3000, altezza_mm: 800 } })], "s1");
    expect(lontana[0]).toMatchObject({ rigaId: null, stato: "nuova" });
  });

  it("una tapparella non si abbina alla riga dell'infisso", () => {
    const p = proponiAbbinamenti([riga({ componente: "infisso" })], [comp({ componente: "tapparella" })], "s1");
    expect(p[0].rigaId).toBeNull();
  });

  it("già collegata allo stesso rilievo: resta lei, nessun doppione", () => {
    const p = proponiAbbinamenti([riga({ survey_id: "s1", survey_element_id: "e1", componente: "infisso", misure_rilevate: { larghezza_mm: 1200, altezza_mm: 1400 } })], [comp({})], "s1");
    expect(p[0]).toMatchObject({ rigaId: "r1", stato: "collegata" });
  });

  it("riga misurata da un altro sopralluogo: secondo rilievo, con le differenze", () => {
    const p = proponiAbbinamenti([riga({ survey_id: "s0", survey_element_id: "e0", misure_rilevate: { larghezza_mm: 1200, altezza_mm: 1400 } })], [comp({ misure: { larghezza_mm: 1215, altezza_mm: 1400 } })], "s1");
    expect(p[0].stato).toBe("secondo_rilievo");
    expect(p[0].differenze.find((d) => d.asse === "larghezza_mm")).toMatchObject({ prima: 1200, dopo: 1215, delta: 15 });
  });

  it("legge anche le misure provvisorie scritte come larghezza", () => {
    expect(differenzeMisure({ larghezza: 1000, altezza: 1000 }, { larghezza_mm: 1005, altezza_mm: 1000 })[0].delta).toBe(5);
  });
});

describe("scarto e testi", () => {
  const scarto = { larghezza_mm: { prev: 1200, def: 1206, delta: 6 }, altezza_mm: { prev: 1400, def: 1400, delta: 0 } };
  it("confronta con la soglia dell'azienda", () => {
    expect(scartoDellaRiga(scarto, 5)).toMatchObject({ massimoMm: 6, oltreSoglia: true });
    expect(scartoDellaRiga(scarto, 6).oltreSoglia).toBe(false);
  });
  it("una quantità diversa si segnala", () => {
    expect(scartoDellaRiga({ quantita: { prev: 12, def: 12.5, delta: 0.5 } }, 5).oltreSoglia).toBe(true);
  });
  it("scrive le misure per esteso", () => {
    expect(misureInTesto({ larghezza_mm: 1200, altezza_mm: 1400 })).toBe("1200 × 1400 mm");
    expect(misureInTesto({ quantita: 12.5 }, "mq")).toBe("12,5 mq");
  });
});

describe("elenco del tecnico", () => {
  it("chiede foro in cm per una finestra e converte in millimetri", () => {
    const s = schedaDellaPosizione({ id: "r", name: "Finestra PVC", misure_preventivo: { larghezza_mm: 1200, altezza_mm: 1400 } }, schema);
    expect(s).toMatchObject({ elementType: "infisso", forma: "LxH", misuraTipo: "foro" });
    expect(s.campi.map((c) => [c.chiave, c.unita])).toEqual([["larghezza_foro", "cm"], ["altezza_foro", "cm"]]);
    expect(misureDaCampi(s.campi, { larghezza_mm: "120,5", altezza_mm: "140" })).toEqual({ larghezza_mm: 1205, altezza_mm: 1400 });
    expect(valoreNelCampo({ larghezza_mm: 1205 }, s.campi[0])).toBe("120.5");
  });
  it("una misura mancante non si salva a metà", () => {
    const s = schedaDellaPosizione({ id: "r", name: "Finestra" , misure_preventivo: { larghezza_mm: 1, altezza_mm: 1 } }, schema);
    expect(misureDaCampi(s.campi, { larghezza_mm: "120", altezza_mm: "" })).toBeNull();
  });
  it("una riga a mq chiede la quantità", () => {
    const s = schedaDellaPosizione({ id: "r", name: "Piastrelle", unita_misura: "mq" }, schema);
    expect(s).toMatchObject({ elementType: "rivestimenti", forma: "mq" });
    expect(s.campi[0]).toMatchObject({ asse: "quantita", unita: "mq" });
  });
  it("una pergola chiede anche la profondità", () => {
    const s = schedaDellaPosizione({ id: "r", name: "Pergola bioclimatica", misura_forma: "LxPxH" }, schema);
    expect(s.campi.map((c) => c.asse)).toEqual(["larghezza_mm", "profondita_mm", "altezza_mm"]);
  });
});

describe("divisione di una riga e indice anti-doppione", () => {
  const originale = { id: "o1", order_id: "x", name: "Finestra", survey_element_id: "e1", componente: "infisso", measure_status: "confermato", misure_da_ordinare: { larghezza_mm: 1190 } };

  it("la parte divisa porta misure e rilievo e dichiara da dove nasce", () => {
    const parte = parteDivisa(originale, { phaseId: "f2", quantity: 1 });
    expect(parte).toMatchObject({ survey_element_id: "e1", componente: "infisso", misure_da_ordinare: { larghezza_mm: 1190 }, diviso_da: "o1" });
  });
  it("dividendo una parte si risale alla prima riga", () => {
    expect(parteDivisa({ ...originale, id: "o2", diviso_da: "o1" }, { phaseId: null, quantity: 1 }).diviso_da).toBe("o1");
  });
  it("una riga normale non cambia", () => {
    const parte = parteDivisa({ id: "n", order_id: "x", name: "Silicone" }, { phaseId: null, quantity: 1 });
    expect(parte).not.toHaveProperty("diviso_da");
    expect(CAMPI_CHE_SEGUONO_LA_DIVISIONE).toEqual(expect.arrayContaining(["survey_element_id", "misure_da_ordinare", "misura_tipo", "misura_forma", "componente", "gioco_posa_mm", "sfrido"]));
  });
  it("l'indice esclude le parti divise, altrimenti la divisione si romperebbe", () => {
    const sql = readFileSync("supabase/migrations/20290102100000_sopralluogo_misure_definitive.sql", "utf8");
    expect(sql).toMatch(/order_items_rilievo_componente_unico[\s\S]*?where survey_element_id is not null and diviso_da is null/);
  });
});

/**
 * Fattura da commessa, 31/10/2026: tipo di cliente e clausole. Una clausola che
 * cambia l'IVA deve cambiarla davvero (righe, totali, XML), e le clausole scritte
 * devono comparire anche sulla copia di cortesia, non solo nell'XML.
 */
import { describe, expect, it } from "vitest";
import {
  avvisiClausole,
  clausolePredefinite,
  componiFattura,
  profiloDaCliente,
  testoTrattenuta,
  tipoRitenutaPerForma,
} from "@/lib/fatturazione/clausoleFattura";
import { clausoleDocumento } from "../../../supabase/functions/generate-native-pdf/documentoHtml";
import type { RigaDocumento } from "@/types/fatturazione";

const riga = (prezzo: number, aliquota = 10): RigaDocumento => ({
  id: "r1", numero_linea: 0, descrizione: "SAL 40%", quantita: 1, unita_misura: "a corpo",
  prezzo_unitario: prezzo, imponibile: 0, aliquota_iva: String(aliquota), imposta: 0, totale_riga: 0,
});

describe("profilo proposto dall'anagrafica", () => {
  it("segue il tipo cliente e riconosce il condominio dal nome", () => {
    expect(profiloDaCliente("B2C", "Mario Rossi")).toBe("privato");
    expect(profiloDaCliente("B2B", "Edil Srl")).toBe("impresa");
    expect(profiloDaCliente("PA", "Comune di Lecco")).toBe("pa");
    expect(profiloDaCliente("B2C", "Condominio Via Roma 12")).toBe("condominio");
    expect(profiloDaCliente(undefined, "Domenico Ricci")).toBe("privato");
  });

  it("spunta in partenza le clausole del tipo e l'IVA agevolata della commessa", () => {
    expect(clausolePredefinite("pa", 22)).toEqual(expect.arrayContaining(["split_payment", "tracciabilita"]));
    expect(clausolePredefinite("privato", 10)).toContain("iva_10_recupero");
    expect(clausolePredefinite("privato", 22)).not.toContain("iva_10_recupero");
    expect(clausolePredefinite("condominio", 10)).toEqual(expect.arrayContaining(["ritenuta_condominio", "iva_10_recupero"]));
  });
});

describe("effetti fiscali", () => {
  it("senza clausole fiscali: IVA normale, il cliente paga il totale", () => {
    const f = componiFattura([riga(1000)], ["garanzia_opera"]);
    expect(f.totali.imponibile_totale).toBe(1000);
    expect(f.totali.iva_totale).toBe(100);
    expect(f.totali.totale_da_pagare).toBe(1100);
    expect(f.effetti.esigibilita_iva).toBe("I");
  });

  it("scissione dei pagamenti: esigibilità S e l'ente paga solo l'imponibile", () => {
    const f = componiFattura([riga(1000, 22)], ["split_payment"]);
    expect(f.effetti.esigibilita_iva).toBe("S");
    expect(f.totali.totale_documento).toBe(1220);
    expect(f.totali.totale_da_pagare).toBe(1000);
    expect(f.totali.riepilogo_iva[0].esigibilita).toBe("S");
  });

  it("inversione contabile: righe a IVA zero con natura N6.3, e vince sulla scissione", () => {
    const f = componiFattura([riga(1000, 22)], ["reverse_charge_edile", "split_payment"]);
    expect(f.righe[0].natura_iva).toBe("N6_3");
    expect(f.righe[0].aliquota_iva).toBe("0");
    expect(f.totali.iva_totale).toBe(0);
    expect(f.totali.totale_da_pagare).toBe(1000);
    expect(f.effetti.esigibilita_iva).toBe("I");
    expect(avvisiClausole(["reverse_charge_edile", "split_payment"])).toHaveLength(1);
  });

  it("inversione contabile per impianti e completamento: natura N6.7", () => {
    const f = componiFattura([riga(1000, 22)], ["reverse_charge_completamento"]);
    expect(f.righe[0].natura_iva).toBe("N6_7");
    expect(f.totali.iva_totale).toBe(0);
  });

  it("trattenuta a garanzia: riga in negativo per aliquota, l'importo da pagare è quello incassato", () => {
    const f = componiFattura([riga(1000, 10), { ...riga(500, 22), id: "r2" }], ["trattenuta_garanzia"]);
    const neg = f.righe.filter((r) => r.id.startsWith("trattenuta-"));
    expect(neg.map((r) => [r.aliquota_iva, r.imponibile])).toEqual([["10", -50], ["22", -25]]);
    expect(f.totali.imponibile_totale).toBe(1425);
    expect(f.totali.iva_totale).toBe(95 + 104.5);
    expect(f.trattenute).toEqual([{ id: "trattenuta_garanzia", percentuale: 5, importo: 75 }]);
    expect(testoTrattenuta(f.trattenute[0])).toMatch(/5% .*75,00 €.*svincolo/);
  });

  it("la percentuale della trattenuta si cambia; lo 0,50% dei lavori pubblici è a parte", () => {
    const f = componiFattura([riga(10000, 22)], ["ritenuta_garanzia_pa", "split_payment"], { percentuali: { ritenuta_garanzia_pa: 0.5 } });
    expect(f.trattenute[0].importo).toBe(50);
    expect(f.totali.imponibile_totale).toBe(9950);
    expect(f.totali.totale_da_pagare).toBe(9950);
    const g = componiFattura([riga(1000)], ["trattenuta_garanzia"], { percentuali: { trattenuta_garanzia: 10 } });
    expect(g.totali.imponibile_totale).toBe(900);
  });

  it("trattenuta con inversione contabile: la riga negativa ha la stessa natura", () => {
    const f = componiFattura([riga(1000, 22)], ["reverse_charge_edile", "trattenuta_garanzia"]);
    expect(f.righe[1]).toMatchObject({ natura_iva: "N6_3", aliquota_iva: "0", imponibile: -50 });
  });

  it("condominio: ritenuta del 4% sull'imponibile, causale W, tipo secondo la forma giuridica", () => {
    const f = componiFattura([riga(1000)], ["ritenuta_condominio"], { formaGiuridica: "SRL" });
    expect(f.totali.ritenuta_importo).toBe(40);
    expect(f.totali.totale_da_pagare).toBe(1060);
    expect(f.effetti).toMatchObject({ ritenuta_acconto: true, ritenuta_aliquota: 4, ritenuta_causale: "W", ritenuta_tipo: "RT02" });
    expect(tipoRitenutaPerForma("Ditta Individuale")).toBe("RT01");
  });

  it("le righe escono calcolate e numerate come le ricalcola l'editor", () => {
    const f = componiFattura([riga(500), { ...riga(250), id: "r2", sconto_percentuale: 10 }], []);
    expect(f.righe.map((r) => r.numero_linea)).toEqual([1, 2]);
    expect(f.righe[1].imponibile).toBe(225);
    expect(f.totali.imponibile_totale).toBe(725);
  });
});

describe("clausole sulla copia di cortesia", () => {
  it("mostra le causali senza ripetere quelle che dicono già le note fiscali", () => {
    expect(clausoleDocumento({
      causale: ["Garanzia ai sensi dell'art. 1667 c.c.", "Scissione dei pagamenti — art. 17-ter", "", "Garanzia ai sensi dell'art. 1667 c.c."],
    })).toEqual(["Garanzia ai sensi dell'art. 1667 c.c."]);
    expect(clausoleDocumento({})).toEqual([]);
  });
});

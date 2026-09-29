/**
 * «Copia configurazione su…»: la copia di un modello su un altro intervento.
 *
 * Le due funzioni pure (copiaStessoTipo, copiaCampiComuni) sono il cuore:
 *  - stesso tipo → copia TUTTO, riscrivendo solo l'identità (id/company/modulo e,
 *    dove esiste, pdf_blocchi.modulo_intervento — fotovoltaico, elettrico, piscine);
 *  - tipo diverso → sui predefiniti della destinazione si sovrappongono SOLO i
 *    campi comuni; le parti tecniche restano dei predefiniti.
 * La copia è indipendente: mutare la copia non tocca l'originale.
 */
import { describe, it, expect } from "vitest";
import {
  copiaStessoTipo,
  copiaCampiComuni,
  risolviTipoModello,
  classificaCopia,
  copiaConfigurazioneSuModulo,
  caricaModello,
  type AnagraficaDocumento,
} from "@/lib/moduli-vendita/copiaModello";
import { createFullFvTemplate } from "@/lib/moduli-vendita/fullFvModules";
import { createFullEltTemplate } from "@/lib/moduli-vendita/fullEltModules";
import { createFullBgnTemplate } from "@/lib/moduli-vendita/fullBgnModules";
import { saveLocalBgnTemplate } from "@/lib/moduli-vendita/localBgnTemplates";
import type { FvTemplate } from "@/components/fotovoltaico/FotovoltaicoTemplateEditor";
import type { EleTemplatePdf } from "@/types/elettrico";
import type { BgnTemplatePdf } from "@/types/bagni";

const CO = "company-a";
const anagrafica: AnagraficaDocumento = { name: "Rossi Srl", address: "Via 1", email: "a@b.it", phone: "011" };
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => { values.set(k, v); } };
};

describe("risolviTipoModello / classificaCopia", () => {
  it("rispecchia l'instradamento della libreria", () => {
    expect(risolviTipoModello("fotovoltaico", "nuovo")).toBe("fv");
    expect(risolviTipoModello("bagni", "completo")).toBe("bgn");
    expect(risolviTipoModello("facciate", "cappotto")).toBe("rst"); // Facciate → Ristrutturazione
    expect(risolviTipoModello("giardini", "giardino")).toBe("pav");
    expect(risolviTipoModello("tetti", "amianto")).toBe("tetti"); // tetti è interamente tipizzato
    expect(risolviTipoModello("serramenti", "grate")).toBe("serramenti");
    // Fallback difensivo: una combinazione area/modulo non riconosciuta.
    expect(risolviTipoModello("area-ignota", "x")).toBe("documento");
  });
  it("classifica la copia possibile", () => {
    expect(classificaCopia("bgn", "bgn")).toBe("completa");
    expect(classificaCopia("bgn", "clm")).toBe("comune");
    expect(classificaCopia("bgn", "documento")).toBe("no");
    expect(classificaCopia("documento", "fv")).toBe("no");
  });
});

describe("copiaStessoTipo — copia completa con identità riscritta", () => {
  it("fotovoltaico: id, company e pdf_blocchi.modulo_intervento sulla destinazione", () => {
    const src = createFullFvTemplate({} as FvTemplate, CO, "nuovo");
    const copia = copiaStessoTipo(src, "fv", "fotovoltaico", "accumulo", CO);
    expect(copia.id).toBe("local-fotovoltaico-accumulo");
    expect(copia.company_id).toBe(CO);
    expect((copia.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("accumulo");
    // Originale intatto.
    expect(src.id).toBe("local-fotovoltaico-nuovo");
    expect((src.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("nuovo");
    // Indipendenza: mutare la copia non tocca l'originale.
    copia.pdf_cover_hero = "MODIFICATO";
    (copia.pdf_blocchi as Record<string, unknown>).modulo_intervento = "manutenzione";
    expect(src.pdf_cover_hero).not.toBe("MODIFICATO");
    expect((src.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("nuovo");
  });
  it("elettrico: riscrive pdf_blocchi.modulo_intervento (validato dal salvataggio)", () => {
    const src = createFullEltTemplate({ company_id: CO } as EleTemplatePdf, "completo");
    const copia = copiaStessoTipo(src, "elt", "elettrico", "quadro", CO);
    expect(copia.id).toBe("local-elettrico-quadro");
    expect((copia.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("quadro");
    expect((src.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("completo");
  });
  it("documento essenziale: riscrive companyId/areaId/moduleId", () => {
    const src = { version: 1 as const, companyId: CO, areaId: "area-a", moduleId: "mod-a", title: "T", pages: [] as unknown[] };
    const copia = copiaStessoTipo(src, "documento", "area-b", "mod-b", CO);
    expect(copia.moduleId).toBe("mod-b");
    expect(copia.areaId).toBe("area-b");
    expect(copia.companyId).toBe(CO);
    expect(src.moduleId).toBe("mod-a"); // originale intatto
  });
});

describe("copiaCampiComuni — solo i campi comuni, parti tecniche intatte", () => {
  const sorgente = {
    id: "local-bagni-completo", company_id: CO,
    chi_siamo: "La nostra impresa", color_primary: "#111111", ragione_sociale: "Rossi Srl",
    esigenze: [{ titolo: "tecnica bagno" }], pdf_blocchi: { modulo_intervento: "completo" },
  };
  const base = {
    id: "local-climatizzazione-monosplit", company_id: CO,
    chi_siamo: "default clm", color_primary: "#999999", ragione_sociale: null as string | null,
    esigenze: [{ titolo: "tecnica clm" }], pdf_blocchi: { modulo_intervento: "monosplit" },
  };

  it("copia i campi comuni elencati, lascia le parti tecniche e l'identità della destinazione", () => {
    const out = copiaCampiComuni(sorgente, base, ["chi_siamo", "color_primary", "ragione_sociale"]);
    expect(out.chi_siamo).toBe("La nostra impresa");
    expect(out.color_primary).toBe("#111111");
    expect(out.ragione_sociale).toBe("Rossi Srl");
    // Parti tecniche NON copiate: restano quelle della destinazione.
    expect(out.esigenze).toEqual([{ titolo: "tecnica clm" }]);
    expect(out.pdf_blocchi).toEqual({ modulo_intervento: "monosplit" });
    // Identità della destinazione intatta (non è tra i campi comuni).
    expect(out.id).toBe("local-climatizzazione-monosplit");
  });

  it("non copia un campo assente sulla sorgente e non tocca sorgente/base (indipendenza)", () => {
    const out = copiaCampiComuni(sorgente, base, ["chi_siamo", "logo_url", "esigenze"]);
    // esigenze È nell'elenco e presente su entrambi → verrebbe copiato: qui verifichiamo l'indipendenza.
    expect(out.chi_siamo).toBe("La nostra impresa");
    expect("logo_url" in out).toBe(false); // assente sulla sorgente → non aggiunto
    out.esigenze[0].titolo = "MUT";
    (out as { chi_siamo: string }).chi_siamo = "MUT";
    expect(sorgente.esigenze[0].titolo).toBe("tecnica bagno");
    expect(base.esigenze[0].titolo).toBe("tecnica clm");
    expect(sorgente.chi_siamo).toBe("La nostra impresa");
  });
});

describe("copiaConfigurazioneSuModulo — orchestrazione end-to-end (storage finto)", () => {
  const sorgenteBgn = () => {
    const base = { company_id: CO, chi_siamo: "La nostra impresa", color_primary: "#123456", ragione_sociale: "Rossi Srl", telefono: "0110000", email: "info@rossi.it" } as unknown as BgnTemplatePdf;
    return createFullBgnTemplate(base, "completo");
  };

  it("stesso tipo (bagni → bagni): copia completa, identità riscritta, originale intatto", () => {
    const port = storage();
    const src = sorgenteBgn();
    const esito = copiaConfigurazioneSuModulo({
      companyId: CO, anagrafica,
      sorgente: { areaId: "bagni", moduleId: "completo", tipo: "bgn", template: src },
      destinazione: { areaId: "bagni", moduleId: "doccia" },
      sovrascrivi: false, storage: port,
    });
    expect(esito.esito).toBe("copiato");
    const copia = caricaModello(CO, "bagni", "doccia", port)!;
    const t = copia.template as BgnTemplatePdf;
    expect(t.id).toBe("local-bagni-doccia");
    expect(t.chi_siamo).toBe("La nostra impresa");
    expect(t.esigenze).toEqual(src.esigenze); // stesso tipo = copia completa
    expect((t.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("doccia");
    expect(src.id).toBe("local-bagni-completo"); // originale intatto
  });

  it("tipo diverso (bagni → climatizzazione): copia branding/azienda, tecnica dai predefiniti", () => {
    const port = storage();
    const src = sorgenteBgn();
    const esito = copiaConfigurazioneSuModulo({
      companyId: CO, anagrafica,
      sorgente: { areaId: "bagni", moduleId: "completo", tipo: "bgn", template: src },
      destinazione: { areaId: "climatizzazione", moduleId: "monosplit" },
      sovrascrivi: false, storage: port,
    });
    expect(esito.esito).toBe("copiato");
    const t = caricaModello(CO, "climatizzazione", "monosplit", port)!.template as Record<string, unknown>;
    expect(t.id).toBe("local-climatizzazione-monosplit");
    expect(t.company_id).toBe(CO);
    expect(t.chi_siamo).toBe("La nostra impresa"); // comune, copiato
    expect(t.color_primary).toBe("#123456"); // comune, copiato
    expect(t.ragione_sociale).toBe("Rossi Srl"); // comune, copiato
    // Tecnica dai predefiniti Climatizzazione, non da Bagni.
    expect(t.esigenze).not.toEqual(src.esigenze);
    expect((t.pdf_blocchi as Record<string, unknown>).modulo_intervento).toBe("monosplit");
    expect((t.pdf_blocchi as Record<string, unknown>).comeFunziona).toBeTruthy();
  });

  it("tipo diverso verso una forma diversa (bagni → serramenti): salva valido, azienda copiata, tecnica dai predefiniti", () => {
    const port = storage();
    const src = sorgenteBgn();
    const esito = copiaConfigurazioneSuModulo({
      companyId: CO, anagrafica,
      sorgente: { areaId: "bagni", moduleId: "completo", tipo: "bgn", template: src },
      destinazione: { areaId: "serramenti", moduleId: "finestre" },
      sovrascrivi: false, storage: port,
    });
    expect(esito.esito).toBe("copiato");
    const t = caricaModello(CO, "serramenti", "finestre", port)!.template as Record<string, unknown>;
    expect(t.id).toBe("local-serramenti-finestre");
    expect(t.company_id).toBe(CO);
    expect(t.ragione_sociale).toBe("Rossi Srl"); // anagrafica comune, copiata
    // Serramenti usa `colore_primario` (Bagni usa `color_primary`): niente travaso col nome sbagliato.
    expect(t.colore_primario).not.toBe("#123456");
    expect(typeof t.pdf_cover_hero).toBe("string"); // struttura serramenti dai predefiniti
    expect(Array.isArray(t.esigenze_default)).toBe(true);
  });

  it("destinazione già configurata: saltata senza sovrascrittura, copiata con sovrascrittura", () => {
    const port = storage();
    // Una destinazione bagni/doccia già salvata.
    saveLocalBgnTemplate(CO, "doccia", createFullBgnTemplate({ company_id: CO } as BgnTemplatePdf, "doccia"), null, port);
    const src = sorgenteBgn();
    const args = {
      companyId: CO, anagrafica,
      sorgente: { areaId: "bagni", moduleId: "completo", tipo: "bgn" as const, template: src },
      destinazione: { areaId: "bagni", moduleId: "doccia" },
      storage: port,
    };
    expect(copiaConfigurazioneSuModulo({ ...args, sovrascrivi: false }).esito).toBe("saltato");
    expect((caricaModello(CO, "bagni", "doccia", port)!.template as BgnTemplatePdf).chi_siamo ?? null).not.toBe("La nostra impresa");
    expect(copiaConfigurazioneSuModulo({ ...args, sovrascrivi: true }).esito).toBe("copiato");
    expect((caricaModello(CO, "bagni", "doccia", port)!.template as BgnTemplatePdf).chi_siamo).toBe("La nostra impresa");
  });
});

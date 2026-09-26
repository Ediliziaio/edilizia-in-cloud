/**
 * Libreria listino → «Prodotti singoli» (25/09/2026): i modelli di un prodotto
 * alla volta che le aziende prendono con «Importa → Modelli pronti».
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FILTRO_VUOTO,
  MODALITA_PREZZO,
  categorieProdotti,
  etichettaModalita,
  etichettaSlug,
  filtraProdotti,
  gruppiProdotti,
  testoConteggio,
  type ProdottoLibreria,
} from "@/lib/listino/prodottiLibreria";
import { VERTICALI_GALLERIA } from "@/lib/verticalMapping";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function prodotto(extra: Partial<ProdottoLibreria>): ProdottoLibreria {
  return {
    id: "1",
    nome: "Finestra 1 anta",
    vertical_slug: "serramenti",
    categoria_slug: "infissi",
    tipologia: "F1",
    tags: ["pvc", "1anta"],
    modalita_prezzo_base: "griglia",
    image_url: null,
    is_active: true,
    sort_order: 0,
    ...extra,
  };
}

const finestra = prodotto({});
const portafinestra = prodotto({ id: "2", nome: "Portafinestra 2 ante", tipologia: "PF2", tags: ["alluminio", "2ante"] });
const tapparella = prodotto({ id: "3", nome: "Tapparella", categoria_slug: "tapparelle", tipologia: null, tags: ["avvolgibile"], modalita_prezzo_base: "mq" });
const vecchia = prodotto({ id: "4", nome: "Zanzariera laterale", categoria_slug: "zanzariere", tags: null, is_active: false });
const tutti = [finestra, portafinestra, tapparella, vecchia];

describe("le modalità di prezzo", () => {
  it("sono esattamente quelle del CHECK nel database: un valore diverso non si salva", () => {
    const sql = leggi("supabase/migrations/20270513130000_article_family_templates.sql");
    expect(sql).toContain("CHECK (modalita_prezzo_base IN ('pz','mq','griglia','misura_libera'))");
    expect(MODALITA_PREZZO.map((m) => m.value)).toEqual(["pz", "mq", "griglia", "misura_libera"]);
  });

  it("si leggono in italiano; un valore sconosciuto resta com'è", () => {
    expect(etichettaModalita("griglia")).toBe("Griglia L×H");
    expect(etichettaModalita("mq")).toBe("Al mq");
    expect(etichettaModalita("altro")).toBe("altro");
    expect(etichettaModalita(null)).toBe("");
  });
});

describe("le etichette", () => {
  it("dagli slug ai nomi", () => {
    expect(etichettaSlug("porta_finestra")).toBe("Porta Finestra");
    expect(etichettaSlug("senza-categoria")).toBe("Senza categoria");
    expect(etichettaSlug("")).toBe("Senza categoria");
  });

  it("il riassunto sopra l'elenco", () => {
    expect(testoConteggio(48, 6)).toBe("48 prodotti in 6 categorie");
    expect(testoConteggio(3, 1)).toBe("3 prodotti");
    expect(testoConteggio(1, 1)).toBe("1 prodotto");
    expect(testoConteggio(0, 0)).toBe("0 prodotti");
  });
});

describe("i filtri", () => {
  it("senza filtri si vede tutto, anche i nascosti", () => {
    expect(filtraProdotti(tutti, FILTRO_VUOTO)).toHaveLength(4);
  });

  it("la ricerca guarda nome, codice, categoria e tag", () => {
    const cerca = (q: string) => filtraProdotti(tutti, { ...FILTRO_VUOTO, cerca: q }).map((p) => p.id);
    expect(cerca("portafinestra")).toEqual(["2"]);
    expect(cerca("pf2")).toEqual(["2"]);
    expect(cerca("tapparelle")).toEqual(["3"]);
    expect(cerca("avvolg")).toEqual(["3"]);
    expect(cerca("   ")).toHaveLength(4);
  });

  it("categoria, tag e nascosti si sommano", () => {
    expect(filtraProdotti(tutti, { ...FILTRO_VUOTO, categoria: "infissi" }).map((p) => p.id)).toEqual(["1", "2"]);
    expect(filtraProdotti(tutti, { ...FILTRO_VUOTO, categoria: "infissi", tag: "alluminio" }).map((p) => p.id)).toEqual(["2"]);
    expect(filtraProdotti(tutti, { ...FILTRO_VUOTO, soloSpenti: true }).map((p) => p.id)).toEqual(["4"]);
  });
});

describe("i gruppi e le pastiglie", () => {
  it("per verticale e categoria, in ordine; chi non ha categoria va in «Senza categoria»", () => {
    const orfano = prodotto({ id: "5", nome: "Porta", vertical_slug: "porte", categoria_slug: null });
    const gruppi = gruppiProdotti([...tutti, orfano]);
    expect(gruppi.map((g) => g.chiave)).toEqual([
      "porte/senza-categoria",
      "serramenti/infissi",
      "serramenti/tapparelle",
      "serramenti/zanzariere",
    ]);
    expect(gruppi[1].prodotti.map((p) => p.id)).toEqual(["1", "2"]);
    expect(gruppi[0].verticale).toBe("porte");
  });

  it("le categorie con quanti prodotti hanno, senza le vuote", () => {
    expect(categorieProdotti([...tutti, prodotto({ id: "6", categoria_slug: null })])).toEqual([
      { slug: "infissi", conta: 2 },
      { slug: "tapparelle", conta: 1 },
      { slug: "zanzariere", conta: 1 },
    ]);
  });
});

describe("la pagina", () => {
  const pagina = leggi("src/pages/admin/AdminArticleTemplates.tsx");

  it("eliminare chiede conferma col dialogo dell'app, e dice che le aziende tengono la loro copia", () => {
    expect(pagina).toContain("const confirm = useConfirm();");
    expect(pagina).not.toMatch(/if \(confirm\(`/);
    expect(pagina).toContain("Le aziende che l'hanno già preso tengono il loro prodotto");
  });

  it("verticale e modalità si scelgono da un elenco, non si scrivono a mano", () => {
    expect(pagina).toContain("MODALITA_PREZZO.map((m) => <SelectItem");
    expect(pagina).toContain("verticali.map((v) => <SelectItem");
    expect(pagina).not.toContain("<Label>Modalità prezzo</Label><Input");
    expect(pagina).not.toContain("<Label>Verticale</Label><Input");
  });

  it("senza griglia il prezzo di vendita si può cambiare", () => {
    expect(pagina).toContain('{f.modalita_prezzo_base !== "griglia" && (');
    expect(pagina).toContain('set("prezzo_base_vendita"');
  });

  it("la spiegazione della scheda sta sotto il titolo, e l'azienda trova i prodotti in «Importa → Modelli pronti»", () => {
    expect(pagina).toContain("{SPIEGAZIONE[scheda]}");
    expect(pagina).toContain("«Importa → Modelli pronti»");
    expect(pagina).not.toContain("«Importa da template»");
    // Il nome che l'azienda vede davvero, nel menu Importa del suo listino.
    expect(leggi("src/components/listino/FamilyCatalog.tsx")).toContain('etichetta: "Modelli pronti"');
  });

  it("il selettore dell'azienda usa gli stessi elenchi del super admin", () => {
    const picker = leggi("src/components/listino/FamilyTemplatePicker.tsx");
    expect(picker).toContain("...VERTICALI_GALLERIA");
    expect(picker).toContain("etichettaModalita(selected.modalita_prezzo_base)");
    expect(VERTICALI_GALLERIA.map((v) => v.value)).toContain("serramenti");
    expect(VERTICALI_GALLERIA.map((v) => v.value)).toContain("fotovoltaico");
  });
});

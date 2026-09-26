/**
 * Modelli di area del listino (25/09/2026): la fotografia di un'area di
 * un'azienda — tipologie, prodotti con foto e schede, varianti — da installare
 * in un'altra come copia sua.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AreaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import {
  areeModellabili,
  filtraModelli,
  nomeModelloProposto,
  testoContenuto,
  testoEsito,
  testoPrezzi,
  tipologieModellabili,
  type EsitoInstallazione,
} from "@/lib/listino/modelliArea";

const leggi = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function tipologia(extra: Partial<TipologiaListino>): TipologiaListino {
  return {
    chiave: "macro:1",
    nome: "Moduli",
    fonte: "macrocategoria",
    macrocategoriaId: "1",
    categoriaId: null,
    immagineUrl: null,
    accessorio: false,
    categoriaTipo: "principale",
    collegamento: "area",
    attiva: true,
    standard: null,
    articoli: 3,
    linee: [],
    ...extra,
  };
}

function area(chiave: string, tipologie: TipologiaListino[]): AreaListino {
  return { chiave, nome: chiave, standard: null, articoli: 0, tipologie, mancanti: [] };
}

const esito = (extra: Partial<EsitoInstallazione>): EsitoInstallazione => ({
  modello: "Fotovoltaico",
  area: "fotovoltaico",
  tipologie_nuove: 6,
  tipologie_gia_presenti: 0,
  linee_nuove: 0,
  schede_linea: 0,
  prodotti_nuovi: 34,
  prodotti_gia_presenti: 0,
  varianti: 39,
  celle_griglia: 0,
  documenti: 34,
  con_prezzi: false,
  ...extra,
});

describe("cosa c'è in un modello, detto in una riga", () => {
  it("tipologie, prodotti, foto, schede e varianti", () => {
    expect(testoContenuto({ tipologie: 6, prodotti: 34, con_foto: 34, con_scheda: 12, varianti: 39 })).toBe(
      "6 tipologie · 34 prodotti · 34 con foto · 12 con scheda tecnica · 39 varianti",
    );
  });

  it("al singolare, e senza le voci a zero", () => {
    expect(testoContenuto({ tipologie: 1, prodotti: 1 })).toBe("1 tipologia · 1 prodotto");
    expect(testoContenuto(null)).toBe("");
  });
});

describe("quello che l'azienda si trova dopo l'installazione", () => {
  it("prodotti aggiunti e prezzi da mettere", () => {
    const r = testoEsito(esito({}));
    expect(r.titolo).toBe("34 prodotti aggiunti dal modello «Fotovoltaico»");
    expect(r.dettaglio).toBe(`6 tipologie nuove. ${testoPrezzi(false)}`);
  });

  it("una seconda volta non aggiunge doppioni, e lo dice", () => {
    const r = testoEsito(esito({ tipologie_nuove: 0, tipologie_gia_presenti: 6, prodotti_nuovi: 0, prodotti_gia_presenti: 34 }));
    expect(r.titolo).toBe("Nessun prodotto nuovo: il listino ha già tutto il modello «Fotovoltaico»");
    expect(r.dettaglio).toBe("6 tipologie che c'erano già, 34 prodotti già presenti, lasciati com'erano.");
  });

  it("i prezzi: senza, i prodotti restano fuori dai preventivi finché l'azienda non mette i suoi", () => {
    expect(testoPrezzi(false)).toMatch(/fuori dai preventivi/);
    expect(testoPrezzi(true)).toMatch(/prezzi di vendita del modello/);
  });
});

describe("cosa può entrare in un modello", () => {
  it("solo tipologie vere (macrocategorie) con almeno un prodotto", () => {
    const buona = tipologia({});
    const vuota = tipologia({ chiave: "macro:2", macrocategoriaId: "2", articoli: 0 });
    const cartella = tipologia({ chiave: "cat:3", fonte: "categoria", macrocategoriaId: null, categoriaId: "3" });
    const senza = tipologia({ chiave: "senza:fotovoltaico", fonte: "senza", macrocategoriaId: null });
    expect(tipologieModellabili(area("fotovoltaico", [buona, vuota, cartella, senza]))).toEqual([buona]);
  });

  it("le aree senza niente da copiare non si propongono", () => {
    const piena = area("fotovoltaico", [tipologia({})]);
    const vuota = area("bagni", [tipologia({ articoli: 0 })]);
    expect(areeModellabili([piena, vuota])).toEqual([piena]);
  });
});

describe("il nome proposto", () => {
  it("il nome dell'area, e un numero se c'è già", () => {
    expect(nomeModelloProposto("fotovoltaico", [])).toBe("Fotovoltaico");
    expect(nomeModelloProposto("fotovoltaico", ["fotovoltaico"])).toBe("Fotovoltaico 2");
    expect(nomeModelloProposto("fotovoltaico", ["Fotovoltaico", "Fotovoltaico 2"])).toBe("Fotovoltaico 3");
  });
});

describe("la ricerca fra i modelli", () => {
  const modelli = [
    { nome: "Fotovoltaico base", descrizione: "Moduli e inverter", area: "fotovoltaico" },
    { nome: "Serramenti PVC", descrizione: null, area: "serramenti" },
  ];

  it("per nome, descrizione e area; e per area scelta", () => {
    expect(filtraModelli(modelli, "inverter", null).map((m) => m.nome)).toEqual(["Fotovoltaico base"]);
    expect(filtraModelli(modelli, "serramenti", null).map((m) => m.nome)).toEqual(["Serramenti PVC"]);
    expect(filtraModelli(modelli, "", "fotovoltaico").map((m) => m.nome)).toEqual(["Fotovoltaico base"]);
    expect(filtraModelli(modelli, "  ", null)).toHaveLength(2);
  });
});

describe("migrazione: la fotografia non porta via quello che è dell'azienda di origine", () => {
  const sql = leggi("supabase/migrations/20280925160000_modelli_area_listino.sql");
  const fotografia = sql.slice(
    sql.indexOf("create or replace function public.listino_modello_fotografia"),
    sql.indexOf("create or replace function public.listino_modello_riepilogo"),
  );
  const installa = sql.slice(sql.indexOf("create or replace function public.listino_modello_installa"));

  it("nella fotografia non entrano acquisti, fornitori, tariffe di posa", () => {
    for (const campo of ["'prezzo_base_acquisto'", "'supplier_id'", "'posa_tariffa_default_id'", "'maggiorazione_acquisto'", "'sconto_fornitore_1'", "'markup_valore'"]) {
      expect(fotografia, campo).not.toContain(campo);
    }
    // Una sola cella per misura: le righe per linea fornitore sono dell'azienda di origine.
    expect(fotografia).toContain("(lg.supplier_product_line_id is not null)");
  });

  it("i prezzi di vendita solo se il modello li vuole", () => {
    expect(fotografia).toMatch(/'prezzo_base_vendita', case when p_con_prezzi then/);
    expect(fotografia).toMatch(/'pv', case when p_con_prezzi then/);
  });

  it("dei campi dei prodotti solo quelli della tipologia (gli import ci lasciano regole di prezzo)", () => {
    expect(fotografia).toContain("where e.key in (select fd.field_key from public.listino_macrocategoria_fields fd");
  });

  it("solo prodotti attivi, dell'azienda scelta", () => {
    expect(fotografia).toMatch(/f\.company_id = p_company_id\s+and f\.deleted_at is null\s+and f\.attivo/);
  });

  it("installando: niente acquisto né fornitore, e senza prezzi fuori dai preventivi", () => {
    expect(installa).toMatch(/coalesce\(\(v_p ->> 'prezzo_base_vendita'\)::numeric, 0\), null,/);
    expect(installa).toContain("false, 'vendita', 'none', 0,");
    expect(installa).toMatch(/case when v_mod\.con_prezzi_vendita then coalesce\(\(v_p ->> 'mostra_preventivo'\)::boolean, true\) else false end/);
  });

  it("installare due volte non fa doppioni", () => {
    expect(installa).toContain("where company_id = p_company_id and lower(btrim(nome)) = lower(btrim(v_t ->> 'nome'))");
    expect(installa).toContain("v_prod_presenti := v_prod_presenti + 1;");
  });
});

describe("migrazione: chi può fare cosa", () => {
  const sql = leggi("supabase/migrations/20280925160000_modelli_area_listino.sql");

  it("le tabelle le legge solo il super admin", () => {
    expect(sql).toMatch(/alter table public\.listino_modelli_area enable row level security/);
    expect(sql).toMatch(/create policy listino_modelli_area_super_admin[\s\S]*?super_admin/);
    expect(sql).toMatch(/alter table public\.listino_modelli_installazioni enable row level security/);
  });

  it("nessuna funzione aperta ad anon; le interne neanche agli utenti", () => {
    for (const firma of [
      "listino_modello_crea(uuid, uuid[], text, text, text, boolean, boolean)",
      "listino_modello_aggiorna(uuid)",
      "listino_modelli_disponibili()",
      "listino_modello_installa(uuid, uuid)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${firma} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${firma} to authenticated;`);
    }
    expect(sql).toContain("revoke all on function public.listino_modello_fotografia(uuid, uuid[], boolean) from public, anon, authenticated;");
  });

  it("crea e aggiorna solo il super admin; installa anche l'amministratore, solo nella sua azienda e solo i pubblicati", () => {
    const crea = sql.slice(sql.indexOf("function public.listino_modello_crea"), sql.indexOf("function public.listino_modello_aggiorna"));
    expect(crea).toContain("Solo il super admin crea i modelli di area");
    const installa = sql.slice(sql.indexOf("function public.listino_modello_installa"));
    expect(installa).toContain("if not found or (not v_super and not v_mod.pubblicato) then");
    expect(installa).toContain("and public.get_user_company_id(v_uid) = p_company_id)");
    expect(installa).toContain("public.utente_bloccato()");
  });
});

describe("le pagine", () => {
  it("Libreria listino: tre schede, i modelli di area per primi", () => {
    const pagina = leggi("src/pages/admin/AdminArticleTemplates.tsx");
    expect(pagina).toContain('<TabsTrigger value="aree"');
    expect(pagina).toContain('<TabsTrigger value="prodotti"');
    expect(pagina).toContain('<TabsTrigger value="marche"');
    expect(pagina).toContain("<ModelliAreaTab />");
    expect(leggi("src/components/layouts/AdminLayout.tsx")).toContain('title: "Libreria listino"');
  });

  it("«+ Area» nel listino dell'azienda installa dal modello e apre l'area", () => {
    const dialog = leggi("src/components/listino/NuovaAreaDialog.tsx");
    expect(dialog).toContain("useModelliDisponibili(true)");
    expect(dialog).toContain("installa.mutate(");
    expect(dialog).toContain("onAreaDaModello?.(modello.area);");
    expect(leggi("src/components/listino/FamilyCatalog.tsx")).toContain("onAreaDaModello={(area) => cambiaSelezione({ area })}");
  });

  it("l'hook chiama le funzioni del database, e dopo l'installazione rilegge il listino", () => {
    const hook = leggi("src/hooks/useModelliArea.ts");
    expect(hook).toContain('supabase.rpc("listino_modello_installa" as never');
    expect(hook).toContain('supabase.rpc("listino_modello_crea" as never');
    expect(hook).toContain("invalidaListinoNelPreventivatore(qc);");
  });
});

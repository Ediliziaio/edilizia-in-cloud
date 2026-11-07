/**
 * La riconciliazione dei materiali esiste due volte: nella pagina
 * (planMaterial, statoMateriale) e nel database (_materiali_riconciliazione_righe,
 * migrazione 20281222150000), che servirà a cruscotto e promemoria.
 *
 * I cinque casi qui sotto sono stati fatti girare anche nel database il
 * 07/11/2026, con righe e ordini veri in una transazione annullata: i numeri
 * attesi in «db» sono quelli che ha restituito la funzione SQL. Se la pagina
 * cambia regola, questo test si rompe e ricorda di cambiare anche la funzione
 * (e viceversa).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planMaterial, type ProcurementCoverage } from "@/lib/orders/materialProcurement";
import { statoMateriale } from "@/lib/distinta/statoMateriale";
import { siCompraAPezzi } from "@/lib/distinta/generaDistinta";
import { erroreDivisione } from "@/hooks/useOrderWorkPhases";

type Caso = {
  nome: string;
  quantity: number;
  unita: string;
  ordini: Array<{ stato: string; quantity: number; ricevuta: number; unita: string }>;
  db: { in_bozza: number; ordinato: number; ricevuto: number; coperto: number; residuo: number; eccedenza: number; unita_diversa: boolean; stato: string };
};

const CASI: Caso[] = [
  {
    nome: "A — 12,4 kg ordinati per intero: residuo zero, niente arrotondamento",
    quantity: 12.4, unita: "kg",
    ordini: [{ stato: "inviato", quantity: 12.4, ricevuta: 0, unita: "kg" }],
    db: { in_bozza: 0, ordinato: 12.4, ricevuto: 0, coperto: 12.4, residuo: 0, eccedenza: 0, unita_diversa: false, stato: "ordinato" },
  },
  {
    nome: "B — 6 kg ordinati e 2 in bozza su 10: ne mancano 2",
    quantity: 10, unita: "kg",
    ordini: [
      { stato: "inviato", quantity: 6, ricevuta: 0, unita: "kg" },
      { stato: "bozza", quantity: 2, ricevuta: 0, unita: "kg" },
    ],
    db: { in_bozza: 2, ordinato: 6, ricevuto: 0, coperto: 8, residuo: 2, eccedenza: 0, unita_diversa: false, stato: "ordinato" },
  },
  {
    nome: "C — 7 pezzi arrivati su 5 previsti: eccedenza 2",
    quantity: 5, unita: "pz",
    ordini: [{ stato: "confermato", quantity: 7, ricevuta: 7, unita: "pz" }],
    db: { in_bozza: 0, ordinato: 7, ricevuto: 7, coperto: 7, residuo: 0, eccedenza: 2, unita_diversa: false, stato: "consegnato" },
  },
  {
    nome: "D — ordine in rotoli su un materiale in m²: unità diversa, da verificare",
    quantity: 10, unita: "mq",
    ordini: [{ stato: "inviato", quantity: 3, ricevuta: 0, unita: "rotoli" }],
    db: { in_bozza: 0, ordinato: 3, ricevuto: 0, coperto: 3, residuo: 7, eccedenza: 0, unita_diversa: true, stato: "ordinato" },
  },
  {
    nome: "E — l'ordine annullato non conta",
    quantity: 4, unita: "pz",
    ordini: [{ stato: "annullato", quantity: 4, ricevuta: 0, unita: "pz" }],
    db: { in_bozza: 0, ordinato: 0, ricevuto: 0, coperto: 0, residuo: 4, eccedenza: 0, unita_diversa: false, stato: "da_ordinare" },
  },
];

const copertura = (c: Caso): ProcurementCoverage[] =>
  c.ordini.map((o, i) => ({
    id: `poi-${i}`, order_item_id: "m", quantity: o.quantity, quantity_received: o.ricevuta, unit_of_measure: o.unita,
    purchase_orders: { id: `po-${i}`, oda_number: `ODA-${i}`, status: o.stato },
  }));

describe("riconciliazione dei materiali: pagina e database dicono la stessa cosa", () => {
  for (const c of CASI) {
    it(c.nome, () => {
      const riga = { id: "m", name: "materiale", quantity: c.quantity, unita_misura: c.unita, status: "da_ordinare" };
      const piano = planMaterial(riga, copertura(c));
      const stato = statoMateriale({ ...riga, supplier_rfq_item_id: null }, copertura(c));

      expect(piano.drafted).toBe(c.db.in_bozza);
      expect(piano.issued).toBe(c.db.ordinato);
      expect(piano.received).toBe(c.db.ricevuto);
      expect(piano.covered).toBe(c.db.coperto);
      expect(piano.remaining).toBe(c.db.residuo);
      expect(piano.overOrdered).toBe(c.db.eccedenza > 0);
      expect(piano.review?.startsWith("Unità di misura diversa") ?? false).toBe(c.db.unita_diversa);
      expect(stato.stato).toBe(c.db.stato);
    });
  }
});

describe("quantità dei materiali con i decimali", () => {
  it("kg, m², m³ si comprano coi decimali; cad e pz a pezzi interi", () => {
    expect(siCompraAPezzi("pz")).toBe(true);
    expect(siCompraAPezzi("cad")).toBe(true);
    expect(siCompraAPezzi(null)).toBe(true);
    expect(siCompraAPezzi("kg")).toBe(false);
    expect(siCompraAPezzi("m²")).toBe(false);
    expect(siCompraAPezzi("mc")).toBe(false);
  });

  it("un materiale in kg si divide su più fasi anche coi decimali; un articolo di magazzino a pezzi interi", () => {
    // Provato nel database il 07/11/2026: 12,4 kg già ordinati diventano 7,4 + 5, e la riga
    // dell'ordine d'acquisto si divide nello stesso modo (dividi_scarico_magazzino).
    expect(erroreDivisione(12.4, [{ quantity: 7.4 }, { quantity: 5 }], false)).toBeNull();
    expect(erroreDivisione(0.3, [{ quantity: 0.1 }, { quantity: 0.2 }], false)).toBeNull();
    expect(erroreDivisione(12.4, [{ quantity: 7 }, { quantity: 5 }], false)).toMatch(/12,4/);
    expect(erroreDivisione(12.4, [{ quantity: 12.4 }, { quantity: 0 }], false)).toMatch(/maggiore di zero/);
    expect(erroreDivisione(10, [{ quantity: 4.5 }, { quantity: 5.5 }], true)).toMatch(/pezzi interi/);
    expect(erroreDivisione(10, [{ quantity: 4 }, { quantity: 6 }], true)).toBeNull();
    expect(erroreDivisione(10, [{ quantity: 10 }], false)).toMatch(/almeno 2/);
  });

  it("la migrazione porta quantity a numeric e la generazione non arrotonda più all'intero", () => {
    const sql = readFileSync("supabase/migrations/20281222140000_materiali_quantita_decimali.sql", "utf8");
    expect(sql).toMatch(/alter column quantity type numeric\(14,4\)/);
    expect(sql).not.toMatch(/ceil\(coalesce\(\(x\.r->>'quantita_calcolata'\)::numeric, 0\)\)::integer/);
    expect(sql).toMatch(/materiali_tecnico_aggiorna\(p_item uuid, p_quantita numeric/);
  });

  it("salvare, creare e duplicare una commessa non riconvertono la quantità in intero", () => {
    const sql = readFileSync("supabase/migrations/20281222160000_quantita_decimali_salva_e_crea_commessa.sql", "utf8");
    expect(sql).toMatch(/public\.commessa_salva\(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer\)/);
    expect(sql).toMatch(/public\.create_order_atomic\(jsonb,jsonb,jsonb,uuid,jsonb\)/);
    expect(sql).toMatch(/public\.duplica_lavoro_atomic\(text,uuid,boolean,boolean,text,uuid\)/);
    expect(sql).toMatch(/raise exception 'Resta una quantità convertita in intero'/);
    // Il magazzino conta pezzi interi: una riga collegata a un articolo non accetta 12,4.
    expect(sql).toMatch(/before insert or update of quantity, stock_item_id on public\.order_items/);
  });

  it("la riconciliazione nel database resta chiusa: il calcolo solo al service role", () => {
    const sql = readFileSync("supabase/migrations/20281222150000_materiali_riconciliazione.sql", "utf8");
    expect(sql).toMatch(/revoke all on function public\._materiali_riconciliazione_righe\(uuid, uuid\) from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on function public\.materiali_riconciliazione\(uuid\) from public, anon/);
    expect(sql).toMatch(/revoke all on function public\.materiali_riconciliazione_azienda\(uuid, boolean, integer, integer\) from public, anon/);
  });
});

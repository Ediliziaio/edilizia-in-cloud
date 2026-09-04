import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * commessa_salva scavalcava il controllo di modifica concorrente.
 *
 * La protezione esisteva già: il trigger `versione_riga` rifiuta un UPDATE che
 * porta una `version` diversa da quella sulla riga, ed è attivo su orders,
 * quotes, profiles e documenti_fiscali (4 trigger, verificati in produzione).
 * Ma commessa_salva ricostruisce la riga con jsonb_populate_record: NEW.version
 * esce identica a OLD.version, il trigger non ha niente da confrontare, e
 * passando dalla funzione il controllo semplicemente non c'era.
 *
 * Provato su produzione, poi ripulito:
 *   Marco salva con la versione giusta ..... ok, da 1 a 2
 *   Anna salva con la versione vecchia ..... «Questa commessa e' stata modificata
 *                                            da qualcun altro mentre la stavi
 *                                            aprendo (versione 2 invece di 1)»
 *   descrizione rimasta .................... «Marco», il suo lavoro è salvo
 *   senza p_versione ....................... comportamento di prima, per poter
 *                                            adottare la cosa un pezzo per volta
 *
 * Un errore mio, tenuto a verbale: avevo prima aggiunto una colonna
 * `row_version` con il suo trigger, senza accorgermi che `version` c'era già --
 * la sonda cercava 'row_version', 'versione' e 'lock_version', non 'version'.
 * Due contatori sulla stessa riga si davano fastidio: il mio vedeva cambiare
 * `version` e considerava modificata anche una riga che non lo era. Rimosso.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("commessa_salva_rispetta_la_versione"));
if (!nome) throw new Error("migrazione commessa_salva_rispetta_la_versione non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("il doppione se ne va", () => {
  it("la colonna che avevo aggiunto viene tolta da entrambe le tabelle", () => {
    expect(sql).toMatch(/alter table public\.orders drop column if exists row_version/);
    expect(sql).toMatch(/alter table public\.quotes drop column if exists row_version/);
  });

  it("e con lei il trigger e la funzione che la mantenevano", () => {
    expect(sql).toMatch(/drop trigger if exists zz_versione_avanza on public\.orders/);
    expect(sql).toMatch(/drop trigger if exists zz_versione_avanza on public\.quotes/);
    expect(sql).toMatch(/drop function if exists public\.versione_avanza\(\)/);
  });

  it("la riscrittura si rifiuta di partire se resta traccia di row_version", () => {
    expect(sql).toMatch(/or position\('row_version' in v_nuovo\) > 0 then/);
    expect(sql).toMatch(/non ha agganciato tutti i punti/);
  });

  it("l'errore è scritto nel file, non nascosto", () => {
    expect(sql).toMatch(/Nota su un mio errore/);
    expect(sql).toMatch(/senza accorgermi che `version` esisteva gia'/);
  });
});

describe("la funzione usa il contatore che c'era già", () => {
  it("legge `version`, non un contatore suo", () => {
    expect(sql).toMatch(/o\.version into v_company, v_codice, v_ver/);
    // row_version compare solo come bersaglio da sostituire, mai nel risultato:
    // se ne restasse traccia la riscrittura si ferma (controllo qui sotto).
    expect(sql).toMatch(/replace\(v_def, 'o\.row_version into v_company, v_codice, v_ver',\s*\n?\s*'o\.version into v_company, v_codice, v_ver'\)/);
  });

  it("rifiuta il salvataggio se la versione in mano non è più quella", () => {
    expect(sql).toMatch(/if p_versione is not null and v_ver <> p_versione then/);
    expect(sql).toMatch(/modificata da qualcun altro mentre la stavi aprendo/);
  });

  it("il messaggio dice cosa fare, non solo che è andata male", () => {
    expect(sql).toMatch(/Ricarica e riprova: sovrascrivere cancellerebbe il lavoro/);
  });

  it("usa il codice della modifica concorrente, non un errore generico", () => {
    expect(sql).toMatch(/errcode = ''40001''/);
  });

  it("dice a chi legge perché il trigger da solo non basterebbe", () => {
    expect(sql).toMatch(/la funzione non tocca `version`, quindi il trigger non/);
  });

  it("NULL lascia il comportamento di prima, per adottarlo con calma", () => {
    expect(sql).toMatch(/p_versione integer DEFAULT NULL::integer/);
    expect(sql).toMatch(/Lasciarlo a NULL mantiene il comportamento di prima/);
  });

  it("la vecchia firma a sei argomenti sparisce, per non renderla ambigua", () => {
    expect(sql).toMatch(/drop function if exists public\.commessa_salva\(uuid, jsonb, jsonb, jsonb, jsonb, jsonb\)/);
    expect(sql).toMatch(/grant execute on function public\.commessa_salva\(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, integer\) to authenticated/);
  });
});

/**
 * Ondata 2.1 — la scheda cliente deve vedere anche i preventivi dei verticali.
 *
 * Il briefing chiedeva di aggiungere una colonna e recuperare lo storico con un
 * abbinamento una tantum. Guardando i dati, nessuna delle due cose serviva: la
 * colonna c'è già in tutti e dieci i verticali, e i 26 progetti senza
 * riferimento non hanno né email né telefono né nome — non c'è chiave su cui
 * abbinare. Il buco vero è che la scheda cerca solo in `quotes`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const RADICE = resolve(__dirname, "../../..");
const sql = (() => {
  const dir = resolve(RADICE, "supabase/migrations");
  const nome = readdirSync(dir).find((f) => f.includes("preventivi_del_cliente_tutti_i_verticali"));
  if (!nome) throw new Error("migrazione non trovata");
  return readFileSync(resolve(dir, nome), "utf8");
})();
const scheda = readFileSync(resolve(RADICE, "src/pages/azienda/CompanyCustomerDetail.tsx"), "utf8");

describe("2.1 · la funzione cerca dove la scheda non guardava", () => {
  it("interroga sia quotes sia le tabelle dei verticali", () => {
    expect(sql).toMatch(/FROM public\.quotes q/);
    expect(sql).toMatch(/FROM public\.%I p/);          // i rami generati
    expect(sql).toMatch(/table_name::text LIKE '%\\_progetti'/);
  });

  it("il corpo è generato dal catalogo, non ricopiato dieci volte", () => {
    // i dieci schemi non sono uguali: code in 9 su 10, totale in 8
    expect(sql).toMatch(/WHEN 'code'\s+= ANY\(t\.colonne\) THEN 'p\.code'/);
    expect(sql).toMatch(/WHEN 'numero' = ANY\(t\.colonne\) THEN 'p\.numero'/);
    expect(sql).toMatch(/WHEN 'totale'\s+= ANY\(t\.colonne\) THEN 'p\.totale'/);
  });

  it("un verticale che non ha le colonne minime non entra, e se non ne entra nessuno si ferma", () => {
    expect(sql).toMatch(/HAVING array_agg\(c\.column_name::text\) @> ARRAY\['company_id','cliente_id'/);
    expect(sql).toMatch(/nessuna tabella \*_progetti riconosciuta/);
  });

  it("risolve l'identità con tutte le chiavi, non con una sola", () => {
    // il ponte è valorizzato su 0 clienti su 943: se fosse l'unica chiave,
    // la funzione non troverebbe mai niente
    expect(sql).toMatch(/v_contact IS NOT NULL AND p\.cliente_id = v_contact/);
    expect(sql).toMatch(/lower\(btrim\(p\.cliente_email\)\) = v_email/);
    expect(sql).toMatch(/regexp_replace\(coalesce\(p\.cliente_telefono/);
    // e dice come ha agganciato, così chi legge sa quanto fidarsi
    expect(sql).toMatch(/agganciato_da/);
  });

  it("è in sola lettura: non scrive il ponte di nascosto", () => {
    const corpo = sql.split("CREATE OR REPLACE FUNCTION public.cliente_preventivi_e_progetti")[1];
    expect(corpo).toMatch(/STABLE SECURITY DEFINER/);
    expect(corpo).not.toMatch(/UPDATE public\./);
    expect(corpo).not.toMatch(/INSERT INTO public\./);
  });

  it("verifica l'accesso all'azienda del cliente", () => {
    expect(sql).toMatch(/user_can_access_company\(v_company\) IS NOT TRUE/);
    expect(sql).toMatch(/Cliente non trovato/);
  });

  it("la scheda cliente oggi guarda ancora solo quotes: la funzione va adottata", () => {
    // se un giorno questa asserzione fallisce, vuol dire che la traccia
    // interfaccia ha adottato la RPC — allora si aggiorna il test, non il codice
    expect(scheda).toMatch(/\.from\("quotes"\)/);
    expect(scheda).not.toMatch(/cliente_preventivi_e_progetti/);
  });
});

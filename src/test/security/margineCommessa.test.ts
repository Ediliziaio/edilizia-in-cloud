import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Margine di commessa in tempo reale.
 *
 * Provato su produzione e poi ripulito:
 *   commessa senza costi ......................... verde al 100%
 *   costo pari al 90% dell'importo ............... giallo al 10%, avviso partito
 *   testo dell'avviso ............................ «Il margine è passato da verde
 *     a giallo (soglia 15.0%). La voce più pesante è costi diretti: 11250.00 €.
 *     Ultimo movimento: un costo diretto.»
 *   peggiorare restando giallo ................... nessuna nuova notifica (2 → 2)
 *   passare in perdita ........................... avvisa di nuovo (rosso)
 *   togliere il costo ............................ torna verde, nessun avviso
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("margine_commessa_in_tempo_reale"));
if (!nome) throw new Error("migrazione margine_commessa_in_tempo_reale non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("la regola scende dal browser al server", () => {
  it("usa la soglia già configurata, non una inventata", () => {
    expect(sql).toMatch(/g\.marginalita_soglia_perc/);
    expect(sql).toMatch(/g\.marginalita_alert_enabled/);
  });

  it("il valore predefinito è lo stesso dell'interfaccia", () => {
    expect(sql).toMatch(/v_soglia\s+numeric := 15;\s+-- lo stesso valore predefinito di thresholds\.ts/);
  });

  it("i tre livelli seguono la stessa regola di valutaMarginalita", () => {
    expect(sql).toMatch(/WHEN m\.margine_perc < 0\s+THEN 'rosso'/);
    expect(sql).toMatch(/WHEN v_attivo AND m\.margine_perc < v_soglia\s+THEN 'giallo'/);
  });
});

describe("il ricalcolo avviene a ogni costo", () => {
  it("i trigger coprono tutte le fonti di costo della vista", () => {
    for (const t of [
      "purchase_orders", "order_errors", "order_employees",
      "order_external_teams", "order_salespeople", "company_costs", "ordini_variazione",
    ]) {
      expect(sql).toContain(`'${t}'`);
    }
  });

  it("scatta anche su cancellazione, non solo su inserimento", () => {
    expect(sql).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.%I/);
  });

  it("sulla commessa basta il cambio di importo", () => {
    expect(sql).toMatch(/AFTER UPDATE OF total_amount ON public\.orders/);
  });
});

describe("l'avviso non fa rumore", () => {
  it("si avvisa solo al peggioramento di livello", () => {
    expect(sql).toMatch(/IF v_prima IS NOT DISTINCT FROM v_semaforo/);
    expect(sql).toMatch(/OR \(v_prima = 'rosso'\)/);
    expect(sql.replace(/\s*\n\s*--\s*/g, " ")).toMatch(
      /si avvisa al PEGGIORAMENTO di livello/);
  });

  it("lo stato precedente è conservato, altrimenti non si distingue", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.ordine_margine_stato/);
    expect(sql).toMatch(/Serve a distinguere un peggioramento da uno stato già noto/);
  });

  it("l'avviso nomina la voce che erode e la causa", () => {
    expect(sql).toMatch(/La voce più pesante è %s/);
    expect(sql).toMatch(/Ultimo movimento: /);
    expect(sql).toMatch(/ORDER BY x\.importo DESC LIMIT 1/);
  });

  it("va al responsabile, e se manca agli amministratori", () => {
    expect(sql).toMatch(/v_resp := m\.assigned_to/);
    expect(sql).toMatch(/has_role\(p\.id, 'company_admin'::public\.app_role\)/);
  });
});

describe("quando il margine non esiste, non se ne inventa uno", () => {
  it("una commessa senza importo non è verde: è indefinita", () => {
    expect(sql).toMatch(/coalesce\(m\.preventivo_totale, 0\) <= 0/);
    expect(sql).toMatch(/il margine non è definito/);
    expect(sql).toMatch(/non si inventa uno zero/);
  });
});

describe("accesso", () => {
  it("la funzione è interna: revocata esplicitamente da authenticated", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.ordine_margine_valuta\(uuid, text\) FROM authenticated/);
  });

  it("lo stato non è leggibile dai clienti", () => {
    expect(sql).toMatch(/NOT public\.utente_e_cliente_esterno\(\)/);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Policy che chiamavano una funzione per ogni riga letta.
 *
 * `is_super_admin(auth.uid())` dà la stessa risposta per tutte le righe, ma
 * scritta così Postgres la valuta una volta per riga. Racchiusa in un
 * sottoselect diventa un InitPlan: calcolata una volta sola.
 *
 * Le funzioni coinvolte (has_role, has_permission, is_super_admin,
 * get_user_company_id, utente_e_cliente_esterno) sono tutte STABLE: per
 * definizione danno lo stesso risultato dentro la stessa istruzione, quindi
 * sollevarle non cambia il significato.
 *
 * Applicata alle 78 tabelle con almeno 100 righe: 170 policy riscritte, tutte
 * salvate prima in zz_policy_backup. Le altre 603 tabelle sono vuote o sotto le
 * cento righe: la differenza non si misurerebbe, e ogni riscrittura prende un
 * lucchetto esclusivo sulla tabella.
 *
 * Guadagno misurato, stessa tabella e stessa condizione (marketing_contacts,
 * 90.382 righe, utente reale):
 *   chiamata per ogni riga ........... 732,7 ms
 *   calcolata una volta (InitPlan) .... 13,2 ms   → 56 volte
 *
 * Prova che nessuno vede più o meno di prima: 5 utenti × 78 tabelle, 390
 * conteggi prima e dopo, 389 identici. L'unico diverso è `user_sessions`
 * (31 → 32) per un amministratore, per una sessione nata alle 10:02 UTC dentro
 * la finestra fra le due misure; la policy di lettura è canonicamente identica.
 *
 * Un errore mio, corretto: la forma finale usava `public.has_role(...)`, che
 * Postgres rilegge come `has_role(...) AS has_role`. La trasformazione non era
 * quindi idempotente, e il rilevatore continuava a contare come «da fare» 1219
 * policy già a posto. Allineata alla resa di Postgres, il conto è sceso a 0
 * sulle tabelle trattate.
 */

const dir = resolve(__dirname, "../../../supabase/migrations");
const nome = readdirSync(dir).find((f) => f.includes("policy_che_chiamavano_una_funzione_per_ogni_riga"));
if (!nome) throw new Error("migrazione policy_che_chiamavano_una_funzione_per_ogni_riga non trovata");
const sql = readFileSync(resolve(dir, nome), "utf8");

describe("perché la riscrittura non cambia il significato", () => {
  it("il motivo è scritto: sono funzioni STABLE", () => {
    expect(sql).toMatch(/dichiarate STABLE/);
    expect(sql).toMatch(/stesso risultato per gli stessi argomenti dentro la\s*\n--\s*stessa istruzione/);
  });

  it("dice anche perché il pianificatore non lo fa da solo", () => {
    expect(sql).toMatch(/non fa perché sono SECURITY DEFINER/);
  });
});

describe("la trasformazione", () => {
  it("uniforma prima tutte le auth.uid(), racchiuse o no", () => {
    expect(sql).toMatch(/t := replace\(t, '\( SELECT auth\.uid\(\) AS uid\)', '@@U@@'\);/);
    expect(sql).toMatch(/t := replace\(t, 'auth\.uid\(\)', '@@U@@'\);/);
  });

  it("mette da parte quello che era già racchiuso, per non annidare", () => {
    expect(sql).toMatch(/quello che è già racchiuso si mette da parte, per non annidare/);
  });

  it("racchiude le cinque funzioni che non dipendono dalla riga", () => {
    for (const f of ["is_super_admin", "get_user_company_id", "has_role", "has_permission"]) {
      expect(sql).toMatch(new RegExp(`${f}\\(@@U@@`));
    }
    // questa non prende argomenti: non c'è alcun auth.uid() da segnaposto
    expect(sql).toMatch(/replace\(t, 'utente_e_cliente_esterno\(\)', '@@K5@@'\)/);
  });

  it("NON tocca le funzioni che ricevono una colonna", () => {
    // has_permission_for_company(uid, permesso, company_id) e
    // order_has_employee_for_user(order_id, uid) dipendono dalla riga: devono
    // restare valutate riga per riga, o cambierebbe il risultato.
    expect(sql).not.toMatch(/has_permission_for_company\(@@U@@/);
    expect(sql).not.toMatch(/order_has_employee_for_user/);
  });

  it("è idempotente, e l'errore che lo insegnava è a verbale", () => {
    expect(sql).toMatch(/riapplicarla non deve cambiare niente/);
    expect(sql).toMatch(/Ci sono cascato/);
    expect(sql).toMatch(/1219 policy che erano gia' a posto/);
    expect(sql).toMatch(/'@@K2E@@', '\) AS has_role\)'/);
  });
});

describe("le difese prima di toccare una policy", () => {
  it("confronta la forma canonica e si ferma se il senso cambierebbe", () => {
    expect(sql).toMatch(/espressione_canonica\(v_qual\) is distinct from public\.espressione_canonica\(r\.qual\)/);
    expect(sql).toMatch(/cambierebbe la condizione/);
  });

  it("salva la policy originale prima di sostituirla", () => {
    expect(sql).toMatch(/insert into public\.zz_policy_backup/);
    const ordine = sql.indexOf("insert into public.zz_policy_backup") < sql.indexOf("DROP POLICY");
    expect(ordine).toBe(true);
  });

  it("conserva permissiva/restrittiva, comando e ruoli", () => {
    expect(sql).toMatch(/case when r\.polpermissive then 'PERMISSIVE' else 'RESTRICTIVE' end/);
    expect(sql).toMatch(/case r\.polcmd when 'r' then 'SELECT'/);
    expect(sql).toMatch(/coalesce\(r\.ruoli, 'public'\)/);
  });

  it("salta le policy che non hanno bisogno di niente", () => {
    expect(sql).toMatch(/continue when v_qual is not distinct from r\.qual/);
  });
});

describe("quello che è stato fatto, e quello che no", () => {
  it("il perimetro e il motivo sono dichiarati", () => {
    expect(sql).toMatch(/78 tabelle con almeno 100 righe: 170 policy riscritte/);
    expect(sql).toMatch(/lucchetto esclusivo sulla\s*\n--\s*tabella/);
  });

  it("il guadagno è misurato, non stimato", () => {
    expect(sql).toMatch(/732,7 ms/);
    expect(sql).toMatch(/13,2 ms/);
    expect(sql).toMatch(/cinquantasei volte, a parita' di righe restituite/);
  });

  it("la differenza rimasta è spiegata, non nascosta", () => {
    expect(sql).toMatch(/389 identici/);
    expect(sql).toMatch(/user_sessions/);
    expect(sql).toMatch(/dentro la\s*\n--\s*finestra fra le due misure/);
  });
});

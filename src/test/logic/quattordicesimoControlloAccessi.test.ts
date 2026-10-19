/**
 * Quattordicesimo controllo, accessi (19/10/2026).
 *
 * Prima: l'operaio e il cliente esterno col portale acceso leggevano saldo in banca, previsione di
 * cassa e ritardi di pagamento dei clienti (silvio_cashflow_forecast_90d, silvio_payment_delay_pattern),
 * i numeri della home (get_dashboard_kpis), e potevano modificare o cancellare le rate
 * (order_installments, policy FOR ALL sul solo profilo dell'azienda). Provato prima/dopo in una
 * transazione annullata su un'azienda demo.
 *
 * Tiene fermo:
 *   · le due funzioni di Silvio restano al solo service role (nessun GRANT ad authenticated);
 *   · la home chiede can_view_dashboard, ma lascia passare il service role (auth.uid() nullo);
 *   · la vecchia policy FOR ALL sparisce; la lettura esclude il cliente esterno; la scrittura
 *     chiede can_edit_orders sia in USING sia in WITH CHECK;
 *   · la migrazione si può rilanciare e ha il lock_timeout.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cartella = process.env.MIGRAZIONI_DIR ?? resolve(__dirname, "../../../supabase/migrations");
const file = readdirSync(cartella).find((f) => f.endsWith("_quattordicesimo_controllo_accessi.sql"));
const sql = file ? readFileSync(resolve(cartella, file), "utf8") : "";
const senzaCommenti = sql.replace(/--[^\n]*/g, "");

describe("quattordicesimo controllo: accessi", () => {
  it("la migrazione c'è ed è protetta dal lock_timeout", () => {
    expect(file).toBeTruthy();
    expect(senzaCommenti).toMatch(/set local lock_timeout\s*=\s*'3s'/i);
  });

  it("cassa e ritardi dei clienti: solo service role", () => {
    for (const firma of [
      "silvio_cashflow_forecast_90d(uuid, integer, boolean)",
      "silvio_payment_delay_pattern(uuid)",
    ]) {
      const esc = firma.replace(/[()]/g, "\\$&");
      expect(senzaCommenti).toMatch(new RegExp(`revoke execute on function public\\.${esc} from authenticated`, "i"));
      expect(senzaCommenti).not.toMatch(new RegExp(`grant[^;]*${esc}[^;]*authenticated`, "i"));
    }
  });

  it("la home chiede can_view_dashboard e lascia passare il service role", () => {
    expect(senzaCommenti).toMatch(/get_dashboard_kpis/);
    expect(senzaCommenti).toMatch(/IF auth\.uid\(\) IS NOT NULL AND NOT coalesce\(public\.has_permission_for_company\(auth\.uid\(\), ''can_view_dashboard''/);
    expect(senzaCommenti).toMatch(/raise exception 'get_dashboard_kpis: punto di aggancio non trovato'/i);
  });

  it("rate: niente più policy FOR ALL sul solo profilo; lettura senza clienti esterni; scrittura con can_edit_orders", () => {
    expect(senzaCommenti).toMatch(/drop policy if exists "Users can manage installments for their company orders" on public\.order_installments/i);
    expect(senzaCommenti).not.toMatch(/create policy "Users can manage installments/i);
    const lettura = senzaCommenti.match(/create policy rate_lettura_azienda[\s\S]*?\);/i)?.[0] ?? "";
    expect(lettura).toMatch(/for select/i);
    expect(lettura).toMatch(/not \(select public\.utente_e_cliente_esterno\(\)\)/i);
    const scrittura = senzaCommenti.match(/create policy rate_scrittura_azienda[\s\S]*?\n\);/i)?.[0] ?? "";
    expect(scrittura).toMatch(/using \(/i);
    expect(scrittura).toMatch(/with check \(/i);
    expect(scrittura.match(/'can_edit_orders'/g)?.length).toBe(2);
    for (const nome of ["rate_lettura_azienda", "rate_scrittura_azienda"]) {
      expect(senzaCommenti).toMatch(new RegExp(`drop policy if exists ${nome} on public\\.order_installments`, "i"));
    }
  });
});

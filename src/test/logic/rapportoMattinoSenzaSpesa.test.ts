/**
 * Rapporto del mattino dei clienti marketing (20/09/2026): al posto della
 * spesa c'era un trattino. Ora c'è scritto perché manca e cosa fare.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motivoSenzaSpesa } from "../../../supabase/functions/_shared/motivoSenzaSpesa";
import { costruisciRapporto, type ClienteRapporto } from "../../../supabase/functions/_shared/rapportoMarketingMattino";

const ROOT = join(__dirname, "../../..");

describe("motivoSenzaSpesa", () => {
  it("chi ha la spesa non ha motivi", () => {
    expect(motivoSenzaSpesa({ spesa_disponibile: true, meta_stato: "connected", meta_account: true })).toBeNull();
  });

  it("Meta mai collegato (Ener Italia)", () => {
    expect(motivoSenzaSpesa({ spesa_disponibile: false, meta_stato: null, meta_account: false })?.breve).toBe("Meta non collegato");
    expect(motivoSenzaSpesa({ spesa_disponibile: false })?.breve).toBe("Meta non collegato");
  });

  it("collegamento scaduto (Ser Style): prima di tutto va ricollegato", () => {
    const m = motivoSenzaSpesa({ spesa_disponibile: false, meta_stato: "token_expired", meta_account: false });
    expect(m?.breve).toBe("collegamento Meta scaduto");
    expect(m?.cosaFare).toContain("ricollega Meta");
  });

  it("collegato ma nessun account scelto (BeMade, 64 account visibili)", () => {
    const m = motivoSenzaSpesa({ spesa_disponibile: false, meta_stato: "connected", meta_account: false });
    expect(m?.breve).toBe("account pubblicitario non scelto");
    expect(m?.cosaFare).toContain("Pubblicità → Impostazioni");
  });

  it("account scelto ma zero spesa (Suntech): forse è l'account sbagliato", () => {
    const m = motivoSenzaSpesa({ spesa_disponibile: false, meta_stato: "connected", meta_account: true });
    expect(m?.breve).toBe("nessuna spesa sull'account scelto");
  });
});

describe("l'email lo scrive nella scheda del brand", () => {
  const sorgente = readFileSync(join(ROOT, "supabase/functions/ops-canarino/clienti-marketing.ts"), "utf8");

  it("la regola sta in un file puro, e l'email la importa", () => {
    expect(sorgente).toContain('import { motivoSenzaSpesa } from "../_shared/motivoSenzaSpesa.ts";');
  });

  it("il motivo si aggiunge a ogni cliente prima di dare forma all'email", () => {
    // Dal 21/09/2026 la forma la decide _shared/rapportoMarketingMattino.ts, che
    // non importa niente: il motivo glielo passa chi chiama.
    expect(sorgente).toContain("c.motivo_spesa = motivoSenzaSpesa(c)");
  });

  it("la scheda dice il problema invece di un trattino", () => {
    const c: ClienteRapporto = {
      service_client_id: "x", cliente_nome: "Suntech", stato_cliente: "attivo",
      lead_grezzi_giorno: 2, lead_grezzi_7g: 15, lead_validi_7g: 15,
      spesa_giorno: 0, spesa_7g: 0, spesa_mese: 0,
      cpl_valido_7g: null, cpl_target: 11, costo_appuntamento_14g: null,
      lead_fermi: 0, lead_fermo_piu_vecchio_ore: 0, mediana_primo_contatto_min_7g: null, appuntamenti_14g: 0,
      vendite_mese: 0, venduto_mese: 0, provvigione_mese: 0, indice_esecuzione: 50, giorni_dall_ultimo_accesso: 1,
      spesa_disponibile: false, meta_stato: "connected", meta_account: true,
    };
    const conMotivo = { ...c, motivo_spesa: motivoSenzaSpesa(c) };
    const { html } = costruisciRapporto(
      { giorno: "2026-09-21", clienti: [conMotivo], azioni: [], denaro: { provvigioni_mese: 0, fatture_scadute: [] } },
      "https://app.example/console",
    );
    expect(html).toContain("Problema: <strong>nessuna spesa sull'account scelto</strong>");
    expect(html).not.toContain(">—<");
  });

  it("la funzione del database passa lo stato di Meta del cliente", () => {
    const migrazione = readFileSync(join(ROOT, "supabase/migrations/20280920110000_rapporto_mattino_motivo_senza_spesa.sql"), "utf8");
    expect(migrazione).toContain("', m.meta_stato, m.meta_account'");
  });
});

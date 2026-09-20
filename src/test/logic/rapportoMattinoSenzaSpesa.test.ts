/**
 * Rapporto del mattino dei clienti marketing (20/09/2026): al posto della
 * spesa c'era un trattino. Ora c'è scritto perché manca e cosa fare.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { motivoSenzaSpesa } from "../../../supabase/functions/_shared/motivoSenzaSpesa";

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

describe("l'email lo scrive in cima e nella tabella", () => {
  const sorgente = readFileSync(join(ROOT, "supabase/functions/ops-canarino/clienti-marketing.ts"), "utf8");

  it("la regola sta in un file puro, e l'email la importa", () => {
    expect(sorgente).toContain('import { motivoSenzaSpesa } from "../_shared/motivoSenzaSpesa.ts";');
  });

  it("niente più trattino muto nella colonna «Spesa ieri»", () => {
    expect(sorgente).toContain("motivoSenzaSpesa(c)?.breve");
    expect(sorgente).not.toContain('c.spesa_disponibile ? eur(c.spesa_giorno) : `<span style="color:#9ca3af;">—</span>`');
  });

  it("un riquadro in cima con il motivo e la cosa da fare per ogni cliente", () => {
    expect(sorgente).toContain("Spesa non leggibile per ${senzaSpesa.length}");
    expect(sorgente).toContain("${avvisoSenzaSpesa}");
  });

  it("la funzione del database passa lo stato di Meta del cliente", () => {
    const migrazione = readFileSync(join(ROOT, "supabase/migrations/20280920110000_rapporto_mattino_motivo_senza_spesa.sql"), "utf8");
    expect(migrazione).toContain("', m.meta_stato, m.meta_account'");
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * WhatsApp Locale: le campagne a freddo aggiungono in fondo la nota per dire basta
 * (platform_settings.openwa_nota_optout). Il titolare (15/09/2026) non vuole frasi
 * aggiunte dal motore, né nelle email né su WhatsApp: ora la nota si spegne con
 * openwa_nota_optout_attiva = 'false'. Chiave assente = nota accesa, come prima.
 */
describe("WhatsApp Locale: nota di uscita spegnibile", () => {
  const invio = leggi("supabase/functions/_shared/openwaSend.ts");

  it("la nota parte solo se l'interruttore non è spento", () => {
    expect(invio).toContain('getPlatformSetting("openwa_nota_optout_attiva")');
    expect(invio).toContain('.trim().toLowerCase() !== "false"');
  });

  it("riguarda solo gli invii a freddo delle campagne, non le risposte in conversazione", () => {
    expect(invio).toContain("if (params.coldOutreach && ");
    expect(leggi("supabase/functions/openwa-campagna-dispatch/index.ts")).toContain("coldOutreach: true");
  });
});

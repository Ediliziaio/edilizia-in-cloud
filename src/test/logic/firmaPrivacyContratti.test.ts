/** La firma di un contratto chiede la spunta dell'informativa privacy (21/10/2026). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const radice = join(__dirname, "../../..");
const leggi = (p: string) => readFileSync(join(radice, p), "utf8");

describe("firma FEA: informativa privacy", () => {
  it("solo per i contratti (preventivo e fotovoltaico), col testo dell'azienda o il nostro", () => {
    const f = leggi("supabase/functions/_shared/clausoleFirma.ts");
    expect(f).toContain('if (r.tipo_documento !== "quote" && r.tipo_documento !== "fv") return null;');
    expect(f).toContain("risolviTestiLegali(");
  });
  it("il server non firma senza la spunta e la registra con il testo visto", () => {
    const f = leggi("supabase/functions/fea-completa-firma/index.ts");
    expect(f).toContain("informativaPrivacy && privacy_accettata !== true");
    expect(f).toContain("informativa_privacy: informativaPrivacy");
  });
  it("la pagina pubblica la mostra e blocca il pulsante finché non è spuntata", () => {
    const f = leggi("src/pages/public/FirmaDocumento.tsx");
    expect(f).toContain("sessione.informativa_privacy && !privacyAccettata");
    expect(f).toContain("privacy_accettata: sessione?.informativa_privacy ? privacyAccettata : null");
  });
});

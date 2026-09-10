import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { authStorage, _perTest } from "@/integrations/supabase/authStorage";

const leggi = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * «Ogni giorno devo rifare login»: la sessione stava nel localStorage, che è
 * separato per ogni sottodominio — quella di admin.* non esisteva per app.*.
 * Verificato che non era una scadenza: un refresh token fermo da 18 ore veniva
 * ancora rinnovato dal server. Ora la sessione sta in un cookie di dominio,
 * con la memoria locale come rete di sicurezza.
 */
describe("Sessione condivisa fra i sottodomini", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("fuori dal dominio vero (localhost, anteprime) usa la memoria locale e non i cookie", () => {
    // jsdom gira su localhost: è il caso dello sviluppo e delle anteprime.
    expect(_perTest.dominioPerCookie()).toBeNull();

    authStorage.setItem("sb-test-auth-token", "valore-di-prova");
    expect(localStorage.getItem("sb-test-auth-token")).toBe("valore-di-prova");
    expect(authStorage.getItem("sb-test-auth-token")).toBe("valore-di-prova");
    expect(document.cookie).not.toContain("sb-test-auth-token");

    authStorage.removeItem("sb-test-auth-token");
    expect(authStorage.getItem("sb-test-auth-token")).toBeNull();
  });

  it("una chiave mai scritta non inventa valori", () => {
    expect(authStorage.getItem("sb-mai-vista")).toBeNull();
  });

  it("i pezzi stanno sotto il limite di un cookie, e in totale sotto quello degli header", () => {
    // Una sessione Supabase con l'utente dentro supera i 4 KB che un cookie
    // regge: va spezzata, o il browser la scarta e si torna al punto di prima.
    expect(_perTest.MAX_PER_COOKIE).toBeLessThan(4096);
    // Ma i cookie viaggiano in ogni richiesta: oltre una certa dimensione
    // Cloudflare risponde 400 e il sito smette di funzionare, non solo il login.
    const totale = _perTest.MAX_PEZZI * _perTest.MAX_PER_COOKIE;
    expect(totale).toBeGreaterThan(4_096); // una sessione tipica ci sta
    expect(totale).toBeLessThan(12_288); // e resta lontana dal tetto degli header
  });
});

describe("Il codice che decide dove vive la sessione", () => {
  const client = leggi("src/integrations/supabase/client.ts");
  const storage = leggi("src/integrations/supabase/authStorage.ts");
  const layout = leggi("src/components/layouts/CompanyLayout.tsx");

  it("il client Supabase usa lo storage condiviso, non più localStorage", () => {
    expect(client).toContain("storage: authStorage");
    expect(client).not.toContain("storage: localStorage");
  });

  it("il cookie è sul dominio padre e vale per tutti i sottodomini", () => {
    expect(storage).toContain('const DOMINIO_CONDIVISO = ".ediliziaincloud.com"');
    expect(storage).toContain("SameSite=Lax; Secure");
  });

  it("uscire da un'azienda impersonata non chiude più la sessione", () => {
    // Con una sessione sola, quel logout «locale» butterebbe fuori anche
    // l'amministratore che sta rientrando nel pannello.
    expect(layout).not.toContain('signOut({ scope: "local" })');
  });
});

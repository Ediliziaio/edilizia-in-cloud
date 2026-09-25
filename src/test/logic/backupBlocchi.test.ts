/**
 * Il backup delle aziende grandi (20/09/2026).
 *
 * Il dump unico è una sola istruzione e PostgREST la ferma a 8 secondi: il
 * 20/09 BeMade, Il Bagno Group, Best Infissi e la Demo sono andate tutte in
 * «statement timeout», e due erano senza copia dalla domenica prima. Nessuno
 * l'ha visto, perché il cron non legge la risposta.
 *
 * Tiene fermo:
 *   · chi è grande va a blocchi, chi fallisce col dump unico ci ripiega;
 *   · i blocchi si regolano sul peso (5.000 email con l'HTML sono 137 MB);
 *   · un'azienda a blocchi per volta, ognuna in una chiamata sua;
 *   · chi resta senza backup finisce nel rapporto del mattino.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOCCO_INIZIALE,
  BLOCCO_LEGGERO,
  BLOCCO_MASSIMO,
  BLOCCO_MINIMO,
  BLOCCO_PESANTE,
  SOGLIA_RIGHE_A_BLOCCHI,
  limiteDopoErrore,
  prossimoLimite,
  vaABlocchi,
} from "../../../supabase/functions/_shared/backupBlocchi";

const ROOT = join(__dirname, "../../..");
const leggi = (f: string) => readFileSync(join(ROOT, f), "utf8");

describe("chi va a blocchi", () => {
  it("le aziende del 20/09: le tre grandi sì, Green Energy (18 MB, passava) no", () => {
    expect(vaABlocchi(90_463)).toBe(true); // BeMade
    expect(vaABlocchi(37_236)).toBe(true); // Best Infissi
    expect(vaABlocchi(32_111)).toBe(true); // Il Bagno Group
    expect(vaABlocchi(20_386)).toBe(false); // Green Energy Group
    expect(vaABlocchi(10_031)).toBe(false); // Demo: poche righe ma pesanti → ci arriva dal ripiego
  });

  it("la soglia è esclusa, e un conto che non arriva non manda a blocchi", () => {
    expect(vaABlocchi(SOGLIA_RIGHE_A_BLOCCHI)).toBe(false);
    expect(vaABlocchi(SOGLIA_RIGHE_A_BLOCCHI + 1)).toBe(true);
    expect(vaABlocchi(null)).toBe(false);
    expect(vaABlocchi(undefined)).toBe(false);
  });
});

describe("quanto è grande un blocco", () => {
  it("si parte bassi: il primo blocco di una tabella di email non deve pesare 137 MB", () => {
    expect(BLOCCO_INIZIALE).toBeLessThanOrEqual(500);
  });

  it("blocchi leggeri → si raddoppia fino al tetto", () => {
    let limite = BLOCCO_INIZIALE;
    const passi = [limite];
    for (let i = 0; i < 6; i++) { limite = prossimoLimite(limite, 1_000_000); passi.push(limite); }
    expect(passi).toEqual([500, 1000, 2000, 4000, 5000, 5000, 5000]);
  });

  it("blocco pesante → il prossimo si dimezza, fino al minimo", () => {
    expect(prossimoLimite(500, BLOCCO_PESANTE + 1)).toBe(250);
    expect(prossimoLimite(60, BLOCCO_PESANTE + 1)).toBe(BLOCCO_MINIMO);
    expect(prossimoLimite(BLOCCO_MINIMO, 500_000_000)).toBe(BLOCCO_MINIMO);
  });

  it("peso giusto → resta com'è", () => {
    expect(prossimoLimite(1000, BLOCCO_LEGGERO)).toBe(1000);
    expect(prossimoLimite(1000, BLOCCO_PESANTE)).toBe(1000);
  });

  it("mai fuori dai limiti che accetta admin_esporta_blocco (1–20000)", () => {
    for (const caratteri of [0, BLOCCO_LEGGERO - 1, BLOCCO_PESANTE + 1]) {
      for (const limite of [1, BLOCCO_MINIMO, 777, BLOCCO_MASSIMO, 99_999]) {
        const n = prossimoLimite(limite, caratteri);
        expect(n).toBeGreaterThanOrEqual(BLOCCO_MINIMO);
        expect(n).toBeLessThanOrEqual(BLOCCO_MASSIMO);
      }
    }
  });

  it("un blocco non passato si riprova con un quarto delle righe, e al minimo ci si arrende", () => {
    expect(limiteDopoErrore(5000)).toBe(1250);
    expect(limiteDopoErrore(500)).toBe(125);
    expect(limiteDopoErrore(125)).toBe(BLOCCO_MINIMO);
    expect(limiteDopoErrore(BLOCCO_MINIMO)).toBe(null);
  });
});

describe("company-backup", () => {
  const funzione = leggi("supabase/functions/company-backup/index.ts");

  it("decide la strada dal numero di righe, prima di tentare il dump unico", () => {
    expect(funzione).toContain('admin.rpc("admin_tabelle_con_dati", { p_company_id: azienda.id })');
    expect(funzione.indexOf("vaABlocchi(righe)")).toBeLessThan(funzione.indexOf('admin.rpc("admin_esporta_azienda"'));
  });

  it("se il dump unico fallisce non si resta senza copia: si ripiega sui blocchi", () => {
    expect(funzione).toMatch(/catch \(e\) \{[\s\S]{0,400}aBlocchi\.push\(\{ id: azienda\.id, nome: azienda\.name \}\)/);
  });

  it("un'azienda per volta: parte la prima, e ognuna fa partire la successiva", () => {
    expect(funzione).toContain("avviaBackupABlocchi(aBlocchi[0].id, aBlocchi.slice(1).map((a) => a.id))");
    expect(funzione).toContain("avviaBackupABlocchi(poi[0], poi.slice(1))");
    // La successiva parte anche se questa è fallita: il .catch viene prima del .then.
    expect(funzione.indexOf('.catch((e) => console.error(`[company-backup] a blocchi')).toBeLessThan(
      funzione.indexOf("await avviaBackupABlocchi(poi[0], poi.slice(1))"),
    );
  });

  it("i blocchi si regolano sul peso, e un blocco non passato si riprova più piccolo", () => {
    expect(funzione).toContain("limite = prossimoLimite(limite, b.testo.length)");
    expect(funzione).toContain("const ridotto = limiteDopoErrore(limite)");
    expect(funzione).not.toMatch(/p_limite: BLOCCO\b/);
  });

  it("resta chiusa a chi non ha il segreto interno, anche nella chiamata a se stessa", () => {
    expect(funzione).toContain("requireInternalSecret(req, cors)");
    expect(funzione).toContain('"x-internal-cron-secret": segreto');
  });
});

describe("dove si vede", () => {
  it("la scheda Backup elenca anche i backup a blocchi, e ne offre la prova (vedi ripristinoBlocchi.test.ts)", () => {
    const restore = leggi("supabase/functions/company-restore/index.ts");
    expect(restore).toContain("/indice.json");
    expect(restore).not.toContain("la prova di ripristino per questo formato non è ancora disponibile");
    const scheda = leggi("src/components/admin/company/CompanyBackupCard.tsx");
    expect(scheda).not.toContain("{!f.a_blocchi && (");
  });

  it("il rapporto del mattino dice chi è rimasto senza backup", () => {
    // Dal 25/09 (email unica del mattino) le sezioni del rapporto stanno in stato.ts.
    const canarino = leggi("supabase/functions/ops-canarino/stato.ts");
    expect(canarino).toContain('{ key: "backup_mancanti", titolo: "Aziende senza un backup da più di 8 giorni" }');
    expect(canarino).toContain('supabase.rpc("ops_backup_mancanti", { p_giorni: 8 })');
    const migrazione = leggi("supabase/migrations/20280920210000_backup_mancanti_nel_rapporto.sql");
    expect(migrazione).toMatch(/REVOKE ALL ON FUNCTION public\.ops_backup_mancanti\(integer\) FROM PUBLIC, anon, authenticated/);
    expect(migrazione).toContain("o.bucket_id = 'company-exports' AND o.name LIKE c.id::text || '/%'");
  });
});

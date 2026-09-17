/**
 * Foto e allegati dei progetti (17/09/2026). Negli otto preventivatori (bagni,
 * tetti, elettrico, termoidraulico, piscine, ristrutturazione, pavimenti,
 * climatizzazione) StepMedia caricava foto della casa del cliente, render e
 * allegati nel bucket pubblico company-photo-library e salvava nel progetto
 * l'URL pubblico. La policy di lettura al ruolo public permetteva anche di
 * elencare il bucket senza essere collegati. Il bucket era ancora vuoto: nessun
 * dato è uscito.
 *
 * Ora i file vanno nel bucket privato progetti-media e nel progetto c'è il
 * riferimento, firmato quando serve. Si prova che:
 * - nessuno StepMedia salvi più un indirizzo pubblico;
 * - anteprime e PDF firmino prima di usare i file;
 * - il bucket nasca privato, con le policy sulla cartella dell'azienda;
 * - company-photo-library non si possa più elencare senza accesso.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUCKET_MEDIA_PROGETTI,
  BUCKET_RISERVATI,
  eRiferimentoNudo,
  riconosciFile,
  riferimentoFile,
} from "@/lib/storage/fileRiservati";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

const MODULI = [
  ["bagni", "Bagni", "bgn"],
  ["tetti", "Tetti", "tet"],
  ["elettrico", "Elettrico", "ele"],
  ["termoidraulico", "Termoidraulico", "idr"],
  ["piscine", "Piscine", "pis"],
  ["ristrutturazione", "Ristrutturazione", "rst"],
  ["pavimenti", "Pavimenti", "pav"],
  ["climatizzazione", "Climatizzazione", "clm"],
] as const;

const cartellaMigrazioni = resolve(RADICE, "supabase/migrations");
const fileMigrazioni = readdirSync(cartellaMigrazioni).filter((f) => f.endsWith(".sql")).sort();
const nomeMigrazione = fileMigrazioni.find((f) => f.endsWith("_media_progetti_bucket_privato.sql"));
const migrazione = nomeMigrazione ? leggi(`supabase/migrations/${nomeMigrazione}`) : "";

describe("StepMedia salva il riferimento nel bucket privato", () => {
  it.each(MODULI)("%s", (modulo, Nome) => {
    const sorgente = leggi(`src/pages/azienda/${modulo}/${Nome}Wizard/StepMedia.tsx`);
    expect(sorgente).toContain("const BUCKET = BUCKET_MEDIA_PROGETTI;");
    expect(sorgente).not.toMatch(/"company-photo-library"/);
    expect(sorgente).not.toContain("getPublicUrl");
    expect(sorgente).toContain("const url = riferimentoFile(BUCKET, storagePath);");
    // La prima cartella è l'azienda su cui si lavora: la guardano le policy.
    expect(sorgente).toContain("const companyId = useEffectiveCompanyId();");
    expect(sorgente).toContain(`const storagePath = \`\${companyId}/${modulo}/\${progettoId}/`);
    // Anteprima e PDF si aprono col link firmato, mai col riferimento.
    expect(sorgente).toContain("const link = useFileRiservato(media.url);");
    expect(sorgente).not.toMatch(/(src|href)=\{media\.url\}/);
    // La rimozione legge bucket e percorso dal riferimento.
    expect(sorgente).toContain("const file = riconosciFile(m.url);");
    expect(sorgente).toContain("if (file?.bucket === BUCKET) void supabase.storage.from(BUCKET).remove([file.path]);");
  });
});

describe("il PDF firma le foto del progetto prima di convertirle", () => {
  it.each(MODULI)("%s", (_modulo, Nome) => {
    const sorgente = leggi(`src/hooks/use${Nome}PDF.ts`);
    const firma = sorgente.indexOf("const linkMedia = await linkFileRiservati(imageMedia.map((m) => m.url));");
    expect(firma).toBeGreaterThan(-1);
    expect(sorgente.indexOf("toDataUrl(linkMedia[i])")).toBeGreaterThan(firma);
    expect(sorgente).not.toContain("toDataUrl(m.url)");
    // Una foto che non si è potuta firmare non arriva al renderer.
    expect(sorgente).toContain(".filter((m) => m.url && !eRiferimentoNudo(m.url));");
  });
});

describe("riferimento e bucket", () => {
  it("progetti-media è tra i contenitori letti con link firmato", () => {
    expect(BUCKET_MEDIA_PROGETTI).toBe("progetti-media");
    expect(BUCKET_RISERVATI).toContain("progetti-media");
    const rif = riferimentoFile(BUCKET_MEDIA_PROGETTI, "azienda/bagni/progetto/foto.jpg");
    expect(rif).toBe("progetti-media/azienda/bagni/progetto/foto.jpg");
    expect(riconosciFile(rif)).toEqual({ bucket: "progetti-media", path: "azienda/bagni/progetto/foto.jpg" });
    expect(eRiferimentoNudo(rif)).toBe(true);
    expect(riferimentoFile("progetti-media", "/azienda/x.pdf")).toBe("progetti-media/azienda/x.pdf");
  });

  it("i limiti del bucket sono quelli dello StepMedia", () => {
    expect(migrazione).toContain(
      "values ('progetti-media', 'progetti-media', false, 8388608,\n        array['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])",
    );
    for (const [modulo, Nome] of MODULI) {
      const sorgente = leggi(`src/pages/azienda/${modulo}/${Nome}Wizard/StepMedia.tsx`);
      expect(sorgente, modulo).toContain("const MAX_FILE_BYTES = 8 * 1024 * 1024;");
      expect(sorgente, modulo).toContain(
        'const ALLOWED_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);',
      );
    }
  });
});

describe("la migrazione", () => {
  it("esiste e scrive con le protezioni di CLAUDE.md", () => {
    expect(nomeMigrazione).toBeDefined();
    expect(migrazione).toContain("set local lock_timeout = '3s';");
    expect(migrazione).toContain("set local statement_timeout = '60s';");
  });

  it.each(["select", "insert", "update", "delete"])(
    "la policy %s di progetti-media guarda la cartella dell'azienda effettiva",
    (operazione) => {
      const definizione =
        migrazione.match(new RegExp(`create policy "progetti_media_${operazione}"[\\s\\S]*?;`))?.[0] ?? "";
      expect(definizione).toContain(`for ${operazione} to authenticated`);
      expect(definizione).toContain("bucket_id = 'progetti-media'");
      expect(definizione).toContain("(storage.foldername(name))[1] = (public.get_effective_company_id())::text");
      expect(definizione).toContain("not public.utente_bloccato()");
    },
  );

  it("company-photo-library non si elenca più senza essere collegati", () => {
    expect(migrazione).toContain('drop policy if exists "cpl_storage_read_public" on storage.objects;');
    const lettura = migrazione.match(/create policy "cpl_storage_read_own_company"[\s\S]*?;/)?.[0] ?? "";
    expect(lettura).toContain("for select to authenticated");
    expect(lettura).toContain("bucket_id = 'company-photo-library'");
    expect(lettura).toContain("(storage.foldername(name))[1] = (public.get_effective_company_id())::text");
    expect(lettura).toContain("not public.utente_bloccato()");
    // Nessuna migrazione successiva la riapre al ruolo public.
    const successive = fileMigrazioni.filter((f) => nomeMigrazione && f > nomeMigrazione);
    for (const f of successive) {
      expect(leggi(`supabase/migrations/${f}`), f).not.toMatch(/create policy "cpl_storage_read_public"/i);
    }
  });

  it("si ferma se trova media di progetto nel bucket pubblico, invece di perderli", () => {
    for (const [, , prefisso] of MODULI) {
      expect(migrazione).toContain(
        `(select count(*) from public.${prefisso}_progetti_media where url ~ 'company-photo-library')`,
      );
    }
    expect(migrazione).toContain("raise exception 'Media di progetto ancora nel bucket pubblico");
  });
});

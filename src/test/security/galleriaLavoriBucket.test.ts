/**
 * Galleria «I nostri lavori» nei modelli PDF (17/09/2026). Otto editor (bagni,
 * tetti, elettrico, termoidraulico, piscine, ristrutturazione, pavimenti,
 * climatizzazione) caricavano le foto nel bucket "companies", che non esiste:
 * ogni foto finiva in errore e nessun modello di quei moduli aveva una galleria.
 * Le altre immagini degli stessi editor stanno in company-photo-library.
 *
 * Il bucket si controlla sulle migrazioni: una galleria che punta a un bucket mai
 * creato fa fallire il test. Si prova anche che la cartella sia quella
 * dell'azienda su cui si lavora, e che le policy di company-photo-library
 * guardino la stessa azienda senza lasciar scrivere un utente bloccato.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BUCKET_RISERVATI } from "@/lib/storage/fileRiservati";

const RADICE = resolve(__dirname, "../../..");
const leggi = (p: string) => readFileSync(resolve(RADICE, p), "utf8");

/** I file .tsx sotto una cartella, ricorsivamente. */
function fileTsx(cartella: string): string[] {
  return readdirSync(resolve(RADICE, cartella), { withFileTypes: true }).flatMap((voce) => {
    const percorso = join(cartella, voce.name);
    if (voce.isDirectory()) return fileTsx(percorso);
    return voce.name.endsWith(".tsx") ? [percorso] : [];
  });
}

const migrazioni = readdirSync(resolve(RADICE, "supabase/migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(resolve(RADICE, "supabase/migrations", f), "utf8"));

/** Bucket creati dalle migrazioni → pubblico sì/no, con i cambi successivi del flag. */
const bucketCreati = new Map<string, boolean>();
for (const sql of migrazioni) {
  for (const m of sql.matchAll(/insert\s+into\s+storage\.buckets\s*\(([^)]*)\)\s*values\s*\(([^)]*)\)/gi)) {
    const colonne = m[1].split(",").map((c) => c.trim().toLowerCase());
    const valori = m[2].replace(/--[^\n]*/g, "").split(",").map((v) => v.trim());
    const id = valori[colonne.indexOf("id")]?.replace(/^'|'$/g, "");
    if (id) bucketCreati.set(id, valori[colonne.indexOf("public")]?.toLowerCase() === "true");
  }
  for (const m of sql.matchAll(/update\s+storage\.buckets\s+set\s+public\s*=\s*(true|false)\s+where\s+id\s*=\s*'([^']+)'/gi)) {
    bucketCreati.set(m[2], m[1].toLowerCase() === "true");
  }
}

/** Ogni <GalleryLavoriEditor> con il suo bucket: letterale o costante del file. */
const gallerie = fileTsx("src").flatMap((file) => {
  const sorgente = leggi(file);
  return [...sorgente.matchAll(/<GalleryLavoriEditor\b[\s\S]*?\/>/g)].map((m) => {
    const tag = m[0];
    const costante = tag.match(/bucket=\{(\w+)\}/)?.[1];
    const bucket =
      tag.match(/bucket="([^"]+)"/)?.[1] ??
      (costante ? sorgente.match(new RegExp(`^const ${costante} = "([^"]+)";`, "m"))?.[1] : undefined);
    return { file, sorgente, tag, bucket: bucket ?? "(non trovato)" };
  });
});

describe("la galleria lavori carica in un bucket che esiste", () => {
  it("le dieci gallerie dei modelli puntano a un bucket creato da una migrazione", () => {
    expect(gallerie).toHaveLength(10);
    for (const g of gallerie) {
      expect(bucketCreati.has(g.bucket), `${g.file}: bucket ${g.bucket}`).toBe(true);
    }
  });

  it('nessun caricamento usa più il bucket inesistente "companies"', () => {
    expect(bucketCreati.has("companies")).toBe(false);
    for (const file of fileTsx("src")) {
      expect(leggi(file), file).not.toMatch(/bucket="companies"|storage\s*\.from\("companies"\)/);
    }
  });

  it("gli otto moduli usano lo stesso bucket delle altre immagini del loro modello", () => {
    const otto = gallerie.filter((g) => !/serramenti|fotovoltaico/.test(g.file));
    expect(otto).toHaveLength(8);
    for (const g of otto) {
      expect(g.tag, g.file).toContain("bucket={BUCKET}");
      expect(g.bucket, g.file).toBe("company-photo-library");
    }
  });

  it("ogni galleria carica nella cartella dell'azienda su cui si lavora", () => {
    for (const g of gallerie) {
      expect(g.tag, g.file).toMatch(/uploadPath=\{`\$\{companyId\}\//);
      expect(g.sorgente, g.file).toContain("const companyId = useEffectiveCompanyId();");
    }
  });

  it("nei bucket pubblici va l'indirizzo pubblico, in quelli privati il percorso da firmare", () => {
    // GalleryLavoriEditor sceglie con BUCKET_RISERVATI: un bucket privato che non
    // ci fosse salverebbe un indirizzo pubblico che non si apre.
    for (const g of gallerie) {
      const riservato = (BUCKET_RISERVATI as readonly string[]).includes(g.bucket);
      expect(riservato, `${g.file}: ${g.bucket}`).toBe(!bucketCreati.get(g.bucket));
    }
  });
});

describe("le policy di company-photo-library guardano l'azienda su cui si lavora", () => {
  /** L'ultima definizione della policy tra le migrazioni, in ordine di versione. */
  function ultimaDefinizione(policy: string): string {
    const definizioni = migrazioni.flatMap((sql) =>
      [...sql.matchAll(new RegExp(`create policy "${policy}"[\\s\\S]*?;`, "gi"))].map((m) => m[0]),
    );
    if (definizioni.length === 0) throw new Error(`${policy} mai creata`);
    return definizioni[definizioni.length - 1];
  }

  it.each(["cpl_storage_insert_own_company", "cpl_storage_update_own_company", "cpl_storage_delete_own_company"])(
    "%s",
    (policy) => {
      const definizione = ultimaDefinizione(policy);
      // Tutti gli uploader del bucket (editor, StepMedia, libreria foto) mettono
      // il file nella cartella dell'azienda effettiva.
      expect(definizione).toContain("(storage.foldername(name))[1] = (public.get_effective_company_id())::text");
      // get_effective_company_id non guarda il blocco, get_user_company_id sì.
      expect(definizione).toContain("not public.utente_bloccato()");
      expect(definizione).not.toContain("get_user_company_id");
    },
  );
});

/**
 * Valida un XML FatturaPA contro lo schema XSD ufficiale 1.2.2 (src/test/fixtures/fatturapa-1.2.2/),
 * con xmllint. I file dello schema sono quelli pubblicati, non toccati:
 * - Schema_del_file_xml_FatturaPA_v1.2.2.xsd — fatturapa.gov.it/export/documenti/fatturapa/v1.2.2/
 *   (sha256 cedaeece91d7a5334960143f0735ee020e6e94f33685b512f5899eb85c507e18);
 * - xmldsig-core-schema.xsd — w3.org/TR/2002/REC-xmldsig-core-20020212/, che lo schema importa.
 * Lo schema importa la firma da internet: qui se ne fa una copia temporanea che punta al file
 * locale, così la validazione gira senza rete (--nonet).
 *
 * Lo schema controlla struttura, ordine dei tag, formati e lunghezze. Non controlla i calcoli
 * (00422/00423: quelli li rifà `controlliCalcoloSdi`) né che un codice sia quello giusto.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CARTELLA = resolve(__dirname, "../fixtures/fatturapa-1.2.2");
let schemaLocale: string | null = null;

function schema(): string {
  if (schemaLocale) return schemaLocale;
  const dir = mkdtempSync(join(tmpdir(), "xsd-fatturapa-"));
  copyFileSync(join(CARTELLA, "xmldsig-core-schema.xsd"), join(dir, "xmldsig-core-schema.xsd"));
  const originale = readFileSync(join(CARTELLA, "Schema_del_file_xml_FatturaPA_v1.2.2.xsd"), "utf8");
  const locale = originale.replace(
    'schemaLocation="http://www.w3.org/TR/2002/REC-xmldsig-core-20020212/xmldsig-core-schema.xsd"',
    'schemaLocation="xmldsig-core-schema.xsd"',
  );
  if (locale === originale) throw new Error("Schema FatturaPA: import della firma non trovato");
  writeFileSync(join(dir, "fatturapa.xsd"), locale);
  schemaLocale = join(dir, "fatturapa.xsd");
  return schemaLocale;
}

/** Errori dello schema (vuoto = valido). Lancia se xmllint non c'è: la prova non si salta in silenzio. */
export function erroriXsd(xml: string): string[] {
  const dir = mkdtempSync(join(tmpdir(), "xml-fatturapa-"));
  const file = join(dir, "fattura.xml");
  writeFileSync(file, xml);
  try {
    execFileSync("xmllint", ["--noout", "--nonet", "--schema", schema(), file], { stdio: "pipe" });
    return [];
  } catch (e) {
    const err = e as { code?: string; stderr?: Buffer };
    if (err.code === "ENOENT") throw new Error("xmllint non trovato: installa libxml2-utils (serve per validare l'XML contro lo schema)");
    return String(err.stderr ?? "").split("\n").map((r) => r.replace(file, "fattura.xml").trim())
      .filter((r) => r && !/fails to validate$/.test(r));
  }
}

/**
 * Ogni XML che un file di test fa generare passa dallo schema XSD ufficiale (15/11/2026).
 * In testa al file di test:
 *
 *   vi.mock("../../../supabase/functions/_shared/generateXML", async (originale) =>
 *     (await import("../helpers/xsdSuOgniXml")).conRegistro(await originale()));
 *   ogniXmlNelloSchema();
 *
 * Il generatore resta quello vero: si tiene solo una copia di ogni XML, e dopo ogni test
 * xmllint li valida tutti. Un test che non genera XML non paga niente.
 */
import { afterEach, expect } from "vitest";
import { erroriXsd } from "./validaXsdFatturaPa";

const generati: string[] = [];

export function conRegistro<T extends Record<string, unknown>>(modulo: T): T {
  const originale = modulo.generateXML as (...a: unknown[]) => string;
  return {
    ...modulo,
    generateXML: (...a: unknown[]) => {
      const xml = originale(...a);
      generati.push(xml);
      return xml;
    },
  };
}

export function ogniXmlNelloSchema() {
  afterEach(() => {
    const daValidare = generati.splice(0);
    for (const xml of daValidare) expect(erroriXsd(xml), "XML fuori dallo schema FatturaPA 1.2.2").toEqual([]);
  });
}

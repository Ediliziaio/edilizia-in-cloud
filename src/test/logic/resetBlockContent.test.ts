import { describe, expect, it } from "vitest";
import { resetBlockContent } from "@/components/preventivi/resetBlockContent";
import { leggiBlocco } from "../../../supabase/functions/_shared/blocchiPreventivo";

describe("independent block resets", () => {
  const standard = { titolo: "Titolo dell'intervento", intro: "Introduzione del modulo", foto: ["/module-art/serramenti-finestre-dettaglio-v1.jpg"], senzaFoto: false };
  it.each([
    { foto: ["/mia-foto.jpg"], senzaFoto: false },
    { foto: [] as string[], senzaFoto: true },
  ])("text reset preserves the company's media choice %j", media => {
    const source = { modulo_defaults: { comeFunziona: standard }, comeFunziona: { titolo: "Mio titolo", intro: "Mia intro", voci: [{ titolo: "Voce" }], ...media, nota: "La mia didascalia", extra: "futuro" }, altro: { titolo: "Intatto" } };
    const reset = resetBlockContent(source, "comeFunziona", "texts");
    expect(reset.comeFunziona).toEqual({ ...media, nota: "La mia didascalia", extra: "futuro" });
    expect(leggiBlocco("comeFunziona", "serramenti", reset).titolo).toBe(standard.titolo);
    expect(leggiBlocco("comeFunziona", "serramenti", reset).foto).toEqual(media.foto);
    expect(reset.modulo_defaults).toBe(source.modulo_defaults);
    expect(reset.altro).toBe(source.altro);
    expect(source.comeFunziona.titolo).toBe("Mio titolo");
  });
  it("image reset restores this module's image without changing text or caption", () => {
    const source = { modulo_defaults: { comeFunziona: standard }, comeFunziona: { titolo: "Personalizzato", foto: [] as string[], senzaFoto: true, nota: "Didascalia" } };
    const reset = resetBlockContent(source, "comeFunziona", "images");
    expect(reset.comeFunziona).toEqual({ titolo: "Personalizzato", nota: "Didascalia" });
    expect(leggiBlocco("comeFunziona", "serramenti", reset).foto).toEqual(standard.foto);
  });
  it("does not invent overrides for an absent block", () => {
    const source = { modulo_defaults: { comeFunziona: standard } };
    expect(resetBlockContent(source, "comeFunziona", "texts")).toBe(source);
  });
});

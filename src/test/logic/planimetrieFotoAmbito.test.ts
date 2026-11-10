import { describe, expect, it } from "vitest";
import { bagnoDaVerificare, bagnoVerificatoSintetico } from "../fixtures/bagnoDaVerificare";
import { impostaZoneFoto } from "@/lib/planimetrie/zoneFotoDocumento";
import { aPlanimetria, daPlanimetria } from "@/components/planimetrie/editor/adattatore";
import { annulla, esegui, nuovaStoria } from "@/components/planimetrie/editor/storia";
import { validaPlanimetria } from "../../../shared/planimetrie/modello.ts";
import { controlloPrimaDellUso, verificheDelDocumento } from "../../../shared/planimetrie/verificaDocumento.ts";
import { verificaPianta } from "../../../shared/planimetrie/verifiche.ts";

const zona = { x: 0.4, y: 0.35, larghezza: 0.08, altezza: 0.03 };

describe("foto, evidenze e ambito del documento", () => {
  it("salva e riapre zone e ambito senza cambiare geometria o confermare dubbi", () => {
    const prima = bagnoDaVerificare();
    const d = { ...impostaZoneFoto(prima, "lettura-1", [zona]), ambitoDocumento: "ambiente" as const };
    const riaperta = JSON.parse(JSON.stringify(aPlanimetria(daPlanimetria(d), d)));
    expect(validaPlanimetria(riaperta).ok).toBe(true);
    expect(riaperta.ambitoDocumento).toBe("ambiente");
    expect(riaperta.letturaDocumento.verifiche[0].zoneFoto).toEqual([zona]);
    expect(riaperta.letturaDocumento.verifiche[0].valoriLettiCm).toEqual([423, 421.5, 422.5]);
    expect(riaperta.livelli[0].fatto.locali[0].contorno).toEqual(prima.livelli[0].fatto.locali[0].contorno);
    for (const uso of ["3d", "render", "computo", "pdf"] as const) expect(controlloPrimaDellUso(riaperta, uso).ok).toBe(false);
    expect(verificheDelDocumento(riaperta).every((v) => !v.conferma)).toBe(true);
  });
  it("esclude solo le verifiche dell'intero alloggio quando l'utente dichiara un singolo ambiente", () => {
    const d = bagnoDaVerificare();
    const completa = verificaPianta({ ...d, ambitoDocumento: "alloggio" });
    const locale = verificaPianta({ ...d, ambitoDocumento: "ambiente" });
    expect(completa.some((v) => v.codice === "alloggio")).toBe(true);
    expect(locale.some((v) => v.codice === "alloggio")).toBe(false);
    expect(locale).toEqual(completa.filter((v) => v.codice !== "alloggio"));
    // Il numero di stanze non sceglie l'ambito al posto dell'utente.
    expect(verificaPianta(d)).toEqual(completa);
  });
  it("annulla ripristina l'ambito precedente senza perdere la foto o le alternative", () => {
    const prima = { ...bagnoDaVerificare(), ambitoDocumento: "ambiente" as const };
    const p = daPlanimetria(prima);
    const storia = esegui(nuovaStoria(p), { ...p, ambitoDocumento: "alloggio" });
    expect(aPlanimetria(storia.presente, prima).ambitoDocumento).toBe("alloggio");
    expect(aPlanimetria(annulla(storia).presente, prima).ambitoDocumento).toBe("ambiente");
  });
  it("le evidenze sulla foto non invalidano le conferme esplicite già registrate", () => {
    const d = impostaZoneFoto(bagnoVerificatoSintetico(), "lettura-1", [zona]);
    expect(controlloPrimaDellUso(d, "pdf").ok).toBe(true);
  });
  it("rifiuta zone fuori foto, coordinate non finite e ambiti non previsti", () => {
    const d = bagnoDaVerificare();
    expect(() => impostaZoneFoto(d, "lettura-1", [{ ...zona, x: 0.99 }])).toThrow(/dentro la foto/);
    expect(() => impostaZoneFoto(d, "lettura-1", [{ ...zona, x: NaN }])).toThrow();
    expect(validaPlanimetria({ ...d, ambitoDocumento: "automatico" }).ok).toBe(false);
    const invalida = structuredClone(d);
    invalida.letturaDocumento!.verifiche![0].zoneFoto = [{ ...zona, altezza: -1 }];
    expect(validaPlanimetria(invalida).ok).toBe(false);
  });
});

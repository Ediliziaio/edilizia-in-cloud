import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { abacoSerramenti, abacoStanze, csvSerramenti, csvStanze, inCsv } from "@/lib/planimetrie/abachi";
import { calcolaQuantita } from "../../../shared/planimetrie/quantita.ts";
import { ambitiDi, type Planimetria } from "../../../shared/planimetrie/modello.ts";

const carica = (nome: string): Planimetria => JSON.parse(readFileSync(join(process.cwd(), "shared/planimetrie/esempi", nome), "utf8"));

describe.each(["bilocale.json", "trilocale.json"])("abachi su %s", (nome) => {
  const p = carica(nome);
  const livello = p.livelli[0];

  it.each(ambitiDi(p).map((a) => a.chiave))("ambito %s: un serramento per apertura, codici unici per tipo", (ambito) => {
    const righe = abacoSerramenti(p, livello.id, ambito);
    const stato = ambito === "fatto" ? livello.fatto : livello.proposte.find((x) => `progetto:${x.id}` === ambito)!;
    expect(righe).toHaveLength(stato.aperture.length);
    expect(new Set(righe.map((r) => r.codice)).size).toBe(righe.length);
    for (const r of righe) {
      expect(r.codice).toMatch(/^(P|F|PF|V)\d+$/);
      expect(r.larghezza).toBeGreaterThan(0);
    }
  });

  it("le stanze hanno gli stessi numeri del computo", () => {
    const q = calcolaQuantita(p);
    const righe = abacoStanze(p, livello.id, "fatto");
    expect(righe).toHaveLength(livello.fatto.locali.length);
    for (const r of righe) {
      const atteso = q[`fatto:locale:${r.id}.pavimento_mq`]?.valore ?? 0;
      expect(Math.abs(r.pavimentoMq - atteso)).toBeLessThanOrEqual(0.0051);
      expect(r.pavimentoMq).toBeGreaterThan(0);
    }
  });

  it("i CSV hanno l'intestazione e una riga per oggetto", () => {
    const s = abacoSerramenti(p, livello.id, "fatto");
    const st = abacoStanze(p, livello.id, "fatto");
    expect(csvSerramenti(s).split("\r\n")).toHaveLength(s.length + 1);
    expect(csvStanze(st).split("\r\n")).toHaveLength(st.length + 1);
  });
});

describe("CSV per Excel italiano", () => {
  it("virgola decimale, punto e virgola, virgolette solo dove serve", () => {
    expect(inCsv(["a", "b"], [[1.5, 'x;"y"'], [null, "z"]])).toBe('﻿a;b\r\n1,5;"x;""y"""\r\n;z');
  });
});

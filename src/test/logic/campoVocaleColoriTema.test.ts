import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Il rapportino vocale (registratore e modulo) era disegnato per uno sfondo scuro — testo bianco, slate-300,
 * amber-200 — ma l'app e la pagina sono chiare: titoli, controlli e spiegazioni sparivano sul bianco.
 * Qui si tengono fermi i colori del tema: se qualcuno rimette un colore da sfondo scuro, il test lo dice.
 */
const leggi = (percorso: string) => readFileSync(resolve(process.cwd(), percorso), "utf8");
const FILE = ["src/components/campo/CampoRapportinoForm.tsx", "src/components/campo/CampoAudioRecorder.tsx"];

// Colori che hanno senso solo su fondo scuro (o sono bianchi su bianco).
const DA_SFONDO_SCURO = /bg-slate-(?:800|900|950)|border-slate-(?:700|800)|text-slate-(?:100|200|300|400|500)|text-amber-200|text-red-(?:100|200|300)|text-orange-(?:100|200|300)|text-emerald-200|placeholder-slate-500|bg-red-950/;

describe("rapportino vocale: colori del tema chiaro", () => {
  for (const file of FILE) {
    it(`${file.split("/").pop()} non usa colori da sfondo scuro`, () => {
      const trovati = leggi(file).match(new RegExp(DA_SFONDO_SCURO, "g")) ?? [];
      expect(trovati).toEqual([]);
    });

    it(`${file.split("/").pop()}: il testo bianco c'è solo sui pulsanti pieni`, () => {
      const righe = leggi(file).split("\n").filter(r => /\btext-white\b/.test(r));
      for (const riga of righe) expect(riga, riga.trim()).toMatch(/bg-red-(?:500|600)/);
    });
  }

  it("i campi di testo usano i colori del tema (sfondo, bordo, testo, segnaposto)", () => {
    const form = leggi(FILE[0]);
    expect(form).toContain("bg-background border border-input");
    expect(form).toContain("text-foreground placeholder:text-muted-foreground");
  });

  it("la prima colonna dei materiali può stringersi: la X non esce dallo schermo", () => {
    expect(leggi(FILE[0])).toContain('className="min-w-0 flex-1 h-11 rounded-lg');
  });

  it("l'audio si registra a 64 kbit/s: per la voce bastano, e pesa metà da caricare col campo scarso", () => {
    expect(leggi(FILE[1])).toContain("const BITRATE_BPS = 64_000;");
  });
});

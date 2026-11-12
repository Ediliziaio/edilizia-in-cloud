/**
 * Le tendine dentro le finestre (12/11/2026): frecce e rotellina non funzionavano.
 *
 * La tendina (@radix-ui/react-select) portava con sé copie sue dei pezzi che gestiscono focus,
 * livelli e blocco dello scorrimento; la finestra (Dialog) ne usava altre. La finestra non
 * riconosceva la tendina come «sua»: si riprendeva il focus (le frecce restavano sul bottone) e
 * bloccava la rotellina sulla lista. Provato nel browser vero, con 490 fornitori: con una sola
 * copia per pezzo le frecce scorrono, la rotellina va, Invio sceglie.
 *
 * Se un aggiornamento dei pacchetti fa ricomparire i doppioni, questo test lo dice.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const PEZZI = [
  "@radix-ui/react-dismissable-layer",
  "@radix-ui/react-focus-scope",
  "@radix-ui/react-portal",
  "@radix-ui/react-popper",
  "@radix-ui/react-collection",
  "react-remove-scroll",
];

/** Tutte le copie installate di un pacchetto, anche annidate sotto altri pacchetti. */
function copie(nome: string): string[] {
  const trovate: string[] = [];
  const visita = (cartella: string, profondita: number) => {
    if (profondita > 6 || !existsSync(cartella)) return;
    const pkg = join(cartella, nome, "package.json");
    if (existsSync(pkg)) trovate.push(JSON.parse(readFileSync(pkg, "utf8")).version);
    for (const voce of readdirSync(cartella, { withFileTypes: true })) {
      if (!voce.isDirectory()) continue;
      if (voce.name.startsWith("@")) {
        for (const sotto of readdirSync(join(cartella, voce.name), { withFileTypes: true })) {
          if (sotto.isDirectory()) visita(join(cartella, voce.name, sotto.name, "node_modules"), profondita + 1);
        }
      } else if (voce.name !== ".bin" && !voce.name.startsWith(".")) {
        visita(join(cartella, voce.name, "node_modules"), profondita + 1);
      }
    }
  };
  visita(join(ROOT, "node_modules"), 0);
  return trovate;
}

describe("Tendine nelle finestre: una sola copia dei pezzi condivisi", () => {
  it("package.json fissa una versione per ogni pezzo", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
    for (const nome of PEZZI) expect(pkg.overrides?.[nome], nome).toBeTruthy();
  });

  it.each(PEZZI)("%s è installato una volta sola", (nome) => {
    const versioni = new Set(copie(nome));
    expect([...versioni], nome).toHaveLength(1);
  });
});

describe("La lista della tendina", () => {
  const select = readFileSync(join(ROOT, "src/components/ui/select.tsx"), "utf8");
  const css = readFileSync(join(ROOT, "src/index.css"), "utf8");

  it("sopra le 12 voci ha il campo di ricerca, e una lettera scritta ci finisce dentro", () => {
    expect(select).toContain("export const SOGLIA_RICERCA_TENDINA = 12;");
    expect(select).toContain('aria-label="Cerca nella tendina"');
    expect(select).toContain("onKeyDownCapture");
  });

  it("la ricerca riparte vuota a ogni apertura e dopo Esc", () => {
    expect(select).toContain('onEscapeKeyDown={(e) => { setRicerca("");');
    expect(select).toContain('onCloseAutoFocus={(e) => { setRicerca("");');
  });

  it("la barra di scorrimento a lato si vede", () => {
    expect(css).toContain("[data-radix-select-viewport]::-webkit-scrollbar { display: block !important;");
  });
});

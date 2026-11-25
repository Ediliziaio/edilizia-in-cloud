/**
 * Un dizionario delle lingue (`src/lib/campo/lingua/dizionari/*.ts`) letto come dati.
 *
 * Il 24/11/2026 la build di Cloudflare è andata in «heap out of memory» a 8 GB: i dizionari sono
 * 50 MB di TypeScript (10 lingue, 60.000 frasi l'una) e Rollup li analizzava tutti come codice.
 * Nella build si pubblicano come JSON (plugin `dizionariComeJson` in vite.config.ts): qui si
 * ricava l'oggetto dal sorgente senza eseguirlo. Il file deve restare nella forma
 * `const dizionario: Dizionario = { "frase": "traduzione", ... }; export default dizionario;`,
 * con commenti solo su righe proprie; se non è così la build si ferma col nome del file.
 * Un dizionario può partire da un altro (`...es,` con `import es from "./es"`, come lo spagnolo
 * argentino): `leggiBase(nomeFile)` restituisce il sorgente di quell'altro.
 */
export function dizionarioDaSorgente(sorgente, nome = "dizionario", leggiBase = null) {
  const inizio = sorgente.indexOf("= {");
  const fine = sorgente.lastIndexOf("};");
  if (inizio < 0 || fine < inizio) throw new Error(`${nome}: non trovo l'oggetto del dizionario`);
  const importati = new Map([...sorgente.matchAll(/^import\s+(\w+)\s+from\s+["']\.\/(\w+)["'];?$/gm)].map((m) => [m[1], m[2]]));
  const basi = [];
  const corpo = sorgente
    .slice(inizio + 2, fine + 1)
    .split("\n")
    .filter((riga) => !/^\s*\/\//.test(riga))
    .filter((riga) => {
      const eredita = riga.match(/^\s*\.\.\.(\w+),\s*$/);
      if (!eredita) return true;
      const file = importati.get(eredita[1]);
      if (!file || !leggiBase) throw new Error(`${nome}: eredita da «${eredita[1]}» ma non so dove leggerlo`);
      basi.push(dizionarioDaSorgente(leggiBase(file), file, leggiBase));
      return false;
    })
    .join("\n")
    .replace(/,(\s*)\}$/, "$1}");
  try {
    const oggetto = JSON.parse(corpo);
    if (!oggetto || typeof oggetto !== "object" || Array.isArray(oggetto)) throw new Error("non è un oggetto");
    return Object.assign({}, ...basi, oggetto);
  } catch (e) {
    throw new Error(`${nome}: il dizionario non si legge come JSON (${e instanceof Error ? e.message : e})`);
  }
}

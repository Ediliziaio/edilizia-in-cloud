export interface PropostaEsitoRumore {
  pagina: number;
  mansione: string;
  lavorazione: string;
  esposizione: string;
  estratto: string;
  metodo?: "ocr";
}

const MANSIONE = /^mansione\s*[:=]\s*(.{3,120})$/i;
const LAVORAZIONE = /^(?:lavorazione|attività)\s*[:=]\s*(.{3,140})$/i;
const ESPOSIZIONE = /^(?:L\s*[_ ]?EX\s*[,._ ]?\s*(?:8\s*h|w)|esposizione (?:giornaliera|settimanale))\s*[:=]\s*(?:[<>≤≥]\s*)?\d{1,3}(?:[.,]\d{1,3})?\s*dB\s*\(\s*A\s*\)\s*\.?$/i;
const COLONNA_ESPOSIZIONE = /^(L\s*[_ ]?EX\s*[,._ ]?\s*(?:8\s*h|w)|esposizione (?:giornaliera|settimanale))\s*[\[(]?dB\s*\(\s*A\s*\)[\])]?$/i;
const CELLA_ESP = /^(?:[<>≤≥]\s*)?\d{1,3}(?:[.,]\d{1,3})?(?:\s*dB\s*\(\s*A\s*\))?$/i;
const separaCelle = (r: string) => r.trim().replace(/^\||\|$/g, "").split(/\s*\|\s*|\t+| {3,}/).map(c => c.trim());

function esitiTabella(testo: string) {
  const risultati: Omit<PropostaEsitoRumore, "pagina">[] = [];
  const righe = testo.split(/\r?\n/).map(separaCelle);
  let intestazioni: string[] = [], incarico = -1, attivita = -1;
  let metriche: { i: number; titolo: string }[] = [];
  for (const celle of righe) {
    const m = celle.findIndex(c => /^mansione$/i.test(c));
    if (m >= 0) {
      intestazioni = celle;
      incarico = m;
      attivita = celle.findIndex(c => /^(lavorazione|attività)$/i.test(c));
      metriche = celle.flatMap((c, i) => {
        const titolo = COLONNA_ESPOSIZIONE.exec(c)?.[1];
        return titolo ? [{ i, titolo }] : [];
      });
      if (new Set(metriche.map(v => v.titolo.toLowerCase())).size !== metriche.length) metriche = [];
      continue;
    }
    if (!metriche.length) continue;
    if (celle.every(c => /^[-:]*$/.test(c))) continue;
    const mansione = celle[incarico];
    if (celle.length !== intestazioni.length || !mansione || !/\p{L}/u.test(mansione) ||
        /^(?:totale|media|note?|riepilogo|pag\b)|illeggibile|da (?:definire|verificare|compilare)/i.test(mansione) ||
        !metriche.every(({ i }) => CELLA_ESP.test(celle[i]))) {
      metriche = [];
      continue;
    }
    const lavorazione = celle[attivita] ?? "";
    for (const { i, titolo } of metriche) {
      const valore = celle[i].replace(/\s*dB\s*\(\s*A\s*\)$/i, "");
      risultati.push({ mansione, lavorazione, esposizione: `${titolo}: ${valore} dB(A)`,
        estratto: [intestazioni.join(" | "), celle.join(" | ")].join("\n") });
    }
  }
  return risultati;
}

/** Richiede una mansione esplicita e una riga di esposizione con unità. Una cella isolata non basta. */
export function proponiEsitiRumore(pagine: Array<{ pagina: number; testo: string; metodo?: "ocr" }>): PropostaEsitoRumore[] {
  const proposte: PropostaEsitoRumore[] = [];
  for (const p of pagine) {
    const testo = p.testo.normalize("NFC");
    const metodo = p.metodo ? { metodo: p.metodo } : {};
    const distinte = new Map(esitiTabella(testo).map(e => [JSON.stringify([e.mansione, e.lavorazione, e.esposizione]), e]));
    proposte.push(...[...distinte.values()].map(esito => ({ ...esito, pagina: p.pagina, ...metodo })));
    if (proposte.length >= 80) return proposte.slice(0, 80);
    const righe = testo.split(/\r?\n/).map(r => r.replace(/\s+/g, " ").trim()).filter(Boolean);
    for (const [i, riga] of righe.entries()) {
      const mansione = MANSIONE.exec(riga)?.[1];
      if (!mansione || /da (?:definire|compilare|verificare)|\[|\.\.\./i.test(mansione)) continue;
      const gruppo = righe.slice(i + 1, i + 7);
      const successiva = gruppo.findIndex(r => MANSIONE.test(r) || /^(?:tabella|riepilogo|sorgenti)\b/i.test(r));
      const valide = successiva < 0 ? gruppo : gruppo.slice(0, successiva);
      const lavorazione = valide.map(r => LAVORAZIONE.exec(r)?.[1]).find(Boolean) ?? "";
      const esiti = valide.filter(r => ESPOSIZIONE.test(r));
      // Valori diversi nello stesso gruppo possono appartenere a condizioni o periodi diversi.
      if (esiti.length !== 1) continue;
      const esposizione = esiti[0];
      const estratto = [riga, valide.find(r => LAVORAZIONE.test(r)), esposizione].filter(Boolean).join("\n");
      if (!proposte.some(r => r.pagina === p.pagina && r.estratto === estratto)) proposte.push({ pagina: p.pagina, mansione, lavorazione, esposizione, estratto, ...metodo });
      if (proposte.length >= 80) return proposte;
    }
  }
  return proposte;
}

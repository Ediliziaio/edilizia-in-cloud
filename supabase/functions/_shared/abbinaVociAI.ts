/**
 * Proposta per significato: voci del computo → voci del listino aziendale (11/11/2026).
 *
 * A nome non si collega quasi niente: sui 557 computi veri della Demo 2 le descrizioni
 * («Fornitura e posa di pavimento in gres porcellanato 60x60, compreso collante…») non
 * somigliano mai ai nomi corti del listino («Posa pavimento gres porcellanato»).
 * Qui, per ogni voce, una rosa di candidati per parole in comune, e il modello sceglie
 * quello che è la STESSA lavorazione, o nessuno. La proposta non si applica mai da sola:
 * nel popup «Collega al listino» la persona la vede e la spunta.
 *
 * Puro, senza Deno: lo provano i test (src/test/logic/abbinaVociAI.test.ts).
 */

export interface VoceDaProporre { id: string; descrizione: string; unita: string | null }
export interface VoceListinoCandidata { id: string; nome: string; unita: string | null; codice?: string | null }
export interface PropostaAI { voce_id: string; tariffa_id: string; certezza: "alta" | "media"; perche: string }

const VUOTE = new Set(["di", "del", "dello", "della", "dei", "degli", "delle", "da", "dal", "dalla", "in", "nel", "nella", "con", "per", "a", "al", "alla", "ai", "alle", "e", "ed", "il", "lo", "la", "i", "gli", "le", "un", "una", "uno", "compreso", "compresa", "compresi", "escluso", "esclusa", "esclusi", "ogni", "onere", "oneri", "tipo", "fino", "oltre", "come", "secondo"]);

/**
 * Le unità come le normalizza il programma (copia di SINONIMI_UNITA di src/lib/prezzario/confronto.ts e di
 * public.unita_normalizzata: il test abbinaVociAI.test.ts controlla che restino uguali).
 */
export const SINONIMI_UNITA: Readonly<Record<string, string>> = {
  mq: "m2", m2: "m2", metroquadro: "m2", metriquadri: "m2", metroquadrato: "m2",
  mc: "m3", m3: "m3", metrocubo: "m3", metricubi: "m3",
  ml: "m", m: "m", mt: "m", metro: "m", metrolineare: "m", metrilineari: "m",
  cad: "cad", pz: "cad", pezzo: "cad", pezzi: "cad", n: "cad", nr: "cad", num: "cad", cadauno: "cad",
  kg: "kg", chilogrammo: "kg", chili: "kg",
  t: "t", ton: "t", tonnellata: "t",
  h: "h", ora: "h", ore: "h",
  l: "l", lt: "l", litro: "l", litri: "l",
  acorpo: "a corpo", acorpo1: "a corpo", corpo: "a corpo", ac: "a corpo", forfait: "a corpo", aforfait: "a corpo", fisso: "a corpo",
  gg: "gg", giorno: "gg", giorni: "gg", giornata: "gg", giornate: "gg",
  mese: "mese", mesi: "mese",
  paio: "paio", paia: "paio",
  km: "km", chilometro: "km", chilometri: "km",
  piano: "piano", piani: "piano",
};

export function normalizzaUnita(u: string | null | undefined): string {
  const t = (u ?? "").toLowerCase().replace(/\s+/g, "").replace(/[._]/g, "").replace(/²/g, "2").replace(/³/g, "3");
  return t ? SINONIMI_UNITA[t] ?? t : "";
}

/** Prova sui computi veri (11/11/2026): senza questo filtro il modello abbinava un quadro elettrico (cad) a un impianto «a corpo». */
export const stessaUnita = (a: string | null | undefined, b: string | null | undefined) => {
  const x = normalizzaUnita(a);
  return !!x && x === normalizzaUnita(b);
};

/** Parole che contano, senza vocale finale (come `paroleChiave` di src/lib/subappaltatori/abbinamentoListino.ts). */
export function parole(testo: string): string[] {
  const t = testo.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return [...new Set(t.split(/\s+/).filter((w) => w.length > 1 && !VUOTE.has(w) && !/^\d+$/.test(w)).map((w) => (w.length > 3 ? w.replace(/[aeiou]$/, "") : w)))];
}

/** I candidati per una voce: le voci di listino con più parole in comune (al massimo `quanti`). */
export function candidati(voce: VoceDaProporre, listino: ReadonlyArray<VoceListinoCandidata>, quanti = 12): VoceListinoCandidata[] {
  const pv = new Set(parole(voce.descrizione.slice(0, 600)));
  return listino
    .filter((t) => stessaUnita(voce.unita, t.unita))
    .map((t) => {
      const pt = parole(t.nome);
      const comuni = pt.filter((w) => pv.has(w)).length;
      return { t, punti: pt.length ? comuni + comuni / pt.length : 0 };
    })
    .filter((x) => x.punti > 0)
    .sort((a, b) => b.punti - a.punti)
    .slice(0, quanti)
    .map((x) => x.t);
}

export const SISTEMA = `Abbini le voci di un computo metrico edile alle voci del listino manodopera di un'impresa.
Per ogni voce hai alcuni candidati numerati, già con la stessa unità di misura. Scegli il candidato che è la STESSA lavorazione: stesso oggetto e stesso lavoro, non solo lo stesso impianto o lo stesso tema.
Se nessun candidato è la stessa lavorazione, rispondi null. Meglio null che un abbinamento sbagliato: un prezzo sbagliato finisce nel contratto di una ditta.
Non abbinare voci soltanto dello stesso tema: un ponteggio non è un tiro al piano, una demolizione di tramezzi non è una demolizione di pavimenti, un quadro elettrico non è il rifacimento di un impianto, un trasporto a discarica in mc non è un trasporto al km, una fornitura di materiale non è una posa.
Nella maggior parte dei computi molte voci NON hanno un corrispondente nel listino: null è la risposta normale.
Una voce di «fornitura e posa» si può abbinare alla sola «posa» della stessa lavorazione: è la parte che fa la ditta.
"certezza": "alta" solo se è chiaramente la stessa lavorazione; altrimenti "media".
"perche": al massimo 12 parole, in italiano semplice.
Rispondi solo JSON: {"abbinamenti":[{"v":1,"c":2,"certezza":"alta","perche":"..."},{"v":2,"c":null}]}`;

/** Il testo per il modello: le voci, ciascuna coi suoi candidati. */
export function testoRichiesta(voci: ReadonlyArray<{ voce: VoceDaProporre; candidati: VoceListinoCandidata[] }>): string {
  return voci.map(({ voce, candidati: c }, i) => [
    `V${i + 1} [${voce.unita ?? "?"}] ${voce.descrizione.replace(/\s+/g, " ").slice(0, 400)}`,
    ...c.map((t, j) => `  ${j + 1}) [${t.unita ?? "?"}] ${t.nome.replace(/\s+/g, " ").slice(0, 160)}`),
  ].join("\n")).join("\n\n");
}

/** La risposta del modello, controllata: solo numeri che esistono, una scelta per voce. */
export function leggiRisposta(
  contenuto: string,
  voci: ReadonlyArray<{ voce: VoceDaProporre; candidati: VoceListinoCandidata[] }>,
): PropostaAI[] {
  let dati: unknown;
  try { dati = JSON.parse(contenuto.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { return []; }
  const elenco = Array.isArray((dati as { abbinamenti?: unknown })?.abbinamenti) ? (dati as { abbinamenti: unknown[] }).abbinamenti : [];
  const fatte = new Set<number>();
  const out: PropostaAI[] = [];
  for (const x of elenco) {
    const r = x as { v?: unknown; c?: unknown; certezza?: unknown; perche?: unknown };
    const v = Number(r.v);
    const c = r.c == null ? null : Number(r.c);
    if (!Number.isInteger(v) || v < 1 || v > voci.length || fatte.has(v)) continue;
    fatte.add(v);
    const blocco = voci[v - 1];
    if (c == null || !Number.isInteger(c) || c < 1 || c > blocco.candidati.length) continue;
    out.push({
      voce_id: blocco.voce.id,
      tariffa_id: blocco.candidati[c - 1].id,
      certezza: r.certezza === "alta" ? "alta" : "media",
      perche: typeof r.perche === "string" ? r.perche.slice(0, 120) : "",
    });
  }
  return out;
}

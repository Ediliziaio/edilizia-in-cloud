/**
 * Logica PURA della pipeline di una campagna cold: dalle righe di
 * outreach_campagna_fasi (una per fase, con il conteggio) alle colonne da
 * disegnare, nell'ordine in cui un contatto le attraversa.
 *
 *   Nel flusso   Da contattare → Email 1 → … → Email N → Flusso finito
 *   Risposte     Interessati · Domande · Altre risposte · Non interessati
 *   Usciti       Rimbalzate · Disiscritti · Fermati
 *
 * «Email 3» conta chi ha ricevuto la terza email e aspetta la quarta: è dove
 * il contatto si trova ADESSO, non quante volte la terza email è partita (quello
 * lo dicono le statistiche, passo per passo).
 */

/** Stato di una campagna (outreach_sequences.status) come lo legge chi la guarda. */
export const STATO_CAMPAGNA: Record<string, { etichetta: string; punto: string }> = {
  active: { etichetta: "Attiva", punto: "bg-emerald-500" },
  paused: { etichetta: "In pausa", punto: "bg-amber-500" },
  draft: { etichetta: "Bozza", punto: "bg-muted-foreground/40" },
  archived: { etichetta: "Archiviata", punto: "bg-muted-foreground/25" },
};

export type GruppoFase = "flusso" | "risposta" | "uscita";
export type TonoFase = "neutro" | "attivo" | "buono" | "info" | "spento" | "allerta";

export interface FaseRiga {
  fase: string;
  contatti: number;
  in_pausa: number;
  prossimo_invio: string | null;
  ultimo_programmato: string | null;
}

export interface PassoDef {
  /** 1-based, nell'ordine della sequenza */
  passo: number;
  canale: string;
  /** giorno del passo dall'iscrizione (i ritardi delle sequenze lineari sono cumulativi) */
  giorno: number | null;
  oggetto: string | null;
}

export interface FaseVista {
  chiave: string;
  gruppo: GruppoFase;
  titolo: string;
  sottotitolo: string;
  contatti: number;
  inPausa: number;
  prossimoInvio: string | null;
  ultimoProgrammato: string | null;
  tono: TonoFase;
}

const CANALE: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS", call: "Chiamata" };

export function etichettaCanale(canale: string | null | undefined): string {
  return CANALE[canale ?? "email"] ?? "Messaggio";
}

const RISPOSTE: Array<{ chiave: string; titolo: string; sottotitolo: string; tono: TonoFase }> = [
  { chiave: "risposta_interessato", titolo: "Interessati", sottotitolo: "vogliono saperne di più", tono: "buono" },
  { chiave: "risposta_domanda", titolo: "Domande", sottotitolo: "chiedono prezzi o dettagli", tono: "info" },
  { chiave: "risposta_altro", titolo: "Altre risposte", sottotitolo: "da leggere e classificare", tono: "neutro" },
  { chiave: "risposta_non_interessato", titolo: "Non interessati", sottotitolo: "hanno detto di no", tono: "spento" },
];

const USCITE: Array<{ chiave: string; titolo: string; sottotitolo: string; tono: TonoFase }> = [
  { chiave: "rimbalzato", titolo: "Rimbalzate", sottotitolo: "indirizzo inesistente o rifiutato", tono: "allerta" },
  { chiave: "disiscritto", titolo: "Disiscritti", sottotitolo: "hanno chiesto di non ricevere più", tono: "spento" },
  { chiave: "fermato", titolo: "Fermati", sottotitolo: "a mano o per un errore d'invio", tono: "spento" },
];

/** Numero del passo da una chiave "passo_3" → 3; altrimenti null. */
export function numeroPasso(chiave: string): number | null {
  const m = /^passo_(\d+)$/.exec(chiave);
  return m ? Number(m[1]) : null;
}

/**
 * Tutte le colonne della campagna, anche quelle vuote: una pipeline con i
 * buchi («Email 2» che manca perché nessuno è lì oggi) fa perdere la forma del
 * flusso. I passi arrivano dalla definizione della sequenza; se ci sono
 * contatti oltre l'ultimo passo definito (sequenze modificate strada facendo)
 * le loro colonne compaiono comunque.
 */
export function costruisciFasi(righe: FaseRiga[], passi: PassoDef[]): FaseVista[] {
  const perChiave = new Map(righe.map((r) => [r.fase, r]));
  const vista = (chiave: string, gruppo: GruppoFase, titolo: string, sottotitolo: string, tono: TonoFase): FaseVista => {
    const r = perChiave.get(chiave);
    return {
      chiave, gruppo, titolo, sottotitolo, tono,
      contatti: Number(r?.contatti ?? 0),
      inPausa: Number(r?.in_pausa ?? 0),
      prossimoInvio: r?.prossimo_invio ?? null,
      ultimoProgrammato: r?.ultimo_programmato ?? null,
    };
  };

  const ordinati = [...passi].sort((a, b) => a.passo - b.passo);
  const nDefiniti = ordinati.length;
  const nOsservati = Math.max(0, ...righe.map((r) => numeroPasso(r.fase) ?? 0));
  const nPassi = Math.max(nDefiniti, nOsservati);
  const defDi = (k: number) => ordinati.find((p) => p.passo === k);

  const out: FaseVista[] = [
    vista("da_contattare", "flusso", "Da contattare",
      defDi(1) ? `aspettano ${etichettaCanale(defDi(1)?.canale).toLowerCase()} 1` : "nessun messaggio ancora partito", "attivo"),
  ];
  for (let k = 1; k <= nPassi; k++) {
    const qui = defDi(k);
    const dopo = defDi(k + 1);
    const titolo = `${etichettaCanale(qui?.canale)} ${k}`;
    const sottotitolo = k < nPassi
      ? (dopo?.giorno != null ? `ricevuta · la ${k + 1}ª parte al giorno ${dopo.giorno}` : `ricevuta · in attesa della ${k + 1}ª`)
      : "ultima del flusso · si aspetta una risposta";
    out.push(vista(`passo_${k}`, "flusso", titolo, sottotitolo, "attivo"));
  }
  out.push(vista("completato", "flusso", "Flusso finito", "ricevute tutte, nessuna risposta", "neutro"));
  for (const r of RISPOSTE) out.push(vista(r.chiave, "risposta", r.titolo, r.sottotitolo, r.tono));
  for (const u of USCITE) out.push(vista(u.chiave, "uscita", u.titolo, u.sottotitolo, u.tono));
  return out;
}

/**
 * La colonna da aprire per prima: le risposte (sono il lavoro da fare), poi il
 * primo passo con qualcuno dentro, altrimenti chi deve ancora partire.
 */
export function faseIniziale(fasi: FaseVista[]): string {
  const risposta = ["risposta_interessato", "risposta_domanda", "risposta_altro", "risposta_non_interessato"]
    .find((k) => (fasi.find((f) => f.chiave === k)?.contatti ?? 0) > 0);
  if (risposta) return risposta;
  const inCorso = fasi.find((f) => numeroPasso(f.chiave) != null && f.contatti > 0);
  if (inCorso) return inCorso.chiave;
  const conQualcuno = fasi.find((f) => f.contatti > 0);
  return conQualcuno?.chiave ?? "da_contattare";
}

/**
 * Percentuale leggibile: «0%», «<1%» (qualcuno c'è ma è meno dell'1%), «12%»,
 * «4,5%» sotto il 10%. «—» se il denominatore è zero: 0 su 0 non è 0%.
 */
export function percentuale(n: number, d: number): string {
  if (!d) return "—";
  if (!n) return "0%";
  const p = (n / d) * 100;
  if (p < 1) return "<1%";
  if (p < 10) return `${(Math.round(p * 10) / 10).toLocaleString("it-IT")}%`;
  return `${Math.round(p)}%`;
}

/** L'oggetto di un passo com'è scritto nella sequenza: varianti separate da "===", vuoto = risposta nel thread. */
export function oggettoLeggibile(oggetto: string | null | undefined): { testo: string; varianti: number; risposta: boolean } {
  const parti = String(oggetto ?? "").split("===").map((s) => s.trim()).filter(Boolean);
  if (parti.length === 0) return { testo: "Re: nella stessa conversazione", varianti: 0, risposta: true };
  return { testo: parti[0], varianti: parti.length - 1, risposta: false };
}

/**
 * Invii già in ritardo: messaggi programmati per un giorno PASSATO e non ancora
 * partiti (finestra d'invio chiusa, tetti delle caselle). Partono alla prossima
 * finestra utile, non nel giorno in cui erano segnati.
 */
export function inRitardo(giorni: Array<{ giorno: string; programmati: number }>, oggi: string): number {
  return giorni.filter((g) => g.giorno < oggi).reduce((s, g) => s + g.programmati, 0);
}

/** Il passo che fa rispondere di più, solo se ha abbastanza invii per dirlo (default 20). */
export function passoMigliore(passi: Array<{ passo: number; inviati: number; risposte: number }>, minimo = 20): number | null {
  let migliore: { passo: number; tasso: number } | null = null;
  for (const p of passi) {
    if (p.inviati < minimo || p.risposte === 0) continue;
    const tasso = p.risposte / p.inviati;
    if (!migliore || tasso > migliore.tasso) migliore = { passo: p.passo, tasso };
  }
  return migliore?.passo ?? null;
}

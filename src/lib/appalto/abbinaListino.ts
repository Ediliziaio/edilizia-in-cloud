/**
 * Abbinare le voci del listino di un committente alle voci del listino generale
 * (25/11/2026).
 *
 * Perche' serve: il prezzo del committente arriva nel rendiconto, nei preventivi
 * e nel SAL guardando il contratto. Nei RAPPORTINI no: lì l'operaio scegli una
 * voce del listino generale, e la regola in tre passi
 * (`prezzo_voce_commessa`: eccezione di cantiere → listino del committente →
 * listino generale) riconosce il prezzo del committente solo attraverso
 * `appalto_tariffe.tariffa_id`. Senza quel legame una riga caricata da un foglio
 * resta scollegata, e il rapportino valorizza le ore al prezzo standard: 35 €
 * invece dei 32,50 concordati con quel committente.
 *
 * Collegarle a mano, 45 righe per committente, non lo fa nessuno. Quindi le
 * abbina il programma — ma **mai indovinando**: un prezzo abbinato alla voce
 * sbagliata finisce in fattura al committente sbagliato, che e' peggio di una
 * voce da collegare a mano. Dove ci sono due candidate plausibili la riga resta
 * scollegata e l'anteprima lo dice.
 */

export interface VoceGenerale {
  id: string;
  codice: string | null;
  nome: string;
}

export interface Abbinamento {
  /** La voce del listino generale, o null se non e' stata abbinata. */
  tariffaId: string | null;
  /** Il nome della voce abbinata, per mostrarlo nell'anteprima. */
  nome: string | null;
  /** Come e' stata trovata, o perche' non lo e' stata. */
  come: "codice" | "nome" | "quasi" | "nessuna" | "ambigua";
}

/** Minuscole, senza accenti, senza punteggiatura, spazi singoli. */
export function chiaveVoce(testo: string): string {
  return String(testo ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SCOLLEGATA: Abbinamento = { tariffaId: null, nome: null, come: "nessuna" };
const AMBIGUA: Abbinamento = { tariffaId: null, nome: null, come: "ambigua" };

/** Le voci generali che sono «la stessa cosa» di questa riga, per chiave esatta. */
function perNome(indice: Map<string, VoceGenerale[]>, nome: string): VoceGenerale[] {
  return indice.get(chiaveVoce(nome)) ?? [];
}

/**
 * Abbina una riga del foglio a una voce del listino generale.
 *
 * In ordine: il codice (se c'e' da entrambe le parti), il nome identico a meno
 * di accenti e punteggiatura, e infine — solo se la candidata e' UNA — un nome
 * che contiene l'altro («Operaio specializzato» ↔ «Operaio specializzato 3°
 * livello»). Con due candidate la riga resta scollegata.
 */
export function abbinaVoce(riga: { codice?: string | null; descrizione: string }, generali: readonly VoceGenerale[]): Abbinamento {
  const perCodice = new Map<string, VoceGenerale[]>();
  const perChiave = new Map<string, VoceGenerale[]>();
  for (const v of generali) {
    if (v.codice?.trim()) {
      const k = chiaveVoce(v.codice);
      perCodice.set(k, [...(perCodice.get(k) ?? []), v]);
    }
    const k = chiaveVoce(v.nome);
    perChiave.set(k, [...(perChiave.get(k) ?? []), v]);
  }

  const codice = riga.codice?.trim();
  if (codice) {
    const trovate = perCodice.get(chiaveVoce(codice)) ?? [];
    if (trovate.length === 1) return { tariffaId: trovate[0].id, nome: trovate[0].nome, come: "codice" };
    if (trovate.length > 1) return AMBIGUA;
  }

  const nome = chiaveVoce(riga.descrizione);
  if (!nome) return SCOLLEGATA;

  const uguali = perNome(perChiave, riga.descrizione);
  if (uguali.length === 1) return { tariffaId: uguali[0].id, nome: uguali[0].nome, come: "nome" };
  if (uguali.length > 1) return AMBIGUA;

  // Una sola voce che contiene il nome (o che il nome contiene): abbinata.
  // Due o piu': scollegata, perche' sceglierne una sarebbe indovinare.
  const vicine = generali.filter((v) => {
    const k = chiaveVoce(v.nome);
    if (!k || k === nome) return false;
    return k.includes(nome) || nome.includes(k);
  });
  if (vicine.length === 1) return { tariffaId: vicine[0].id, nome: vicine[0].nome, come: "quasi" };
  return vicine.length > 1 ? AMBIGUA : SCOLLEGATA;
}

/** Gli abbinamenti di tutte le righe, nell'ordine in cui arrivano. */
export function abbinaListino<T extends { codice?: string | null; descrizione: string }>(
  righe: readonly T[],
  generali: readonly VoceGenerale[],
): Abbinamento[] {
  return righe.map((r) => abbinaVoce(r, generali));
}

/** Quante righe sono collegate e quante no: il numero che l'anteprima mostra. */
export function contaAbbinamenti(abbinamenti: readonly Abbinamento[]): { collegate: number; scollegate: number } {
  const collegate = abbinamenti.filter((a) => a.tariffaId).length;
  return { collegate, scollegate: abbinamenti.length - collegate };
}

/**
 * playbook.ts — MP-SILVIO-05 · logica pura delle ricette (validazione + rami)
 * Un playbook è una sequenza di PASSI: alcuni sono azioni del registro
 * (azione_chiave), altri nodi-condizione di sicurezza (condizione/ramo). Nessun I/O.
 */

export interface PlaybookPasso {
  ordine: number;
  azione_chiave?: string;
  condizione?: string;
  ramo?: string;
  nota?: string;
}

export interface ValidazionePlaybook {
  valido: boolean;
  azioniIgnote: string[];
  numAzioni: number;
  numRamiSicurezza: number;
}

/** Solo i passi che SONO azioni (hanno azione_chiave). */
export function passiAzione(passi: PlaybookPasso[]): PlaybookPasso[] {
  return (passi ?? []).filter((p) => !!p.azione_chiave);
}

/** Nodi-condizione di sicurezza (es. IBAN diverso, scostamento DDT). */
export function ramiSicurezza(passi: PlaybookPasso[]): PlaybookPasso[] {
  return (passi ?? []).filter((p) => !p.azione_chiave && (p.condizione || p.ramo));
}

/**
 * Un playbook è valido se ogni passo-AZIONE punta a un'azione del registro.
 * I nodi-condizione (senza azione_chiave) non vanno validati contro il registro.
 */
export function validaPlaybook(passi: PlaybookPasso[], chiaviValide: Set<string> | string[]): ValidazionePlaybook {
  const set = chiaviValide instanceof Set ? chiaviValide : new Set(chiaviValide);
  const azioni = passiAzione(passi);
  const ignote = [...new Set(azioni.map((p) => p.azione_chiave!).filter((a) => !set.has(a)))];
  return {
    valido: azioni.length > 0 && ignote.length === 0,
    azioniIgnote: ignote,
    numAzioni: azioni.length,
    numRamiSicurezza: ramiSicurezza(passi).length,
  };
}

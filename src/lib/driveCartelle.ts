// EiC Drive: albero delle cartelle (parent_id). Funzioni pure, usate dalla
// pagina e dai test. Il database controlla le stesse regole (trigger
// drive_cartella_coerente, policy eic_drive_cartella_elimina_guardia).

export type CartellaAlbero = { id: string; name: string; parent_id?: string | null; mode?: string; archived_at?: string | null };

/** Dalla radice alla cartella indicata, compresa. Si ferma su un ciclo o su una madre mancante. */
export function percorsoCartella<T extends CartellaAlbero>(cartelle: readonly T[], id: string | null): T[] {
  const perId = new Map(cartelle.map(c => [c.id, c]));
  const percorso: T[] = [];
  const visti = new Set<string>();
  let corrente = id ? perId.get(id) : undefined;
  while (corrente && !visti.has(corrente.id)) {
    visti.add(corrente.id);
    percorso.unshift(corrente);
    corrente = corrente.parent_id ? perId.get(corrente.parent_id) : undefined;
  }
  return percorso;
}

/** Cartelle che stanno direttamente dentro `parentId` (null = radice). Una cartella la cui madre non c'è più sale alla radice. */
export function sottocartelle<T extends CartellaAlbero>(cartelle: readonly T[], parentId: string | null): T[] {
  const ids = new Set(cartelle.map(c => c.id));
  return cartelle.filter(c => {
    const madre = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    return madre === parentId;
  });
}

/** «Madre / Figlia / Nipote», per le tendine dove si sceglie una cartella. */
export function nomeConPercorso(cartelle: readonly CartellaAlbero[], id: string): string {
  return percorsoCartella(cartelle, id).map(c => c.name).join(" / ");
}

/** Le cartelle in ordine d'albero (madre, poi le sue figlie), con il nome completo. */
export function cartelleInOrdineAlbero<T extends CartellaAlbero>(cartelle: readonly T[]): (T & { percorso: string; livello: number })[] {
  const esito: (T & { percorso: string; livello: number })[] = [];
  const visti = new Set<string>();
  const visita = (parentId: string | null, prefisso: string, livello: number) => {
    for (const c of sottocartelle(cartelle, parentId)) {
      if (visti.has(c.id)) continue;
      visti.add(c.id);
      const percorso = prefisso ? `${prefisso} / ${c.name}` : c.name;
      esito.push({ ...c, percorso, livello });
      visita(c.id, percorso, livello + 1);
    }
  };
  visita(null, "", 0);
  return esito;
}

/** Si elimina (non archivia) solo una cartella senza sottocartelle e senza file. */
export function cartellaEliminabile(cartelle: readonly CartellaAlbero[], id: string, fileNellaCartella: number): boolean {
  return fileNellaCartella === 0 && !cartelle.some(c => c.parent_id === id);
}

/** Si archivia solo se non ha sottocartelle attive. */
export function cartellaArchiviabile(cartelle: readonly CartellaAlbero[], id: string): boolean {
  return !cartelle.some(c => c.parent_id === id && !c.archived_at);
}

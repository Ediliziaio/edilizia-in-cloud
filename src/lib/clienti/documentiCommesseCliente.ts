/**
 * Documenti delle commesse di un cliente, visti dalla scheda cliente:
 * raggruppati per commessa e, dentro ogni commessa, per cartella.
 * Regole pure: nessun accesso al database qui.
 */
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";

/** Riga di `order_attachments` (file_url = percorso nel bucket order-attachments). */
export interface DocumentoCommessaRiga {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  folder_id: string | null;
  /** Miniatura salvata accanto al file al caricamento (bucket order-attachments). */
  thumb_path?: string | null;
}

export interface CommessaDelCliente {
  id: string;
  order_code: string | null;
  description: string | null;
  /** Fase attuale della commessa (order_statuses), se nota. */
  fase: { name: string; color: string } | null;
}

export interface CartellaConDocumenti {
  /** null = file senza cartella (o in una cartella che non esiste più). */
  folderId: string | null;
  nome: string;
  documenti: DocumentoCommessaRiga[];
}

export interface CommessaConDocumenti {
  commessa: CommessaDelCliente;
  totale: number;
  cartelle: CartellaConDocumenti[];
}

export const NOME_SENZA_CARTELLA = "Senza cartella";

const piuRecentePrima = (a: DocumentoCommessaRiga, b: DocumentoCommessaRiga) =>
  new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

/**
 * Raggruppa i file per commessa (nell'ordine in cui arrivano le commesse) e
 * poi per cartella (nell'ordine delle cartelle dell'azienda, «Senza cartella»
 * in fondo). Le commesse senza file non compaiono. Un file la cui cartella non
 * è fra quelle passate finisce in «Senza cartella», come nella commessa.
 * Per mostrare il nome vero delle cartelle archiviate, passare anche quelle.
 */
export function raggruppaDocumentiCommesse(
  documenti: DocumentoCommessaRiga[],
  commesse: CommessaDelCliente[],
  cartelle: CartellaDocumenti[],
): CommessaConDocumenti[] {
  const cartellaPerId = new Map(cartelle.map((c) => [c.id, c]));

  const perCommessa = new Map<string, DocumentoCommessaRiga[]>();
  for (const d of documenti) {
    const lista = perCommessa.get(d.order_id);
    if (lista) lista.push(d);
    else perCommessa.set(d.order_id, [d]);
  }

  const risultato: CommessaConDocumenti[] = [];
  for (const commessa of commesse) {
    const docs = perCommessa.get(commessa.id);
    if (!docs || docs.length === 0) continue;

    const perCartella = new Map<string | null, DocumentoCommessaRiga[]>();
    for (const d of docs) {
      const chiave = d.folder_id && cartellaPerId.has(d.folder_id) ? d.folder_id : null;
      const lista = perCartella.get(chiave);
      if (lista) lista.push(d);
      else perCartella.set(chiave, [d]);
    }

    const gruppi: CartellaConDocumenti[] = Array.from(perCartella.entries()).map(([folderId, lista]) => ({
      folderId,
      nome: folderId ? cartellaPerId.get(folderId)!.nome : NOME_SENZA_CARTELLA,
      documenti: [...lista].sort(piuRecentePrima),
    }));
    gruppi.sort((a, b) => {
      if (a.folderId === null) return 1;
      if (b.folderId === null) return -1;
      const ca = cartellaPerId.get(a.folderId)!;
      const cb = cartellaPerId.get(b.folderId)!;
      return ca.posizione - cb.posizione || ca.nome.localeCompare(cb.nome, "it");
    });

    risultato.push({ commessa, totale: docs.length, cartelle: gruppi });
  }
  return risultato;
}

/** Divide un elenco in blocchi: un `in(...)` con centinaia di id allunga troppo l'URL. */
export function aBlocchi<T>(elementi: T[], dimensione: number): T[][] {
  const blocchi: T[][] = [];
  for (let i = 0; i < elementi.length; i += dimensione) blocchi.push(elementi.slice(i, i + dimensione));
  return blocchi;
}

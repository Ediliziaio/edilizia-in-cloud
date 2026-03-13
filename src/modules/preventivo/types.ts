export type CategoriaKB =
  | "presentazione_azienda"
  | "catalogo_prodotti"
  | "scheda_tecnica"
  | "listino_prezzi"
  | "condizioni_contrattuali"
  | "portfolio"
  | "certificazioni"
  | "altro";

export interface KBDocumento {
  id: string;
  azienda_id: string;
  nome: string;
  descrizione: string | null;
  file_url: string;
  file_type: string;
  file_size_kb: number;
  categoria: CategoriaKB;
  stato: "caricato" | "elaborazione" | "indicizzato" | "errore";
  tags: string[];
  pagine: number | null;
  chunks_count: number;
  indicizzato_at: string | null;
  errore_msg: string | null;
  created_at: string;
  updated_at: string;
}

export interface KBChunk {
  id: string;
  documento_id: string;
  azienda_id: string;
  testo: string;
  testo_preview: string | null;
  pagina: number;
  chunk_index: number;
  categoria: string | null;
  similarity?: number;
}

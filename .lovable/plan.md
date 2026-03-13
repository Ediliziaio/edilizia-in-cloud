

## Piano: Knowledge Base Upload + Embedding per Generatore Preventivo AI (Doc 2/7)

### Stato attuale
- **Nessuna infrastruttura KB esistente**: no tabelle `preventivo_kb_*`, no pgvector, no `GEMINI_API_KEY`
- **No tipi definiti**: `CategoriaKB`, `KBDocumento` non esistono
- **No edge functions**: `extract-document-text`, `chunk-and-embed`, `embed-query` non esistono
- **Hook `useAzienda` non esiste** — il progetto usa `useEffectiveCompanyId()` da `src/hooks/useEffectiveCompanyId.ts`
- **Lovable AI disponibile** con `LOVABLE_API_KEY` — il prompt usa Gemini API direttamente con `GEMINI_API_KEY` che non è configurato

### Decisioni architetturali

**Embedding**: Il prompt specifica Gemini `text-embedding-004` via API diretta. Questo richiede `GEMINI_API_KEY` che non esiste. Due opzioni:
1. Chiedere all'utente di fornire `GEMINI_API_KEY` (il prompt lo assume)
2. Usare Lovable AI Gateway per gli embedding (ma non supporta embedding nativamente, solo chat completions)

**Approccio scelto**: Usare Gemini API direttamente come da spec — richiederà `GEMINI_API_KEY` come secret.

**pgvector**: Necessario per similarity search. Va abilitato via migration.

### Implementazione

**Step 1 — DB Migration**
- Abilitare estensione `vector`
- Creare tabella `preventivo_kb_documenti` (id, azienda_id, nome, descrizione, file_url, file_type, file_size_kb, categoria, stato, tags, pagine, chunks_count, indicizzato_at, errore_msg, created_at)
- Creare tabella `preventivo_kb_chunks` (id, documento_id FK, azienda_id, testo, testo_preview, pagina, chunk_index, embedding vector(768), categoria, created_at)
- Creare bucket storage `preventivo-kb`
- RLS policies per entrambe le tabelle (company_id scoped)
- Indice HNSW/IVFFlat su embedding per similarity search
- Funzione RPC `search_kb_chunks` (cosine similarity)

**Step 2 — Tipi TypeScript**
- Creare `src/modules/preventivo/types.ts` con `CategoriaKB`, `KBDocumento`, `KBChunk`

**Step 3 — Edge Functions** (3 funzioni)
- `extract-document-text/index.ts`: Riceve `documentoId`, scarica file da storage, usa Gemini per estrarre testo da PDF (vision), TXT diretto. Aggiorna stato documento.
- `chunk-and-embed/index.ts`: Riceve pagine di testo, splitta in chunk con overlap, genera embedding via Gemini `text-embedding-004`, inserisce in `preventivo_kb_chunks` a batch di 20.
- `embed-query/index.ts`: Micro-function per embedding di una query di ricerca.
- Tutte con CORS headers e gestione errori 429/402.
- Aggiornare `config.toml` con `verify_jwt = false` per le 3 funzioni.

**Step 4 — Hook**
- `src/hooks/useKnowledgeBase.ts`: Upload pipeline (storage → DB record → extract → chunk&embed), polling auto per documenti in elaborazione, eliminazione, re-indicizzazione, test search via RPC.

**Step 5 — UI**
- `src/pages/azienda/KnowledgeBaseManager.tsx`: Drag&drop upload, categorie, stats (totale/indicizzati/chunks), lista documenti con stato, test RAG search.

**Step 6 — Secret**
- Richiedere `GEMINI_API_KEY` all'utente prima di procedere con le edge functions.

### File da creare/modificare

```text
CREATI:
  supabase/migrations/xxx_kb_tables.sql          — pgvector + tabelle + RPC + storage
  src/modules/preventivo/types.ts                 — tipi KB
  supabase/functions/extract-document-text/index.ts
  supabase/functions/chunk-and-embed/index.ts
  supabase/functions/embed-query/index.ts
  src/hooks/useKnowledgeBase.ts
  src/pages/azienda/KnowledgeBaseManager.tsx

MODIFICATI:
  supabase/config.toml                            — 3 nuove function entries
```

### Pre-requisito bloccante
`GEMINI_API_KEY` deve essere aggiunto come secret prima di poter usare le edge functions di embedding ed estrazione.


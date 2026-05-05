---
area: 00-meta
tipo: guida-tecnica
versione: 1.0
aggiornato_il: 2026-05-04
---

# Ingestion Guide — come caricare il KB nel sistema EiC

Questa guida è per gli sviluppatori del Cervello Supremo. Spiega come trasformare i file `.md` di questa knowledge base in vettori semantici utilizzabili dall'AI in produzione.

---

## Stack tecnologico assunto

- **Backend**: Supabase (Postgres) con estensione `pgvector`
- **Embedding model**: OpenAI `text-embedding-3-large` (3072 dim) o `text-embedding-3-small` (1536 dim)
- **Chunk size target**: 800-1.200 token per chunk
- **Chunk overlap**: 100-150 token
- **Frontend AI**: Edge Functions Supabase + frontend React EiC

Lo schema può essere adattato a Pinecone, Weaviate, Qdrant, o vector DB self-hosted senza modifiche concettuali.

---

## Schema tabella `kb_chunks`

```sql
create extension if not exists vector;

create table public.kb_chunks (
  id uuid primary key default gen_random_uuid(),
  area text not null,
  doc_path text not null,
  doc_title text not null,
  chunk_index int not null,
  content text not null,
  tags text[] default '{}',
  livello text check (livello in ('base','intermedio','avanzato')),
  applicabile_a text[] default '{}',
  kpi_correlati text[] default '{}',
  embedding vector(1536) not null,
  source_hash text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on public.kb_chunks using ivfflat (embedding vector_cosine_ops);
create index on public.kb_chunks (area);
create index on public.kb_chunks using gin (tags);
```

`source_hash` permette di rilevare quando un documento è stato modificato e ri-generare i chunk solo per quello.

---

## Frontmatter standard di ogni documento

Ogni `.md` del KB inizia con frontmatter YAML. Lo script di ingestion lo legge per popolare i campi della tabella.

```yaml
---
area: 02-finanza-cashflow
titolo: DSO e DPO — il ciclo del capitale circolante
tags: [dso, dpo, cashflow, ciclo-monetario, capitale-circolante, liquidita]
livello: intermedio
applicabile_a: [pmi-strutturata, scaling, gestione-finanziaria]
kpi_correlati: [dso-clienti, dpo-fornitori, ciclo-monetario, fido-cassa]
versione: 1.0
aggiornato_il: 2026-05-04
---
```

**Campi obbligatori**: area, titolo, tags, livello.
**Campi raccomandati**: applicabile_a, kpi_correlati.
**Campi tecnici**: versione, aggiornato_il.

---

## Pipeline di ingestion

### 1. Discovery
Scansiona ricorsivamente la cartella `knowledge-base/`, esclude `00-meta/` (i meta-file non sono knowledge consultabile dall'utente — sono prompt di sistema, vanno caricati separatamente).

### 2. Parsing
Per ogni file `.md`:
- Estrai frontmatter
- Rimuovi commenti HTML
- Calcola `source_hash` (sha256 del contenuto post-frontmatter)
- Confronta con hash in DB: se invariato, skip; se cambiato, prosegui con re-ingestion

### 3. Chunking
Strategia raccomandata:
- Split per `## ` (titoli di secondo livello) come boundary primario
- Se un blocco H2 supera 1.500 token, split per `### ` (terzo livello)
- Se ancora troppo grande, split per paragrafo con sliding window 1.000 token, overlap 150
- Mantieni il titolo H2 corrente come prefisso del chunk per dare contesto

Ogni chunk porta con sé i metadati del documento (area, tags, livello, ecc.) ma anche la sezione di origine (per cita-re la fonte nelle risposte AI).

### 4. Embedding
Per ogni chunk, chiama il modello di embedding scelto. Inserisci o aggiorna il record in `kb_chunks`.

Per documenti modificati: cancella i chunk vecchi (`delete from kb_chunks where doc_path = $1`) e reinserisci.

### 5. Indici e statistiche
Dopo ingestion completa:
- `analyze public.kb_chunks` per aggiornare le statistiche dell'index ivfflat
- Log: numero documenti, numero chunk, dimensione totale embeddings, tempo totale

---

## Funzione di retrieval — esempio Edge Function

```ts
// supabase/functions/kb-retrieve/index.ts
import { serve } from "https://deno.land/std/http/server.ts"
import { createClient } from "@supabase/supabase-js"

serve(async (req) => {
  const { query, area, top_k = 6 } = await req.json()
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Embedding della domanda utente
  const embedding = await embed(query) // OpenAI o altro

  // 2. Recupero semantic search con filtro area opzionale
  const { data, error } = await supabase.rpc("match_kb", {
    query_embedding: embedding,
    match_count: top_k,
    filter_area: area ?? null
  })

  return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
})
```

Funzione SQL `match_kb`:

```sql
create or replace function match_kb(
  query_embedding vector(1536),
  match_count int default 6,
  filter_area text default null
)
returns table (
  id uuid,
  area text,
  doc_title text,
  content text,
  tags text[],
  livello text,
  similarity float
)
language sql stable as $$
  select
    id, area, doc_title, content, tags, livello,
    1 - (embedding <=> query_embedding) as similarity
  from kb_chunks
  where filter_area is null or area = filter_area
  order by embedding <=> query_embedding
  limit match_count;
$$;
```

---

## Strategia di prompt assembly

Quando l'utente fa una domanda, il flusso è:

1. **Classifica la domanda** (vedi `decision-framework.md`) per capire l'area dominante.
2. **Retrieve top-K chunk** dalla KB (default top 6, con filtro area se la classificazione è confidente).
3. **Retrieve dati Company Brain** rilevanti (es. cantieri attivi, KPI correnti).
4. **Assembla il context window**:
   ```
   <system_prompt>      ← system-prompt-cervello.md
   <voice_tone>          ← voice-and-tone.md (estratto sintetico)
   <kb_context>          ← top-K chunk recuperati con metadati
   <company_context>     ← dati Company Brain pertinenti
   <user_question>       ← domanda originale
   ```
5. **Genera la risposta** con LLM (Claude / GPT / modello on-prem).
6. **Citation back-reference**: la risposta può includere riferimenti alla fonte (`doc_title`) per trasparenza.

---

## Aggiornamento incrementale

La KB cambia nel tempo (normativa, prassi, casi nuovi). Lo script di ingestion deve essere idempotente:

- Eseguito su una cartella invariata: 0 nuovi inserimenti.
- Eseguito su un file modificato: cancella i chunk vecchi di quel file, reinserisce nuovi.
- Eseguito con un file nuovo: inserisce.
- Eseguito con un file eliminato: elimina i chunk corrispondenti (richiede passaggio di "diff" tra filesystem e DB).

Suggerito: cron settimanale o trigger CI su push del repo `knowledge-base/`.

---

## Versionamento e tracciabilità

Ogni risposta dell'AI registra in log:
- domanda utente
- chunk recuperati (id + similarity score)
- dati Company Brain usati
- modello LLM usato
- risposta generata

Questo serve per:
- Debug ("perché l'AI mi ha detto questo?")
- Misurare la qualità del retrieval
- Identificare buchi del KB (domande senza buon match → segnale di area da espandere)

---

## Validazione qualità

Prima di promuovere il KB in produzione, eseguire questi test:

1. **Test di copertura**: 100 domande tipo per area (totale 700) e verificare che almeno l'80% recuperi almeno un chunk con similarity ≥ 0.78.
2. **Test di coerenza voce**: campionare 50 risposte generate e verificare manualmente che il tono sia in linea con `voice-and-tone.md`.
3. **Test di accuratezza fattuale**: 30 domande con risposte note (es. "qual è la durata standard del SAL", "quale codice TD per autofattura UE") e verificare correttezza.
4. **Test di edge case**: domande fuori scope, domande ambigue, domande in dialetto/regionali.

Solo dopo aver passato i 4 test, attivare il KB su clienti reali.

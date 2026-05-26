# Imprenditore Edile 3.0 — Cervello centrale Silvio

> KB del metodo "Imprenditore Edile 3.0" integrato nel cervello degli agenti
> super_admin Silvio (Florin lato founder).
>
> **Decisione 1 (Opzione A)**: SOLO super_admin agents leggono questo KB.
> Gli agenti azienda (lato cliente) NON hanno accesso diretto.
>
> Eccezione: l'azienda può chiedere override per regole specifiche solo per
> sé — vedi `company_kb_overrides` + `persona-mapping.md`.

## File in questa cartella

| File | Cosa contiene | Token |
|------|---------------|-------|
| `cardinal-principles.md` | 20 principi sempre nel system prompt (ibrido) | ~800 |
| `coach-voice.md` | Tono di voce autorevole-da-coach (Decisione 8) | guida editoriale |
| `persona-mapping.md` | Quale manuale → quale persona Silvio | mappa |
| `README.md` | Questo file | — |

## Pipeline ingest (22 .docx → DB)

Tutta in `scripts/kb-ingest/`:

```bash
# Florin droppa i 22 .docx in /Users/agenteai/Downloads/libri me manuali/
# (oppure override via env KB_INGEST_SOURCE_DIR)

cd /Users/agenteai/edilizia-in-cloud
npm install mammoth openai @supabase/supabase-js dotenv
npx tsx scripts/kb-ingest/run-all.ts
```

Output:
- Tabella `ai_brain_documents` popolata (scope='silvio_admin', kb_section='22-metodo-*')
- Citation log abilitato (`silvio_kb_citation_log`)
- Override aziendali pronti (`company_kb_overrides`)

## Architettura runtime

```
User edile → Silvio admin chat (super_admin only)
                │
                ├── get_cardinal_principles(persona, company_id?)   [sempre]
                │     → 20 principi nel system prompt
                │
                ├── embed user query (OpenAI text-embedding-3-small)
                │
                ├── search_silvio_knowledge_v2(emb, k=8, persona, company)
                │     → 8 chunk dettaglio + override aziendali
                │
                ├── LLM call (Claude Sonnet via OpenRouter)
                │     System: <coach-voice> + <cardinal> + <RAG>
                │     User:   <query>
                │
                └── log_kb_citation(...)   [audit interno, no display]
                      → hits_count tracking + drift detection
```

## Cosa NON fa Silvio (vincoli editoriali)

- ❌ Non cita la fonte ("secondo il metodo X..."). Voce nativa.
- ❌ Non usa "Lei". Sempre "tu".
- ❌ Non parla in inglese aziendale ("stakeholder", "ottimizzare"). Cantiere.
- ❌ Non lascia mai una critica senza azione concreta + scadenza.

## Aggiornamenti futuri (Decisione 5)

La pipeline è **idempotente** (hash content). Quando Florin aggiorna un .docx:

```bash
# Sostituisci il .docx
# Rilancia
npx tsx scripts/kb-ingest/run-all.ts
# Solo i chunk con hash cambiato vengono ri-embeddati e ri-uploadati.
```

## Budget

| Voce | Costo |
|------|-------|
| Ingest iniziale 22 .docx (~6.4M token embedding) | ~$0.13 |
| Update mensile (~20% modificato) | ~$0.03 |
| Query in produzione (per chat session) | ~$0.0001 |

## Quality monitoring

- `v_kb_imprenditore_edile_stats` → quanti chunk, hit rate per libro
- `silvio_kb_citation_log` → audit interno (chi cita cosa)
- Drift detection: cron settimanale che confronta gli hits_count con il trend del mese precedente

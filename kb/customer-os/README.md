# KB — Customer OS

Knowledge Base che alimenta le 6 personas agentiche del Customer OS.

## File

| File | Owner agent | Quando aggiornarlo |
|------|-------------|--------------------|
| `florin-voice.md` | TUTTE (system prompt) | Quando Florin nota tone off → aggiorna esempi |
| `eic-features-current.md` | Marco, Giorgio | Ogni rilascio nuova feature |
| `ticket-templates-faq.md` | Giorgio | Quando arriva FAQ ricorrente nuovo |
| `onboarding-playbook.md` | Sofia | Ogni trimestre + dopo NPS feedback |
| `upsell-signals.md` | Tommaso | Quando trovi pattern upsell nuovo |
| `case-studies.md` | Marco | Quando un cliente chiude un risultato importante |
| `objection-handlers.md` | Marco | Quando lead solleva obiezione nuova ricorrente |

## Workflow di update

1. Florin nota gap (es. Marco scrive male su un punto)
2. Apre file relevant in `kb/customer-os/`
3. Aggiunge esempio / sezione / regola
4. Commit + push
5. Edge function ricarica al prossimo run (cache TTL 15 min)

## Sync DB

Una RPC `kb_documents_sync_from_files` legge questa cartella e popola
`public.kb_documents` per query via embedding/RAG dagli agenti.

NON deployata ancora — TODO Sprint 7.

Per ora gli agenti caricano via `supabase.from("kb_documents").select("*").eq("slug", "...")`.

Devi popolare `kb_documents` manualmente la prima volta (es. via Supabase Studio):

```sql
INSERT INTO kb_documents (slug, title, kind, content) VALUES
  ('florin-voice', 'Florin Voice & Tone', 'reference', '... content da florin-voice.md ...'),
  ('eic-features-current', 'EiC Features attuali', 'reference', '... content ...'),
  ('case-studies', 'Case Studies clienti', 'reference', '... content ...');
```

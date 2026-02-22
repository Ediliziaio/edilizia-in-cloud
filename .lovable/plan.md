

# Sincronizzazione Tag Esistenti + Visualizzazione Migliorata

## Problema

Il contatto "Enrico Goldoni" ha il tag `["facebook"]` ma la sua opportunita collegata ha tag `[]`. Il codice di sync (useTagSync.ts) funziona solo per modifiche **future**. I dati pre-esistenti non sono allineati.

## Soluzione (2 interventi)

### 1. Migrazione dati: allineare tag esistenti

Eseguire una query SQL una tantum che, per ogni opportunita collegata a un contatto, unisce i tag del contatto a quelli dell'opportunita (merge, non sovrascrittura):

```sql
UPDATE marketing_opportunities mo
SET tags = (
  SELECT ARRAY(SELECT DISTINCT unnest(mo.tags || mc.tags))
  FROM marketing_contacts mc
  WHERE mc.id = mo.contact_id
),
updated_at = now()
FROM marketing_contacts mc
WHERE mc.id = mo.contact_id
  AND mc.tags != '{}'
  AND NOT (mc.tags <@ mo.tags);
```

Questo aggiorna solo le opportunita dove il contatto ha tag non ancora presenti nell'opportunita.

### 2. Auto-sync all'apertura del detail dialog

Per evitare che il problema si ripresenti (ad esempio se la sync fallisce per un errore di rete), aggiungere nel `OpportunityDetailDialog` un effetto che, all'apertura, verifica se i tag del contatto sono presenti nell'opportunita e li merge automaticamente se mancano. Questo e un "safety net".

**File**: `src/components/opportunities/OpportunityDetailDialog.tsx` - aggiungere un `useEffect` che al mount confronta `opportunity.tags` con i tag del contatto (gia disponibile tramite la query contatto) e chiama `syncTagsToContact` se necessario.

---

## Riepilogo

| Intervento | Tipo |
|-----------|------|
| Query SQL migrazione | Una tantum - allinea tutti i dati esistenti |
| Auto-sync in OpportunityDetailDialog | Codice - safety net per futuri disallineamenti |

## Dettagli tecnici

- La query SQL usa `<@` (array contained by) per verificare se i tag del contatto sono gia tutti presenti
- L'auto-sync nel dialog usa i dati gia caricati (contact query) quindi non fa chiamate extra
- Entrambi gli interventi fanno merge (unione), mai sovrascrittura

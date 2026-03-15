

## Analisi Completa Area Agenti AI — Bug & Problemi Identificati

Ho esaminato tutti i 12 file principali dell'area Agenti AI. Ecco i problemi reali trovati:

### Bug Confermati

| # | Gravità | File | Problema |
|---|---------|------|----------|
| 1 | **P1** | `ChatConversazioniTab.tsx` | Il campo di ricerca `cerca` è nel queryKey ma **non viene mai applicato alla query**. La ricerca è completamente non funzionante — digitare nel campo search non filtra nulla |
| 2 | **P1** | `AgentCreateModal.tsx` | Il wizard raccoglie impostazioni comportamento (risposta_automatica, registra/trascrivi chiamate, rileva segreteria, squillo_max, durata_max) e widget chat (titolo, colore, posizione) ma **non le salva nel database**. Queste configurazioni vengono perse dopo la creazione |
| 3 | **P2** | `TelephonyTab.tsx` L68-69 | Due chiamate separate a `useUnifiedAgents` (una per "vocale", una inline per "campagna"). Funziona ma genera 2 query separate inutili. Meglio una singola query senza filtro tipo e filtrare client-side |
| 4 | **P2** | `WhatsAppTabUnified.tsx` L236-239 | Il pulsante "Elimina" chiama `deleteMutation.mutate()` **senza dialogo di conferma**, a differenza di tutti gli altri componenti che usano AlertDialog |
| 5 | **P3** | `CreditiTab.tsx` L19 | Import morto: `formatCurrency` da `@/lib/formatters` non viene mai usato |
| 6 | **P2** | `ConversazioniTab.tsx` L63 | Se `agentIdFilter` cambia dopo il mount, `agentFilter` state resta col valore iniziale (stale prop). Non si aggiorna mai |

### Correzioni Pianificate

**1. ChatConversazioniTab — Fix ricerca (P1)**
- Aggiungere `.ilike("agent_nome", ...)` o filtrare client-side le sessions per testo. Dato che il join con `ai_agents_v2` c'è, il filtro su `agent_nome` va fatto post-fetch (il campo è calcolato). Meglio filtrare `sessions` con `useMemo` lato client.

**2. AgentCreateModal — Persistere config wizard (P1)**
- Aggiungere i campi raccolti dal wizard (`temperatura`, `widget_titolo`, `widget_colore`, `widget_posizione`) all'oggetto `insert` in `handleCreate`. I campi comportamento vocale (`risposta_automatica`, `registra_chiamate`, ecc.) vanno salvati nel campo JSON `tools_config` dell'agente.

**3. TelephonyTab — Query singola per agenti (P2)**
- Sostituire le 2 chiamate `useUnifiedAgents` con una singola senza filtro tipo, poi filtrare `vocale`/`campagna` client-side.

**4. WhatsAppTabUnified — Conferma eliminazione (P2)**
- Wrappare il pulsante Elimina in un `AlertDialog` come negli altri componenti.

**5. CreditiTab — Rimuovere import morto (P3)**
- Rimuovere `formatCurrency` dall'import.

**6. ConversazioniTab — Sync agentIdFilter prop (P2)**
- Aggiungere `useEffect` per sincronizzare `agentFilter` quando `agentIdFilter` cambia.

### File da modificare

| File | Fix |
|---|---|
| `ChatConversazioniTab.tsx` | Aggiungere filtro ricerca client-side con useMemo |
| `AgentCreateModal.tsx` | Persistere temperatura, tools_config, widget config nell'insert |
| `TelephonyTab.tsx` | Unificare query agenti |
| `WhatsAppTabUnified.tsx` | Aggiungere AlertDialog per eliminazione |
| `CreditiTab.tsx` | Rimuovere import morto |
| `ConversazioniTab.tsx` | Sync prop agentIdFilter |


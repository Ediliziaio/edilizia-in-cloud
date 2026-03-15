

## Piano: Unificazione Agenti AI (UNIF-AGE-01)

Questo documento descrive la trasformazione completa del sistema Agenti AI da due moduli separati (esterni/interni) a un sistema unificato con tabella singola e navigazione orizzontale.

Data la complessità, propongo di suddividere in **3 fasi sequenziali**. Questa prima implementazione copre la Fase 1 (DB) e Fase 2 (pagina unificata).

---

### Fase 1 — Schema DB

**Migrazione SQL:**
- Creare enum `tipo_agente_enum` (`vocale`, `chat`, `whatsapp`, `interno`, `campagna`)
- Creare tabella unificata `ai_agents_v2` con tutti i campi dal documento (identita, voce, chat, whatsapp, CRM, statistiche) — usando validation trigger invece di CHECK per `stato`
- Creare/aggiornare tabelle ausiliarie: `ai_phone_numbers`, `ai_whatsapp_numbers`, `ai_conversations`, `ai_knowledge_base`, `ai_agent_knowledge`, `ai_campaigns`, `ai_elevenlabs_config`
- Creare RPC `get_ai_company_stats`
- RLS su tutte le tabelle con isolamento per `company_id`
- Migrare dati esistenti da `ai_agents` e `internal_ai_agents` nella nuova tabella (se presenti)

**Note importanti:**
- Il campo `creato_da` referenzia `auth.users(id)` — questo e corretto per FK ma NON verra usato per query dirette (usiamo `profiles` per info utente)
- Niente CHECK su timestamp — usiamo trigger di validazione

---

### Fase 2 — Pagina Unificata

**Struttura nuova:**

```text
/azienda/agenti-ai
├── Tab: Agenti (default) — lista unificata con filtri tipo chip
├── Tab: Knowledge Base
├── Tab: Telefonia
├── Tab: Campagne
├── Tab: WhatsApp (badge Alpha)
├── Tab: Crediti & Utilizzo
└── Tab: Impostazioni
```

**Componenti da creare:**

| Componente | Descrizione |
|---|---|
| `src/pages/azienda/AgentiAIPage.tsx` | Pagina principale con tab orizzontali, header con stato ElevenLabs, stats bar |
| `src/components/agenti/AgentiAIStatsBar.tsx` | 6 metriche (agenti attivi, chiamate, minuti, chat, tasso risposta, crediti) |
| `src/components/agenti/AgentiTab.tsx` | Lista agenti con filtri chip per tipo, ricerca, filtro stato, griglia card |
| `src/components/agenti/AgentCard.tsx` | Card agente con badge tipo colorato, stats, menu azioni |
| `src/components/agenti/AgentCreateModal.tsx` | Modale creazione con selezione tipo + campi base |

**Componenti riusati dai moduli esistenti** (tab Knowledge Base, Telefonia, Crediti, Impostazioni, WhatsApp — riportano i componenti gia funzionanti):

| Tab | Componente sorgente |
|---|---|
| Knowledge Base | `PlatformKnowledgeBasePage` |
| Telefonia | `AgentPhoneNumbersPage` |
| Campagne | `InternalCampaignsPage` |
| WhatsApp | `AgentWhatsAppPage` |
| Crediti | `AgentCreditsPage` |
| Impostazioni | `PlatformSettingsPage` |

**Hook unificato:** `src/hooks/useUnifiedAgents.ts`
- Query dalla nuova tabella `ai_agents_v2` (o nome definitivo)
- CRUD con sync ElevenLabs per tipi vocale/campagna
- Supporto filtri tipo/stato/ricerca

**Route:**
- `AgentiAIUnified.tsx` viene sostituito da `AgentiAIPage.tsx`
- Redirect backward-compatible mantenuti
- Editor agente: routing a editor appropriato in base al `tipo` dell'agente

---

### Fase 3 (successiva) — Editor unificato per agente

L'editor dell'agente (pagina dettaglio) verra unificato in un secondo momento. Per ora, il click su un agente instrada all'editor esistente corretto in base al `tipo`.

---

### File da creare/modificare

| File | Azione |
|---|---|
| Migrazione SQL | Creare tabelle, enum, RLS, RPC |
| `src/pages/azienda/AgentiAIPage.tsx` | Creare — pagina principale |
| `src/components/agenti/AgentiAIStatsBar.tsx` | Creare |
| `src/components/agenti/AgentiTab.tsx` | Creare |
| `src/components/agenti/AgentCard.tsx` | Creare (nuova card unificata) |
| `src/components/agenti/AgentCreateModal.tsx` | Creare |
| `src/hooks/useUnifiedAgents.ts` | Creare — hook CRUD unificato |
| `src/routes/companyRoutes.tsx` | Aggiornare route per nuova pagina |
| `src/pages/azienda/AgentiAIUnified.tsx` | Deprecare/rimuovere |


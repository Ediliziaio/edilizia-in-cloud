# Modulo AI Agents — Documentazione

## Panoramica

Modulo standalone per la gestione di agenti vocali AI integrato in EdiliziaInCloud, basato su ElevenLabs Conversational AI.

## Struttura File

```
src/modules/ai-agents/
├── index.tsx                    # Entry point con routing
├── pages/
│   ├── AgentsListPage.tsx       # Lista agenti + wizard creazione
│   ├── AgentEditorPage.tsx      # Editor agente con 10 tab
│   ├── PlatformKnowledgeBasePage.tsx  # KB globale workspace
│   ├── AgentCreditsPage.tsx     # Crediti e utilizzo
│   ├── AgentPhoneNumbersPage.tsx # Gestione numeri
│   ├── AgentWhatsAppPage.tsx    # WhatsApp (Alpha)
│   └── PlatformSettingsPage.tsx # Impostazioni admin
├── components/
│   ├── AgentSidebar.tsx         # Navigazione interna modulo
│   ├── AgentTab.tsx             # Tab configurazione agente
│   ├── AgentKBTab.tsx           # Tab KB agente
│   ├── AgentWidgetTab.tsx       # Tab widget embed
│   ├── AgentAnalyticsTab.tsx    # Tab analisi
│   ├── AgentBranchTab.tsx       # Tab branch/A-B test
│   ├── AgentTestTab.tsx         # Tab test
│   ├── AgentToolsTab.tsx        # Tab strumenti
│   ├── WorkflowCanvas.tsx       # Canvas workflow visuale
│   ├── VoiceSelector.tsx        # Selettore voci
│   ├── LLMSelector.tsx          # Selettore modelli LLM
│   ├── KnowledgeBaseDocumentList.tsx # Componente lista documenti
│   ├── PhoneNumberManager.tsx   # Gestione numeri telefono
│   ├── AnalyticsTable.tsx       # Tabella conversazioni
│   ├── ConversationPlayer.tsx   # Player trascrizione
│   └── CreditUsageBar.tsx       # Barra utilizzo crediti
├── hooks/
│   ├── useAgents.ts             # CRUD agenti
│   ├── useAgentCredits.ts       # Crediti
│   ├── useElevenLabsProxy.ts    # Proxy API calls
│   └── useEdiliziaIntegration.ts # Integrazione CRM
├── lib/
│   ├── elevenLabsClient.ts      # Client API tipizzato
│   ├── creditCalculator.ts      # Calcolo costi
│   └── ediliziaSync.ts          # Sync CRM (client-side reads)
└── types/
    ├── agent.types.ts
    ├── knowledgeBase.types.ts
    └── phoneNumber.types.ts
```

## Schema Database

### ai_agents
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| company_id | uuid FK → companies | |
| elevenlabs_agent_id | text | ID su ElevenLabs |
| name | text | |
| system_prompt | text | |
| first_message | text | |
| voice_id | text | |
| llm_model | text | default: gemini-2.5-flash |
| language | text | default: it |
| is_interruptible | boolean | |
| status | text | draft/active/archived |
| created_by | uuid | |
| created_at, updated_at | timestamp | |

### ai_agent_knowledge_docs
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| agent_id | uuid FK nullable | NULL = KB globale |
| company_id | uuid FK | |
| elevenlabs_doc_id | text | |
| name | text | |
| type | text | url/file/text |
| source_url | text nullable | |
| created_by | uuid | |
| created_at | timestamp | |

### ai_agent_phone_numbers
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| company_id | uuid FK | |
| agent_id | uuid FK | |
| elevenlabs_phone_id | text nullable | |
| phone_number | text | |
| provider | text | default: twilio |
| label | text nullable | |
| created_at | timestamp | |

### ai_agent_conversations
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| agent_id | uuid FK | |
| company_id | uuid FK | |
| elevenlabs_conversation_id | text | |
| contact_id | uuid FK nullable → marketing_contacts | |
| duration_seconds | int | |
| messages_count | int | |
| status | text | |
| appointment_created | boolean | |
| started_at | timestamp | |

### ai_agent_credits
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| company_id | uuid FK (unique) | |
| total_minutes_purchased | numeric | |
| minutes_used | numeric | |
| cost_per_minute_platform | numeric | Costo reale ElevenLabs |
| cost_per_minute_billed | numeric | Costo fatturato al cliente |
| updated_at | timestamp | |

### ai_agent_audit_log
| Colonna | Tipo | Note |
|---------|------|------|
| id | uuid PK | |
| company_id | uuid FK | |
| agent_id | uuid nullable | |
| user_id | uuid | |
| action | text | |
| details | jsonb | |
| created_at | timestamp | |

## Edge Functions

### elevenlabs-proxy
- **Path**: `/functions/v1/elevenlabs-proxy`
- **Auth**: JWT richiesto (utente autenticato)
- **Azioni**: create_agent, update_agent, delete_agent, get_voices, get_models
- **Sicurezza**: API key non esposta al frontend, tutte le chiamate proxy

### elevenlabs-webhook
- **Path**: `/functions/v1/elevenlabs-webhook`
- **Auth**: Pubblico (verify_jwt = false)
- **Trigger**: ElevenLabs post-conversazione
- **Azioni automatiche**:
  1. Salva conversazione in `ai_agent_conversations`
  2. Decrementa crediti in `ai_agent_credits`
  3. Se tool `create_appointment` → crea in `appointments`
  4. Se tool `create_contact` → crea in `marketing_contacts` (source: agente_ai)
  5. Se tool `update_lead_status` → aggiorna `marketing_contacts`
  6. Audit log

## Configurazione Deploy

1. Impostare secret `ELEVENLABS_API_KEY` nel backend
2. Configurare webhook URL su ElevenLabs: `{SUPABASE_URL}/functions/v1/elevenlabs-webhook`
3. Verificare RLS policies sulle tabelle `ai_*`

## Integrazione CRM

Il modulo si integra nativamente con:
- **marketing_contacts**: Creazione lead automatica da conversazioni
- **appointments**: Creazione appuntamenti da tool call
- **ai_agent_conversations**: Tracking completo conversazioni con link a contatti

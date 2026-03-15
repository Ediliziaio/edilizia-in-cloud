# UNIF-AGE-01 — Schema DB Unificato + Pagina Agenti AI

## Obiettivo
Sostituire completamente la divisione "Agenti Esterni" / "Agenti Interni" con un sistema unificato.
Tutti gli agenti vivono in un'unica lista, differenziati per `tipo_agente`.
Navigazione orizzontale: Agenti | Knowledge Base | Telefonia | Campagne | WhatsApp | Crediti | Impostazioni

---

## FASE 1 — Schema DB Unificato

### 1.1 Enum tipo agente
```sql
-- Tutti i tipi in un unico enum
CREATE TYPE tipo_agente_enum AS ENUM (
  'vocale',      -- Voice AI (ElevenLabs) per chiamate in/out
  'chat',        -- Widget chat su sito web / app
  'whatsapp',    -- Bot WhatsApp Business
  'interno',     -- Assistente interno per il team
  'campagna'     -- Agente per campagne outbound automatizzate
);
```

### 1.2 Tabella principale `ai_agents` (unificata)
```sql
CREATE TABLE IF NOT EXISTS ai_agents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Identità
  nome                  TEXT NOT NULL,
  descrizione           TEXT,
  tipo                  tipo_agente_enum NOT NULL DEFAULT 'vocale',
  avatar_url            TEXT,
  stato                 TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','attivo','pausa','archiviato')),

  -- Personalità / comportamento
  system_prompt         TEXT,
  primo_messaggio       TEXT,
  lingua                TEXT NOT NULL DEFAULT 'it',
  temperatura           FLOAT NOT NULL DEFAULT 0.7 CHECK (temperatura BETWEEN 0 AND 1),

  -- ElevenLabs (solo tipo = 'vocale' o 'campagna' con voice)
  elevenlabs_agent_id   TEXT UNIQUE,
  elevenlabs_voice_id   TEXT,
  voice_nome            TEXT,

  -- Configurazione comportamento vocale
  risposta_automatica   BOOLEAN NOT NULL DEFAULT TRUE,
  registra_chiamate     BOOLEAN NOT NULL DEFAULT TRUE,
  trascrivi_chiamate    BOOLEAN NOT NULL DEFAULT TRUE,
  rileva_segreteria     BOOLEAN NOT NULL DEFAULT FALSE,
  squillo_max           INTEGER NOT NULL DEFAULT 4,
  durata_max_secondi    INTEGER NOT NULL DEFAULT 600,

  -- Configurazione chat
  widget_colore         TEXT DEFAULT '#3b82f6',
  widget_posizione      TEXT DEFAULT 'bottom-right'
    CHECK (widget_posizione IN ('bottom-right','bottom-left','top-right','top-left')),
  widget_titolo         TEXT,
  chat_avatar_url       TEXT,
  siti_web_autorizzati  TEXT[],       -- domini dove il widget è abilitato

  -- WhatsApp
  whatsapp_numero_id    UUID REFERENCES ai_whatsapp_numbers(id) ON DELETE SET NULL,
  whatsapp_template_id  TEXT,

  -- Azioni CRM abilitate (JSONB array di stringhe)
  azioni_abilitate      JSONB NOT NULL DEFAULT '["crea_task","aggiorna_contatto"]'::jsonb,

  -- Statistiche (aggiornate da trigger/edge function)
  chiamate_totali       INTEGER NOT NULL DEFAULT 0,
  chiamate_completate   INTEGER NOT NULL DEFAULT 0,
  minuti_totali         FLOAT NOT NULL DEFAULT 0,
  chat_totali           INTEGER NOT NULL DEFAULT 0,
  costo_totale_crediti  FLOAT NOT NULL DEFAULT 0,

  -- Metadata
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creato_da             UUID REFERENCES auth.users(id)
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_ai_agents_company ON ai_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_tipo ON ai_agents(company_id, tipo);
CREATE INDEX IF NOT EXISTS idx_ai_agents_stato ON ai_agents(company_id, stato);

-- RLS
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_agents_company_isolation" ON ai_agents
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.3 Tabella `ai_phone_numbers`
```sql
CREATE TABLE IF NOT EXISTS ai_phone_numbers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id              UUID REFERENCES ai_agents(id) ON DELETE SET NULL,
  numero                TEXT NOT NULL,           -- E.164 es. +39XXXXXXXXXX
  nome_etichetta        TEXT,
  elevenlabs_phone_id   TEXT UNIQUE,
  provider              TEXT DEFAULT 'elevenlabs',
  capacita              TEXT[] DEFAULT ARRAY['inbound','outbound'],
  attivo                BOOLEAN NOT NULL DEFAULT TRUE,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_phone_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "phone_company_isolation" ON ai_phone_numbers
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.4 Tabella `ai_whatsapp_numbers`
```sql
CREATE TABLE IF NOT EXISTS ai_whatsapp_numbers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  numero                TEXT NOT NULL,
  nome_account          TEXT,
  waba_id               TEXT,
  phone_number_id       TEXT,
  access_token_encrypted TEXT,
  stato                 TEXT DEFAULT 'non_configurato',
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_whatsapp_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_company_isolation" ON ai_whatsapp_numbers
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.5 Tabella `ai_conversations`
```sql
CREATE TABLE IF NOT EXISTS ai_conversations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id                    UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  contact_id                  UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Identificatori esterni
  elevenlabs_conversation_id  TEXT UNIQUE,
  canale                      TEXT NOT NULL DEFAULT 'voce'
    CHECK (canale IN ('voce','chat','whatsapp','interno')),

  -- Dati chiamata/chat
  direzione                   TEXT CHECK (direzione IN ('inbound','outbound')),
  numero_chiamante             TEXT,
  numero_chiamato              TEXT,
  stato                       TEXT NOT NULL DEFAULT 'in_corso'
    CHECK (stato IN ('in_corso','completata','fallita','no_risposta','occupato','segreteria')),

  -- Contenuto
  trascrizione_json           JSONB DEFAULT '[]',  -- [{ruolo,testo,timestamp}]
  audio_url                   TEXT,
  riassunto                   TEXT,
  sentiment                   TEXT CHECK (sentiment IN ('positivo','neutro','negativo')),
  note_interne                TEXT,
  task_creati                 JSONB DEFAULT '[]',

  -- Timing
  iniziata_il                 TIMESTAMPTZ,
  risposta_il                 TIMESTAMPTZ,
  terminata_il                TIMESTAMPTZ,
  durata_secondi              INTEGER,
  costo_crediti               FLOAT,

  -- Metadata
  creato_il                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conv_agent ON ai_conversations(agent_id, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_contact ON ai_conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_el ON ai_conversations(elevenlabs_conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_conv_stato ON ai_conversations(company_id, stato);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "conv_company_isolation" ON ai_conversations
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.6 Tabella `ai_knowledge_base`
```sql
CREATE TABLE IF NOT EXISTS ai_knowledge_base (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  titolo                TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('testo','url','faq','prodotto','procedura','file')),
  contenuto             TEXT,
  url                   TEXT,
  elevenlabs_doc_id     TEXT,
  sincronizzato_el      BOOLEAN NOT NULL DEFAULT FALSE,
  ultima_sync           TIMESTAMPTZ,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_company_isolation" ON ai_knowledge_base
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));

-- Tabella pivot agente <-> documento KB
CREATE TABLE IF NOT EXISTS ai_agent_knowledge (
  agent_id  UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  doc_id    UUID NOT NULL REFERENCES ai_knowledge_base(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, doc_id)
);
```

### 1.7 Tabella `ai_campaigns`
```sql
CREATE TABLE IF NOT EXISTS ai_campaigns (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id              UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  nome                  TEXT NOT NULL,
  tipo                  TEXT NOT NULL DEFAULT 'chiamata'
    CHECK (tipo IN ('chiamata','whatsapp','sms')),
  stato                 TEXT NOT NULL DEFAULT 'bozza'
    CHECK (stato IN ('bozza','in_corso','completata','pausa','archiviata')),
  totale_contatti       INTEGER NOT NULL DEFAULT 0,
  chiamate_effettuate   INTEGER NOT NULL DEFAULT 0,
  chiamate_completate   INTEGER NOT NULL DEFAULT 0,
  chiamate_no_risposta  INTEGER NOT NULL DEFAULT 0,
  schedulata_il         TIMESTAMPTZ,
  completata_il         TIMESTAMPTZ,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "camp_company_isolation" ON ai_campaigns
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.8 Tabella `ai_elevenlabs_config`
```sql
CREATE TABLE IF NOT EXISTS ai_elevenlabs_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID UNIQUE NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  api_key_encrypted     TEXT,           -- MAI esposta al frontend
  api_key_valida        BOOLEAN DEFAULT FALSE,
  ultima_verifica       TIMESTAMPTZ,
  crediti_rimanenti     FLOAT DEFAULT 0,
  crediti_totali        FLOAT DEFAULT 0,
  piano                 TEXT,
  creato_il             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aggiornato_il         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE ai_elevenlabs_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "el_config_company_isolation" ON ai_elevenlabs_config
  USING (company_id = (SELECT company_id FROM company_members WHERE user_id = auth.uid() LIMIT 1));
```

### 1.9 RPC statistiche
```sql
-- Stats globali agenti per company
CREATE OR REPLACE FUNCTION get_ai_company_stats(p_company_id UUID, p_giorni INTEGER DEFAULT 30)
RETURNS TABLE(
  agenti_attivi BIGINT,
  conv_totali BIGINT,
  minuti_totali FLOAT,
  chat_totali BIGINT,
  tasso_risposta FLOAT,
  crediti_usati FLOAT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM ai_agents WHERE company_id = p_company_id AND stato = 'attivo'),
    (SELECT COUNT(*) FROM ai_conversations WHERE company_id = p_company_id
      AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(durata_secondi), 0) / 60.0 FROM ai_conversations
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COUNT(*) FROM ai_conversations WHERE company_id = p_company_id
      AND canale IN ('chat','whatsapp') AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT CASE WHEN COUNT(*) = 0 THEN 0
      ELSE COUNT(*) FILTER (WHERE stato = 'completata')::FLOAT / COUNT(*) * 100
      END FROM ai_conversations
      WHERE company_id = p_company_id AND direzione = 'outbound'
        AND creato_il >= NOW() - (p_giorni || ' days')::interval),
    (SELECT COALESCE(SUM(costo_crediti), 0) FROM ai_conversations
      WHERE company_id = p_company_id AND creato_il >= NOW() - (p_giorni || ' days')::interval);
END;
$$;
```

---

## FASE 2 — Pagina Principale `AgentiAIPage`

### 2.1 Layout e navigazione
```tsx
// src/pages/AgentiAIPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Bot, Phone, BookOpen, Megaphone, MessageSquare, CreditCard, Settings, Plus, Zap, AlertTriangle } from 'lucide-react';

// Sub-componenti per ogni tab (vedi prompt successivi)
import { AgentiTab } from '@/components/agenti/AgentiTab';
import { KnowledgeBaseTab } from '@/components/agenti/KnowledgeBaseTab';
import { TelephonyTab } from '@/components/agenti/TelephonyTab';
import { CampagneTab } from '@/components/agenti/CampagneTab';
import { WhatsAppTab } from '@/components/agenti/WhatsAppTab';
import { CreditiTab } from '@/components/agenti/CreditiTab';
import { ImpostazioniTab } from '@/components/agenti/ImpostazioniTab';
import { AgentiAIStatsBar } from '@/components/agenti/AgentiAIStatsBar';

type MainTab = 'agenti' | 'knowledge' | 'telefonia' | 'campagne' | 'whatsapp' | 'crediti' | 'impostazioni';

// Definizione tab principale (NO divisione Interni/Esterni)
const TABS: { key: MainTab; label: string; icon: React.ReactNode; badge?: string }[] = [
  { key: 'agenti',       label: 'Agenti',          icon: <Bot size={15}/> },
  { key: 'knowledge',    label: 'Knowledge Base',   icon: <BookOpen size={15}/> },
  { key: 'telefonia',    label: 'Telefonia',        icon: <Phone size={15}/> },
  { key: 'campagne',     label: 'Campagne',         icon: <Megaphone size={15}/> },
  { key: 'whatsapp',     label: 'WhatsApp',         icon: <MessageSquare size={15}/>, badge: 'Alpha' },
  { key: 'crediti',      label: 'Crediti & Utilizzo', icon: <CreditCard size={15}/> },
  { key: 'impostazioni', label: 'Impostazioni',     icon: <Settings size={15}/> },
];

export default function AgentiAIPage() {
  const [activeTab, setActiveTab] = useState<MainTab>('agenti');

  // Stato ElevenLabs config (per banner warning)
  const { data: elConfig } = useQuery({
    queryKey: ['el-config'],
    queryFn: async () => {
      const { data } = await supabase.from('ai_elevenlabs_config').select('api_key_valida,crediti_rimanenti,piano').single();
      return data;
    }
  });

  // Stats globali (30 giorni)
  const { data: stats } = useQuery({
    queryKey: ['ai-stats'],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_ai_company_stats', { p_giorni: 30 });
      return data?.[0];
    },
    refetchInterval: 60_000
  });

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-gray-200 px-8 pt-6 pb-0">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bot size={26} className="text-blue-600" />
              Agenti AI
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestisci tutti i tuoi agenti AI — vocali, chat, WhatsApp e interni — in un unico posto.
            </p>
          </div>

          {/* Badge stato ElevenLabs */}
          {elConfig?.api_key_valida ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium text-green-700">ElevenLabs connesso</span>
              {elConfig.crediti_rimanenti != null && (
                <span className="text-xs text-green-600 ml-1">
                  · {Math.round(elConfig.crediti_rimanenti).toLocaleString('it-IT')} crediti
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={() => setActiveTab('impostazioni')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors"
            >
              <AlertTriangle size={13} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-700">Configura ElevenLabs</span>
            </button>
          )}
        </div>

        {/* Tabs orizzontali (UN SOLO LIVELLO — no Interni/Esterni) */}
        <nav className="flex items-center gap-0 -mb-px">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span className="ml-0.5 text-[9px] font-bold text-blue-600 bg-blue-100 px-1 py-0.5 rounded uppercase">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* ===== STATS BAR (solo nel tab Agenti) ===== */}
      {activeTab === 'agenti' && stats && (
        <AgentiAIStatsBar stats={stats} />
      )}

      {/* ===== CONTENUTO TAB ===== */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'agenti'       && <AgentiTab />}
        {activeTab === 'knowledge'    && <KnowledgeBaseTab />}
        {activeTab === 'telefonia'    && <TelephonyTab />}
        {activeTab === 'campagne'     && <CampagneTab />}
        {activeTab === 'whatsapp'     && <WhatsAppTab />}
        {activeTab === 'crediti'      && <CreditiTab />}
        {activeTab === 'impostazioni' && <ImpostazioniTab />}
      </div>
    </div>
  );
}
```

### 2.2 Stats bar `AgentiAIStatsBar`
```tsx
// src/components/agenti/AgentiAIStatsBar.tsx
import { Bot, Phone, MessageSquare, TrendingUp, Clock, CreditCard } from 'lucide-react';

interface Stats {
  agenti_attivi: number;
  conv_totali: number;
  minuti_totali: number;
  chat_totali: number;
  tasso_risposta: number;
  crediti_usati: number;
}

const STAT_CONFIG = [
  { key: 'agenti_attivi',  label: 'Agenti attivi',   icon: <Bot size={16}/>,          format: (v: number) => v.toString(),                     color: 'text-blue-600',   bg: 'bg-blue-50' },
  { key: 'conv_totali',    label: 'Chiamate (30gg)',  icon: <Phone size={16}/>,         format: (v: number) => v.toLocaleString('it-IT'),         color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'minuti_totali',  label: 'Minuti (30gg)',    icon: <Clock size={16}/>,         format: (v: number) => `${Math.round(v)} min`,            color: 'text-purple-600', bg: 'bg-purple-50' },
  { key: 'chat_totali',    label: 'Chat (30gg)',      icon: <MessageSquare size={16}/>, format: (v: number) => v.toLocaleString('it-IT'),         color: 'text-green-600',  bg: 'bg-green-50' },
  { key: 'tasso_risposta', label: 'Tasso risposta',   icon: <TrendingUp size={16}/>,    format: (v: number) => `${Math.round(v)}%`,               color: 'text-teal-600',   bg: 'bg-teal-50' },
  { key: 'crediti_usati',  label: 'Crediti usati',    icon: <CreditCard size={16}/>,    format: (v: number) => v.toLocaleString('it-IT', {maximumFractionDigits: 0}), color: 'text-orange-600', bg: 'bg-orange-50' },
];

export function AgentiAIStatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 px-8 py-4 bg-white border-b border-gray-100">
      {STAT_CONFIG.map(cfg => {
        const val = (stats as any)[cfg.key] ?? 0;
        return (
          <div key={cfg.key} className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
              <span className={cfg.color}>{cfg.icon}</span>
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900 leading-tight">{cfg.format(val)}</p>
              <p className="text-[11px] text-gray-500">{cfg.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### 2.3 Tab Agenti `AgentiTab` con filtri per tipo
```tsx
// src/components/agenti/AgentiTab.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Plus, Search, Bot, Phone, MessageSquare, Users, Megaphone, Zap } from 'lucide-react';
import { AgentCard } from './AgentCard';
import { AgentCreateModal } from './AgentCreateModal';

// Tipi agente con config visiva
export const TIPO_AGENTE_CONFIG = {
  vocale: {
    label: 'Vocale',
    descrizione: 'Gestisce chiamate in entrata/uscita via AI',
    icon: <Phone size={14} />,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badge: 'bg-blue-100 text-blue-700',
  },
  chat: {
    label: 'Chat',
    descrizione: 'Widget chat per il tuo sito web',
    icon: <MessageSquare size={14} />,
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    badge: 'bg-green-100 text-green-700',
  },
  whatsapp: {
    label: 'WhatsApp',
    descrizione: 'Bot per WhatsApp Business',
    icon: <MessageSquare size={14} />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    badge: 'bg-emerald-100 text-emerald-700',
  },
  interno: {
    label: 'Interno',
    descrizione: 'Assistente AI per il team',
    icon: <Users size={14} />,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badge: 'bg-purple-100 text-purple-700',
  },
  campagna: {
    label: 'Campagna',
    descrizione: 'Agente per outbound automatizzato',
    icon: <Megaphone size={14} />,
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
  },
};

type FiltroTipo = 'tutti' | keyof typeof TIPO_AGENTE_CONFIG;
type FiltroStato = 'tutti' | 'attivo' | 'pausa' | 'bozza';

export function AgentiTab() {
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('tutti');
  const [filtroStato, setFiltroStato] = useState<FiltroStato>('tutti');
  const [cerca, setCerca] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [tipoPreselezionato, setTipoPreselezionato] = useState<keyof typeof TIPO_AGENTE_CONFIG | null>(null);

  const { data: agenti = [], isLoading, refetch } = useQuery({
    queryKey: ['ai-agents', filtroTipo, filtroStato, cerca],
    queryFn: async () => {
      let q = supabase.from('ai_agents')
        .select('*')
        .order('creato_il', { ascending: false });
      if (filtroTipo !== 'tutti') q = q.eq('tipo', filtroTipo);
      if (filtroStato !== 'tutti') q = q.eq('stato', filtroStato);
      if (cerca) q = q.ilike('nome', `%${cerca}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    }
  });

  // Conteggi per tipo (per i badge sui filtri)
  const conteggioPerTipo = agenti.reduce((acc, a) => {
    acc[a.tipo] = (acc[a.tipo] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const handleCreaAgente = (tipo?: keyof typeof TIPO_AGENTE_CONFIG) => {
    setTipoPreselezionato(tipo || null);
    setShowCreate(true);
  };

  return (
    <div className="px-8 py-6">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Filtri tipo come CHIPS */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setFiltroTipo('tutti')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${filtroTipo === 'tutti' ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            <Bot size={11} /> Tutti ({agenti.length})
          </button>
          {(Object.keys(TIPO_AGENTE_CONFIG) as Array<keyof typeof TIPO_AGENTE_CONFIG>).map(tipo => {
            const cfg = TIPO_AGENTE_CONFIG[tipo];
            const n = conteggioPerTipo[tipo] || 0;
            return (
              <button
                key={tipo}
                onClick={() => setFiltroTipo(tipo)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                  ${filtroTipo === tipo ? `${cfg.bg} ${cfg.color} ring-1 ring-current` : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {cfg.icon} {cfg.label}
                {n > 0 && <span className="ml-0.5 opacity-70">({n})</span>}
              </button>
            );
          })}
        </div>

        <div className="flex-1" />

        {/* Cerca */}
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={cerca}
            onChange={e => setCerca(e.target.value)}
            placeholder="Cerca agente..."
            className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filtro stato */}
        <select
          value={filtroStato}
          onChange={e => setFiltroStato(e.target.value as FiltroStato)}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="tutti">Tutti gli stati</option>
          <option value="attivo">Attivi</option>
          <option value="pausa">In pausa</option>
          <option value="bozza">Bozza</option>
        </select>

        {/* Crea agente */}
        <button
          onClick={() => handleCreaAgente()}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={15} /> Nuovo agente
        </button>
      </div>

      {/* Griglia agenti */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : agenti.length === 0 ? (
        /* Empty state per tipo o globale */
        <EmptyStateAgenti
          filtroTipo={filtroTipo}
          onCrea={handleCreaAgente}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {agenti.map(agente => (
            <AgentCard key={agente.id} agente={agente} onRefresh={refetch} />
          ))}
          {/* Card "+ Nuovo agente" alla fine della griglia */}
          <button
            onClick={() => handleCreaAgente()}
            className="h-52 border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50/30 transition-all"
          >
            <Plus size={24} />
            <span className="text-sm font-medium">Nuovo agente</span>
          </button>
        </div>
      )}

      {/* Quick-create cards (mostrate solo se 0 agenti) — selezione tipo rapida */}
      {agenti.length === 0 && filtroTipo === 'tutti' && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 text-center">
            Oppure scegli il tipo di agente
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 max-w-4xl mx-auto">
            {(Object.keys(TIPO_AGENTE_CONFIG) as Array<keyof typeof TIPO_AGENTE_CONFIG>).map(tipo => {
              const cfg = TIPO_AGENTE_CONFIG[tipo];
              return (
                <button
                  key={tipo}
                  onClick={() => handleCreaAgente(tipo)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all hover:shadow-md ${cfg.bg} ${cfg.border}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${cfg.bg}`}>
                    <span className={`scale-150 ${cfg.color}`}>{cfg.icon}</span>
                  </div>
                  <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[11px] text-gray-500 text-center leading-tight">{cfg.descrizione}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal crea agente */}
      {showCreate && (
        <AgentCreateModal
          tipoPreselezionato={tipoPreselezionato}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}

// Empty state contestuale
function EmptyStateAgenti({ filtroTipo, onCrea }: {
  filtroTipo: FiltroTipo;
  onCrea: (tipo?: keyof typeof TIPO_AGENTE_CONFIG) => void;
}) {
  const cfg = filtroTipo !== 'tutti' ? TIPO_AGENTE_CONFIG[filtroTipo] : null;
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 ${cfg?.bg || 'bg-blue-50'}`}>
        <Bot size={40} className={cfg?.color || 'text-blue-400'} />
      </div>
      <p className="text-xl font-semibold text-gray-700">
        {filtroTipo !== 'tutti' ? `Nessun agente ${cfg?.label?.toLowerCase()}` : 'Nessun agente creato'}
      </p>
      <p className="text-sm text-gray-400 mt-2 text-center max-w-sm">
        {filtroTipo !== 'tutti'
          ? `Crea il tuo primo agente ${cfg?.label?.toLowerCase()} per ${cfg?.descrizione?.toLowerCase()}`
          : 'Crea il tuo primo agente AI per gestire conversazioni, qualificare lead e fissare appuntamenti automaticamente.'
        }
      </p>
      <button
        onClick={() => onCrea(filtroTipo !== 'tutti' ? filtroTipo : undefined)}
        className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
      >
        <Plus size={15} />
        {filtroTipo !== 'tutti' ? `Crea agente ${cfg?.label?.toLowerCase()}` : 'Crea il primo agente'}
      </button>
    </div>
  );
}
```

---

## Checklist implementazione
- [ ] `tipo_agente_enum` creata nel DB
- [ ] Tabella `ai_agents` con tutti i campi (vocale + chat + whatsapp + interno + campagna)
- [ ] Tabelle ausiliarie: phone_numbers, whatsapp_numbers, conversations, knowledge_base, campaigns, elevenlabs_config
- [ ] RPC `get_ai_company_stats` funzionante
- [ ] RLS su tutte le tabelle
- [ ] `AgentiAIPage`: UN SOLO livello di tab — NO Interni/Esterni
- [ ] `AgentiAIStatsBar`: 6 metriche con icone Lucide
- [ ] `AgentiTab`: filtri tipo come chips, griglia agenti, empty state contestuale
- [ ] Quick-create cards visibili quando 0 agenti
- [ ] Route: `/agenti-ai` configurata
- [ ] ZERO emoji — solo icone Lucide

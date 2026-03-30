-- P2-01: Sentiment analysis on conversations
ALTER TABLE public.ai_agent_conversations
  ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(3,2);

COMMENT ON COLUMN public.ai_agent_conversations.sentiment IS 'Sentiment analizzato dalla trascrizione';
COMMENT ON COLUMN public.ai_agent_conversations.sentiment_score IS 'Score da -1 (negativo) a 1 (positivo)';

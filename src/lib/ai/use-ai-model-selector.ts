/**
 * useAIModelSelector — hook gated per il selettore modello AI Test Lab.
 *
 * Gating rigoroso:
 *  - Visibile SOLO se effectiveCompany.id == DEMO_COMPANY_ID
 *    AND user.email == DEMO_USER_EMAIL
 *
 * Per tutti gli altri utenti/aziende: showSelector=false, availableModels=[]
 * → la UI nasconde il dropdown, le edge function ignorano body.model.
 *
 * Persistenza:
 *  - Selezione salvata in localStorage per feature: ai_model_pref:silvio_chat
 *  - Reidratata al mount.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  DEMO_COMPANY_ID,
  DEMO_USER_EMAIL,
  DEFAULT_MODELS,
  type ModelType,
} from '@/lib/ai/models.config';
import { fetchAvailableModels, type AIModelMeta } from '@/lib/ai/openrouter-models';

export type AIFeature =
  | 'silvio_chat'
  | 'ai_orchestrator'
  | 'ai_council'
  | 'silvio_execute'
  | 'ai_summarize'
  | 'doc_router'
  | 'tool_generic';

interface UseAIModelSelectorResult {
  /** True se l'utente corrente è demo + company demo. UI mostra dropdown solo in questo caso. */
  showSelector: boolean;
  /** Lista filtrata + ordinata di modelli disponibili. Vuota se !showSelector. */
  availableModels: AIModelMeta[];
  /** Modello attualmente selezionato (id OpenRouter). */
  selectedModel: string;
  /** Setta il modello (persistenza in localStorage). */
  setSelectedModel: (modelId: string) => void;
  /** True mentre la lista modelli sta caricando. */
  loading: boolean;
  /** Modello selezionato come oggetto AIModelMeta (per UI). */
  selectedModelMeta: AIModelMeta | null;
  /** Forza refresh della lista (bypassa cache). */
  refresh: () => Promise<void>;
}

function lsKey(feature: AIFeature): string {
  return `ai_model_pref:${feature}`;
}

function loadPreference(feature: AIFeature, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return window.localStorage.getItem(lsKey(feature)) ?? fallback;
  } catch {
    return fallback;
  }
}

function savePreference(feature: AIFeature, modelId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(lsKey(feature), modelId);
  } catch {
    /* noop */
  }
}

export function useAIModelSelector(
  feature: AIFeature,
  type: ModelType = 'text',
): UseAIModelSelectorResult {
  const { user, effectiveCompany } = useAuth();

  const showSelector = useMemo(
    () =>
      effectiveCompany?.id === DEMO_COMPANY_ID &&
      user?.email?.toLowerCase() === DEMO_USER_EMAIL,
    [effectiveCompany?.id, user?.email],
  );

  const [allModels, setAllModels] = useState<AIModelMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModelState] = useState<string>(() => {
    const fallback = DEFAULT_MODELS[feature] ?? DEFAULT_MODELS.silvio_chat;
    return showSelector ? loadPreference(feature, fallback) : fallback;
  });

  // Fetch modelli disponibili (solo se demo)
  useEffect(() => {
    if (!showSelector) {
      setAllModels([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchAvailableModels()
      .then((models) => {
        if (!cancelled) setAllModels(models.filter((m) => m.type === type));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showSelector, type]);

  // Se la selezione corrente non esiste più nei modelli disponibili (es.
  // pattern aggiornato), fallback al primo recommended o al default.
  useEffect(() => {
    if (!showSelector || allModels.length === 0) return;
    const exists = allModels.some((m) => m.id === selectedModel);
    if (!exists) {
      const fallback =
        allModels.find((m) => m.recommended)?.id ??
        allModels[0]?.id ??
        DEFAULT_MODELS[feature];
      if (fallback && fallback !== selectedModel) {
        setSelectedModelState(fallback);
        savePreference(feature, fallback);
      }
    }
  }, [allModels, selectedModel, feature, showSelector]);

  const setSelectedModel = useCallback(
    (modelId: string) => {
      setSelectedModelState(modelId);
      if (showSelector) savePreference(feature, modelId);
    },
    [feature, showSelector],
  );

  const refresh = useCallback(async () => {
    if (!showSelector) return;
    setLoading(true);
    try {
      const { invalidateModelsCache } = await import('@/lib/ai/openrouter-models');
      invalidateModelsCache();
      const models = await fetchAvailableModels({ forceRefresh: true });
      setAllModels(models.filter((m) => m.type === type));
    } finally {
      setLoading(false);
    }
  }, [showSelector, type]);

  const selectedModelMeta = useMemo(
    () => allModels.find((m) => m.id === selectedModel) ?? null,
    [allModels, selectedModel],
  );

  return {
    showSelector,
    availableModels: showSelector ? allModels : [],
    selectedModel,
    setSelectedModel,
    loading,
    selectedModelMeta,
    refresh,
  };
}

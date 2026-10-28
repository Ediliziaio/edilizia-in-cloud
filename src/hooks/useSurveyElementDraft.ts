import { useCallback, useEffect, useRef, useState } from "react";
import type { SurveyElementDraft } from "@/lib/surveys/workspace";
import {
  readSurveyDraft,
  removeSurveyDraft,
  writeSurveyDraft,
  surveyDraftKey,
  type LocalSurveyDraft,
  type PendingSurveyAnnotation,
  type SurveyDraftScope,
} from "@/lib/surveys/elementDraft";

/** Local recovery is separate from the server save. No reconnect/background submission. */
export function useSurveyElementDraft({
  scope,
  base,
  baseUpdatedAt,
  schema,
  draft,
  annotation,
  dirty,
  enabled,
}: {
  scope: SurveyDraftScope | null;
  base: SurveyElementDraft;
  baseUpdatedAt: string;
  schema: string;
  draft: SurveyElementDraft;
  annotation: PendingSurveyAnnotation | null;
  dirty: boolean;
  enabled: boolean;
}) {
  const key = scope ? surveyDraftKey(scope) : null;
  const [loaded] = useState(() => {
    try {
      return {
        entry:
          key && enabled ? readSurveyDraft(window.localStorage, key) : null,
        error: null as string | null,
      };
    } catch {
      return {
        entry: null,
        error:
          "La protezione locale non è disponibile in questo browser. Salva nel gestionale prima di uscire.",
      };
    }
  });
  const [recovery, setRecovery] = useState<LocalSurveyDraft | null>(
    loaded.entry,
  );
  const [error, setError] = useState<string | null>(loaded.error),
    [savedAt, setSavedAt] = useState<number | null>(null);
  const [mountedKey] = useState(key);
  const revision = useRef(loaded.entry?.revision ?? null),
    stopped = useRef(false);
  const contextValid = key === mountedKey;
  const persist = useCallback(() => {
    if (!enabled || !contextValid || !key || stopped.current) return false;
    try {
      if (recovery) {
        if (
          readSurveyDraft(window.localStorage, key)?.revision !==
          revision.current
        )
          throw new Error(
            "La bozza è cambiata in un’altra scheda. Riapri l’elemento per verificarla.",
          );
        return true;
      }
      if (!dirty) {
        if (
          revision.current &&
          removeSurveyDraft(window.localStorage, key, revision.current)
        ) {
          revision.current = null;
          setSavedAt(null);
        }
        return true;
      }
      const now = Date.now(),
        next: LocalSurveyDraft = {
          version: 1,
          revision: crypto.randomUUID(),
          savedAt: now,
          baseUpdatedAt,
          schema,
          base,
          draft,
          annotation,
        };
      writeSurveyDraft(window.localStorage, key, next, revision.current);
      revision.current = next.revision;
      setSavedAt(now);
      setError(null);
      return true;
    } catch (e) {
      setError(
        e instanceof Error && /altra scheda|troppo grande/.test(e.message)
          ? e.message
          : "La bozza non è protetta sul dispositivo. Non chiudere: salva nel gestionale o mantieni questa scheda aperta.",
      );
      return false;
    }
  }, [
    enabled,
    contextValid,
    key,
    recovery,
    dirty,
    baseUpdatedAt,
    schema,
    base,
    draft,
    annotation,
  ]);
  useEffect(() => {
    // Synchronize with an external store; status reflects the actual storage write, not a predicted success.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    persist();
  }, [persist]);
  useEffect(() => {
    const flush = () => persist();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [persist]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== key) return;
      try {
        const other = readSurveyDraft(window.localStorage, key!);
        if ((other?.revision ?? null) !== revision.current)
          setError(
            "La bozza è cambiata in un’altra scheda. Non sovrascrivo quella copia: conserva questa scheda aperta e verifica prima di uscire.",
          );
      } catch {
        setError("Impossibile verificare la copia locale della bozza.");
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  const discard = useCallback(() => {
    stopped.current = true;
    try {
      if (key) removeSurveyDraft(window.localStorage, key, revision.current);
    } catch {
      /* A server save must not become a false failure because local cleanup is blocked. */
    }
  }, [key]);
  const forgetRecovery = () => {
    try {
      if (key && !removeSurveyDraft(window.localStorage, key, revision.current))
        throw new Error(
          "La bozza è cambiata in un’altra scheda. Riapri la scheda elemento per rileggere la copia aggiornata.",
        );
      revision.current = null;
      setRecovery(null);
      setSavedAt(null);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossibile eliminare la bozza locale.",
      );
    }
  };
  return {
    recovery,
    error,
    savedAt,
    contextValid,
    discard,
    forgetRecovery,
    acceptRecovery: () => setRecovery(null),
    persistNow: persist,
  };
}

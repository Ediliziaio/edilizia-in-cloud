/**
 * IMP5 — Onboarding progressivo impostazioni
 *
 * Traccia quali step del setup azienda sono stati completati
 * usando localStorage. Ogni step è marcato "completato" quando
 * l'utente visita la route corrispondente almeno una volta.
 *
 * Scompare automaticamente quando tutti gli step sono completati.
 */

import { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

export interface OnboardingStep {
  id: string;
  label: string;
  path: string;
  completed: boolean;
}

const STEPS_DEFINITION: { id: string; label: string; path: string }[] = [
  { id: "profilo",    label: "Profilo aziendale",  path: "/azienda/impostazioni/profilo" },
  { id: "listino",    label: "Listino prodotti",   path: "/azienda/impostazioni/listino" },
  { id: "margini",    label: "Preventivi & margini",path: "/azienda/impostazioni/margini" },
  { id: "persone",    label: "Aggiungi persone",   path: "/azienda/impostazioni/persone" },
  { id: "integrazioni",label: "Integrazioni",      path: "/azienda/impostazioni/integrazioni" },
  { id: "branding",   label: "White-Label",        path: "/azienda/impostazioni/branding" },
];

const STORAGE_KEY = "settings_onboarding_completed";

function readCompleted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeCompleted(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

interface OnboardingProgress {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  allDone: boolean;
  /** Primo step non ancora completato (usato come CTA target) */
  nextStep: OnboardingStep | undefined;
  /** Segna manualmente uno step come completato */
  markDone: (stepId: string) => void;
  /** Resetta il progresso (utile per sviluppo/debug) */
  reset: () => void;
}

export function useOnboardingProgress(): OnboardingProgress {
  const { pathname } = useLocation();
  const [completed, setCompleted] = useState<Set<string>>(readCompleted);

  // Segna automaticamente come completato il path corrente se corrisponde a uno step
  useEffect(() => {
    const matching = STEPS_DEFINITION.find(s => pathname === s.path || pathname.startsWith(s.path + "/"));
    if (!matching) return;
    setCompleted(prev => {
      if (prev.has(matching.id)) return prev;
      const next = new Set(prev);
      next.add(matching.id);
      writeCompleted(next);
      return next;
    });
  }, [pathname]);

  const markDone = useCallback((stepId: string) => {
    setCompleted(prev => {
      if (prev.has(stepId)) return prev;
      const next = new Set(prev);
      next.add(stepId);
      writeCompleted(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const empty = new Set<string>();
    writeCompleted(empty);
    setCompleted(empty);
  }, []);

  const steps: OnboardingStep[] = STEPS_DEFINITION.map(s => ({
    ...s,
    completed: completed.has(s.id),
  }));

  const completedCount = steps.filter(s => s.completed).length;
  const totalCount = steps.length;
  const allDone = completedCount === totalCount;
  const nextStep = steps.find(s => !s.completed);

  return { steps, completedCount, totalCount, allDone, nextStep, markDone, reset };
}

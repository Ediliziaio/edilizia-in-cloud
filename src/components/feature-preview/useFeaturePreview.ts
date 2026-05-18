/**
 * Hooks per FeaturePreviewContext — separati dal provider per fast-refresh.
 */
import { useContext } from "react";
import { FeaturePreviewCtx, type FeaturePreviewContextValue } from "./FeaturePreviewContext";

export function useFeaturePreviewContext(): FeaturePreviewContextValue {
  const ctx = useContext(FeaturePreviewCtx);
  if (!ctx) {
    throw new Error("useFeaturePreviewContext deve essere usato dentro <FeaturePreviewProvider>");
  }
  return ctx;
}

export function useFeaturePreviewContextOptional(): FeaturePreviewContextValue | null {
  return useContext(FeaturePreviewCtx);
}

import { createContext, useContext } from 'react';
// Opt-in review layer for an unsaved AI draft. The production wizard, without
// this provider, keeps its existing behaviour. No repository or autosave here.
export const ComputoReviewContext = createContext<null | {
  included: ReadonlySet<string>;
  toggle: (id: string, included: boolean) => void;
}>(null);
export const useComputoReview = () => useContext(ComputoReviewContext);

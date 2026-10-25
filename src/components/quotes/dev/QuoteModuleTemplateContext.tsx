import { createContext, useContext } from 'react';
import type { LiveQuoteModuleTemplate } from '@/lib/preventivi/liveQuoteModuleTemplate';
import type { AziendaComune } from '@/components/preventivi/pdf/adattatoreEdile';
export type QuoteModuleTemplateState = {
  companyId: string; source?: LiveQuoteModuleTemplate; company?: AziendaComune;
  loading: boolean; error: boolean; refresh: () => void;
};
export const QuoteModuleTemplateContext = createContext<QuoteModuleTemplateState | null>(null);
export const useQuoteModuleTemplate = () => useContext(QuoteModuleTemplateContext);

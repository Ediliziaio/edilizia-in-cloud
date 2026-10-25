import { useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GuidedWorkspace from "./QuoteConversationWorkspace";
import AssistedWorkspace from "./QuoteAssistedWorkspace";
import { createLocalQuoteChatTransport } from "@/lib/preventivi/localQuoteChatTransport";
import { createQuoteDemoMemory } from '@/lib/preventivi/quoteDemoMemory';
import { createLocalQuoteAudioTransport } from '@/lib/preventivi/localQuoteAudioTransport';
import { supabase } from "@/integrations/supabase/client";
import { quoteSimulationScenario } from "@/lib/preventivi/quoteSimulationScenarios";
import { useQuoteTemplates } from '@/hooks/useQuoteTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { isBagniAiModel, type QuoteAiFlow } from '@/lib/preventivi/quoteBagniBridge';
import { useModuliVendita, useModuliVisibilita } from '@/lib/moduli-vendita';
import { usePermissions } from '@/hooks/usePermissions';
import { SALES_AREAS } from '@/lib/moduli-vendita/areas';
import { useLiveQuoteModuleTemplate } from './useLiveQuoteModuleTemplate';
import { QuoteModuleTemplateContext } from './QuoteModuleTemplateContext';
const demoCompanyId = "d2000000-0000-4000-a000-000000000002";
export default function QuoteAiSimulation(props: { companyId?: string; companyName?: string; ownerId?: string }) {
  const library = useQuoteTemplates({ live: true }); const { effectiveCompany } = useAuth();
  const templateLibrary = effectiveCompany?.id === props.companyId ? { templates: library.templates, defaultId: library.defaultTemplate?.id, brandColor: effectiveCompany.brand_primary_color, logo: effectiveCompany.logo_url, logoLight: effectiveCompany.brand_logo_dark_url, loading: library.isLoading, error: !!library.fetchError, retry: () => { void library.refetch(); } } : undefined;
  const [mode, setMode] = useState<"guided" | "plan" | "real">("plan");
  const [params, setParams] = useSearchParams();
  const rawTrialId = params.get('prova');
  const localTrialId = rawTrialId && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(rawTrialId) ? rawTrialId : undefined;
  const navigate = useNavigate();
  const requestedModel = params.get('modello') ?? '';
  const flow: QuoteAiFlow | undefined = params.get('flow') === 'classico' ? 'classico'
    : params.get('flow') === 'bagni' && isBagniAiModel(requestedModel) ? `bagni:${requestedModel}` : undefined;
  const scenario = flow ? undefined : quoteSimulationScenario(params.get("scenario"));
  const endpoint = (import.meta.env.VITE_QUOTE_CHAT_LOCAL_ENDPOINT as string | undefined) ?? `${window.location.origin}/functions/v1/ai-preventivo-conversazione`;
  const demoMemory = useMemo(() => createQuoteDemoMemory({ endpoint, getIdentity: async () => { const session = (await supabase.auth.getSession()).data.session; return session ? { token: session.access_token, ownerId: session.user.id } : null; }, publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }), [endpoint]);
  const transcribeAudio = useMemo(() => createLocalQuoteAudioTransport({ endpoint, companyId: props.companyId ?? demoCompanyId,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }), [endpoint, props.companyId]);
  const transport = mode !== "guided" ? createLocalQuoteChatTransport({ endpoint,
    getToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  }) : undefined;
  if (params.has('flow') && !flow || rawTrialId !== null && !localTrialId) return <main className="p-6"><p role="alert">Percorso o modello AI non disponibile. Nessuna bozza viene convertita.</p><button onClick={() => navigate('/azienda/marketing/preventivi')}>Torna ai preventivi</button></main>;
  const workspace = mode === "guided" ? <GuidedWorkspace {...props} onOpenPlan={() => setMode("plan")} onOpenReal={endpoint ? () => setMode("real") : undefined} />
    : <AssistedWorkspace key={`${props.companyId}:${mode}:${flow ?? scenario?.id ?? "main"}:${localTrialId ?? ''}`} {...props} localTrialId={localTrialId} flow={flow} templateLibrary={templateLibrary} companyId={props.companyId ?? demoCompanyId} memoryMode={mode === "plan" ? "plan" : "real"} scenarioId={scenario?.id}
      onScenario={id => { const next = new URLSearchParams(params); if (id) next.set("scenario", id); else next.delete("scenario"); setParams(next); }}
      simulated={false} transport={transport} demoMemory={demoMemory} transcribeAudio={transcribeAudio} onBack={() => flow ? navigate('/azienda/marketing/preventivi') : setMode("guided")} />;
  return flow?.startsWith('bagni:') ? <BagniLocalGate onBack={() => navigate('/azienda/marketing/preventivi')}><BagniTemplateWorkspace companyId={props.companyId ?? demoCompanyId} modelId={requestedModel}>{workspace}</BagniTemplateWorkspace></BagniLocalGate> : workspace;
}
function BagniTemplateWorkspace({ companyId, modelId, children }: { companyId: string; modelId: string; children: ReactNode }) {
  const query = useLiveQuoteModuleTemplate(companyId, 'bagni', modelId);
  const { effectiveCompany } = useAuth();
  const company = effectiveCompany?.id === companyId ? { name: effectiveCompany.name, ragione_sociale: effectiveCompany.business_name,
    indirizzo: [effectiveCompany.legal_address, [effectiveCompany.legal_postal_code, effectiveCompany.legal_city, effectiveCompany.legal_province].filter(Boolean).join(' ')].filter(Boolean).join(', '),
    telefono: effectiveCompany.phone, email: effectiveCompany.email, partita_iva: effectiveCompany.vat_number, website: effectiveCompany.website,
    logo_url: effectiveCompany.logo_url, logo_chiaro_url: effectiveCompany.brand_logo_dark_url, colore_marca: effectiveCompany.brand_primary_color } : undefined;
  return <QuoteModuleTemplateContext.Provider value={{ companyId, source: query.data, company, loading: query.isLoading, error: query.isError, refresh: () => { void query.refetch(); } }}>{children}</QuoteModuleTemplateContext.Provider>;
}
function BagniLocalGate({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const permissions = usePermissions(); const modules = useModuliVendita(); const visibility = useModuliVisibilita();
  if (modules.isLoading || visibility.isLoading) return <p role="status" className="p-6">Verifico l’accesso al modulo Bagni…</p>;
  const view = modules.moduli.find(item => item.modulo.slug === 'bagni');
  const area = SALES_AREAS.find(item => item.id === 'bagni')!;
  if (modules.isError || !permissions.canEditMarketingOpportunities || !view || view.isError || view.isLoading || view.stato !== 'attivo' || !visibility.isAreaVisibile(area)) {
    return <main className="p-6"><p role="alert">Modulo Bagni non disponibile per questa azienda o per il tuo ruolo. Nessuna bozza è stata aperta.</p><button onClick={onBack}>Torna ai preventivi</button></main>;
  }
  return <>{children}</>;
}

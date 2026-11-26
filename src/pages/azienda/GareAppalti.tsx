import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { GareWorkspace, LegacyGareSection } from '@/modules/gare-appalti/GareWorkspace';
import { GareHub } from '@/modules/gare-appalti/pages/GareHub';
import { WorkspaceProvider } from '@/modules/gare-appalti/WorkspaceContext';
import { gareRoot, gareSections } from '@/modules/gare-appalti/navigation';
import { gareClient, useGarePilot } from '@/modules/gare-appalti/useGarePilot';
import { GareJobSession } from '@/modules/gare-appalti/ai/GareJobSession';
import type { Company } from '@/modules/gare-appalti/types';
import '@/modules/gare-appalti/ui/gare-design.css';
import '@/modules/gare-appalti/ui/gare-polish.css';

const GuidedJourney = lazy(() => import('@/modules/gare-appalti/journey/GuidedJourneyPage').then(m => ({ default: m.GuidedJourneyPage })));
const TenderForm = lazy(() => import('@/modules/gare-appalti/pages/TenderForm').then(m => ({ default: m.TenderFormPage })));
const TenderDetail = lazy(() => import('@/modules/gare-appalti/pages/TenderDetail').then(m => ({ default: m.TenderDetailPage })));
const DraftEditor = lazy(() => import('@/modules/gare-appalti/ai/AiDraftEditor').then(m => ({ default: m.AiDraftEditorPage })));

export default function GareAppalti() {
  const pilot = useGarePilot();
  const enabled = !!pilot.role && !!pilot.company && !!pilot.userId;
  const company = useQuery({
    queryKey: ['gare', pilot.company?.id, 'company', pilot.userId],
    enabled,
    queryFn: async () => {
      const { data, error } = await gareClient.from('gare_companies')
        .select('id,name,profile,updated_at').eq('id', pilot.company?.id).single();
      if (error) throw error;
      return data as Company;
    },
  });

  if (pilot.loading || (enabled && company.isPending)) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Apertura Gare e appalti…</p>;
  }
  if (!pilot.role || !pilot.userId || !company.data || company.isError) return <Navigate to="/azienda" replace />;

  const member = { user_id: pilot.userId, company_id: company.data.id, company: company.data, role: pilot.role };
  return (
    <div className="gare-app min-w-0 rounded-xl p-3 sm:p-4">
      <WorkspaceProvider key={`${member.company_id}:${member.user_id}`} member={member} client={gareClient}>
        <GareJobSession />
        <GareWorkspace>
          <Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Apertura scheda…</p>}>
            <Routes>
              <Route index element={<GareHub />} />
              {gareSections.map(({ id }) => <Route key={id} path={id} element={<LegacyGareSection section={id} />} />)}
              <Route path="nuova" element={<TenderForm />} />
              <Route path="procedure/:tenderId" element={<TenderDetail />} />
              <Route path="procedure/:tenderId/modifica" element={<TenderForm />} />
              <Route path="partecipazioni/:participationId" element={<TenderDetail />} />
              <Route path="partecipazioni/:participationId/prepara" element={<GuidedJourney />} />
              <Route path="partecipazioni/:participationId/documenti/:draftId" element={<DraftEditor />} />
              <Route path="*" element={<Navigate to={gareRoot} replace />} />
            </Routes>
          </Suspense>
        </GareWorkspace>
      </WorkspaceProvider>
    </div>
  );
}

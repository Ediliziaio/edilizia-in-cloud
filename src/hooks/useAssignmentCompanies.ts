import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { loadCatalogPages } from '@/lib/listino/loadCatalogPages';
import { assignmentCompanyOptions, type AssignmentTeam, type AssignmentSubcontractor } from '@/lib/orders/assignmentCompanies';

export function useAssignmentCompanies(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['assignment-companies', companyId], enabled: enabled && !!companyId,
    staleTime: 0,
    queryFn: async () => {
      if (!companyId) throw new Error('Azienda non disponibile.');
      const [teams, subcontractors] = await Promise.all([
        loadCatalogPages<AssignmentTeam>((from, to) => supabase.from('external_teams')
          .select('id, company_id, name, kind, is_active, subappaltatore_id, vat_rate').eq('company_id', companyId).order('id').range(from, to)),
        loadCatalogPages<AssignmentSubcontractor>((from, to) => supabase.from('subappaltatori')
          .select('id, company_id, ragione_sociale, is_active').eq('company_id', companyId).order('id').range(from, to)),
      ]);
      return assignmentCompanyOptions(companyId, teams, subcontractors);
    },
  });
}

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

export const gareClient = supabase as unknown as SupabaseClient;
const pilotCompanyId = 'd2000000-0000-4000-a000-000000000002';

export function useGarePilot() {
  const { user, profile, effectiveCompany, isImpersonating } = useAuth();
  const companyId = effectiveCompany?.id;
  const eligibleCompany = companyId === pilotCompanyId &&
    profile?.company_id === companyId && !!user && !isImpersonating;
  const access = useQuery({
    queryKey: ['gare-pilot', companyId, user?.id],
    enabled: eligibleCompany,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await gareClient.rpc('gare_pilot_role', { cid: companyId });
      if (error) throw error;
      return data === 'admin' || data === 'editor' ? data : null;
    },
  });

  return {
    company: eligibleCompany ? effectiveCompany : null,
    userId: user?.id,
    role: eligibleCompany && !access.isError ? access.data : null,
    loading: eligibleCompany && access.isPending,
  };
}

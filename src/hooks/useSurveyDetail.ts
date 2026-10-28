import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { getSurvey, listAssignees } from "@/lib/api/surveys";
import type { SurveyRow } from "@/types/surveys";
import { useSurveyAccess } from "@/contexts/SurveyAccessContext";

export function useSurveyDetail(id: string, expectedOrderId?: string) {
  const { user, effectiveCompany, profile } = useAuth();
  const access = useSurveyAccess();
  const { canViewSopralluoghi } = usePermissions();
  const companyId = effectiveCompany?.id || (access.field ? profile?.company_id : null);
  const qc = useQueryClient();
  const enabled = !!id && !!companyId && !!user?.id && (access.field || canViewSopralluoghi);
  const query = useQuery({
    queryKey: ["sopralluogo", id, companyId, user?.id, expectedOrderId ?? null, access.field],
    enabled,
    retry: false,
    staleTime: 15000,
    refetchInterval: access.field ? 240000 : false,
    queryFn: async () => {
      const result = await getSurvey(id, access.field);
      if (
        result.survey.company_id !== companyId ||
        (expectedOrderId && result.survey.order_id !== expectedOrderId)
      )
        throw new Error(
          "Sopralluogo non disponibile in questa azienda o commessa.",
        );
      return result;
    },
  });
  useEffect(() => {
    if (!enabled) return;
    let channel = supabase.channel(
      `survey-view:${companyId}:${user?.id}:${id}`,
    );
    for (const table of [
      "surveys",
      "survey_areas",
      "survey_elements",
      "survey_media",
    ])
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "surveys" ? "id" : "survey_id"}=eq.${id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["sopralluogo", id] });
        },
      );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, id, companyId, user?.id, qc]);
  return { ...query, allowed: access.field || canViewSopralluoghi };
}

export function useSurveyReferences(survey?: SurveyRow) {
  const access = useSurveyAccess();
  const { effectiveCompany, user } = useAuth();
  const { canViewSopralluoghi } = usePermissions();
  const query = useQuery({
    queryKey: [
      "survey-references",
      survey?.id,
      effectiveCompany?.id,
      user?.id,
      survey?.contact_id,
      survey?.client_id,
      survey?.opportunity_id,
    ],
    enabled:
      !access.field && !!survey &&
      !!user?.id &&
      canViewSopralluoghi &&
      survey.company_id === effectiveCompany?.id,
    staleTime: 15000,
    retry: false,
    queryFn: async () => {
      if (!survey) throw new Error("Sopralluogo non disponibile");
      let reference: string | null = null;
      if (survey.opportunity_id) {
        const { data, error } = await supabase
          .from("marketing_opportunities")
          .select("name")
          .eq("company_id", survey.company_id)
          .eq("id", survey.opportunity_id)
          .maybeSingle();
        if (error) throw error;
        reference = data?.name
          ? `Opportunità: ${data.name}`
          : "Opportunità collegata (nome non disponibile)";
      } else if (survey.contact_id) {
        const { data, error } = await supabase
          .from("marketing_contacts")
          .select("first_name,last_name")
          .eq("company_id", survey.company_id)
          .eq("id", survey.contact_id)
          .maybeSingle();
        if (error) throw error;
        reference = `Contatto: ${[data?.first_name, data?.last_name].filter(Boolean).join(" ") || "nome non disponibile"}`;
      } else if (survey.client_id) {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name,last_name")
          .eq("company_id", survey.company_id)
          .eq("id", survey.client_id)
          .maybeSingle();
        if (error) throw error;
        reference = `Cliente: ${[data?.first_name, data?.last_name].filter(Boolean).join(" ") || "nome non disponibile"}`;
      }
      const assigned = (await listAssignees(survey.id)) as Array<{
        user_id: string;
        role: string;
      }>;
      if (!assigned.length) return { reference, assignees: [] as string[] };
      const { data, error } = await supabase
        .from("profiles")
        .select("id,first_name,last_name")
        .eq("company_id", survey.company_id)
        .in("id", [...new Set(assigned.map((a) => a.user_id))]);
      if (error) throw error;
      const roles: Record<string, string> = {
        technician: "Tecnico",
        subcontractor: "Subappaltatore",
        employee: "Operaio",
        observer: "Osservatore",
      };
      return {
        reference,
        assignees: assigned.map((a) => {
          const p = data?.find((p) => p.id === a.user_id);
          return `${[p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Nominativo non disponibile"} · ${roles[a.role] || a.role}`;
        }),
      };
    },
  });
  // Field users need technical data, never CRM/customer profile queries.
  return access.field ? {...query,data:{
    reference: survey?.opportunity_id ? "Opportunità collegata (dettagli gestiti dall’ufficio)" : survey?.contact_id ? "Contatto collegato (dettagli gestiti dall’ufficio)" : survey?.client_id ? "Cliente collegato (dettagli gestiti dall’ufficio)" : null,
    assignees:["Incarico autorizzato nell’app operai"],
  },isPending:false,isError:false} : query;
}

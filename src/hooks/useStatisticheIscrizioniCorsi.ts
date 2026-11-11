import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAllPortalCourseEnrollments } from "@/lib/portalLearningApi";
import { statisticheIscrizioni } from "@/lib/formazione/statisticheIscrizioni";

export function useStatisticheIscrizioniCorsi(companyId: string | null, courseIds: readonly string[], enabled = true) {
  const query = useQuery({
    queryKey: ["portal-all-enrollments", companyId],
    queryFn: () => listAllPortalCourseEnrollments(companyId as string),
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });
  const metrics = useMemo(() => (
    query.isSuccess && !query.isError ? statisticheIscrizioni(courseIds, query.data) : null
  ), [courseIds, query.data, query.isSuccess, query.isError]);
  return { query, metrics };
}

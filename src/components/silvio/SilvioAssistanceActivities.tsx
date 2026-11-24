import { usePermissions } from "@/hooks/usePermissions";
import { useFishAssistanceActivities } from "@/lib/fishAssistanceActivities";
import { SilvioAssistanceActivitiesView } from "./SilvioAssistanceActivitiesView";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export { SilvioAssistanceActivitiesView } from "./SilvioAssistanceActivitiesView";
export function SilvioAssistanceActivities() {
  const t = useT();
  const permissions = usePermissions();
  const { isAdmin } = permissions;
  const allowed = permissions?.canViewTickets === true;
  const query = useFishAssistanceActivities(allowed);
  if (!allowed)
    return (
      <p className="rounded-xl border p-4 text-sm text-muted-foreground">
        {t("Per vedere le pratiche di assistenza serve il permesso di lettura dei ticket.")}
      </p>
    );
  return (
    <SilvioAssistanceActivitiesView
      activities={query.data || []}
      loading={query.isPending}
      error={query.isError}
      onRefresh={() => void query.refetch()}
      canViewCustomers={permissions.canViewCustomers}
      canViewCalendar={permissions.canViewCalendar}
      canConfigure={isAdmin}
    />
  );
}

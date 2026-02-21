import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export interface Permissions {
  canViewDashboard: boolean;
  canViewOrders: boolean;
  canEditOrders: boolean;
  canViewWarehouse: boolean;
  canEditWarehouse: boolean;
  canViewCalendar: boolean;
  canViewCustomers: boolean;
  canEditCustomers: boolean;
  canViewEmployees: boolean;
  canViewTickets: boolean;
  canEditTickets: boolean;
  canViewForecast: boolean;
  canViewSettings: boolean;
  canViewUsers: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  onlyAssigned: boolean;
}

const ALL_PERMISSIONS: Permissions = {
  canViewDashboard: true,
  canViewOrders: true,
  canEditOrders: true,
  canViewWarehouse: true,
  canEditWarehouse: true,
  canViewCalendar: true,
  canViewCustomers: true,
  canEditCustomers: true,
  canViewEmployees: true,
  canViewTickets: true,
  canEditTickets: true,
  canViewForecast: true,
  canViewSettings: true,
  canViewUsers: true,
  isAdmin: true,
  isLoading: false,
  onlyAssigned: false,
};

const NO_PERMISSIONS: Permissions = {
  canViewDashboard: false,
  canViewOrders: false,
  canEditOrders: false,
  canViewWarehouse: false,
  canEditWarehouse: false,
  canViewCalendar: false,
  canViewCustomers: false,
  canEditCustomers: false,
  canViewEmployees: false,
  canViewTickets: false,
  canEditTickets: false,
  canViewForecast: false,
  canViewSettings: false,
  canViewUsers: false,
  isAdmin: false,
  isLoading: false,
  onlyAssigned: false,
};

export function usePermissions(): Permissions {
  const { role, user } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ["staff-permissions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_permissions")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching permissions:", error);
        return null;
      }
      return data;
    },
    enabled: role === "company_staff" && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Super admin and company admin have all permissions
  if (role === "super_admin" || role === "company_admin") {
    return ALL_PERMISSIONS;
  }

  // Staff: return permissions from database
  if (role === "company_staff") {
    if (isLoading) {
      return { ...NO_PERMISSIONS, isLoading: true };
    }

    return {
      canViewDashboard: permissions?.can_view_dashboard ?? false,
      canViewOrders: permissions?.can_view_orders ?? false,
      canEditOrders: permissions?.can_edit_orders ?? false,
      canViewWarehouse: permissions?.can_view_warehouse ?? false,
      canEditWarehouse: permissions?.can_edit_warehouse ?? false,
      canViewCalendar: permissions?.can_view_calendar ?? false,
      canViewCustomers: permissions?.can_view_customers ?? false,
      canEditCustomers: permissions?.can_edit_customers ?? false,
      canViewEmployees: permissions?.can_view_employees ?? false,
      canViewTickets: permissions?.can_view_tickets ?? false,
      canEditTickets: permissions?.can_edit_tickets ?? false,
      canViewForecast: permissions?.can_view_forecast ?? false,
      canViewSettings: permissions?.can_view_settings ?? false,
      canViewUsers: false,
      isAdmin: false,
      isLoading: false,
      onlyAssigned: permissions?.only_assigned ?? false,
    };
  }

  // Default: no permissions
  return NO_PERMISSIONS;
}

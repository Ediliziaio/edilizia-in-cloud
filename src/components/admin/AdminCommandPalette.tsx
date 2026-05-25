import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Building,
  CreditCard,
  Gauge,
  Gift,
  LifeBuoy,
  ListChecks,
  Megaphone,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

const baseActions = [
  { label: "Dashboard Superadmin", href: "/admin", icon: Gauge, keywords: "dashboard overview cruscotto" },
  { label: "Centro operativo", href: "/admin/attivita", icon: ListChecks, keywords: "attivita priorita notifiche azioni" },
  { label: "Aziende", href: "/admin/aziende", icon: Building, keywords: "clienti companies tenant" },
  { label: "Assistenza", href: "/admin/ticket", icon: LifeBuoy, keywords: "ticket supporto chat" },
  { label: "Chat Team", href: "/admin/chat", icon: LifeBuoy, keywords: "chat team assistenza messaggi" },
  { label: "Piani", href: "/admin/piani", icon: CreditCard, keywords: "billing piani abbonamenti" },
  { label: "Referral", href: "/admin/referral", icon: Gift, keywords: "partner referral payout" },
  { label: "Lifecycle", href: "/admin/lifecycle", icon: ShieldCheck, keywords: "trial churn salute aziende" },
  { label: "Sync Logs", href: "/admin/sync-logs", icon: RefreshCw, keywords: "log calendar sync errori" },
  { label: "Annunci", href: "/admin/annunci", icon: Megaphone, keywords: "banner comunicazioni changelog" },
  { label: "Impostazioni", href: "/admin/impostazioni", icon: Settings, keywords: "admin configurazione sicurezza" },
];

export function AdminCommandPalette() {
  const navigate = useNavigate();
  const { permissions } = useSuperAdminPermissions();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-command-palette-companies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, status")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    enabled: open && permissions.can_manage_companies,
    staleTime: 5 * 60 * 1000,
  });

  const availableActions = useMemo(
    () =>
      baseActions.filter((action) => {
        if (action.href.startsWith("/admin/aziende")) return permissions.can_manage_companies;
        if (action.href === "/admin/ticket" || action.href === "/admin/chat") return permissions.can_manage_tickets;
        if (action.href === "/admin/piani") return permissions.can_manage_plans;
        if (action.href === "/admin/referral") return permissions.can_manage_referrals;
        return true;
      }),
    [permissions],
  );

  const goTo = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      <Button variant="outline" size="sm" className="hidden gap-2 md:inline-flex" onClick={() => setOpen(true)}>
        <Search className="h-4 w-4" />
        Cerca
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">⌘K</kbd>
      </Button>
      <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Cerca">
        <Search className="h-5 w-5" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cerca pagine, aziende o azioni rapide..." />
        <CommandList>
          <CommandEmpty>Nessun risultato trovato.</CommandEmpty>
          <CommandGroup heading="Azioni rapide">
            {availableActions.map((action) => (
              <CommandItem
                key={action.href}
                value={`${action.label} ${action.keywords}`}
                onSelect={() => goTo(action.href)}
              >
                <action.icon className="mr-2 h-4 w-4" />
                <span>{action.label}</span>
                {action.label === "Centro operativo" && <CommandShortcut>P0</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
          {companies.length > 0 && (
            <CommandGroup heading="Aziende recenti">
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={`${company.name} ${company.status || ""}`}
                  onSelect={() => goTo(`/admin/aziende/${company.id}`)}
                >
                  <Building className="mr-2 h-4 w-4" />
                  <span className="truncate">{company.name}</span>
                  <CommandShortcut>{company.status || "azienda"}</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

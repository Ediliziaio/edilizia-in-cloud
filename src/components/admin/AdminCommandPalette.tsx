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

// Tutti gli URL puntano agli hub consolidati (no più legacy che fanno redirect):
//   /admin/fatturato (Revenue/Piani/Fatture/Promo/Dunning)
//   /admin/cs        (Dashboard/Assistenza/Lifecycle/Onboarding/Playbook)
//   /admin/ai        (Operate/Monitor/Config/Memoria)
//   /admin/operazioni (Sync/Alert/Import/Audit/GDPR)
const baseActions = [
  // ─── Cruscotto top ─────────────────────────────────────────────────
  { label: "Dashboard Superadmin", href: "/admin", icon: Gauge, keywords: "dashboard overview cruscotto home" },
  { label: "Attività", href: "/admin/attivita", icon: ListChecks, keywords: "task priorita notifiche centro operativo" },
  { label: "Email", href: "/admin/email", icon: LifeBuoy, keywords: "posta email inbox gmail outlook" },
  { label: "Chat Team", href: "/admin/chat", icon: LifeBuoy, keywords: "chat team messaggi" },
  // ─── Hub principali ────────────────────────────────────────────────
  { label: "Aziende", href: "/admin/aziende", icon: Building, keywords: "clienti companies tenant lista" },
  { label: "Fatturato", href: "/admin/fatturato", icon: CreditCard, keywords: "revenue mrr arr piani fatture promo dunning billing" },
  { label: "Revenue", href: "/admin/fatturato?tab=revenue", icon: CreditCard, keywords: "mrr arr revenue kpi" },
  { label: "Piani", href: "/admin/fatturato?tab=piani", icon: CreditCard, keywords: "subscription piani abbonamenti pricing" },
  { label: "Fatture", href: "/admin/fatturato?tab=fatture", icon: CreditCard, keywords: "fatture invoices billing storico" },
  { label: "Promo Codes", href: "/admin/fatturato?tab=promo", icon: Gift, keywords: "promo sconti codici" },
  { label: "Dunning", href: "/admin/fatturato?tab=dunning", icon: CreditCard, keywords: "dunning recupero crediti solleciti" },
  // ─── AI ────────────────────────────────────────────────────────────
  { label: "AI · Operate", href: "/admin/ai", icon: Gauge, keywords: "ai operatività silvio approvals queue agenti" },
  { label: "AI · Monitor", href: "/admin/ai?section=monitor", icon: Gauge, keywords: "ai monitor costi usage health test lab" },
  { label: "AI · Config", href: "/admin/ai?section=config", icon: Settings, keywords: "ai routing personas knowledge governance" },
  { label: "AI · Memoria Clienti", href: "/admin/ai?section=memoria", icon: Gauge, keywords: "memoria personas clienti cross company" },
  // ─── Customer Success / Assistenza ─────────────────────────────────
  { label: "Assistenza Clienti", href: "/admin/cs", icon: LifeBuoy, keywords: "cs customer success dashboard health" },
  { label: "Ticket assistenza", href: "/admin/cs?tab=assistenza", icon: LifeBuoy, keywords: "ticket supporto richieste" },
  { label: "Lifecycle clienti", href: "/admin/cs?tab=lifecycle", icon: ShieldCheck, keywords: "lifecycle trial churn salute" },
  { label: "Onboarding CS", href: "/admin/cs?tab=onboarding", icon: ListChecks, keywords: "onboarding setup nuova azienda" },
  { label: "Playbook CS", href: "/admin/cs?tab=playbook", icon: ListChecks, keywords: "playbook procedure cs" },
  // ─── Portale Formazione ────────────────────────────────────────────
  { label: "Portale Formazione", href: "/admin/portale-formazione", icon: ListChecks, keywords: "corsi formazione lms learning portale grants" },
  // ─── Prodotto ──────────────────────────────────────────────────────
  { label: "Funzionalità Azienda", href: "/admin/feature-flags", icon: Settings, keywords: "feature flags moduli funzionalità per azienda" },
  { label: "Annunci", href: "/admin/annunci", icon: Megaphone, keywords: "banner comunicazioni changelog" },
  // ─── Operazioni ────────────────────────────────────────────────────
  { label: "Operazioni", href: "/admin/operazioni", icon: RefreshCw, keywords: "sync alert import audit gdpr operazioni sistema" },
  { label: "Sync Logs", href: "/admin/operazioni?tab=sync", icon: RefreshCw, keywords: "log calendar sync errori job" },
  { label: "Audit Log", href: "/admin/operazioni?tab=audit", icon: ShieldCheck, keywords: "audit log azioni utenti tracciato" },
  { label: "GDPR", href: "/admin/operazioni?tab=gdpr", icon: ShieldCheck, keywords: "gdpr privacy compliance diritti" },
  // ─── Growth ────────────────────────────────────────────────────────
  { label: "Referral", href: "/admin/referral", icon: Gift, keywords: "partner referral payout growth" },
  // ─── Impostazioni ──────────────────────────────────────────────────
  { label: "Impostazioni", href: "/admin/impostazioni", icon: Settings, keywords: "admin configurazione sicurezza piattaforma" },
  { label: "Gestione Team", href: "/admin/impostazioni/super-admin", icon: Settings, keywords: "team super admin platform manager support sales marketing" },
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
        // Permission gating coerente con gli URL hub adesso in uso.
        if (action.href.startsWith("/admin/aziende")) return permissions.can_manage_companies;
        if (action.href.startsWith("/admin/cs?tab=assistenza") || action.href === "/admin/chat") {
          return permissions.can_manage_tickets;
        }
        if (action.href.startsWith("/admin/fatturato")) {
          // Tutto Fatturato (Revenue/Piani/Fatture/Promo/Dunning) richiede billing_read.
          return permissions.billing_read || permissions.can_manage_plans;
        }
        if (action.href.startsWith("/admin/ai")) return permissions.can_view_platform_stats;
        if (action.href.startsWith("/admin/cs")) return permissions.can_manage_companies;
        if (action.href.startsWith("/admin/operazioni")) return permissions.can_view_platform_stats;
        if (action.href === "/admin/referral") return permissions.can_manage_referrals;
        if (action.href === "/admin/portale-formazione") return permissions.can_manage_companies;
        if (action.href === "/admin/feature-flags") return permissions.can_manage_companies;
        if (action.href.startsWith("/admin/impostazioni/super-admin")) return permissions.can_manage_admins;
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

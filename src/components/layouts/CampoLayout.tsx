/**
 * Layout esclusivamente mobile per l'area campo (operai e subappaltatori).
 * Struttura: header fisso → contenuto scrollabile → bottom nav fissa.
 * Design dark theme ottimizzato per uso in cantiere (luce solare diretta).
 */
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, MessageSquare, Package, User, HardHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export default function CampoLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const { isOperaio } = useIsCampo();

  // Conta messaggi non letti per badge
  const { data: unreadCount = 0 } = useQuery({
    queryKey: ["campo-unread", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      // Conta canali con messaggi non letti dall'utente
      const { data } = await supabase
        .from("chat_channels")
        .select("id, chat_messages(id)")
        .eq("company_id", profile?.company_id ?? "")
        .limit(1);
      // Ritorna 0 come placeholder — implementazione completa nel CampoChat
      return 0;
    },
    refetchInterval: 30000,
    enabled: !!user?.id && !!profile?.company_id,
  });

  const tabs = [
    { icon: Home,         label: "Home",    path: "/campo",          exact: true  },
    { icon: Calendar,     label: "Lavori",  path: "/campo/calendario", exact: false },
    { icon: MessageSquare, label: "Chat",   path: "/campo/chat",     exact: false, badge: unreadCount },
    isOperaio
      ? { icon: Package, label: "Furgone",  path: "/campo/magazzino", exact: false }
      : { icon: Package, label: "SAL",      path: "/campo/sal",       exact: false },
    { icon: User,         label: "Profilo", path: "/campo/profilo",  exact: false },
  ];

  const isActive = (tab: { path: string; exact: boolean }) =>
    tab.exact ? location.pathname === tab.path : location.pathname.startsWith(tab.path);

  const initials = (profile?.first_name?.[0] ?? "") + (profile?.last_name?.[0] ?? "");

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-950 text-white overflow-hidden">
      {/* Header fisso */}
      <header
        className="flex-none bg-slate-900 border-b border-slate-800 px-4 pb-3 flex items-center justify-between"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <HardHat className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">
              {isOperaio ? "Operaio" : "Subappaltatore"}
            </p>
            <p className="text-sm font-semibold text-white leading-tight">
              {profile?.first_name} {profile?.last_name}
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate("/campo/profilo")}
          className="w-9 h-9 rounded-full bg-amber-500 flex items-center justify-center text-black font-bold text-sm active:scale-95 transition-transform"
        >
          {initials}
        </button>
      </header>

      {/* Contenuto scrollabile */}
      <main className="flex-1 overflow-y-auto overscroll-y-none">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav
        className="flex-none bg-slate-900 border-t border-slate-800"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex justify-around py-1">
          {tabs.map((tab) => {
            const active = isActive(tab);
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl min-w-[60px] transition-all duration-150",
                  active ? "text-amber-400" : "text-slate-500 active:text-slate-300"
                )}
              >
                {(tab as any).badge > 0 && (
                  <span className="absolute top-1 right-2 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white font-bold flex items-center justify-center">
                    {(tab as any).badge > 9 ? "9+" : (tab as any).badge}
                  </span>
                )}
                <tab.icon className="w-6 h-6" strokeWidth={active ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

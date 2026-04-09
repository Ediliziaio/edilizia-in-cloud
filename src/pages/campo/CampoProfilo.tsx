/**
 * Profilo operaio/subappaltatore — dati anagrafici (sola lettura) + logout.
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Mail, Phone, Building2, LogOut,
  ShieldCheck, HardHat,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function CampoProfilo() {
  const navigate = useNavigate();
  const { user, profile, signOut, role } = useAuth();

  const { data: stats } = useQuery({
    queryKey: ["campo-profilo-stats", user?.id],
    queryFn: async () => {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

      const [{ count: rapportiniMese }, { count: cantieri }] = await Promise.all([
        supabase
          .from("campo_rapportini")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .gte("data_lavoro", monthStart.slice(0, 10)),
        supabase
          .from("order_campo_assignments")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user!.id),
      ]);

      return {
        rapportiniMese: rapportiniMese ?? 0,
        cantieri: cantieri ?? 0,
      };
    },
    enabled: !!user?.id,
  });

  const p = profile as any;
  const nome = [p?.first_name, p?.last_name].filter(Boolean).join(" ") || user?.email || "—";
  const initials = [p?.first_name?.[0], p?.last_name?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto px-4 py-4 pb-28 space-y-4">

      {/* Avatar + nome */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center gap-3">
        <div className="w-20 h-20 rounded-full bg-amber-500 flex items-center justify-center">
          <span className="text-3xl font-bold text-black">{initials}</span>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold text-white">{nome}</p>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            {role === "employee" ? (
              <HardHat className="w-4 h-4 text-amber-400" />
            ) : (
              <Building2 className="w-4 h-4 text-amber-400" />
            )}
            <span className="text-sm text-amber-400 capitalize">
              {role === "employee" ? "Operaio" : "Subappaltatore"}
            </span>
          </div>
        </div>
      </div>

      {/* Statistiche mese */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{stats?.rapportiniMese ?? "—"}</p>
          <p className="text-xs text-slate-400 mt-1">Rapportini questo mese</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{stats?.cantieri ?? "—"}</p>
          <p className="text-xs text-slate-400 mt-1">Cantieri assegnati</p>
        </div>
      </div>

      {/* Dati anagrafici */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide">Dati personali</p>

        {user?.email && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="text-sm text-white">{user.email}</p>
            </div>
          </div>
        )}

        {p?.phone && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Telefono</p>
              <a href={`tel:${p.phone}`} className="text-sm text-amber-400">{p.phone}</a>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Ruolo sistema</p>
            <p className="text-sm text-white capitalize">{role}</p>
          </div>
        </div>
      </div>

      {/* App info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-3">App</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Versione</span>
          <span className="text-sm text-white">Area Campo 1.0</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-slate-400">Piattaforma</span>
          <span className="text-sm text-white">Edilizia in Cloud</span>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-600/10 border border-red-600/30 text-red-400 font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
      >
        <LogOut className="w-5 h-5" />
        Esci dall'account
      </button>
    </div>
  );
}

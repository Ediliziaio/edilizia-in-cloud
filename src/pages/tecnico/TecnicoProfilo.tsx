import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Mail } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function TecnicoProfilo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Errore nel logout");
    } else {
      navigate("/login");
    }
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-white text-xl font-bold pt-2">Profilo</h1>

      {/* Avatar + info */}
      <div className="flex flex-col items-center py-6 gap-3">
        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
          <User className="h-10 w-10 text-white" />
        </div>
        <div className="text-center">
          <h2 className="text-white text-xl font-bold">
            {([profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || undefined) ?? "Tecnico"}
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">{user?.email}</p>
        </div>
      </div>

      {/* Info dettaglio */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700">
        {([profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || undefined) && (
          <div className="flex items-center gap-3 p-4">
            <User className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-slate-400 text-xs">Nome</p>
              <p className="text-white font-medium">
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}
              </p>
            </div>
          </div>
        )}
        {user?.email && (
          <div className="flex items-center gap-3 p-4">
            <Mail className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-slate-400 text-xs">Email</p>
              <p className="text-white font-medium">{user.email}</p>
            </div>
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full bg-red-600/20 border border-red-500/30 text-red-300 font-bold text-base py-4 rounded-2xl min-h-[60px] active:bg-red-600/30 transition-colors flex items-center justify-center gap-3"
      >
        <LogOut className="h-5 w-5" />
        ESCI
      </button>
    </div>
  );
}

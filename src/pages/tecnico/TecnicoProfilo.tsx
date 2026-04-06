import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Mail, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGpsContinuo } from "@/hooks/useGpsContinuo";
import { FleetStatusBar } from "@/components/fleet/FleetStatusBar";
import { TrackingConsent } from "@/components/fleet/TrackingConsent";

export default function TecnicoProfilo() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const gps = useGpsContinuo();
  const [isAcceptingConsent, setIsAcceptingConsent] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Errore nel logout");
    } else {
      navigate("/login");
    }
  };

  const handleAcceptConsent = async () => {
    setIsAcceptingConsent(true);
    await gps.giveConsent();
    setIsAcceptingConsent(false);
  };

  const swSupported = typeof window !== "undefined" && "serviceWorker" in navigator;

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

      {/* ── Sezione GPS FleetTrack ─────────────────────────────────────────── */}
      {swSupported && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-slate-400" />
            <h2 className="text-white text-sm font-semibold">Tracciamento GPS</h2>
          </div>

          {/* Consenso GDPR — mostrato se non ancora dato o revocato */}
          {!gps.hasConsent || gps.status === "consent_pending" ? (
            <TrackingConsent
              onAccept={handleAcceptConsent}
              onDecline={() => {/* lascia status idle */}}
              isAccepting={isAcceptingConsent}
            />
          ) : (
            <>
              <FleetStatusBar
                status={gps.status}
                lastRecordedAt={gps.lastRecordedAt}
                onStart={gps.startTracking}
                onStop={gps.stopTracking}
              />

              {/* Ultima posizione nota */}
              {gps.lastLat != null && gps.lastLng != null && (
                <p className="text-slate-500 text-xs px-1">
                  Ultima pos: {gps.lastLat.toFixed(5)}, {gps.lastLng.toFixed(5)}
                  {gps.lastAccuracy != null && ` · ±${Math.round(gps.lastAccuracy)}m`}
                </p>
              )}

              {/* Revoca consenso */}
              <button
                onClick={gps.revokeConsent}
                className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-300 transition-colors"
              >
                Revoca consenso al tracciamento
              </button>
            </>
          )}
        </div>
      )}

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

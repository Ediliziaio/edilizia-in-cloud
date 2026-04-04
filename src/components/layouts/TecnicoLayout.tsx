import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Clock, Wrench, Truck, User, Wifi, WifiOff } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useOfflineQueue } from "@/hooks/useOfflineQueue";

export default function TecnicoLayout() {
  const { profile } = useAuth();
  const { isOnline, queue } = useOfflineQueue();
  const location = useLocation();
  const navigate = useNavigate();

  const tabs = [
    { label: "Oggi", icon: Clock, path: "/tecnico", exact: true },
    { label: "Interventi", icon: Wrench, path: "/tecnico/interventi", exact: false },
    { label: "Furgone", icon: Truck, path: "/tecnico/furgone", exact: false },
    { label: "Profilo", icon: User, path: "/tecnico/profilo", exact: false },
  ];

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div
      className="flex flex-col min-h-screen bg-slate-900 text-white"
      style={{ paddingBottom: "calc(68px + env(safe-area-inset-bottom))" }}
    >
      {/* Header fisso */}
      <header className="sticky top-0 z-50 bg-slate-800 border-b border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            EiC
          </div>
          <div>
            <p className="text-white font-semibold text-sm leading-tight">
              {profile?.full_name?.split(" ")[0] ?? "Tecnico"}
            </p>
            <p className="text-slate-400 text-xs leading-tight">App Tecnico</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {queue.length > 0 && (
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {queue.length} in attesa
            </span>
          )}
          <div className="flex items-center gap-1">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-green-400" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-400" />
            )}
            <span className={`text-xs ${isOnline ? "text-green-400" : "text-red-400"}`}>
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>
      </header>

      {/* Contenuto */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-slate-800 border-t border-slate-700"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex">
          {tabs.map(({ label, icon: Icon, path, exact }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 min-h-[64px] transition-colors ${
                isActive(path, exact)
                  ? "text-blue-400"
                  : "text-slate-400 active:text-slate-200"
              }`}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

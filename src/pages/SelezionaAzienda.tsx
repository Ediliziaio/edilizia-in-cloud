/**
 * SelezionaAzienda — selettore d'ingresso multi-azienda (stile GoHighLevel).
 *
 * Pagina a tutto schermo mostrata SUBITO DOPO il login quando l'utente ha accesso
 * a più aziende: sceglie in quale entrare. NON mostra dati sensibili (fatturato,
 * ordini) delle aziende — solo nome e ruolo. Dopo la scelta entra nell'app di
 * quell'azienda (switchMultiCompany → /azienda/attivita).
 *
 * Auto-risolve: se l'utente ha ≤1 azienda accessibile o sta impersonando, va
 * dritto in Attività senza mostrare nulla.
 */

import { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getCompanyAccessRoleLabel } from "@/lib/auth/multiCompany";
import { Loader2, Building2, ArrowRight, Search, LogOut, Star } from "lucide-react";

// Palette deterministica per gli avatar azienda (theme-aware via classi Tailwind).
const AVATAR_STYLES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
];
function avatarStyle(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_STYLES[h % AVATAR_STYLES.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function SelezionaAzienda() {
  const navigate = useNavigate();
  const {
    isLoading,
    multiCompanyAccesses,
    multiCompanyLoaded,
    switchMultiCompany,
    isImpersonating,
    profile,
    user,
    signOut,
  } = useAuth();
  const [entering, setEntering] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const primaryId = profile?.company_id ?? null;

  // Ordina: azienda principale prima, poi alfabetico; filtra per ricerca.
  const companies = useMemo(() => {
    const list = [...(multiCompanyAccesses ?? [])].sort((a, b) => {
      const ap = a.company_id === primaryId ? 0 : 1;
      const bp = b.company_id === primaryId ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return (a.company?.name ?? "").localeCompare(b.company?.name ?? "");
    });
    const q = query.trim().toLowerCase();
    return q ? list.filter((a) => (a.company?.name ?? "").toLowerCase().includes(q)) : list;
  }, [multiCompanyAccesses, primaryId, query]);

  if (!isLoading && !user) return <Navigate to="/login" replace />;

  // Aspetta il caricamento degli accessi prima di decidere.
  if (isLoading || !multiCompanyLoaded) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Caricamento aziende…</p>
      </div>
    );
  }

  // Un solo accesso (o impersonation) → nessuna scelta da fare: entra subito.
  if (isImpersonating || (multiCompanyAccesses?.length ?? 0) <= 1) {
    return <Navigate to="/azienda/attivita" replace />;
  }

  const total = multiCompanyAccesses.length;
  const showSearch = total > 6;
  const firstName = profile?.first_name?.trim();

  const enter = async (companyId: string) => {
    if (entering) return;
    setEntering(companyId);
    try {
      await switchMultiCompany(companyId);
    } finally {
      navigate("/azienda/attivita", { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="w-full max-w-3xl">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <span className="text-lg font-semibold tracking-tight">
            Edilizia<span className="text-primary">InCloud</span>
          </span>
        </div>

        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl sm:text-3xl font-semibold">
            {firstName ? `Ciao ${firstName}, scegli l'azienda` : "Scegli l'azienda"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Hai accesso a <span className="font-medium text-foreground">{total} aziende</span>.
            Seleziona quella con cui vuoi lavorare adesso.
          </p>
        </div>

        {/* Ricerca (solo con molte aziende) */}
        {showSearch && (
          <div className="relative mb-4 max-w-sm mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca azienda…"
              className="w-full h-10 pl-9 pr-3 rounded-lg border bg-card text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {/* Griglia aziende */}
        <div className="grid gap-3 sm:grid-cols-2">
          {companies.map((a) => {
            const name = a.company?.name ?? "Azienda";
            const isPrimary = primaryId && a.company_id === primaryId;
            const busy = entering === a.company_id;
            return (
              <button
                key={a.id}
                onClick={() => enter(a.company_id)}
                disabled={!!entering}
                className="group relative text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:hover:translate-y-0 flex items-center gap-3"
              >
                <div className={`h-11 w-11 rounded-lg flex items-center justify-center shrink-0 font-semibold text-sm ${avatarStyle(name)}`}>
                  {initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium truncate">{name}</p>
                    {isPrimary && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                        <Star className="h-3 w-3 fill-current" />
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {getCompanyAccessRoleLabel(a.access_role)}
                    {isPrimary ? " · Azienda principale" : ""}
                  </p>
                </div>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                ) : (
                  <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                )}
              </button>
            );
          })}
          {companies.length === 0 && (
            <p className="col-span-full text-center text-sm text-muted-foreground py-6">
              Nessuna azienda trovata per “{query}”.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1.5 mt-8 text-xs text-muted-foreground">
          <span>Potrai cambiare azienda in qualsiasi momento dal selettore in alto a sinistra.</span>
        </div>
        <div className="flex justify-center mt-3">
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" /> Esci
          </button>
        </div>
      </div>
    </div>
  );
}

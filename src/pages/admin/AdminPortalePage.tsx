/**
 * AdminPortalePage — Portale Formazione Superadmin
 *
 * Riusa PortalePage.tsx (5500+ righe di UI condivisa) con prop
 * `portalContext="admin"` per:
 *   - niente seed cantiere
 *   - hero header nascosto (qui sopra c'è già AdminHeroHeader)
 *   - tab Procedure/Accessi/Persone nascoste (azienda-edile specific)
 *   - niente sync localStorage (single source of truth: DB Supabase)
 *
 * Scoping: PlatformCompanyProvider sostituisce effectiveCompany con la
 * PLATFORM_ADMIN_COMPANY_ID → RLS filtra automaticamente.
 *
 * Use cases:
 *   1. Corsi interni team Superadmin (onboarding platform_manager,
 *      procedure vendita/CS, manuali tecnici interni).
 *   2. Corsi "template" da concedere alle aziende clienti via grant
 *      (corso marketing, corso vendita serramenti, sicurezza, ecc.).
 *
 * AdminPortaleDistributionBar è renderizzata SOLO quando esistono corsi
 * (niente promessa di funzione non utilizzabile su DB vuoto).
 */
import { lazy, Suspense } from "react";
import { GraduationCap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { AdminHeroHeader } from "@/components/admin/AdminHeroHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminPortaleDistributionBar } from "@/components/admin/portale/AdminPortaleDistributionBar";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";

// PortalePage è pesante (~5500 righe) — lazy obbligatorio.
const PortalePage = lazy(() => import("@/pages/azienda/personale/PortalePage"));

export default function AdminPortalePage() {
  return (
    <PlatformCompanyProvider>
      <AdminPortaleInner />
    </PlatformCompanyProvider>
  );
}

function AdminPortaleInner() {
  // ── Conta i corsi platform per decidere se mostrare la DistributionBar.
  // Se 0 corsi, la barra "Concedi accesso" sarebbe inutile e disturba l'UX
  // di un team che sta appena iniziando a creare il primo corso.
  //
  // staleTime ridotto a 5s + refetchOnWindowFocus → quando l'utente crea il
  // primo corso e poi torna sul tab, la barra appare quasi subito invece di
  // aspettare 30s.
  const { data: hasCourses } = useQuery({
    queryKey: ["admin-portale-has-courses"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("portal_courses")
        .select("id", { count: "exact", head: true })
        .eq("company_id", PLATFORM_ADMIN_COMPANY_ID);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchInterval: 15_000, // bonus: refresh ogni 15s in background
  });

  return (
    <div className="space-y-4 pb-20 sm:space-y-6 sm:pb-0">
      <AdminHeroHeader
        icon={GraduationCap}
        title="Portale Formazione"
        subtitle="Crea corsi per il team interno e template da concedere alle aziende clienti."
      />

      {/* Barra distribuzione visibile solo quando esistono corsi da condividere */}
      {hasCourses && <AdminPortaleDistributionBar />}

      <Suspense fallback={<PortaleSkeleton />}>
        <PortalePage portalContext="admin" />
      </Suspense>
    </div>
  );
}

function PortaleSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-80 w-full" />
    </div>
  );
}

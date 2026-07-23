import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";

const partnerSignContract = supabase.rpc.bind(supabase) as unknown as (
  fn: "partner_sign_referral_contract",
  args: {
    p_signed_name: string;
    p_ip_address: string;
    p_user_agent: string;
    p_contract_version: string;
  },
) => ReturnType<typeof supabase.rpc>;

interface PartnerOnboardingReferrer {
  id: string;
  name: string;
  commission_type: string;
  commission_value: number;
  payout_details: unknown;
}

interface Props {
  referrer: PartnerOnboardingReferrer;
}

interface TierRow {
  name: string | null;
  icon: string | null;
  min_active_companies: number | null;
  commission_plan_pct: number | null;
  commission_multiplier: number | null;
  position: number | null;
}

export function PartnerOnboardingModal({ referrer }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Tier reali dal DB: la % pagata dal motore è commission_plan_pct × multiplier
  // del tier, non referrers.commission_value.
  const { data: tiers = [] } = useQuery({
    queryKey: ["referral-tiers-onboarding"],
    staleTime: 300000,
    queryFn: async (): Promise<TierRow[]> => {
      const { data, error } = await supabase
        .from("referral_tiers")
        .select("name, icon, min_active_companies, commission_plan_pct, commission_multiplier, position")
        .order("position", { ascending: true });
      if (error) return [];
      return (data ?? []) as TierRow[];
    },
  });
  const baseTier = tiers[0];
  const basePct = baseTier
    ? Math.round((baseTier.commission_plan_pct ?? 20) * (baseTier.commission_multiplier ?? 1))
    : null;

  const handleAccept = async () => {
    setLoading(true);
    try {
      // Recupera IP per firma digitale
      let ip = "unknown";
      try {
        const res  = await fetchWithTimeout("https://api.ipify.org?format=json", {
          timeoutMs: 5_000,
          context: "ipify.detect",
        });
        const data = await res.json();
        ip = data.ip;
      } catch { /* storage non disponibile — silenzioso */ }

      const { error } = await partnerSignContract("partner_sign_referral_contract", {
        p_signed_name: referrer.name,
        p_ip_address: ip,
        p_user_agent: navigator.userAgent,
        p_contract_version: "1.0",
      });
      if (error) throw error;

      // Invia notifica welcome
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      fetch(`https://${projectId}.supabase.co/functions/v1/send-partner-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "welcome", referrer_id: referrer.id }),
      }).catch(() => {});

      queryClient.invalidateQueries({ queryKey: ["my-referrer", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["my-referrer-full", user?.id] });
      toast.success("Contratto firmato e inviato per approvazione.");
    } catch (err) {
      toast.error("Errore", { description: err instanceof Error ? err.message : "Errore imprevisto" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-xl">🤝 Benvenuto nel Programma Partner</DialogTitle>
          <DialogDescription>
            Prima di accedere al tuo portale, leggi e accetta i termini del programma.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Riepilogo Commissioni</h4>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Tipo:</span>
              <Badge variant="secondary">
                {basePct !== null
                  ? `${basePct}% ricorrente sul canone (cresce col tier)`
                  : "% ricorrente sul canone, in base al tier"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Pagamenti: Mensili, su richiesta del partner</p>
            <p className="text-sm text-muted-foreground">Metodo: Bonifico bancario / PayPal</p>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Progressione Tier</h4>
            {tiers.length > 0 ? (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                {tiers.map((t, i) => (
                  <span key={t.name ?? i} className="flex items-center gap-2">
                    {i > 0 && <span>→</span>}
                    <span>{t.icon} {t.name} ({t.min_active_companies ?? 0})</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                I tier crescono con le aziende attive che porti.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Più aziende porti, maggiori saranno le tue commissioni grazie ai moltiplicatori tier.
            </p>
          </div>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="accept-terms"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            <label htmlFor="accept-terms" className="text-sm cursor-pointer leading-relaxed">
              Accetto i termini e condizioni del Programma Partner
            </label>
          </div>

          <Button
            className="w-full"
            disabled={!accepted || loading}
            onClick={handleAccept}
          >
            {loading ? "Caricamento..." : "Accedi al Portale Partner →"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

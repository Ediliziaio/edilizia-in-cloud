import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  referrer: any;
}

export function PartnerOnboardingModal({ referrer }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const handleAccept = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("referrers")
        .update({
          has_accepted_terms: true,
          terms_accepted_at: new Date().toISOString(),
        })
        .eq("id", referrer.id);
      if (error) throw error;

      // Send welcome notification
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "guqgszwelffntrgtsycm";
      fetch(`https://${projectId}.supabase.co/functions/v1/send-partner-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "welcome",
          referrer_id: referrer.id,
        }),
      }).catch(() => {});

      queryClient.invalidateQueries({ queryKey: ["my-referrer", user?.id] });
      toast.success("Benvenuto nel Programma Partner!");
    } catch (err: any) {
      toast.error("Errore", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true}>
      <DialogContent className="max-w-lg" onPointerDownOutside={(e) => e.preventDefault()}>
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
                {referrer.commission_type === "percentage"
                  ? `${referrer.commission_value}% ricorrente`
                  : `${formatCurrency(referrer.commission_value)} fisso`}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Pagamenti: Mensili, su richiesta del partner</p>
            <p className="text-sm text-muted-foreground">Metodo: Bonifico bancario / PayPal</p>
          </div>

          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h4 className="font-medium text-sm">Progressione Tier</h4>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <span>🥉 Bronze (0)</span>
              <span>→</span>
              <span>🥈 Silver (3)</span>
              <span>→</span>
              <span>🥇 Gold (10)</span>
              <span>→</span>
              <span>💎 Platinum (25)</span>
            </div>
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

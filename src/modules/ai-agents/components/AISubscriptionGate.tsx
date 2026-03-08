import { useAISubscription } from "../hooks/useAISubscription";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Sparkles, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";

interface AISubscriptionGateProps {
  children: React.ReactNode;
}

export function AISubscriptionGate({ children }: AISubscriptionGateProps) {
  const { isActive, isTrial, trialDaysLeft, isLoading, subscription } = useAISubscription();
  const { effectiveCompany, role } = useAuth();
  const [loadingCheckout, setLoadingCheckout] = useState(false);

  // Super admins always have access
  if (role === "super_admin") return <>{children}</>;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isActive) {
    return (
      <>
        {isTrial && trialDaysLeft <= 7 && (
          <div className="mx-4 mb-3 p-3 rounded-lg border border-border bg-muted/50 flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-primary" />
            <span className="text-foreground">
              Trial scade tra {trialDaysLeft} giorn{trialDaysLeft === 1 ? "o" : "i"}.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-xs"
              onClick={() => handleSubscribe()}
              disabled={loadingCheckout}
            >
              Attiva abbonamento
            </Button>
          </div>
        )}
        {children}
      </>
    );
  }

  const handleSubscribe = async () => {
    if (!effectiveCompany?.id) return;
    setLoadingCheckout(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          company_id: effectiveCompany.id,
          type: "ai_subscription",
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, "_blank");
      } else {
        toast.error("Errore nella creazione del checkout");
      }
    } catch (err: any) {
      toast.error(err.message || "Errore");
    } finally {
      setLoadingCheckout(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <Card className="max-w-lg w-full text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sblocca Agenti AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            Attiva il modulo Agenti AI per creare assistenti vocali intelligenti che rispondono ai tuoi clienti, 
            fissano appuntamenti e qualificano i lead — 24/7.
          </p>

          <div className="grid grid-cols-1 gap-3 text-left">
            {[
              "Agenti vocali AI con 6 modelli LLM",
              "Integrazione CRM automatica",
              "Knowledge Base personalizzata",
              "Analisi conversazioni e trascrizioni",
              "Widget embed per il tuo sito",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                {feature}
              </div>
            ))}
          </div>

          <div className="border rounded-lg p-4 bg-muted/30">
            <Badge variant="secondary" className="mb-2">Include trial gratuito</Badge>
            <p className="text-xs text-muted-foreground">
              Prova gratuitamente per 14 giorni, poi attiva l'abbonamento mensile.
              I costi delle chiamate sono addebitati separatamente dal saldo crediti AI.
            </p>
          </div>

          <Button
            size="lg"
            className="w-full"
            onClick={handleSubscribe}
            disabled={loadingCheckout}
          >
            {loadingCheckout ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {subscription?.status === "cancelled" ? "Riattiva abbonamento" : "Inizia trial gratuito"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

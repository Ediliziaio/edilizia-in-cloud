import { useState } from "react";
import { CheckCircle, Zap, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Integration } from "@/types/integrations";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://rsbrguhkodgnqfomrevo.supabase.co";

interface ActivationStepProps {
  hook: any;
  integration: Integration | null;
}

export function ActivationStep({ hook, integration }: ActivationStepProps) {
  const { selectedPages, forms } = hook;
  const { effectiveCompany } = useAuth();
  const companyId = (effectiveCompany as any)?.id;
  const activeForms = forms.filter((f: any) => f.status === "active");
  const [sendingTest, setSendingTest] = useState(false);

  async function handleSendTestLead() {
    if (!integration?.id || !companyId) return;
    const firstActiveForm = activeForms[0];
    if (!firstActiveForm) {
      toast.error("Nessun modulo attivo. Attiva prima un modulo nel wizard.");
      return;
    }

    setSendingTest(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessione scaduta");

      const res = await fetch(`${SUPABASE_URL}/functions/v1/meta-api-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: "send-test-lead",
          company_id: companyId,
          integration_id: integration.id,
          form_id: firstActiveForm.form_id,
          test_data: {
            full_name: "Mario Rossi (TEST)",
            email: "mario.test@example.com",
            phone_number: "+39 333 0000000",
            city: "Milano",
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      toast.success("Lead di test inviato! Verrà elaborato entro 2 minuti.");
    } catch (err: any) {
      toast.error(`Errore: ${err.message}`);
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
        <Zap className="h-6 w-6" />
        <p className="font-medium text-lg">Integrazione pronta!</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>Account Meta collegato</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>{selectedPages.length} {selectedPages.length === 1 ? "pagina selezionata" : "pagine selezionate"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>{activeForms.length} {activeForms.length === 1 ? "modulo attivo" : "moduli attivi"}</span>
        </div>
      </div>

      <div className="bg-muted/50 border rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium">Come funziona:</p>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>I nuovi lead vengono ricevuti in tempo reale via webhook</li>
          <li>Ogni lead viene mappato secondo le regole configurate</li>
          <li>I contatti vengono creati/aggiornati automaticamente nel CRM</li>
          <li>Le opportunità vengono create nella pipeline selezionata</li>
        </ul>
      </div>

      {integration?.status === "connected" && activeForms.length > 0 && (
        <div className="border border-dashed rounded-lg p-4 space-y-2">
          <p className="text-sm font-medium">Verifica l'integrazione</p>
          <p className="text-xs text-muted-foreground">
            Invia un lead simulato per testare il flusso completo senza bisogno di una campagna attiva.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSendTestLead}
            disabled={sendingTest}
            className="gap-2"
          >
            <FlaskConical className="h-4 w-4" />
            {sendingTest ? "Invio in corso..." : "Invia lead di test"}
          </Button>
        </div>
      )}

      {integration?.status !== "connected" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Completa prima il collegamento OAuth per attivare la sincronizzazione.
        </p>
      )}
    </div>
  );
}

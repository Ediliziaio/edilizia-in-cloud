/**
 * L'operaio apre il link dell'ufficio (02/11/2026). Non entra da solo: il link si consuma
 * col tocco su «Entra», così l'anteprima di WhatsApp non lo brucia.
 */
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { HardHat, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type Stato = "pronto" | "entro" | "non_valido" | "errore";

export default function EntraConLink() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();
  const [stato, setStato] = useState<Stato>("pronto");

  const entra = async () => {
    setStato("entro");
    try {
      const { data, error } = await supabase.functions.invoke("campo-link-entra", { body: { token } });
      if (error) {
        const risposta = (error as { context?: unknown }).context;
        setStato(risposta instanceof Response && risposta.status === 410 ? "non_valido" : "errore");
        return;
      }
      const { error: otpErr } = await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: "magiclink" });
      if (otpErr) { setStato("errore"); return; }
      navigate("/campo", { replace: true });
    } catch {
      setStato("errore");
    }
  };

  const giaDentro = !isLoading && !!user && stato !== "entro";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-background p-5 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <HardHat className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-bold">App di cantiere</h1>
        {stato === "non_valido" ? (
          <p role="alert" className="text-sm text-muted-foreground">Questo link è già stato usato o è scaduto. Chiedine uno nuovo all'ufficio.</p>
        ) : stato === "errore" ? (
          <p role="alert" className="text-sm text-muted-foreground">Qualcosa non ha funzionato. Controlla la rete e riprova.</p>
        ) : null}
        {stato !== "non_valido" && (
          <Button className="h-12 w-full text-base font-bold" disabled={stato === "entro"} onClick={() => void entra()}>
            {stato === "entro" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Entra
          </Button>
        )}
        {giaDentro && <Link to="/campo" className="block text-sm text-primary underline">Sei già dentro: apri l'app</Link>}
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSEO } from "@/hooks/useSEO";

export default function AccountantTeamJoin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refreshAuth } = useAuth();
  const token = params.get("invito") ?? "";
  const valido = /^[0-9a-f]{64}$/.test(token);
  const [email, setEmail] = useState("");
  const [sessione, setSessione] = useState<{ id: string; email: string } | null>(null);
  const [verifica, setVerifica] = useState(true);
  const [inCorso, setInCorso] = useState(false);
  const [inviato, setInviato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  useSEO({ title: "Invito a uno studio", noindex: true });

  useEffect(() => {
    let attivo = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (attivo && data.user?.email) setSessione({ id: data.user.id, email: data.user.email });
    }).catch(() => { if (attivo) setErrore("Impossibile verificare l’accesso."); })
      .finally(() => { if (attivo) setVerifica(false); });
    return () => { attivo = false; };
  }, []);

  async function inviaLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valido) return;
    setInCorso(true);
    setErrore(null);
    try {
      const redirect = new URL("/commercialista/invito", window.location.origin);
      redirect.searchParams.set("invito", token);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect.toString() },
      });
      if (error) throw error;
      setInviato(true);
    } catch {
      setErrore("Non siamo riusciti a inviare il link di accesso. Riprova tra poco.");
    } finally {
      setInCorso(false);
    }
  }

  async function entra() {
    setInCorso(true);
    setErrore(null);
    try {
      const { data, error } = await supabase.rpc("studio_accetta_invito_team" as never, { p_token: token } as never);
      if (error) throw new Error(error.message);
      if (sessione && typeof data === "string") sessionStorage.setItem(`studio-scelto-${sessione.id}`, data);
      await refreshAuth();
      navigate("/commercialista", { replace: true });
    } catch (error) {
      setErrore(error instanceof Error ? error.message : "Invito non disponibile.");
    } finally {
      setInCorso(false);
    }
  }

  return <main className="grid min-h-dvh place-items-center bg-slate-50 p-4">
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>Entra nello studio</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!valido ? <p role="alert">Il link d’invito non è valido. Chiedi allo studio di generarlo di nuovo.</p>
          : verifica ? <p role="status">Verifica dell’accesso…</p>
          : sessione ? <>
            <p>Stai accedendo come <strong className="break-all">{sessione.email}</strong>. Usa l’indirizzo indicato nell’invito.</p>
            <Button disabled={inCorso} onClick={() => void entra()}>Accetta invito allo studio</Button>
            <Button variant="ghost" disabled={inCorso} onClick={async () => {
              const { error } = await supabase.auth.signOut();
              if (error) setErrore("Impossibile chiudere la sessione. Riprova.");
              else { setSessione(null); setErrore(null); }
            }}>Usa un’altra email</Button>
          </> : inviato ? <p role="status">Apri il link di accesso ricevuto via email e poi accetta l’invito allo studio. Se torni alla pagina iniziale, riapri il link d’invito.</p>
          : <form className="space-y-3" onSubmit={inviaLink}>
            <label htmlFor="team-join-email" className="font-medium">Email indicata nell’invito</label>
            <Input id="team-join-email" type="email" value={email} required maxLength={254} autoComplete="email"
              onChange={event => setEmail(event.target.value)} />
            <Button type="submit" disabled={inCorso}>Invia link di accesso</Button>
          </form>}
        {errore && <p role="alert" className="text-destructive">{errore}</p>}
        <Link className="block text-primary underline-offset-4 hover:underline" to="/commercialista-login">Accesso al portale</Link>
      </CardContent>
    </Card>
  </main>;
}

/**
 * Dopo l'accesso, torna alla pagina da cui si era partiti: oggi serve al QR
 * degli attrezzi (/q/…), aperto dalla fotocamera del telefono quando non si è
 * ancora entrati. Le pagine di login portano alla home del ruolo; questo
 * componente, montato una volta in App, vede che adesso c'è un utente e
 * riporta all'indirizzo ricordato. Il ricordo vale dieci minuti e una volta
 * sola, e solo per percorsi interni.
 */
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { leggiDopoLogin } from "@/lib/auth/dopoLogin";

export function RitornoDopoLogin(): null {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user) return;
    const percorso = leggiDopoLogin();
    if (percorso && `${location.pathname}${location.search}` !== percorso) navigate(percorso, { replace: true });
    // Solo all'arrivo dell'utente: dopo, la navigazione è di chi usa l'app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return null;
}

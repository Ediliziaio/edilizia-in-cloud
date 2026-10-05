/**
 * /q/:codice?c=<azienda> — dove porta il QR stampato sulle etichette di
 * attrezzi e mezzi (inquadrato con la fotocamera del telefono, fuori
 * dall'app). Chi è dell'ufficio va alla scheda; chi lavora in cantiere alla
 * pagina con le azioni rapide; un'etichetta vuota apre il modulo del nuovo
 * attrezzo (ufficio). Senza accesso, si entra e si torna qui da soli
 * (RitornoDopoLogin).
 */
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { HardHat, Loader2, LogIn, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cercaCodiceMezzo } from "@/hooks/useMezzi";
import { ricordaDopoLogin } from "@/lib/auth/dopoLogin";
import { getSubdomainUrl } from "@/utils/subdomainNav";
import type { EsitoCodice } from "@/types/mezzi";

export default function QrMezzo() {
  const { codice = "" } = useParams<{ codice: string }>();
  const [searchParams] = useSearchParams();
  const companyId = searchParams.get("c");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading: authInCaricamento } = useAuth();
  const [esito, setEsito] = useState<EsitoCodice | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !codice) return;
    let vivo = true;
    cercaCodiceMezzo(codice, companyId)
      .then((r) => vivo && setEsito(r))
      .catch((e) => vivo && setErrore(e instanceof Error ? e.message : "Non sono riuscito a leggere il codice."));
    return () => {
      vivo = false;
    };
  }, [user, codice, companyId]);

  if (authInCaricamento) return <Attesa />;

  if (!user) {
    const qui = `${location.pathname}${location.search}`;
    const ufficio = getSubdomainUrl(qui, "app");
    return (
      <Cornice>
        <PackageSearch className="mx-auto h-10 w-10 text-orange-500" />
        <h1 className="mt-3 text-lg font-bold">Attrezzo {codice.toUpperCase()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Accedi per vedere dov'è e segnare cosa ne fai.</p>
        <Button
          className="mt-5 h-12 w-full gap-2"
          onClick={() => {
            ricordaDopoLogin(qui);
            navigate("/login");
          }}
        >
          <LogIn className="h-4 w-4" />Accedi
        </Button>
        {ufficio.startsWith("http") && !window.location.hostname.startsWith("app.") && (
          <a href={ufficio} className="mt-3 block text-sm text-muted-foreground underline underline-offset-2">
            Sei dell'ufficio? Apri dall'area aziendale
          </a>
        )}
      </Cornice>
    );
  }

  if (errore) {
    return (
      <Cornice>
        <p className="text-sm font-semibold">Codice non letto</p>
        <p className="mt-1 text-sm text-muted-foreground">{errore}</p>
      </Cornice>
    );
  }

  if (!esito) return <Attesa />;

  if (esito.esito === "trovato") {
    if (esito.vista === "ufficio") return <Navigate to={`/azienda/mezzi/${esito.id}?da=qr`} replace />;
    return <Navigate to={`/campo/mezzi/scansione/${encodeURIComponent(esito.codice)}?c=${esito.company_id}`} replace />;
  }

  if (esito.esito === "libero" && esito.posso_registrare) {
    const vista = esito.codice.startsWith("MZ") ? "" : "&vista=attrezzature";
    return <Navigate to={`/azienda/manodopera?tab=mezzi${vista}&nuovo=${encodeURIComponent(esito.codice)}`} replace />;
  }

  return (
    <Cornice>
      <PackageSearch className="mx-auto h-10 w-10 text-muted-foreground/60" />
      <p className="mt-3 font-mono text-lg font-bold">{(esito.codice ?? codice).toUpperCase()}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {esito.esito === "libero"
          ? "Questa etichetta non è ancora collegata a un attrezzo: avvisa l'ufficio."
          : "Nessun attrezzo della tua azienda ha questo codice."}
      </p>
      <Button variant="outline" className="mt-5 h-11 w-full gap-2" onClick={() => navigate("/")}>
        <HardHat className="h-4 w-4" />Vai all'app
      </Button>
    </Cornice>
  );
}

function Attesa() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
    </div>
  );
}

function Cornice({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-sm">{children}</div>
    </div>
  );
}

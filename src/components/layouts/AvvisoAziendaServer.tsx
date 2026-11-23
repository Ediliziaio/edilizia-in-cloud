import { memo, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAziendaDelServer } from "@/hooks/useAziendaDelServer";
import { controlloNecessario } from "@/lib/auth/aziendaServer";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/**
 * Barra rossa quando la schermata mostra un'azienda e il server ne usa un'altra.
 * Le due azioni cambiano l'una il server, l'altra questa scheda.
 */
export const AvvisoAziendaServer = memo(function AvvisoAziendaServer({
  commercialista,
}: {
  commercialista: boolean;
}) {
  const {
    effectiveCompany,
    impersonatedCompanyId,
    isImpersonating,
    multiCompanyAccesses,
    riportaServerSuAzienda,
    passaAdAziendaDelServer,
  } = useAuth();
  const t = useT();

  const mostrata = isImpersonating ? impersonatedCompanyId : (effectiveCompany?.id ?? null);
  const attivo = controlloNecessario({
    aziendaMostrata: mostrata,
    staImpersonando: isImpersonating,
    numeroAccessiMultiAzienda: multiCompanyAccesses.length,
    commercialista,
  });
  const { esito, ricontrolla } = useAziendaDelServer(attivo ? mostrata : null);

  const aziendaServer = esito.stato === "altra_azienda" ? esito.aziendaServer : null;
  const [nomeServer, setNomeServer] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  useEffect(() => {
    setNomeServer(null);
    if (!aziendaServer) return;
    let annullato = false;
    void supabase
      .from("companies")
      .select("name")
      .eq("id", aziendaServer)
      .maybeSingle()
      .then(({ data }) => {
        if (!annullato) setNomeServer(data?.name ?? null);
      });
    return () => {
      annullato = true;
    };
  }, [aziendaServer]);

  if (!attivo || esito.stato === "allineata") return null;

  const nomeMostrata = effectiveCompany?.name ?? t("questa azienda");
  // Stesse frasi di testoAvviso (lib/auth/aziendaServer), qui con i segnaposto per la traduzione.
  const { titolo, dettaglio } = esito.stato === "nessuna_azienda"
    ? {
        titolo: t("L'accesso a {nome} non è più attivo", { nome: nomeMostrata }),
        dettaglio: t("È scaduto o è stato chiuso da un'altra finestra: elenchi vuoti e salvataggi rifiutati finché non lo riattivi."),
      }
    : {
        titolo: t("Stai guardando {nome}, ma il server sta lavorando su {altra}", {
          nome: nomeMostrata,
          altra: nomeServer ?? t("un'altra azienda"),
        }),
        dettaglio: t("L'ha cambiata un'altra finestra. Elenchi vuoti o salvataggi sull'azienda sbagliata: riallinea prima di continuare."),
      };

  const esegui = async (azione: () => Promise<boolean>) => {
    setInCorso(true);
    try {
      if (await azione()) await ricontrolla();
    } finally {
      setInCorso(false);
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-[60] flex flex-col gap-2 bg-destructive px-3 py-2 text-destructive-foreground shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{titolo}</p>
          <p className="text-xs">{dettaglio}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={inCorso}
          onClick={() => void esegui(riportaServerSuAzienda)}
        >
          {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {esito.stato === "nessuna_azienda" ? t("Riattiva {nome}", { nome: nomeMostrata }) : t("Riporta su {nome}", { nome: nomeMostrata })}
        </Button>
        {aziendaServer && (
          <Button
            variant="outline"
            size="sm"
            disabled={inCorso}
            className="border-destructive-foreground bg-transparent text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
            onClick={() => void esegui(() => passaAdAziendaDelServer(aziendaServer))}
          >
            {nomeServer ? t("Apri {nome} qui", { nome: nomeServer }) : t("Apri l'altra azienda qui")}
          </Button>
        )}
      </div>
    </div>
  );
});

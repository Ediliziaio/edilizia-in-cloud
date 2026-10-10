import { Outlet, useLocation, Link } from "react-router-dom";
import { SettingsSearch } from "@/components/layouts/SettingsSearch";
import { ArrowLeft } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { impostazioneNelPiano, nomiRequisito } from "@/lib/impostazioni/pianoImpostazioni";
import { NonNelPiano } from "@/components/settings/NonNelPiano";
import { isIOS as isIOSNativePlatform } from "@/lib/mobile/platform";
import { cn } from "@/lib/utils";
import {
  gruppoDellaSezione,
  schedaDellaSezione,
  schedeVisibili,
  sezioneDaPercorso,
} from "@/lib/impostazioni/gruppiImpostazioni";
import { titoloDaPercorso } from "@/lib/impostazioni/titoliImpostazioni";

// Il titolo e la frase di ogni pagina stanno in titoliImpostazioni.ts (con un test che li controlla);
// le pagine con le schede hanno il titolo del loro gruppo.

// v8.6.69 — MOBILE_SETTINGS_GROUPS rimosso: il dropdown "Vai a una sezione"
// che usava questa lista è stato eliminato. La navigazione mobile delle
// impostazioni avviene ora via rotellina nell'header CompanyLayout.

// ─── Layout wrapper per tutte le route /azienda/impostazioni/* ───────────────
export function SettingsLayout() {
  const { pathname } = useLocation();
  const permissions = usePermissions();
  const { stato: piano } = useStatoPiano();
  // Pagine raggruppate (Listino, Modelli di preventivo, Firma e condizioni): titolo
  // del gruppo e schede per passare da una pagina all'altra. Le schede fuori
  // dal piano dell'azienda non compaiono.
  const sezione = sezioneDaPercorso(pathname);
  const gruppo = gruppoDellaSezione(sezione);
  const schede = gruppo
    ? schedeVisibili(gruppo, permissions.isAdmin, permissions).filter((s) => impostazioneNelPiano(s.to, piano))
    : [];
  // Le impostazioni seguono il piano (21/09/2026): una pagina che il piano non
  // comprende non si apre nemmeno dall'indirizzo. Vedi pianoImpostazioni.ts.
  const nelPiano = impostazioneNelPiano(pathname, piano);
  const schedaAttiva = gruppo ? schedaDellaSezione(gruppo, sezione) : null;
  const { title, description } = titoloDaPercorso(pathname);

  // v8.6.71 — Sull'hub (/azienda/impostazioni senza sub-segmento) non mostriamo
  // il back arrow (è la pagina root). Su tutte le sotto-pagine sì.
  const isHubRoot = pathname === "/azienda/impostazioni" || pathname === "/azienda/impostazioni/";
  // La scheda di un utente ha già il suo titolo (il nome) con la freccia che
  // torna alla lista: su telefono la testata «Utenti» sopra era un doppione,
  // con una seconda freccia che portava altrove (all'elenco impostazioni).
  const haTestataPropria = pathname.startsWith("/azienda/impostazioni/utenti/");

  return (
    <div className="flex flex-col min-h-full">
      {/* Header contestuale — titolo + descrizione derivati dall'URL corrente.
          Mobile: senza riquadro e senza margini propri (<main> ha già p-3). */}
      <div className={cn("border-b bg-background px-4 py-4 md:px-6 md:py-5 max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:pb-2 max-sm:pt-0", haTestataPropria && "max-sm:hidden")}>
        <div className="flex items-start gap-3">
          {/* v8.6.71 — Back arrow mobile: porta all'hub griglia impostazioni.
              Nascosto su desktop (sidebar laterale è la navigazione primaria)
              e sulla root impostazioni (sarebbe self-link). */}
          {!isHubRoot && (
            <Link
              to="/azienda/impostazioni"
              aria-label="Torna a tutte le impostazioni"
              className="tap-compact md:hidden flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-background hover:bg-muted transition-colors -ml-1 max-sm:ml-0 max-sm:h-8 max-sm:w-8 max-sm:border-0"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 flex-1 min-w-0">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate max-sm:text-lg">{title}</h1>
              {/* Descrizione nascosta su mobile: su 375px occupava fino a 3 righe
                  prima del contenuto in ogni sotto-pagina impostazioni. */}
              <p className="mt-0.5 hidden text-sm text-muted-foreground sm:block">{description}</p>
            </div>
            {/* v8.6.71 — Search settings: nascosta su mobile (richiesto), resta su desktop */}
            <div className="hidden md:block">
              <SettingsSearch />
            </div>
          </div>
        </div>
        {schede.length > 1 && (
          <nav
            aria-label={`Schede di ${title}`}
            className="-mb-4 mt-3 flex gap-1 overflow-x-auto md:-mb-5 max-sm:mb-0 max-sm:mt-1 max-sm:border-b"
          >
            {schede.map((scheda) => {
              const attiva = scheda === schedaAttiva;
              return (
                <Link
                  key={scheda.sezione}
                  to={scheda.to}
                  aria-current={attiva ? "page" : undefined}
                  className={cn(
                    "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                    attiva
                      ? "border-primary font-semibold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {scheda.etichetta}
                </Link>
              );
            })}
          </nav>
        )}
      </div>

      {/* Contenuto della pagina figlia — larghezza piena */}
      <div className="flex-1 px-4 py-4 md:px-6 md:py-6 max-sm:px-0 max-sm:py-2">
        {nelPiano ? (
          <Outlet />
        ) : (
          <NonNelPiano
            titolo={title}
            serve={nomiRequisito(pathname)}
            puoCambiarePiano={permissions.isAdmin && !isIOSNativePlatform}
          />
        )}
      </div>
    </div>
  );
}

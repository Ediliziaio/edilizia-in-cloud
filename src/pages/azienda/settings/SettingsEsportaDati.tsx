/**
 * SettingsEsportaDati — porta via tutti i dati dell'azienda, in un archivio solo.
 *
 * Esisteva l'export GDPR del singolo utente e una manciata di "Esporta" per
 * elenco. Mancava la cosa che serve quando si vuole un backup, si cambia
 * gestionale o si consegna tutto al commercialista.
 *
 * Su mobile questa pagina non c'è: la regola del prodotto è che su telefono non
 * si scarica niente, e un archivio da decine di MB su rete mobile è il caso in
 * cui quella regola ha più ragione.
 */
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermissions } from "@/hooks/usePermissions";
import { messaggioEsportazioneNonRiuscita, registraEsportazioneCrm } from "@/lib/export/esportazioniCrm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, Smartphone, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import {
  TABELLE_EXPORT,
  csvDaRighe,
  scaricaTabella,
  nomeArchivio,
  riepilogoTestuale,
  type EsitoTabella,
} from "@/lib/export/esportaDatiAzienda";

export default function SettingsEsportaDati() {
  const { effectiveCompany } = useAuth();
  const isMobile = useIsMobile();
  // L'archivio contiene contatti e anagrafiche dei clienti: oltre alla voce
  // Sicurezza (che apre la pagina) serve «Esporta Clienti».
  const { canExportClients } = usePermissions();
  const [inCorso, setInCorso] = useState(false);
  const [fatte, setFatte] = useState(0);
  const [inLavorazione, setInLavorazione] = useState<string | null>(null);
  const [esiti, setEsiti] = useState<EsitoTabella[] | null>(null);

  if (isMobile) {
    return (
      <Alert>
        <Smartphone className="h-4 w-4" />
        <AlertTitle>Da computer</AlertTitle>
        <AlertDescription>
          L'esportazione dei dati aziendali produce un archivio che può pesare
          parecchio: si fa da computer, non da telefono.
        </AlertDescription>
      </Alert>
    );
  }

  const esporta = async () => {
    const companyId = effectiveCompany?.id;
    if (!canExportClients) return;
    if (!companyId) {
      toast.error("Azienda non disponibile");
      return;
    }
    setInCorso(true);
    setFatte(0);
    setEsiti(null);

    const risultati: EsitoTabella[] = [];
    try {
      // JSZip è già una dipendenza del progetto: si carica solo ora, quando
      // serve davvero, per non pesare sull'apertura della pagina.
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      for (const t of TABELLE_EXPORT) {
        setInLavorazione(t.etichetta);
        try {
          const righe = await scaricaTabella(t.tabella, companyId);
          if (righe.length > 0) {
            // BOM: senza, Excel apre l'UTF-8 con gli accenti rotti.
            zip.file(`${t.file}.csv`, "﻿" + csvDaRighe(righe));
          }
          risultati.push({ tabella: t.tabella, etichetta: t.etichetta, righe: righe.length });
        } catch (err) {
          // Una tabella che non si legge non ferma l'export e non sparisce in
          // silenzio: finisce nel riepilogo dentro l'archivio.
          const motivo = err instanceof Error ? err.message : "errore sconosciuto";
          logger.warn(`Export: tabella ${t.tabella} non esportata`, err);
          risultati.push({ tabella: t.tabella, etichetta: t.etichetta, righe: 0, errore: motivo });
        }
        setFatte((n) => n + 1);
      }

      zip.file("LEGGIMI.txt", riepilogoTestuale(risultati, effectiveCompany?.name));

      // Prima il registro, poi l'archivio: senza registrazione non si scarica.
      await registraEsportazioneCrm({
        companyId,
        oggetto: "archivio_azienda",
        formato: "zip",
        righe: risultati.reduce((somma, r) => somma + r.righe, 0),
        filtri: { elenchi: Object.fromEntries(risultati.map((r) => [r.tabella, r.errore ? "non esportato" : r.righe])) },
      });

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeArchivio(effectiveCompany?.name);
      a.click();
      URL.revokeObjectURL(url);

      setEsiti(risultati);
      const falliti = risultati.filter((r) => r.errore).length;
      if (falliti > 0) {
        toast.warning("Archivio scaricato, ma incompleto", {
          description: `${falliti} elenchi non sono stati esportati. Il dettaglio è nel file LEGGIMI.txt.`,
        });
      } else {
        toast.success("Archivio scaricato");
      }
    } catch (err) {
      logger.error("Export dati azienda fallito:", err);
      toast.error("Esportazione non riuscita", {
        description: messaggioEsportazioneNonRiuscita(err),
      });
    } finally {
      setInCorso(false);
      setInLavorazione(null);
    }
  };

  const percentuale = Math.round((fatte / TABELLE_EXPORT.length) * 100);
  const falliti = esiti?.filter((e) => e.errore) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Esporta i dati dell'azienda</h2>
        <p className="text-muted-foreground">
          Un archivio zip con un foglio CSV per ogni elenco. Serve per un backup,
          per passare a un altro gestionale o per consegnare tutto al commercialista.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cosa contiene</CardTitle>
          <CardDescription>
            {TABELLE_EXPORT.length} elenchi, con tutte le colonne così come sono
            nel database. Dentro l'archivio c'è anche un LEGGIMI.txt con quante
            righe ha ogni elenco e, se qualcosa non si è potuto esportare, quale
            e perché.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {TABELLE_EXPORT.map((t) => (
              <Badge key={t.tabella} variant="secondary" className="font-normal">
                {t.etichetta}
              </Badge>
            ))}
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              L'archivio contiene dati personali di clienti e personale. Trattalo
              come tratteresti l'anagrafica: non lasciarlo su un computer condiviso
              e non mandarlo per email senza cifrarlo.
            </AlertDescription>
          </Alert>

          {inCorso && (
            <div className="space-y-2">
              <Progress value={percentuale} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {inLavorazione ? `Sto raccogliendo: ${inLavorazione}` : "Preparo l'archivio…"}
                {" "}({fatte}/{TABELLE_EXPORT.length})
              </p>
            </div>
          )}

          {canExportClients ? (
            <Button onClick={esporta} disabled={inCorso} className="gap-2">
              {inCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {inCorso ? "Esportazione in corso…" : "Esporta tutto"}
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Per scaricare l'archivio serve anche il permesso «Esporta Clienti»:
              chiedilo a un amministratore.
            </p>
          )}
        </CardContent>
      </Card>

      {esiti && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {falliti.length === 0
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                : <AlertTriangle className="h-4 w-4 text-amber-600" />}
              Ultimo archivio
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {esiti.map((e) => (
              <div key={e.tabella} className="flex items-baseline justify-between gap-3 border-b py-1 last:border-b-0">
                <span className={e.errore ? "text-destructive" : ""}>{e.etichetta}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {e.errore ? `non esportato — ${e.errore}` : `${e.righe} righe`}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

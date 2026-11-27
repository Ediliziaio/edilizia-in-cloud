// Impostazioni → Cantieri & Costi → Cartelle documenti.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsOrders").
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Check, Folder, Loader2, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useCartelleDocumenti, useDocumentiPerCartella, useRiordinaCartelle, useSalvaCartella } from "@/hooks/useCartelleDocumenti";
import { cartelleMancanti, type CartellaDocumenti } from "@/lib/commesse/documentiCommessa";
import { DocumentFoldersNavigation, TUTTI_DOCUMENTI } from "@/components/orders/DocumentFoldersNavigation";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { SpazioArchiviazioneCard } from "@/components/billing/SpazioArchiviazioneCard";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { AvvisoAreaClienti } from "@/components/impostazioni/AvvisoAreaClienti";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { ImpostazioniDocumentiGenerali } from "@/components/orders/generali/documenti/ImpostazioniDocumentiGenerali";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

const messaggio = (e: unknown) => (messaggioErrore(e));

export default function SettingsCartelleDocumenti() {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  if (!companyId) return <Alert><AlertDescription>{t("Seleziona un’azienda per consultare le cartelle delle commesse.")}</AlertDescription></Alert>;
  return <CartelleDocumentiConfig key={companyId} />;
}

function CartelleDocumentiConfig() {
  const t = useT();
  const permissions = usePermissions();
  const { cartelle: tutte, isLoading, isError, refetch } = useCartelleDocumenti({ tutte: true });
  const salva = useSalvaCartella();
  const riordina = useRiordinaCartelle();

  const attive = tutte.filter((c) => !c.archiviata_at);
  const archiviate = tutte.filter((c) => c.archiviata_at);
  const { data: uso, isError: erroreConteggi, refetch: ricaricaConteggi } = useDocumentiPerCartella(tutte.map((c) => c.id));
  const busy = salva.isPending || riordina.isPending;
  // Chi modifica: amministratore o «Configurazione Ordini» in modifica. Senza, la pagina si consulta e basta, e lo dice.
  const haPermessoDiModifica = !permissions.isLoading && Boolean(permissions.isAdmin || permissions.canEditSettingsOrders);
  const soloLettura = !permissions.isLoading && !haPermessoDiModifica;
  const canEdit = haPermessoDiModifica && !isLoading && !isError;

  const [nuova, setNuova] = useState("");
  const [anteprima, setAnteprima] = useState<string>(TUTTI_DOCUMENTI);
  const selezioneAnteprima = attive.some(c => c.id === anteprima) ? anteprima : TUTTI_DOCUMENTI;
  const [inModifica, setInModifica] = useState<{ id: string; nome: string } | null>(null);
  const [daArchiviare, setDaArchiviare] = useState<CartellaDocumenti | null>(null);
  const confermaUscita = useSettingsDraftGuard(!!nuova.trim() || !!inModifica || busy);

  const conErrore = (titolo: string) => (e: unknown) => toast.error(titolo, { description: messaggio(e) });

  const aggiungi = () => {
    if (!canEdit || busy || !nuova.trim()) return;
    salva.mutate({ nome: nuova }, {
      onSuccess: () => { toast.success(t("Cartella «{nuova}» aggiunta", { nuova: nuova.trim() })); setNuova(""); },
      onError: conErrore(t("Cartella non aggiunta")),
    });
  };

  const salvaNome = () => {
    if (!inModifica || !canEdit || busy) return;
    const nome = inModifica.nome.trim().replace(/\s+/g, " ");
    if (!nome || nome === tutte.find(c => c.id === inModifica.id)?.nome) return;
    salva.mutate({ id: inModifica.id, nome: inModifica.nome }, {
      onSuccess: () => { setInModifica(null); toast.success(t("Nome aggiornato")); },
      onError: conErrore(t("Nome non aggiornato")),
    });
  };

  const sposta = (indice: number, verso: -1 | 1) => {
    if (!canEdit || busy) return;
    const ids = attive.map((c) => c.id);
    const j = indice + verso;
    if (j < 0 || j >= ids.length) return;
    [ids[indice], ids[j]] = [ids[j], ids[indice]];
    riordina.mutate(ids, { onError: conErrore(t("Ordine non salvato")) });
  };

  const imposta = (c: CartellaDocumenti, patch: Partial<CartellaDocumenti>) => {
    if (!canEdit || busy) return;
    salva.mutate({ id: c.id, ...patch }, { onError: conErrore(t("Modifica non salvata")) });
  };

  return (
    <div className="w-full min-w-0 space-y-4" data-testid="cartelle-documenti-pagina">
      <p className="hidden text-sm text-muted-foreground sm:block">{t("Questo è l’elenco aziendale usato nella creazione e nei documenti delle commesse. Nomi e ordine sono condivisi: una modifica qui aggiorna le stesse cartelle.")}</p>
      {soloLettura && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-4">
      <SezioneImpostazione
        id="cartelle"
        titolo={t("Cartelle dei documenti")}
        descrizione={t("Le stesse cartelle valgono per tutte le commesse. Ogni modifica si salva subito.")}
        ambito={!isLoading && !isError ? <Badge variant="secondary">{t("{n} attive", { n: attive.length })}</Badge> : undefined}
        azione={busy ? <span role="status" className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />{t("Salvataggio…")}</span> : undefined}
      >
        <div className="space-y-2 px-4 py-3 text-xs text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">{t("Visibile al cliente:")}</strong> {t("i file nuovi di quella cartella si vedono nell'area clienti.")} <strong className="font-medium text-foreground">{t("Obbligatoria:")}</strong> {t("la commessa segnala «Mancano» finché la cartella è vuota.")}
          </p>
          <p>{t("La visibilità è proposta per i nuovi file: i documenti già caricati conservano la scelta impostata sul singolo file.")}</p>
          <AvvisoAreaClienti />
          <details>
            <summary className="cursor-pointer">{t("Come si sceglie la cartella di un file")}</summary>
            <p className="mt-2">
              {t("Quando carichi un file, la cartella viene proposta dal nome tra quelle attive dell’azienda («fattura…» cerca una cartella per le fatture). Puoi cambiarla: non viene creata una cartella nuova.")}
            </p>
          </details>
        </div>

        <div className="space-y-4 px-4 py-4">
          {isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">{t("Cartelle non disponibili. Nessuna modifica verrà salvata.")}<Button size="sm" variant="outline" onClick={() => refetch()}>{t("Riprova")}</Button></AlertDescription></Alert> : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : (
            <div>
              {erroreConteggi && <Alert className="mb-3"><AlertDescription>{t("Conteggi non disponibili: non sono zero.")}<Button size="sm" variant="ghost" onClick={() => ricaricaConteggi()}>{t("Ricalcola")}</Button></AlertDescription></Alert>}
              <table className="block w-full text-sm md:table">
                <caption className="sr-only">{t("Cartelle attive dell’azienda, nello stesso ordine delle commesse")}</caption>
                <thead className="hidden md:table-header-group">
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 pr-2">{t("Cartella")}</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">{t("Documenti")}</th>
                    <th className="text-center font-medium py-2 px-2">{t("Visibile al cliente")}</th>
                    <th className="text-center font-medium py-2 px-2">{t("Obbligatoria")}</th>
                    {canEdit && <th className="py-2 pl-2"><span className="sr-only">{t("Azioni")}</span></th>}
                  </tr>
                </thead>
                <tbody className="block space-y-3 md:table-row-group md:space-y-0 md:divide-y">
                  {attive.map((c, i) => {
                    const modifica = inModifica?.id === c.id;
                    return (
                      <tr key={c.id} className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border p-2.5 md:table-row md:rounded-none md:border-0 md:p-0">
                        <td className="col-span-2 min-w-0 py-1.5 md:pr-2">
                          {modifica ? (
                            <Input
                              id={`nome-cartella-${c.id}`}
                              autoFocus
                              maxLength={80}
                              aria-label={t("Nome cartella {nome}", { nome: String(c.nome ?? "") })}
                              disabled={busy}
                              value={inModifica.nome}
                              onChange={(e) => setInModifica({ ...inModifica, nome: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") salvaNome();
                                if (e.key === "Escape") setInModifica(null);
                              }}
                              className="h-8"
                            />
                          ) : (
                            <span className="flex min-w-0 items-center gap-2">
                              <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="min-w-0 flex-1 break-words">{c.nome}</span>
                              <span className="shrink-0 text-xs text-muted-foreground md:hidden" aria-label={t("Documenti nella cartella")}>{erroreConteggi || uso?.[c.id] == null ? "– " + t("doc.") : t("{n} doc.", { n: uso?.[c.id] ?? 0 })}</span>
                            </span>
                          )}
                        </td>
                        <td className="hidden py-1.5 text-xs tabular-nums text-muted-foreground md:table-cell md:px-2 md:text-right">{erroreConteggi ? "–" : uso?.[c.id] ?? "–"}</td>
                        <td className="flex items-center justify-between gap-1 py-1 px-0 md:table-cell md:py-1.5 md:px-2 md:text-center">
                          <span className="text-xs md:hidden">{t("Visibile al cliente")}</span>
                          <Switch
                            checked={c.visibile_cliente}
                            disabled={!canEdit || busy}
                            onCheckedChange={(v) => imposta(c, { visibile_cliente: v })}
                            aria-label={t("File di «{nome}» visibili al cliente", { nome: String(c.nome ?? "") })}
                          />
                        </td>
                        <td className="flex items-center justify-between gap-1 py-1 px-0 md:table-cell md:py-1.5 md:px-2 md:text-center">
                          <span className="text-xs md:hidden">{t("Obbligatoria")}</span>
                          <Switch
                            checked={c.obbligatoria}
                            disabled={!canEdit || busy}
                            onCheckedChange={(v) => imposta(c, { obbligatoria: v })}
                            aria-label={t("«{nome}» obbligatoria", { nome: String(c.nome ?? "") })}
                          />
                        </td>
                        {canEdit && (
                          <td className="col-span-2 pt-1 md:py-1.5 md:pl-2">
                            <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 flex justify-end gap-1">
                              {modifica ? (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={salvaNome} disabled={salva.isPending || !inModifica.nome.trim() || inModifica.nome.trim().replace(/\s+/g, " ") === c.nome} aria-label={t("Salva nome")}>
                                    {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setInModifica(null)} aria-label={t("Annulla")}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0 || riordina.isPending} onClick={() => sposta(i, -1)} aria-label={t("Sposta su «{nome}»", { nome: String(c.nome ?? "") })}>
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === attive.length - 1 || riordina.isPending} onClick={() => sposta(i, 1)} aria-label={t("Sposta giù «{nome}»", { nome: String(c.nome ?? "") })}>
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { if (confermaUscita()) setInModifica({ id: c.id, nome: c.nome }); }} aria-label={t("Rinomina «{nome}»", { nome: String(c.nome ?? "") })}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDaArchiviare(c)} aria-label={t("Archivia «{nome}»", { nome: String(c.nome ?? "") })}>
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </fieldset>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {attive.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-muted-foreground">
                        {t("Nessuna cartella: i documenti delle commesse restano in un elenco unico.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2 px-4 py-3">
            <Input
              id="nuova-cartella-documenti"
              placeholder={t("Nuova cartella, es. Foto cantiere")}
              aria-label={t("Nuova cartella")}
              maxLength={80}
              disabled={busy}
              value={nuova}
              onChange={(e) => setNuova(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && nuova.trim()) aggiungi(); }}
              className="h-9"
            />
            <Button size="sm" onClick={aggiungi} disabled={!nuova.trim() || busy} className="h-9 shrink-0">
              <Plus className="h-4 w-4 mr-1" /> {t("Aggiungi")}
            </Button>
          </div>
        )}
      </SezioneImpostazione>

      {archiviate.length > 0 && (
        <SezioneImpostazione
          id="archiviate"
          titolo={t("Archiviate")}
          descrizione={t("Non si propongono più per i nuovi file. Restano visibili nelle commesse che contengono documenti in queste cartelle.")}
        >
          <ul className="divide-y px-4">
            {archiviate.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <Folder className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-muted-foreground">{c.nome}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{erroreConteggi || uso?.[c.id] == null ? "– " + t("documenti") : t("{n} documenti", { n: uso?.[c.id] ?? 0 })}</span>
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      salva.mutate({ id: c.id, archiviata_at: null }, {
                        onSuccess: () => toast.success(t("«{nome}» ripristinata", { nome: String(c.nome ?? "") })),
                        onError: conErrore(t("Cartella non ripristinata")),
                      })
                    }
                  >
                    <ArchiveRestore className="h-4 w-4 mr-1" /> {t("Ripristina")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </SezioneImpostazione>
      )}

      {/* Commesse generali: la checklist dei documenti richiesti, sugli stessi archivi delle commesse. */}
      <ImpostazioniDocumentiGenerali />

      </div>
      <aside className="min-w-0 space-y-4" aria-label={t("Anteprima delle cartelle nelle commesse")}>
        {!isError && <SezioneImpostazione id="anteprima-cartelle" titolo={t("Nelle commesse")}
          descrizione={t("Esplorazione di una commessa vuota, con le cartelle attive dell’azienda.")}
        >
          <div className="space-y-3 p-4">
            <DocumentFoldersNavigation cartelle={tutte} conteggi={{}} totale={0} senzaCartella={0}
              mancanti={cartelleMancanti(tutte, []).map(c => c.id)} loading={isLoading}
              selezione={selezioneAnteprima} onSelect={setAnteprima} />
            {selezioneAnteprima !== TUTTI_DOCUMENTI && <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">{t("Nella commessa, scegliendo «{nome}» vedi i suoi file e puoi caricarne altri.", { nome: String(attive.find(c => c.id === selezioneAnteprima)?.nome ?? "") })}</p>}
            <p className="text-xs text-muted-foreground">{t("«Tutti» e «Senza cartella» sono filtri dei documenti. Non aggiungono cartelle all’elenco. Le archiviate compaiono solo dove contengono file.")}</p>
          </div>
        </SezioneImpostazione>}
        <div className="rounded-lg border bg-card p-4 text-xs text-muted-foreground space-y-2">
          <p className="font-medium text-foreground">{t("Cosa contano i documenti nell’elenco")}</p>
          <p>{t("File caricati in tutte le commesse dell’azienda. I documenti del cliente collegati alla commessa, senza copiarli, restano nella sua anagrafica e non entrano in questo conteggio.")}</p>
          {(permissions.isAdmin || permissions.canViewOrders) && <Button asChild size="sm" variant="outline" className="mt-1"><Link to="/azienda/ordini">{t("Apri le commesse")}</Link></Button>}
        </div>
        <SpazioArchiviazioneCard compatta />
      </aside>
      </div>

      <AlertDialog open={!!daArchiviare} onOpenChange={(o) => { if (!o) setDaArchiviare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Archiviare «{nome}»?", { nome: String(daArchiviare?.nome ?? "") })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("Non comparirà più tra le cartelle in cui caricare nuovi file. I documenti già presenti restano nella cartella originale, consultabile nelle commesse che li contengono.")}
              {daArchiviare && !erroreConteggi && (uso?.[daArchiviare.id] ?? 0) > 0
                ? t(" Al momento contiene {valore} documenti caricati nelle commesse.", { valore: String(uso?.[daArchiviare.id] ?? "") })
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annulla")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canEdit || busy}
              onClick={() => {
                const c = daArchiviare;
                if (!c || !canEdit || busy) return;
                salva.mutate({ id: c.id, archiviata_at: new Date().toISOString() }, {
                  onSuccess: () => toast.success(t("«{nome}» archiviata", { nome: String(c.nome ?? "") })),
                  onError: conErrore(t("Cartella non archiviata")),
                });
              }}
            >
              {t("Archivia")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Impostazioni → Cantieri & Costi → Cartelle documenti.
// Route protetta in companyRoutes.tsx con withCompanyPermission("canViewSettingsOrders").
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useCartelleDocumenti, useRiordinaCartelle, useSalvaCartella } from "@/hooks/useCartelleDocumenti";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";
import { SpazioArchiviazioneCard } from "@/components/billing/SpazioArchiviazioneCard";

const messaggio = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Quanti documenti stanno in ogni cartella, su tutte le commesse dell'azienda. */
function useDocumentiPerCartella(ids: string[]) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["cartelle-documenti-uso", companyId, [...ids].sort()],
    enabled: !!companyId && ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const risultati = await Promise.all(
        ids.map(async (id) => {
          const { count, error } = await supabase
            .from("order_attachments")
            .select("id", { count: "exact", head: true })
            .eq("folder_id" as never, id as never);
          if (error) throw error;
          return [id, count ?? 0] as const;
        }),
      );
      return Object.fromEntries(risultati);
    },
  });
}

export default function SettingsCartelleDocumenti() {
  const permissions = usePermissions();
  const { cartelle: tutte, isLoading, isError, refetch } = useCartelleDocumenti({ tutte: true });
  const salva = useSalvaCartella();
  const riordina = useRiordinaCartelle();

  const attive = tutte.filter((c) => !c.archiviata_at);
  const archiviate = tutte.filter((c) => c.archiviata_at);
  const { data: uso, isError: erroreConteggi, refetch: ricaricaConteggi } = useDocumentiPerCartella(tutte.map((c) => c.id));
  const busy = salva.isPending || riordina.isPending;
  const canEdit = !permissions.isLoading && !isLoading && !isError && (permissions.isAdmin || permissions.canEditSettingsOrders);

  const [nuova, setNuova] = useState("");
  const [inModifica, setInModifica] = useState<{ id: string; nome: string } | null>(null);
  const [daArchiviare, setDaArchiviare] = useState<CartellaDocumenti | null>(null);
  const confermaUscita = useSettingsDraftGuard(!!nuova.trim() || !!inModifica || busy);

  const conErrore = (titolo: string) => (e: unknown) => toast.error(titolo, { description: messaggio(e) });

  const aggiungi = () => {
    if (!canEdit || busy || !nuova.trim()) return;
    salva.mutate({ nome: nuova }, {
      onSuccess: () => { toast.success(`Cartella «${nuova.trim()}» aggiunta`); setNuova(""); },
      onError: conErrore("Cartella non aggiunta"),
    });
  };

  const salvaNome = () => {
    if (!inModifica || !canEdit || busy) return;
    salva.mutate({ id: inModifica.id, nome: inModifica.nome }, {
      onSuccess: () => { setInModifica(null); toast.success("Nome aggiornato"); },
      onError: conErrore("Nome non aggiornato"),
    });
  };

  const sposta = (indice: number, verso: -1 | 1) => {
    if (!canEdit || busy) return;
    const ids = attive.map((c) => c.id);
    const j = indice + verso;
    if (j < 0 || j >= ids.length) return;
    [ids[indice], ids[j]] = [ids[j], ids[indice]];
    riordina.mutate(ids, { onError: conErrore("Ordine non salvato") });
  };

  const imposta = (c: CartellaDocumenti, patch: Partial<CartellaDocumenti>) => {
    if (!canEdit || busy) return;
    salva.mutate({ id: c.id, ...patch }, { onError: conErrore("Modifica non salvata") });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Organizzazione dei documenti</CardTitle>
          <CardDescription>Le stesse cartelle vengono usate in tutte le commesse. Le modifiche si salvano subito.</CardDescription>
          <details className="text-sm text-muted-foreground"><summary className="cursor-pointer">Visibilità cliente e documenti obbligatori</summary><p className="mt-2">
            Le cartelle in cui si dividono i documenti di ogni commessa. Quando si carica un file
            la cartella viene proposta dal nome («fattura…» → Fatture, «visura…» → Catastali) e si
            può cambiare. <strong>Cliente</strong>: i file caricati nella cartella nascono visibili
            nell'area del cliente. <strong>Obbligatoria</strong>: la commessa segnala «Mancano» finché
            la cartella è vuota.
          </p></details>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? <Alert variant="destructive"><AlertDescription className="flex flex-wrap items-center gap-2">Cartelle non disponibili. Nessuna modifica verrà salvata.<Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button></AlertDescription></Alert> : isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : (
            <div>
              {erroreConteggi && <Alert className="mb-3"><AlertDescription>Conteggi non disponibili: non sono zero.<Button size="sm" variant="ghost" onClick={() => ricaricaConteggi()}>Ricalcola</Button></AlertDescription></Alert>}
              <table className="block w-full text-sm md:table">
                <thead className="hidden md:table-header-group">
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left font-medium py-2 pr-2">Cartella</th>
                    <th className="text-right font-medium py-2 px-2 whitespace-nowrap">Documenti</th>
                    <th className="text-center font-medium py-2 px-2">Cliente</th>
                    <th className="text-center font-medium py-2 px-2">Obbligatoria</th>
                    {canEdit && <th className="py-2 pl-2"><span className="sr-only">Azioni</span></th>}
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
                              aria-label={`Nome cartella ${c.nome}`}
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
                              <span className="shrink-0 text-xs text-muted-foreground md:hidden" aria-label="Documenti nella cartella">{erroreConteggi ? "–" : uso?.[c.id] ?? "–"} doc.</span>
                            </span>
                          )}
                        </td>
                        <td className="hidden py-1.5 text-xs tabular-nums text-muted-foreground md:table-cell md:px-2 md:text-right">{erroreConteggi ? "–" : uso?.[c.id] ?? "–"}</td>
                        <td className="flex items-center justify-between gap-1 py-1 px-0 md:table-cell md:py-1.5 md:px-2 md:text-center">
                          <span className="text-xs md:hidden">Cliente</span>
                          <Switch
                            checked={c.visibile_cliente}
                            disabled={!canEdit || busy}
                            onCheckedChange={(v) => imposta(c, { visibile_cliente: v })}
                            aria-label={`File di «${c.nome}» visibili al cliente`}
                          />
                        </td>
                        <td className="flex items-center justify-between gap-1 py-1 px-0 md:table-cell md:py-1.5 md:px-2 md:text-center">
                          <span className="text-xs md:hidden">Obbligatoria</span>
                          <Switch
                            checked={c.obbligatoria}
                            disabled={!canEdit || busy}
                            onCheckedChange={(v) => imposta(c, { obbligatoria: v })}
                            aria-label={`«${c.nome}» obbligatoria`}
                          />
                        </td>
                        {canEdit && (
                          <td className="col-span-2 pt-1 md:py-1.5 md:pl-2">
                            <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0 flex justify-end gap-1">
                              {modifica ? (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={salvaNome} disabled={salva.isPending} aria-label="Salva nome">
                                    {salva.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setInModifica(null)} aria-label="Annulla">
                                    <X className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0 || riordina.isPending} onClick={() => sposta(i, -1)} aria-label={`Sposta su «${c.nome}»`}>
                                    <ArrowUp className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === attive.length - 1 || riordina.isPending} onClick={() => sposta(i, 1)} aria-label={`Sposta giù «${c.nome}»`}>
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { if (confermaUscita()) setInModifica({ id: c.id, nome: c.nome }); }} aria-label={`Rinomina «${c.nome}»`}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDaArchiviare(c)} aria-label={`Archivia «${c.nome}»`}>
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
                        Nessuna cartella: i documenti delle commesse restano in un elenco unico.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {canEdit && (
            <div className="flex gap-2">
              <Input
                id="nuova-cartella-documenti"
                placeholder="Nuova cartella, es. Enel I-II-GSE"
                aria-label="Nuova cartella"
                disabled={busy}
                value={nuova}
                onChange={(e) => setNuova(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nuova.trim()) aggiungi(); }}
                className="h-9"
              />
              <Button size="sm" onClick={aggiungi} disabled={!nuova.trim() || busy} className="h-9 shrink-0">
                <Plus className="h-4 w-4 mr-1" /> Aggiungi
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <SpazioArchiviazioneCard compatta />

      {archiviate.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Archiviate</CardTitle>
            <CardDescription>Non si propongono più per i nuovi file; i documenti già dentro restano consultabili.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {archiviate.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 text-muted-foreground">{c.nome}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{uso?.[c.id] ?? "–"} documenti</span>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        salva.mutate({ id: c.id, archiviata_at: null }, {
                          onSuccess: () => toast.success(`«${c.nome}» ripristinata`),
                          onError: conErrore("Cartella non ripristinata"),
                        })
                      }
                    >
                      <ArchiveRestore className="h-4 w-4 mr-1" /> Ripristina
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!daArchiviare} onOpenChange={(o) => { if (!o) setDaArchiviare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiviare «{daArchiviare?.nome}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Non comparirà più tra le cartelle in cui caricare.
              {daArchiviare && (uso?.[daArchiviare.id] ?? 0) > 0
                ? ` I ${uso?.[daArchiviare.id]} documenti che contiene restano nelle commesse, sotto «Senza cartella», finché non la ripristini o li sposti.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const c = daArchiviare;
                if (!c || !canEdit || busy) return;
                salva.mutate({ id: c.id, archiviata_at: new Date().toISOString() }, {
                  onSuccess: () => toast.success(`«${c.nome}» archiviata`),
                  onError: conErrore("Cartella non archiviata"),
                });
              }}
            >
              Archivia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

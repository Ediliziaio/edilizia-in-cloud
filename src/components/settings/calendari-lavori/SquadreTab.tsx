/**
 * Tab Squadre della pagina Squadre e calendari lavori: la tabella, il dialog, e per ogni
 * squadra il collegamento al suo calendario Google (facoltativo).
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, HardHat, FileText, Users } from "lucide-react";
import { useSquadre as useSquadreOperai } from "@/hooks/useOperai";
import { useSchedeManodopera } from "@/hooks/useSchedeManodopera";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ExternalTeamDialog,
  type ExternalTeamFormData,
} from "@/components/employees/ExternalTeamDialog";
import { ExternalTeamAttachments } from "@/components/employees/ExternalTeamAttachments";
import {
  SQUADRE_OPERAI,
  percorsoSquadra,
} from "@/lib/manodopera/collegamentiSquadre";
import type { ExternalTeam } from "@/types/employees";
import {
  SQUADRA_KIND_LABEL,
  STATO_SYNC_LABEL,
  statoSyncSquadra,
  type StatoSyncSquadra,
} from "@/types/squadre";
import {
  useCollegaCalendarioSquadra,
  useConnessioniGoogleAzienda,
  useEliminaSquadra,
  useSalvaSquadra,
  useSquadre,
  useSubappaltatoriAzienda,
} from "@/hooks/useCalendariLavori";
import { GoogleCalendarPicker } from "./GoogleCalendarPicker";

const STATO_CLASSE: Record<StatoSyncSquadra, string> = {
  non_collegata: "bg-muted text-muted-foreground",
  disattivata: "bg-amber-100 text-amber-800",
  errore: "bg-red-100 text-red-800",
  attiva: "bg-emerald-100 text-emerald-800",
};

export function SquadreTab({ canManage, compact = false }: { canManage: boolean; compact?: boolean }) {
  const { schede } = useSchedeManodopera();
  const vedeOperai = schede.includes("operai");
  const [params, setParams] = useSearchParams();
  const squadraRichiesta = params.get("squadra");
  const [cerca, setCerca] = useState("");
  const [tipo, setTipo] = useState("tutte");
  const { data: squadre = [], isLoading, isError, refetch } = useSquadre();
  const { data: subappaltatori = [], isError: erroreDitte, refetch: rileggiDitte } = useSubappaltatoriAzienda();
  const { data: interne = [], isLoading: caricoInterne, isError: erroreInterne, refetch: rileggiInterne } = useSquadreOperai(vedeOperai && squadre.some(s => s.kind === "interna" && s.is_active));
  const salva = useSalvaSquadra();
  const elimina = useEliminaSquadra();
  const collega = useCollegaCalendarioSquadra();
  // Senza un account Google collegato il menu del calendario non ha niente da offrire: lo si dice una volta sola sopra la
  // tabella (con il link per collegarlo) invece di ripeterlo in ogni riga.
  const {
    data: connessioni = [],
    isLoading: caricoConnessioni,
    isError: erroreConnessioni,
  } = useConnessioniGoogleAzienda();
  const senzaAccountGoogle =
    !caricoConnessioni &&
    !erroreConnessioni &&
    connessioni.filter((c) => c.status === "connected").length === 0;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inModifica, setInModifica] = useState<ExternalTeam | null>(null);
  const [daEliminare, setDaEliminare] = useState<ExternalTeam | null>(null);
  const [allegatiDi, setAllegatiDi] = useState<ExternalTeam | null>(null);
  const [calendarioDi, setCalendarioDi] = useState<string | null>(null);
  const busy = salva.isPending || elimina.isPending || collega.isPending;
  const canWrite = canManage && !isLoading && !isError && !busy;

  const ordinate = useMemo(
    () =>
      [...squadre].sort(
        (a, b) =>
          Number(b.is_active) - Number(a.is_active) ||
          a.name.localeCompare(b.name),
      ),
    [squadre],
  );
  const selezionata = ordinate.find((s) => s.id === squadraRichiesta);
  const visibili = ordinate.filter(
    (s) =>
      selezionata ? s.id === selezionata.id :
      (tipo === "tutte" || (s.kind ?? "esterna") === tipo) &&
      [s.name, s.contact_name, s.email].some((v) =>
        (v ?? "")
          .toLocaleLowerCase("it")
          .includes(cerca.trim().toLocaleLowerCase("it")),
      ),
  );
  const togliRichiesta = () => setParams(prev => { const next = new URLSearchParams(prev); next.delete("squadra"); return next; }, { replace: true });
  const mostraTutte = () => {
    setCerca("");
    setTipo("tutte");
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("squadra");
        return next;
      },
      { replace: true },
    );
  };
  const linkGoogle = new URLSearchParams(params);
  linkGoogle.set("tab", "google");

  const onSubmit = (data: ExternalTeamFormData) => {
    if (!canWrite) return;
    salva.mutate(
      { id: inModifica?.id, ...data, kind: data.kind ?? "esterna" },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setInModifica(null);
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Calendari delle squadre interne ed esterne. Componenti e responsabile
          delle interne si gestiscono in Manodopera e Mezzi.
        </p>
        <Button
          disabled={!canWrite}
          onClick={() => {
            setInModifica(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nuova squadra esterna
        </Button>
      </div>

      {!isLoading && !isError && <div className="grid grid-cols-3 gap-2" role="group" aria-label="Riepilogo squadre">
        {[
          { value: "interna", titolo: "Interne", count: squadre.filter(s => s.kind === "interna").length },
          { value: "esterna", titolo: "Esterne", count: squadre.filter(s => (s.kind ?? "esterna") === "esterna").length },
          { value: "tutte", titolo: "Tutte", count: squadre.length },
        ].map(r => <button key={r.value} type="button" onClick={() => { setTipo(r.value); setCerca(""); togliRichiesta(); }} aria-pressed={!selezionata && tipo === r.value} className={`rounded-lg border bg-card px-3 py-2 text-left transition hover:border-primary/40 ${!selezionata && tipo === r.value ? "border-primary bg-primary/5" : ""}`}><span className="block text-xs text-muted-foreground">{r.titolo}</span><span className="block text-xl font-semibold tabular-nums">{r.count}</span></button>)}
      </div>}
      {erroreInterne && vedeOperai && <div role="alert" className="rounded-lg border p-3 text-sm">Composizione delle squadre interne non disponibile: non significa che siano vuote. <Button size="sm" variant="ghost" onClick={() => rileggiInterne()}>Rileggi componenti</Button></div>}
      {erroreDitte && <div role="alert" className="rounded-lg border p-3 text-sm">Accessi delle ditte non disponibili. <Button size="sm" variant="ghost" onClick={() => rileggiDitte()}>Rileggi ditte</Button></div>}
      {isError ? (
        <div role="alert" className="space-y-2 rounded-lg border p-4 text-sm">
          <p>
            Impossibile caricare le squadre. Nessun dato è stato modificato.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Riprova
          </Button>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : ordinate.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <HardHat className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium">Nessuna squadra</p>
            <p className="mb-4 text-sm text-muted-foreground">
              Crea le squadre interne dalla gestione operai oppure aggiungi una
              squadra esterna di posa.
            </p>
            <Button
              disabled={!canWrite}
              onClick={() => setDialogOpen(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" /> Nuova squadra esterna
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Cerca squadre e referenti"
              placeholder="Cerca squadra o referente…"
              value={selezionata ? "" : cerca}
              onChange={(e) => { setCerca(e.target.value); togliRichiesta(); }}
              className="min-w-0 basis-full sm:basis-auto sm:flex-1 sm:max-w-sm"
            />
            <select
              aria-label="Tipo di squadra"
              value={selezionata ? "tutte" : tipo}
              onChange={(e) => { setTipo(e.target.value); togliRichiesta(); }}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="tutte">Tutte le squadre</option>
              <option value="interna">Interne</option>
              <option value="esterna">Esterne</option>
            </select>
            <span role="status" className="text-xs text-muted-foreground">
              {visibili.length} di {ordinate.length} squadre
            </span>
            {vedeOperai && (
              <Button
                asChild
                variant="outline"
                size="sm"
                className="sm:ml-auto"
              >
                <Link to={SQUADRE_OPERAI}>
                  <Users className="mr-2 h-4 w-4" />
                  Gestisci squadre interne
                </Link>
              </Button>
            )}
          </div>
          {squadraRichiesta && (
            <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
              {selezionata
                ? `Calendario di ${selezionata.name}.`
                : "La squadra richiesta non è disponibile in questo elenco."}{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={mostraTutte}
              >
                Mostra tutte le squadre
              </Button>
            </p>
          )}
          {senzaAccountGoogle && (
            <p
              role="note"
              className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground"
            >
              Nessun account Google collegato: se vuoi un calendario per ogni
              squadra,{" "}
              <Link
                to={`?${linkGoogle.toString()}`}
                className="font-medium text-primary underline"
              >
                collegalo da «Google Calendar»
              </Link>
              .
            </p>
          )}
          <div className="overflow-x-auto rounded-md border">
            <Table className={compact ? "block" : "block lg:table"}>
              <TableHeader className={compact ? "hidden" : "hidden lg:table-header-group"}>
                <TableRow>
                  <TableHead>Squadra</TableHead>
                  <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Accesso della ditta
                  </TableHead>
                  <TableHead>Calendario Google</TableHead>
                  <TableHead>Invio a Google</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody className={compact ? "grid gap-3 bg-muted/20 p-3" : "block lg:table-row-group"}>
                {visibili.map((s) => {
                  const stato = statoSyncSquadra({
                    google_calendar_id: s.google_calendar_id ?? null,
                    google_sync_enabled: !!s.google_sync_enabled,
                    google_last_error: s.google_last_error ?? null,
                  });
                  const composizione = vedeOperai && !erroreInterne ? interne.find(q => q.id === s.id) : undefined;
                  const accesso = subappaltatori.find(
                    (x) => x.id === s.subappaltatore_id,
                  );
                  return (
                    <TableRow
                      key={s.id}
                      className={`grid grid-cols-2 gap-2 p-3 [&>td]:block [&>td]:p-1 ${compact ? "rounded-lg border bg-card" : "lg:table-row lg:p-0 lg:[&>td]:table-cell lg:[&>td]:p-4"} ${s.is_active ? "" : "opacity-60"}`}
                    >
                      <TableCell className="col-span-2">
                        <span className="flex flex-wrap items-center gap-2 break-words font-medium">
                          <span
                            className="inline-block h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: s.color ?? "#94a3b8" }}
                          />
                          {s.name}
                          {compact && <Badge variant="outline" className="text-xs font-normal">{SQUADRA_KIND_LABEL[s.kind ?? "esterna"]}</Badge>}
                          {!s.is_active && (
                            <Badge variant="outline" className="text-xs">
                              inattiva
                            </Badge>
                          )}
                        </span>
                        {s.kind === "interna" && vedeOperai && (composizione ? <p className="mt-1 text-xs text-muted-foreground">{composizione.componenti.length} {composizione.componenti.length === 1 ? "operaio" : "operai"} · {composizione.responsabile ? `Responsabile: ${[composizione.responsabile.nome, composizione.responsabile.cognome].filter(Boolean).join(" ")}` : "Responsabile da assegnare"}</p> : caricoInterne && s.is_active ? <p className="mt-1 text-xs text-muted-foreground" role="status">Caricamento componenti…</p> : null)}
                        {s.kind !== "interna" && s.contact_name && <p className="mt-1 text-xs text-muted-foreground">Referente: {s.contact_name}</p>}
                        {s.kind === "interna" &&
                          (vedeOperai ? (
                            <Button
                              asChild
                              variant="link"
                              size="sm"
                              className="mt-1 h-auto px-0"
                            >
                              <Link to={percorsoSquadra(SQUADRE_OPERAI, s.id)}>
                                <Users className="mr-1 h-3.5 w-3.5" />
                                Componenti e responsabile
                              </Link>
                            </Button>
                          ) : (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Componenti gestiti da chi ha accesso agli operai.
                            </p>
                          ))}
                      </TableCell>
                      <TableCell className={compact ? "!hidden" : "text-xs text-muted-foreground lg:text-sm"}>
                        {SQUADRA_KIND_LABEL[s.kind ?? "esterna"]}
                      </TableCell>
                      <TableCell
                        className={`text-xs text-muted-foreground lg:text-sm ${compact ? "col-span-2" : ""} ${accesso || erroreDitte ? "" : compact ? "!hidden" : "max-lg:!hidden"}`}
                      >
                        {accesso
                          ? (accesso.user_email ?? accesso.ragione_sociale)
                          : erroreDitte ? "Non disponibile" : "—"}
                      </TableCell>
                      <TableCell
                        className={
                          senzaAccountGoogle
                            ? compact ? "!hidden" : "col-span-2 max-lg:!hidden"
                            : "col-span-2"
                        }
                      >
                        {senzaAccountGoogle && (
                          <span className="text-muted-foreground">
                            —
                            <span className="sr-only">
                              {" "}
                              Calendario non collegato
                            </span>
                          </span>
                        )}
                        {!senzaAccountGoogle && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto px-0 text-xs lg:hidden"
                            onClick={() =>
                              setCalendarioDi(
                                calendarioDi === s.id ? null : s.id,
                              )
                            }
                            aria-expanded={calendarioDi === s.id}
                          >
                            {calendarioDi === s.id
                              ? "Chiudi calendario"
                              : "Calendario Google"}
                          </Button>
                        )}
                        <div
                          className={
                            calendarioDi === s.id
                              ? "mt-2 lg:mt-0"
                              : "hidden lg:block"
                          }
                        >
                          <GoogleCalendarPicker
                            senzaAccount="nascondi"
                            disabled={!canWrite}
                            value={{
                              google_connection_id:
                                s.google_connection_id ?? null,
                              google_calendar_id: s.google_calendar_id ?? null,
                            }}
                            onChange={(next) =>
                              collega.mutate({ id: s.id, ...next })
                            }
                          />
                          {s.google_last_error && (
                            <p className="mt-1 text-xs text-red-700">
                              {s.google_last_error}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={compact ? "col-start-1 self-center" : undefined}>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={STATO_CLASSE[stato]}>
                            {STATO_SYNC_LABEL[stato]}
                          </Badge>
                          {s.google_calendar_id && (
                            <Switch
                              checked={!!s.google_sync_enabled}
                              disabled={!canWrite}
                              aria-label={`Invia a Google Calendar: ${s.name}`}
                              onCheckedChange={(on) =>
                                collega.mutate({
                                  id: s.id,
                                  google_connection_id:
                                    s.google_connection_id ?? null,
                                  google_calendar_id:
                                    s.google_calendar_id ?? null,
                                  google_sync_enabled: on,
                                })
                              }
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={compact ? "col-start-2 self-center" : undefined}>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Documenti ${s.name}`}
                            onClick={() => setAllegatiDi(s)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={!canWrite}
                            aria-label={`Modifica ${s.name}`}
                            onClick={() => {
                              setInModifica(s);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {s.kind !== "interna" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={!canWrite}
                              aria-label={`Elimina ${s.name}`}
                              onClick={() => setDaEliminare(s)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {!visibili.length && (
              <div className="space-y-2 p-6 text-center text-sm text-muted-foreground">
                <p>Nessuna squadra corrisponde ai filtri.</p>
                <Button variant="link" onClick={mostraTutte}>
                  Azzera i filtri
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      <ExternalTeamDialog
        open={dialogOpen}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setInModifica(null);
        }}
        team={
          inModifica
            ? {
                id: inModifica.id,
                name: inModifica.name,
                contact_name: inModifica.contact_name,
                phone: inModifica.phone,
                email: inModifica.email,
                notes: inModifica.notes,
                is_active: inModifica.is_active,
                vat_rate: inModifica.vat_rate,
                kind: inModifica.kind ?? "esterna",
                subappaltatore_id: inModifica.subappaltatore_id ?? null,
                leader_user_id: inModifica.leader_user_id ?? null,
                color: inModifica.color ?? null,
              }
            : null
        }
        subappaltatori={subappaltatori}
        onSave={onSubmit}
        isSaving={salva.isPending}
        tipoBloccato
      />

      {allegatiDi && (
        <ExternalTeamAttachments
          team={{ id: allegatiDi.id, name: allegatiDi.name }}
          open={!!allegatiDi}
          onOpenChange={(v) => !v && setAllegatiDi(null)}
        />
      )}

      <AlertDialog
        open={!!daEliminare}
        onOpenChange={(v) => !v && setDaEliminare(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare «{daEliminare?.name}»?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se la squadra ha assegnazioni o uno storico delle composizioni,
              non si può eliminare: disattivala per non proporla nei nuovi
              incarichi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              disabled={!canWrite}
              onClick={(e) => {
                e.preventDefault();
                if (daEliminare && canWrite)
                  elimina.mutate(daEliminare.id, {
                    onSuccess: () => setDaEliminare(null),
                  });
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

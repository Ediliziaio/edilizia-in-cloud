import { useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Users, Search, ChevronLeft, ChevronRight, Ban, CheckCircle2, KeyRound,
  MonitorSmartphone, ShieldAlert, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDebounce } from "@/hooks/useDebounce";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  useAdminUsers, useAdminUserSessions, useAdminUserActions,
  type AdminUserRow,
} from "@/hooks/superadmin/useAdminUsers";

const PAGE_SIZE = 50;

const FILTRI_STATO = [
  { valore: null, etichetta: "Tutti" },
  { valore: "attivi" as const, etichetta: "Attivi" },
  { valore: "bloccati" as const, etichetta: "Bloccati" },
  { valore: "mai_entrati" as const, etichetta: "Mai entrati" },
];

function quandoDa(iso: string | null): string {
  if (!iso) return "mai";
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: it });
}

/** Pannello laterale con la storia dell'utente e le azioni amministrative. */
function SchedaUtente({
  utente, aperta, onClose,
}: { utente: AdminUserRow | null; aperta: boolean; onClose: () => void }) {
  const { data: sessioni, isLoading } = useAdminUserSessions(utente?.id ?? null);
  const { setBlocked, revokeSessions, resetPassword } = useAdminUserActions();
  const [confermaReset, setConfermaReset] = useState(false);

  if (!utente) return null;

  return (
    <>
      <Sheet open={aperta} onOpenChange={(v) => !v && onClose()}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              {utente.nome ?? utente.email}
              {utente.bloccato && <Badge variant="destructive">Bloccato</Badge>}
            </SheetTitle>
            <SheetDescription>{utente.email}</SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Azienda</p>
                <p className="font-medium">{utente.azienda_nome ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefono</p>
                <p className="font-medium">{utente.telefono ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ultimo accesso</p>
                <p className="font-medium">{quandoDa(utente.ultimo_accesso)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tentativi falliti</p>
                <p className={`font-medium ${utente.tentativi_falliti > 0 ? "text-amber-600" : ""}`}>
                  {utente.tentativi_falliti}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Ruoli</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(utente.ruoli ?? []).map((r) => (
                    <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                  ))}
                  {(!utente.ruoli || utente.ruoli.length === 0) && (
                    <span className="text-sm text-muted-foreground">nessun ruolo assegnato</span>
                  )}
                </div>
              </div>
              {utente.motivo_blocco && (
                <div className="col-span-2 rounded-md bg-destructive/10 p-2.5">
                  <p className="text-xs text-destructive font-medium">Motivo del blocco</p>
                  <p className="text-sm">{utente.motivo_blocco}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={utente.bloccato ? "outline" : "destructive"}
                size="sm"
                disabled={setBlocked.isPending}
                onClick={() =>
                  setBlocked.mutate({
                    userId: utente.id,
                    blocked: !utente.bloccato,
                    reason: utente.bloccato ? undefined : "Bloccato dall'amministratore",
                  })
                }
              >
                {utente.bloccato ? <CheckCircle2 className="h-4 w-4 mr-1.5" /> : <Ban className="h-4 w-4 mr-1.5" />}
                {utente.bloccato ? "Sblocca" : "Blocca"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConfermaReset(true)}>
                <KeyRound className="h-4 w-4 mr-1.5" />
                Reset password
              </Button>
              {utente.sessioni_attive > 0 && (
                <Button
                  variant="outline" size="sm" disabled={revokeSessions.isPending}
                  onClick={() => revokeSessions.mutate({ userId: utente.id })}
                >
                  <MonitorSmartphone className="h-4 w-4 mr-1.5" />
                  Chiudi {utente.sessioni_attive} sessioni
                </Button>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Sessioni recenti</h3>
              {isLoading && <Skeleton className="h-24 w-full" />}
              {!isLoading && (sessioni ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Nessun accesso registrato.</p>
              )}
              <div className="space-y-2">
                {(sessioni ?? []).map((s) => (
                  <div key={s.id} className="rounded-md border p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {[s.browser, s.sistema, s.dispositivo].filter(Boolean).join(" · ") || "dispositivo sconosciuto"}
                      </span>
                      {s.attiva
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">attiva</Badge>
                        : <Badge variant="outline" className="text-[10px]">chiusa</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                      <span className="font-mono">{s.ip ?? "IP non registrato"}</span>
                      <span>{s.ultima_attivita ? format(new Date(s.ultima_attivita), "d MMM HH:mm", { locale: it }) : "—"}</span>
                      {s.azienda_nome && <span>{s.azienda_nome}</span>}
                    </div>
                    {s.motivo_revoca && (
                      <p className="mt-1 text-amber-700 dark:text-amber-400">{s.motivo_revoca}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confermaReset} onOpenChange={setConfermaReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset password di {utente.nome ?? utente.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Viene generata una nuova password e inviata via email all'utente.
              La password attuale smette subito di funzionare. L'operazione resta
              nel registro attività.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetPassword.mutate(utente.id)}>
              Reset e invia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Elenco utenti di tutta la piattaforma (F2-01).
 *
 * Risponde alla domanda che prima non aveva risposta: dove sta questa persona,
 * quando è entrata l'ultima volta, da quale dispositivo, ed è bloccata?
 */
export default function UsersList() {
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState<"attivi" | "bloccati" | "mai_entrati" | null>(null);
  const [pagina, setPagina] = useState(0);
  const [selezionato, setSelezionato] = useState<AdminUserRow | null>(null);
  const ricercaDebounced = useDebounce(ricerca, 350);
  const isMobile = useIsMobile();

  const { data, isLoading, error } = useAdminUsers({
    search: ricercaDebounced, stato, page: pagina, pageSize: PAGE_SIZE,
  });

  const righe = data?.rows ?? [];
  const totale = data?.total ?? 0;
  const pagineTotali = Math.max(1, Math.ceil(totale / PAGE_SIZE));

  return (
    <div className="p-3 md:p-6 space-y-4">
      <div className="hidden md:flex items-center gap-3">
        <Users className="h-6 w-6 text-blue-500" />
        <div>
          <h1 className="text-xl font-semibold">Utenti</h1>
          <p className="text-sm text-muted-foreground">
            Tutte le persone della piattaforma, con accessi, dispositivi e stato dell'account
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-base">
              {isLoading ? "Caricamento…" : `${totale.toLocaleString("it-IT")} utenti`}
            </CardTitle>
            <div className="relative flex-1 md:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={ricerca}
                onChange={(e) => { setRicerca(e.target.value); setPagina(0); }}
                placeholder="Nome, email, telefono o ID…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-2">
            {FILTRI_STATO.map((f) => (
              <Button
                key={f.etichetta}
                variant={stato === f.valore ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => { setStato(f.valore); setPagina(0); }}
              >
                {f.etichetta}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0 overflow-x-auto">
          {error && (
            <p className="text-sm text-destructive p-6">
              Errore nel caricamento: {(error as Error).message}
            </p>
          )}

          <Table className="min-w-[680px]">
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Azienda</TableHead>
                <TableHead>Ruoli</TableHead>
                <TableHead>Ultimo accesso</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(5)].map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && !error && righe.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                    Nessun utente corrisponde alla ricerca
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && righe.map((u) => (
                <TableRow
                  key={u.id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => setSelezionato(u)}
                >
                  <TableCell>
                    <p className="font-medium text-sm">{u.nome ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </TableCell>
                  <TableCell className="text-sm">{u.azienda_nome ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(u.ruoli ?? []).slice(0, 2).map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                      ))}
                      {(u.ruoli?.length ?? 0) > 2 && (
                        <Badge variant="outline" className="text-[10px]">+{u.ruoli!.length - 2}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {quandoDa(u.ultimo_accesso)}
                    {u.sessioni_attive > 0 && (
                      <span className="ml-1.5 text-xs text-emerald-600">· {u.sessioni_attive} attive</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {u.bloccato ? (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <Ban className="h-3 w-3" /> bloccato
                      </Badge>
                    ) : u.tentativi_falliti > 0 ? (
                      <Badge variant="outline" className="text-[10px] gap-1 text-amber-700 border-amber-300">
                        <ShieldAlert className="h-3 w-3" /> {u.tentativi_falliti} falliti
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>

        {pagineTotali > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">Pagina {pagina + 1} di {pagineTotali}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={pagina === 0}
                onClick={() => setPagina((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
                {!isMobile && <span className="ml-1">Precedente</span>}
              </Button>
              <Button variant="outline" size="sm" disabled={pagina + 1 >= pagineTotali}
                onClick={() => setPagina((p) => p + 1)}>
                {!isMobile && <span className="mr-1">Successiva</span>}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <SchedaUtente
        utente={selezionato}
        aperta={!!selezionato}
        onClose={() => setSelezionato(null)}
      />
    </div>
  );
}

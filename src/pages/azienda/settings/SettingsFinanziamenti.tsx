/**
 * Modulo Finanziamenti — pagina lista tabelle finanziarie caricate.
 *
 * Mostra le tabelle tassi di finanziamento dell'azienda (Fiditalia, Findomestic,
 * Compass, ecc.) caricate in piattaforma. Da qui l'utente può:
 *   - creare una nuova tabella (wizard CSV upload)
 *   - aprire una tabella esistente (vista righe)
 *   - aprire il calcolatore generico
 *
 * Permission gating: company_admin / super_admin.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Banknote,
  Calculator,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
  FileText,
  ExternalLink,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  Filter,
  Power,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTabelle, useDeleteTabella, useToggleTabellaAttiva } from "@/lib/finanziamenti/queries";
import { toast } from "sonner";

export default function SettingsFinanziamenti() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const navigate = useNavigate();
  const { data: tabelle = [], isLoading, isError, error, refetch } = useTabelle();
  const deleteTabella = useDeleteTabella();
  const toggleTabella = useToggleTabellaAttiva();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [finanziariaFilter, setFinanziariaFilter] = useState("all");
  const [durataFilter, setDurataFilter] = useState("all");
  const [confermaDelete, setConfermaDelete] = useState<{
    id: string;
    nome: string;
  } | null>(null);

  const stats = useMemo(() => {
    const today = todayIso();
    return {
      totale: tabelle.length,
      attive: tabelle.filter((t) => t.attiva).length,
      scadute: tabelle.filter((t) => t.data_scadenza && t.data_scadenza < today).length,
      inScadenza: tabelle.filter((t) => isExpiringSoon(t.data_scadenza)).length,
    };
  }, [tabelle]);

  const finanziarieOptions = useMemo(() => {
    return Array.from(
      new Set(tabelle.map((t) => t.finanziaria_nome).filter(Boolean) as string[]),
    ).sort((a, b) => a.localeCompare(b));
  }, [tabelle]);

  const durateOptions = useMemo(() => {
    return Array.from(new Set(tabelle.flatMap((t) => t.durate_disponibili))).sort((a, b) => a - b);
  }, [tabelle]);

  const tabelleFiltrate = useMemo(() => {
    const s = search.trim().toLowerCase();
    return tabelle.filter((t) => {
      const matchesSearch = !s || (
        t.nome_prodotto.toLowerCase().includes(s) ||
        (t.codice_condizione ?? "").toLowerCase().includes(s) ||
        (t.finanziaria_nome ?? "").toLowerCase().includes(s)
      );
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && t.attiva) ||
        (statusFilter === "inactive" && !t.attiva) ||
        (statusFilter === "valid" && getValidityState(t.data_decorrenza, t.data_scadenza) === "valid") ||
        (statusFilter === "expired" && getValidityState(t.data_decorrenza, t.data_scadenza) === "expired") ||
        (statusFilter === "future" && getValidityState(t.data_decorrenza, t.data_scadenza) === "future") ||
        (statusFilter === "expiring" && isExpiringSoon(t.data_scadenza));
      const matchesFinanziaria =
        finanziariaFilter === "all" || t.finanziaria_nome === finanziariaFilter;
      const matchesDurata =
        durataFilter === "all" || t.durate_disponibili.includes(Number(durataFilter));
      return matchesSearch && matchesStatus && matchesFinanziaria && matchesDurata;
    });
  }, [tabelle, search, statusFilter, finanziariaFilter, durataFilter]);

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent
          className="py-10 flex flex-col items-center gap-4 text-center"
          role="alert"
          aria-live="polite"
        >
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">Accesso riservato</p>
            <p className="text-sm text-muted-foreground mt-1">
              Solo l&apos;amministratore dell&apos;azienda può gestire le tabelle
              di finanziamento. Contatta il titolare se hai bisogno di accedere.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleDelete = async () => {
    if (!confermaDelete) return;
    try {
      await deleteTabella.mutateAsync(confermaDelete.id);
      toast.success(`Tabella "${confermaDelete.nome}" eliminata.`);
      setConfermaDelete(null);
    } catch (e) {
      toast.error("Errore durante l'eliminazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleToggle = async (id: string, attiva: boolean) => {
    try {
      await toggleTabella.mutateAsync({ id, attiva: !attiva });
      toast.success(attiva ? "Finanziamento archiviato." : "Finanziamento riattivato.");
    } catch (e) {
      toast.error("Errore durante il cambio stato", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header con CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per prodotto, finanziaria o codice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            aria-label="Cerca tabelle finanziamento"
          />
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/azienda/impostazioni/finanziamenti/calcolatore">
              <Calculator className="h-4 w-4 mr-2" aria-hidden="true" />
              Calcolatore
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/azienda/impostazioni/finanziamenti/nuova">
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Nuova tabella
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <SummaryCard icon={<Banknote className="h-4 w-4" />} label="Piani caricati" value={String(stats.totale)} />
        <SummaryCard icon={<CheckCircle2 className="h-4 w-4" />} label="Attivi" value={String(stats.attive)} tone="emerald" />
        <SummaryCard icon={<Ban className="h-4 w-4" />} label="Scaduti" value={String(stats.scadute)} tone={stats.scadute > 0 ? "amber" : "neutral"} />
        <SummaryCard icon={<Clock className="h-4 w-4" />} label="In scadenza 30gg" value={String(stats.inScadenza)} tone={stats.inScadenza > 0 ? "amber" : "neutral"} />
      </div>

      {tabelle.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filtra per stato">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Attivi</SelectItem>
                  <SelectItem value="inactive">Disattivati</SelectItem>
                  <SelectItem value="valid">Validi oggi</SelectItem>
                  <SelectItem value="expiring">In scadenza 30 giorni</SelectItem>
                  <SelectItem value="expired">Scaduti</SelectItem>
                  <SelectItem value="future">Non ancora decorso</SelectItem>
                </SelectContent>
              </Select>
              <Select value={finanziariaFilter} onValueChange={setFinanziariaFilter}>
                <SelectTrigger aria-label="Filtra per finanziaria">
                  <SelectValue placeholder="Finanziaria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le finanziarie</SelectItem>
                  {finanziarieOptions.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={durataFilter} onValueChange={setDurataFilter}>
                <SelectTrigger aria-label="Filtra per durata">
                  <SelectValue placeholder="Durata" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le durate</SelectItem>
                  {durateOptions.map((duration) => (
                    <SelectItem key={duration} value={String(duration)}>{duration} mesi</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setFinanziariaFilter("all");
                  setDurataFilter("all");
                }}
              >
                <Filter className="h-4 w-4 mr-2" />
                Pulisci
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Finanziamenti non caricati</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{error instanceof Error ? error.message : "Errore durante il caricamento delle tabelle."}</span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && tabelle.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <Banknote
              className="h-16 w-16 text-muted-foreground/50"
              aria-hidden="true"
            />
            <div>
              <h3 className="font-medium text-lg">
                Nessuna tabella finanziaria caricata
              </h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Carica le tabelle delle finanziarie con cui lavori (Fiditalia,
                Findomestic, Compass, Agos…). Bastano un PDF e un CSV con i
                tassi: il sistema calcolerà rate, TAN, TAEG e provvigioni
                automaticamente.
              </p>
            </div>
            <Button asChild className="mt-2">
              <Link to="/azienda/impostazioni/finanziamenti/nuova">
                <Plus className="h-4 w-4 mr-2" />
                Carica la prima tabella
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabella delle tabelle */}
      {tabelle.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prodotto</TableHead>
                  <TableHead>Finanziaria</TableHead>
                  <TableHead>Cond.</TableHead>
                  <TableHead className="text-right">Righe</TableHead>
                  <TableHead>Range importi</TableHead>
                  <TableHead>Durate (mesi)</TableHead>
                  <TableHead>Validità</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelleFiltrate.length === 0 &&
                  (search.trim() !== "" ||
                    statusFilter !== "all" ||
                    finanziariaFilter !== "all" ||
                    durataFilter !== "all") && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {search.trim() !== ""
                        ? `Nessuna tabella trovata per "${search}".`
                        : "Nessuna tabella trovata con i filtri selezionati."}
                    </TableCell>
                  </TableRow>
                )}
                {tabelleFiltrate.map((t) => (
                  <TableRow
                    key={t.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() =>
                      navigate(`/azienda/impostazioni/finanziamenti/${t.id}`)
                    }
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText
                          className="h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        {t.nome_prodotto}
                      </div>
                    </TableCell>
                    <TableCell>
                      {t.finanziaria_nome ?? (
                        <span className="text-muted-foreground italic">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.codice_condizione ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {t.righe_count}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {t.importo_min != null && t.importo_max != null
                        ? `€ ${formatEur(t.importo_min)} – ${formatEur(t.importo_max)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.durate_disponibili.length > 0
                        ? t.durate_disponibili.join(", ")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <ValidityBadge decorrenza={t.data_decorrenza} scadenza={t.data_scadenza} />
                    </TableCell>
                    <TableCell>
                      {t.attiva ? (
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          Attiva
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted">
                          Disattivata
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          aria-label={`Apri ${t.nome_prodotto}`}
                        >
                          <Link
                            to={`/azienda/impostazioni/finanziamenti/${t.id}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleToggle(t.id, t.attiva)}
                          disabled={toggleTabella.isPending}
                          aria-label={`${t.attiva ? "Archivia" : "Riattiva"} ${t.nome_prodotto}`}
                        >
                          <Power className={t.attiva ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-emerald-600"} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setConfermaDelete({ id: t.id, nome: t.nome_prodotto })
                          }
                          aria-label={`Elimina ${t.nome_prodotto}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Caricamento tabelle in corso…
          </CardContent>
        </Card>
      )}

      {/* Conferma eliminazione */}
      <AlertDialog
        open={!!confermaDelete}
        onOpenChange={(open) => !open && setConfermaDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la tabella?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare definitivamente la tabella "
              <strong>{confermaDelete?.nome}</strong>". Tutte le righe associate
              verranno cancellate. Se è già usata in progetti o preventivi,
              l&apos;eliminazione verrà bloccata: disattivala per impedirne nuovi
              utilizzi senza perdere lo storico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina tabella
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatEur(n: number): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function getValidityState(
  decorrenza: string | null,
  scadenza: string | null,
): "valid" | "expired" | "future" | "open" {
  const today = todayIso();
  if (decorrenza && decorrenza > today) return "future";
  if (scadenza && scadenza < today) return "expired";
  if (decorrenza || scadenza) return "valid";
  return "open";
}

function isExpiringSoon(scadenza: string | null): boolean {
  if (!scadenza) return false;
  const today = new Date(todayIso());
  const expires = new Date(scadenza);
  const days = Math.ceil((expires.getTime() - today.getTime()) / 86_400_000);
  return days >= 0 && days <= 30;
}

function ValidityBadge({
  decorrenza,
  scadenza,
}: {
  decorrenza: string | null;
  scadenza: string | null;
}) {
  const state = getValidityState(decorrenza, scadenza);
  if (state === "expired") {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
        Scaduta
      </Badge>
    );
  }
  if (state === "future") {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Dal {decorrenza}
      </Badge>
    );
  }
  if (isExpiringSoon(scadenza)) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
        Scade {scadenza}
      </Badge>
    );
  }
  if (state === "valid") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        Valida
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">Senza scadenza</span>;
}

function SummaryCard({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border bg-card";
  return (
    <Card className={toneClass}>
      <CardContent className="py-3 flex items-center justify-between">
        <div>
          <p className="text-xs opacity-80">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className="opacity-70">{icon}</div>
      </CardContent>
    </Card>
  );
}

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

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTabelle, useDeleteTabella } from "@/lib/finanziamenti/queries";
import { toast } from "sonner";

export default function SettingsFinanziamenti() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const navigate = useNavigate();
  const { data: tabelle = [], isLoading } = useTabelle();
  const deleteTabella = useDeleteTabella();
  const [search, setSearch] = useState("");
  const [confermaDelete, setConfermaDelete] = useState<{
    id: string;
    nome: string;
  } | null>(null);

  const tabelleFiltrate = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return tabelle;
    return tabelle.filter((t) => {
      return (
        t.nome_prodotto.toLowerCase().includes(s) ||
        (t.codice_condizione ?? "").toLowerCase().includes(s) ||
        (t.finanziaria_nome ?? "").toLowerCase().includes(s)
      );
    });
  }, [tabelle, search]);

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
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelleFiltrate.length === 0 && search && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground"
                    >
                      Nessuna tabella trovata per "{search}".
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
              verranno cancellate. L&apos;azione non è reversibile.
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

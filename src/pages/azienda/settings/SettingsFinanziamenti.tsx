/**
 * Impostazioni → Finanziamenti: l'elenco delle tabelle delle finanziarie caricate.
 *
 * Mostra le tabelle tassi dell'azienda (Fiditalia, Findomestic, Compass, ecc.). Da qui l'utente può:
 *   - caricarne una nuova (procedura in 3 passi)
 *   - aprirne una (righe, calcolatore, allegati)
 *   - aprire il calcolatore generico
 *   - disattivarla o riattivarla, eliminarla
 *
 * Permessi: vedere = «Finanziamenti» in vista; caricare, disattivare, eliminare = «Finanziamenti» in modifica.
 * Chi può solo vedere ha i comandi che scrivono SPENTI, con la frase che spiega perché (non nascosti).
 *
 * Le date di validità non cambiano cosa si propone nei preventivi: una tabella attiva viene proposta anche
 * se è scaduta (vedi useTabelleFinanziamento.ts, QuoteFinancingPanel.tsx, fotovoltaico/queries.ts).
 * I testi di questa pagina lo dicono.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  Trash2,
  FileText,
  ExternalLink,
  AlertTriangle,
  Filter,
  Power,
} from "lucide-react";
import { useTabelle, useDeleteTabella, useToggleTabellaAttiva } from "@/lib/finanziamenti/queries";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  conteggio,
  dataItaliana,
  erroreComprensibile,
  formattaEuro,
  oggiLocale,
  proprietaComandoSpento,
  scadeEntro,
  statoValidita,
  useAccessoFinanziamenti,
} from "./_finanziamenti/comuni";
import { AccessoNegato, AvvisoSolaLettura } from "./_finanziamenti/pezzi";

/** Con poche tabelle i filtri sono solo rumore: compaiono da qui in su. */
const TABELLE_PER_I_FILTRI = 5;

export default function SettingsFinanziamenti() {
  const { puoVedere, puoModificare } = useAccessoFinanziamenti();
  const isMobile = useIsMobile();
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

  const oggi = oggiLocale();
  const filtriVisibili = tabelle.length > TABELLE_PER_I_FILTRI;

  const stats = useMemo(() => {
    return {
      totale: tabelle.length,
      attive: tabelle.filter((t) => t.attiva).length,
      scadute: tabelle.filter((t) => statoValidita(t.data_decorrenza, t.data_scadenza, oggi) === "scaduta").length,
      inScadenza: tabelle.filter((t) => scadeEntro(t.data_scadenza, 30, oggi)).length,
    };
  }, [tabelle, oggi]);

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
      // I tre filtri a tendina si vedono solo con più di 5 tabelle: se le tabelle scendono sotto quel numero
      // mentre un filtro è acceso, non devono continuare a nascondere righe senza che si possano spegnere.
      if (!filtriVisibili) return matchesSearch;
      const validita = statoValidita(t.data_decorrenza, t.data_scadenza, oggi);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && t.attiva) ||
        (statusFilter === "inactive" && !t.attiva) ||
        (statusFilter === "valid" && validita === "valida") ||
        (statusFilter === "expired" && validita === "scaduta") ||
        (statusFilter === "future" && validita === "futura") ||
        (statusFilter === "expiring" && scadeEntro(t.data_scadenza, 30, oggi));
      const matchesFinanziaria =
        finanziariaFilter === "all" || t.finanziaria_nome === finanziariaFilter;
      const matchesDurata =
        durataFilter === "all" || t.durate_disponibili.includes(Number(durataFilter));
      return matchesSearch && matchesStatus && matchesFinanziaria && matchesDurata;
    });
  }, [tabelle, search, statusFilter, finanziariaFilter, durataFilter, filtriVisibili, oggi]);

  if (!puoVedere) return <AccessoNegato />;

  const handleDelete = async () => {
    if (!confermaDelete || !puoModificare) return;
    try {
      await deleteTabella.mutateAsync(confermaDelete.id);
      toast.success(`Tabella «${confermaDelete.nome}» eliminata.`);
      setConfermaDelete(null);
    } catch (e) {
      toast.error("Non sono riuscito a eliminare la tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    }
  };

  const handleToggle = async (id: string, attiva: boolean) => {
    if (!puoModificare) return;
    try {
      await toggleTabella.mutateAsync({ id, attiva: !attiva });
      toast.success(attiva ? "Tabella disattivata." : "Tabella attivata.");
    } catch (e) {
      toast.error("Non sono riuscito a cambiare lo stato della tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    }
  };

  /** Cosa scrivere quando la ricerca o i filtri non lasciano niente (vuoto se non c'è nessuna ricerca né filtro). */
  const nessunaTrovata =
    search.trim() !== ""
      ? `Nessuna tabella trovata per "${search}".`
      : filtriVisibili && (statusFilter !== "all" || finanziariaFilter !== "all" || durataFilter !== "all")
        ? "Nessuna tabella trovata con i filtri selezionati."
        : "";

  const riepilogo = [
    conteggio(stats.totale, "tabella", "tabelle"),
    conteggio(stats.attive, "attiva", "attive"),
    stats.scadute > 0 ? conteggio(stats.scadute, "scaduta", "scadute") : null,
    stats.inScadenza > 0 ? `${stats.inScadenza} in scadenza (30 giorni)` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      {!puoModificare && <AvvisoSolaLettura />}

      {/* Header con CTA */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
          <PulsanteNuovaTabella puoModificare={puoModificare} size="sm">
            Nuova tabella
          </PulsanteNuovaTabella>
        </div>
      </div>

      {tabelle.length > 0 && (
        <p
          className={
            stats.scadute > 0 ? "text-sm font-medium text-amber-800 dark:text-amber-300" : "text-sm text-muted-foreground"
          }
        >
          {riepilogo}
        </p>
      )}

      {filtriVisibili && (
        <Card>
          <CardContent className="py-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger aria-label="Filtra per stato">
                  <SelectValue placeholder="Stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="active">Attive</SelectItem>
                  <SelectItem value="inactive">Disattivate</SelectItem>
                  <SelectItem value="valid">Valide oggi</SelectItem>
                  <SelectItem value="expiring">In scadenza (30 giorni)</SelectItem>
                  <SelectItem value="expired">Scadute</SelectItem>
                  <SelectItem value="future">Non ancora iniziate</SelectItem>
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
                <Filter className="h-4 w-4 mr-2" aria-hidden="true" />
                Pulisci
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>
              <strong className="block font-medium">Non riesco a leggere le tabelle.</strong>
              {erroreComprensibile(error, "Riprova tra poco.")}
            </span>
            <Button size="sm" variant="outline" onClick={() => void refetch()}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && !isError && tabelle.length === 0 && (
        <Card>
          <CardContent className="py-16 flex flex-col items-center text-center gap-4">
            <Banknote
              className="h-16 w-16 text-muted-foreground/50"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-medium text-lg">
                Nessuna tabella caricata
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Carica le tabelle delle finanziarie con cui lavori (Fiditalia,
                Findomestic, Compass, Agos…): il PDF che ti hanno dato oppure
                un file CSV con le righe. Nei preventivi rata, TAN e TAEG
                vengono presi da quelle righe.
              </p>
            </div>
            <PulsanteNuovaTabella puoModificare={puoModificare} className="mt-2">
              Carica la prima tabella
            </PulsanteNuovaTabella>
          </CardContent>
        </Card>
      )}

      {/* Le tabelle: da computer una tabella, da telefono una scheda per riga (nove colonne non stanno in 375 px) */}
      {tabelle.length > 0 && (
        <Card>
          <CardContent className="p-0">
            {isMobile ? (
              <ul role="list" aria-label="Tabelle di finanziamento" className="divide-y">
                {tabelleFiltrate.length === 0 && nessunaTrovata && (
                  <li className="p-6 text-center text-sm text-muted-foreground">{nessunaTrovata}</li>
                )}
                {tabelleFiltrate.map((t) => (
                  <li key={t.id} className="space-y-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex min-w-0 items-center gap-2 font-medium">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="min-w-0 break-words">{t.nome_prodotto}</span>
                      </p>
                      <BadgeStato attiva={t.attiva} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[t.finanziaria_nome, t.codice_condizione ? `Condizione ${t.codice_condizione}` : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    <p className="text-sm">
                      {[
                        t.importo_min != null && t.importo_max != null
                          ? `€ ${formattaEuro(t.importo_min)} – ${formattaEuro(t.importo_max)}`
                          : null,
                        t.durate_disponibili.length > 0 ? `${t.durate_disponibili.join(", ")} mesi` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    <ValidityBadge
                      decorrenza={t.data_decorrenza}
                      scadenza={t.data_scadenza}
                      attiva={t.attiva}
                      oggi={oggi}
                    />
                    <div className="flex justify-end gap-1">
                      <AzioniTabella
                        tabella={t}
                        puoModificare={puoModificare}
                        inCorso={toggleTabella.isPending}
                        onToggle={() => void handleToggle(t.id, t.attiva)}
                        onElimina={() => setConfermaDelete({ id: t.id, nome: t.nome_prodotto })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Da 768 a 1280 meno colonne (nelle Impostazioni a 1024 lo
                        spazio è 686px, la tabella ne chiedeva 962): finanziaria,
                        condizione e durate da 1280, righe da 1536. */}
                    <TableHead>Prodotto</TableHead>
                    <TableHead className="md:max-xl:hidden">Finanziaria</TableHead>
                    <TableHead className="md:max-xl:hidden">Condizione</TableHead>
                    <TableHead className="text-right md:max-2xl:hidden">Righe</TableHead>
                    <TableHead>Importi</TableHead>
                    <TableHead className="md:max-xl:hidden">Durate (mesi)</TableHead>
                    <TableHead>Validità</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tabelleFiltrate.length === 0 && nessunaTrovata && (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="text-center py-8 text-muted-foreground"
                      >
                        {nessunaTrovata}
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
                      <TableCell className="md:max-xl:hidden">
                        {t.finanziaria_nome ?? (
                          <span className="text-muted-foreground italic">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground md:max-xl:hidden">
                        {t.codice_condizione ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums md:max-2xl:hidden">
                        {t.righe_count}
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {t.importo_min != null && t.importo_max != null
                          ? `€ ${formattaEuro(t.importo_min)} – ${formattaEuro(t.importo_max)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm md:max-xl:hidden">
                        {t.durate_disponibili.length > 0
                          ? t.durate_disponibili.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <ValidityBadge
                          decorrenza={t.data_decorrenza}
                          scadenza={t.data_scadenza}
                          attiva={t.attiva}
                          oggi={oggi}
                        />
                      </TableCell>
                      <TableCell>
                        <BadgeStato attiva={t.attiva} />
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1">
                          <AzioniTabella
                            tabella={t}
                            puoModificare={puoModificare}
                            inCorso={toggleTabella.isPending}
                            onToggle={() => void handleToggle(t.id, t.attiva)}
                            onElimina={() => setConfermaDelete({ id: t.id, nome: t.nome_prodotto })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
              Stai per eliminare «<strong>{confermaDelete?.nome}</strong>» con tutte
              le sue righe, e non si torna indietro. Se l&apos;hai già usata in un
              preventivo o in un progetto, disattivala invece di eliminarla: non
              viene più proposta e lo storico resta com&apos;era. Una tabella usata
              da un progetto fotovoltaico non si può eliminare.
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

/**
 * «Nuova tabella» / «Carica la prima tabella»: un collegamento per chi può modificare, un pulsante SPENTO
 * (con la frase che spiega perché) per chi può solo consultare. Un collegamento non può essere spento.
 */
function PulsanteNuovaTabella({
  puoModificare,
  size,
  className,
  children,
}: {
  puoModificare: boolean;
  size?: "sm";
  className?: string;
  children: ReactNode;
}) {
  if (puoModificare) {
    return (
      <Button asChild size={size} className={className}>
        <Link to="/azienda/impostazioni/finanziamenti/nuova">
          <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
          {children}
        </Link>
      </Button>
    );
  }
  return (
    <Button size={size} className={className} disabled {...proprietaComandoSpento(false)}>
      <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
      {children}
    </Button>
  );
}

/**
 * Dove sta la tabella rispetto alle sue date. Se è attiva e fuori dalle date, lo dice: i preventivi la
 * propongono lo stesso (le date non filtrano niente, conta solo «attiva»).
 */
function ValidityBadge({
  decorrenza,
  scadenza,
  attiva,
  oggi,
}: {
  decorrenza: string | null;
  scadenza: string | null;
  attiva: boolean;
  oggi: string;
}) {
  const stato = statoValidita(decorrenza, scadenza, oggi);
  if (stato === "scaduta") {
    return (
      <div className="space-y-1">
        <Badge variant="outline" className="whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200">
          Scaduta il {dataItaliana(scadenza)}
        </Badge>
        {attiva && <p className="text-xs text-amber-800 dark:text-amber-300">Ancora proposta nei preventivi</p>}
      </div>
    );
  }
  if (stato === "futura") {
    return (
      <div className="space-y-1">
        <Badge variant="outline" className="whitespace-nowrap bg-blue-50 text-blue-700 border-blue-200">
          Dal {dataItaliana(decorrenza)}
        </Badge>
        {attiva && <p className="text-xs text-blue-700 dark:text-blue-300">Già proposta nei preventivi</p>}
      </div>
    );
  }
  if (scadeEntro(scadenza, 30, oggi)) {
    return (
      <Badge variant="outline" className="whitespace-nowrap bg-amber-50 text-amber-800 border-amber-200">
        Scade il {dataItaliana(scadenza)}
      </Badge>
    );
  }
  if (stato === "valida") {
    return (
      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
        Valida
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground">Senza scadenza</span>;
}

/** Il badge «Attiva» / «Disattivata». */
function BadgeStato({ attiva }: { attiva: boolean }) {
  return attiva ? (
    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
      Attiva
    </Badge>
  ) : (
    <Badge variant="outline" className="bg-muted">
      Disattivata
    </Badge>
  );
}

/**
 * Apri, disattiva/attiva, elimina. Gli ultimi due scrivono: per chi può solo consultare sono spenti, con la
 * frase che spiega perché (il pulsante è fatto di sola icona, il nome sta in `aria-label`).
 */
function AzioniTabella({
  tabella,
  puoModificare,
  inCorso,
  onToggle,
  onElimina,
}: {
  tabella: { id: string; nome_prodotto: string; attiva: boolean };
  puoModificare: boolean;
  inCorso: boolean;
  onToggle: () => void;
  onElimina: () => void;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" asChild aria-label={`Apri ${tabella.nome_prodotto}`}>
        <Link to={`/azienda/impostazioni/finanziamenti/${tabella.id}`} title="Apri">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        disabled={!puoModificare || inCorso}
        aria-label={`${tabella.attiva ? "Disattiva" : "Attiva"} ${tabella.nome_prodotto}`}
        title={tabella.attiva ? "Disattiva" : "Attiva"}
        {...proprietaComandoSpento(puoModificare)}
      >
        <Power className={tabella.attiva ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-emerald-600"} aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onElimina}
        disabled={!puoModificare}
        aria-label={`Elimina ${tabella.nome_prodotto}`}
        title="Elimina"
        {...proprietaComandoSpento(puoModificare)}
      >
        <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
      </Button>
    </>
  );
}

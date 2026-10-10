/**
 * Impostazioni → Finanziamenti → una tabella.
 *
 * Schede interne:
 *   1. Righe — tabella ordinabile con tutte le colonne (importo, rata, TAN, ecc.),
 *           filtro per durata.
 *   2. Calcolatore — calcolatore sulla singola tabella.
 *   3. Simulatore multi-durata — lo stesso importo su tutte le durate.
 *   4. Allegati — il PDF originale (se c'è) e il CSV importato.
 *
 * Duplica, Disattiva/Attiva ed Elimina li fa chi ha «Finanziamenti» in modifica: per gli altri i tre
 * pulsanti sono spenti, con la frase che spiega perché.
 */

import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Calculator,
  Download,
  FileText,
  Power,
  Trash2,
  ShieldAlert,
  Loader2,
  Banknote,
  CalendarClock,
  Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useTabella,
  useRighe,
  useDeleteTabella,
  useCreateTabella,
  useInsertRigheBatch,
  useToggleTabellaAttiva,
} from "@/lib/finanziamenti/queries";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";
import { toast } from "sonner";
import { CalcolatoreOutput } from "./_finanziamenti/CalcolatoreOutput";
import { SimulatoreMultiDurata } from "./_finanziamenti/SimulatoreMultiDurata";
import {
  dataItaliana,
  erroreComprensibile,
  formattaEuro,
  formattaPercentuale,
  oggiLocale,
  proprietaComandoSpento,
  statoValidita,
  useAccessoFinanziamenti,
} from "./_finanziamenti/comuni";
import { AccessoNegato, AvvisoSolaLettura, TitoloAvviso } from "./_finanziamenti/pezzi";

import { useIsMobile } from "@/hooks/use-mobile";
export default function SettingsFinanziamentiDetail() {
  const isMobile = useIsMobile();
  const { id } = useParams<{ id: string }>();
  const { puoVedere, puoModificare } = useAccessoFinanziamenti();
  const navigate = useNavigate();

  const { data: tabella, isLoading, isError: tabellaInErrore, error: erroreTabella, refetch: rileggiTabella } = useTabella(id);
  const { data: righe = [], isLoading: righeInCaricamento, isError: righeInErrore, refetch: rileggiRighe } = useRighe(id);
  const deleteTabella = useDeleteTabella();
  const toggleAttiva = useToggleTabellaAttiva();
  const createTabella = useCreateTabella();
  const insertRighe = useInsertRigheBatch();

  const [confermaDelete, setConfermaDelete] = useState(false);
  const [filtroDurata, setFiltroDurata] = useState<string>("all");
  const [sortKey, setSortKey] = useState<keyof RowData>("importo_erogato");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [importoCalc, setImportoCalc] = useState<string>("");
  const [rateCalc, setRateCalc] = useState<string>("");

  // ─── Sort/filter righe ──────────────────────────────────────────────────
  type RowData = (typeof righe)[number];
  const righeFiltrate = useMemo(() => {
    let r = [...righe];
    if (filtroDurata !== "all") {
      const n = Number(filtroDurata);
      r = r.filter((x) => x.numero_rate === n);
    }
    r.sort((a, b) => {
      const va = a[sortKey] as number | string | null;
      const vb = b[sortKey] as number | string | null;
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      return sortDir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return r;
  }, [righe, filtroDurata, sortKey, sortDir]);

  // ─── Calcolatore in-pagina ──────────────────────────────────────────────
  const risultatoCalcolo: RisultatoCalcolo | null = useMemo(() => {
    const importo = Number(importoCalc.replace(/\./g, "").replace(",", "."));
    const numero_rate = Number(rateCalc);
    if (
      !Number.isFinite(importo) ||
      importo <= 0 ||
      !Number.isFinite(numero_rate) ||
      numero_rate <= 0
    ) {
      return null;
    }
    return calcolaFinanziamento({ importo, numero_rate, righe });
  }, [importoCalc, rateCalc, righe]);

  const economicSummary = useMemo(() => summarizeRows(righe), [righe]);

  if (!puoVedere) return <AccessoNegato />;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Caricamento tabella…
        </CardContent>
      </Card>
    );
  }

  if (tabellaInErrore) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span>
            <strong className="block font-medium">Non riesco a leggere la tabella.</strong>
            {erroreComprensibile(erroreTabella, "Riprova tra poco.")}
          </span>
          <Button size="sm" variant="outline" onClick={() => void rileggiTabella()}>
            Riprova
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!tabella) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <Banknote className="h-12 w-12 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Tabella non trovata</p>
          <Button asChild variant="outline">
            <Link to="/azienda/impostazioni/finanziamenti">
              Torna alle tabelle
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const handleSort = (key: keyof RowData) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleDownload = async (path: string, filename: string | null) => {
    const { data, error } = await supabase.storage
      .from("finanziamenti-tabelle")
      .createSignedUrl(path, 60);
    if (error) {
      toast.error("Non sono riuscito a scaricare il file", {
        description: erroreComprensibile(error, "Riprova tra poco."),
      });
      return;
    }
    if (!data?.signedUrl) {
      toast.error("Non sono riuscito a scaricare il file");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = filename ?? "allegato";
    a.target = "_blank";
    a.click();
  };

  const handleDelete = async () => {
    if (!puoModificare) return;
    try {
      await deleteTabella.mutateAsync(tabella.id);
      toast.success("Tabella eliminata.");
      navigate("/azienda/impostazioni/finanziamenti");
    } catch (e) {
      toast.error("Non sono riuscito a eliminare la tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    }
  };

  const handleToggleAttiva = async () => {
    if (!puoModificare) return;
    try {
      await toggleAttiva.mutateAsync({
        id: tabella.id,
        attiva: !tabella.attiva,
      });
      toast.success(tabella.attiva ? "Tabella disattivata." : "Tabella attivata.");
    } catch (e) {
      toast.error("Non sono riuscito a cambiare lo stato della tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    }
  };

  const handleDuplicate = async () => {
    if (!puoModificare) return;
    try {
      const copia = await createTabella.mutateAsync({
        finanziaria_id: tabella.finanziaria_id,
        nome_prodotto: `${tabella.nome_prodotto} (copia)`,
        codice_condizione: tabella.codice_condizione,
        subtariffa_default: tabella.subtariffa_default,
        tan_base: tabella.tan_base,
        pdf_url: tabella.pdf_url,
        pdf_filename: tabella.pdf_filename,
        csv_url: tabella.csv_url,
        csv_filename: tabella.csv_filename,
        data_decorrenza: tabella.data_decorrenza,
        data_scadenza: tabella.data_scadenza,
        note: tabella.note ? `${tabella.note}\n\nCopia creata da ${tabella.nome_prodotto}.` : `Copia creata da ${tabella.nome_prodotto}.`,
      });
      await insertRighe.mutateAsync({
        tabella_id: copia.id,
        righe: righe.map(
          ({
            id: _id,
            tabella_id: _tabellaId,
            company_id: _companyId,
            created_at: _createdAt,
            ...row
          }) => row,
        ),
      });
      toast.success("Tabella duplicata.", {
        description: "La copia mantiene condizioni, allegati e righe della tabella originale.",
      });
      navigate(`/azienda/impostazioni/finanziamenti/${copia.id}`);
    } catch (e) {
      toast.error("Non sono riuscito a duplicare la tabella", {
        description: erroreComprensibile(e, "Riprova tra poco."),
      });
    }
  };

  const oggi = oggiLocale();
  const sommario = descriviNumeri(tabella, economicSummary);

  return (
    <div className="space-y-4">
      {!puoModificare && <AvvisoSolaLettura />}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/azienda/impostazioni/finanziamenti">
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Tabelle
            </Link>
          </Button>
          <div>
            <h2 className="font-semibold text-lg flex items-center gap-2">
              {tabella.nome_prodotto}
              {!tabella.attiva && (
                <Badge variant="outline" className="bg-muted">
                  Disattivata
                </Badge>
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {tabella.finanziaria?.nome ?? "—"}
              {tabella.codice_condizione &&
                ` · Condizione ${tabella.codice_condizione}`}
              {tabella.subtariffa_default &&
                ` · Subtariffa ${tabella.subtariffa_default}`}
              {tabella.tan_base != null && ` · TAN base ${formattaPercentuale(tabella.tan_base)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={!puoModificare || createTabella.isPending || insertRighe.isPending || righe.length === 0}
            {...proprietaComandoSpento(puoModificare)}
          >
            <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
            Duplica
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleAttiva}
            disabled={!puoModificare || toggleAttiva.isPending}
            {...proprietaComandoSpento(puoModificare)}
          >
            <Power className="h-4 w-4 mr-1" aria-hidden="true" />
            {tabella.attiva ? "Disattiva" : "Attiva"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfermaDelete(true)}
            disabled={!puoModificare}
            {...proprietaComandoSpento(puoModificare)}
          >
            <Trash2 className="h-4 w-4 mr-1 text-destructive" aria-hidden="true" />
            Elimina
          </Button>
        </div>
      </div>

      {/* I numeri della tabella, in una riga (prima erano otto riquadri) */}
      <p className="text-sm text-muted-foreground">{sommario}</p>

      <ValidityAlert
        decorrenza={tabella.data_decorrenza}
        scadenza={tabella.data_scadenza}
        attiva={tabella.attiva}
        oggi={oggi}
      />
      <Alert>
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        <TitoloAvviso>Le condizioni non si cambiano</TitoloAvviso>
        <AlertDescription>
          Se questa tabella è già stata usata in preventivi, ordini o progetti, non modificarla: duplicala o
          disattivala, così lo storico resta com&apos;era.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="righe">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="righe">Righe ({righe.length})</TabsTrigger>
          <TabsTrigger value="calcolatore">Calcolatore</TabsTrigger>
          <TabsTrigger value="simulatore">Simulatore multi-durata</TabsTrigger>
          <TabsTrigger value="allegati">Allegati</TabsTrigger>
        </TabsList>

        {/* TAB Righe */}
        <TabsContent value="righe" className="space-y-3 mt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-durata" className="text-sm">
                Durata:
              </Label>
              <Select value={filtroDurata} onValueChange={setFiltroDurata}>
                <SelectTrigger id="filtro-durata" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {tabella.durate_disponibili.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} mesi
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-xs text-muted-foreground">
              {righeFiltrate.length} righe
            </span>
          </div>

          {righeInErrore && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>Non riesco a leggere le righe della tabella.</span>
                <Button size="sm" variant="outline" onClick={() => void rileggiRighe()}>
                  Riprova
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <IntestazioneOrdinabile chiave="importo_erogato" ordine={sortKey} direzione={sortDir} onOrdina={handleSort}>
                      Importo
                    </IntestazioneOrdinabile>
                    <IntestazioneOrdinabile chiave="numero_rate" ordine={sortKey} direzione={sortDir} onOrdina={handleSort}>
                      Rate
                    </IntestazioneOrdinabile>
                    <IntestazioneOrdinabile chiave="importo_rata" ordine={sortKey} direzione={sortDir} onOrdina={handleSort} className="text-right">
                      Rata
                    </IntestazioneOrdinabile>
                    <TableHead className="text-right">Spese incasso</TableHead>
                    <IntestazioneOrdinabile chiave="interessi_cliente" ordine={sortKey} direzione={sortDir} onOrdina={handleSort} className="text-right">
                      Interessi
                    </IntestazioneOrdinabile>
                    <IntestazioneOrdinabile chiave="importo_totale_dovuto" ordine={sortKey} direzione={sortDir} onOrdina={handleSort} className="text-right">
                      Totale dovuto
                    </IntestazioneOrdinabile>
                    <IntestazioneOrdinabile chiave="tan" ordine={sortKey} direzione={sortDir} onOrdina={handleSort} className="text-right">
                      TAN
                    </IntestazioneOrdinabile>
                    <IntestazioneOrdinabile chiave="taeg" ordine={sortKey} direzione={sortDir} onOrdina={handleSort} className="text-right">
                      TAEG
                    </IntestazioneOrdinabile>
                    <TableHead className="text-right">ICC</TableHead>
                    <TableHead className="text-right">Provvigione</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righeFiltrate.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center py-8 text-muted-foreground"
                      >
                        {righeInCaricamento ? "Caricamento righe…" : "Nessuna riga."}
                      </TableCell>
                    </TableRow>
                  )}
                  {righeFiltrate.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        € {formattaEuro(r.importo_erogato)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.numero_rate}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formattaEuro(r.importo_rata, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        € {formattaEuro(r.spese_incasso_rata, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formattaEuro(r.interessi_cliente, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formattaEuro(r.importo_totale_dovuto, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formattaPercentuale(r.tan)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formattaPercentuale(r.taeg)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.icc != null ? formattaPercentuale(r.icc) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        € {formattaEuro(r.provvigione_dealer, 2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB Calcolatore */}
        <TabsContent value="calcolatore" className="space-y-3 mt-3">
          <Card>
            <CardContent className="py-5 space-y-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="font-medium">
                  Calcolatore — {tabella.nome_prodotto}
                </h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="calc-importo">Importo finanziato (€)</Label>
                  <Input
                    id="calc-importo"
                    type="text"
                    inputMode="decimal"
                    placeholder="es. 10000"
                    value={importoCalc}
                    onChange={(e) => setImportoCalc(e.target.value)}
                  />
                  {tabella.importo_min != null && tabella.importo_max != null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Importi in tabella: da € {formattaEuro(tabella.importo_min)} a €{" "}
                      {formattaEuro(tabella.importo_max)}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="calc-rate">Numero rate</Label>
                  <Select value={rateCalc} onValueChange={setRateCalc}>
                    <SelectTrigger id="calc-rate">
                      <SelectValue placeholder="Seleziona durata…" />
                    </SelectTrigger>
                    <SelectContent>
                      {tabella.durate_disponibili.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} rate ({d} mesi)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <CalcolatoreOutput risultato={risultatoCalcolo} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB Simulatore multi-durata */}
        <TabsContent value="simulatore" className="space-y-3 mt-3">
          <Card>
            <CardContent className="py-5 space-y-4">
              <div className="flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-medium">Confronto durate per stesso importo</h3>
                  <p className="text-xs text-muted-foreground">
                    Inserisci un importo e vedi come cambia la rata su tutte le
                    durate disponibili. Utile per presentare al cliente.
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="sim-importo">Importo finanziato (€)</Label>
                <Input
                  id="sim-importo"
                  type="text"
                  inputMode="decimal"
                  placeholder="es. 10000"
                  value={importoCalc}
                  onChange={(e) => setImportoCalc(e.target.value)}
                  className="max-w-xs"
                />
              </div>
              <SimulatoreMultiDurata
                importo={
                  Number.isFinite(
                    Number(importoCalc.replace(/\./g, "").replace(",", "."))
                  )
                    ? Number(importoCalc.replace(/\./g, "").replace(",", "."))
                    : null
                }
                durateDisponibili={tabella.durate_disponibili}
                righe={righe}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB Allegati */}
        <TabsContent value="allegati" className="space-y-3 mt-3">
          <Card>
            <CardContent className="py-5 space-y-3">
              <h3 className="font-medium">Documenti allegati</h3>
              {!tabella.pdf_url && !tabella.csv_url && (
                <p className="text-sm text-muted-foreground">
                  Nessun allegato caricato per questa tabella.
                </p>
              )}
              {isMobile && (tabella.pdf_url || tabella.csv_url) && (
                <p className="text-sm text-muted-foreground">
                  Gli allegati si scaricano dal computer.
                </p>
              )}
              {!isMobile && tabella.pdf_url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDownload(tabella.pdf_url!, tabella.pdf_filename)
                  }
                  className="w-full sm:w-auto"
                >
                  <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                  Scarica il PDF originale
                  {tabella.pdf_filename && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({tabella.pdf_filename})
                    </span>
                  )}
                </Button>
              )}
              {!isMobile && tabella.csv_url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDownload(tabella.csv_url!, tabella.csv_filename)
                  }
                  className="w-full sm:w-auto"
                >
                  <Download className="h-4 w-4 mr-2" aria-hidden="true" />
                  Scarica il file CSV caricato
                </Button>
              )}
              {tabella.note && (
                <div>
                  <p className="text-xs font-medium leading-none">Note interne</p>
                  <p className="text-sm whitespace-pre-wrap mt-1">
                    {tabella.note}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog
        open={confermaDelete}
        onOpenChange={(o) => !o && setConfermaDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la tabella?</AlertDialogTitle>
            <AlertDialogDescription>
              Stai per eliminare «{tabella.nome_prodotto}» con le sue {righe.length} righe, e
              non si torna indietro. Se l&apos;hai già usata in un preventivo o in un
              progetto, disattivala invece di eliminarla: non viene più proposta e lo
              storico resta com&apos;era. Una tabella usata da un progetto fotovoltaico
              non si può eliminare.
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

type FinanceRow = ReturnType<typeof useRighe> extends { data: infer T } ? NonNullable<T> extends Array<infer R> ? R : never : never;

function summarizeRows(rows: FinanceRow[]) {
  if (!rows.length) return null;
  return {
    rataMin: Math.min(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    rataMax: Math.max(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    taegMin: Math.min(...rows.map((r) => r.taeg)),
    taegMax: Math.max(...rows.map((r) => r.taeg)),
  };
}

/**
 * «120 righe · importi da € 5000 a € 30.000 · 24, 36, 48 mesi · rata da € 140,00 a € 900,00 · TAEG 8,50%–12,10%»
 * e, se la tabella ha delle date, «valida dal 01/10/2026 al 15/11/2026». Le parti che mancano si saltano.
 */
function descriviNumeri(
  tabella: {
    righe_count: number;
    importo_min: number | null;
    importo_max: number | null;
    durate_disponibili: number[];
    data_decorrenza: string | null;
    data_scadenza: string | null;
  },
  riepilogo: ReturnType<typeof summarizeRows>,
): string {
  const parti: string[] = [`${tabella.righe_count} ${tabella.righe_count === 1 ? "riga" : "righe"}`];
  if (tabella.importo_min != null && tabella.importo_max != null) {
    parti.push(`importi da € ${formattaEuro(tabella.importo_min)} a € ${formattaEuro(tabella.importo_max)}`);
  }
  if (tabella.durate_disponibili.length > 0) {
    parti.push(`${tabella.durate_disponibili.join(", ")} mesi`);
  }
  if (riepilogo) {
    parti.push(`rata da € ${formattaEuro(riepilogo.rataMin, 2)} a € ${formattaEuro(riepilogo.rataMax, 2)}`);
    parti.push(`TAEG ${formattaPercentuale(riepilogo.taegMin)}–${formattaPercentuale(riepilogo.taegMax)}`);
  }
  if (tabella.data_decorrenza && tabella.data_scadenza) {
    parti.push(`valida dal ${dataItaliana(tabella.data_decorrenza)} al ${dataItaliana(tabella.data_scadenza)}`);
  } else if (tabella.data_decorrenza) {
    parti.push(`valida dal ${dataItaliana(tabella.data_decorrenza)}`);
  } else if (tabella.data_scadenza) {
    parti.push(`valida fino al ${dataItaliana(tabella.data_scadenza)}`);
  }
  return parti.join(" · ");
}

/** Intestazione di una colonna che si può ordinare: un pulsante vero, così si usa anche da tastiera. */
function IntestazioneOrdinabile<K extends string>({
  chiave,
  ordine,
  direzione,
  onOrdina,
  className,
  children,
}: {
  chiave: K;
  ordine: string;
  direzione: "asc" | "desc";
  onOrdina: (chiave: K) => void;
  className?: string;
  children: string;
}) {
  const attiva = ordine === chiave;
  return (
    <TableHead
      className={className}
      aria-sort={attiva ? (direzione === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onOrdina(chiave)}
        className="inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        {attiva &&
          (direzione === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          ))}
      </button>
    </TableHead>
  );
}

/**
 * Cosa dice la pagina sulla validità. Le date non cambiano cosa si propone nei preventivi: conta solo
 * «attiva» (useTabelleFinanziamento.ts, QuoteFinancingPanel.tsx, fotovoltaico/queries.ts). Una tabella
 * scaduta (o non ancora iniziata) ma attiva viene proposta lo stesso, e qui lo si scrive. Le date di una
 * tabella non si possono cambiare da qui: le vie sono disattivarla o caricarne una nuova.
 */
function ValidityAlert({
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
  if (!attiva) {
    return (
      <Alert>
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        <TitoloAvviso>Tabella disattivata</TitoloAvviso>
        <AlertDescription>
          Non viene proposta nei nuovi preventivi. Resta qui per lo storico.
        </AlertDescription>
      </Alert>
    );
  }
  if (stato === "scaduta") {
    return (
      <Alert variant="destructive">
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        <TitoloAvviso>Offerta scaduta</TitoloAvviso>
        <AlertDescription>
          Scaduta il {dataItaliana(scadenza)}. Finché la tabella è attiva viene ancora proposta nei preventivi:
          disattivala, oppure carica la tabella nuova.
        </AlertDescription>
      </Alert>
    );
  }
  if (stato === "futura") {
    return (
      <Alert>
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        <TitoloAvviso>Offerta non ancora iniziata</TitoloAvviso>
        <AlertDescription>
          Vale dal {dataItaliana(decorrenza)}. Finché la tabella è attiva viene già proposta nei preventivi:
          se non vuoi, disattivala e riattivala da quel giorno.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

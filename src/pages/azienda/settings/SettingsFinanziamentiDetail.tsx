/**
 * Vista dettaglio di una tabella finanziaria.
 *
 * Tab interni:
 *   1. Righe — tabella sortable con tutte le 14 colonne (importo, rata, TAN, ecc.)
 *           filtri per durata e range importi.
 *   2. Calcolatore — calcolatore in-place su questa specifica tabella.
 *   3. Allegati — link al PDF originale (se presente) e al CSV importato.
 */

import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
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

export default function SettingsFinanziamentiDetail() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const permissions = usePermissions();
  // 13/7/2026: la pagina rispetta il permesso Impostazioni dedicato (prima solo ruolo admin,
  // e il toggle dato dall'admin non apriva nulla). Modifica ⇒ tutte le azioni; Visualizza ⇒ accesso.
  const isAdmin = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsFinanziamenti;
  const canView = isAdmin || permissions.canViewSettingsFinanziamenti;
  const navigate = useNavigate();

  const { data: tabella, isLoading } = useTabella(id);
  const { data: righe = [] } = useRighe(id);
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

  if (!canView) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <ShieldAlert className="h-12 w-12 text-amber-500" />
          <p className="font-medium">Accesso riservato</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento tabella…
        </CardContent>
      </Card>
    );
  }

  if (!tabella) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <Banknote className="h-12 w-12 mx-auto text-muted-foreground" />
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
      toast.error("Errore download", { description: error.message });
      return;
    }
    if (!data?.signedUrl) {
      toast.error("Impossibile scaricare il file");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = filename ?? "allegato";
    a.target = "_blank";
    a.click();
  };

  const handleDelete = async () => {
    try {
      await deleteTabella.mutateAsync(tabella.id);
      toast.success("Tabella eliminata.");
      navigate("/azienda/impostazioni/finanziamenti");
    } catch (e) {
      toast.error("Errore eliminazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleToggleAttiva = async () => {
    try {
      await toggleAttiva.mutateAsync({
        id: tabella.id,
        attiva: !tabella.attiva,
      });
      toast.success(tabella.attiva ? "Tabella disattivata." : "Tabella attivata.");
    } catch (e) {
      toast.error("Errore", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDuplicate = async () => {
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
      toast.error("Errore duplicazione", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const sortIcon = (key: keyof RowData) => {
    if (sortKey !== key) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 inline ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/azienda/impostazioni/finanziamenti">
              <ArrowLeft className="h-4 w-4 mr-1" />
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
                ` • Cond. ${tabella.codice_condizione}`}
              {tabella.subtariffa_default &&
                ` • ${tabella.subtariffa_default}`}
              {tabella.tan_base != null && ` • TAN base ${tabella.tan_base}%`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={createTabella.isPending || insertRighe.isPending || righe.length === 0}
          >
            <Copy className="h-4 w-4 mr-1" />
            Duplica
          </Button>
          <Button variant="outline" size="sm" onClick={handleToggleAttiva}>
            <Power className="h-4 w-4 mr-1" />
            {tabella.attiva ? "Disattiva" : "Attiva"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfermaDelete(true)}
          >
            <Trash2 className="h-4 w-4 mr-1 text-destructive" />
            Elimina
          </Button>
        </div>
      </div>

      <ValidityAlert decorrenza={tabella.data_decorrenza} scadenza={tabella.data_scadenza} attiva={tabella.attiva} />
      <Alert>
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Condizioni finanziarie versionate</AlertTitle>
        <AlertDescription>
          Se questa tabella e' gia' stata usata in preventivi, ordini o progetti, non modificarla in modo distruttivo:
          duplica la tabella o disattivala per preservare lo storico delle condizioni applicate.
        </AlertDescription>
      </Alert>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Righe" value={`${tabella.righe_count}`} />
        <KpiCard
          label="Importi"
          value={
            tabella.importo_min != null && tabella.importo_max != null
              ? `€ ${formatEur(tabella.importo_min)} – ${formatEur(tabella.importo_max)}`
              : "—"
          }
        />
        <KpiCard
          label="Durate"
          value={
            tabella.durate_disponibili.length > 0
              ? tabella.durate_disponibili.join(", ") + " mesi"
              : "—"
          }
        />
        <KpiCard
          label="Decorrenza"
          value={tabella.data_decorrenza ?? "—"}
        />
      </div>

      {economicSummary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Rata completa" value={`€ ${formatEur(economicSummary.rataMin, 2)} - € ${formatEur(economicSummary.rataMax, 2)}`} />
          <KpiCard label="TAN" value={`${economicSummary.tanMin.toFixed(2)}% - ${economicSummary.tanMax.toFixed(2)}%`} />
          <KpiCard label="TAEG" value={`${economicSummary.taegMin.toFixed(2)}% - ${economicSummary.taegMax.toFixed(2)}%`} />
          <KpiCard label="Provvigione media" value={`€ ${formatEur(economicSummary.provvigioneMedia, 2)}`} />
        </div>
      )}

      <Tabs defaultValue="righe">
        <TabsList>
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

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      onClick={() => handleSort("importo_erogato")}
                      className="cursor-pointer"
                    >
                      Importo {sortIcon("importo_erogato")}
                    </TableHead>
                    <TableHead
                      onClick={() => handleSort("numero_rate")}
                      className="cursor-pointer"
                    >
                      Rate {sortIcon("numero_rate")}
                    </TableHead>
                    <TableHead
                      onClick={() => handleSort("importo_rata")}
                      className="cursor-pointer text-right"
                    >
                      Rata {sortIcon("importo_rata")}
                    </TableHead>
                    <TableHead className="text-right">Sp. incasso</TableHead>
                    <TableHead
                      onClick={() => handleSort("interessi_cliente")}
                      className="cursor-pointer text-right"
                    >
                      Interessi {sortIcon("interessi_cliente")}
                    </TableHead>
                    <TableHead
                      onClick={() => handleSort("importo_totale_dovuto")}
                      className="cursor-pointer text-right"
                    >
                      Tot. dovuto {sortIcon("importo_totale_dovuto")}
                    </TableHead>
                    <TableHead
                      onClick={() => handleSort("tan")}
                      className="cursor-pointer text-right"
                    >
                      TAN {sortIcon("tan")}
                    </TableHead>
                    <TableHead
                      onClick={() => handleSort("taeg")}
                      className="cursor-pointer text-right"
                    >
                      TAEG {sortIcon("taeg")}
                    </TableHead>
                    <TableHead className="text-right">ICC</TableHead>
                    <TableHead className="text-right">Provv.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {righeFiltrate.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="text-center py-8 text-muted-foreground"
                      >
                        Nessuna riga.
                      </TableCell>
                    </TableRow>
                  )}
                  {righeFiltrate.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums whitespace-nowrap">
                        € {formatEur(r.importo_erogato)}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {r.numero_rate}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formatEur(r.importo_rata, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        € {formatEur(r.spese_incasso_rata, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formatEur(r.interessi_cliente, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        € {formatEur(r.importo_totale_dovuto, 2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.tan.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.taeg.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.icc != null ? `${r.icc.toFixed(2)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        € {formatEur(r.provvigione_dealer, 2)}
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
                <Calculator className="h-5 w-5 text-primary" />
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
                      Range tabella: € {formatEur(tabella.importo_min)} – €{" "}
                      {formatEur(tabella.importo_max)}
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
                <Calculator className="h-5 w-5 text-primary" />
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
              {tabella.pdf_url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDownload(tabella.pdf_url!, tabella.pdf_filename)
                  }
                  className="w-full sm:w-auto"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Scarica PDF originale
                  {tabella.pdf_filename && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({tabella.pdf_filename})
                    </span>
                  )}
                </Button>
              )}
              {tabella.csv_url && (
                <Button
                  variant="outline"
                  onClick={() =>
                    handleDownload(tabella.csv_url!, tabella.csv_filename)
                  }
                  className="w-full sm:w-auto"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Scarica CSV importato
                </Button>
              )}
              {tabella.note && (
                <div>
                  <Label className="text-xs">Note interne</Label>
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
              Tutte le {righe.length} righe verranno eliminate. Se la tabella è
              già usata in progetti o preventivi, l&apos;eliminazione verrà
              bloccata: disattivala per impedire nuovi utilizzi senza perdere lo
              storico.
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

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold tabular-nums mt-0.5">{value}</p>
      </CardContent>
    </Card>
  );
}

type FinanceRow = ReturnType<typeof useRighe> extends { data: infer T } ? NonNullable<T> extends Array<infer R> ? R : never : never;

function summarizeRows(rows: FinanceRow[]) {
  if (!rows.length) return null;
  return {
    rataMin: Math.min(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    rataMax: Math.max(...rows.map((r) => r.importo_rata + r.spese_incasso_rata)),
    tanMin: Math.min(...rows.map((r) => r.tan)),
    tanMax: Math.max(...rows.map((r) => r.tan)),
    taegMin: Math.min(...rows.map((r) => r.taeg)),
    taegMax: Math.max(...rows.map((r) => r.taeg)),
    provvigioneMedia: rows.reduce((sum, r) => sum + r.provvigione_dealer, 0) / rows.length,
  };
}

function formatEur(n: number, frac = 0): string {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
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

function ValidityAlert({
  decorrenza,
  scadenza,
  attiva,
}: {
  decorrenza: string | null;
  scadenza: string | null;
  attiva: boolean;
}) {
  const state = getValidityState(decorrenza, scadenza);
  if (!attiva) {
    return (
      <Alert>
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>Tabella disattivata</AlertTitle>
        <AlertDescription>
          Resta consultabile per lo storico, ma non dovrebbe essere proposta nei nuovi preventivi o progetti.
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "expired") {
    return (
      <Alert variant="destructive">
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>Offerta scaduta</AlertTitle>
        <AlertDescription>
          La data di scadenza è {scadenza}. Verifica le condizioni prima di usarla in nuove proposte commerciali.
        </AlertDescription>
      </Alert>
    );
  }
  if (state === "future") {
    return (
      <Alert>
        <CalendarClock className="h-4 w-4" />
        <AlertTitle>Offerta non ancora decorso</AlertTitle>
        <AlertDescription>
          La tabella decorre dal {decorrenza}. Fino ad allora usala solo per simulazioni interne.
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

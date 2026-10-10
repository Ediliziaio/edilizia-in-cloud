/**
 * Calcolatore generico: l'utente sceglie tabella + importo + n° rate e vede
 * la rata calcolata, TAN, TAEG, ICC, provvigione.
 *
 * Pensato per quando il venditore deve simulare al volo "quanto paga il
 * cliente per X mila euro a Y rate?" su una qualsiasi delle tabelle caricate.
 *
 * Non salva niente. L'unico comando che scrive è, a elenco vuoto, il rimando a «Carica una tabella»:
 * per chi può solo consultare è spento, con la frase che spiega perché.
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Calculator,
  Plus,
  Banknote,
} from "lucide-react";
import { useTabelle, useRighe } from "@/lib/finanziamenti/queries";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";
import { CalcolatoreOutput } from "./_finanziamenti/CalcolatoreOutput";
import { SimulatoreMultiDurata } from "./_finanziamenti/SimulatoreMultiDurata";
import { erroreComprensibile, formattaEuro, proprietaComandoSpento, useAccessoFinanziamenti } from "./_finanziamenti/comuni";
import { AccessoNegato, AvvisoSolaLettura } from "./_finanziamenti/pezzi";

export default function SettingsFinanziamentiCalcolatore() {
  const { puoVedere, puoModificare } = useAccessoFinanziamenti();
  const { data: tabelle = [], isLoading: isLoadingTabelle, isError: isErrorTabelle, error: erroreTabelle, refetch } = useTabelle();
  const tabelleAttive = useMemo(
    () => tabelle.filter((t) => t.attiva),
    [tabelle]
  );

  const [tabellaId, setTabellaId] = useState<string>("");
  const [importo, setImporto] = useState<string>("");
  const [rate, setRate] = useState<string>("");

  const { data: righe = [] } = useRighe(tabellaId || undefined);
  const tabellaCorrente = tabelleAttive.find((t) => t.id === tabellaId);

  const risultato: RisultatoCalcolo | null = useMemo(() => {
    if (!tabellaId) return null;
    const importoNum = Number(importo.replace(/\./g, "").replace(",", "."));
    const rateNum = Number(rate);
    if (
      !Number.isFinite(importoNum) ||
      importoNum <= 0 ||
      !Number.isFinite(rateNum) ||
      rateNum <= 0
    ) {
      return null;
    }
    return calcolaFinanziamento({
      importo: importoNum,
      numero_rate: rateNum,
      righe,
    });
  }, [tabellaId, importo, rate, righe]);

  if (!puoVedere) return <AccessoNegato />;

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/azienda/impostazioni/finanziamenti">
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Torna alle tabelle
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">Calcolatore finanziamento</h2>
          </div>

          {isLoadingTabelle && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Caricamento…
            </p>
          )}

          {!isLoadingTabelle && isErrorTabelle && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <strong className="block font-medium">Non riesco a leggere le tabelle.</strong>
                  {erroreComprensibile(erroreTabelle, "Riprova tra poco.")}
                </span>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  Riprova
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {!isLoadingTabelle && !isErrorTabelle && tabelleAttive.length === 0 && (
            <div className="rounded-md border bg-muted/30 p-6 text-center space-y-3">
              <Banknote className="h-10 w-10 mx-auto text-muted-foreground" aria-hidden="true" />
              <p className="text-sm">
                Non hai ancora caricato nessuna tabella attiva. Carica almeno
                una tabella per usare il calcolatore.
              </p>
              {puoModificare ? (
                <Button asChild>
                  <Link to="/azienda/impostazioni/finanziamenti/nuova">
                    <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                    Carica una tabella
                  </Link>
                </Button>
              ) : (
                <>
                  <Button disabled {...proprietaComandoSpento(false)}>
                    <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
                    Carica una tabella
                  </Button>
                  <div className="text-left">
                    <AvvisoSolaLettura />
                  </div>
                </>
              )}
            </div>
          )}

          {!isLoadingTabelle && !isErrorTabelle && tabelleAttive.length > 0 && (
            <>
              <div>
                <Label htmlFor="tab-select">Tabella finanziamento</Label>
                <Select value={tabellaId} onValueChange={setTabellaId}>
                  <SelectTrigger id="tab-select">
                    <SelectValue placeholder="Seleziona tabella…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabelleAttive.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome_prodotto}
                        {t.finanziaria_nome && ` — ${t.finanziaria_nome}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="imp">Importo finanziato (€)</Label>
                  <Input
                    id="imp"
                    type="text"
                    inputMode="decimal"
                    placeholder="es. 10000"
                    value={importo}
                    onChange={(e) => setImporto(e.target.value)}
                    disabled={!tabellaId}
                  />
                  {tabellaCorrente?.importo_min != null &&
                    tabellaCorrente?.importo_max != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Importi in tabella: da € {formattaEuro(tabellaCorrente.importo_min)} a €{" "}
                        {formattaEuro(tabellaCorrente.importo_max)}
                      </p>
                    )}
                </div>
                <div>
                  <Label htmlFor="rt">Numero rate</Label>
                  <Select
                    value={rate}
                    onValueChange={setRate}
                    disabled={!tabellaId}
                  >
                    <SelectTrigger id="rt">
                      <SelectValue placeholder="Seleziona durata…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tabellaCorrente?.durate_disponibili ?? []).map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} rate ({d} mesi)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <CalcolatoreOutput risultato={risultato} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Simulatore multi-durata: confronto su tutte le durate */}
      {tabellaCorrente && (
        <Card>
          <CardContent className="py-5 space-y-3">
            <h3 className="font-medium">
              Confronto su tutte le durate disponibili
            </h3>
            <p className="text-xs text-muted-foreground">
              Stesso importo, durate diverse. Le durate con rata o TAEG migliori
              sono evidenziate.
            </p>
            <SimulatoreMultiDurata
              importo={
                Number.isFinite(
                  Number(importo.replace(/\./g, "").replace(",", "."))
                )
                  ? Number(importo.replace(/\./g, "").replace(",", "."))
                  : null
              }
              durateDisponibili={tabellaCorrente.durate_disponibili}
              righe={righe}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Calcolatore generico: l'utente sceglie tabella + importo + n° rate e vede
 * la rata calcolata, TAN, TAEG, ICC, provvigione dealer.
 *
 * Pensato per quando il venditore deve simulare al volo "quanto paga il
 * cliente per X mila euro a Y rate?" su una qualsiasi delle tabelle caricate.
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
  ShieldAlert,
  Banknote,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTabelle, useRighe } from "@/lib/finanziamenti/queries";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";
import { CalcolatoreOutput } from "./_finanziamenti/CalcolatoreOutput";
import { SimulatoreMultiDurata } from "./_finanziamenti/SimulatoreMultiDurata";

export default function SettingsFinanziamentiCalcolatore() {
  const { role } = useAuth();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const { data: tabelle = [], isLoading: isLoadingTabelle, isError: isErrorTabelle } = useTabelle();
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

  if (!isAdmin) {
    return (
      <Card className="max-w-xl mx-auto mt-8">
        <CardContent className="py-10 flex flex-col items-center gap-4 text-center">
          <ShieldAlert className="h-12 w-12 text-amber-500" />
          <p className="font-medium">Accesso riservato</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/azienda/impostazioni/finanziamenti">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Torna alle tabelle
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="py-5 space-y-4">
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            <h2 className="font-semibold">Calcolatore finanziamento</h2>
          </div>

          {isLoadingTabelle && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Caricamento…
            </p>
          )}

          {!isLoadingTabelle && isErrorTabelle && (
            <Alert variant="destructive">
              <AlertDescription>
                Errore nel caricamento delle tabelle. Ricarica la pagina.
              </AlertDescription>
            </Alert>
          )}

          {!isLoadingTabelle && !isErrorTabelle && tabelleAttive.length === 0 && (
            <div className="rounded-md border bg-muted/30 p-6 text-center space-y-3">
              <Banknote className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm">
                Non hai ancora caricato nessuna tabella attiva. Carica almeno
                una tabella per usare il calcolatore.
              </p>
              <Button asChild>
                <Link to="/azienda/impostazioni/finanziamenti/nuova">
                  <Plus className="h-4 w-4 mr-1" />
                  Carica una tabella
                </Link>
              </Button>
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
                        Range:{" "}
                        € {tabellaCorrente.importo_min.toLocaleString("it-IT")}
                        {" – €"}
                        {tabellaCorrente.importo_max.toLocaleString("it-IT")}
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

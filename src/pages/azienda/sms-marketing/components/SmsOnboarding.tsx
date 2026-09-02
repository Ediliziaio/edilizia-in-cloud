/**
 * Wizard onboarding SMS Telnyx — mostrato al primo accesso.
 * Step 1: Benvenuto con prezzo €30/mese
 * Step 2: Cerca prefisso/città
 * Step 3: Selezione numero da lista
 * Step 4: Conferma acquisto
 * Step 5: Successo con numero attivato
 */
import { useState } from "react";
import { CheckCircle2, Phone, Search, Loader2, MapPin, ChevronRight, ChevronLeft, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useTelnyxSetup } from "@/hooks/useTelnyxSetup";
import type { TelnyxNumeroDisponibile } from "@/types/sms-marketing";

type OnboardingStep = 1 | 2 | 3 | 4 | 5;

interface SmsOnboardingProps {
  onCompleted: () => void;
}

export function SmsOnboarding({ onCompleted }: SmsOnboardingProps) {
  const { cercaNumeri, isCercando, acquistaNumero, isAcquistando } = useTelnyxSetup();

  const [step, setStep] = useState<OnboardingStep>(1);
  const [prefisso, setPrefisso] = useState("");
  const [numeriDisponibili, setNumeriDisponibili] = useState<TelnyxNumeroDisponibile[]>([]);
  const [numeroSelezionato, setNumeroSelezionato] = useState<TelnyxNumeroDisponibile | null>(null);
  const [numeroAttivato, setNumeroAttivato] = useState<string | null>(null);
  const [erroreRicerca, setErroreRicerca] = useState<string | null>(null);

  const handleCercaNumeri = async () => {
    if (!prefisso.trim()) {
      toast.error("Inserisci un prefisso area (es. 02, 06)");
      return;
    }
    setErroreRicerca(null);
    try {
      const numeri = await cercaNumeri({ prefisso_area: prefisso.trim() });
      if (numeri.length === 0) {
        setErroreRicerca(`Nessun numero disponibile per il prefisso ${prefisso}. Prova con un altro prefisso (es. 02, 06, 011).`);
        return;
      }
      setNumeriDisponibili(numeri);
      setStep(3);
    } catch {
      setErroreRicerca("Errore nella ricerca. Riprova.");
    }
  };

  const handleAcquistaNumero = async () => {
    if (!numeroSelezionato) return;
    try {
      const res = await acquistaNumero(numeroSelezionato.numero_e164);
      setNumeroAttivato(res.numero_display);
      setStep(5);
    } catch {
      // errore gestito dal hook
    }
  };

  const handleCopiaNumero = () => {
    if (numeroAttivato) {
      navigator.clipboard.writeText(numeroAttivato);
      toast.success("Numero copiato negli appunti");
    }
  };

  const progressPercent = ((step - 1) / 4) * 100;

  return (
    <div className="max-w-lg mx-auto space-y-6 py-4">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Configurazione numero SMS</span>
          <span>Step {step} di 5</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step 1: Benvenuto */}
      {step === 1 && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Benvenuto nel modulo SMS</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Invia campagne SMS ai tuoi clienti dal tuo numero italiano dedicato.
              </p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2">
              <p className="text-sm font-medium">Include:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Numero italiano dedicato (+39)</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Campagne SMS illimitate</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Report consegna in tempo reale</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Gestione opt-out automatica (GDPR)</li>
              </ul>
            </div>
            <div className="border rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">30 €<span className="text-sm font-normal text-muted-foreground">/mese</span></p>
              <p className="text-xs text-muted-foreground">Include il numero — SMS addebitati a consumo</p>
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>
              Inizia la configurazione <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Scegli prefisso */}
      {step === 2 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Scegli il tuo numero</h2>
              <p className="text-muted-foreground text-sm mt-1">
                Inserisci il prefisso della zona geografica che preferisci.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prefisso">Prefisso area</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="prefisso"
                    value={prefisso}
                    onChange={(e) => setPrefisso(e.target.value)}
                    placeholder="Es: 02, 06, 011"
                    className="pl-9"
                    onKeyDown={(e) => e.key === "Enter" && handleCercaNumeri()}
                  />
                </div>
                <Button onClick={handleCercaNumeri} disabled={isCercando}>
                  {isCercando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {erroreRicerca && (
                <p className="text-sm text-destructive">{erroreRicerca}</p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              {[["02", "Milano"], ["06", "Roma"], ["011", "Torino"], ["051", "Bologna"], ["055", "Firenze"], ["081", "Napoli"]].map(([pre, citta]) => (
                <button
                  key={pre}
                  onClick={() => { setPrefisso(pre); }}
                  className="border rounded p-2 hover:bg-muted transition-colors text-left"
                >
                  <span className="font-medium text-foreground">{pre}</span> — {citta}
                </button>
              ))}
            </div>
            {isCercando && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Indietro
              </Button>
              <Button className="flex-1" onClick={handleCercaNumeri} disabled={isCercando || !prefisso.trim()}>
                {isCercando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Cerco...</> : <>Cerca numeri <ChevronRight className="ml-1 h-4 w-4" /></>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Selezione numero */}
      {step === 3 && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Numeri disponibili</h2>
              <p className="text-muted-foreground text-sm mt-1">Scegli il numero che preferisci</p>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {numeriDisponibili.map((n) => (
                <button
                  key={n.numero_e164}
                  onClick={() => setNumeroSelezionato(n)}
                  className={`w-full rounded-lg border border-slate-300 bg-white p-3 text-left shadow-sm transition-all hover:border-primary/60 hover:shadow ${
                    numeroSelezionato?.numero_e164 === n.numero_e164 ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">{n.numero_display}</span>
                    <div className="flex gap-1">
                      {n.features.includes("sms") && <Badge variant="secondary" className="text-[10px]">SMS</Badge>}
                      {n.citta && <Badge variant="outline" className="text-[10px]">{n.citta}</Badge>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Cambia prefisso
              </Button>
              <Button
                className="flex-1"
                disabled={!numeroSelezionato}
                onClick={() => setStep(4)}
              >
                Scegli questo numero <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Conferma */}
      {step === 4 && numeroSelezionato && (
        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Conferma attivazione</h2>
              <p className="text-muted-foreground text-sm mt-1">Verifica i dettagli prima di procedere</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Numero scelto</span>
                <span className="font-mono font-medium">{numeroSelezionato.numero_display}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Area</span>
                <span>{numeroSelezionato.citta ?? `Prefisso ${numeroSelezionato.prefisso_area}`}</span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="text-sm text-muted-foreground">Canone mensile</span>
                <span className="font-bold">30,00 €/mese</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Il costo del numero è incluso nel tuo abbonamento. I crediti SMS sono separati e si acquistano in pacchetti.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Cambia numero
              </Button>
              <Button className="flex-1" onClick={handleAcquistaNumero} disabled={isAcquistando}>
                {isAcquistando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Attivazione...</> : "Attiva numero"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Completato */}
      {step === 5 && numeroAttivato && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="mx-auto w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-700">Numero attivato!</h2>
              <p className="text-muted-foreground text-sm mt-1">Il tuo numero SMS è pronto per essere usato</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="text-sm text-muted-foreground mb-1">Il tuo numero SMS</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl font-mono font-bold">{numeroAttivato}</span>
                <button onClick={handleCopiaNumero} className="text-muted-foreground hover:text-foreground">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ricarica il wallet SMS per iniziare a inviare campagne.
            </p>
            <Button className="w-full" onClick={onCompleted}>
              Vai alla dashboard SMS <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * «Valori del costo» — mensilità, oneri e ore produttive per tipo di dipendente.
 * Partono dai valori dell'edilizia; il titolare li cambia, gli altri li vedono.
 * Valgono per i rapportini approvati da qui in avanti: lo storico non si ricalcola.
 */
import { useState } from "react";
import { Calculator } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useParametriCostoPersonale, useSalvaParametriCosto } from "@/hooks/useParametriCostoPersonale";
import { costoOrarioDipendente } from "@/lib/costoOrarioDipendente";
import {
  ETICHETTA_PROFILO, PRESET_EDILIZIA, PROFILI_COSTO, oneriPercento,
  type ParametriCosto, type ProfiloCosto,
} from "@/lib/costoPersonale";
import { formatCurrency } from "@/lib/formatters";
import { messaggioErrore } from "@/lib/campo/messaggioErrore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const CAMPI: { chiave: keyof ParametriCosto; etichetta: string; aiuto: string; unita: string; min: number; max: number }[] = [
  { chiave: "mensilita", etichetta: "Mensilità", aiuto: "12 per l'operaio edile (13ª e ferie le paga la Cassa Edile), 14 per l'impiegato", unita: "", min: 12, max: 16 },
  { chiave: "inps", etichetta: "INPS a carico ditta", aiuto: "Se sulla scheda della persona c'è un'aliquota sua, vale quella", unita: "%", min: 0, max: 60 },
  { chiave: "inail", etichetta: "INAIL", aiuto: "Dipende dalla voce di tariffa: la trovi nell'autoliquidazione", unita: "%", min: 0, max: 30 },
  { chiave: "cassa_edile", etichetta: "Cassa Edile", aiuto: "Accantonamento ferie e gratifica (18,5%) più contributi", unita: "%", min: 0, max: 40 },
  { chiave: "tfr", etichetta: "TFR", aiuto: "Una mensilità all'anno: 7,41%", unita: "%", min: 0, max: 15 },
  { chiave: "altri", etichetta: "Altri costi", aiuto: "Fondi, DPI, visite mediche, formazione", unita: "%", min: 0, max: 50 },
  { chiave: "ore_produttive", etichetta: "Ore produttive", aiuto: "Parte delle ore pagate lavorata davvero (senza pioggia, malattia, corsi)", unita: "%", min: 50, max: 100 },
];

const ESEMPIO = { gross_salary: 2000, monthly_hours: 173 };

function uguali(a: ParametriCosto, b: ParametriCosto) {
  return CAMPI.every(({ chiave }) => a[chiave] === b[chiave]);
}

export function ValoriCostoPersonale() {
  const { role } = useAuth();
  const puoModificare = role === "company_admin" || role === "super_admin";
  const { data: parametri } = useParametriCostoPersonale();
  const salva = useSalvaParametriCosto();
  const [aperto, setAperto] = useState(false);
  const [profilo, setProfilo] = useState<ProfiloCosto>("operaio");
  const salvati = parametri?.[profilo] ?? PRESET_EDILIZIA[profilo];
  const [bozza, setBozza] = useState<Record<keyof ParametriCosto, string>>(() => testo(salvati));

  // Si riparte dai valori salvati quando si cambia tipo, si riapre o cambiano davvero:
  // una lettura che riporta gli stessi valori non cancella quello che si sta scrivendo.
  const chiave = `${profilo}|${aperto}|${JSON.stringify(salvati)}`;
  const [chiaveBozza, setChiaveBozza] = useState(chiave);
  if (chiave !== chiaveBozza) {
    setChiaveBozza(chiave);
    setBozza(testo(salvati));
  }

  const valori = numeri(bozza);
  const valido = !!valori && CAMPI.every(({ chiave, min, max }) => valori[chiave] >= min && valori[chiave] <= max);
  const modificato = !!valori && !uguali(valori, salvati);
  const personalizzato = !!parametri?.[profilo];
  const esempio = valido && valori
    ? costoOrarioDipendente({ ...ESEMPIO, profilo_costo: profilo }, { [profilo]: valori })
    : null;

  const conferma = (nuovi: ParametriCosto | null, messaggio: string) =>
    salva.mutate({ profilo, valori: nuovi }, {
      onSuccess: () => toast.success(messaggio),
      onError: (e) => toast.error(messaggioErrore(e, "Non sono riuscito a salvare. Riprova.")),
    });

  return (
    <Dialog open={aperto} onOpenChange={setAperto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Valori del costo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Quanto costa davvero un’ora</DialogTitle>
          <DialogDescription>
            Dallo stipendio lordo al costo per l’azienda. Partono dai valori dell’edilizia:
            controllali col consulente del lavoro. Valgono per i rapportini approvati da adesso.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Tipo di dipendente">
          {PROFILI_COSTO.map((k) => (
            <button
              key={k} type="button" role="tab" aria-selected={profilo === k}
              onClick={() => setProfilo(k)}
              className={cn(
                "min-h-10 rounded-lg text-sm font-medium transition-colors",
                profilo === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ETICHETTA_PROFILO[k]}
              {parametri?.[k] && <span className="sr-only"> (valori dell’azienda)</span>}
              {parametri?.[k] && <span aria-hidden="true" className="ml-1 text-primary">•</span>}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {CAMPI.map(({ chiave, etichetta, aiuto, unita, min, max }) => {
            const id = `costo-${chiave}`;
            const n = Number(bozza[chiave].replace(",", "."));
            const fuori = bozza[chiave] !== "" && (!Number.isFinite(n) || n < min || n > max);
            return (
              <div key={chiave} className="grid grid-cols-[1fr_7.5rem] items-center gap-3">
                <div className="text-sm">
                  <label htmlFor={id} className="font-medium">{etichetta}</label>
                  <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">{aiuto}</p>
                </div>
                <div className="relative">
                  <Input
                    id={id} inputMode="decimal" aria-describedby={`${id}-aiuto`}
                    value={bozza[chiave]} disabled={!puoModificare}
                    onChange={(e) => setBozza((b) => ({ ...b, [chiave]: e.target.value }))}
                    aria-invalid={fuori || undefined}
                    className={cn("pr-7 text-right tabular-nums", fuori && "border-destructive")}
                  />
                  {unita && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{unita}</span>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border bg-muted/40 p-3 text-sm" aria-live="polite">
          {esempio != null && valori ? (
            <>
              <p>
                Esempio: {formatCurrency(ESEMPIO.gross_salary)} lordi al mese, {ESEMPIO.monthly_hours} ore →{" "}
                <strong className="tabular-nums">{formatCurrency(esempio)}/h</strong>
              </p>
              <p className="text-xs text-muted-foreground">
                Oneri {oneriPercento(valori).toLocaleString("it-IT")}% · {valori.mensilita} mensilità · {valori.ore_produttive}% di ore produttive
              </p>
            </>
          ) : (
            <p className="text-destructive">Controlla i valori segnati in rosso.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {puoModificare ? (
            <>
              <Button
                variant="ghost" disabled={!personalizzato || salva.isPending}
                onClick={() => conferma(null, `${ETICHETTA_PROFILO[profilo]}: tornati i valori dell’edilizia`)}
              >
                Torna ai valori edili
              </Button>
              <Button
                disabled={!valido || !modificato || salva.isPending}
                onClick={() => valori && conferma(valori, `${ETICHETTA_PROFILO[profilo]}: valori salvati`)}
              >
                {salva.isPending ? "Salvo…" : "Salva"}
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Solo il titolare può cambiare questi valori.</p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function testo(p: ParametriCosto): Record<keyof ParametriCosto, string> {
  return Object.fromEntries(CAMPI.map(({ chiave }) => [chiave, String(p[chiave]).replace(".", ",")])) as Record<keyof ParametriCosto, string>;
}

function numeri(b: Record<keyof ParametriCosto, string>): ParametriCosto | null {
  const out = {} as ParametriCosto;
  for (const { chiave } of CAMPI) {
    const n = Number(b[chiave].replace(",", "."));
    if (b[chiave].trim() === "" || !Number.isFinite(n)) return null;
    out[chiave] = n;
  }
  return out;
}

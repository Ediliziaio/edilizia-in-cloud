/**
 * DisponibilitaOperatore — l'interruttore "passatemi pure le chiamate".
 *
 * L'assistente vocale trasferisce solo a chi è dichiarato libero adesso. Se
 * non c'è nessuno non promette il passaggio: propone un appuntamento e lascia
 * la scheda all'ufficio. Quindi questo interruttore decide, molto
 * concretamente, se un cliente caldo parla con una persona o riattacca.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Headphones, Circle } from "lucide-react";
import { toast } from "sonner";
import { useOperatorePresenza } from "@/hooks/useOperatorePresenza";

export function DisponibilitaOperatore() {
  const { disponibile, telefono, occupatoFinoA, caricamento, salvataggio, impostaDisponibilita, colleghi } =
    useOperatorePresenza();
  // `null` = l'utente non ha ancora toccato il campo, quindi si mostra il
  // numero salvato. Derivare invece di sincronizzare con un effetto: il
  // compiler React vieta setState nel corpo di un useEffect.
  const [bozzaNumero, setBozzaNumero] = useState<string | null>(null);
  const numero = bozzaNumero ?? telefono ?? "";
  const toccato = bozzaNumero !== null;

  // Tick al minuto: "in chiamata" scade da solo invece di restare acceso fino
  // al prossimo refetch (e Date.now() esce dal render, che il compiler vieta).
  const [adesso, setAdesso] = useState(() => new Date().getTime());
  useEffect(() => {
    const id = setInterval(() => setAdesso(new Date().getTime()), 30_000);
    return () => clearInterval(id);
  }, []);

  const numeroValido = /^\+\d{8,15}$/.test(numero.replace(/\s/g, ""));
  const occupato = !!occupatoFinoA && new Date(occupatoFinoA).getTime() > adesso;

  const cambia = async (acceso: boolean) => {
    if (acceso && !numeroValido) {
      toast.error("Serve il tuo numero in formato internazionale, per esempio +39 340 1234567.");
      return;
    }
    try {
      await impostaDisponibilita(acceso, acceso ? numero.replace(/\s/g, "") : undefined);
      setBozzaNumero(null);
      toast.success(acceso ? "Sei disponibile: le chiamate qualificate arrivano a te." : "Non ricevi più chiamate passate dall'assistente.");
    } catch (e) {
      toast.error((e as Error).message || "Non sono riuscito a salvare la disponibilità.");
    }
  };

  const liberi = colleghi.filter((c) => c.libero);

  return (
    // Telefono: interruttore, numero e chi risponde; senza le spiegazioni.
    <Card>
      <CardHeader className="pb-2 max-md:p-3 max-md:pb-1">
        <CardTitle className="flex items-center gap-2 text-base max-md:text-sm">
          <Headphones className="h-4 w-4 max-md:hidden" /> Chiamate dall'assistente
        </CardTitle>
        <p className="text-xs text-muted-foreground max-md:hidden">
          Quando sei disponibile, l'assistente vocale ti passa i clienti che ha già qualificato. La scheda con quello
          che hanno detto compare qui mentre il telefono squilla.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 max-md:space-y-3 max-md:p-3 max-md:pt-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium max-md:text-[13px]">
              {caricamento ? "…" : disponibile ? (occupato ? "Disponibile — chiamata in corso" : "Disponibile") : "Non disponibile"}
            </p>
            <p className="text-xs text-muted-foreground max-md:hidden">
              {disponibile
                ? "Resta acceso finché tieni aperta l'app."
                : "Acceso, ricevi le chiamate passate dall'assistente."}
            </p>
          </div>
          <Switch
            checked={disponibile}
            disabled={salvataggio || caricamento}
            onCheckedChange={cambia}
            aria-label="Disponibile a ricevere chiamate"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-xs font-medium" htmlFor="numero-operatore-presenza">
            Il tuo numero
          </label>
          <div className="flex gap-2">
            <Input
              id="numero-operatore-presenza"
              value={numero}
              onChange={(e) => setBozzaNumero(e.target.value)}
              placeholder="+39 340 1234567"
              inputMode="tel"
              className="max-w-xs max-md:max-w-none"
            />
            {toccato && (
              <Button size="sm" variant="outline" disabled={!numeroValido || salvataggio} onClick={() => cambia(disponibile)}>
                Salva
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-md:hidden">È il telefono su cui squilla davvero. In formato internazionale.</p>
        </div>

        <div className="border-t pt-3">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Chi può rispondere adesso
          </p>
          {colleghi.length === 0 ? (
            <p className="text-sm text-muted-foreground max-md:text-[13px]">
              Nessuno è disponibile.
              <span className="max-md:hidden">
                {" "}L'assistente non promette il passaggio: propone un appuntamento e lascia la scheda all'ufficio.
              </span>
            </p>
          ) : (
            <ul className="space-y-1">
              {colleghi.map((c) => (
                <li key={c.user_id} className="flex items-center gap-2 text-sm">
                  <Circle
                    className={`h-2 w-2 shrink-0 ${
                      c.libero ? "fill-emerald-500 text-emerald-500" : c.occupato ? "fill-amber-500 text-amber-500" : "fill-muted-foreground text-muted-foreground"
                    }`}
                  />
                  <span className="min-w-0 truncate">{c.nome}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {c.libero ? "libero" : c.occupato ? "in chiamata" : !c.vivo ? "app chiusa" : "senza numero"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {colleghi.length > 0 && liberi.length === 0 && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-500">
              Nessuno è raggiungibile in questo momento, anche se qualcuno risulta disponibile.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

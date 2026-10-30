// src/components/orders/generali/unita/CambioStato.tsx
// Vendere un'unità (piano, flusso F5): quattro bottoni con gli stati; toccandone uno l'app
// chiede solo quello che serve a quello stato (acquirente, data, prezzo, caparra o saldo).
// Da telefono il prezzo non si cambia: si conferma quello che c'è, il resto dal computer.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScegliCliente } from "@/components/orders/generali/ScegliCliente";
import { STILE_STATO, euro, inCampo, leggiCampo, oggi } from "@/components/orders/generali/unita/aspetto";
import { messaggioGenerale } from "@/hooks/useCommesseGenerali";
import { useCambiaStatoUnita } from "@/hooks/useGeneraleUnita";
import {
  NOMI_STATO, STATI_VENDITA, bloccoCambioStato, erroriCambioStato, prezzoProposto, requisitiStato,
  type PermessiUnita, type StatoVendita, type UnitaGenerale,
} from "@/lib/orders/generali/unita";
import { pagamentiUnita } from "@/lib/orders/generali/unitaConti";
import { cn } from "@/lib/utils";

interface Props {
  generaleId: string;
  unita: UnitaGenerale;
  permessi: PermessiUnita;
  telefono: boolean;
}

const VERBO: Record<StatoVendita, string> = {
  libera: "Rimetti in vendita",
  prenotata: "Segna prenotata",
  compromesso: "Segna il compromesso",
  rogitata: "Segna il rogito",
};

export function CambioStato({ generaleId, unita: u, permessi, telefono }: Props) {
  const [verso, setVerso] = useState<StatoVendita | null>(null);
  const puo = permessi.modifica && !u.divisaIl;
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Stato di vendita" className="grid grid-cols-4 gap-1">
        {STATI_VENDITA.map((s) => {
          const attuale = u.stato === s;
          const scelto = verso === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={attuale}
              disabled={!puo || attuale}
              onClick={() => setVerso(scelto ? null : s)}
              className={cn(
                "tap-compact rounded-md border px-1 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                attuale ? STILE_STATO[s].scelto : scelto ? "border-foreground bg-muted" : "text-muted-foreground hover:bg-muted/60",
                !puo && !attuale && "opacity-50",
              )}
            >
              {NOMI_STATO[s].una}
            </button>
          );
        })}
      </div>
      {verso && verso !== u.stato && (
        // Il modulo nasce a ogni scelta: si riparte dai valori dell'unità.
        <ModuloStato key={verso} generaleId={generaleId} u={u} verso={verso} permessi={permessi} telefono={telefono} onFatto={() => setVerso(null)} />
      )}
    </div>
  );
}

function ModuloStato({ generaleId, u, verso, permessi, telefono, onFatto }: {
  generaleId: string; u: UnitaGenerale; verso: StatoVendita; permessi: PermessiUnita; telefono: boolean; onFatto: () => void;
}) {
  const cambia = useCambiaStatoUnita(generaleId);
  const r = requisitiStato(verso);
  const proposto = prezzoProposto(u, verso);
  const dataEsistente = verso === "prenotata" ? u.dataPrenotazione : verso === "compromesso" ? u.dataCompromesso : verso === "rogitata" ? u.dataRogito : null;
  const residuo = verso === "rogitata" && proposto !== null ? Math.max(0, proposto - (pagamentiUnita(u).pagato ?? 0)) : null;

  const [acquirenteId, setAcquirenteId] = useState<string | null>(u.acquirenteId);
  const [data, setData] = useState(dataEsistente ?? oggi());
  const [prezzoTesto, setPrezzoTesto] = useState(inCampo(proposto));
  const [caparraTesto, setCaparraTesto] = useState("");
  const [saldoTesto, setSaldoTesto] = useState(residuo ? inCampo(residuo) : "");
  const [rogitoPrevisto, setRogitoPrevisto] = useState(u.rogitoPrevisto ?? "");

  const importi = permessi.importi;
  // Da telefono il prezzo si conferma, non si scrive.
  const prezzoScrivibile = importi && r.prezzo !== "nessuno" && !telefono;
  const prezzo = prezzoScrivibile ? leggiCampo(prezzoTesto) : null;
  const caparra = importi && r.caparra ? leggiCampo(caparraTesto) : null;
  const saldo = importi && r.saldo ? leggiCampo(saldoTesto) : null;
  const numeriSbagliati = [prezzo, caparra, saldo].some((n) => n !== null && Number.isNaN(n));
  const dati = { acquirenteId, data, prezzo, caparra, saldo, rogitoPrevisto: rogitoPrevisto || null };
  const errori = numeriSbagliati ? ["Scrivi gli importi come 250.000 o 2500,50."] : erroriCambioStato(u, verso, dati, importi);
  const blocco = bloccoCambioStato(u, verso);

  const conferma = () => {
    if (errori.length > 0 || cambia.isPending) return;
    cambia.mutate(
      {
        orderId: u.orderId,
        stato: verso,
        dati: verso === "libera" ? {} : { ...dati, rogitoPrevisto: r.rogitoPrevisto && !telefono ? rogitoPrevisto || null : undefined },
      },
      {
        onSuccess: () => {
          toast.success(verso === "libera" ? `${u.sigla} è di nuovo in vendita` : `${u.sigla}: ${NOMI_STATO[verso].una.toLowerCase()}`);
          onFatto();
        },
        onError: (e) => toast.error(messaggioGenerale(e, "lo stato dell'unità")),
      },
    );
  };

  if (blocco) return <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">{blocco}</p>;

  const id = (n: string) => `stato-${u.orderId}-${n}`;
  return (
    <form className="space-y-3 rounded-md border bg-muted/30 p-3" onSubmit={(ev) => { ev.preventDefault(); conferma(); }}>
      {verso === "libera" ? (
        <p className="text-sm">{u.sigla} torna in vendita: acquirente, date e prezzo trattato si tolgono.</p>
      ) : (
        <>
          {r.acquirente && (
            <div className="space-y-1">
              <Label htmlFor={id("acquirente")}>Acquirente</Label>
              <ScegliCliente id={id("acquirente")} valore={acquirenteId} onCambia={setAcquirenteId} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {r.etichettaData && (
              <div className="space-y-1">
                <Label htmlFor={id("data")}>{r.etichettaData}</Label>
                <Input id={id("data")} type="date" value={data} onChange={(ev) => setData(ev.target.value)} />
              </div>
            )}
            {prezzoScrivibile && (
              <div className="space-y-1">
                <Label htmlFor={id("prezzo")}>{r.etichettaPrezzo}{r.prezzo === "facoltativo" && <span className="font-normal text-muted-foreground"> (facolt.)</span>}</Label>
                <Input id={id("prezzo")} inputMode="decimal" value={prezzoTesto} onChange={(ev) => setPrezzoTesto(ev.target.value)} placeholder="es. 250.000" />
              </div>
            )}
            {importi && r.caparra && (
              <div className="space-y-1">
                <Label htmlFor={id("caparra")}>Caparra <span className="font-normal text-muted-foreground">(facolt.)</span></Label>
                <Input id={id("caparra")} inputMode="decimal" value={caparraTesto} onChange={(ev) => setCaparraTesto(ev.target.value)} placeholder="es. 20.000" />
              </div>
            )}
            {importi && r.saldo && (
              <div className="space-y-1">
                <Label htmlFor={id("saldo")}>Saldo incassato</Label>
                <Input id={id("saldo")} inputMode="decimal" value={saldoTesto} onChange={(ev) => setSaldoTesto(ev.target.value)} />
              </div>
            )}
            {r.rogitoPrevisto && !telefono && (
              <div className="space-y-1">
                <Label htmlFor={id("rogito")}>Rogito previsto <span className="font-normal text-muted-foreground">(facolt.)</span></Label>
                <Input id={id("rogito")} type="date" value={rogitoPrevisto} onChange={(ev) => setRogitoPrevisto(ev.target.value)} />
              </div>
            )}
          </div>
          {importi && telefono && (proposto !== null || r.prezzo === "obbligatorio") && (
            <p className="text-xs text-muted-foreground">
              {proposto !== null ? `${r.etichettaPrezzo}: ${euro(proposto)}. Si cambia dal computer.` : "Manca il prezzo: si scrive dal computer."}
            </p>
          )}
        </>
      )}
      {errori.length > 0 && verso !== "libera" && (acquirenteId || errori[0] !== "Scegli l'acquirente.") && (
        <p className="text-xs text-destructive">{errori[0]}</p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="flex-1 sm:flex-none" disabled={errori.length > 0 || cambia.isPending}>
          {cambia.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {VERBO[verso]}
        </Button>
        {!telefono && <Button type="button" size="sm" variant="ghost" onClick={onFatto}>Annulla</Button>}
      </div>
    </form>
  );
}

// src/components/orders/generali/piano/CalendarioPianoDialog.tsx
// Il calendario rapido del piano: i mesi a tutte le voci insieme, per gruppi e in mesi contati
// dall'inizio dell'operazione («la costruzione parte al mese 5 e dura 16 mesi»). Le proposte
// sono i tempi tipici del modello; il mese d'inizio lo sceglie chi conosce l'operazione, e
// finché non c'è la linea del tempo conta i mesi invece di dare date.
// La logica sta in lib/orders/generali/calendarioPiano.ts.
import { useMemo, useState } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { messaggioPiano, useCalendarioPiano } from "@/hooks/useGeneralePiano";
import { DEFINIZIONI_MODELLI, type ModelloGenerale } from "@/lib/orders/commesseGenerali";
import { DURATA_MASSIMA, applicaCalendario, durataOperazione, gruppiCalendario, tempiValidi, type TempiGruppo } from "@/lib/orders/generali/calendarioPiano";
import { aggiungiMesi, type CategoriaPiano } from "@/lib/orders/generali/pianoCategorie";
import type { VocePiano } from "@/lib/orders/generali/pianoConti";
import { leggiMese } from "@/lib/orders/generali/pianoExcel";
import { cn } from "@/lib/utils";
import { DialogContentOperativo as DialogContent } from "../design/ContestoOperativo";
import { euro, nomeMese } from "./formato";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generaleId: string;
  versioneId: string;
  modello: ModelloGenerale;
  voci: VocePiano[];
}

export function CalendarioPianoDialog({ open, onOpenChange, ...resto }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        {/* Il modulo nasce a ogni apertura: le proposte ripartono dalle voci di adesso. */}
        {open && <Modulo onOpenChange={onOpenChange} {...resto} />}
      </DialogContent>
    </Dialog>
  );
}

/** «nov 2026» → «nov 26»: sulla linea del tempo lo spazio è poco. */
const meseCorto = (mese: string) => nomeMese(mese).replace(/ (\d{2})(\d{2})$/, " $2");

function Modulo({ onOpenChange, generaleId, versioneId, modello, voci }: Omit<Props, "open">) {
  const salva = useCalendarioPiano(generaleId, versioneId);
  const gruppi = useMemo(() => gruppiCalendario(voci, modello), [voci, modello]);
  const [inizioTesto, setInizioTesto] = useState("");
  const [tempi, setTempi] = useState<Partial<Record<CategoriaPiano, { dopo: string; durata: string }>>>(() =>
    Object.fromEntries(gruppi.map((g) => [g.categoria, { dopo: String(g.dopoMesi + 1), durata: String(g.durataMesi) }])),
  );
  const conMese = gruppi.reduce((t, g) => t + g.conMese, 0);
  const [ancheConMese, setAncheConMese] = useState(false);

  const inizio = inizioTesto.trim() ? leggiMese(inizioTesto) : null;
  const inizioSbagliato = inizioTesto.trim() !== "" && !inizio;
  // «Dal mese 1» è il mese d'inizio: per chi legge si conta da uno, nel calcolo da zero.
  const letti: Partial<Record<CategoriaPiano, TempiGruppo>> = Object.fromEntries(
    gruppi.map((g) => {
      const t = tempi[g.categoria];
      return [g.categoria, { dopoMesi: Number(t?.dopo) - 1, durataMesi: Number(t?.durata) }];
    }),
  );
  const validi = gruppi.filter((g) => tempiValidi(letti[g.categoria]!));
  const durata = Math.max(durataOperazione(validi.map((g) => letti[g.categoria]!)), 1);
  const scala = Math.max(durata, 12);
  const modifiche = inizio ? applicaCalendario(voci, inizio, letti, { ancheConMese }) : [];
  const sbagliati = gruppi.length - validi.length;
  // Il riquadro sopra conta solo le voci con un importo: qui si dice quante sono, perché il
  // calendario mette il mese anche a quelle ancora a zero (avranno già il mese quando si stimano).
  const perId = new Map(voci.map((v) => [v.id, v]));
  const bloccanti = modifiche.filter((m) => { const v = perId.get(m.id); return !!v && v.importo > 0 && !v.mese; }).length;
  const aZero = modifiche.filter((m) => { const v = perId.get(m.id); return !!v && !v.mese && !(v.importo > 0); }).length;
  const giaConMese = modifiche.length - bloccanti - aZero;
  const dettaglio = [
    bloccanti > 0 && `${bloccanti} con un importo`,
    aZero > 0 && `${aZero} ancora a zero`,
    giaConMese > 0 && `${giaConMese} che avevano già un mese`,
  ].filter(Boolean).join(", ");

  const scrivi = (c: CategoriaPiano, campo: "dopo" | "durata", valore: string) =>
    setTempi((tt) => ({ ...tt, [c]: { ...(tt[c] ?? { dopo: "1", durata: "1" }), [campo]: valore } }));

  const conferma = () => {
    if (!inizio || modifiche.length === 0 || sbagliati > 0 || salva.isPending) return;
    salva.mutate(modifiche, {
      onSuccess: (n) => {
        toast.success(n === 1 ? "Mese messo a 1 voce" : `Mesi messi a ${n} voci`, {
          description: `Da ${nomeMese(inizio)} a ${nomeMese(aggiungiMesi(inizio, durata - 1))}. Ogni voce si corregge anche dalla tabella.`,
        });
        onOpenChange(false);
      },
      onError: (e) => toast.error(messaggioPiano(e, "i mesi del piano")),
    });
  };

  // I segni sulla linea del tempo: ogni 3 mesi fino a due anni, poi ogni 6.
  const passo = scala > 24 ? 6 : 3;
  const tacche = Array.from({ length: Math.floor((scala - 1) / passo) + 1 }, (_, i) => i * passo);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" /> Calendario del piano</DialogTitle>
        <DialogDescription>
          I mesi si contano dall'inizio dell'operazione: ogni gruppo di voci parte al suo mese e il suo importo si distribuisce sui mesi indicati.
          Le proposte sono i tempi tipici di «{DEFINIZIONI_MODELLI[modello].nome}»: mettici i tuoi.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
        <div className="space-y-1">
          <Label htmlFor="calendario-inizio">L'operazione parte a</Label>
          <Input
            id="calendario-inizio"
            autoFocus
            className={cn("h-9 w-36", inizioSbagliato && "border-destructive")}
            placeholder="mm/aaaa"
            value={inizioTesto}
            onChange={(e) => setInizioTesto(e.target.value)}
            aria-invalid={inizioSbagliato}
            aria-describedby="calendario-inizio-aiuto"
          />
        </div>
        <p id="calendario-inizio-aiuto" className="pb-1.5 text-sm" aria-live="polite">
          {inizioSbagliato
            ? <span className="text-destructive">Scrivi il mese come 11/2026.</span>
            : inizio
              ? <>Dura <span className="font-medium tabular-nums">{durata} mesi</span>: da {nomeMese(inizio)} a {nomeMese(aggiungiMesi(inizio, durata - 1))}.</>
              : <span className="text-muted-foreground">Dura {durata} mesi. Scegli il mese d'inizio per avere le date.</span>}
        </p>
      </div>

      <div className="max-h-[52vh] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Gruppo</th>
              <th className="px-2 py-2 text-right font-medium">Importo</th>
              <th className="px-1 py-2 font-medium">Dal mese</th>
              <th className="px-1 py-2 font-medium">Per mesi</th>
              <th className="w-[38%] px-3 py-2 font-medium">
                <div className="relative h-4" aria-hidden="true">
                  {tacche.map((m) => (
                    <span key={m} className="absolute -translate-x-1/2 whitespace-nowrap text-[10px] font-normal" style={{ left: `${((m + 0.5) / scala) * 100}%` }}>
                      {inizio ? meseCorto(aggiungiMesi(inizio, m)) : `M${m + 1}`}
                    </span>
                  ))}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {gruppi.map((g) => {
              const t = letti[g.categoria]!;
              const ok = tempiValidi(t);
              const valoreTempi = tempi[g.categoria];
              return (
                <tr key={g.categoria} className={cn("border-b last:border-0", !ok && "bg-destructive/5")}>
                  <td className="px-3 py-1.5">
                    <p className="font-medium leading-tight">{g.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.voci === 1 ? "1 voce" : `${g.voci} voci`}
                      {g.senzaMese > 0 && <span className="text-amber-700 dark:text-amber-400"> · {g.senzaMese} senza mese</span>}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{g.importo > 0 ? euro(g.importo) : "—"}</td>
                  <td className="px-1 py-1.5">
                    <Input
                      aria-label={`Dal mese, ${g.nome}`}
                      className="h-8 w-16 text-right"
                      inputMode="numeric"
                      value={valoreTempi?.dopo ?? ""}
                      onChange={(e) => scrivi(g.categoria, "dopo", e.target.value)}
                    />
                  </td>
                  <td className="px-1 py-1.5">
                    <Input
                      aria-label={`Per mesi, ${g.nome}`}
                      className="h-8 w-16 text-right"
                      inputMode="numeric"
                      value={valoreTempi?.durata ?? ""}
                      onChange={(e) => scrivi(g.categoria, "durata", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="relative h-3 rounded-full bg-muted" aria-hidden="true">
                      {ok && (
                        <div
                          className={cn("absolute inset-y-0 rounded-full", g.tipo === "ricavo" ? "bg-emerald-500" : "bg-eic-navy")}
                          style={{ left: `${(t.dopoMesi / scala) * 100}%`, width: `${Math.max((Math.min(t.durataMesi, scala - t.dopoMesi) / scala) * 100, 1.5)}%` }}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {conMese > 0 ? (
          <label className="flex cursor-pointer items-center gap-2">
            <Checkbox checked={ancheConMese} onCheckedChange={(v) => setAncheConMese(v === true)} aria-label={`Riscrivi anche le ${conMese} voci che hanno già un mese`} />
            <span>Riscrivi anche {conMese === 1 ? "la voce che ha" : `le ${conMese} voci che hanno`} già un mese</span>
          </label>
        ) : <span />}
        <span className={cn("text-muted-foreground", sbagliati > 0 && "text-destructive")} aria-live="polite">
          {sbagliati > 0
            ? `${sbagliati === 1 ? "Un gruppo ha" : `${sbagliati} gruppi hanno`} tempi da correggere: il mese parte da 1, la durata va da 1 a ${DURATA_MASSIMA}.`
            : !inizio
              ? "Scegli il mese d'inizio."
              : modifiche.length === 0
                ? "Niente da cambiare: le voci hanno già questi mesi."
                : `Cambiano ${modifiche.length === 1 ? "1 voce" : `${modifiche.length} voci`}${dettaglio.includes(",") ? `: ${dettaglio}` : ""}.`}
        </span>
      </div>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button type="button" variant="brand" onClick={conferma} disabled={!inizio || modifiche.length === 0 || sbagliati > 0 || salva.isPending}>
          {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {modifiche.length > 0 ? `Metti i mesi a ${modifiche.length} voci` : "Metti i mesi"}
        </Button>
      </DialogFooter>
    </>
  );
}

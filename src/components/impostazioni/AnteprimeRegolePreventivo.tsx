import { useState } from "react";
import { Calculator, FileText, Image, Paperclip, PenLine } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { calcolaMargine, round2, semaforo } from "@/hooks/usePreventivoCosti";

const euro = (value: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value);
const percento = (value: number) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);

function percentualeEsempio(value: string, fallback: number, massimo: number): number | null {
  if (!value.trim()) return fallback;
  const numero = Number(value.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 && numero <= massimo ? numero : null;
}

/** Usa il calcolo del preventivo, su importi fittizi: nessuna scrittura. */
export function EsempioMargini({ overhead, minimo, target }: { overhead: string; minimo: string; target: string }) {
  const [costo, setCosto] = useState("1000");
  const [prezzo, setPrezzo] = useState("1500");
  const spese = percentualeEsempio(overhead, 0, 100);
  const min = percentualeEsempio(minimo, 15, 99.99);
  const obiettivo = percentualeEsempio(target, 25, 99.99);
  const costoNumero = Number(costo);
  const prezzoNumero = Number(prezzo);
  const valido = costo.trim() && prezzo.trim() && Number.isFinite(costoNumero) && Number.isFinite(prezzoNumero)
    && costoNumero >= 0 && prezzoNumero > 0 && spese != null && min != null && obiettivo != null && min <= obiettivo;
  const risultato = valido ? calcolaMargine(prezzoNumero, costoNumero, spese) : null;
  const stato = risultato ? semaforo(risultato.margine_percentuale, min!, obiettivo!) : null;
  const costoSpese = valido ? costoNumero * (spese! / 100) : 0;
  const prezzoObiettivo = valido ? round2((costoNumero + costoSpese) / (1 - obiettivo! / 100)) : null;
  const etichette = { red: "Sotto il minimo", yellow: "Sotto l’obiettivo", green: "Obiettivo raggiunto" };

  return (
    <div role="region" aria-labelledby="esempio-margini-titolo" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      <div className="border-b bg-primary/[0.04] p-5">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Calculator className="h-5 w-5" aria-hidden="true" /></div>
        <h3 id="esempio-margini-titolo" className="font-semibold">Prova con un esempio</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Vedi l’effetto delle soglie su un prodotto. Gli importi sono di esempio, IVA esclusa.</p>
      </div>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="esempio-costo" className="text-xs">Costo di acquisto €</Label>
            <Input id="esempio-costo" type="number" min="0" step="0.01" value={costo} onChange={e => setCosto(e.target.value)} className="tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="esempio-prezzo" className="text-xs">Prezzo di vendita €</Label>
            <Input id="esempio-prezzo" type="number" min="0.01" step="0.01" value={prezzo} onChange={e => setPrezzo(e.target.value)} className="tabular-nums" />
          </div>
        </div>
        {risultato ? (
          <>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Acquisto</dt><dd className="tabular-nums">{euro(costoNumero)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Spese generali ({percento(spese!)}%)</dt><dd className="tabular-nums">{euro(costoSpese)}</dd></div>
              <div className="flex justify-between gap-2 border-t pt-2 font-medium"><dt>Costo complessivo</dt><dd className="tabular-nums">{euro(costoNumero + costoSpese)}</dd></div>
            </dl>
            <div className={cn("rounded-xl border p-4", stato === "green" ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : stato === "yellow" ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30")}>
              <div className="flex items-baseline justify-between gap-2"><span className="text-xs font-medium">Margine sul prezzo</span><strong className="text-2xl tracking-tight tabular-nums">{percento(risultato.margine_percentuale)}%</strong></div>
              <p className="mt-1 text-xs">{euro(risultato.margine_euro)} · {etichette[stato!]}</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-4">
              <p className="text-xs text-muted-foreground">Prezzo per un margine del {percento(obiettivo!)}%</p>
              <p className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{euro(prezzoObiettivo!)}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">È un riferimento di calcolo. Le soglie colorano i semafori e non riscrivono i prezzi dei preventivi.</p>
            </div>
          </>
        ) : <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Inserisci importi validi e soglie coerenti per vedere l’esempio.</p>}
        <p className="text-[11px] text-muted-foreground">Questa prova non salva né modifica un preventivo.</p>
      </div>
    </div>
  );
}

export function SchemaPdfPreventivo({ prezzi, soloTotale, sconti, immagini, schede, firma, prefisso }: {
  prezzi: boolean; soloTotale: boolean; sconti: boolean; immagini: boolean; schede: boolean; firma: boolean; prefisso: string;
}) {
  return (
    <div role="region" aria-labelledby="schema-pdf-titolo" className="rounded-xl border bg-muted/35 p-4">
      <div className="mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-primary" aria-hidden="true" /><h3 id="schema-pdf-titolo" className="text-sm font-semibold">Cosa vede il cliente</h3></div>
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="mb-5 border-b pb-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Preventivo</p>
          <p className="mt-1 font-mono text-xs">{prefisso || "OFF"}-{new Date().getFullYear()}-001</p>
        </div>
        {!soloTotale && (
          <div className="mb-5 space-y-2 text-[11px]">
            <div className="flex items-start gap-2">
              {immagini && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-muted"><Image className="h-4 w-4 text-muted-foreground" aria-label="Miniatura prodotto" /></span>}
              <div className="min-w-0 flex-1"><p className="font-medium">Prodotto di esempio</p><p className="text-muted-foreground">Quantità: 1</p>{prezzi && <p className="mt-1 text-muted-foreground">Prezzo unitario: 1.000,00 € · IVA 22%</p>}{prezzi && sconti && <p className="text-muted-foreground">Sconto di riga: 0%</p>}</div>
              <span className="shrink-0 font-medium">1.000,00 €</span>
            </div>
          </div>
        )}
        {soloTotale && <p className="mb-5 text-[11px] text-muted-foreground">Il dettaglio delle righe è nascosto.</p>}
        <div className="space-y-2 border-t pt-3 text-[11px]">
          {sconti && <p className="flex justify-between gap-3 text-muted-foreground"><span>Sconto globale di esempio</span><span>−50,00 €</span></p>}
          <p className="flex justify-between gap-3 text-muted-foreground"><span>Imponibile</span><span>950,00 €</span></p>
          <p className="flex justify-between gap-3 text-muted-foreground"><span>IVA 22%</span><span>209,00 €</span></p>
          <p className="flex justify-between gap-3 font-semibold"><span>Totale</span><span>1.159,00 €</span></p>
        </div>
        {(schede || firma) && <div className="mt-4 space-y-2 border-t pt-3 text-[11px] text-muted-foreground">
          {schede && <p className="flex items-center gap-1.5"><Paperclip className="h-3 w-3" aria-hidden="true" />Schede tecniche allegate</p>}
          {firma && <p className="flex items-center gap-1.5"><PenLine className="h-3 w-3" aria-hidden="true" />Firma online con codice OTP</p>}
        </div>}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Schema indicativo con dati di esempio. Il layout effettivo dipende dal modello del preventivo.</p>
    </div>
  );
}

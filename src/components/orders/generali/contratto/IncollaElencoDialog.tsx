// src/components/orders/generali/contratto/IncollaElencoDialog.tsx
// Incolla l'elenco prezzi da Excel: anteprima con le colonne riconosciute (correggibili), le righe
// scartate col motivo, poi un salvataggio solo (generale_elenco_importa). Un codice che c'è già
// aggiorna la sua voce; le altre si aggiungono in coda.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useImportaElenco } from "@/hooks/useGeneraleContrattoElenco";
import { messaggioContratto } from "@/lib/orders/generali/contratto";
import { NOMI_COLONNE, leggiCelle, leggiElencoIncollato, type ColonnaElenco } from "@/lib/orders/generali/contrattoElenco";
import { euro, numeroIt } from "./formato";

const ANTEPRIMA_RIGHE = 50;

export function IncollaElencoDialog({ open, onOpenChange, generaleId }: { open: boolean; onOpenChange: (o: boolean) => void; generaleId: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        {open && <Incolla generaleId={generaleId} chiudi={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Incolla({ generaleId, chiudi }: { generaleId: string; chiudi: () => void }) {
  const importa = useImportaElenco(generaleId);
  const [testo, setTesto] = useState("");
  const [colonne, setColonne] = useState<ColonnaElenco[] | undefined>(undefined);
  const letto = useMemo(() => (testo.trim() ? leggiElencoIncollato(testo, colonne) : null), [testo, colonne]);
  const primaRiga = useMemo(() => (testo.trim() ? leggiCelle(testo)[0] ?? [] : []), [testo]);
  const sceltaColonne = letto?.colonne ?? [];
  const manca = letto && (!sceltaColonne.includes("descrizione") || !sceltaColonne.includes("prezzo"));

  const cambiaColonna = (i: number, c: ColonnaElenco) => {
    const nuove = [...sceltaColonne];
    // Una colonna per significato: chi aveva già quel significato passa a «—».
    if (c !== "ignora") nuove.forEach((x, j) => { if (x === c) nuove[j] = "ignora"; });
    nuove[i] = c;
    setColonne(nuove);
  };

  const salva = () => {
    if (!letto || letto.righe.length === 0) return;
    importa.mutate(letto.righe, {
      onSuccess: ({ nuove, aggiornate }) => {
        toast.success([nuove > 0 && `${nuove} voci aggiunte`, aggiornate > 0 && `${aggiornate} aggiornate`].filter(Boolean).join(", ") || "Elenco salvato");
        chiudi();
      },
      onError: (e) => toast.error(messaggioContratto(e, "l'elenco prezzi")),
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Incolla l'elenco prezzi da Excel</DialogTitle>
        <DialogDescription>
          Seleziona le righe nel foglio (codice, descrizione, unità di misura, prezzo), copia e incolla qui. I prezzi sono quelli di elenco: il ribasso lo applichiamo noi.
        </DialogDescription>
      </DialogHeader>
      <Textarea
        aria-label="Righe copiate da Excel"
        rows={6}
        className="font-mono text-xs"
        placeholder={"A.01.001\tScavo di sbancamento\tm³\t12,50\nA.01.002\tRinterro\tm³\t8,20"}
        value={testo}
        onChange={(e) => { setTesto(e.target.value); setColonne(undefined); }}
      />

      {letto && (
        <div className="space-y-3">
          <p className="text-sm">
            <strong>{letto.righe.length}</strong> {letto.righe.length === 1 ? "voce pronta" : "voci pronte"}
            {letto.scartate.length > 0 && <>, <span className="text-amber-700 dark:text-amber-400">{letto.scartate.length} righe lasciate fuori</span></>}
            {letto.intestazione && <span className="text-muted-foreground"> · la prima riga è l'intestazione</span>}
          </p>
          {manca && <p role="alert" className="text-sm text-destructive">Indica quale colonna è la descrizione e quale il prezzo.</p>}
          <p className="text-xs text-muted-foreground">Le colonne del foglio, come le abbiamo riconosciute: se una è sbagliata, cambiala qui sopra le voci.</p>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40">
                  {sceltaColonne.map((c, i) => (
                    <th key={i} className="min-w-[7rem] px-2 py-1.5 text-left font-normal">
                      <Select value={c} onValueChange={(v) => cambiaColonna(i, v as ColonnaElenco)}>
                        <SelectTrigger className="h-8" aria-label={`Colonna ${i + 1}${primaRiga[i] ? ` (${primaRiga[i]})` : ""}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(NOMI_COLONNE) as ColonnaElenco[]).map((k) => <SelectItem key={k} value={k}>{NOMI_COLONNE[k]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 font-medium">Codice</th>
                  <th className="px-2 py-1.5 font-medium">Descrizione</th>
                  <th className="px-2 py-1.5 font-medium">U.M.</th>
                  <th className="px-2 py-1.5 text-right font-medium">Quantità</th>
                  <th className="px-2 py-1.5 text-right font-medium">Prezzo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {letto.righe.slice(0, ANTEPRIMA_RIGHE).map((r) => (
                  <tr key={r.riga}>
                    <td className="px-2 py-1 text-xs">{r.codice ?? "—"}</td>
                    <td className="max-w-[28rem] px-2 py-1">{r.descrizione}</td>
                    <td className="px-2 py-1 text-xs">{r.unitaMisura || "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.quantita === null ? "—" : numeroIt(r.quantita, 3)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{euro(r.prezzo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {letto.righe.length > ANTEPRIMA_RIGHE && (
              <p className="border-t px-2 py-1.5 text-xs text-muted-foreground">… e altre {letto.righe.length - ANTEPRIMA_RIGHE} voci.</p>
            )}
          </div>
          {letto.scartate.length > 0 && (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Righe lasciate fuori</summary>
              <ul className="mt-1 space-y-0.5">
                {letto.scartate.slice(0, 30).map((s) => <li key={s.riga}>Riga {s.riga}: {s.motivo}</li>)}
              </ul>
            </details>
          )}
          {letto.doppioni.length > 0 && (
            <p className="text-xs text-muted-foreground">Codici ripetuti nel foglio (vale l'ultima riga): {letto.doppioni.slice(0, 10).join(", ")}{letto.doppioni.length > 10 ? "…" : ""}</p>
          )}
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0">
        <Button type="button" variant="ghost" onClick={chiudi}>Annulla</Button>
        <Button type="button" onClick={salva} disabled={!letto || letto.righe.length === 0 || !!manca || importa.isPending}>
          {importa.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {letto && letto.righe.length > 0 ? `Salva ${letto.righe.length} voci` : "Salva"}
        </Button>
      </DialogFooter>
    </>
  );
}

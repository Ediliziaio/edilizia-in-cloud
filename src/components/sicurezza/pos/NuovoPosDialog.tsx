import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useArchiviaModelloPos, useCreaPos, useModelliPos } from "@/hooks/usePos";
import { RUOLO_IMPRESA_LABEL, type RuoloImpresa } from "../../../../supabase/functions/_shared/posModello";

export type PosCreato = { pos_id: string; avvisi: string[] };

interface Props {
  commessa?: { id: string; nome?: string };
  commesseConPos: ReadonlySet<string>;
  onClose: () => void;
  onCreato: (pos: PosCreato) => void;
}

export function NuovoPosDialog({ commessa, commesseConPos, onClose, onCreato }: Props) {
  const companyId = useEffectiveCompanyId();
  const crea = useCreaPos();
  const modelli = useModelliPos();
  const archivia = useArchiviaModelloPos();
  const [ordineScelto, setOrdineScelto] = useState("");
  const [ruolo, setRuolo] = useState<RuoloImpresa | "">("");
  const [modelloId, setModelloId] = useState("vuoto");
  const [errore, setErrore] = useState("");
  const invioInCorso = useRef(false);
  const orderId = commessa?.id ?? ordineScelto;
  const modello = modelli.data?.find((m) => m.id === modelloId);
  const modelloValido = modelloId === "vuoto" || !!modello;
  const disabilitato = crea.isPending || archivia.isPending;

  async function creaBozza() {
    if (!companyId || !orderId || !ruolo || !modelloValido || disabilitato || invioInCorso.current) return;
    invioInCorso.current = true;
    setErrore("");
    try {
      const nuovo = await crea.mutateAsync({ orderId, ruoloImpresa: ruolo, modelloId: modello?.id });
      if (!nuovo?.pos_id) throw new Error("Creazione non confermata. Controlla l’elenco dei POS prima di riprovare.");
      onCreato(nuovo);
    } catch (e) {
      setErrore(e instanceof Error && e.message ? e.message : "Non riesco a creare la bozza. Riprova.");
    } finally {
      invioInCorso.current = false;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !invioInCorso.current) onClose(); }}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuovo POS</DialogTitle>
          <DialogDescription>Prepara una bozza con i dati disponibili del cantiere e della tua impresa.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void creaBozza(); }} aria-busy={crea.isPending} className="space-y-4">
          <fieldset disabled={disabilitato} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={commessa ? undefined : "nuovo-pos-commessa"}>Commessa</Label>
              {commessa ? (
                <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{commessa.nome || "Commessa corrente"}</p>
              ) : (
                <OrderSelectCombobox id="nuovo-pos-commessa" companyId={companyId ?? undefined} value={ordineScelto || undefined}
                  onChange={setOrdineScelto} disabled={disabilitato} filtroIniziale="all"
                  placeholder="Cerca per codice, cliente o indirizzo" />
              )}
              {orderId && commesseConPos.has(orderId) && (
                <p className="text-xs text-amber-800">C’è già un POS su questa commessa. Per aggiornare quello esistente, aprilo e crea una revisione.</p>
              )}
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Ruolo della tua impresa nel cantiere</legend>
              <RadioGroup aria-label="Ruolo della tua impresa nel cantiere" value={ruolo} onValueChange={(v) => setRuolo(v as RuoloImpresa)} disabled={disabilitato}>
                {(Object.keys(RUOLO_IMPRESA_LABEL) as RuoloImpresa[]).map((valore) => (
                  <Label key={valore} htmlFor={`nuovo-pos-ruolo-${valore}`} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal">
                    <RadioGroupItem id={`nuovo-pos-ruolo-${valore}`} value={valore} />
                    {RUOLO_IMPRESA_LABEL[valore]}
                  </Label>
                ))}
              </RadioGroup>
            </fieldset>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="nuovo-pos-modello">Punto di partenza</Label>
                {modello && <Button type="button" variant="ghost" size="sm" disabled={disabilitato} onClick={() => {
                  void archivia.mutateAsync(modello.id).then(() => setModelloId("vuoto")).catch(() => {});
                }}>Archivia versione</Button>}
              </div>
              <Select value={modelloId} onValueChange={setModelloId} disabled={disabilitato}>
                <SelectTrigger id="nuovo-pos-modello"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vuoto">Dati della commessa</SelectItem>
                  {modelli.data?.map((m) => <SelectItem key={m.id} value={m.id}>{m.nome} · v{m.versione}</SelectItem>)}
                </SelectContent>
              </Select>
              {modelli.isError && <p role="alert" className="text-xs text-destructive">Modelli non disponibili. <button type="button" onClick={() => void modelli.refetch()} className="underline">Riprova</button></p>}
              {!modelloValido && <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setModelloId("vuoto")}>Usa i dati della commessa</Button>}
              {modello && <p className="text-xs text-muted-foreground">{modello.ambito ? `${modello.ambito}. ` : ""}Verifica le lavorazioni riprese per questo cantiere.</p>}
            </div>
          </fieldset>
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={disabilitato} onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={!companyId || !orderId || !ruolo || !modelloValido || disabilitato}>
              {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {crea.isPending ? "Preparazione della bozza…" : "Crea bozza POS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { UniformSelect } from "@/components/ui/uniform-select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { OrderSelectCombobox } from "@/components/warehouse/OrderSelectCombobox";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useArchiviaModelloPos, useCreaPos, useModelliPos, usePosElenco } from "@/hooks/usePos";
import { testoRicercaSchedePos } from "../../../../supabase/functions/_shared/posSchedeStandard";
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
  const [partenza, setPartenza] = useState<"commessa" | "manuale" | "duplica" | "modello">("commessa");
  const modelli = useModelliPos(partenza === "modello");
  const sorgenti = usePosElenco(undefined, partenza === "duplica");
  const archivia = useArchiviaModelloPos();
  const [ordineScelto, setOrdineScelto] = useState("");
  const [ruolo, setRuolo] = useState<RuoloImpresa | "">("");
  const [modelloId, setModelloId] = useState("");
  const [sorgenteId, setSorgenteId] = useState("");
  const [cercaSorgente, setCercaSorgente] = useState("");
  const [errore, setErrore] = useState("");
  const invioInCorso = useRef(false);
  const orderId = commessa?.id ?? ordineScelto;
  const modello = modelli.data?.find((m) => m.id === modelloId);
  const sorgente = sorgenti.data?.find(p => p.id === sorgenteId);
  const etichetta = (p: NonNullable<typeof sorgente>) => {
    const data = p.updated_at?.slice(0, 10).split("-").reverse().join("/");
    return [p.commessa?.order_code, p.commessa?.description, `Rev. ${p.revisione}`, p.status === "approvato" ? "Approvato" : "Bozza", data].filter(Boolean).join(" · ");
  };
  const cerca = testoRicercaSchedePos(cercaSorgente).split(" ").filter(Boolean);
  const posVisibili = sorgenti.data?.filter(p => p.id === sorgenteId || cerca.every(termine => testoRicercaSchedePos(etichetta(p)).includes(termine))) ?? [];
  const partenzaValida = (partenza !== "modello" || (!!modello && !modelli.isError)) &&
    (partenza !== "duplica" || (!!sorgente && !sorgenti.isError));
  const disabilitato = crea.isPending || archivia.isPending;

  async function creaBozza() {
    if (!companyId || !orderId || !ruolo || !partenzaValida || disabilitato || invioInCorso.current) return;
    invioInCorso.current = true;
    setErrore("");
    try {
      const nuovo = await crea.mutateAsync({
        orderId, ruoloImpresa: ruolo,
        ...(partenza === "manuale" && { manuale: true }),
        ...(partenza === "duplica" && { sorgentePos: sorgente }),
        ...(partenza === "modello" && { modelloId: modello?.id }),
      });
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
          <DialogDescription>Scegli la commessa e come iniziare la bozza.</DialogDescription>
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
            <div className="space-y-2">
              <Label htmlFor="nuovo-pos-partenza">Punto di partenza</Label>
              <UniformSelect id="nuovo-pos-partenza" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={partenza} onChange={e => { setPartenza(e.target.value as typeof partenza); setErrore(""); }}>
                <option value="commessa">Dai dati della commessa</option>
                <option value="manuale">Compila a mano</option>
                <option value="duplica">Duplica un POS esistente</option>
                <option value="modello">Da un modello aziendale</option>
              </UniformSelect>
              {partenza === "manuale" && <p className="text-xs text-muted-foreground">
                Scrivi tu i dati e le lavorazioni. Se la commessa ha già un PSC di riferimento, lo ritrovi nella bozza.
              </p>}
              {partenza === "duplica" && <>
                <Input id="nuovo-pos-cerca-sorgente" aria-label="Cerca un POS per codice o commessa" placeholder="Cerca per codice o commessa"
                  value={cercaSorgente} onChange={e => setCercaSorgente(e.target.value)} />
                <Label htmlFor="nuovo-pos-sorgente">POS da duplicare</Label>
                <UniformSelect id="nuovo-pos-sorgente" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={sorgenteId} disabled={sorgenti.isLoading || sorgenti.isError} onChange={e => setSorgenteId(e.target.value)}>
                  <option value="">{sorgenti.isLoading ? "Carico i POS…" : "Scegli un POS dell’azienda"}</option>
                  {posVisibili.map(p => <option key={p.id} value={p.id}>{etichetta(p)}</option>)}
                </UniformSelect>
                {sorgenti.isError && <p role="alert" className="text-xs text-destructive">
                  Impossibile caricare i POS. <button type="button" onClick={() => void sorgenti.refetch()} className="underline">Riprova</button>
                </p>}
                {!sorgenti.isError && !sorgenti.isLoading && posVisibili.length === 0 && <p className="text-xs text-muted-foreground">Nessun POS corrispondente.</p>}
                {sorgente && <p className="text-xs text-muted-foreground">Riprendi le lavorazioni come bozza. Rileggi i testi per aggiornare eventuali riferimenti al cantiere di origine.</p>}
              </>}
              {partenza === "modello" && <>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="nuovo-pos-modello">Modello aziendale</Label>
                  {modello && <Button type="button" variant="ghost" size="sm" disabled={disabilitato} onClick={() => {
                    void archivia.mutateAsync(modello.id).then(() => setModelloId("")).catch(() => {});
                  }}>Archivia versione</Button>}
                </div>
                <Select value={modelloId} onValueChange={setModelloId} disabled={disabilitato || modelli.isLoading || modelli.isError}>
                  <SelectTrigger id="nuovo-pos-modello"><SelectValue placeholder={modelli.isLoading ? "Carico i modelli…" : "Scegli un modello"} /></SelectTrigger>
                  <SelectContent>
                    {modelli.data?.map(m => <SelectItem key={m.id} value={m.id}>{m.nome} · v{m.versione}</SelectItem>)}
                  </SelectContent>
                </Select>
                {modelli.isError && <p role="alert" className="text-xs text-destructive">Modelli non disponibili. <button type="button" onClick={() => void modelli.refetch()} className="underline">Riprova</button></p>}
                {!modelli.isLoading && !modelli.isError && !modelli.data?.length && <p className="text-xs text-muted-foreground">Puoi salvare un modello dal menu «Riutilizza POS» di un documento esistente.</p>}
                {modello && <p className="text-xs text-muted-foreground">{modello.ambito ? `${modello.ambito}. ` : ""}Verifica le lavorazioni riprese per questo cantiere.</p>}
              </>}
            </div>
          </fieldset>
          {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" disabled={disabilitato} onClick={onClose}>Annulla</Button>
            <Button type="submit" disabled={!companyId || !orderId || !ruolo || !partenzaValida || disabilitato}>
              {crea.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {crea.isPending ? "Preparazione della bozza…" : "Crea bozza POS"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

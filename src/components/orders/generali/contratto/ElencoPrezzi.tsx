// src/components/orders/generali/contratto/ElencoPrezzi.tsx
// L'elenco prezzi del contratto: prezzo di elenco e prezzo dopo il ribasso, voce per voce.
// Si riempie incollando da Excel; una voce si corregge o si aggiunge a mano.
import { useMemo, useState } from "react";
import { ClipboardPaste, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useEliminaVoceElenco, useElencoPrezzi, useSalvaVoceElenco } from "@/hooks/useGeneraleContrattoElenco";
import { messaggioContratto, prezzoNetto, type VoceElenco } from "@/lib/orders/generali/contratto";
import { IncollaElencoDialog } from "./IncollaElencoDialog";
import { Campo, CampoNumero, ProssimoPasso } from "./campi";
import { euro, haNumeriSbagliati, numeroIt, percentoIt } from "./formato";

const MOSTRATE = 200;

export function ElencoPrezzi({ generaleId, ribassoPct, puoModificare }: { generaleId: string; ribassoPct: number; puoModificare: boolean }) {
  const { data: elenco = [], isLoading, isError, refetch } = useElencoPrezzi(generaleId);
  const [incolla, setIncolla] = useState(false);
  const [inModifica, setInModifica] = useState<VoceElenco | "nuova" | null>(null);
  const [cerca, setCerca] = useState("");
  const elimina = useEliminaVoceElenco(generaleId);
  const confirm = useConfirm();
  const filtrate = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    return q ? elenco.filter((v) => `${v.codice ?? ""} ${v.descrizione}`.toLowerCase().includes(q)) : elenco;
  }, [elenco, cerca]);

  const togli = async (v: VoceElenco) => {
    if (!(await confirm({ title: `Togliere ${v.codice ?? "la voce"} dall'elenco?`, description: "Esce anche dagli ordini prezzati con questa voce. Se ha delle misure non si può togliere.", confirmLabel: "Togli", variant: "destructive" }))) return;
    elimina.mutate(v.id, {
      onSuccess: () => toast.success("Voce tolta"),
      onError: (e) => toast.error(messaggioContratto(e, "la voce")),
    });
  };

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (isError) {
    return (
      <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm">
        Non riesco a leggere l'elenco prezzi. <Button size="sm" variant="outline" onClick={() => void refetch()}>Riprova</Button>
      </div>
    );
  }

  return (
    <section aria-labelledby="elenco-titolo" className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 id="elenco-titolo" className="text-sm font-semibold">Elenco prezzi del contratto</h3>
          <p className="text-xs text-muted-foreground">
            {elenco.length} voci · ribasso {percentoIt(ribassoPct)} sulle voci soggette
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {elenco.length > 10 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input aria-label="Cerca nell'elenco" placeholder="Cerca codice o descrizione" className="h-9 w-56 pl-8" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            </div>
          )}
          {puoModificare && (
            <>
              <Button size="sm" variant="outline" onClick={() => setInModifica("nuova")}><Plus className="mr-1.5 h-3.5 w-3.5" /> Voce</Button>
              <Button size="sm" onClick={() => setIncolla(true)}><ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Incolla da Excel</Button>
            </>
          )}
        </div>
      </header>
      {elenco.length === 0 ? (
        <div className="p-4">
          <ProssimoPasso
            testo="Incolla l'elenco prezzi del contratto da Excel: con quello prezzi gli ordini di lavoro e scrivi le misure."
            azione={puoModificare ? <Button size="sm" onClick={() => setIncolla(true)}><ClipboardPaste className="mr-1.5 h-3.5 w-3.5" /> Incolla da Excel</Button> : undefined}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Codice</th>
                <th className="px-2 py-2 font-medium">Descrizione</th>
                <th className="px-2 py-2 font-medium">U.M.</th>
                <th className="px-2 py-2 text-right font-medium">Prezzo di elenco</th>
                <th className="px-2 py-2 text-right font-medium">Dopo il ribasso</th>
                <th className="px-2 py-2 text-right font-medium">Q.tà del contratto</th>
                {puoModificare && <th className="w-16 px-2 py-2"><span className="sr-only">Azioni</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrate.slice(0, MOSTRATE).map((v) => (
                <tr key={v.id} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap px-4 py-1.5 text-xs">{v.codice ?? "—"}</td>
                  <td className="max-w-[28rem] px-2 py-1.5">{v.descrizione}</td>
                  <td className="px-2 py-1.5 text-xs">{v.unitaMisura || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{euro(v.prezzo)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {v.soggettoRibasso ? euro(prezzoNetto(v, ribassoPct)) : <span title="Non soggetta a ribasso">{euro(v.prezzo)} <span className="text-xs text-muted-foreground">fisso</span></span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{v.quantitaContratto === null ? "—" : numeroIt(v.quantitaContratto, 3)}</td>
                  {puoModificare && (
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Modifica ${v.codice ?? v.descrizione}`} onClick={() => setInModifica(v)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label={`Togli ${v.codice ?? v.descrizione}`} onClick={() => void togli(v)} disabled={elimina.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtrate.length > MOSTRATE && (
            <p className="border-t px-4 py-2 text-xs text-muted-foreground">Ne mostro {MOSTRATE} su {filtrate.length}: cerca per codice o descrizione.</p>
          )}
        </div>
      )}
      {puoModificare && <IncollaElencoDialog open={incolla} onOpenChange={setIncolla} generaleId={generaleId} />}
      <Dialog open={inModifica !== null} onOpenChange={(o) => { if (!o) setInModifica(null); }}>
        <DialogContent className="max-w-md">
          {inModifica !== null && (
            <ModuloVoce generaleId={generaleId} voce={inModifica === "nuova" ? null : inModifica} chiudi={() => setInModifica(null)} posizione={elenco.length + 1} />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ModuloVoce({ generaleId, voce, chiudi, posizione }: { generaleId: string; voce: VoceElenco | null; chiudi: () => void; posizione: number }) {
  const salva = useSalvaVoceElenco(generaleId);
  const [v, setV] = useState<VoceElenco>(voce ?? {
    id: "", codice: null, descrizione: "", unitaMisura: "", prezzo: 0, soggettoRibasso: true, quantitaContratto: null, posizione,
  });
  const puoSalvare = v.descrizione.trim() !== "" && !haNumeriSbagliati(v) && !salva.isPending;
  const conferma = () => {
    if (!puoSalvare) return;
    salva.mutate({ ...v, posizione: voce ? undefined : posizione }, {
      onSuccess: () => { toast.success(voce ? "Voce aggiornata" : "Voce aggiunta"); chiudi(); },
      onError: (e) => toast.error(messaggioContratto(e, "la voce")),
    });
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>{voce ? "Modifica la voce" : "Nuova voce dell'elenco"}</DialogTitle>
        <DialogDescription>Il prezzo è quello di elenco: il ribasso del contratto si applica da solo se la voce è soggetta.</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); conferma(); }}>
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Campo etichetta="Codice">{(id) => <Input id={id} value={v.codice ?? ""} onChange={(e) => setV((x) => ({ ...x, codice: e.target.value.trim() ? e.target.value : null }))} />}</Campo>
          <Campo etichetta="Descrizione">{(id) => <Input id={id} value={v.descrizione} onChange={(e) => setV((x) => ({ ...x, descrizione: e.target.value }))} />}</Campo>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etichetta="U.M.">{(id) => <Input id={id} value={v.unitaMisura} onChange={(e) => setV((x) => ({ ...x, unitaMisura: e.target.value }))} placeholder="m³" />}</Campo>
          <CampoNumero etichetta="Prezzo" valore={v.prezzo} decimali={4} suffisso="€" onChange={(p) => setV((x) => ({ ...x, prezzo: p ?? 0 }))} />
          <CampoNumero etichetta="Q.tà del contratto" valore={v.quantitaContratto} decimali={3} onChange={(q) => setV((x) => ({ ...x, quantitaContratto: q }))} />
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={v.soggettoRibasso} onCheckedChange={(s) => setV((x) => ({ ...x, soggettoRibasso: s }))} />
          Soggetta a ribasso
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={chiudi}>Annulla</Button>
          <Button type="submit" disabled={!puoSalvare}>{salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva</Button>
        </DialogFooter>
      </form>
    </>
  );
}

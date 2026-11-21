import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATALOGHI_PRONTI, caricaCatalogo, giaInLibreria, type CatalogoPronto, type VocePronta } from "@/lib/listino/cataloghiPronti";
import { formatCurrency } from "@/lib/formatters";
import { etichettaSlug, type ProdottoLibreria } from "@/lib/listino/prodottiLibreria";

interface Props {
  catalogo: CatalogoPronto;
  modelloArea: boolean;
  erroreLista: boolean;
  presenti: ProdottoLibreria[];
  inCorso: boolean;
  listaDisponibile: boolean;
  onRicarica: () => void;
  onCatalogo: (catalogo: CatalogoPronto) => void;
  onChiudi: () => void;
  onImporta: (voci: VocePronta[], visibili: boolean, conPrezzi: boolean) => void;
}

export function ImportaCatalogoProntoDialog({
  catalogo, modelloArea, erroreLista, presenti, inCorso, listaDisponibile, onRicarica, onCatalogo, onChiudi, onImporta,
}: Props) {
  const opzioneId = useId();
  const [escluse, setEscluse] = useState<Set<string>>(new Set());
  const [cerca, setCerca] = useState("");
  const [pubblica, setPubblica] = useState(false);
  const [prezziIndicativi, setPrezziIndicativi] = useState(false);
  const dati = useQuery({
    queryKey: ["anteprima-catalogo-pronto", catalogo.id],
    queryFn: () => caricaCatalogo(catalogo),
    staleTime: Infinity,
  });
  const righe = (dati.data ?? []).map((voce) => ({ voce, presente: !modelloArea && giaInLibreria(catalogo, voce, presenti) }));
  const nuove = righe.filter(({ presente }) => !presente);
  const selezionate = nuove.filter(({ voce }) => !escluse.has(voce.id)).map(({ voce }) => voce);
  const filtrate = righe.filter(({ voce }) => {
    const testo = [voce.nome, voce.tipologia, voce.categoria_slug].join(" ").toLocaleLowerCase("it");
    return testo.includes(cerca.trim().toLocaleLowerCase("it"));
  });
  const conPrezzi = catalogo.fonte === "fornitore" || prezziIndicativi;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !inCorso) onChiudi(); }}>
      <DialogContent className="flex max-h-[92dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{modelloArea ? "Prepara un modello di area" : "Aggiungi un catalogo"}</DialogTitle>
          <DialogDescription>
            {modelloArea
              ? "Scegli quali voci includere. Le aziende potranno installare il modello come copia nel proprio listino."
              : "Scegli le voci da aggiungere alla libreria e verifica quali sono già presenti."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-3">
          <Select value={catalogo.id} onValueChange={(id) => {
            const selezione = CATALOGHI_PRONTI.find((item) => item.id === id);
            if (selezione) onCatalogo(selezione);
          }} disabled={inCorso}>
            <SelectTrigger aria-label="Catalogo da preparare"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATALOGHI_PRONTI.filter((item) => !modelloArea || item.fonte === "base").map((item) => <SelectItem key={item.id} value={item.id}>{item.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">{catalogo.descrizione}</p>

          {erroreLista && (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <span className="text-destructive">Impossibile verificare i prodotti già in libreria.</span>
              <Button variant="outline" size="sm" onClick={onRicarica}>Riprova</Button>
            </div>
          )}
          {dati.isLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento anteprima…</p>}
          {dati.isError && (
            <div role="alert" className="flex items-center gap-3 text-sm">
              <span className="text-destructive">Impossibile caricare il catalogo.</span>
              <Button variant="outline" size="sm" onClick={() => void dati.refetch()}>Riprova</Button>
            </div>
          )}
          {dati.data && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="w-full sm:flex-1" aria-label="Cerca nel catalogo" placeholder="Cerca nel catalogo…" value={cerca} onChange={(event) => setCerca(event.target.value)} />
                <Button size="sm" variant="ghost" disabled={inCorso || nuove.length === 0} onClick={() =>
                  setEscluse(selezionate.length ? new Set(nuove.map(({ voce }) => voce.id)) : new Set())
                }>
                  {selezionate.length ? "Deseleziona tutte" : "Seleziona tutte"}
                </Button>
              </div>
              <div className="max-h-[43dvh] overflow-y-auto rounded-md border">
                <ul className="divide-y">
                  {filtrate.map(({ voce, presente }) => (
                    <li key={voce.id} className="flex items-start gap-3 px-3 py-2.5">
                      <Checkbox
                        id={`catalogo-${voce.id}`}
                        className="mt-0.5"
                        checked={presente || !escluse.has(voce.id)}
                        disabled={presente || inCorso || !listaDisponibile}
                        onCheckedChange={(checked) => setEscluse((prima) => {
                          const aggiornate = new Set(prima);
                          if (checked) aggiornate.delete(voce.id);
                          else aggiornate.add(voce.id);
                          return aggiornate;
                        })}
                      />
                      <label htmlFor={`catalogo-${voce.id}`} className="min-w-0 flex-1 cursor-pointer text-sm">
                        <span className="block font-medium">{voce.nome}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[etichettaSlug(voce.categoria_slug), voce.unit_of_measure, voce.tipologia].filter(Boolean).join(" · ")}
                        </span>
                        {conPrezzi && voce.modalita_prezzo_base !== "griglia" && (
                          <span className="block text-xs text-muted-foreground">{formatCurrency(voce.prezzo_base_vendita)} / {voce.unit_of_measure}</span>
                        )}
                      </label>
                      {presente && <span className="shrink-0 text-xs text-muted-foreground">Già in libreria</span>}
                    </li>
                  ))}
                </ul>
                {filtrate.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nessuna voce corrisponde alla ricerca.</p>}
              </div>
            </>
          )}

          <div className="space-y-2">
            {catalogo.prezziIndicativi && (
              <div className="flex items-center gap-2 text-sm">
                <Checkbox id={`${opzioneId}-prezzi`} checked={prezziIndicativi} disabled={inCorso} onCheckedChange={(v) => setPrezziIndicativi(v === true)} />
                <label htmlFor={`${opzioneId}-prezzi`}>Includi prezzi e maggiorazioni indicativi</label>
              </div>
            )}
            {modelloArea && !conPrezzi && (
              <p className="text-xs text-muted-foreground">Dopo l’installazione, i prodotti saranno nel listino dell’azienda in attesa di prezzo.</p>
            )}
            {catalogo.fonte === "fornitore" && <p className="text-xs text-muted-foreground">Le voci includono le griglie prezzi del catalogo originale.</p>}
            <div className="flex items-center gap-2 text-sm">
              <Checkbox id={`${opzioneId}-visibilita`} checked={pubblica} disabled={inCorso} onCheckedChange={(v) => setPubblica(v === true)} />
              <label htmlFor={`${opzioneId}-visibilita`}>
                {modelloArea ? "Rendi subito visibile il modello alle aziende" : "Rendi subito visibili le nuove voci alle aziende"}
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="items-center gap-2 border-t pt-3">
          <p role="status" className="mr-auto text-sm text-muted-foreground">
            {dati.data && (modelloArea ? (selezionate.length === 1 ? "1 voce nel modello" : `${selezionate.length} voci nel modello`) : `${selezionate.length} da aggiungere · ${righe.length - nuove.length} già in libreria`)}
          </p>
          <Button variant="outline" disabled={inCorso} onClick={onChiudi}>Chiudi</Button>
          <Button disabled={inCorso || !listaDisponibile || selezionate.length === 0} onClick={() => onImporta(selezionate, pubblica, conPrezzi)}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {modelloArea ? (pubblica ? "Salva e pubblica modello" : "Salva modello come nascosto")
              : (pubblica ? "Aggiungi e pubblica" : "Aggiungi come nascosti")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * «+ Tipologia» in un'area: una standard che manca, una su misura, oppure la
 * copia di una che c'è già, con o senza i suoi prodotti.
 *
 * La copia serve quando cambia il prodotto e non solo il prezzo: i serramenti
 * in alluminio accanto a quelli in PVC. Se cambia solo il prezzo degli stessi
 * modelli (un'altra serie di profilo) si aggiunge una linea, non una tipologia.
 */
import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TipologiaStandard } from "@/lib/listino/areeStandard";
import type { AreaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import {
  leggiPercentuale,
  nomeTipologiaLibero,
  nomeTipologiaOccupato,
  problemaCopiaTipologia,
} from "@/lib/listino/organizzaListino";

export type ModoNuovaTipologia = "standard" | "nuova" | "copia";

export interface DatiCopiaTipologia {
  origine: TipologiaListino;
  nome: string;
  suffisso: string;
  variazionePct: number | null;
  conProdotti: boolean;
}

interface Props {
  area: AreaListino;
  /** Tutte le tipologie dell'azienda: i nomi sono unici. */
  macrocategorie: ReadonlyArray<{ id: string; nome: string }>;
  modoIniziale?: ModoNuovaTipologia;
  origineIniziale?: TipologiaListino | null;
  inCorso: boolean;
  onChiudi: () => void;
  onCreaStandard?: (standard: TipologiaStandard) => void;
  onCreaTutteStandard?: () => void;
  onCreaNuova: (dati: { nome: string; accessorio: boolean }) => void;
  onCopia: (dati: DatiCopiaTipologia) => void;
}

export function NuovaTipologiaDialog({
  area,
  macrocategorie,
  modoIniziale,
  origineIniziale,
  inCorso,
  onChiudi,
  onCreaStandard,
  onCreaTutteStandard,
  onCreaNuova,
  onCopia,
}: Props) {
  // Le tipologie del fotovoltaico sono gli slot del configuratore: non si copiano.
  const copiabili = useMemo(
    () =>
      area.chiave === "fotovoltaico"
        ? []
        : area.tipologie.filter((t) => t.fonte === "macrocategoria" && !!t.macrocategoriaId && !t.standard?.fvCategoria),
    [area],
  );
  const conStandard = area.mancanti.length > 0 && !!onCreaStandard;
  const richiesto = modoIniziale ?? (conStandard ? "standard" : "nuova");
  const [modo, setModo] = useState<ModoNuovaTipologia>(
    (richiesto === "copia" && copiabili.length === 0) || (richiesto === "standard" && !conStandard) ? "nuova" : richiesto,
  );

  const [nome, setNome] = useState("");
  const [accessorio, setAccessorio] = useState(false);
  const nomeOccupato = nome.trim() !== "" && nomeTipologiaOccupato(nome, macrocategorie);

  const [origineChiave, setOrigineChiave] = useState(origineIniziale?.chiave ?? copiabili[0]?.chiave ?? "");
  const origine = copiabili.find((t) => t.chiave === origineChiave) ?? null;
  const [nomeCopia, setNomeCopia] = useState("");
  const [suffisso, setSuffisso] = useState("");
  const [variazione, setVariazione] = useState("");
  const [conProdotti, setConProdotti] = useState(true);
  const problemaCopia = origine
    ? problemaCopiaTipologia({ nome: nomeCopia, suffisso, variazione, conProdotti }, origine, macrocategorie)
    : "Scegli la tipologia da copiare.";
  const esempioProdotto = origine?.linee.flatMap((l) => l.righe)[0]?.famiglia.nome ?? null;
  const toccato = nomeCopia.trim() !== "" || suffisso.trim() !== "" || variazione.trim() !== "";

  const preventivatore = area.standard?.preventivatore?.toLowerCase();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuova tipologia nell&apos;area {area.nome}</DialogTitle>
          <DialogDescription>
            {preventivatore
              ? `Le tipologie dell'area arrivano nel ${preventivatore}.`
              : `Le tipologie raccolgono i prodotti dell'area ${area.nome}.`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={modo} onValueChange={(v) => setModo(v as ModoNuovaTipologia)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="standard" disabled={!conStandard}>
              Standard
            </TabsTrigger>
            <TabsTrigger value="nuova">Su misura</TabsTrigger>
            <TabsTrigger value="copia" disabled={copiabili.length === 0}>
              Copia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="standard" className="space-y-3 pt-2">
            <p className="text-sm text-muted-foreground">
              Le tipologie che vende chiunque lavori in quest&apos;area e che non hai ancora.
            </p>
            <ul className="divide-y rounded-md border">
              {area.mancanti.map((s) => {
                const nomeFinale = nomeTipologiaLibero(s.nome, macrocategorie, area.nome);
                return (
                  <li key={s.nome} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm">
                      {nomeFinale}
                      {s.accessorio && <span className="ml-1.5 text-xs text-muted-foreground">accessorio</span>}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1"
                      disabled={inCorso}
                      onClick={() => onCreaStandard?.(s)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Aggiungi
                    </Button>
                  </li>
                );
              })}
            </ul>
            {area.mancanti.length > 1 && onCreaTutteStandard && (
              <Button variant="ghost" size="sm" className="h-8 px-2 text-primary" disabled={inCorso} onClick={onCreaTutteStandard}>
                Aggiungile tutte ({area.mancanti.length})
              </Button>
            )}
          </TabsContent>

          <TabsContent value="nuova" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="tipologia-nome">Nome della tipologia</Label>
              <Input
                id="tipologia-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={area.chiave === "serramenti" ? "Es. Inferriate, Verande, Motori" : "Es. Kit, Ricambi"}
                autoFocus
                className="h-10"
              />
              {nomeOccupato && (
                <p className="text-xs text-destructive">Esiste già una tipologia «{nome.trim()}».</p>
              )}
            </div>
            {area.chiave === "serramenti" && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={accessorio} onCheckedChange={(v) => setAccessorio(v === true)} className="mt-0.5" />
                <span>
                  Si aggiunge alla finestra
                  <span className="block text-xs text-muted-foreground">
                    Nel preventivatore sta fra gli accessori, come tapparelle e zanzariere.
                  </span>
                </span>
              </label>
            )}
          </TabsContent>

          <TabsContent value="copia" className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="copia-origine">Tipologia da copiare</Label>
              <Select value={origineChiave} onValueChange={setOrigineChiave}>
                <SelectTrigger id="copia-origine" className="h-10">
                  <SelectValue placeholder="Scegli la tipologia" />
                </SelectTrigger>
                <SelectContent>
                  {copiabili.map((t) => (
                    <SelectItem key={t.chiave} value={t.chiave}>
                      {t.nome} · {t.articoli} {t.articoli === 1 ? "prodotto" : "prodotti"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="copia-nome">Nome della nuova tipologia</Label>
              <Input
                id="copia-nome"
                value={nomeCopia}
                onChange={(e) => setNomeCopia(e.target.value)}
                placeholder={origine ? `Es. ${origine.nome} alluminio` : ""}
                className="h-10"
              />
            </div>
            {origine && origine.articoli > 0 && (
              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={conProdotti} onCheckedChange={(v) => setConProdotti(v === true)} className="mt-0.5" />
                <span>
                  Copia anche i {origine.articoli} prodotti
                  <span className="block text-xs text-muted-foreground">
                    Con linee, varianti, griglie e schede. Senza, nasce vuota con le sole linee-cartella.
                  </span>
                </span>
              </label>
            )}
            {origine && origine.articoli > 0 && conProdotti && (
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div className="space-y-1.5">
                  <Label htmlFor="copia-suffisso">Da aggiungere ai nomi dei prodotti</Label>
                  <Input
                    id="copia-suffisso"
                    value={suffisso}
                    onChange={(e) => setSuffisso(e.target.value)}
                    placeholder="Es. Alluminio"
                    className="h-10"
                  />
                  {esempioProdotto && (
                    <p className="text-xs text-muted-foreground">
                      «{esempioProdotto}» diventa «{esempioProdotto}
                      {suffisso.trim() ? ` ${suffisso.trim()}` : " …"}»
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="copia-variazione">Prezzi %</Label>
                  <Input
                    id="copia-variazione"
                    value={variazione}
                    onChange={(e) => setVariazione(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 text-right"
                  />
                  <p className="text-xs text-muted-foreground">
                    {leggiPercentuale(variazione) ? "Acquisto e vendita" : "Uguali all'originale"}
                  </p>
                </div>
              </div>
            )}
            {toccato && problemaCopia && <p className="text-xs text-destructive">{problemaCopia}</p>}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            {modo === "standard" ? "Chiudi" : "Annulla"}
          </Button>
          {modo === "nuova" && (
            <Button
              onClick={() => onCreaNuova({ nome: nome.trim(), accessorio })}
              disabled={inCorso || !nome.trim() || nomeOccupato}
              className="h-10 w-full sm:w-auto"
            >
              {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Crea tipologia
            </Button>
          )}
          {modo === "copia" && origine && (
            <Button
              onClick={() =>
                onCopia({
                  origine,
                  nome: nomeCopia.trim(),
                  suffisso: suffisso.trim(),
                  variazionePct: leggiPercentuale(variazione),
                  conProdotti: conProdotti && origine.articoli > 0,
                })
              }
              disabled={inCorso || !!problemaCopia}
              className="h-10 w-full sm:w-auto"
            >
              {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Copia tipologia
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

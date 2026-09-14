/**
 * «+ Linea» in una tipologia.
 *
 * Nel listino si chiamano linea due cose diverse, e qui si sceglie quale:
 *  - stessi modelli, altro prezzo: la serie di profilo (Salamander 76 e 73),
 *    la classe di una porta. È un valore dell'asse «Linea» di ogni prodotto,
 *    con lo scostamento in percentuale dalla linea di riferimento. Si prende
 *    dalla libreria delle marche, si copia da una linea che c'è o si scrive;
 *  - prodotti diversi: tapparelle in PVC e in alluminio, la vasca tipo 1 e
 *    tipo 2. È una cartella della tipologia, e i prodotti ci si spostano.
 */
import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ETICHETTA_FASCIA,
  ETICHETTA_MATERIALE,
  useLibreriaSerramenti,
  type MarcaConSerie,
  type SerieSerramenti,
} from "@/hooks/useSerieSerramenti";
import { chiaveTesto } from "@/lib/listino/areeStandard";
import { formattaMaggiorazione } from "@/lib/listino/maggiorazione";
import type { AreaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import {
  eLineaBaseDeiModelli,
  haLineeDaAsse,
  leggiPercentuale,
  lineeDaAsse,
  nomeLineaDaSerie,
  problemaNomeLinea,
  prodottiSenzaLinee,
  scriviPercentuale,
} from "@/lib/listino/organizzaListino";

export interface DatiLineaAsse {
  nome: string;
  scostamentoPct: number;
  /** Solo per la prima linea di una tipologia: il nome di quella che c'è adesso. */
  nomeBase: string | null;
  copiaDa: string | null;
  immagineUrl: string | null;
}

type TipoLinea = "asse" | "categoria";
type FonteLinea = "libreria" | "copia" | "nuova";

interface Props {
  area: AreaListino;
  tipologia: TipologiaListino;
  inCorso: boolean;
  onChiudi: () => void;
  onCreaCategoria: (nome: string) => void;
  onCreaAsse: (dati: DatiLineaAsse) => void;
}

export function NuovaLineaDialog({ area, tipologia, inCorso, onChiudi, onCreaCategoria, onCreaAsse }: Props) {
  const conAsse = haLineeDaAsse(tipologia);
  const serramenti = area.chiave === "serramenti";
  const copiabili = useMemo(() => lineeDaAsse(tipologia).filter((l) => !eLineaBaseDeiModelli(l.nome)), [tipologia]);
  const haCartelle = tipologia.linee.some((l) => l.fonte === "categoria");
  const riferimento = lineeDaAsse(tipologia).find((l) => l.base) ?? copiabili[0] ?? null;
  const senzaLinee = prodottiSenzaLinee(tipologia);

  const [tipo, setTipo] = useState<TipoLinea>(
    conAsse ? "asse" : haCartelle || tipologia.articoli === 0 ? "categoria" : "asse",
  );
  const [fonte, setFonte] = useState<FonteLinea>(
    serramenti ? "libreria" : conAsse && copiabili.length > 0 ? "copia" : "nuova",
  );
  const [nome, setNome] = useState("");
  const [pct, setPct] = useState("0");
  const [nomeBase, setNomeBase] = useState("");
  const [origine, setOrigine] = useState<string>("");
  const [serie, setSerie] = useState<SerieSerramenti | null>(null);

  const primaLinea = tipo === "asse" && !conAsse;
  const pctNumero = leggiPercentuale(pct);
  const problemaNome = nome.trim() ? problemaNomeLinea(nome, tipologia, tipo) : null;
  const problemaPct =
    tipo !== "asse"
      ? null
      : pctNumero === null
        ? "Scrivi lo scostamento come numero, per esempio −8 o 0."
        : pctNumero <= -100
          ? "Uno scostamento del −100% o meno azzera il prezzo."
          : null;
  const problemaBase =
    primaLinea && nomeBase.trim() && nome.trim() && chiaveTesto(nomeBase) === chiaveTesto(nome)
      ? "La linea di adesso e quella nuova devono avere nomi diversi."
      : null;
  const pronto =
    nome.trim() !== "" &&
    !problemaNome &&
    !problemaPct &&
    !problemaBase &&
    (!primaLinea || nomeBase.trim() !== "");

  const scegliSerie = (s: SerieSerramenti, marca: MarcaConSerie) => {
    setSerie(s);
    setNome(nomeLineaDaSerie(ETICHETTA_MATERIALE[s.materiale] ?? s.materiale, marca.nome, s.nome));
    setPct(scriviPercentuale(Number(s.differenza_pct) || 0) || "0");
  };

  const scegliOrigine = (chiave: string) => {
    setOrigine(chiave);
    const linea = copiabili.find((l) => l.chiave === chiave);
    if (linea?.scostamentoPct != null) setPct(scriviPercentuale(linea.scostamentoPct) || "0");
  };

  const conferma = () => {
    if (!pronto) return;
    if (tipo === "categoria") {
      onCreaCategoria(nome.trim());
      return;
    }
    onCreaAsse({
      nome: nome.trim(),
      scostamentoPct: pctNumero ?? 0,
      nomeBase: primaLinea ? nomeBase.trim() : null,
      copiaDa: fonte === "copia" ? (copiabili.find((l) => l.chiave === origine)?.nome ?? null) : null,
      immagineUrl: fonte === "libreria" ? (serie?.immagine_url ?? null) : null,
    });
  };

  const fonti: Array<[FonteLinea, string]> = [
    ...(serramenti ? [["libreria", "Dalla libreria"] as [FonteLinea, string]] : []),
    ...(conAsse && copiabili.length > 0 ? [["copia", "Copia una linea"] as [FonteLinea, string]] : []),
    ["nuova", "Scritta da te"],
  ];
  const fonteVisibile = fonti.some(([f]) => f === fonte) ? fonte : fonti[0][0];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !inCorso) onChiudi();
      }}
    >
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuova linea in {tipologia.nome}</DialogTitle>
          <DialogDescription>
            {conAsse
              ? `Una linea con gli stessi ${tipologia.articoli} modelli e un altro prezzo, accanto a ${copiabili.map((l) => l.nome).join(", ")}.`
              : "Scegli se la linea ha gli stessi modelli con un altro prezzo o prodotti diversi."}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-1">
          {!conAsse && (
            <div role="radiogroup" aria-label="Che cosa cambia nella nuova linea" className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["asse", "Stessi modelli, altro prezzo", "Un'altra serie di profilo, una classe superiore: ogni prodotto la avrà con uno scostamento in %."],
                  ["categoria", "Prodotti diversi", "Tapparelle in PVC e in alluminio: una cartella in cui sposti i prodotti."],
                ] as Array<[TipoLinea, string, string]>
              ).map(([valore, titolo, testo]) => {
                const bloccata = valore === "asse" && tipologia.articoli === 0;
                const attiva = tipo === valore;
                return (
                  <button
                    key={valore}
                    type="button"
                    role="radio"
                    aria-checked={attiva}
                    disabled={bloccata}
                    onClick={() => setTipo(valore)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                      attiva ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="block text-sm font-medium">{titolo}</span>
                    <span className="block text-xs text-muted-foreground">
                      {bloccata ? "Serve almeno un prodotto nella tipologia." : testo}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {tipo === "asse" && fonti.length > 1 && (
            <Tabs value={fonteVisibile} onValueChange={(v) => setFonte(v as FonteLinea)}>
              <TabsList className={cn("grid w-full", fonti.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                {fonti.map(([valore, etichetta]) => (
                  <TabsTrigger key={valore} value={valore}>
                    {etichetta}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {tipo === "asse" && fonteVisibile === "libreria" && <SceltaSerie scelta={serie} onScegli={scegliSerie} />}

          {tipo === "asse" && fonteVisibile === "copia" && (
            <div className="space-y-1.5">
              <Label>Linea da copiare</Label>
              <div className="flex flex-wrap gap-1.5">
                {copiabili.map((l) => (
                  <button
                    key={l.chiave}
                    type="button"
                    onClick={() => scegliOrigine(l.chiave)}
                    aria-pressed={origine === l.chiave}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
                      origine === l.chiave ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                    )}
                  >
                    {l.nome}
                    {!l.base && l.scostamentoPct != null && (
                      <span className="text-[11px] font-semibold tabular-nums opacity-80">
                        {formattaMaggiorazione("percentuale", l.scostamentoPct)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                La nuova linea parte dallo scostamento e dalla foto di quella scelta.
              </p>
            </div>
          )}

          <div className={cn("grid gap-3", tipo === "asse" ? "sm:grid-cols-[1fr_8rem]" : "")}>
            {primaLinea && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="linea-base">Nome della linea che la tipologia ha adesso</Label>
                <Input
                  id="linea-base"
                  value={nomeBase}
                  onChange={(e) => setNomeBase(e.target.value)}
                  placeholder={serramenti ? "Es. PVC Salamander 76" : "Es. Classe 3"}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Diventa la linea di riferimento (0%) dei {tipologia.articoli} prodotti, con i prezzi di oggi.
                </p>
                {problemaBase && <p className="text-xs text-destructive">{problemaBase}</p>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="linea-nome">{primaLinea ? "Nome della linea nuova" : "Nome della linea"}</Label>
              <Input
                id="linea-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder={
                  tipo === "categoria"
                    ? "Es. PVC, Alluminio coibentato, Linea vasca tipo 1"
                    : serramenti
                      ? "Es. PVC Salamander bluEvolution 73"
                      : "Es. Classe 4"
                }
                className="h-10"
                autoFocus={fonteVisibile !== "libreria"}
              />
              {problemaNome && <p className="text-xs text-destructive">{problemaNome}</p>}
            </div>
            {tipo === "asse" && (
              <div className="space-y-1.5">
                <Label htmlFor="linea-pct">Scostamento %</Label>
                <Input
                  id="linea-pct"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  inputMode="decimal"
                  className="h-10 text-right"
                />
                {problemaPct && nome.trim() && <p className="text-xs text-destructive">{problemaPct}</p>}
              </div>
            )}
          </div>

          {tipo === "asse" && (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {riferimento
                ? `Lo scostamento si calcola sul prezzo di ${riferimento.nome}: −8 costa l'8% in meno, +12 il 12% in più.`
                : "Lo scostamento si calcola sul prezzo di oggi dei prodotti: −8 costa l'8% in meno."}{" "}
              {senzaLinee > 0 &&
                `${senzaLinee} ${senzaLinee === 1 ? "prodotto non ha" : "prodotti non hanno"} le linee della tipologia e non la ${senzaLinee === 1 ? "riceverà" : "riceveranno"}: dagli prima le linee dal menu della tipologia.`}
            </p>
          )}
          {tipo === "categoria" && (
            <p className="text-xs text-muted-foreground">
              Dopo sposti i prodotti nella linea dal menu di ogni prodotto, oppure li crei già lì con «Prodotto in».
            </p>
          )}
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-2">
          <Button variant="ghost" onClick={onChiudi} disabled={inCorso} className="h-10 w-full sm:w-auto">
            Annulla
          </Button>
          <Button onClick={conferma} disabled={inCorso || !pronto} className="h-10 w-full sm:w-auto">
            {inCorso ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Creazione…
              </>
            ) : tipo === "asse" && !primaLinea ? (
              `Aggiungi a ${tipologia.articoli - senzaLinee} prodotti`
            ) : (
              "Crea linea"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Marche e serie della libreria di piattaforma. */
function SceltaSerie({
  scelta,
  onScegli,
}: {
  scelta: SerieSerramenti | null;
  onScegli: (serie: SerieSerramenti, marca: MarcaConSerie) => void;
}) {
  const { data: libreria = [], isLoading, isError } = useLibreriaSerramenti();
  const [marcaId, setMarcaId] = useState<string | null>(null);
  const marca = libreria.find((m) => m.id === (marcaId ?? scelta?.marca_id)) ?? null;

  if (isLoading) return <p className="text-sm text-muted-foreground">Carico la libreria delle marche…</p>;
  if (isError) return <p className="text-sm text-destructive">La libreria delle marche non si è caricata: scrivi la linea a mano.</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Marca">
        {libreria.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={m.id === marca?.id}
            onClick={() => setMarcaId(m.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              m.id === marca?.id ? "border-primary bg-primary/10 font-medium text-primary" : "hover:bg-muted",
            )}
          >
            {m.nome}
          </button>
        ))}
      </div>
      {marca && (
        <div className="grid max-h-56 gap-2 overflow-y-auto sm:grid-cols-2">
          {marca.serie.map((s) => {
            const attiva = s.id === scelta?.id;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={attiva}
                onClick={() => onScegli(s, marca)}
                className={cn(
                  "flex items-start justify-between gap-2 rounded-lg border p-2.5 text-left transition-colors",
                  attiva ? "border-primary bg-primary/5" : "hover:bg-muted/50",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.nome}</span>
                  <span className="block text-xs text-muted-foreground">
                    {ETICHETTA_MATERIALE[s.materiale] ?? s.materiale}
                    {Number(s.differenza_pct) ? ` · ${formattaMaggiorazione("percentuale", Number(s.differenza_pct))} suggerito` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {s.fascia && (
                    <Badge variant="secondary" className="text-[10px]">
                      {ETICHETTA_FASCIA[s.fascia]}
                    </Badge>
                  )}
                  {attiva && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                </span>
              </button>
            );
          })}
          {marca.serie.length === 0 && (
            <p className="text-sm text-muted-foreground">Per questa marca non ci sono ancora serie in libreria.</p>
          )}
        </div>
      )}
    </div>
  );
}

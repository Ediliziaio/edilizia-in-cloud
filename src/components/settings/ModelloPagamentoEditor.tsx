// src/components/settings/ModelloPagamentoEditor.tsx
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { rimuovi, sostituisci, sposta } from "@/lib/orders/modelliFasi";
import {
  EVENTI_MODELLO, mettiIlResto, normalizzaTipi, numeraSal, sommaPercentuali, validaBozzaPagamento,
  type BozzaModelloPagamento, type EventoModello, type PayloadModelloPagamento, type RataModello,
} from "@/lib/orders/modelliPagamento";
import { GRUPPI_EVENTO, eventiDelGruppo } from "@/lib/orders/rateEventi";

interface Props {
  aperto: boolean;
  bozzaIniziale: BozzaModelloPagamento | null;
  salvataggio: boolean;
  onChiudi: () => void;
  onSalva: (payload: PayloadModelloPagamento) => void;
}

/** Si monta solo da aperto: ogni apertura riparte dalla sua bozza, senza un effetto che la ricopi. */
export default function ModelloPagamentoEditor({ aperto, bozzaIniziale, ...resto }: Props) {
  if (!aperto || !bozzaIniziale) return null;
  return <EditorAperto bozzaIniziale={bozzaIniziale} {...resto} />;
}

const nuovaRata = (): RataModello => ({ nome: "Rata", percent: 0, tipo: "deposit", evento: "data_fissa", numero: null, preavviso: 7 });

function EditorAperto({ bozzaIniziale, salvataggio, onChiudi, onSalva }: Omit<Props, "aperto" | "bozzaIniziale"> & { bozzaIniziale: BozzaModelloPagamento }) {
  const [bozza, setBozza] = useState<BozzaModelloPagamento>(bozzaIniziale);
  // Esc o un clic fuori non devono buttare via il lavoro: con modifiche si chiede conferma (come per i modelli di fasi).
  const conferma = useSettingsDraftGuard(salvataggio || JSON.stringify(bozza) !== JSON.stringify(bozzaIniziale));
  const chiudi = () => { if (!salvataggio && conferma()) onChiudi(); };
  // I tipi seguono la posizione: tutte acconti, l'ultima è il saldo.
  const righe = normalizzaTipi(bozza.righe);
  const cambiaRighe = (nuove: RataModello[]) => setBozza({ ...bozza, righe: nuove });
  const cambiaRata = (i: number, patch: Partial<RataModello>) => cambiaRighe(sostituisci(righe, i, patch));
  const cambiaEvento = (i: number, evento: EventoModello) =>
    cambiaRighe(numeraSal(sostituisci(righe, i, { evento, numero: evento === "sal_numero" ? righe[i].numero : null })));
  // Una rata nuova si mette prima del saldo, che resta l'ultima.
  const aggiungi = () => cambiaRighe([...righe.slice(0, -1), nuovaRata(), ...righe.slice(-1)]);

  const somma = sommaPercentuali(righe);
  const aCento = Math.abs(somma - 100) <= 0.01;

  const salva = () => {
    if (salvataggio) return;
    const esito = validaBozzaPagamento(bozza);
    // Con strictNullChecks spento `!esito.ok` non restringe il tipo: si confronta con false.
    if (esito.ok === false) { toast.error(esito.errore); return; }
    onSalva(esito.payload);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) chiudi(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{bozza.id ? "Modifica il modello" : "Nuovo modello di pagamento"}</DialogTitle>
          <DialogDescription>
            Ogni rata è una parte del totale con IVA e dice quando si incassa. L'ultima rata è il saldo: prende quello che resta.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={salvataggio} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="piano-nome">Nome del modello</Label>
              <Input id="piano-nome" value={bozza.nome} maxLength={80} onChange={(e) => setBozza({ ...bozza, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="piano-desc">A cosa serve (facoltativo)</Label>
              <Input id="piano-desc" value={bozza.descrizione} maxLength={200} onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })} />
            </div>
          </div>

          <ol className="space-y-2">
            {righe.map((r, i) => (
              <li key={i} className="rounded-lg border bg-muted/20 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{r.tipo === "balance" ? "Saldo" : `Rata ${i + 1}`}</span>
                  <Input
                    value={r.nome} maxLength={80} placeholder="Nome della rata" aria-label={`Nome rata ${i + 1}`}
                    onChange={(e) => cambiaRata(i, { nome: e.target.value })} className="h-9 min-w-[10rem] flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} max={100} step={0.5} value={r.percent} aria-label={`Percentuale rata ${i + 1}`}
                      onChange={(e) => cambiaRata(i, { percent: e.target.value === "" ? 0 : Number(e.target.value) })} className="h-9 w-20"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <Select value={r.evento} onValueChange={(v) => cambiaEvento(i, v as EventoModello)}>
                    <SelectTrigger className="h-9 w-[15rem] text-sm" aria-label={`Quando si incassa la rata ${i + 1}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRUPPI_EVENTO.map((g) => {
                        const voci = eventiDelGruppo(g.value).filter((e) => (EVENTI_MODELLO as readonly string[]).includes(e.value));
                        if (voci.length === 0) return null;
                        return (
                          <SelectGroup key={g.value}>
                            <SelectLabel>{g.label}</SelectLabel>
                            {voci.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  {r.evento === "sal_numero" && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      n.
                      <Input
                        type="number" min={1} max={99} value={r.numero ?? ""} aria-label={`Numero del SAL rata ${i + 1}`}
                        onChange={(e) => cambiaRata(i, { numero: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-16"
                      />
                    </span>
                  )}
                  <span className="ml-auto flex items-center">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta su rata ${i + 1}`} disabled={i === 0} onClick={() => cambiaRighe(sposta(righe, i, -1))}>
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Sposta giù rata ${i + 1}`} disabled={i === righe.length - 1} onClick={() => cambiaRighe(sposta(righe, i, 1))}>
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-rose-600" aria-label={`Togli rata ${i + 1}`} disabled={righe.length === 1} onClick={() => cambiaRighe(rimuovi(righe, i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </span>
                </div>
              </li>
            ))}
          </ol>

          {righe.some((r) => r.evento === "sal_numero") && (
            <p className="text-xs text-muted-foreground">
              Quando matura il SAL (appena lo emetti, o quando il cliente lo approva) lo scegli nella sezione «Quando matura la rata di un SAL», in fondo alla pagina.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={aggiungi} disabled={righe.length >= 12}>
              <Plus className="mr-1 h-4 w-4" />Aggiungi una rata
            </Button>
            <div className="flex items-center gap-2 text-sm">
              <span className={aCento ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                Totale {String(somma).replace(".", ",")}%{aCento ? "" : somma < 100 ? ` · manca il ${String(Math.round((100 - somma) * 100) / 100).replace(".", ",")}%` : ` · ${String(Math.round((somma - 100) * 100) / 100).replace(".", ",")}% di troppo`}
              </span>
              {!aCento && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => cambiaRighe(mettiIlResto(righe))}>
                  Metti il resto sul saldo
                </Button>
              )}
            </div>
          </div>
        </fieldset>

        <DialogFooter>
          <Button variant="outline" disabled={salvataggio} onClick={chiudi}>Annulla</Button>
          <Button onClick={salva} disabled={salvataggio}>Salva modello</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

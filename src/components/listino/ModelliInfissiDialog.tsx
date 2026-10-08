/**
 * «Modelli di infissi»: scrivi i modelli che vendi (PVC Aluplast, PVC Salamander 72, Alluminio…) e il sistema crea
 * da solo, per ciascuno, tutte le tipologie col disegno: finestre, porte finestra, scorrevoli, sagome, monoblocchi
 * e le persiane. Si parte dal modello «Infissi con disegno automatico» (le tipologie di Demo Azienda 2).
 * Si può ripetere: un modello che c'è già non si duplica.
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Layers, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useAnteprimaInstallazione, useModelliAreaMutations, useModelliDisponibili } from "@/hooks/useModelliArea";
import { haMaggiorazioniDaCopiare, messaggioErroreInstallazione, tipoErroreInstallazione } from "@/lib/listino/modelliArea";
import { AvvisoInstallazioneModello } from "./AvvisoInstallazioneModello";

const NOME_MODELLO = "Infissi con disegno automatico";
const SUGGERITI = ["PVC Aluplast", "PVC Salamander", "Alluminio"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  /** Linee (modelli) che l'azienda ha già, per non riscriverle. */
  giaPresenti: string[];
}

export function ModelliInfissiDialog({ open, onOpenChange, companyId, giaPresenti }: Props) {
  const { data: disponibili = [] } = useModelliDisponibili(open);
  const modello = disponibili.find((m) => m.nome === NOME_MODELLO);
  const { installa } = useModelliAreaMutations();
  const [nomi, setNomi] = useState<string[]>([]);
  const [bozza, setBozza] = useState("");
  const [inCorso, setInCorso] = useState(false);
  const [copia, setCopia] = useState(true);
  // Un secondo click prima che la finestra se ne accorga non parte.
  const invioInCorso = useRef(false);

  const elenco = bozza.trim() ? [...nomi, bozza.trim()] : nomi;
  // Cosa succederebbe alle maggiorazioni dell'azienda con questi nomi. Si aspetta che finisca di scrivere: a ogni
  // lettera cambierebbe l'elenco e partirebbe una richiesta.
  const nomiVisti = useDebounce(elenco.join("\u0001"), 400);
  const anteprima = useAnteprimaInstallazione({
    modelloId: modello?.id ?? null,
    companyId,
    modelli: nomiVisti ? nomiVisti.split("\u0001") : [],
    enabled: open && !!nomiVisti,
  });
  // L'anteprima è per l'elenco di un attimo fa: se l'elenco è appena cambiato non è ancora quella giusta.
  const anteprimaAggiornata = nomiVisti === elenco.join("\u0001");
  const inAttesa = elenco.length > 0 && (!anteprimaAggiornata || anteprima.isLoading);

  const aggiungi = (testo: string) => {
    const t = testo.trim();
    if (!t) return;
    setNomi((prima) => (prima.some((n) => n.toLowerCase() === t.toLowerCase()) ? prima : [...prima, t]));
    setBozza("");
  };

  const crea = async () => {
    if (!companyId || !modello || invioInCorso.current) return;
    invioInCorso.current = true;
    setInCorso(true);
    let prodotti = 0;
    let giaFatti = 0;
    // Se c'è da scegliere si passa la scelta; se non c'è niente da copiare non si passa nulla, così il database
    // resta la rete di sicurezza anche quando l'anteprima è vecchia.
    const daScegliere = haMaggiorazioniDaCopiare(anteprima.data);
    try {
      // Un modello alla volta: ogni passo è tutto o niente e l'elenco avanza.
      for (const nome of elenco) {
        try {
          const esito = await installa.mutateAsync({
            modelloId: modello.id,
            companyId,
            modelli: [nome],
            copiaMaggiorazioni: daScegliere ? copia : undefined,
          });
          prodotti += esito.prodotti_nuovi ?? 0;
        } catch (e) {
          // Lo stesso nome aggiunto meno di un minuto fa, o che si sta aggiungendo adesso: c'è già, si passa al prossimo.
          const tipo = tipoErroreInstallazione(e);
          if (tipo === "recente" || tipo === "in_corso") {
            giaFatti += 1;
            continue;
          }
          throw e;
        }
      }
      const creati = elenco.length - giaFatti;
      if (creati === 0) {
        toast.info(elenco.length === 1 ? "Questo modello è già stato aggiunto da poco" : "Questi modelli sono già stati aggiunti da poco");
      } else {
        toast.success(`Creato: ${creati} ${creati === 1 ? "modello" : "modelli"}, ${prodotti} prodotti con disegno`);
      }
      setNomi([]);
      setBozza("");
      onOpenChange(false);
    } catch (e) {
      if (tipoErroreInstallazione(e) === "scelta_maggiorazioni") {
        toast.warning("Prima scegli cosa fare delle maggiorazioni", { description: messaggioErroreInstallazione(e) });
        void anteprima.refetch();
      } else {
        toast.error("Non è andata fino in fondo", { description: messaggioErroreInstallazione(e) });
      }
    } finally {
      invioInCorso.current = false;
      setInCorso(false);
    }
  };

  const daCreare = nomi.length + (bozza.trim() ? 1 : 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" aria-hidden="true" /> Modelli di infissi
          </DialogTitle>
          <DialogDescription>
            Scrivi i modelli che vendi. Per ciascuno il sistema crea in automatico tutte le tipologie col disegno (finestre, porte finestra, scorrevoli, sagome, monoblocchi) e le persiane.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={bozza}
              onChange={(e) => setBozza(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  aggiungi(bozza);
                }
              }}
              placeholder="Per esempio: PVC Aluplast Ideal 5000"
              aria-label="Nome del modello"
              disabled={inCorso}
            />
            <Button type="button" variant="outline" onClick={() => aggiungi(bozza)} disabled={inCorso || !bozza.trim()}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Aggiungi
            </Button>
          </div>

          {nomi.length === 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              Per iniziare:
              {SUGGERITI.map((s) => (
                <Button key={s} type="button" size="sm" variant="ghost" className="h-7 border border-dashed px-2" onClick={() => aggiungi(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}

          {nomi.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {nomi.map((n) => (
                <li key={n} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-1 pl-3 pr-1 text-sm">
                  {n}
                  <button type="button" className="rounded-full p-1 hover:bg-muted" onClick={() => setNomi((p) => p.filter((x) => x !== n))} aria-label={`Togli ${n}`} disabled={inCorso}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {giaPresenti.length > 0 && (
            <p className="text-xs text-muted-foreground">Hai già: {giaPresenti.join(", ")}. Se riscrivi un nome uguale non viene duplicato.</p>
          )}
          {!modello && <p className="text-xs text-destructive">Il modello degli infissi non è ancora disponibile.</p>}

          {elenco.length > 0 && (
            <AvvisoInstallazioneModello
              anteprima={anteprimaAggiornata ? anteprima.data : undefined}
              caricamento={inAttesa}
              copia={copia}
              onCopia={setCopia}
              disabilitato={inCorso}
            />
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Non ora
          </Button>
          <Button onClick={crea} disabled={inCorso || !modello || daCreare === 0 || inAttesa}>
            {inCorso ? "Creo il listino…" : `Crea ${daCreare || ""} ${daCreare === 1 ? "modello" : "modelli"}`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

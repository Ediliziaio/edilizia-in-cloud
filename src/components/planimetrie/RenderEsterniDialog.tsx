import { vincoloInfissiProgetto } from "../../../shared/planimetrie/materialiProgetto.ts";
/**
 * Render degli esterni dalla pianta: piscina, pergola, giardino, facciata, pavimento esterno.
 *
 * Quei render partono da una foto. Qui la foto è una vista 3D della pianta presa da fuori
 * (dal giardino, sul lato scelto, oppure di tre quarti): la si guarda, poi «Continua» apre la
 * pagina del render con la vista già caricata. Da lì tutto è come con una foto vera: stessi
 * crediti, stesse scelte. Piscine, pergole e alberi disegnati nella pianta compaiono nella
 * vista e il render li veste. La casa ha l'aspetto scelto nel 3D (facciata, infissi, ora, alberi): lo stesso
 * che si vede girando intorno, e una frase lo racconta all'AI perché non cambi i materiali.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { caricaFotogramma } from "@/components/planimetrie/Vista3DPigra";
import { costruisciScena, limitiDi, scenaEdificio, vistaDalGiardino, vistaGiroIntorno, type LatoEsterno, type PiantaPer3D, type PianoPer3D } from "@/lib/planimetrie/tred";
import { lasciaFotoDaPianta, MODULI_ESTERNI, MOMENTI_ESTERNI, type ModuloEsterno } from "@/lib/planimetrie/render/fotoDaPianta";
import { descriviAspetto, FACCIATE, ID_FACCIATE, ID_INFISSI, INFISSI, leggiAspetto, salvaAspetto, type OpzioniAspetto } from "@/lib/planimetrie/tred/aspettoOpzioni";

type Inquadratura = LatoEsterno | "tre_quarti";

/** A che ora è il sole nel momento scelto. */
const ORA_DEL_MOMENTO: Record<string, number> = { giorno: 14, tramonto: 18.3, sera: 19, inverno: 13, primavera: 14 };

const INQUADRATURE: Array<{ valore: Inquadratura; nome: string }> = [
  { valore: "sud", nome: "Da sud" },
  { valore: "est", nome: "Da est" },
  { valore: "nord", nome: "Da nord" },
  { valore: "ovest", nome: "Da ovest" },
  { valore: "tre_quarti", nome: "Dall'alto" },
];

interface Props {
  aperto: boolean;
  onChiudi: () => void;
  pianta: PiantaPer3D;
  vista: "fatto" | "progetto";
  titolo: string;
  /** Il modulo proposto all'apertura (con una piscina disegnata: «Piscina»). */
  moduloIniziale?: ModuloEsterno;
  /** Con più piani la casa si vede intera, tutti i piani uno sopra l'altro. */
  piani?: PianoPer3D[];
}

export function RenderEsterniDialog({ aperto, onChiudi, pianta, vista, titolo, moduloIniziale, piani }: Props) {
  const navigate = useNavigate();
  // finché non se ne sceglie un altro vale quello proposto (con una piscina disegnata: «Piscina»)
  const [scelto, setScelto] = useState<ModuloEsterno | null>(null);
  const modulo = scelto ?? moduloIniziale ?? "giardini";
  const setModulo = setScelto;
  const [inquadratura, setInquadratura] = useState<Inquadratura>("sud");
  const [momento, setMomento] = useState(MOMENTI_ESTERNI[0].id);
  const [asp, setAsp] = useState<OpzioniAspetto>(() => leggiAspetto());
  const cambiaAsp = (campi: Partial<OpzioniAspetto>) => setAsp((a) => { const n = { ...a, ...campi }; salvaAspetto(n); return n; });
  const scegliMomento = (id: string) => {
    setMomento(id);
    if (ORA_DEL_MOMENTO[id]) cambiaAsp({ ora: ORA_DEL_MOMENTO[id] });
  };
  // anteprima ed errore ricordano per quale inquadratura sono: se non è quella di adesso, si sta caricando
  const [anteprima, setAnteprima] = useState<{ url: string; file: File; per: Inquadratura; chiave: string } | null>(null);
  const [errore, setErrore] = useState<{ testo: string; per: Inquadratura } | null>(null);

  const { limiti, casa } = useMemo(() => {
    const s = piani && piani.length > 1 ? scenaEdificio(piani, { vista, soffitto: true, elementi: true }) : costruisciScena(pianta, { vista, soffitto: true, elementi: true });
    const muri = limitiDi(s.mesh, (g) => g === "muro");
    return { limiti: s.limiti, casa: Number.isFinite(muri.min[0]) ? muri : s.limiti };
  }, [pianta, piani, vista]);
  const localeId = pianta.locali[0]?.id;
  const chiaveAspetto = JSON.stringify(asp);

  useEffect(() => {
    if (!aperto || !localeId) return;
    let annullato = false;
    let url: string | null = null;
    // un attimo di pausa: scorrendo l'ora o cambiando facciata non si rifà la vista a ogni passo
    const attesa = setTimeout(() => (async () => {
      try {
        const cattura = await caricaFotogramma();
        const telecamera = inquadratura === "tre_quarti" ? vistaGiroIntorno(limiti, 4 / 3) : vistaDalGiardino(limiti, inquadratura, 60, casa);
        const f = await cattura({ pianta, localeId, telecamera, vista, larghezza: 1280, altezza: 960, terreno: 40, piani, aspetto: asp });
        if (annullato) return;
        url = URL.createObjectURL(f.png);
        const chiave = JSON.stringify(asp);
        const nome = `${titolo.replace(/[^\w-]+/g, "-").slice(0, 40) || "pianta"}-esterno.png`;
        setAnteprima({ url, file: new File([f.png], nome, { type: "image/png" }), per: inquadratura, chiave });
      } catch (e) {
        if (!annullato) setErrore({ testo: e instanceof Error ? e.message : "Vista non creata.", per: inquadratura });
      }
    })(), 350);
    return () => {
      annullato = true;
      clearTimeout(attesa);
      if (url) URL.revokeObjectURL(url);
    };
  }, [aperto, inquadratura, limiti, casa, localeId, pianta, piani, titolo, vista, asp, chiaveAspetto]);

  // con l'aspetto cambiato l'anteprima vecchia resta finché non arriva la nuova
  const carico = !!localeId && ((anteprima?.per !== inquadratura && errore?.per !== inquadratura) || (anteprima?.chiave !== chiaveAspetto && errore?.per !== inquadratura));
  const erroreOra = errore?.per === inquadratura && anteprima?.per !== inquadratura ? errore.testo : null;

  const continua = () => {
    if (!anteprima) return;
    const m = MODULI_ESTERNI.find((x) => x.modulo === modulo)!;
    const nota = [MOMENTI_ESTERNI.find((x) => x.id === momento)?.nota, descriviAspetto(asp, pianta.tetto), vincoloInfissiProgetto(pianta.infissiProgetto)].filter(Boolean).join(" ");
    lasciaFotoDaPianta(modulo, anteprima.file, nota || undefined);
    onChiudi();
    toast.success("Vista 3D caricata come foto di partenza");
    navigate(m.percorso);
  };

  return (
    <Dialog open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Render degli esterni</DialogTitle>
          <DialogDescription>
            La vista 3D della pianta, presa da fuori, diventa la foto di partenza del render. Piscine, pergole e alberi disegnati nella pianta ci sono già.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Cosa vuoi vedere</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULI_ESTERNI.map((m) => (
                <button
                  key={m.modulo}
                  type="button"
                  onClick={() => setModulo(m.modulo)}
                  className={`rounded-md border p-2.5 text-left text-sm transition ${modulo === m.modulo ? "border-primary bg-primary/5 dark:bg-primary/10" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">{m.nome}</div>
                  <div className="text-xs text-muted-foreground">{m.descrizione}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Da dove</Label>
            <ToggleGroup type="single" value={inquadratura} onValueChange={(v) => v && setInquadratura(v as Inquadratura)} variant="outline" size="sm" className="flex-wrap justify-start">
              {INQUADRATURE.map((i) => <ToggleGroupItem key={i.valore} value={i.valore}>{i.nome}</ToggleGroupItem>)}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">Sud è il lato in basso della pianta.</p>
          </div>
          <div className="space-y-2">
            <Label>Luce e stagione</Label>
            <ToggleGroup type="single" value={momento} onValueChange={(v) => v && scegliMomento(v)} variant="outline" size="sm" className="flex-wrap justify-start">
              {MOMENTI_ESTERNI.map((m) => <ToggleGroupItem key={m.id} value={m.id}>{m.nome}</ToggleGroupItem>)}
            </ToggleGroup>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Switch id="esterni-realistico" checked={asp.realistico} onCheckedChange={(v) => cambiaAsp({ realistico: v })} />
              <Label htmlFor="esterni-realistico">Aspetto della casa come nel 3D</Label>
            </div>
            {asp.realistico && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={asp.facciata} onValueChange={(v) => cambiaAsp({ facciata: v as OpzioniAspetto["facciata"] })}>
                  <SelectTrigger className="h-8 w-48" aria-label="Facciata"><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_FACCIATE.map((id) => <SelectItem key={id} value={id}>{FACCIATE[id].nome}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={asp.infissi} onValueChange={(v) => cambiaAsp({ infissi: v as OpzioniAspetto["infissi"] })}>
                  <SelectTrigger className="h-8 w-52" aria-label="Infissi"><SelectValue /></SelectTrigger>
                  <SelectContent>{ID_INFISSI.map((id) => <SelectItem key={id} value={id}>Infissi: {INFISSI[id].nome.toLowerCase()}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Switch id="esterni-alberi" checked={asp.alberi} onCheckedChange={(v) => cambiaAsp({ alberi: v })} />
                  <Label htmlFor="esterni-alberi">Alberi</Label>
                </div>
              </div>
            )}
          </div>
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted">
            {anteprima && <img src={anteprima.url} alt="Vista 3D da fuori" className="h-full w-full object-cover" />}
            {carico && <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />}
            {erroreOra && <p className="p-4 text-sm text-destructive">{erroreOra}</p>}
            {!localeId && <p className="p-4 text-sm text-muted-foreground">La pianta non ha stanze: disegnale prima.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={continua} disabled={!anteprima || carico || anteprima.chiave !== chiaveAspetto} className="bg-primary hover:bg-primary/90">Continua col render</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

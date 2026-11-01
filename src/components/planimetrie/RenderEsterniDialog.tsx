/**
 * Render degli esterni dalla pianta: piscina, pergola, giardino, facciata, pavimento esterno.
 *
 * Quei render partono da una foto. Qui la foto è una vista 3D della pianta presa da fuori
 * (dal giardino, sul lato scelto, oppure di tre quarti): la si guarda, poi «Continua» apre la
 * pagina del render con la vista già caricata. Da lì tutto è come con una foto vera: stessi
 * crediti, stesse scelte. Piscine, pergole e alberi disegnati nella pianta compaiono nella
 * vista e il render li veste.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { caricaFotogramma } from "@/components/planimetrie/Vista3DPigra";
import { costruisciScena, limitiDi, scenaEdificio, vistaDalGiardino, vistaGiroIntorno, type LatoEsterno, type PiantaPer3D, type PianoPer3D } from "@/lib/planimetrie/tred";
import { lasciaFotoDaPianta, MODULI_ESTERNI, type ModuloEsterno } from "@/lib/planimetrie/render/fotoDaPianta";

type Inquadratura = LatoEsterno | "tre_quarti";

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
  // anteprima ed errore ricordano per quale inquadratura sono: se non è quella di adesso, si sta caricando
  const [anteprima, setAnteprima] = useState<{ url: string; file: File; per: Inquadratura } | null>(null);
  const [errore, setErrore] = useState<{ testo: string; per: Inquadratura } | null>(null);

  const { limiti, casa } = useMemo(() => {
    const s = piani && piani.length > 1 ? scenaEdificio(piani, { vista, soffitto: true, elementi: true }) : costruisciScena(pianta, { vista, soffitto: true, elementi: true });
    const muri = limitiDi(s.mesh, (g) => g === "muro");
    return { limiti: s.limiti, casa: Number.isFinite(muri.min[0]) ? muri : s.limiti };
  }, [pianta, piani, vista]);
  const localeId = pianta.locali[0]?.id;

  useEffect(() => {
    if (!aperto || !localeId) return;
    let annullato = false;
    let url: string | null = null;
    (async () => {
      try {
        const cattura = await caricaFotogramma();
        const telecamera = inquadratura === "tre_quarti" ? vistaGiroIntorno(limiti, 4 / 3) : vistaDalGiardino(limiti, inquadratura, 60, casa);
        const f = await cattura({ pianta, localeId, telecamera, vista, larghezza: 1280, altezza: 960, terreno: 40, piani });
        if (annullato) return;
        url = URL.createObjectURL(f.png);
        const nome = `${titolo.replace(/[^\w-]+/g, "-").slice(0, 40) || "pianta"}-esterno.png`;
        setAnteprima({ url, file: new File([f.png], nome, { type: "image/png" }), per: inquadratura });
      } catch (e) {
        if (!annullato) setErrore({ testo: e instanceof Error ? e.message : "Vista non creata.", per: inquadratura });
      }
    })();
    return () => {
      annullato = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [aperto, inquadratura, limiti, casa, localeId, pianta, piani, titolo, vista]);

  const carico = !!localeId && anteprima?.per !== inquadratura && errore?.per !== inquadratura;
  const erroreOra = errore?.per === inquadratura && anteprima?.per !== inquadratura ? errore.testo : null;

  const continua = () => {
    if (!anteprima) return;
    const m = MODULI_ESTERNI.find((x) => x.modulo === modulo)!;
    lasciaFotoDaPianta(modulo, anteprima.file);
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
                  className={`rounded-md border p-2.5 text-left text-sm transition ${modulo === m.modulo ? "border-purple-600 bg-purple-50 dark:bg-purple-950/30" : "hover:bg-muted"}`}
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
          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted">
            {anteprima && <img src={anteprima.url} alt="Vista 3D da fuori" className="h-full w-full object-cover" />}
            {carico && <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" />}
            {erroreOra && <p className="p-4 text-sm text-destructive">{erroreOra}</p>}
            {!localeId && <p className="p-4 text-sm text-muted-foreground">La pianta non ha stanze: disegnale prima.</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi}>Annulla</Button>
          <Button onClick={continua} disabled={!anteprima || carico} className="bg-purple-600 hover:bg-purple-700">Continua col render</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

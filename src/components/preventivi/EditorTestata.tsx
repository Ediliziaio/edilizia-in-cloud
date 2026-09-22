/**
 * Una pagina che racconta l'azienda («Dicono di noi», domande, garanzie, i nostri
 * lavori), tutta da un posto solo: occhiello, titolo e introduzione, e sotto quello
 * che la pagina mostra (le recensioni, le domande…), passato dall'editor del modulo.
 *
 * Come i blocchi, salva solo i campi cambiati, in `pdf_blocchi` sotto
 * «testata_<pagina>» (vedi supabase/functions/_shared/testatePagine.ts): un campo
 * svuotato torna quello di serie.
 */
import { useMemo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VotoOnlineDelProfilo } from "@/components/preventivi/VotoOnlineDelProfilo";
import {
  chiaveTestata, LUNGHEZZA_TESTATA, testataDiSerie,
  type MotoreTestate, type PaginaConTestata,
} from "../../../supabase/functions/_shared/testatePagine";

interface Props {
  pagina: PaginaConTestata;
  motore: MotoreTestate;
  /** Tutte le scelte dell'azienda su blocchi e pagine (`pdf_blocchi` del modello). */
  salvati: unknown;
  onSalvati: (v: Record<string, unknown>) => void;
  /** Quello che la pagina mostra, modificabile sotto la testata. */
  children?: ReactNode;
  /** Dentro una sezione dell'editor, che ha già la sua scheda: senza bordo né margine. */
  incorniciato?: boolean;
}

type Campo = "occhiello" | "titolo" | "intro";

export function EditorTestata({ pagina, motore, salvati, onSalvati, children, incorniciato = true }: Props) {
  const tutti = useMemo(() => (salvati && typeof salvati === "object" ? (salvati as Record<string, unknown>) : {}), [salvati]);
  const chiave = chiaveTestata(pagina);
  const proprio = (tutti[chiave] && typeof tutti[chiave] === "object" ? tutti[chiave] : {}) as Record<string, unknown>;
  const diSerie = testataDiSerie(pagina, motore);

  // Nei campi si vede quello che l'azienda sta scrivendo, anche vuoto (come nei
  // blocchi): se mostrassero il valore finale, svuotare un titolo per riscriverlo
  // farebbe ricomparire quello di serie. Il PDF usa il testo di serie solo dove
  // l'azienda non ha scritto niente.
  const valore = (k: Campo): string => (typeof proprio[k] === "string" ? (proprio[k] as string) : diSerie?.[k] ?? "");
  const salva = (k: Campo, testo: string) => onSalvati({ ...tutti, [chiave]: { ...proprio, [k]: testo } });
  const tornaDiSerie = () => {
    if (!window.confirm("Rimettere occhiello, titolo e introduzione di serie per questa pagina?")) return;
    const { [chiave]: _via, ...resto } = tutti;
    onSalvati(resto);
  };

  return (
    <div className={incorniciato ? "mt-3 space-y-4 rounded-md border bg-background p-3" : "space-y-4"}>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`${chiave}-occhiello`}>Occhiello</Label>
          <Input id={`${chiave}-occhiello`} value={valore("occhiello")} maxLength={LUNGHEZZA_TESTATA.occhiello} onChange={(e) => salva("occhiello", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor={`${chiave}-titolo`}>Titolo</Label>
          <Textarea
            id={`${chiave}-titolo`}
            value={valore("titolo")}
            maxLength={LUNGHEZZA_TESTATA.titolo}
            rows={2}
            placeholder={diSerie?.segnaposto?.titolo}
            onChange={(e) => salva("titolo", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground">
            {motore === "edili"
              ? "Una parola fra asterischi esce in corsivo, nel colore dell'azienda."
              : "Con Invio il titolo va a capo, come nel documento."}
          </p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={`${chiave}-intro`}>Introduzione</Label>
        <Textarea
          id={`${chiave}-intro`}
          value={valore("intro")}
          maxLength={LUNGHEZZA_TESTATA.intro}
          rows={2}
          placeholder={diSerie?.segnaposto?.intro ?? "Facoltativa: una frase sotto il titolo."}
          onChange={(e) => salva("intro", e.target.value)}
        />
      </div>
      {Object.keys(proprio).length > 0 ? (
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={tornaDiSerie}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Torna ai testi di serie
          </Button>
        </div>
      ) : null}

      {children || pagina === "recensioni" ? (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Il contenuto della pagina</p>
          {pagina === "recensioni" ? <VotoOnlineDelProfilo /> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export default EditorTestata;

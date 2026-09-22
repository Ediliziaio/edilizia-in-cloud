/**
 * Il corpo di una sezione «pagina» negli editor dei modelli (vedi pagineEditor.ts):
 * se la pagina esce, la sua testata col contenuto, i testi e le foto di un blocco,
 * la foto della pagina. Ogni editor lo mette nella sua scheda, con la sua grafica.
 */
import type { ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { EditorBlocco } from "@/components/preventivi/EditorBlocco";
import { EditorFotoPagina } from "@/components/preventivi/EditorFotoPagina";
import { EditorTestata } from "@/components/preventivi/EditorTestata";
import type { PaginaEditor } from "@/components/preventivi/pagineEditor";
import type { SettoreBlocchi } from "../../../supabase/functions/_shared/blocchiPreventivo";
import type { MotoreTestate } from "../../../supabase/functions/_shared/testatePagine";

export type CampoFoto = (valore: string | null, onChange: (url: string | null) => void) => ReactNode;

interface Props {
  pagina: PaginaEditor;
  motore: MotoreTestate;
  settore: SettoreBlocchi;
  /** Le scelte dell'azienda su blocchi, testate e foto (`pdf_blocchi` del modello). */
  blocchi: unknown;
  onBlocchi: (v: Record<string, unknown>) => void;
  /** Quello che la pagina mostra, dall'editor del modulo (le recensioni, le domande…). */
  contenuto?: ReactNode;
  campoFoto: CampoFoto;
  /** L'interruttore della pagina, dove la scheda dell'editor non ne ha uno suo. */
  visibile?: { valore: boolean; onChange: (v: boolean) => void };
  /** La sezione c'era già, coi suoi campi: qui solo la foto della pagina. */
  soloFoto?: boolean;
}

export function ContenutoPagina({ pagina, motore, settore, blocchi, onBlocchi, contenuto, campoFoto, visibile, soloFoto = false }: Props) {
  const foto = pagina.foto ? (
    <EditorFotoPagina
      chiave={pagina.foto.chiave}
      settore={settore}
      salvati={blocchi}
      onSalvati={onBlocchi}
      campoFoto={campoFoto}
      nota={pagina.foto.nota}
      incorniciato={false}
    />
  ) : null;
  if (soloFoto) return foto;
  return (
    <div className="space-y-5">
      {visibile ? (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium">
            {visibile.valore ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
            {visibile.valore ? "Esce nel preventivo" : "Spenta: nel preventivo non esce"}
          </span>
          <Switch checked={visibile.valore} onCheckedChange={visibile.onChange} aria-label={`Mostra «${pagina.voce}» nel PDF`} />
        </div>
      ) : null}
      {pagina.testata ? (
        <EditorTestata pagina={pagina.testata} motore={motore} salvati={blocchi} onSalvati={onBlocchi} incorniciato={false}>
          {contenuto}
        </EditorTestata>
      ) : contenuto ? (
        <div>{contenuto}</div>
      ) : null}
      {pagina.blocco ? (
        <EditorBlocco chiave={pagina.blocco} settore={settore} salvati={blocchi} onSalvati={onBlocchi} campoFoto={campoFoto} incorniciato={false} />
      ) : null}
      {foto ? <div className="border-t pt-4">{foto}</div> : null}
    </div>
  );
}

export default ContenutoPagina;

import { useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileSearch, Loader2, Mail, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useControlliDocumento, type ObiettivoControllo } from "@/hooks/useControlloDocumento";
import { ESITO_CLASSI, ESITO_LABEL } from "@/lib/acquisti/controlloDocumento";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

/** Carica l'offerta o la conferma del fornitore, o usa l'allegato arrivato per email col codice. */
export function ControlloDocumentoCard({ obiettivo, tipo, compatto = false, onApri }: {
  obiettivo: ObiettivoControllo;
  tipo: "offerta" | "conferma";
  compatto?: boolean;
  onApri?: (id?:string)=>void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const { controlli, allegati, avvia } = useControlliDocumento(obiettivo);
  const ultimo = controlli.find((c) => c.tipo === tipo && c.stato === "letto");
  const fatto = (r: { id: string }) => onApri ? onApri(r.id) : navigate(`/azienda/controllo-documento/${r.id}`);
  const carica = tipo === "conferma" ? t("Carica la conferma d'ordine") : t("Carica l'offerta");

  return (
    <div className={compatto ? "space-y-1.5" : "space-y-2 rounded-xl border bg-white p-4"}>
      {!compatto && (
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><FileSearch className="h-4 w-4" />{tipo === "conferma" ? t("Controllo conferma del fornitore") : t("Controllo offerta")}</p>
      )}
      {ultimo?.esito && (
        <Link onClick={onApri ? e=>{e.preventDefault();onApri(ultimo.id);} : undefined} to={`/azienda/controllo-documento/${ultimo.id}`} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-slate-50">
          <span className="min-w-0 truncate">{ultimo.file_nome ?? t("Documento")}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESITO_CLASSI[ultimo.esito]}`}>
            {ultimo.accettato_il ? t("Accettato") : t(ESITO_LABEL[ultimo.esito])}
          </span>
        </Link>
      )}
      {allegati.slice(0, 3).map((a) => (
        <button key={a.attachment_id} type="button" disabled={avvia.isPending}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          onClick={() => avvia.mutate({ tipo, attachmentId: a.attachment_id }, { onSuccess: fatto })}>
          <Mail className="h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate">{t("Controlla {file}", { file: a.filename })}</span>
        </button>
      ))}
      <Button type="button" size="sm" variant="outline" className="h-8 w-full text-xs" disabled={avvia.isPending} onClick={() => input.current?.click()}>
        {avvia.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        {avvia.isPending ? t("Lettura del documento…") : carica}
      </Button>
      {onApri&&<Button type="button" size="sm" variant="ghost" className="h-8 w-full text-xs" onClick={()=>onApri()}>{t("Apri confronto e revisioni")}</Button>}
      <input ref={input} type="file" accept="application/pdf,image/*" className="hidden" aria-label={carica}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) avvia.mutate({ tipo, file }, { onSuccess: fatto });
        }} />
    </div>
  );
}

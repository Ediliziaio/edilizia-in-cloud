/**
 * In home del telefono, per chi ha un mezzo in carico: una riga con nome e
 * targa, e un avviso se un documento è scaduto o sta per scadere. Porta a
 * «Il mio mezzo». Chi non ha mezzi non vede niente.
 */
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { IconaMezzo } from "@/components/mezzi/IconaMezzo";
import { useMieiMezzi } from "@/hooks/useMezzi";
import { categoriaDocumentoLabel, documentiConStato, formatData, oggiIso } from "@/types/mezzi";

export function MioMezzoCampoCard() {
  const navigate = useNavigate();
  const { data: mezzi = [] } = useMieiMezzi();
  const ids = new Set(mezzi.map((m) => m.id));
  const principali = mezzi.filter((m) => !m.su_mezzo_id || !ids.has(m.su_mezzo_id));
  if (principali.length === 0) return null;

  const oggi = oggiIso();
  // Il documento più urgente fra tutti i miei mezzi: prima gli scaduti, poi chi scade prima.
  const urgente = principali
    .flatMap((m) => documentiConStato(m.documenti, oggi).map((d) => ({ ...d, mezzo: m.nome })))
    .filter((d) => d.stato === "scaduto" || d.stato === "in_scadenza")
    .sort((a, b) => (a.stato === b.stato ? (a.data_scadenza ?? "").localeCompare(b.data_scadenza ?? "") : a.stato === "scaduto" ? -1 : 1))[0];

  const primo = principali[0];
  const titolo = principali.length > 1 ? `${principali.length} mezzi in carico` : primo.nome;
  const sotto = principali.length > 1 ? principali.map((m) => m.targa || m.nome).join(" · ") : primo.targa;

  return (
    <button
      type="button"
      onClick={() => navigate("/campo/mezzi")}
      className="flex w-full items-center gap-3 rounded-2xl border bg-background p-3 text-left shadow-sm transition-colors hover:bg-muted/40 active:scale-[0.99]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
        <IconaMezzo tipo={primo.tipo} className="h-5 w-5 text-slate-700" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {principali.length > 1 ? "I miei mezzi" : "Il mio mezzo"}
        </p>
        <p className="truncate text-sm font-semibold">{titolo}</p>
        {sotto && <p className="truncate font-mono text-xs text-muted-foreground">{sotto}</p>}
        {urgente && (
          <p className={`mt-1 flex items-center gap-1 text-xs ${urgente.stato === "scaduto" ? "text-red-700" : "text-amber-800"}`}>
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {categoriaDocumentoLabel(urgente.categoria)}
              {urgente.stato === "scaduto" ? ": scadenza passata il " : ": scade il "}
              {formatData(urgente.data_scadenza)}
              {principali.length > 1 ? ` · ${urgente.mezzo}` : ""}
            </span>
          </p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  );
}

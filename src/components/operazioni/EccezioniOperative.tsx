import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDateIt } from "@/lib/formatters";
import {
  numeroOperativo, operazioniRpc, riepilogoFatturaHref,
  type ControlloPagamento, type EccezioneOperativa, type RischioMateriale, type TipoEccezione,
} from "@/lib/operazioni/operazioni";
import { DettagliVerificaPagamento } from "./DettagliVerificaPagamento";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const GRUPPO: Record<TipoEccezione, string> = {
  ddt: "Ufficio acquisti",
  pagamento: "Amministrazione",
  cantiere: "Responsabile commessa",
};

function MaterialeARischio({ dati }: { dati: RischioMateriale }) {
  const t = useT();
  const copia = async (o: RischioMateriale["ordini"][number]) => {
    const testo = [
      "Oggetto: verifica consegna ordine " + o.numero,
      "",
      "Buongiorno,",
      "per l’ordine " + o.numero + " risultano ancora da consegnare " + numeroOperativo(o.residuo) + " " + (dati.unita ?? "") + " di " + dati.materiale + ".",
      "Il materiale serve entro il " + formatDateIt(dati.serve) + (dati.commessa ? " per la commessa " + dati.commessa : "") + ". Potete confermare la data di consegna?",
      "Grazie.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(testo);
      toast.success(t("Sollecito copiato"));
    } catch {
      toast.error(t("Copia del sollecito non riuscita"));
    }
  };
  return <div className="space-y-2 text-sm">
    <p><strong>{dati.materiale}</strong>{dati.fase && " · " + dati.fase} · {t("serve il {data}", { data: formatDateIt(dati.serve) })}</p>
    <p>{t("{quantita} {unita} senza consegna in tempo", { quantita: numeroOperativo(dati.mancante), unita: dati.unita ?? "" })}</p>
    {dati.ordini.map(o => <div key={o.ordine_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link className="text-primary underline" to={"/azienda/ordini-acquisto/" + o.ordine_id}>{o.numero}</Link>
      <span>{[o.fornitore, o.consegna && formatDateIt(o.consegna)].filter(Boolean).join(" · ")}</span>
      <Button size="sm" variant="ghost" onClick={() => void copia(o)}>{t("Copia sollecito")}</Button>
    </div>)}
  </div>;
}

export function EccezioniOperative({ companyId, tipo, commessaId }: { companyId: string; tipo?: TipoEccezione; commessaId?: string }) {
  const t = useT();
  const [chiuse, setChiuse] = useState(false);
  const [offset, setOffset] = useState(0);
  const qc = useQueryClient();
  const dati = useQuery({
    queryKey: ["operazioni-eccezioni", companyId, tipo ?? null, commessaId ?? null, chiuse, offset],
    queryFn: () => operazioniRpc<EccezioneOperativa[]>("operazioni_eccezioni_elenco", {
      p_company: companyId, p_tipo: tipo ?? null, p_chiuse: chiuse, p_commessa: commessaId ?? null, p_offset: offset,
    }),
    refetchInterval: 60_000,
  });
  const prendi = useMutation({
    mutationFn: (id: string) => operazioniRpc<void>("operazioni_eccezione_prendi", { p_company: companyId, p_id: id }),
    onSuccess: () => {
      toast.success(t("Attività presa in carico"));
      void qc.invalidateQueries({ queryKey: ["operazioni-eccezioni", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lista = dati.data ?? [];
  // Telefono e tablet: vuoto (niente aperto) non occupa tre righe per dire che non c'è niente.
  const vuotoAperte = dati.isSuccess && !lista.length && !chiuse && offset === 0;
  return <section className={cn("space-y-2", vuotoAperte && "max-lg:hidden")} aria-label={tipo === "cantiere" ? t("Materiali a rischio") : t("Da fare operativo")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">{tipo === "cantiere" ? t("Materiali a rischio") : t("Da fare operativo")}</h3>
      <Button size="sm" variant="outline" onClick={() => { setChiuse(x => !x); setOffset(0); }}>
        {chiuse ? t("Mostra aperte") : t("Mostra chiuse")}
      </Button>
    </div>
    {dati.isLoading && <p role="status" className="text-sm text-muted-foreground">{t("Caricamento attività…")}</p>}
    {dati.isError && <p role="alert" className="text-sm">{t("Attività non disponibili.")}{" "}
      <button type="button" className="underline" onClick={() => void dati.refetch()}>{t("Riprova")}</button>
    </p>}
    {dati.isSuccess && !lista.length && <p className="text-sm text-muted-foreground">
      {chiuse ? t("Nessuna attività chiusa.") : t("Nessuna attività aperta.")}
    </p>}
    {!!lista.length && <ul className="divide-y rounded-lg border">
      {lista.map(e => <li key={e.id} className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium" dir="auto">{e.titolo}</p>
          <Badge variant="outline">{chiuse ? t("Chiusa") : t("Entro il {data}", { data: formatDateIt(e.scadenza) })}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{e.nome_responsabile ?? t(GRUPPO[e.tipo])}</p>
        {e.tipo === "cantiere" ? <MaterialeARischio dati={e.dati as RischioMateriale} />
          : <DettagliVerificaPagamento esito={e.dati as ControlloPagamento} />}
        <div className="flex flex-wrap items-center gap-2">
          <Link className="text-sm text-primary underline" to={e.tipo === "cantiere" ? "/azienda/ordini/" + e.commessa_id : riepilogoFatturaHref(e.origine_id)}>
            {e.tipo === "cantiere" ? t("Apri commessa") : t("Apri fattura")}
          </Link>
          {!chiuse && e.puo_prendere && <Button size="sm" variant="ghost" disabled={prendi.isPending} onClick={() => prendi.mutate(e.id)}>
            {t("Prendi in carico")}
          </Button>}
        </div>
      </li>)}
    </ul>}
    {(offset > 0 || lista.length === 50) && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!offset} onClick={() => setOffset(x => x - 50)}>{t("Indietro")}</Button>
      <Button size="sm" variant="outline" disabled={lista.length < 50} onClick={() => setOffset(x => x + 50)}>{t("Avanti")}</Button>
    </div>}
  </section>;
}


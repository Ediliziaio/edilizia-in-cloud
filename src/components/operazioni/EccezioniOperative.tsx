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

const GRUPPO: Record<TipoEccezione, string> = {
  ddt: "Ufficio acquisti",
  pagamento: "Amministrazione",
  cantiere: "Responsabile commessa",
};

function MaterialeARischio({ dati }: { dati: RischioMateriale }) {
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
      toast.success("Sollecito copiato");
    } catch {
      toast.error("Copia del sollecito non riuscita");
    }
  };
  return <div className="space-y-2 text-sm">
    <p><strong>{dati.materiale}</strong>{dati.fase && " · " + dati.fase} · serve il {formatDateIt(dati.serve)}</p>
    <p>{numeroOperativo(dati.mancante)} {dati.unita ?? ""} senza consegna in tempo</p>
    {dati.ordini.map(o => <div key={o.ordine_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link className="text-primary underline" to={"/azienda/ordini-acquisto/" + o.ordine_id}>{o.numero}</Link>
      <span>{[o.fornitore, o.consegna && formatDateIt(o.consegna)].filter(Boolean).join(" · ")}</span>
      <Button size="sm" variant="ghost" onClick={() => void copia(o)}>Copia sollecito</Button>
    </div>)}
  </div>;
}

export function EccezioniOperative({ companyId, tipo, commessaId }: { companyId: string; tipo?: TipoEccezione; commessaId?: string }) {
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
      toast.success("Attività presa in carico");
      void qc.invalidateQueries({ queryKey: ["operazioni-eccezioni", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lista = dati.data ?? [];
  return <section className="space-y-2" aria-label={tipo === "cantiere" ? "Materiali a rischio" : "Da fare operativo"}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">{tipo === "cantiere" ? "Materiali a rischio" : "Da fare operativo"}</h3>
      <Button size="sm" variant="outline" onClick={() => { setChiuse(x => !x); setOffset(0); }}>
        {chiuse ? "Mostra aperte" : "Mostra chiuse"}
      </Button>
    </div>
    {dati.isLoading && <p role="status" className="text-sm text-muted-foreground">Caricamento attività…</p>}
    {dati.isError && <p role="alert" className="text-sm">Attività non disponibili.{" "}
      <button type="button" className="underline" onClick={() => void dati.refetch()}>Riprova</button>
    </p>}
    {dati.isSuccess && !lista.length && <p className="text-sm text-muted-foreground">
      {chiuse ? "Nessuna attività chiusa." : "Nessuna attività aperta."}
    </p>}
    {!!lista.length && <ul className="divide-y rounded-lg border">
      {lista.map(e => <li key={e.id} className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{e.titolo}</p>
          <Badge variant="outline">{chiuse ? "Chiusa" : "Entro il " + formatDateIt(e.scadenza)}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{e.nome_responsabile ?? GRUPPO[e.tipo]}</p>
        {e.tipo === "cantiere" ? <MaterialeARischio dati={e.dati as RischioMateriale} />
          : <DettagliVerificaPagamento esito={e.dati as ControlloPagamento} />}
        <div className="flex flex-wrap items-center gap-2">
          <Link className="text-sm text-primary underline" to={e.tipo === "cantiere" ? "/azienda/ordini/" + e.commessa_id : riepilogoFatturaHref(e.origine_id)}>
            {e.tipo === "cantiere" ? "Apri commessa" : "Apri fattura"}
          </Link>
          {!chiuse && e.puo_prendere && <Button size="sm" variant="ghost" disabled={prendi.isPending} onClick={() => prendi.mutate(e.id)}>
            Prendi in carico
          </Button>}
        </div>
      </li>)}
    </ul>}
    {(offset > 0 || lista.length === 50) && <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={!offset} onClick={() => setOffset(x => x - 50)}>Indietro</Button>
      <Button size="sm" variant="outline" disabled={lista.length < 50} onClick={() => setOffset(x => x + 50)}>Avanti</Button>
    </div>}
  </section>;
}


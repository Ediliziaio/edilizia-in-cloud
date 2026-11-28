/**
 * «Avanzamento del giorno»: la griglia delle lavorazioni del computo dentro un documento del giorno
 * (lotto 3 e 4 del modello, 28/11/2026).
 *
 * Stessa impostazione della griglia del verbale SAL (`SalDraftPhases`) — fasi a sinistra, ricerca,
 * tabella scorribile, le stesse classi `sal-phase-*` — ma con quello che serve a un giorno e niente
 * di più: nessun importo, nessuna nota per il cliente, nessun confronto col SAL precedente. La
 * colonna che si scrive è **oggi**; «a oggi» è il conto che ne viene, mostrato accanto.
 *
 * Il documento deve esistere (il movimento si appoggia al suo id): su un rendiconto nuovo la
 * sezione chiede di salvarlo prima, invece di far scrivere numeri che andrebbero perduti.
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";
import {
  anteprimaAOggi, leggiLavorazioniDelGiorno, righeDaSalvare, salvaAvanzamentoDelGiorno, valoreDelGiorno,
  type LavorazioneDelGiorno, type OrigineAvanzamento,
} from "@/lib/rendiconti/avanzamentoDelGiorno";

const quantita = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString(intlCampo(), { maximumFractionDigits: 3 });

interface Props {
  orderId: string;
  /** Il documento che dichiara: null finché non è salvato. */
  documentoId: string | null;
  data: string;
  origine: OrigineAvanzamento;
  puoModificare: boolean;
  /** Il documento è chiuso (rendiconto confermato): si legge, non si scrive. */
  chiuso?: boolean;
}

export function AvanzamentoDelGiorno({ orderId, documentoId, data, origine, puoModificare, chiuso = false }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [scritte, setScritte] = useState<Record<string, number | null>>({});
  const [cerca, setCerca] = useState("");
  const [fase, setFase] = useState<string | null>(null);
  const [aperte, setAperte] = useState<Record<string, boolean>>({});

  const lavorazioni = useQuery({
    queryKey: ["avanzamento-del-giorno", orderId, origine, documentoId],
    queryFn: () => leggiLavorazioniDelGiorno(orderId, origine, documentoId),
  });

  const salva = useMutation({
    mutationFn: async () => {
      if (!documentoId) throw new Error(t("Salva prima il documento."));
      return salvaAvanzamentoDelGiorno({
        orderId, data, origine, documentoId,
        righe: righeDaSalvare(lavorazioni.data ?? [], scritte),
      });
    },
    onSuccess: async (esito) => {
      setScritte({});
      await qc.invalidateQueries({ queryKey: ["avanzamento-del-giorno", orderId, origine, documentoId] });
      void qc.invalidateQueries({ queryKey: ["order-work-phases", orderId] });
      if (esito.fermi > 0) {
        toast.warning(esito.fermi === 1
          ? t("Una lavorazione non è stata scritta: {motivo}", { motivo: esito.motivi[0]?.motivo ?? "" })
          : t("{n} lavorazioni non sono state scritte: {motivo}", { n: esito.fermi, motivo: esito.motivi[0]?.motivo ?? "" }));
      } else {
        toast.success(t("Avanzamento del giorno salvato"));
      }
    },
    onError: (e) => toast.error(messaggioErrore(e)),
  });

  const fasi = useMemo(() => {
    const m = new Map<string, { id: string; nome: string; quante: number }>();
    for (const l of lavorazioni.data ?? []) {
      const f = m.get(l.fase_id) ?? { id: l.fase_id, nome: l.fase, quante: 0 };
      f.quante += 1;
      m.set(l.fase_id, f);
    }
    return [...m.values()];
  }, [lavorazioni.data]);

  const visibili = useMemo(() => {
    const testo = cerca.trim().toLocaleLowerCase("it");
    return (lavorazioni.data ?? []).filter((l) => {
      if (fase && l.fase_id !== fase) return false;
      if (!testo) return true;
      return `${l.fase} ${l.lavorazione}`.toLocaleLowerCase("it").includes(testo);
    });
  }, [lavorazioni.data, cerca, fase]);

  const perFase = useMemo(() => {
    const m = new Map<string, LavorazioneDelGiorno[]>();
    for (const l of visibili) m.set(l.fase_id, [...(m.get(l.fase_id) ?? []), l]);
    return [...m.entries()];
  }, [visibili]);

  const daSalvare = righeDaSalvare(lavorazioni.data ?? [], scritte).length;
  const siScrive = puoModificare && !chiuso && !!documentoId;

  if (lavorazioni.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Carico le lavorazioni…")}</p>;
  }
  if (lavorazioni.isError) {
    return <p role="alert" className="text-sm text-amber-700">{messaggioErrore(lavorazioni.error)}</p>;
  }
  if (!(lavorazioni.data ?? []).length) {
    return <p className="text-sm text-muted-foreground">{t("Questa commessa non ha lavorazioni da misurare.")}</p>;
  }

  return (
    <div className="space-y-2">
      {!documentoId && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {t("Salva il documento e poi dichiara quanto hai fatto: l'avanzamento si appoggia a questo giorno.")}
        </p>
      )}
      {chiuso && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-xs text-muted-foreground">
          {t("Il documento è confermato: l'avanzamento si corregge con una rettifica dell'ufficio.")}
        </p>
      )}
      <div className="sal-phase-workspace">
        <nav aria-label={t("Fasi della commessa")} className="sal-phase-nav" data-single={fasi.length === 1}>
          <button type="button" aria-pressed={!fase} onClick={() => { setFase(null); setCerca(""); }} className="sal-phase-nav-all">
            {t("Tutte le fasi")} <span>{fasi.length}</span>
          </button>
          <div className="sal-phase-nav-list">
            {fasi.map((f) => (
              <button key={f.id} type="button" aria-pressed={fase === f.id} className="sal-phase-nav-item"
                onClick={() => { setFase(f.id); setCerca(""); setAperte((a) => ({ ...a, [f.id]: true })); }}>
                <span title={f.nome}>{f.nome || t("Fase senza nome")}</span>
                <small>{f.quante === 1 ? t("1 lavorazione") : t("{n} lavorazioni", { n: f.quante })}</small>
              </button>
            ))}
          </div>
        </nav>
        <div className="min-w-0 space-y-2">
          <div className="sal-phase-tools">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input aria-label={t("Cerca una lavorazione")} placeholder={t("Cerca una lavorazione…")}
                className="h-9 pl-8" value={cerca} onChange={(e) => setCerca(e.target.value)} />
            </div>
            {siScrive && (
              <Button type="button" size="sm" disabled={daSalvare === 0 || salva.isPending} onClick={() => salva.mutate()}>
                {salva.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                {daSalvare === 0
                  ? t("Salva l'avanzamento")
                  : daSalvare === 1 ? t("Salva 1 lavorazione") : t("Salva {n} lavorazioni", { n: daSalvare })}
              </Button>
            )}
          </div>
          {cerca.trim() && <p className="text-xs text-muted-foreground">{t("{visibili} di {totale} lavorazioni", { visibili: visibili.length, totale: (lavorazioni.data ?? []).length })}</p>}
          <div className="sal-phase-table-scroll" role="region" aria-label={t("Lavorazioni del giorno, tabella scorribile")} tabIndex={0}>
            <table className="sal-phase-table">
              <caption className="sr-only">{t("Quanto si è fatto oggi di ogni lavorazione del computo")}</caption>
              <thead>
                <tr>
                  <th>{t("Fase / lavorazione")}</th>
                  <th>{t("A contratto")}</th>
                  <th>{t("Fatto a oggi")}</th>
                  <th>{t("Oggi")}</th>
                  <th>{t("Diventa")}</th>
                </tr>
              </thead>
              <tbody>
                {perFase.map(([faseId, righe]) => {
                  const nome = righe[0]?.fase || t("Fase senza nome");
                  const apertaLaFase = aperte[faseId] ?? true;
                  return (
                    <Fragment key={faseId}>
                      <tr className="sal-phase-main">
                        <td colSpan={5}>
                          <button type="button" aria-expanded={apertaLaFase} className="flex items-center gap-1 text-left font-semibold"
                            onClick={() => setAperte((a) => ({ ...a, [faseId]: !apertaLaFase }))}>
                            {apertaLaFase ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {nome}
                            <small className="ml-1 font-normal text-muted-foreground">{righe.length === 1 ? t("1 lavorazione") : t("{n} lavorazioni", { n: righe.length })}</small>
                          </button>
                        </td>
                      </tr>
                      {apertaLaFase && righe.map((l) => {
                        const scritto = Object.hasOwn(scritte, l.sottofase_id) ? scritte[l.sottofase_id] : valoreDelGiorno(l);
                        const dopo = anteprimaAOggi(l, scritto);
                        const aQuantita = l.modo === "quantita";
                        return (
                          <tr key={l.sottofase_id} className="sal-subphase-row">
                            <td>{l.lavorazione}</td>
                            <td>{aQuantita ? `${quantita(l.quantita_contratto)} ${l.unita ?? ""}` : t("A percentuale")}</td>
                            <td>{aQuantita ? quantita(l.quantita_fatta) : `${l.percentuale}%`}</td>
                            <td>
                              <div className={aQuantita ? "sal-quantity-field" : "sal-percent-field"}>
                                <Input inputMode="decimal" className="h-8 text-right" disabled={!siScrive}
                                  aria-label={aQuantita
                                    ? t("Quantità fatta oggi di {nome}", { nome: l.lavorazione })
                                    : t("Percentuale raggiunta oggi di {nome}", { nome: l.lavorazione })}
                                  value={scritto == null ? "" : String(scritto).replace(".", ",")}
                                  onChange={(e) => {
                                    const testo = e.target.value.trim();
                                    const n = Number(testo.replace(",", "."));
                                    setScritte((s) => ({
                                      ...s,
                                      [l.sottofase_id]: testo === "" ? null : (Number.isFinite(n) && n >= 0 ? n : (s[l.sottofase_id] ?? null)),
                                    }));
                                  }} />
                                {aQuantita ? <small>{l.unita ?? ""}</small> : <span>%</span>}
                              </div>
                            </td>
                            <td className="text-muted-foreground">
                              {aQuantita ? `${quantita(dopo.quantita)} · ${dopo.percentuale}%` : `${dopo.percentuale}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!visibili.length && (
              <div className="p-4 text-sm text-muted-foreground">
                {t("Nessuna lavorazione in questa vista.")}{" "}
                <button type="button" className="underline" onClick={() => { setCerca(""); setFase(null); }}>{t("Mostra tutte")}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

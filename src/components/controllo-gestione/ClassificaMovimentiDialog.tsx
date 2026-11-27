/**
 * «Classifica i movimenti»: dal Cash flow, un popup largo come quello della
 * riconciliazione con la tesoreria. A sinistra i movimenti di banca del periodo
 * (da classificare per primi, raggruppabili per controparte), a destra il
 * catalogo: si selezionano uno o più movimenti e si sceglie la voce.
 *
 * Regole che vengono dal database (cassa_classifica_movimenti):
 *  - stesso verso per tutta la selezione (una voce di uscita non va su un incasso);
 *  - una categoria già confermata da una persona non si sovrascrive, salvo che
 *    lo si chieda esplicitamente con la casella apposita;
 *  - ogni cambio resta nello storico, con il motivo se lo scrivi.
 * Una PROPOSTA (dalla controparte o dalla vecchia categoria) si accetta in
 * blocco con «Accetta le proposte», ma resta proposta finché qualcuno non lo fa.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCheck, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { bankRpc } from "@/lib/finance/bankWorkspace";
import { ORIGINE_VOCE, creaRegolaCassa, useAggiornaDopoCategoria, useCatalogoCassa, type VoceCatalogo, type QuotaVoce } from "@/lib/finance/cassaVoci";
import { etichettaVoce } from "@/lib/controlloGestione/rendicontoCassa";
import { ScegliVoceCassa } from "@/components/tesoreria/ScegliVoceCassa";
import { euroIntero } from "@/lib/controlloGestione/formatoCG";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

export interface MovimentoDaClassificare {
  id: string;
  data: string;
  cents: number;
  descrizione: string | null;
  controparte: string | null;
  categoria_testo: string | null;
  revisione: number;
  voce: {
    id: string; nome: string; codice: string; categoria: string | null; origine: string; confermata: boolean;
    /** Ripartito su più voci (salvato). */
    quote?: QuotaVoce[] | null;
    /** La fattura collegata copre più voci: la ripartizione proposta. */
    proposta_quote?: QuotaVoce[] | null;
  } | null;
}

type Vista = "da-classificare" | "proposte" | "classificati" | "tutti";
const VISTE: { key: Vista; label: string }[] = [
  { key: "da-classificare", label: "Da classificare" },
  { key: "proposte", label: "Con proposta" },
  { key: "classificati", label: "Classificati" },
  { key: "tutti", label: "Tutti" },
];
const A_VISTA = 300;
const euro = (cents: number) => euroIntero(cents / 100);
const giorno = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(intlCampo());

/** Il filtro della vista, uguale per lista e conteggi. */
function nellaVista(m: MovimentoDaClassificare, vista: Vista): boolean {
  if (vista === "tutti") return true;
  if (vista === "classificati") return !!m.voce?.confermata;
  if (vista === "proposte") return !!m.voce && !m.voce.confermata;
  return !m.voce?.confermata;
}

/** Una proposta si può accettare così com'è solo se indica una voce, non una categoria intera. */
const propostaAccettabile = (m: MovimentoDaClassificare) => !!m.voce && !m.voce.confermata && m.voce.codice.includes(".");
/** Una ripartizione proposta dalla fattura si accetta così com'è solo se ogni quota è una voce precisa e fa l'importo. */
const quoteAccettabili = (m: MovimentoDaClassificare) => {
  const q = m.voce?.proposta_quote;
  return !!q && q.length > 1 && q.every((x) => x.codice.includes(".")) && q.reduce((s, x) => s + x.cents, 0) === Math.abs(m.cents);
};

export function ClassificaMovimentiDialog({
  open,
  onOpenChange,
  company,
  anno,
  puoModificare,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  company: string;
  anno: number;
  puoModificare: boolean;
}) {
  const t = useT();
  const [dal, setDal] = useState(`${anno}-01-01`);
  const [al, setAl] = useState(`${anno}-12-31`);
  const [verso, setVerso] = useState<"out" | "in">("out");
  const [vista, setVista] = useState<Vista>("da-classificare");
  const [cerca, setCerca] = useState("");
  const [perControparte, setPerControparte] = useState(true);
  const [scelti, setScelti] = useState<Set<string>>(new Set());
  const [motivo, setMotivo] = useState("");
  const [ancheConfermati, setAncheConfermati] = useState(false);
  const [occupato, setOccupato] = useState(false);
  const [quanti, setQuanti] = useState(A_VISTA);
  const aggiorna = useAggiornaDopoCategoria();
  const catalogo = useCatalogoCassa(open ? company : null);

  const lista = useQuery({
    queryKey: ["cassa-da-classificare", company, dal, al],
    enabled: open && !!company && !!dal && !!al && al >= dal,
    retry: false,
    queryFn: () => bankRpc<MovimentoDaClassificare[]>("cassa_movimenti_da_classificare", { p_company: company, p_dal: dal, p_al: al }),
  });

  const delVerso = useMemo(
    () => (lista.data ?? []).filter((m) => (verso === "in" ? m.cents > 0 : m.cents < 0)),
    [lista.data, verso],
  );
  const conteggi = useMemo(() => {
    const c = Object.fromEntries(VISTE.map((v) => [v.key, { n: 0, cents: 0 }])) as Record<Vista, { n: number; cents: number }>;
    for (const m of delVerso) for (const v of VISTE) if (nellaVista(m, v.key)) { c[v.key].n++; c[v.key].cents += m.cents; }
    return c;
  }, [delVerso]);
  const righe = useMemo(() => {
    const q = cerca.trim().toLocaleLowerCase("it-IT");
    return delVerso.filter((m) => {
      if (!nellaVista(m, vista)) return false;
      if (!q) return true;
      const testo = `${m.controparte ?? ""} ${m.descrizione ?? ""} ${m.voce?.nome ?? ""} ${m.categoria_testo ?? ""} ${(Math.abs(m.cents) / 100).toFixed(2).replace(".", ",")}`.toLocaleLowerCase("it-IT");
      return q.split(/\s+/).every((p) => testo.includes(p));
    });
  }, [delVerso, vista, cerca]);
  const gruppi = useMemo(() => {
    if (!perControparte) return [{ chiave: "", titolo: "", righe: righe.slice(0, quanti) }];
    const m = new Map<string, MovimentoDaClassificare[]>();
    for (const r of righe) {
      const k = (r.controparte ?? "").trim() || "Senza controparte";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    let resto = quanti;
    return [...m.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([titolo, rr]) => {
        const visibili = rr.slice(0, Math.max(0, resto));
        resto -= visibili.length;
        return { chiave: titolo, titolo, righe: visibili, totali: rr };
      })
      .filter((g) => g.righe.length);
  }, [righe, perControparte, quanti]);

  const selezionati = useMemo(() => (lista.data ?? []).filter((m) => scelti.has(m.id)), [lista.data, scelti]);
  const totaleScelti = selezionati.reduce((s, m) => s + m.cents, 0);
  const giaConfermati = selezionati.filter((m) => m.voce?.confermata).length;
  const proposteScelte = selezionati.filter(propostaAccettabile);

  const cambia = (ids: string[], si: boolean) =>
    setScelti((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (si) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const cambiaVerso = (v: "in" | "out") => { setVerso(v); setScelti(new Set()); };

  async function assegna(voce: VoceCatalogo) {
    if (!selezionati.length) return;
    setOccupato(true);
    try {
      const r = await bankRpc<{ aggiornati: number; saltati: number }>("cassa_classifica_movimenti", {
        p_company: company,
        p_tx: selezionati.map((m) => m.id),
        p_voce: voce.id,
        p_motivo: motivo.trim() || null,
        p_anche_confermati: ancheConfermati,
      });
      // Tutti della stessa controparte: si può farne una regola, così i prossimi si classificano da soli.
      const controparti = new Set(selezionati.map((m) => (m.controparte ?? "").trim()).filter(Boolean));
      const unica = controparti.size === 1 && selezionati.every((m) => (m.controparte ?? "").trim()) ? [...controparti][0] : null;
      const versoRegola = verso === "in" ? "entrata" : "uscita";
      toast.success((r.aggiornati === 1 ? t("{n} movimento in «{voce}»", { n: r.aggiornati, voce: voce.nome }) : t("{n} movimenti in «{voce}»", { n: r.aggiornati, voce: voce.nome })), {
        description: r.saltati ? t("{saltati} già confermati in un'altra voce non sono stati toccati.", { saltati: String(r.saltati ?? "") }) : unica ? t("Vuoi che i prossimi di «{unica}» vadano qui da soli?", { unica: String(unica ?? "") }) : undefined,
        action: unica
          ? {
              label: t("Crea una regola"),
              onClick: () =>
                void creaRegolaCassa({ company, testo: unica, voce: { id: voce.id, nome: voce.nome }, verso: versoRegola })
                  .then(() => toast.success(t("Regola creata: «{unica}» → {nome}", { unica: String(unica ?? ""), nome: String(voce.nome ?? "") }), { description: t("La trovi in Tesoreria → Impostazioni.") }))
                  .catch((e: unknown) => toast.error(t("Regola non creata"), { description: messaggioErrore(e) })),
            }
          : undefined,
      });
      setScelti(new Set());
      aggiorna();
      void lista.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Classificazione non riuscita"));
    } finally {
      setOccupato(false);
    }
  }

  async function accettaProposte() {
    const perVoce = new Map<string, string[]>();
    // La fattura che copre più voci (tutte precise) si accetta come ripartizione.
    const ripartite = proposteScelte.filter((m) => quoteAccettabili(m));
    for (const m of proposteScelte) {
      if (ripartite.includes(m)) continue;
      perVoce.set(m.voce!.id, [...(perVoce.get(m.voce!.id) ?? []), m.id]);
    }
    setOccupato(true);
    let fatti = 0;
    try {
      for (const m of ripartite) {
        await bankRpc<number>("bank_movimento_ripartizione", {
          p_company: company, p_tx: m.id, p_revision: m.revisione, p_motivo: motivo.trim() || "Ripartizione della fattura accettata",
          p_quote: m.voce!.proposta_quote!.map((q) => ({ voce: q.id, cents: q.cents })),
        });
        fatti++;
      }
      for (const [voce, ids] of perVoce) {
        const r = await bankRpc<{ aggiornati: number }>("cassa_classifica_movimenti", {
          p_company: company, p_tx: ids, p_voce: voce, p_motivo: motivo.trim() || "Proposta accettata", p_anche_confermati: false,
        });
        fatti += r.aggiornati;
      }
      toast.success(t("{fatti} proposte accettate", { fatti: String(fatti ?? "") }));
      setScelti(new Set());
      aggiorna();
      void lista.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Proposte non accettate"), { description: fatti ? t("{fatti} erano già state salvate.", { fatti: String(fatti ?? "") }) : undefined });
      void lista.refetch();
    } finally {
      setOccupato(false);
    }
  }

  const rigaVoceCassa = (codice: string | null | undefined) => {
    const v = catalogo.data?.find((x) => x.codice === codice);
    const riga = v ? (verso === "in" ? v.voce_cassa_in : v.voce_cassa_out) : null;
    return riga ? etichettaVoce(riga) : null;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !occupato && onOpenChange(v)}>
      <DialogContent
        className="left-[1vw] top-[2dvh] flex h-[96dvh] max-h-[96dvh] w-[98vw] max-w-[1600px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden p-0 2xl:left-1/2 2xl:-translate-x-1/2"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b bg-background px-5 pb-4 pt-5 pr-12 max-sm:max-h-[36dvh] max-sm:overflow-y-auto">
          <DialogTitle className="text-xl">{t("Classifica i movimenti nelle categorie")}</DialogTitle>
          <DialogDescription>
            {t("Scegli uno o più movimenti a sinistra e la voce a destra. I movimenti senza categoria contano già nel saldo e nei totali del cash flow; classificandoli passano da «Da classificare» alla riga giusta.")}
          </DialogDescription>
          <div className="mt-3 flex min-w-0 flex-wrap items-end gap-3">
            <div className="flex rounded-lg border p-1" role="group" aria-label={t("Verso dei movimenti")}>
              <Button size="sm" variant={verso === "out" ? "default" : "ghost"} onClick={() => cambiaVerso("out")}>
                <ArrowUpRight className="mr-1 h-4 w-4" /> {t("Uscite")}
              </Button>
              <Button size="sm" variant={verso === "in" ? "default" : "ghost"} onClick={() => cambiaVerso("in")}>
                <ArrowDownLeft className="mr-1 h-4 w-4" /> {t("Entrate")}
              </Button>
            </div>
            <label className="text-xs">
              {t("Dal")}
              <Input type="date" value={dal} onChange={(e) => setDal(e.target.value)} className="mt-1 h-9 w-36" aria-label={t("Dal")} />
            </label>
            <label className="text-xs">
              {t("Al")}
              <Input type="date" value={al} onChange={(e) => setAl(e.target.value)} className="mt-1 h-9 w-36" aria-label={t("Al")} />
            </label>
            <Input
              placeholder={t("Cerca controparte, causale, importo…")}
              className="h-9 min-w-48 flex-1"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              aria-label={t("Cerca movimenti")}
            />
            <label className="flex h-9 items-center gap-2 text-sm">
              <Checkbox checked={perControparte} onCheckedChange={(v) => setPerControparte(!!v)} /> {t("Raggruppa per controparte")}
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label={t("Quali movimenti")}>
            {VISTE.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={vista === v.key}
                onClick={() => { setVista(v.key); setQuanti(A_VISTA); }}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  vista === v.key ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
                  v.key === "da-classificare" && vista !== v.key && conteggi[v.key].n > 0 && "border-amber-300 text-amber-900 dark:text-amber-200",
                )}
              >
                {t(v.label)} · {conteggi[v.key].n} · {euro(conteggi[v.key].cents)}
              </button>
            ))}
          </div>
        </DialogHeader>

        {lista.isError && (
          <p role="alert" className="shrink-0 border-b bg-red-50 px-5 py-3 text-sm text-destructive dark:bg-red-950">
            {(lista.error as Error).message}
          </p>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[58%_42%] lg:overflow-hidden">
          <section aria-label={t("Movimenti")} className="flex min-h-0 flex-col border-r max-lg:max-h-[50dvh]">
            <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-4 py-2.5 text-sm">
              <span className="font-semibold">
                {t("Movimenti")} <span className="font-normal text-muted-foreground">{righe.length}</span>
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={!righe.length} onClick={() => cambia(righe.map((r) => r.id), true)}>
                  {t("Seleziona tutti")}
                </Button>
                {scelti.size > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setScelti(new Set())}>{t("Deseleziona ({n})", { n: scelti.size })}</Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {lista.isPending ? (
                <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("Caricamento movimenti…")}
                </p>
              ) : righe.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">
                  {vista === "da-classificare" ? t("Nessun movimento da classificare in questo periodo: ottimo.") : t("Nessun movimento con questi filtri.")}
                </p>
              ) : (
                gruppi.map((g) => {
                  const tuttiGruppo = (("totali" in g ? g.totali : g.righe) as MovimentoDaClassificare[]);
                  const nGruppo = tuttiGruppo.filter((r) => scelti.has(r.id)).length;
                  return (
                    <div key={g.chiave || "tutti"}>
                      {g.titolo && (
                        <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b bg-muted px-4 py-2 text-sm">
                          <Checkbox
                            checked={nGruppo === tuttiGruppo.length ? true : nGruppo ? "indeterminate" : false}
                            onCheckedChange={(v) => cambia(tuttiGruppo.map((r) => r.id), !!v)}
                            aria-label={t("Seleziona tutti i movimenti di {titolo}", { titolo: t(g.titolo) })}
                          />
                          <span className="min-w-0 flex-1 truncate font-semibold">{t(g.titolo)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {tuttiGruppo.length} · {euro(tuttiGruppo.reduce((s, r) => s + r.cents, 0))}
                          </span>
                        </label>
                      )}
                      <ul className="divide-y">
                        {g.righe.map((m) => (
                          <li key={m.id}>
                            <label className={cn("flex cursor-pointer items-start gap-3 px-4 py-2.5 text-sm hover:bg-accent/50", scelti.has(m.id) && "bg-primary/5")}>
                              <Checkbox className="mt-0.5" checked={scelti.has(m.id)} onCheckedChange={(v) => cambia([m.id], !!v)} aria-label={t("Seleziona {movimento} del {data}", { movimento: m.descrizione ?? t("movimento"), data: giorno(m.data) })} />
                              <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{giorno(m.data)}</span>
                              <span className="min-w-0 flex-1">
                                {!perControparte && m.controparte && <span className="block truncate font-medium">{m.controparte}</span>}
                                <span className="block truncate text-muted-foreground" title={m.descrizione ?? undefined}>{m.descrizione || t("Causale non fornita")}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                                  {m.voce ? (
                                    <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-normal", m.voce.confermata ? "border-emerald-300 text-emerald-800 dark:text-emerald-300" : "border-amber-300 text-amber-900 dark:text-amber-200")} title={ORIGINE_VOCE[m.voce.origine] ? t(ORIGINE_VOCE[m.voce.origine]) : m.voce.origine}>
                                      {m.voce.confermata ? "" : `${t("Proposta:")} `}
                                      {m.voce.quote && m.voce.quote.length > 1 ? t("Ripartito: {voci}", { voci: m.voce.quote.map((q) => q.nome).join(" + ") }) : m.voce.nome}
                                    </Badge>
                                  ) : (
                                    <span className="text-amber-800 dark:text-amber-300">{t("Senza categoria")}</span>
                                  )}
                                  {!m.voce?.confermata && m.voce?.origine === "controparte" && <span className="text-muted-foreground">{t("come l'ultima volta")}</span>}
                                  {!m.voce?.confermata && m.voce?.origine === "regola" && <span className="text-muted-foreground">{t("da una vostra regola")}</span>}
                                  {!m.voce?.confermata && m.voce?.origine === "giroconto" && <span className="text-muted-foreground">{t("c'è il movimento opposto su un altro vostro conto")}</span>}
                                  {!m.voce?.confermata && m.voce?.origine === "documento" && (
                                    <span className="text-muted-foreground">
                                      {t("dalla fattura collegata")}
                                      {m.voce.proposta_quote && m.voce.proposta_quote.length > 1 && t(", che copre {n} voci: {voci}", { n: m.voce.proposta_quote.length, voci: m.voce.proposta_quote.map((q) => `${q.nome} ${euro(q.cents)}`).join(", ") })}
                                    </span>
                                  )}
                                </span>
                              </span>
                              <span className={cn("shrink-0 font-semibold tabular-nums", m.cents < 0 && "text-rose-700")}>{euro(m.cents)}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}
              {righe.length > quanti && (
                <div className="p-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => setQuanti((q) => q + A_VISTA)}>{t("Mostra altri {altri} di {n}", { altri: Math.min(A_VISTA, righe.length - quanti), n: righe.length - quanti })}</Button>
                </div>
              )}
            </div>
          </section>

          <section aria-label={t("Categoria da assegnare")} className="flex min-h-0 flex-col">
            <div className="border-b bg-muted/50 px-4 py-2.5 text-sm font-semibold">
              {selezionati.length
                ? (selezionati.length === 1 ? t("Assegna a {n} movimento · {totale}", { n: selezionati.length, totale: euro(totaleScelti) }) : t("Assegna a {n} movimenti · {totale}", { n: selezionati.length, totale: euro(totaleScelti) }))
                : t("Scegli i movimenti a sinistra")}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {!puoModificare && (
                <p className="rounded-md border p-3 text-sm text-muted-foreground">
                  {t("Puoi consultare le categorie; per assegnarle serve il permesso di riconciliare i movimenti bancari.")}
                </p>
              )}
              {puoModificare && proposteScelte.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
                  <p className="flex items-center gap-1.5 font-medium">
                    <Sparkles className="h-4 w-4" /> {t("{n} dei selezionati hanno una proposta", { n: proposteScelte.length })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("Dalla controparte o dalla vecchia categoria. Accettarle salva ognuno nella sua voce proposta.")}
                  </p>
                  <Button size="sm" className="mt-2" disabled={occupato} onClick={() => void accettaProposte()}>
                    {occupato ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                    {t("Accetta le proposte")}
                  </Button>
                </div>
              )}
              {puoModificare && (
                <>
                  <ScegliVoceCassa
                    catalogo={catalogo.data}
                    importo={verso === "in" ? 1 : -1}
                    occupato={occupato || !selezionati.length}
                    onScegli={(v) => void assegna(v)}
                    altezza="max-h-[46dvh]"
                    autoFocus={false}
                  />
                  {catalogo.isError && <p role="alert" className="text-xs text-destructive">{(catalogo.error as Error).message}</p>}
                  <Input placeholder={t("Motivo (facoltativo, resta nello storico)")} value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label={t("Motivo")} />
                  {giaConfermati > 0 && (
                    <label className="flex items-start gap-2 rounded-md border p-2.5 text-xs">
                      <Checkbox checked={ancheConfermati} onCheckedChange={(v) => setAncheConfermati(!!v)} className="mt-0.5" />
                      <span>{t("{giaConfermati} dei selezionati hanno già una categoria confermata da una persona. Spunta qui per cambiarla anche a loro; altrimenti restano come sono.", { giaConfermati: String(giaConfermati ?? "") })}</span>
                    </label>
                  )}
                </>
              )}
              {selezionati.length > 0 && selezionati.length <= 3 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {selezionati.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Link to={`/azienda/tesoreria?tab=transazioni&movimento=${m.id}`} className="inline-flex items-center gap-1 underline">
                        {t("Apri il movimento del {data}", { data: giorno(m.data) })} <ExternalLink className="h-3 w-3" />
                      </Link>
                      {m.voce && rigaVoceCassa(m.voce.codice) && <span>{t("· nel cash flow: {codice}", { codice: String(rigaVoceCassa(m.voce.codice) ?? "") })}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

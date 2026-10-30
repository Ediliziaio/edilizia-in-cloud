import { SpesePianoMezzo } from "./SpesePianoMezzo";
import { ViaggioSelect } from "./ViaggioSelect";
import { SupplierSelect } from "@/components/orders/SupplierSelect";
import { usePersonePianoMezzi } from "@/hooks/useMezziPianoEconomia";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Truck, Wrench, Pencil, Loader2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useAssegnaMezzoACommessa,
  useMezzi,
  useMezziDellaCommessa,
  useMontaQuantita,
  useMontaggiDellaCommessa,
  useRientroQuantita,
} from "@/hooks/useMezzi";
import { usePianoMezziCantiere } from "@/hooks/usePianoMezziCantiere";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { supabase } from "@/integrations/supabase/client";
import {
  costoPianoMezzo,
  finestraFasi,
  pianoAttivo,
  pianoDaAllineare,
  pianoPerFase,
  righeMezziCantiere,
  statoPianoMezzo,
  type PresenzaMezzo,
  type RigaMezzoCantiere,
  type PianoMezzo,
  type CostoPianoMezzo,
  type BaseCostoMezzo,
} from "@/lib/mezzi/pianoCantiere";
import { formatCurrency } from "@/lib/formatters";
import { oggiIso, formatData, giornoItaliano, POSSESSI } from "@/types/mezzi";
import { MezzoFormDialog } from "./MezzoFormDialog";
import { MezziCommessaCard } from "./MezziCommessaCard";

export function PianoMezziCantiere({
  orderId,
  faseId,
}: {
  orderId: string;
  faseId?: string;
}) {
  const perms = usePermissions();
  const vede = perms.canViewMezzi || perms.isAdmin;
  const modifica =
    vede && (perms.canEditMezzi || perms.isAdmin) && !perms.solaLettura;
  const costi = perms.canViewCosts === true;
  const {
    data: mezzi = [],
    isLoading: loadingMezzi,
    isError: erroreMezzi,
    refetch: refetchMezzi,
  } = useMezzi();
  const { piani, prezzi, salva } = usePianoMezziCantiere(orderId, vede, costi);
  const companyId = useEffectiveCompanyId();
  const fasi = useQuery({
    queryKey: ["mezzi-piani-fasi", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_work_phases")
        .select("id,name,start_date,end_date")
        .eq("order_id", orderId)
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return data;
    },
  });
  const dateCantiere = useQuery({
    queryKey: ["mezzi-piani-date", companyId, orderId],
    enabled: vede && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("work_start_date,work_end_date")
        .eq("company_id", companyId!)
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const [aperto, setAperto] = useState(false);
  const [nuovo, setNuovo] = useState<"mezzo" | "attrezzatura" | null>(null);
  // «È già in cantiere»: insieme alla prenotazione segna anche l'arrivo (31/10/2026).
  const [giaQui, setGiaQui] = useState(false);
  const [filtro, setFiltro] = useState("tutti");
  const [draft, setDraft] = useState<Partial<PianoMezzo>>({});
  const [ambito, setAmbito] = useState("cantiere");
  const [tariffa, setTariffa] = useState("");
  const [base, setBase] = useState<BaseCostoMezzo>("totale");
  const [extra, setExtra] = useState("");
  const [fornitore, setFornitore] = useState("");
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const persone = usePersonePianoMezzi(orderId, vede);
  const oggi = oggiIso();
  const asset = mezzi.find((m) => m.id === draft.mezzo_id);
  const noleggio = asset?.possesso.startsWith("noleggio");
  const presenti = useMezziDellaCommessa(vede ? orderId : undefined);
  const montati = useMontaggiDellaCommessa(vede ? orderId : undefined);
  const assegna = useAssegnaMezzoACommessa();
  const monta = useMontaQuantita();
  const rientro = useRientroQuantita();
  const piniFase = useMemo(() => (piani.data ?? []).filter((p) => pianoPerFase(p, faseId)), [piani.data, faseId]);
  // Un solo elenco: prenotazioni ancora valide e mezzi che sono sul cantiere adesso.
  const tutte = useMemo(() => {
    const qui: PresenzaMezzo[] = [
      ...(presenti.data ?? []).filter((m) => m.adesso).map((m) => ({
        mezzo_id: m.mezzo_id,
        dal: giornoItaliano(m.periodi.find((x) => !x.al)?.dal ?? oggi),
      })),
      ...(montati.data ?? []).filter((g) => g.adesso).map((g) => ({
        mezzo_id: g.mezzo_id, dal: g.dal, allocazione_id: g.id, quantita: g.quantita,
      })),
    ];
    const righe = righeMezziCantiere(piniFase, qui, oggi);
    // Nella finestra di una fase, i mezzi senza prenotazione valgono per tutto il cantiere: si vedono nella commessa.
    return faseId ? righe.filter((r) => r.piano) : righe;
  }, [piniFase, presenti.data, montati.data, oggi, faseId]);
  const rows = tutte.filter((r) => {
    const m = mezzi.find((m) => m.id === r.mezzo_id);
    return (
      filtro === "tutti" ||
      (filtro === "noleggio"
        ? m?.possesso.startsWith("noleggio")
        : filtro === "attrezzatura"
          ? m?.tipo === "attrezzatura"
          : m?.tipo !== "attrezzatura")
    );
  });
  const pianiPassati = piniFase.filter((p) => !pianoAttivo(p, oggi));
  const nStorico =
    pianiPassati.length +
    (presenti.data ?? []).filter((m) => !m.adesso).length +
    (montati.data ?? []).filter((g) => !g.adesso).length;
  const occupato = assegna.isPending || monta.isPending || rientro.isPending || salva.isPending;
  const arriva = async (mezzoId: string, piano: PianoMezzo | null, quantita?: number) => {
    const m = mezzi.find((x) => x.id === mezzoId);
    if (m?.gestione === "quantita")
      await monta.mutateAsync({ mezzoId, order_id: orderId, quantita: quantita ?? piano?.quantita ?? 1 });
    else await assegna.mutateAsync({ mezzoId, orderId });
    // Arrivato prima del previsto: la prenotazione parte da oggi.
    if (piano && piano.dal > oggi) await salva.mutateAsync({ ...piano, dal: oggi, al: piano.al && piano.al < oggi ? oggi : piano.al });
  };
  const rientra = async (r: RigaMezzoCantiere) => {
    if (r.presenza?.allocazione_id)
      await rientro.mutateAsync({ allocazioneId: r.presenza.allocazione_id, quantita: r.presenza.quantita ?? 0 });
    else await assegna.mutateAsync({ mezzoId: r.mezzo_id, orderId: null });
    // Rientrato: la prenotazione finisce oggi e passa nello storico.
    if (r.piano && (!r.piano.al || r.piano.al > oggi))
      await salva.mutateAsync({ ...r.piano, dal: r.piano.dal > oggi ? oggi : r.piano.dal, al: oggi });
  };
  const azione = (fn: () => Promise<void>) => {
    void fn().catch(() => {
      /* le mutation mostrano l'errore */
    });
  };
  const apri = (p?: PianoMezzo) => {
    setDraft(
      p ?? {
        mezzo_id: "",
        dal: oggi,
        al: null,
        quantita: 1,
        fase_ids: faseId ? [faseId] : [],
        annullato: false,
      },
    );
    setGiaQui(false);
    setAmbito(
      p
        ? p.fase_ids.length
          ? "fasi"
          : "cantiere"
        : faseId
          ? "fasi"
          : "cantiere",
    );
    const c = p ? prezzi.data?.[p.id] : undefined;
    setTariffa(c ? String(c.tariffa) : "");
    setBase(c?.base ?? "totale");
    setExtra(c ? String(c.extra) : "");
    setFornitore(c?.fornitore ?? "");
    setSupplierId(c?.supplier_id ?? null);
    setAperto(true);
  };
  const prezzo: CostoPianoMezzo = {
    tariffa: Number(tariffa),
    base,
    extra: Number(extra || 0),
    fornitore: fornitore.trim() || null,
    supplier_id: supplierId,
  };
  const totale =
    tariffa.trim() && draft.dal
      ? costoPianoMezzo({ dal: draft.dal, al: draft.al ?? null }, prezzo)
      : null;
  const valido =
    !!draft.mezzo_id &&
    !!draft.dal &&
    (!draft.al || draft.al >= draft.dal) &&
    Number(draft.quantita) > 0 &&
    (ambito === "cantiere" || !!draft.fase_ids?.length) &&
    (!costi ||
      (!tariffa.trim()
        ? !noleggio
        : Number.isFinite(prezzo.tariffa) &&
          prezzo.tariffa >= 0 &&
          Number.isFinite(prezzo.extra) &&
          prezzo.extra >= 0));
  const periodiSuggeriti =
    ambito === "cantiere"
      ? [
          {
            start_date: dateCantiere.data?.work_start_date,
            end_date: dateCantiere.data?.work_end_date,
          },
        ]
      : (fasi.data ?? []).filter((f) => draft.fase_ids?.includes(f.id));
  const inizioSuggerito = periodiSuggeriti
    .map((p) => p.start_date)
    .filter((x): x is string => !!x)
    .sort()[0];
  const fineSuggerita = periodiSuggeriti
    .map((p) => p.end_date)
    .filter((x): x is string => !!x)
    .sort()
    .at(-1);
  const salvaDraft = async () => {
    if (!valido) return;
    const arrivo = !draft.id && giaQui;
    const dal = arrivo && draft.dal! > oggi ? oggi : draft.dal;
    try {
      await salva.mutateAsync({
        ...draft,
        dal,
        fase_ids: ambito === "cantiere" ? [] : draft.fase_ids,
        ...(costi ? { costo: tariffa.trim() ? prezzo : null } : {}),
      });
      if (arrivo) await arriva(draft.mezzo_id!, null, Number(draft.quantita) || 1);
      setAperto(false);
    } catch {
      /* mutation mostra l'errore */
    }
  };
  if (!vede) return null;
  const nomeFase = (id: string) => fasi.data?.find((f) => f.id === id)?.name ?? "Fase rimossa";
  const statoRiga = (r: RigaMezzoCantiere) =>
    r.stato === "sul_cantiere"
      ? { testo: `Sul cantiere dal ${formatData(r.presenza!.dal)}`, classe: "border-emerald-200 bg-emerald-50 text-emerald-800" }
      : r.stato === "atteso"
        ? { testo: `Atteso dal ${formatData(r.piano!.dal)}`, classe: "border-amber-200 bg-amber-50 text-amber-900" }
        : { testo: `Prenotato dal ${formatData(r.piano!.dal)}`, classe: "" };
  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border bg-background p-3 sm:p-4"
        aria-label="Mezzi e attrezzature del cantiere"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold">
              <Truck className="h-4 w-4" />
              Mezzi e attrezzature
              {tutte.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">({tutte.length})</span>
              )}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {faseId ? "Per questa fase e per tutto il cantiere." : "Prenotati, attesi e sul cantiere."}{" "}
              <Link to="/azienda/manodopera?tab=mezzi" className="underline underline-offset-2 hover:text-foreground">
                Parco mezzi e noleggi
              </Link>
            </p>
          </div>
          {modifica && (
            <Button
              size="sm"
              onClick={() => apri()}
              disabled={loadingMezzi || erroreMezzi || fasi.isError}
            >
              <Plus className="mr-1 h-4 w-4" />
              Aggiungi mezzo
            </Button>
          )}
        </div>
        {tutte.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {["tutti", "mezzo", "attrezzatura", "noleggio"].map((v, i) => (
              <Button
                key={v}
                size="sm"
                variant={filtro === v ? "secondary" : "ghost"}
                className="h-8"
                onClick={() => setFiltro(v)}
              >
                {["Tutti", "Mezzi", "Attrezzature", "Noleggi"][i]}
              </Button>
            ))}
          </div>
        )}
        {piani.isLoading || presenti.isLoading || montati.isLoading ? (
          <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin" />
        ) : piani.isError || erroreMezzi || fasi.isError || presenti.isError || montati.isError ? (
          <p role="alert" className="py-4 text-sm text-destructive">
            Impossibile caricare i mezzi del cantiere.{" "}
            <button
              className="underline"
              onClick={() => {
                void piani.refetch();
                void fasi.refetch();
                void refetchMezzi();
                void presenti.refetch();
                void montati.refetch();
              }}
            >
              Riprova
            </button>
          </p>
        ) : rows.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            {tutte.length ? "Nessun mezzo di questo tipo." : faseId ? "Nessun mezzo per questa fase." : "Nessun mezzo su questo cantiere."}
            {!tutte.length && (
              <p className="mt-1 text-xs">Ad esempio: la gru per tutto il cantiere, la betoniera per i giorni dei getti.</p>
            )}
          </div>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border" aria-label="Mezzi del cantiere">
            {rows.map((r) => {
              const p = r.piano;
              const m = mezzi.find((m) => m.id === r.mezzo_id);
              const c = p ? prezzi.data?.[p.id] : undefined;
              const t = p && c ? costoPianoMezzo(p, c) : null;
              const fuori = p ? pianoDaAllineare(p, fasi.data ?? []) : null;
              const st = statoRiga(r);
              const nome = m?.nome ?? "Risorsa archiviata";
              return (
                <li key={r.chiave} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    {m?.tipo === "attrezzatura" ? <Wrench className="h-4 w-4 text-slate-600" /> : <Truck className="h-4 w-4 text-slate-600" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      {p ? (
                        <button
                          type="button"
                          className="text-left text-sm font-medium text-blue-700 hover:underline"
                          onClick={() => apri(p)}
                          disabled={costi && (prezzi.isFetching || prezzi.isError)}
                        >
                          {nome}
                        </button>
                      ) : (
                        <Link to={`/azienda/mezzi/${r.mezzo_id}`} className="text-sm font-medium hover:underline">
                          {nome}
                        </Link>
                      )}
                      <Badge variant="outline" className={`whitespace-nowrap text-[11px] ${st.classe}`}>{st.testo}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        POSSESSI.find((x) => x.value === m?.possesso)?.label,
                        m?.gestione === "quantita" ? `${r.presenza?.quantita ?? p?.quantita} ${m.unita_misura ?? "pz"}` : null,
                        p ? (p.fase_ids.length ? p.fase_ids.map(nomeFase).join(", ") : "Tutto il cantiere") : "Senza prenotazione",
                        p ? `${formatData(p.dal)} → ${p.al ? formatData(p.al) : "fine da definire"}` : null,
                        p?.responsabile_hr_id
                          ? `Referente: ${persone.data?.find((x) => x.id === p.responsabile_hr_id)?.nome ?? "assegnato"}`
                          : null,
                      ].filter(Boolean).join(" · ")}
                    </p>
                    {fuori && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                        Le fasi ora vanno dal {formatData(fuori.dal)} al {formatData(fuori.al)}.
                        {modifica && (
                          <button
                            type="button"
                            className="font-medium underline"
                            disabled={occupato}
                            onClick={() => azione(() => salva.mutateAsync({ ...p!, dal: fuori.dal, al: fuori.al }))}
                          >
                            Allinea alle fasi
                          </button>
                        )}
                      </p>
                    )}
                    {costi && p && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {prezzi.isError
                          ? "Costo non disponibile"
                          : prezzi.isFetching
                            ? "Caricamento…"
                            : t !== null
                              ? `Costo previsto ${formatCurrency(t)}`
                              : c
                                ? "Costo: definisci la fine"
                                : "Costo da valorizzare"}
                      </p>
                    )}
                  </div>
                  {modifica && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-9 shrink-0"
                      disabled={occupato || loadingMezzi}
                      onClick={() => azione(() => (r.stato === "sul_cantiere" ? rientra(r) : arriva(r.mezzo_id, p)))}
                    >
                      {r.stato === "sul_cantiere" ? (
                        <><ArrowUpFromLine className="mr-1 h-4 w-4" />È rientrato</>
                      ) : (
                        <><ArrowDownToLine className="mr-1 h-4 w-4" />È arrivato</>
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {prezzi.isError && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Costi non disponibili.{" "}
            <button className="underline" onClick={() => void prezzi.refetch()}>
              Riprova
            </button>
          </p>
        )}
        {/* Uno storico solo (31/10/2026): prenotazioni finite, rientri, viaggi e stime. */}
        {!faseId && (
          <details className="mt-3 rounded-lg border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              Storico{nStorico ? ` (${nStorico})` : ""}, viaggi{costi ? " e costi" : ""}
            </summary>
            <div className="mt-3 space-y-3">
              {pianiPassati.length > 0 && (
                <ul className="divide-y rounded-lg border text-xs" aria-label="Prenotazioni passate">
                  {pianiPassati.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => apri(p)}>
                        {mezzi.find((m) => m.id === p.mezzo_id)?.nome ?? "Risorsa archiviata"}
                      </button>
                      <span className="text-muted-foreground">
                        {formatData(p.dal)} → {p.al ? formatData(p.al) : "—"} · {statoPianoMezzo(p, oggi)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <MezziCommessaCard orderId={orderId} storico />
            </div>
          </details>
        )}
        {costi && (
          <p className="mt-2 text-[11px] text-muted-foreground">Costi previsti al netto IVA, separati dalle fatture.</p>
        )}
      </section>
      <Dialog
        open={aperto}
        onOpenChange={(v) => {
          if (!salva.isPending) setAperto(v);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Dettaglio del mezzo sul cantiere" : "Aggiungi un mezzo"}
            </DialogTitle>
            <DialogDescription>
              Scegli il mezzo, dove serve e per quanto. Se è già in cantiere, segnalo qui.
            </DialogDescription>
          </DialogHeader>
          <fieldset
            disabled={!modifica || salva.isPending}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="piano-risorsa">Mezzo o attrezzatura</Label>
              <ViaggioSelect
                label="Mezzo o attrezzatura"
                id="piano-risorsa"
                value={draft.mezzo_id ?? ""}
                disabled={!!draft.id || !modifica}
                onValueChange={(id) =>
                  setDraft({ ...draft, mezzo_id: id, quantita: 1 })
                }
                emptyMessage="Risorsa non trovata. Puoi registrarla con i pulsanti qui sotto."
                options={[
                  { value: "", label: "Cerca nel parco aziendale…" },
                  ...mezzi
                    .filter(
                      (m) =>
                        m.stato !== "fuori_servizio" || m.id === draft.mezzo_id,
                    )
                    .map((m) => ({
                      value: m.id,
                      label: `${m.nome} · ${m.tipo === "attrezzatura" ? "Attrezzatura" : "Mezzo"} · ${POSSESSI.find((x) => x.value === m.possesso)?.label ?? ""}`,
                    })),
                ]}
              />
              {!draft.id && (
                <div className="flex gap-2">
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("mezzo")}
                  >
                    + Registra mezzo o noleggio
                  </Button>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setNuovo("attrezzatura")}
                  >
                    + Registra attrezzatura
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="piano-ambito">Dove serve</Label>
              <ViaggioSelect
                label="Dove serve"
                id="piano-ambito"
                value={ambito}
                onValueChange={setAmbito}
                disabled={!modifica}
                options={[
                  { value: "cantiere", label: "Tutto il cantiere" },
                  { value: "fasi", label: "Solo alcune fasi" },
                ]}
              />
              {ambito === "fasi" && (
                <div className="max-h-36 space-y-2 overflow-y-auto rounded-lg border p-3">
                  {fasi.data?.length ? (
                    fasi.data.map((f) => (
                      <label
                        key={f.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={draft.fase_ids?.includes(f.id) ?? false}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...(draft.fase_ids ?? []), f.id]
                              : (draft.fase_ids ?? []).filter((id) => id !== f.id);
                            // Nuovo mezzo: le date seguono le fasi scelte, poi si possono cambiare.
                            const w = !draft.id ? finestraFasi(ids, fasi.data ?? []) : null;
                            setDraft({ ...draft, fase_ids: ids, ...(w ? { dal: w.dal, al: w.al } : {}) });
                          }}
                        />
                        {f.name}
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Crea prima le lavorazioni nella commessa.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Responsabile della risorsa</Label>
              <ViaggioSelect
                label="Responsabile della risorsa"
                value={draft.responsabile_hr_id ?? ""}
                disabled={!modifica || persone.isLoading || persone.isError}
                emptyMessage="Nessuna persona corrispondente."
                onValueChange={(v) =>
                  setDraft({ ...draft, responsabile_hr_id: v || null })
                }
                options={[
                  { value: "", label: "Nessun responsabile assegnato" },
                  ...(persone.data ?? [])
                    .slice()
                    .sort(
                      (a, b) => Number(b.in_cantiere) - Number(a.in_cantiere),
                    )
                    .map((p) => ({
                      value: p.id,
                      label: `${p.nome}${p.capocantiere ? " · Capocantiere" : p.in_cantiere ? " · Nel cantiere" : " · Azienda"}`,
                    })),
                ]}
              />
              {persone.isError && (
                <p role="alert" className="text-xs text-destructive">
                  Persone non disponibili.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void persone.refetch()}
                  >
                    Riprova
                  </button>
                </p>
              )}
              {modifica && persone.data?.some((p) => p.capocantiere) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      responsabile_hr_id: persone.data!.find(
                        (p) => p.capocantiere,
                      )!.id,
                    })
                  }
                >
                  Usa il capocantiere
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Referente operativo di questa assegnazione. Non cambia nomine di
                sicurezza, accessi o abilitazioni all’uso.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="piano-dal">Dal</Label>
                <Input
                  id="piano-dal"
                  type="date"
                  value={draft.dal ?? ""}
                  onChange={(e) => setDraft({ ...draft, dal: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="piano-al">Al (compreso)</Label>
                <Input
                  id="piano-al"
                  type="date"
                  min={draft.dal}
                  value={draft.al ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, al: e.target.value || null })
                  }
                />
              </div>
            </div>
            {inizioSuggerito && fineSuggerita && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft({
                    ...draft,
                    dal: inizioSuggerito,
                    al: fineSuggerita,
                  })
                }
              >
                Usa le date{" "}
                {ambito === "cantiere"
                  ? "del cantiere"
                  : "delle fasi selezionate"}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              Lascia la fine vuota se ancora da definire. Se le fasi si spostano,
              le date restano queste: l’elenco te lo segnala e le allinei con un clic.
            </p>
            {!draft.id && (
              <label className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <input type="checkbox" checked={giaQui} onChange={(e) => setGiaQui(e.target.checked)} />
                È già in cantiere (arrivato oggi)
              </label>
            )}
            {asset?.gestione === "quantita" && (
              <div className="space-y-2">
                <Label htmlFor="piano-quantita">
                  Quantità ({asset.unita_misura ?? "pz"})
                </Label>
                <Input
                  id="piano-quantita"
                  type="number"
                  min="0.01"
                  step="any"
                  value={draft.quantita ?? 1}
                  onChange={(e) =>
                    setDraft({ ...draft, quantita: Number(e.target.value) })
                  }
                />
              </div>
            )}
            {costi && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <h4 className="text-sm font-semibold">
                  {noleggio
                    ? "Costo del noleggio"
                    : "Costo previsto dell’assegnazione (facoltativo)"}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="piano-tariffa">
                      Importo €{noleggio ? " *" : ""}
                    </Label>
                    <Input
                      id="piano-tariffa"
                      type="number"
                      min="0"
                      step="0.01"
                      value={tariffa}
                      onChange={(e) => setTariffa(e.target.value)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piano-base">Tariffa</Label>
                    <ViaggioSelect
                      label="Tariffa"
                      id="piano-base"
                      value={base}
                      onValueChange={(v) => setBase(v as BaseCostoMezzo)}
                      disabled={!modifica}
                      options={[
                        { value: "totale", label: "Totale concordato" },
                        { value: "giorno", label: "Al giorno" },
                        { value: "settimana", label: "A settimana (7 giorni)" },
                        { value: "mese", label: "Al mese (30 giorni)" },
                      ]}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="piano-extra">
                      Trasporto, montaggio e altri extra €
                    </Label>
                    <Input
                      id="piano-extra"
                      type="number"
                      min="0"
                      step="0.01"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Fornitore</Label>
                    <SupplierSelect
                      searchable
                      value={supplierId ?? undefined}
                      fallbackCompanyId={companyId ?? undefined}
                      allowCreate={
                        modifica &&
                        (perms.canManageSuppliers ||
                          perms.canEditSettingsSuppliers ||
                          perms.isAdmin)
                      }
                      onSupplierNameChange={setFornitore}
                      onValueChange={(id) => {
                        setSupplierId(id ?? null);
                      }}
                    />
                    {!supplierId && fornitore && (
                      <p className="text-xs text-muted-foreground">
                        Riferimento precedente: {fornitore}. Scegli l’anagrafica
                        da collegare.
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Tariffa per l’intera assegnazione, quantità inclusa. Tutti i
                  giorni di calendario compresi; settimane e mesi
                  riproporzionati.
                </p>
                <p className="text-sm font-semibold">
                  Totale previsto:{" "}
                  {totale !== null
                    ? formatCurrency(totale)
                    : "indica importo e data di fine"}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="piano-note">Note operative</Label>
              <Input
                id="piano-note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>
            {draft.id && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.annullato ?? false}
                  onChange={(e) =>
                    setDraft({ ...draft, annullato: e.target.checked })
                  }
                />
                Assegnazione annullata (rimane nello storico)
              </label>
            )}
          </fieldset>
          {draft.id && (
            <SpesePianoMezzo
              orderId={orderId}
              pianoId={draft.id}
              supplierId={supplierId}
            />
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAperto(false)}
              disabled={salva.isPending}
            >
              {modifica ? "Annulla" : "Chiudi"}
            </Button>
            {modifica && (
              <Button
                disabled={!valido || salva.isPending || fasi.isLoading}
                onClick={() => void salvaDraft()}
              >
                {salva.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-1 h-4 w-4" />
                )}
                {draft.id ? "Salva" : "Aggiungi"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {nuovo && (
        <MezzoFormDialog
          open
          onOpenChange={(v) => {
            if (!v) setNuovo(null);
          }}
          classe={nuovo}
          onSalvato={(id) => {
            setDraft((d) => ({ ...d, mezzo_id: id }));
            setNuovo(null);
          }}
        />
      )}
    </div>
  );
}

export function MezziFaseCantiere({
  orderId,
  faseId,
}: {
  orderId: string;
  faseId: string;
}) {
  const [open, setOpen] = useState(false);
  const p = usePermissions();
  const vede = p.canViewMezzi || p.isAdmin;
  const { piani } = usePianoMezziCantiere(orderId, vede, false);
  if (!vede) return null;
  const n =
    piani.data?.filter(
      (x) =>
        !x.annullato && (!x.al || x.al >= oggiIso()) && pianoPerFase(x, faseId),
    ).length ?? 0;
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="min-h-9 rounded-full text-xs"
        onClick={() => setOpen(true)}
      >
        <Truck className="mr-1 h-3.5 w-3.5" />
        Mezzi e attrezzature{n ? ` · ${n}` : ""}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Risorse della lavorazione</DialogTitle>
            <DialogDescription>
              Gestisci le assegnazioni senza uscire dalla commessa.
            </DialogDescription>
          </DialogHeader>
          {open && <PianoMezziCantiere orderId={orderId} faseId={faseId} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

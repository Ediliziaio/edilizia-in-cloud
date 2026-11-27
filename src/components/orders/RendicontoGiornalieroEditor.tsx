/**
 * Editor del rendiconto giornaliero (27/11/2026): data, lavori del giorno, righe per categoria coi prezzi.
 * Stessa veste del rapportino dell'ufficio (RapportiniUfficio): stessa finestra, stessi blocchi titolati,
 * stessa riga «nome + valore»; in più le colonne del prezzo e dell'importo.
 * Il prezzo lo decide il database: dopo ogni salvataggio si rilegge. Chi scrive un prezzo a mano lo segna
 * (prezzo_a_mano) e il listino non lo riscrive più. Conferma rifiuta le righe senza prezzo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { Blocco } from "@/components/orders/BloccoTitolato";
import { supabase } from "@/integrations/supabase/client";
import { useOrderWorkPhases } from "@/hooks/useOrderWorkPhases";
import { useMezzi } from "@/hooks/useMezzi";
import { PulsantePdfRendiconto } from "@/components/orders/PulsantePdfRendiconto";
import { CercaNelListino } from "@/components/orders/CercaNelListino";
import { formatCurrency } from "@/lib/formatters";
import { messaggioErrore } from "@/lib/messaggioErrore";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import type { VoceListino } from "@/lib/campo/prezzoVoceRapportino";
import {
  CATEGORIE, ETICHETTA_FONTE, annullaRendiconto, chiaveRiga, confermaRendiconto, importoRiga, leggiRendiconto,
  rendicontoDelGiorno, riapriRendiconto, salvaRendiconto, senzaPrezzo, type CategoriaRiga, type RigaRendiconto, type StatoRendiconto,
} from "@/lib/rendiconti/rendicontiGiornalieri";

const oggi = () => new Date().toLocaleDateString("en-CA");

/** Campo numero che si scrive con la virgola: tiene il testo, comunica il numero quando è valido. */
function Numero({ valore, onCambia, etichetta, className, disabled }: {
  valore: number | null; onCambia: (n: number) => void; etichetta: string; className?: string; disabled?: boolean;
}) {
  const [testo, setTesto] = useState(valore == null ? "" : String(valore).replace(".", ","));
  // Il valore cambia da fuori (rilettura dal database): il testo lo segue, salvo che dica già lo stesso numero.
  const [precedente, setPrecedente] = useState(valore);
  if (valore !== precedente) {
    setPrecedente(valore);
    if (valore != null && Number(testo.replace(",", ".")) !== valore) setTesto(String(valore).replace(".", ","));
  }
  return (
    <Input aria-label={etichetta} inputMode="decimal" disabled={disabled} className={className} value={testo}
      onChange={(e) => {
        setTesto(e.target.value);
        const n = Number(e.target.value.replace(",", "."));
        if (e.target.value.trim() !== "" && Number.isFinite(n) && n >= 0) onCambia(n);
      }} />
  );
}

interface Props {
  orderId: string;
  /** null: rendiconto nuovo. */
  rendicontoId: string | null;
  puoModificare: boolean;
  onClose: () => void;
}

export function RendicontoGiornalieroEditor({ orderId, rendicontoId, puoModificare, onClose }: Props) {
  const tr = useT();
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(rendicontoId);
  const [stato, setStato] = useState<StatoRendiconto>("bozza");
  const [numero, setNumero] = useState<number | null>(null);
  const [data, setData] = useState(oggi());
  const [lavori, setLavori] = useState("");
  const [note, setNote] = useState("");
  const [righe, setRighe] = useState<RigaRendiconto[]>([]);
  const [salSigillato, setSalSigillato] = useState(false);
  const [aggiungendo, setAggiungendo] = useState<CategoriaRiga | null>(null);
  const [rapportiniNuovi, setRapportiniNuovi] = useState(0);

  const { employees } = useOrderWorkPhases(orderId);
  const { data: mezzi = [] } = useMezzi();
  const ordine = useQuery({
    queryKey: ["rendiconto-giornaliero-ordine", orderId],
    queryFn: async () => {
      const { data: o, error } = await supabase.from("orders").select("tariffa_manodopera_id").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return (o as { tariffa_manodopera_id: string | null } | null)?.tariffa_manodopera_id ?? null;
    },
  });

  const caricato = useRef<string | null>(null);
  const applica = (d: Awaited<ReturnType<typeof leggiRendiconto>>) => {
    setId(d.testata.id); setStato(d.testata.stato); setNumero(d.testata.numero); setData(d.testata.data);
    setLavori(d.testata.descrizione_lavori ?? ""); setNote(d.testata.note ?? ""); setRighe(d.righe);
    setSalSigillato(!!d.testata.sal_id); setRapportiniNuovi(d.testata.rapportini_nuovi);
  };
  const lettura = useQuery({
    queryKey: ["rendiconto-giornaliero", rendicontoId],
    enabled: !!rendicontoId,
    queryFn: () => leggiRendiconto(rendicontoId!),
  });
  useEffect(() => {
    if (lettura.data && caricato.current !== rendicontoId) { caricato.current = rendicontoId; applica(lettura.data); }
  }, [lettura.data, rendicontoId]);

  const modificabile = puoModificare && stato === "bozza" && !salSigillato;
  const totale = useMemo(() => righe.reduce((s, r) => s + importoRiga(r), 0), [righe]);
  const senza = righe.filter(senzaPrezzo).length;

  const aggiorna = (chiave: string, patch: Partial<RigaRendiconto>) =>
    setRighe((rs) => rs.map((r) => (r.chiave === chiave ? { ...r, ...patch } : r)));
  const aggiungi = (r: Partial<RigaRendiconto> & { categoria: CategoriaRiga }) => {
    const cat = CATEGORIE.find((c) => c.valore === r.categoria)!;
    setRighe((rs) => [...rs, {
      chiave: chiaveRiga(), descrizione: "", unita: cat.unita, quantita: 1, prezzo_unitario: null, prezzo_a_mano: false,
      prezzo_fonte: null, listino_voce_id: null, employee_id: null, mezzo_id: null, fase_id: null, note: null, ...r,
    }]);
  };
  const daListino = (categoria: CategoriaRiga, v: VoceListino) => {
    const prodotto = !v.tariffa_id;
    aggiungi({
      categoria, descrizione: v.descrizione, unita: v.unita || "cad",
      listino_voce_id: v.tariffa_id ?? null,
      prezzo_unitario: v.prezzo ?? null,
      // Un prodotto del listino prodotti non ha una voce di listino voci: il suo prezzo si scrive.
      prezzo_a_mano: prodotto && v.prezzo != null,
      prezzo_fonte: prodotto ? (v.prezzo != null ? "manuale" : "mancante") : v.fonte,
    });
  };

  const bozza = () => ({ id, order_id: orderId, data, descrizione_lavori: lavori, note, righe });
  const dopo = async (idSalvato: string) => {
    // Il prezzo lo ha deciso il server: si rilegge.
    applica(await leggiRendiconto(idSalvato));
    caricato.current = rendicontoId ?? idSalvato;
    void qc.invalidateQueries({ queryKey: ["rendiconti-giornalieri", orderId] });
    void qc.invalidateQueries({ queryKey: ["rendiconto-giornaliero", idSalvato] });
    void qc.invalidateQueries({ queryKey: ["appalto-rendiconto"] });
  };
  const errore = (e: unknown) => toast.error(messaggioErrore(e, tr("Operazione non riuscita")));
  const senzaQuantita = righe.find((r) => !(r.quantita > 0));
  const salva = useMutation({
    mutationFn: () => {
      if (senzaQuantita) throw new Error(tr("La riga «{nome}» ha quantità 0: scrivila o toglila", { nome: senzaQuantita.descrizione || tr("senza nome") }));
      return salvaRendiconto(bozza());
    },
    onSuccess: async (nuovo) => { await dopo(nuovo); toast.success(tr("Rendiconto salvato")); },
    onError: errore,
  });
  const conferma = useMutation({
    mutationFn: async () => { const nuovo = await salvaRendiconto(bozza()); setId(nuovo); await confermaRendiconto(nuovo); return nuovo; },
    onSuccess: async (nuovo) => { await dopo(nuovo); toast.success(tr("Rendiconto confermato")); },
    onError: async (e) => { errore(e); if (id) await dopo(id).catch((): void => undefined); },
  });
  const cambiaStato = useMutation({
    mutationFn: async (azione: "riapri" | "annulla") => {
      if (!id) return null;
      await (azione === "riapri" ? riapriRendiconto(id) : annullaRendiconto(id));
      return id;
    },
    onSuccess: async (v) => { if (v) await dopo(v); },
    onError: errore,
  });
  const occupato = salva.isPending || conferma.isPending || cambiaStato.isPending;

  const nomeStato: Record<StatoRendiconto, string> = { bozza: tr("Bozza"), confermato: tr("Confermato"), annullato: tr("Annullato") };

  const aggiungiPersona = (idPersona: string) => {
    const p = employees.find((e) => e.id === idPersona);
    if (!p) return;
    aggiungi({ categoria: "manodopera", descrizione: p.label, unita: "ora", quantita: 8, employee_id: p.id, listino_voce_id: ordine.data ?? null,
      prezzo_fonte: ordine.data ? null : "mancante" });
  };
  const aggiungiMezzo = (idMezzo: string) => {
    const m = mezzi.find((x) => x.id === idMezzo);
    if (!m) return;
    const tariffa = (m as { tariffa_id?: string | null }).tariffa_id ?? null;
    aggiungi({ categoria: "mezzo", descrizione: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}`, unita: "ora", quantita: 8, mezzo_id: m.id,
      listino_voce_id: tariffa, prezzo_fonte: tariffa ? null : "mancante" });
  };
  // Rapportini scritti dopo: si salva quello che c'è, poi il database aggiunge le loro voci e si rilegge.
  const prendiNuovi = useMutation({
    mutationFn: async () => {
      const idSalvato = await salvaRendiconto(bozza());
      const r = await rendicontoDelGiorno(orderId, data);
      return { idSalvato, r };
    },
    onSuccess: async ({ idSalvato, r }) => {
      await dopo(r.id ?? idSalvato);
      if (r.aggiunti > 0) toast.success(tr("Prese le voci di {n} rapportini", { n: r.rapportini }));
    },
    onError: errore,
  });

  const fonteRiga = (r: RigaRendiconto) => {
    if (senzaPrezzo(r)) return <span className="text-amber-700">{tr("prezzo da definire")}</span>;
    if (r.prezzo_fonte) return <span className="text-muted-foreground">{tr(ETICHETTA_FONTE[r.prezzo_fonte])}</span>;
    return <span className="text-muted-foreground">{tr("prezzo al salvataggio")}</span>;
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {id && numero != null ? tr("Rendiconto n. {n}", { n: numero }) : rendicontoId ? tr("Rendiconto") : tr("Nuovo rendiconto del giorno")}
            {id && !lettura.isLoading && <span className="rounded border px-1.5 py-0 text-[11px] font-normal">{nomeStato[stato]}</span>}
          </DialogTitle>
          <DialogDescription>{tr("Il foglio per il committente: le voci del giorno, con quantità e prezzo. Il rapportino resta il diario interno.")}</DialogDescription>
        </DialogHeader>
        {salSigillato && <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">{tr("È già nel rendiconto del periodo: non si modifica.")}</p>}
        {rapportiniNuovi > 0 && !salSigillato && stato !== "annullato" && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            <span>
              {stato === "bozza"
                ? tr(rapportiniNuovi === 1 ? "C'è {n} rapportino nuovo di questo giorno: le sue voci non sono ancora qui." : "Ci sono {n} rapportini nuovi di questo giorno: le loro voci non sono ancora qui.", { n: rapportiniNuovi })
                : tr(rapportiniNuovi === 1 ? "C'è {n} rapportino nuovo di questo giorno: riapri il rendiconto per aggiungerne le voci." : "Ci sono {n} rapportini nuovi di questo giorno: riapri il rendiconto per aggiungerne le voci.", { n: rapportiniNuovi })}
            </span>
            {stato === "bozza" && modificabile && (
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1 bg-background text-xs" disabled={occupato || prendiNuovi.isPending} onClick={() => prendiNuovi.mutate()}>
                {prendiNuovi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{tr("Aggiungi le voci dei rapportini nuovi")}
              </Button>
            )}
          </div>
        )}
        {lettura.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">{tr("Caricamento…")}</p> : (
          <section aria-label={tr("Rendiconto del giorno")} className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-muted-foreground">{tr("Giorno")}
                <Input type="date" aria-label={tr("Data")} className="h-9 w-40 text-foreground" value={data} disabled={!modificabile} onChange={(e) => setData(e.target.value)} />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Cosa si è fatto")}
              <Textarea rows={2} maxLength={4000} aria-label={tr("Lavori del giorno")} className="text-foreground" value={lavori} disabled={!modificabile}
                onChange={(e) => setLavori(e.target.value)} placeholder={tr("Cosa si è fatto, per il committente")} />
            </label>

            {CATEGORIE.map((c) => {
              const dentro = righe.filter((r) => r.categoria === c.valore);
              const subtotale = dentro.reduce((t, r) => t + importoRiga(r), 0);
              return (
                <Blocco key={c.valore} titolo={tr(c.titolo)} destra={dentro.length > 0 ? `${dentro.length} · ${formatCurrency(subtotale)}` : undefined}>
                  {dentro.length > 0 && (
                    <ul aria-label={tr(c.titolo)} className="divide-y rounded-md border">
                      {dentro.map((r) => {
                        const legata = !!(r.employee_id || r.mezzo_id);
                        return (
                          <li key={r.chiave} className="flex flex-wrap items-center gap-2 px-2 py-0.5">
                            <div className="min-w-[8rem] flex-1">
                              {legata
                                ? <span className="block truncate text-sm">{r.descrizione}</span>
                                : <Input aria-label={tr("Descrizione")} className="h-7 text-sm" value={r.descrizione} disabled={!modificabile}
                                    onChange={(e) => aggiorna(r.chiave, { descrizione: e.target.value })} />}
                              <span className="block text-[11px]">{fonteRiga(r)}</span>
                            </div>
                            <Numero etichetta={tr("Quantità")} className="h-7 w-20 text-right" disabled={!modificabile} valore={r.quantita}
                              onCambia={(n) => aggiorna(r.chiave, { quantita: n })} />
                            {legata || r.listino_voce_id
                              ? <span className="w-10 text-xs text-muted-foreground">{r.unita}</span>
                              : <Input aria-label={tr("Unità")} className="h-7 w-12 text-xs" value={r.unita} disabled={!modificabile}
                                  onChange={(e) => aggiorna(r.chiave, { unita: e.target.value })} />}
                            <Numero etichetta={tr("Prezzo")} className="h-7 w-20 text-right" disabled={!modificabile} valore={r.prezzo_unitario}
                              onCambia={(n) => aggiorna(r.chiave, { prezzo_unitario: n, prezzo_a_mano: true, prezzo_fonte: "manuale" })} />
                            <span className="w-20 text-right text-sm font-medium tabular-nums">{r.prezzo_unitario == null ? "—" : formatCurrency(importoRiga(r))}</span>
                            {modificabile && (
                              <button type="button" aria-label={tr("Togli la riga")} className="text-muted-foreground hover:text-rose-600"
                                onClick={() => setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave))}><X className="h-4 w-4" /></button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {modificabile && (
                    <div className="flex flex-wrap items-center gap-2">
                      {c.valore === "manodopera" && (
                        <OfficeSelect value="" label={tr("Aggiungi persona")} className="h-8 min-w-[12rem] flex-1 text-muted-foreground"
                          placeholder={tr("+ Aggiungi persona…")} onValueChange={(v) => { if (v) aggiungiPersona(v); }}
                          options={employees.map((e) => ({ value: e.id, label: e.label }))} />
                      )}
                      {c.valore === "mezzo" && (
                        <OfficeSelect value="" label={tr("Aggiungi mezzo")} className="h-8 min-w-[12rem] flex-1 text-muted-foreground"
                          placeholder={tr("+ Aggiungi mezzo…")} onValueChange={(v) => { if (v) aggiungiMezzo(v); }}
                          options={mezzi.map((m) => ({ value: m.id, label: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}` }))} />
                      )}
                      {c.valore !== "manodopera" && c.valore !== "mezzo" && (
                        <Button type="button" variant="outline" size="sm" className="h-8" aria-label={`${tr("Aggiungi")} ${tr(c.titolo)}`}
                          onClick={() => setAggiungendo(aggiungendo === c.valore ? null : c.valore)}>
                          <Plus className="mr-1 h-3.5 w-3.5" />{tr("Aggiungi")}
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" className="h-8"
                        onClick={() => { aggiungi({ categoria: c.valore }); setAggiungendo(null); }}>{tr("Riga libera, prezzo a mano")}</Button>
                    </div>
                  )}
                  {modificabile && aggiungendo === c.valore && c.valore !== "manodopera" && c.valore !== "mezzo" && (
                    <CercaNelListino dove={{ orderId, data }} conProdotti={c.valore === "materiale"}
                      onScegli={(v) => { daListino(c.valore, v); setAggiungendo(null); }} />
                  )}
                </Blocco>
              );
            })}

            <label className="grid gap-1 text-xs text-muted-foreground">{tr("Note (facoltative)")}
              <Input aria-label={tr("Note")} maxLength={4000} className="text-foreground" value={note} disabled={!modificabile} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-xs text-amber-700">{senza > 0 ? tr("{n} senza prezzo", { n: senza }) : ""}</span>
              <span className="font-semibold">{tr("Totale")} <span className="tabular-nums">{formatCurrency(totale)}</span></span>
            </div>
          </section>
        )}
        {!lettura.isLoading && <DialogFooter className="gap-1.5 sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {puoModificare && id && stato === "bozza" && !salSigillato && (
              <Button type="button" variant="outline" disabled={occupato}
                onClick={() => { if (window.confirm(tr("Annullare questo rendiconto?"))) cambiaStato.mutate("annulla"); }}>{tr("Annulla rendiconto")}</Button>
            )}
            {id && stato !== "annullato" && <PulsantePdfRendiconto rendicontoId={id} className="h-10 px-4 text-sm" />}
            {puoModificare && id && stato === "confermato" && !salSigillato && (
              <Button type="button" variant="outline" disabled={occupato} onClick={() => cambiaStato.mutate("riapri")}>{tr("Riapri")}</Button>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" onClick={onClose}>{tr("Chiudi")}</Button>
            {modificabile && (
              <>
                <Button type="button" variant="outline" disabled={occupato} onClick={() => salva.mutate()}>
                  {salva.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Salva")}
                </Button>
                <Button type="button" disabled={occupato || righe.length === 0} onClick={() => conferma.mutate()}>
                  {conferma.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Conferma")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

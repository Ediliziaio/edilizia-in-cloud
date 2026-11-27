/**
 * Editor del rendiconto giornaliero (27/11/2026): data, lavori del giorno, righe per categoria coi prezzi.
 * Il prezzo lo decide il database: dopo ogni salvataggio si rilegge. Chi scrive un prezzo a mano lo segna
 * (prezzo_a_mano) e il listino non lo riscrive più. Conferma rifiuta le righe senza prezzo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  riapriRendiconto, salvaRendiconto, senzaPrezzo, type CategoriaRiga, type RigaRendiconto, type StatoRendiconto,
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
  const [personaId, setPersonaId] = useState("");
  const [mezzoId, setMezzoId] = useState("");
  const [ore, setOre] = useState("8");

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
    setSalSigillato(!!d.testata.sal_id);
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
  const salva = useMutation({
    mutationFn: () => salvaRendiconto(bozza()),
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

  const aggiungiPersona = () => {
    const p = employees.find((e) => e.id === personaId);
    const q = Number(ore.replace(",", "."));
    if (!p || !(q > 0)) return;
    aggiungi({ categoria: "manodopera", descrizione: p.label, unita: "ora", quantita: q, employee_id: p.id, listino_voce_id: ordine.data ?? null,
      prezzo_fonte: ordine.data ? null : "mancante" });
    setPersonaId(""); setAggiungendo(null);
  };
  const aggiungiMezzo = () => {
    const m = mezzi.find((x) => x.id === mezzoId);
    const q = Number(ore.replace(",", "."));
    if (!m || !(q > 0)) return;
    const tariffa = (m as { tariffa_id?: string | null }).tariffa_id ?? null;
    aggiungi({ categoria: "mezzo", descrizione: `${m.nome}${m.targa ? ` · ${m.targa}` : ""}`, unita: "ora", quantita: q, mezzo_id: m.id,
      listino_voce_id: tariffa, prezzo_fonte: tariffa ? null : "mancante" });
    setMezzoId(""); setAggiungendo(null);
  };

  const fonteRiga = (r: RigaRendiconto) => {
    if (senzaPrezzo(r)) return <span className="text-amber-700">{tr("prezzo da definire")}</span>;
    if (r.prezzo_fonte) return <span className="text-muted-foreground">{tr(ETICHETTA_FONTE[r.prezzo_fonte])}</span>;
    return <span className="text-muted-foreground">{tr("prezzo al salvataggio")}</span>;
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {id && numero != null ? tr("Rendiconto n. {n}", { n: numero }) : tr("Nuovo rendiconto del giorno")}
            {id && <span className="rounded border px-1.5 py-0 text-[11px] font-normal">{nomeStato[stato]}</span>}
          </DialogTitle>
        </DialogHeader>
        {salSigillato && <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">{tr("È già nel rendiconto del periodo: non si modifica.")}</p>}
        {lettura.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">{tr("Caricamento…")}</p> : (
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <label className="text-xs text-muted-foreground">{tr("Data")}
                <Input type="date" aria-label={tr("Data")} className="mt-0.5 h-8" value={data} disabled={!modificabile} onChange={(e) => setData(e.target.value)} />
              </label>
              <label className="text-xs text-muted-foreground">{tr("Lavori del giorno")}
                <Input aria-label={tr("Lavori del giorno")} className="mt-0.5 h-8" value={lavori} disabled={!modificabile} onChange={(e) => setLavori(e.target.value)}
                  placeholder={tr("Cosa si è fatto, per il committente")} />
              </label>
            </div>
            <label className="block text-xs text-muted-foreground">{tr("Note")}
              <Textarea aria-label={tr("Note")} rows={2} className="mt-0.5 text-sm" value={note} disabled={!modificabile} onChange={(e) => setNote(e.target.value)} />
            </label>

            {CATEGORIE.map((c) => {
              const dentro = righe.filter((r) => r.categoria === c.valore);
              return (
                <section key={c.valore} aria-label={tr(c.titolo)} className="rounded-md border">
                  <div className="flex items-center justify-between bg-muted/40 px-2 py-1">
                    <h3 className="text-xs font-semibold">{tr(c.titolo)}{dentro.length > 0 ? ` · ${dentro.length}` : ""}</h3>
                    {modificabile && (
                      <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs"
                        aria-label={`${tr("Aggiungi")} ${tr(c.titolo)}`}
                        onClick={() => setAggiungendo(aggiungendo === c.valore ? null : c.valore)}>
                        <Plus className="h-3 w-3" />{tr("Aggiungi")}
                      </Button>
                    )}
                  </div>
                  {dentro.length > 0 && (
                    <ul className="divide-y">
                      {dentro.map((r) => (
                        <li key={r.chiave} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4rem_5.5rem_5.5rem_1.5rem] items-center gap-1 px-2 py-1 max-sm:grid-cols-2">
                          <div className="min-w-0">
                            <Input aria-label={tr("Descrizione")} className="h-7 text-[13px]" value={r.descrizione} disabled={!modificabile}
                              onChange={(e) => aggiorna(r.chiave, { descrizione: e.target.value })} />
                            <p className="mt-0.5 text-[11px]">{fonteRiga(r)}</p>
                          </div>
                          <Numero etichetta={tr("Quantità")} className="h-7 text-right text-[13px]" disabled={!modificabile} valore={r.quantita}
                            onCambia={(n) => aggiorna(r.chiave, { quantita: n })} />
                          <Input aria-label={tr("Unità")} className="h-7 text-[13px]" value={r.unita} disabled={!modificabile}
                            onChange={(e) => aggiorna(r.chiave, { unita: e.target.value })} />
                          <Numero etichetta={tr("Prezzo")} className="h-7 text-right text-[13px]" disabled={!modificabile} valore={r.prezzo_unitario}
                            onCambia={(n) => aggiorna(r.chiave, { prezzo_unitario: n, prezzo_a_mano: true, prezzo_fonte: "manuale" })} />
                          <span className="text-right text-[13px] font-medium tabular-nums">{r.prezzo_unitario == null ? "—" : formatCurrency(importoRiga(r))}</span>
                          {modificabile && <Button type="button" variant="ghost" size="icon" className="h-6 w-6" aria-label={tr("Togli la riga")}
                            onClick={() => setRighe((rs) => rs.filter((x) => x.chiave !== r.chiave))}><Trash2 className="h-3.5 w-3.5" /></Button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {modificabile && aggiungendo === c.valore && (
                    <div className="space-y-1.5 border-t p-2">
                      {c.valore === "manodopera" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select aria-label={tr("Persona")} className="h-8 rounded-md border bg-background px-2 text-sm" value={personaId} onChange={(e) => setPersonaId(e.target.value)}>
                            <option value="">{tr("Scegli la persona")}</option>
                            {employees.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                          </select>
                          <Input aria-label={tr("Ore")} className="h-8 w-20" inputMode="decimal" value={ore} onChange={(e) => setOre(e.target.value)} />
                          <Button type="button" size="sm" className="h-8" disabled={!personaId} onClick={aggiungiPersona}>{tr("Aggiungi persona")}</Button>
                        </div>
                      )}
                      {c.valore === "mezzo" && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select aria-label={tr("Mezzo")} className="h-8 rounded-md border bg-background px-2 text-sm" value={mezzoId} onChange={(e) => setMezzoId(e.target.value)}>
                            <option value="">{tr("Scegli il mezzo")}</option>
                            {mezzi.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.targa ? ` · ${m.targa}` : ""}</option>)}
                          </select>
                          <Input aria-label={tr("Ore")} className="h-8 w-20" inputMode="decimal" value={ore} onChange={(e) => setOre(e.target.value)} />
                          <Button type="button" size="sm" className="h-8" disabled={!mezzoId} onClick={aggiungiMezzo}>{tr("Aggiungi mezzo")}</Button>
                        </div>
                      )}
                      {c.valore !== "manodopera" && c.valore !== "mezzo" && (
                        <CercaNelListino dove={{ orderId, data }} conProdotti={c.valore === "materiale"}
                          onScegli={(v) => { daListino(c.valore, v); setAggiungendo(null); }} />
                      )}
                      <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                        onClick={() => { aggiungi({ categoria: c.valore }); setAggiungendo(null); }}>{tr("Riga libera, prezzo a mano")}</Button>
                    </div>
                  )}
                </section>
              );
            })}

            <div className="flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-xs text-amber-700">{senza > 0 ? tr("{n} senza prezzo", { n: senza }) : ""}</span>
              <span className="font-semibold">{tr("Totale")} <span className="tabular-nums">{formatCurrency(totale)}</span></span>
            </div>
          </div>
        )}
        <DialogFooter className="gap-1.5 sm:justify-between">
          <div className="flex gap-1.5">
            {puoModificare && id && stato !== "annullato" && !salSigillato && (
              <Button type="button" variant="outline" size="sm" disabled={occupato}
                onClick={() => { if (window.confirm(tr("Annullare questo rendiconto?"))) cambiaStato.mutate("annulla"); }}>{tr("Annulla rendiconto")}</Button>
            )}
            {id && stato !== "annullato" && <PulsantePdfRendiconto rendicontoId={id} className="h-8 px-2.5 text-xs" />}
            {puoModificare && id && stato === "confermato" && !salSigillato && (
              <Button type="button" variant="outline" size="sm" disabled={occupato} onClick={() => cambiaStato.mutate("riapri")}>{tr("Riapri")}</Button>
            )}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>{tr("Chiudi")}</Button>
            {modificabile && (
              <>
                <Button type="button" variant="outline" size="sm" disabled={occupato} onClick={() => salva.mutate()}>
                  {salva.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Salva")}
                </Button>
                <Button type="button" size="sm" disabled={occupato || righe.length === 0} onClick={() => conferma.mutate()}>
                  {conferma.isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{tr("Conferma")}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

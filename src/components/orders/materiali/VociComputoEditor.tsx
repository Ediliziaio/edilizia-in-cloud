import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { VoceComputo } from "@/lib/computo/alberoComputo";
import { bozzaRevisioneVoce, modificaDaBozza, type BozzaRevisioneVoce } from "@/lib/computo/revisioneVoce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function VociComputoEditor({ voci, computoId, companyId, puoModificare, mostraPrezzi, selezionata, onMostraTutte, onSalvata, onBozza }: {
  voci: VoceComputo[]; computoId: string; companyId: string; puoModificare: boolean; mostraPrezzi: boolean;
  selezionata?: string | null; onMostraTutte: () => void; onSalvata: () => void; onBozza: (pendente: boolean) => void;
}) {
  const qc = useQueryClient();
  const [cerca, setCerca] = useState("");
  const [form, setForm] = useState<{ id: string | null; dati: BozzaRevisioneVoce } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState("");
  const visibili = useMemo(() => voci.filter(v => (!selezionata || v.id === selezionata || cerca)
    && (v.numero_ordine + " " + v.codice_tariffa + " " + v.descrizione_breve + " " + v.categoria).toLowerCase().includes(cerca.toLowerCase())), [voci, cerca, selezionata]);
  const inizia = (v?: VoceComputo) => { setForm({ id: v?.id ?? null, dati: bozzaRevisioneVoce(v) }); setErrore(""); onBozza(true); };
  const chiudi = () => { setForm(null); setErrore(""); onBozza(false); };
  const cambia = (patch: Partial<BozzaRevisioneVoce>) => setForm(f => f ? { ...f, dati: { ...f.dati, ...patch } } : f);
  const salva = async () => {
    if (!form || !puoModificare || salvando) return;
    setErrore("");
    const prima = form.id ? voci.find(v => v.id === form.id) : undefined;
    if (form.id && !prima) { setErrore("La voce è cambiata: riapri il computo e riprova."); return; }
    let modifica: ReturnType<typeof modificaDaBozza>;
    try { modifica = modificaDaBozza(form.dati, prima); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Controlla i dati."); return; }
    setSalvando(true);
    try {
      if (prima) {
        let q = supabase.from("computo_voci_estratte").update(modifica).eq("id", prima.id)
          .eq("company_id", companyId).eq("computo_upload_id", computoId);
        // Controllo sui valori mostrati: una correzione concorrente non viene sovrascritta.
        for (const k of ["quantita", "unita_misura", "descrizione_breve", "prezzo_unitario_computo", "categoria", "codice_tariffa"] as const) {
          q = prima[k] == null ? q.is(k, null) : q.eq(k, prima[k]!);
        }
        const { data, error } = await q.select("id");
        if (error) throw error;
        if (data?.length !== 1) throw new Error("La voce è stata modificata da un'altra sessione. Ricarica prima di salvare.");
      } else {
        const ordine = Math.max(0, ...voci.map(v => v.ordine ?? 0)) + 1;
        const { error } = await supabase.from("computo_voci_estratte").insert({
          ...modifica, company_id: companyId, computo_upload_id: computoId, ordine, numero_ordine: String(ordine),
          is_included: true, confidence: 1,
        });
        if (error) throw error;
      }
      await qc.invalidateQueries({ queryKey: ["computo-commessa-voci", computoId] });
      void qc.invalidateQueries({ queryKey: ["piano-risorse-computo", companyId] });
      chiudi(); onSalvata();
      toast.success(prima ? "Voce corretta: materiali e controlli aggiornati" : "Voce aggiunta al computo");
    } catch (e) { setErrore(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Salvataggio non riuscito."); }
    finally { setSalvando(false); }
  };
  return <section className="space-y-3" aria-label="Revisione delle voci del computo">
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <Input className="pl-8" aria-label="Cerca una voce del computo" placeholder="Cerca numero, codice, descrizione o capitolo" value={cerca} onChange={e => setCerca(e.target.value)} /></div>
      {puoModificare && <Button type="button" size="sm" variant="outline" disabled={salvando || !!form} onClick={() => inizia()}><Plus className="mr-1 h-4 w-4" aria-hidden />Aggiungi voce</Button>}
      {selezionata && <Button type="button" size="sm" variant="ghost" onClick={onMostraTutte}>Mostra tutte le voci</Button>}
    </div>
    <p className="text-xs text-muted-foreground">{puoModificare ? "Correggi le voci lette o aggiungi quelle mancanti. Ogni voce salvata aggiorna subito le proposte; le misure originali restano consultabili." : "Computo in sola lettura. Le modifiche al contrattuale si gestiscono dalla scheda Computo con sblocco o variante."}</p>
    {form && <form onSubmit={e => { e.preventDefault(); void salva(); }} className="space-y-3 rounded-lg border border-primary/30 bg-muted/30 p-3" aria-label={form.id ? "Modifica voce del computo" : "Nuova voce del computo"}>
      <p className="text-sm font-semibold">{form.id ? "Correggi voce" : "Nuova voce"}</p>
      <fieldset disabled={salvando} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs sm:col-span-2 lg:col-span-4">Descrizione<Textarea autoFocus aria-label="Descrizione della voce" value={form.dati.descrizione} onChange={e => cambia({ descrizione: e.target.value })} /></label>
        <label className="text-xs">Codice tariffa<Input value={form.dati.codice} onChange={e => cambia({ codice: e.target.value })} /></label>
        <label className="text-xs">Capitolo<Input list="capitoli-revisione-computo" value={form.dati.capitolo} onChange={e => cambia({ capitolo: e.target.value })} /></label>
        <label className="text-xs">Unità di misura<Input aria-label="Unità della voce" placeholder="mq, m, pz, kg…" value={form.dati.unita} onChange={e => cambia({ unita: e.target.value })} /></label>
        <label className="text-xs">Quantità<Input inputMode="decimal" aria-label="Quantità della voce" value={form.dati.quantita} onChange={e => cambia({ quantita: e.target.value })} /></label>
        {mostraPrezzi && <label className="text-xs">Prezzo unitario<Input inputMode="decimal" placeholder="Non indicato" value={form.dati.prezzo} onChange={e => cambia({ prezzo: e.target.value })} /></label>}
        <label className="text-xs sm:col-span-2">Nota della correzione<Input placeholder="Es. quantità verificata sul rilievo" value={form.dati.nota} onChange={e => cambia({ nota: e.target.value })} /></label>
      </fieldset>
      {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
      <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={salvando} onClick={chiudi}>Annulla modifica</Button><Button type="submit" size="sm" disabled={salvando}>{salvando ? "Salvo…" : "Salva voce e ricalcola"}</Button></div>
    </form>}
    <datalist id="capitoli-revisione-computo">{[...new Set(voci.map(v => v.categoria).filter(Boolean))].map(c => <option key={c} value={c!} />)}</datalist>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-left text-xs"><thead className="bg-muted/60"><tr><th className="p-2">Voce</th><th className="p-2">Descrizione e capitolo</th><th className="p-2 text-right">Quantità</th>{mostraPrezzi && <th className="p-2 text-right">Prezzo</th>}<th className="p-2"><span className="sr-only">Azioni</span></th></tr></thead>
        <tbody>{visibili.slice(0, 80).map(v => <tr key={v.id} className="border-t align-top">
          <td className="p-2 tabular-nums">{v.numero_ordine ?? v.ordine}<span className="block max-w-28 break-words text-muted-foreground">{v.codice_tariffa ?? v.codice_voce}</span></td>
          <td className="p-2"><p className="line-clamp-3">{v.descrizione_breve}</p><span className="text-muted-foreground">{v.categoria ?? "Senza capitolo"}{v.is_modified ? " · corretta a mano" : ""}</span></td>
          <td className="whitespace-nowrap p-2 text-right tabular-nums">{v.quantita == null ? "Da definire" : v.quantita.toLocaleString("it-IT")} {v.unita_misura}</td>
          {mostraPrezzi && <td className="whitespace-nowrap p-2 text-right tabular-nums">{v.prezzo_unitario_computo == null ? "Non indicato" : v.prezzo_unitario_computo.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</td>}
          <td className="p-2">{puoModificare && <Button type="button" variant="ghost" size="sm" className="h-7" disabled={salvando || !!form} onClick={() => inizia(v)} aria-label={"Modifica voce " + (v.numero_ordine ?? v.ordine)}><Pencil className="mr-1 h-3.5 w-3.5" aria-hidden />Modifica</Button>}</td>
        </tr>)}</tbody></table>
    </div>
    <p className="text-xs text-muted-foreground">{visibili.length} voci{visibili.length > 80 ? " · mostrate le prime 80: usa la ricerca per trovare le altre." : ""}</p>
  </section>;
}

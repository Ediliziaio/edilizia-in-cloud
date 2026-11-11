/**
 * «Carica listino» della ditta (10/11/2026, lotto 7 di docs/piano-subappalto-computo-listino.md).
 *
 * La ditta manda il suo listino: Excel o CSV si leggono qui, un PDF con l'AI (come «Importa voci» del
 * computo). Ogni riga si abbina a una voce del listino aziendale (codice, poi nome) o diventa una voce
 * sua; unità diverse, prezzi fuori scala (R17) e doppioni restano fuori finché non li sceglie qualcuno.
 * Si salva in un colpo solo: le voci nuove, poi i prezzi con `listino_ditta_salva`; se i prezzi non
 * entrano, le voci nuove si tolgono (niente voci della ditta senza prezzo).
 */
import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";
import { unitaPerListino, unitaDelListino } from "@/lib/subappaltatori/abbinamentoListino";
import {
  daSalvareImport, numeroListino, proponiImport, righeDaTabella, tabellaDaFile,
  type PropostaImport, type RigaListinoImportata, type SceltaImport, type VoceListinoConCosto,
} from "@/lib/subappaltatori/importaListinoDitta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const valoreScelta = (s: SceltaImport) => (s.tipo === "voce" ? `v:${s.tariffaId}` : s.tipo);
const daValore = (v: string): SceltaImport => (v.startsWith("v:") ? { tipo: "voce", tariffaId: v.slice(2) } : v === "nuova" ? { tipo: "nuova" } : { tipo: "salta" });

export function ImportaListinoDittaDialog({ companyId, anagraficaId, nomeDitta, voci, validoDal, onChiudi, onFatto }: {
  companyId: string; anagraficaId: string; nomeDitta: string;
  /** Le voci del listino che questa ditta può prezzare: aziendali e sue. */
  voci: VoceListinoConCosto[];
  validoDal: string; onChiudi: () => void; onFatto: () => void;
}) {
  const { user } = useAuth();
  const [proposte, setProposte] = useState<PropostaImport[] | null>(null);
  const [nomeFile, setNomeFile] = useState("");
  const [cerca, setCerca] = useState("");
  const perId = useMemo(() => new Map(voci.map((v) => [v.id, v])), [voci]);
  const opzioniVoci = useMemo(() => [...voci].sort((a, b) => a.nome.localeCompare(b.nome, "it")), [voci]);

  const leggi = useMutation({
    mutationFn: async (file: File) => {
      let righe: RigaListinoImportata[];
      if (/\.(pdf|docx)$/i.test(file.name)) {
        if (!user?.id) throw new Error("Per leggere un PDF serve l'accesso: ricarica la pagina.");
        const { leggiVociDaFile } = await import("@/lib/computo/leggiVoci");
        const { estraiSulServer } = await import("@/lib/computo/estrazioneServer");
        const letto = await leggiVociDaFile(file, {
          onAvanzamento: () => {},
          server: (f, onStato) => estraiSulServer(f, { companyId, userId: user.id, onStato }),
        });
        righe = letto.voci.map((v, i) => ({
          riga: i + 1, codice: v.tariffa?.trim() || null, descrizione: v.descrizione.trim(), unita: v.unita?.trim() || null, prezzo: numeroListino(v.prezzo),
        })).filter((r) => r.descrizione.length >= 2);
        if (!righe.length) throw new Error("Nel PDF non ho trovato righe con descrizione e prezzo.");
      } else {
        const { righe: lette, errore } = righeDaTabella(await tabellaDaFile(file));
        if (errore) throw new Error(errore);
        righe = lette;
      }
      return proponiImport(righe, voci, anagraficaId);
    },
    onSuccess: (p) => setProposte(p),
    onError: (e: Error) => toast.error(e.message || "Il file non si è potuto leggere."),
  });

  const conto = useMemo(() => {
    const p = proposte ?? [];
    return {
      voce: p.filter((x) => x.scelta.tipo === "voce").length,
      nuove: p.filter((x) => x.scelta.tipo === "nuova").length,
      fuori: p.filter((x) => x.scelta.tipo === "salta").length,
      daGuardare: p.filter((x) => x.scelta.tipo === "salta" && x.avviso && x.avviso !== "Senza prezzo").length,
    };
  }, [proposte]);
  const esito = useMemo(() => daSalvareImport(proposte ?? [], (u) => !!unitaPerListino(u)), [proposte]);

  const salva = useMutation({
    mutationFn: async () => {
      if (esito.errori.length) throw new Error(esito.errori[0]);
      const nuove = esito.nuove.map((r) => ({ id: crypto.randomUUID(), r, u: unitaPerListino(r.unita)! }));
      if (!esito.prezzi.length && !nuove.length) throw new Error("Nessuna riga da caricare.");
      const create: string[] = [];
      try {
        for (let i = 0; i < nuove.length; i += 200) {
          const blocco = nuove.slice(i, i + 200);
          const { error } = await db.from("tariffe_aziendali").insert(blocco.map(({ id, r, u }) => ({
            id, company_id: companyId, tipo: "manodopera", nome: r.descrizione, unita: u.unita, unita_fatturazione: u.unita_fatturazione,
            // La voce esiste solo per questa ditta: il suo costo è il prezzo della ditta.
            prezzo_costo: r.prezzo, costo_interno: r.prezzo, costo_default: r.prezzo, subappaltatore_id: anagraficaId,
          })));
          if (error) throw error;
          create.push(...blocco.map((b) => b.id));
        }
        const righe = [...esito.prezzi, ...nuove.map(({ id, r }) => ({ tariffa_id: id, costo: Math.round((r.prezzo ?? 0) * 10000) / 10000 }))];
        const { data, error } = await db.rpc("listino_ditta_salva", { p_subappaltatore: anagraficaId, p_valido_dal: validoDal, p_righe: righe });
        if (error) throw error;
        return { scritti: righe.length, nuove: nuove.length, esito: data as { chiusi?: number } | null };
      } catch (e) {
        // Senza i prezzi le voci nuove sarebbero voci della ditta a zero: si tolgono.
        for (let i = 0; i < create.length; i += 200) {
          await db.from("tariffe_aziendali").delete().in("id", create.slice(i, i + 200)).eq("company_id", companyId);
        }
        throw e;
      }
    },
    onSuccess: (r) => {
      toast.success(`Listino di ${nomeDitta} caricato: ${r.scritti} prezzi${r.nuove ? `, di cui ${r.nuove} su voci nuove della ditta` : ""}.`);
      onFatto();
    },
    onError: (e: Error) => toast.error(e.message || "Listino non caricato."),
  });

  const cambia = (i: number, v: string) => setProposte((p) => p && p.map((x, j) => (j === i ? { ...x, scelta: daValore(v) } : x)));
  const q = cerca.trim().toLowerCase();
  const visibili = (proposte ?? []).map((p, i) => ({ p, i })).filter(({ p }) => !q || `${p.riga.codice ?? ""} ${p.riga.descrizione}`.toLowerCase().includes(q));

  return (
    <Dialog open onOpenChange={(o) => !o && !salva.isPending && onChiudi()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Carica il listino di {nomeDitta}</DialogTitle>
          <DialogDescription>
            Excel o CSV con descrizione e prezzo (codice e unità se ci sono), oppure un PDF letto con l'AI. Ogni riga va su una voce del
            listino dell'azienda o diventa una voce della ditta. I prezzi valgono dal {validoDal.split("-").reverse().join("/")}; i contratti già fatti non cambiano.
          </DialogDescription>
        </DialogHeader>

        {!proposte ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-sm text-muted-foreground hover:bg-muted/40">
            {leggi.isPending ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileUp className="h-6 w-6" />}
            {leggi.isPending ? `Leggo ${nomeFile}…` : "Scegli il file del listino (.xlsx, .csv, .pdf)"}
            <input type="file" accept=".xlsx,.xlsm,.csv,.tsv,.pdf,.docx" className="sr-only" aria-label="File del listino" disabled={leggi.isPending}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { setNomeFile(f.name); leggi.mutate(f); } e.target.value = ""; }} />
          </label>
        ) : (
          <>
            <p className="text-sm" role="status">
              {nomeFile}: <strong>{proposte.length}</strong> righe · {conto.voce} su voci del listino · {conto.nuove} {conto.nuove === 1 ? "voce nuova" : "voci nuove"} della ditta · {conto.fuori} {conto.fuori === 1 ? "riga fuori" : "righe fuori"}
              {conto.daGuardare > 0 && <span className="text-amber-800"> ({conto.daGuardare} da guardare)</span>}
            </p>
            <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca nelle righe del file" aria-label="Cerca nelle righe del file" className="h-9" />
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">Riga del file</th>
                    <th className="w-20 px-1 py-1.5 text-right font-medium">Prezzo</th>
                    <th className="w-72 px-2 py-1.5 text-left font-medium">Va su</th>
                  </tr>
                </thead>
                <tbody>
                  {visibili.map(({ p, i }) => {
                    const voce = p.scelta.tipo === "voce" ? perId.get(p.scelta.tariffaId) : null;
                    return (
                      <tr key={p.riga.riga} className={`border-t align-middle ${p.fuoriScala ? "bg-red-50" : ""}`}>
                        {/* Una riga per voce (11/11/2026): il testo del file e, accanto, i dettagli o l'avviso. */}
                        <td className="max-w-0 px-2 py-1">
                          <div className="flex min-w-0 items-baseline gap-2">
                            <span className="min-w-0 truncate" title={p.riga.descrizione}>{p.riga.codice ? <span className="text-muted-foreground">{p.riga.codice} · </span> : null}{p.riga.descrizione}</span>
                            <span className={`min-w-0 shrink truncate text-[11px] ${p.avviso ? (p.fuoriScala ? "text-red-800" : "text-amber-800") : "text-muted-foreground"}`}
                              title={p.avviso ?? undefined}>
                              {p.avviso ?? [
                                `riga ${p.riga.riga}`, p.riga.unita,
                                p.motivo && p.scelta.tipo === "voce" ? `per ${p.motivo === "codice" ? "codice" : "nome"}` : null,
                                voce?.costo ? `nostro ${formatCurrency(voce.costo)}/${unitaDelListino(voce.unita)}` : null,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 py-1 text-right tabular-nums">{p.riga.prezzo == null ? "—" : formatCurrency(p.riga.prezzo)}</td>
                        <td className="px-2 py-1">
                          <select aria-label={`Dove va la riga ${p.riga.riga}`} className="h-8 w-full rounded-md border bg-background px-1 text-xs"
                            value={valoreScelta(p.scelta)} onChange={(e) => cambia(i, e.target.value)} disabled={p.riga.prezzo == null || p.riga.prezzo < 0}>
                            <option value="salta">Non caricare</option>
                            <option value="nuova">Voce nuova della ditta</option>
                            {opzioniVoci.map((v) => <option key={v.id} value={`v:${v.id}`}>{v.codice ? `${v.codice} · ` : ""}{v.nome} ({unitaDelListino(v.unita)})</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {esito.errori.length > 0 && (
              <ul role="alert" className="space-y-0.5 rounded-md bg-red-50 px-2 py-1 text-xs text-red-900">
                {esito.errori.slice(0, 5).map((e) => <li key={e}>{e}</li>)}
                {esito.errori.length > 5 && <li>…e altri {esito.errori.length - 5}.</li>}
              </ul>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={salva.isPending} onClick={onChiudi}>Annulla</Button>
          {proposte && (
            <>
              <Button variant="outline" disabled={salva.isPending} onClick={() => setProposte(null)}>Altro file</Button>
              <Button disabled={salva.isPending || esito.errori.length > 0 || (!esito.prezzi.length && !esito.nuove.length)} onClick={() => salva.mutate()}>
                {salva.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Carica {esito.prezzi.length + esito.nuove.length} {esito.prezzi.length + esito.nuove.length === 1 ? "prezzo" : "prezzi"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

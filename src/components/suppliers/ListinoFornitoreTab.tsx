/**
 * ListinoFornitoreTab — i prezzi che questo fornitore fa a te.
 *
 * Griglia modificabile con sconto per voce e netto calcolato, piu'
 * l'incolla-da-Excel per portare dentro un listino intero in un gesto.
 * Le voci alimentano il suggerimento prezzo sulle righe degli ordini
 * d'acquisto: per questo codice e descrizione contano — l'abbinamento
 * e' solo esatto.
 *
 * Un fornitore puo' avere PIU' listini attivi (il listino generale, il
 * contratto per un cantiere, l'offerta dell'anno scorso): si scelgono dalla
 * tendina, con accanto scritto se sono scaduti o non ancora in vigore, e le
 * date si correggono da qui. Prima la scheda mostrava solo il primo attivo
 * mentre il suggerimento prezzo usava tutti: su un fornitore con due listini
 * si vedevano 42 voci su 64 e le altre non si potevano correggere (12/11/2026).
 *
 * I listini DISATTIVATI restano fuori, come prima: in produzione ce ne sono
 * decine con centinaia di voci, e farli comparire qui vorrebbe dire salvare
 * dentro un listino che non suggerisce prezzi.
 *
 * Stessa struttura in due pezzi dell'analisi prezzi: il guscio carica,
 * l'editor interno (con key) si inizializza dai props. Niente setState
 * negli effect.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Trash2, AlertTriangle, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/formatters";
import {
  parseVociIncollate, prezzoNetto,
} from "@/lib/listino/listinoFornitore";
import {
  etichettaValidita, giornoItaliano, listinoDiOggi, listinoInScadenza, listinoInVigore,
} from "@/lib/listino/validitaListino";

interface RigaVoce {
  id: string;
  codice: string;
  descrizione: string;
  unita: string;
  prezzo: number;
  sconto_pct: number;
  immagine_url?: string | null;
}

interface TestataListino {
  id: string;
  nome: string | null;
  sconto_default_pct: number;
  valido_dal: string | null;
  valido_al: string | null;
  attivo: boolean;
}

interface ListinoEsistente {
  listino: { id: string; sconto_default_pct: number } | null;
  voci: RigaVoce[];
}

/** Il nome da mostrare nella tendina, con lo stato se non e' in vigore. */
function etichetta(l: TestataListino): string {
  const nome = (l.nome ?? "").trim() || "Listino senza nome";
  const stato = etichettaValidita(l);
  return stato ? `${nome} — ${stato}` : nome;
}

export function ListinoFornitoreTab({ supplierId }: { supplierId: string }) {
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  // Le voci modificate e non salvate vivono dentro l'editor: cambiando listino
  // l'editor si rimonta e le perderebbe in silenzio, quindi prima si chiede.
  const [sporco, setSporco] = useState(false);
  const [daConfermare, setDaConfermare] = useState<string | null>(null);
  const permessi = usePermissions();
  const puoModificare = permessi.canEditSettingsSuppliers || permessi.canManageSuppliers || permessi.canEditSettingsPricing;
  const qc = useQueryClient();

  const testate = useQuery({
    queryKey: ["listino-fornitore-testate", supplierId],
    queryFn: async (): Promise<TestataListino[]> => {
      // `as any`: tabelle nuove (migration 20280201000000), fuori dai tipi
      // generati — convenzione di progetto.
      const { data, error } = await (supabase as any)
        .from("listini_fornitore")
        .select("id, nome, sconto_default_pct, valido_dal, valido_al, attivo")
        .eq("supplier_id", supplierId)
        .eq("attivo", true)
        .order("valido_dal", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l: Record<string, unknown>) => ({
        id: String(l.id),
        nome: (l.nome as string | null) ?? null,
        sconto_default_pct: Number(l.sconto_default_pct ?? 0),
        valido_dal: (l.valido_dal as string | null) ?? null,
        valido_al: (l.valido_al as string | null) ?? null,
        attivo: l.attivo !== false,
      }));
    },
    staleTime: 30_000,
  });

  const lista = testate.data ?? [];
  // La scelta dell'utente vince; al primo caricamento si apre quello in vigore.
  const corrente = lista.find((l) => l.id === sceltoId) ?? listinoDiOggi(lista);

  const voci = useQuery({
    queryKey: ["listino-fornitore-editor", supplierId, corrente?.id ?? null],
    enabled: !testate.isLoading && !testate.isError,
    queryFn: async (): Promise<RigaVoce[]> => {
      if (!corrente) return [];
      const { data, error } = await (supabase as any)
        .from("listino_fornitore_voci")
        .select("id, codice, descrizione, unita, prezzo, sconto_pct, immagine_url")
        .eq("listino_id", corrente.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((v: Record<string, unknown>) => ({
        id: String(v.id),
        codice: String(v.codice ?? ""),
        descrizione: String(v.descrizione ?? ""),
        unita: String(v.unita ?? ""),
        prezzo: Number(v.prezzo ?? 0),
        sconto_pct: Number(v.sconto_pct ?? 0),
        immagine_url: v.immagine_url ?? null,
      }));
    },
    staleTime: 30_000,
  });

  if (testate.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carico il listino…
      </div>
    );
  }

  if (testate.isError || voci.isError) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          Le tabelle del listino fornitore non sono ancora attive su questo
          ambiente (migration da applicare).
        </span>
      </div>
    );
  }

  const fuoriVigore = !!corrente && !listinoInVigore(corrente);
  const inScadenza = !!corrente && listinoInScadenza(corrente, 30);

  const cambiaListino = (id: string) => {
    if (id === corrente?.id) return;
    if (sporco) { setDaConfermare(id); return; }
    setSceltoId(id);
  };

  const confermaCambio = () => {
    if (daConfermare) { setSporco(false); setSceltoId(daConfermare); }
    setDaConfermare(null);
  };

  return (
    <div className="space-y-3">
      {lista.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">
            {lista.length} listini per questo fornitore:
          </span>
          <Select value={corrente?.id ?? ""} onValueChange={cambiaListino}>
            <SelectTrigger className="h-8 w-full max-w-md text-sm">
              <SelectValue placeholder="Scegli il listino" />
            </SelectTrigger>
            <SelectContent>
              {lista.map((l) => (
                <SelectItem key={l.id} value={l.id}>{etichetta(l)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {corrente && (
        <ValiditaListino
          key={corrente.id}
          listino={corrente}
          puoModificare={puoModificare}
          onSalvato={() => void qc.invalidateQueries({ queryKey: ["listino-fornitore-testate", supplierId] })}
        />
      )}

      {fuoriVigore && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Questo listino non è in vigore ({etichettaValidita(corrente!)}): sugli ordini d’acquisto
          i suoi prezzi vengono proposti lo stesso, segnalati come non aggiornati.{" "}
          {puoModificare
            ? "Correggi le date qui sopra, o carica il listino nuovo."
            : "Per correggere le date serve il permesso sui fornitori o sul listino."}
        </p>
      )}
      {!fuoriVigore && inScadenza && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Scade il {giornoItaliano(corrente?.valido_al ?? null)}: dopo quella data i prezzi vengono
          proposti come non aggiornati. Chiedi al fornitore il listino nuovo, o sposta la scadenza qui sopra.
        </p>
      )}

      {voci.isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carico le voci…
        </div>
      ) : (
        <ListinoEditor
          key={`${supplierId}:${corrente?.id ?? "nuovo"}`}
          supplierId={supplierId}
          inVigore={!corrente || !fuoriVigore}
          onModificato={() => setSporco(true)}
          onSalvato={() => setSporco(false)}
          esistente={{
            listino: corrente ? { id: corrente.id, sconto_default_pct: corrente.sconto_default_pct } : null,
            voci: voci.data ?? [],
          }}
        />
      )}

      <Dialog open={!!daConfermare} onOpenChange={(a) => !a && setDaConfermare(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Modifiche non salvate</DialogTitle>
            <DialogDescription>
              Hai cambiato delle voci senza salvare. Cambiando listino le perdi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDaConfermare(null)}>Resta qui</Button>
            <Button variant="destructive" size="sm" onClick={confermaCambio}>Cambia e perdi le modifiche</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Le date di validita' del listino, modificabili da qui: senza questo campo
 * l'avviso «non e' in vigore» chiedeva una cosa che dall'interfaccia non si
 * poteva fare, e un contratto scaduto restava scaduto per sempre.
 *
 * Si salva quando si lascia il campo, non a ogni battuta: mentre si riscrive
 * una data il campo passa dal vuoto, e il vuoto qui vuol dire «senza scadenza»
 * — salvandolo subito si cancellerebbe la scadenza di un listino per il solo
 * fatto di averla voluta correggere, rimettendolo in corso senza accorgersene.
 */
function ValiditaListino({
  listino, puoModificare, onSalvato,
}: {
  listino: TestataListino;
  puoModificare: boolean;
  onSalvato: () => void;
}) {
  // Lo stato parte dal listino aperto; il `key` sul componente lo rifa' da capo
  // quando si cambia listino dalla tendina.
  const [dal, setDal] = useState(listino.valido_dal ?? "");
  const [al, setAl] = useState(listino.valido_al ?? "");

  const salva = useMutation({
    mutationFn: async (patch: { valido_dal?: string | null; valido_al?: string | null }) => {
      const { error } = await (supabase as any)
        .from("listini_fornitore")
        .update(patch)
        .eq("id", listino.id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      onSalvato();
      toast.success(patch.valido_al === null && "valido_al" in patch
        ? "Il listino ora è senza scadenza"
        : "Date del listino aggiornate");
    },
    onError: (e: Error, patch) => {
      // Il database ha rifiutato: il campo deve tornare a dire la verita'.
      if ("valido_dal" in patch) setDal(listino.valido_dal ?? "");
      if ("valido_al" in patch) setAl(listino.valido_al ?? "");
      toast.error("Date non salvate", { description: e.message });
    },
  });

  /**
   * Date incrociate («dal 2027 al 2026») renderebbero il listino scaduto in
   * silenzio: il database non ha un CHECK che lo impedisca, quindi la guardia
   * sta qui e il campo torna com'era.
   */
  const incrociate = (quale: "valido_dal" | "valido_al", nuovoValore: string | null) => {
    const d = quale === "valido_dal" ? nuovoValore : dal || null;
    const a = quale === "valido_al" ? nuovoValore : al || null;
    return !!d && !!a && d > a;
  };

  const campo = (
    quale: "valido_dal" | "valido_al",
    etichettaCampo: string,
    valore: string,
    scrivi: (v: string) => void,
  ) => (
    <div className="flex items-center gap-1.5">
      <Label htmlFor={`${quale}-${listino.id}`} className="text-xs text-muted-foreground">{etichettaCampo}</Label>
      <Input
        id={`${quale}-${listino.id}`}
        type="date"
        className="h-8 w-[9.5rem] text-sm"
        value={valore}
        disabled={!puoModificare}
        onChange={(e) => scrivi(e.target.value)}
        onBlur={() => {
          const nuovoValore = valore || null;
          if (!puoModificare || nuovoValore === (listino[quale] ?? null)) return;
          if (incrociate(quale, nuovoValore)) {
            scrivi(listino[quale] ?? "");
            toast.error("La fine della validità viene prima dell'inizio", {
              description: "Il listino risulterebbe scaduto appena salvato. Controlla le due date.",
            });
            return;
          }
          salva.mutate({ [quale]: nuovoValore });
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      {campo("valido_dal", "In vigore dal", dal, setDal)}
      {campo("valido_al", "fino al", al, setAl)}
      {salva.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      {!al && <span className="text-xs text-muted-foreground">senza scadenza</span>}
    </div>
  );
}

function ListinoEditor({
  supplierId,
  esistente,
  inVigore,
  onModificato,
  onSalvato,
}: {
  supplierId: string;
  esistente: ListinoEsistente;
  /** Falso quando il listino aperto e' scaduto o non ancora in vigore: il toast non deve promettere suggerimenti. */
  inVigore: boolean;
  /** Si chiama alla prima modifica: il guscio deve sapere che c'e' del lavoro da salvare. */
  onModificato: () => void;
  onSalvato: () => void;
}) {
  const companyId = useEffectiveCompanyId();
  const queryClient = useQueryClient();
  const permessi = usePermissions();
  // Il listino del fornitore lo modifica chi gestisce i fornitori o il listino:
  // è la regola del database dal 26/09/2026. Gli altri lo consultano.
  const puoModificare = permessi.canEditSettingsSuppliers || permessi.canManageSuppliers || permessi.canEditSettingsPricing;

  const [voci, setVoci] = useState<RigaVoce[]>(() => esistente.voci);
  const [incollaAperto, setIncollaAperto] = useState(false);
  const [testoIncolla, setTestoIncolla] = useState("");
  const [filtro, setFiltro] = useState("");

  const visibili = useMemo(() => {
    const q = filtro.toLowerCase().trim();
    if (!q) return voci;
    return voci.filter(
      (v) =>
        v.descrizione.toLowerCase().includes(q) ||
        v.codice.toLowerCase().includes(q),
    );
  }, [voci, filtro]);

  const aggiorna = (id: string, patch: Partial<RigaVoce>) => {
    onModificato();
    setVoci((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const importaIncollato = () => {
    const { voci: nuove, scartate } = parseVociIncollate(testoIncolla);
    if (nuove.length > 0) {
      onModificato();
      setVoci((r) => [
        ...r,
        ...nuove.map((v) => ({
          id: crypto.randomUUID(),
          codice: v.codice ?? "",
          descrizione: v.descrizione,
          unita: v.unita ?? "",
          prezzo: v.prezzo,
          sconto_pct: v.sconto_pct,
        })),
      ]);
    }
    setIncollaAperto(false);
    setTestoIncolla("");
    if (scartate.length > 0) {
      toast.warning(`${nuove.length === 1 ? "1 voce letta" : `${nuove.length} voci lette`}, ${scartate.length === 1 ? "1 scartata" : `${scartate.length} scartate`}`, {
        description: scartate
          .slice(0, 3)
          .map((s) => `«${s.riga.slice(0, 40)}»: ${s.motivo}`)
          .join(" · "),
      });
    } else if (nuove.length > 0) {
      toast.success(`${nuove.length === 1 ? "1 voce letta" : `${nuove.length} voci lette`}. Ricorda di salvare.`);
    } else {
      toast.error("Nessuna voce leggibile nel testo incollato.");
    }
  };

  const salvaMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Contesto azienda mancante");
      const valide = voci.filter((v) => v.descrizione.trim().length > 0);

      // Testata: la si crea alla prima occasione, poi si riusa.
      let listinoId = esistente.listino?.id ?? "";
      if (!listinoId) {
        const { data: nuovo, error } = await (supabase as any)
          .from("listini_fornitore")
          .insert({ company_id: companyId, supplier_id: supplierId })
          .select("id")
          .single();
        if (error) throw error;
        listinoId = nuovo.id;
      }

      // Voci: prima il nuovo, poi via il vecchio — mai una perdita.
      const nuoviIds: string[] = [];
      if (valide.length > 0) {
        const rows = valide.map((v, i) => {
          const id = crypto.randomUUID();
          nuoviIds.push(id);
          return {
            id,
            company_id: companyId,
            listino_id: listinoId,
            codice: v.codice.trim() || null,
            descrizione: v.descrizione.trim(),
            unita: v.unita.trim() || null,
            prezzo: v.prezzo || 0,
            sconto_pct: v.sconto_pct || 0,
            immagine_url: v.immagine_url ?? null,
            sort_order: i,
          };
        });
        const { error } = await (supabase as any)
          .from("listino_fornitore_voci")
          .insert(rows);
        if (error) throw error;
      }
      let del = (supabase as any)
        .from("listino_fornitore_voci")
        .delete()
        .eq("listino_id", listinoId);
      if (nuoviIds.length > 0) del = del.not("id", "in", `(${nuoviIds.join(",")})`);
      const { error: eDel } = await del;
      if (eDel) throw eDel;
      return valide.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: ["listino-fornitore-testate", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["listino-fornitore-editor", supplierId] });
      queryClient.invalidateQueries({ queryKey: ["listino-fornitore-voci", supplierId] });
      onSalvato();
      toast.success(`Listino salvato: ${n} ${n === 1 ? "voce" : "voci"}`, {
        description: inVigore
          ? "Da adesso i prezzi vengono suggeriti sulle righe degli ordini a questo fornitore."
          : "Questo listino non è in vigore: sugli ordini i prezzi vengono proposti come non aggiornati finché le date non lo rimettono in corso.",
      });
    },
    onError: (e: Error) => toast.error("Salvataggio non riuscito", { description: e.message }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Cerca per codice o descrizione…"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          className="h-9 max-w-xs"
        />
        <div className="flex-1" />
        {puoModificare && (
          <>
            <Button variant="outline" size="sm" onClick={() => setIncollaAperto(true)}>
              <ClipboardPaste className="h-4 w-4 mr-1" />Incolla da Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                onModificato();
                setVoci((r) => [
                  ...r,
                  { id: crypto.randomUUID(), codice: "", descrizione: "", unita: "", prezzo: 0, sconto_pct: 0 },
                ]);
              }}
            >
              <Plus className="h-4 w-4 mr-1" />Voce
            </Button>
            <Button size="sm" disabled={salvaMutation.isPending} onClick={() => salvaMutation.mutate()}>
              {salvaMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Salva listino
            </Button>
          </>
        )}
      </div>

      {voci.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {puoModificare
            ? "Nessuna voce. Incolla il listino dal foglio Excel del fornitore, o aggiungi le voci una per una. Codice e descrizione contano: sono la chiave con cui il prezzo viene suggerito sugli ordini."
            : "Nessuna voce in questo listino."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="text-left p-2 font-medium w-28">Codice</th>
                <th className="text-left p-2 font-medium">Descrizione</th>
                <th className="text-left p-2 font-medium w-16">U.m.</th>
                <th className="text-right p-2 font-medium w-24">Prezzo</th>
                <th className="text-right p-2 font-medium w-20">Sconto %</th>
                <th className="text-right p-2 font-medium w-24">Netto</th>
                <th className="w-10 p-2"></th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="p-1">
                    <Input aria-label={`Codice voce ${v.codice || v.descrizione || v.id}`} value={v.codice} onChange={(e) => aggiorna(v.id, { codice: e.target.value })} readOnly={!puoModificare} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <div className="flex items-center gap-2">
                      {v.immagine_url && (
                        <img
                          src={v.immagine_url}
                          alt=""
                          loading="lazy"
                          className="h-9 w-9 shrink-0 rounded border bg-white object-contain"
                        />
                      )}
                      <Input aria-label={`Descrizione voce ${v.codice || v.descrizione || v.id}`} value={v.descrizione} onChange={(e) => aggiorna(v.id, { descrizione: e.target.value })} readOnly={!puoModificare} className="h-8 text-sm" />
                    </div>
                  </td>
                  <td className="p-1">
                    <Input aria-label={`Unità di misura voce ${v.codice || v.descrizione || v.id}`} value={v.unita} onChange={(e) => aggiorna(v.id, { unita: e.target.value })} readOnly={!puoModificare} className="h-8 text-sm" />
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={`Prezzo voce ${v.codice || v.descrizione || v.id}`}
                      type="number" min={0} step="0.01"
                      value={Number.isFinite(v.prezzo) ? v.prezzo : 0}
                      readOnly={!puoModificare}
                      onChange={(e) => aggiorna(v.id, { prezzo: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm text-right"
                    />
                  </td>
                  <td className="p-1">
                    <Input
                      aria-label={`Sconto percentuale voce ${v.codice || v.descrizione || v.id}`}
                      type="number" min={0} max={100} step="0.5"
                      value={Number.isFinite(v.sconto_pct) ? v.sconto_pct : 0}
                      readOnly={!puoModificare}
                      onChange={(e) => aggiorna(v.id, { sconto_pct: parseFloat(e.target.value) || 0 })}
                      className="h-8 text-sm text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-medium tabular-nums">
                    {formatCurrency(prezzoNetto(v.prezzo, v.sconto_pct))}
                  </td>
                  <td className="p-1 text-center">
                    {puoModificare && (
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { onModificato(); setVoci((r) => r.filter((x) => x.id !== v.id)); }}
                        aria-label="Rimuovi voce"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtro && visibili.length !== voci.length && (
        <p className="text-xs text-muted-foreground">
          {visibili.length} di {voci.length} voci mostrate. Il salvataggio riguarda sempre tutte.
        </p>
      )}

      <Dialog open={incollaAperto} onOpenChange={setIncollaAperto}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Incolla da Excel</DialogTitle>
            <DialogDescription>
              Copia le righe dal foglio del fornitore e incollale qui. Colonne
              accettate, in ordine: codice · descrizione · unità · prezzo ·
              sconto% (bastano descrizione e prezzo). La virgola è il decimale.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Righe del listino da Excel"
            value={testoIncolla}
            onChange={(e) => setTestoIncolla(e.target.value)}
            rows={10}
            placeholder={"TU-100\tTubo rame 22mm\tm\t8,40\t10"}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIncollaAperto(false)}>Annulla</Button>
            <Button onClick={importaIncollato} disabled={!testoIncolla.trim()}>
              Leggi le righe
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

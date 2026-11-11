// ============================================================================
// Merce sulla bolla — che cosa c'è scritto sul documento del fornitore
// ----------------------------------------------------------------------------
// È la prima domanda che si fa a una bolla: cosa è arrivato. Non il corriere,
// non la targa: la merce. Per questo sta in testa alla pagina.
//
// Da non confondere con «Ricezioni merce per articolo» (`goods_receipts`), che
// è un'altra cosa: quelle sono le quantità entrate in magazzino contro una riga
// d'ordine già esistente. Qui c'è la bolla così com'è, prezzi compresi, anche
// per i prodotti che in ordine non c'erano — ed è quello che permetterà di
// confrontare la fattura di fine mese con le bolle (fase 4 del piano).
//
// OGNI CAMPO SI CORREGGE A MANO. L'AI legge, la persona ha l'ultima parola, e
// quello che l'AI aveva letto non si perde: resta in `ai_originale`, e la riga
// corretta lo mostra. Una riga sbagliata qui diventa un costo sbagliato in
// commessa e poi una fattura che non torna: va vista e corretta guardando la
// foto, che su questa pagina sta accanto.
// ============================================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ListTree, Loader2, Sparkles, AlertTriangle, Plus, Trash2, PenLine, Check, X,
} from "lucide-react";
import {
  useDDTRighe,
  useDDTRigheMutations,
  type DDTRiga,
  type DDTRigaNuova,
} from "@/hooks/useDDTRicezione";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAbbinamentoBolla } from "@/hooks/useAbbinamentoBolla";
import { arriviDaRegistrare, righeOrdinePerRiga, type RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrivoPosizioniPanel } from "@/components/ddt/ArrivoPosizioniPanel";
import { importoRiga } from "@/lib/ddt/letturaAI";
import { cn } from "@/lib/utils";

const euro = (v: number) =>
  v.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: true });

const numero = (v: number | null | undefined, max = 3) =>
  v == null ? "—" : v.toLocaleString("it-IT", { maximumFractionDigits: max });

/** Il testo è quello che si digita; vuoto vuol dire «non si sa», cioè NULL. */
const testo = (v: string) => (v.trim() === "" ? null : v.trim());
const cifra = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

type Bozza = {
  codice_articolo: string;
  descrizione: string;
  unita_misura: string;
  quantita: string;
  prezzo_unitario: string;
};

const bozzaDa = (r: DDTRiga): Bozza => ({
  codice_articolo: r.codice_articolo ?? "",
  descrizione: r.descrizione,
  unita_misura: r.unita_misura ?? "",
  quantita: r.quantita != null ? String(r.quantita) : "",
  prezzo_unitario: r.prezzo_unitario != null ? String(r.prezzo_unitario) : "",
});

const BOZZA_VUOTA: Bozza = {
  codice_articolo: "",
  descrizione: "",
  unita_misura: "",
  quantita: "",
  prezzo_unitario: "",
};

/** Che cosa aveva letto l'AI su questa riga, per dirlo quando è stata corretta. */
function lettoDallAI(r: DDTRiga): string | null {
  const o = r.ai_originale;
  if (!o || typeof o !== "object") return null;
  const g = o as Record<string, unknown>;
  const pezzi = [
    g.codice_articolo ? String(g.codice_articolo) : null,
    g.descrizione ? String(g.descrizione) : null,
    g.quantita != null ? `× ${g.quantita}` : null,
    g.unita_misura ? String(g.unita_misura) : null,
    g.prezzo_unitario_eur != null ? `a ${g.prezzo_unitario_eur}` : null,
  ].filter(Boolean);
  return pezzi.length > 0 ? pezzi.join(" ") : null;
}

const NON_DI_QUESTO_ORDINE = "__nessuna";

const etichettaOrdine = (o: RigaOrdine, conNumero: boolean) =>
  `${conNumero && o.oda_number ? `${o.oda_number} · ` : ""}${o.description || "Riga senza descrizione"} · ${numero(o.quantity)} ${o.unit_of_measure || "pz"}`;

/** Sotto la descrizione: con che riga dell'ordine è abbinata, o la scelta da fare. */
function AbbinamentoRiga({ riga, ordine, piuOrdini, modificabile, inCorso, onScegli }: {
  piuOrdini: boolean;
  riga: DDTRiga;
  ordine: RigaOrdine[];
  modificabile: boolean;
  inCorso: boolean;
  onScegli: (poi: string | null) => void;
}) {
  const abbinata = ordine.find((o) => o.id === riga.purchase_order_item_id);
  const esclusa = !abbinata && riga.abbinamento === "manuale";
  const scarto = abbinata && riga.quantita != null && Number(riga.quantita) !== Number(abbinata.quantity);
  const opzioni = righeOrdinePerRiga(riga, ordine);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
      {abbinata && <span className="inline-flex min-w-0 items-center gap-1 text-emerald-700"><Check className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{piuOrdini && abbinata.oda_number ? `${abbinata.oda_number} · ` : ""}{abbinata.description}</span></span>}
      {scarto && <span className="text-amber-700">ordinati {numero(abbinata.quantity)}, in bolla {numero(riga.quantita)}</span>}
      {esclusa && <span className="text-muted-foreground">Non è di questo ordine</span>}
      {riga.arrivo_registrato_il && <span className="rounded-full bg-emerald-50 px-1.5 font-medium text-emerald-800">Arrivo registrato</span>}
      {!abbinata && !esclusa && <span className="font-medium text-amber-700">Non trovata nell'ordine</span>}
      {modificabile && (
        <Select value="" disabled={inCorso} onValueChange={(v) => onScegli(v === NON_DI_QUESTO_ORDINE ? null : v)}>
          <SelectTrigger aria-label={`Abbina ${riga.descrizione} a una riga dell'ordine`} className="h-6 w-auto gap-1 border-dashed px-2 text-[11px]">
            <SelectValue placeholder={abbinata || esclusa ? "Cambia" : "Abbina…"} />
          </SelectTrigger>
          <SelectContent>
            {opzioni.map((o) => <SelectItem key={o.id} value={o.id}>{etichettaOrdine(o, piuOrdini)}</SelectItem>)}
            <SelectItem value={NON_DI_QUESTO_ORDINE}>Non è di questo ordine</SelectItem>
          </SelectContent>
        </Select>
      )}
    </span>
  );
}

export function DDTRigheCard({
  ddtId,
  aiConfidenza,
  aiAvvisi,
  /** La quantità scritta in testata: se non torna con le righe va detto. */
  quantitaInTestata,
  ricezioni = 0,
  /** Sola lettura per chi non può modificare la bolla. */
  modificabile = true,
  odaId,
  fornitoreId,
  consegnaDiretta = false,
  gestioneConsegneEsplicita = false,
}: {
  ddtId: string | null | undefined;
  aiConfidenza?: number | null;
  aiAvvisi?: string[] | null;
  quantitaInTestata?: number | null;
  /** Articoli già registrati all'arrivo su questa bolla. */
  ricezioni?: number;
  modificabile?: boolean;
  /** La consegna diretta non deve usare la procedura che carica giacenze. */
  consegnaDiretta?: boolean;
  gestioneConsegneEsplicita?: boolean;
  /** L'ordine a cui è collegata la bolla: la sua merce si abbina riga per riga. */
  odaId?: string | null;
  /** Una bolla può consegnare più ordini: si guardano anche gli altri aperti del fornitore. */
  fornitoreId?: string | null;
}) {
  const { data: righe = [], isLoading, isError, refetch } = useDDTRighe(ddtId);
  const { aggiungiRighe, aggiornaRiga, eliminaRiga } = useDDTRigheMutations(ddtId);
  const { ordine, abbina, registraArrivo, nonInBolla, ordiniToccati } = useAbbinamentoBolla(ddtId, odaId, righe, modificabile, fornitoreId);
  const conferma = useConfirm();
  const daRegistrare = arriviDaRegistrare(righe, ordine);
  const chiediRegistrazione = async () => {
    if (consegnaDiretta || gestioneConsegneEsplicita) return;
    const elenco = daRegistrare.map((d) => `${d.numero ?? "ordine"}: ${d.righe === 1 ? "1 riga" : `${d.righe} righe`}`).join(" · ");
    if (await conferma({
      title: "Registrare l'arrivo sugli ordini?",
      description: `${elenco}. Non si supera mai la quantità ordinata.${daScegliere > 0 ? ` ${daScegliere} ${daScegliere === 1 ? "riga non abbinata resta" : "righe non abbinate restano"} fuori.` : ""}`,
      confirmLabel: "Registra arrivo",
      cancelLabel: "Non ora",
    })) registraArrivo.mutate();
  };
  const piuOrdini = new Set(ordine.map((o) => o.purchase_order_id)).size > 1;
  const abbinate = righe.filter((r) => r.purchase_order_item_id).length;
  const daScegliere = righe.filter((r) => !r.purchase_order_item_id && r.abbinamento !== "manuale").length;

  const [inModifica, setInModifica] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Bozza>(BOZZA_VUOTA);
  const [nuova, setNuova] = useState<Bozza | null>(null);

  const importi = righe.map((r) => importoRiga(r)).filter((v): v is number => v != null);
  const totale = importi.length > 0 ? importi.reduce((s, v) => s + v, 0) : null;
  const quantitaRighe = righe.reduce((s, r) => s + (r.quantita ?? 0), 0);
  const quantitaPerUnita = new Map<string, number>();
  for (const r of righe) {
    if (r.quantita == null) continue;
    const um = r.unita_misura?.trim().toLowerCase() || "UM da indicare";
    quantitaPerUnita.set(um, (quantitaPerUnita.get(um) ?? 0) + r.quantita);
  }
  const senzaPrezzo = righe.filter((r) => importoRiga(r) == null).length;
  // Scarto fra la quantità in testata e la somma delle righe. Due numeri che
  // dicono la stessa cosa e non coincidono sono peggio di un numero solo.
  const scartoQuantita =
    quantitaInTestata != null && quantitaRighe > 0 && quantitaPerUnita.size === 1
      ? Math.round((quantitaInTestata - quantitaRighe) * 1000) / 1000
      : 0;

  const apriModifica = (r: DDTRiga) => {
    setInModifica(r.id);
    setBozza(bozzaDa(r));
    setNuova(null);
  };

  const salva = async () => {
    if (!inModifica) return;
    await aggiornaRiga.mutateAsync({
      id: inModifica,
      updates: {
        codice_articolo: testo(bozza.codice_articolo),
        descrizione: bozza.descrizione,
        unita_misura: testo(bozza.unita_misura),
        quantita: cifra(bozza.quantita),
        prezzo_unitario: cifra(bozza.prezzo_unitario),
        // Toccata a mano: l'importo del documento non vale più e si ricalcola,
        // e la riga smette di essere «letta dall'AI». `ai_originale` resta.
        importo: null,
        origine: "manuale",
      },
    });
    setInModifica(null);
  };

  const salvaNuova = async () => {
    if (!nuova || nuova.descrizione.trim() === "") return;
    const riga: DDTRigaNuova = {
      posizione: righe.length + 1,
      codice_articolo: testo(nuova.codice_articolo),
      descrizione: nuova.descrizione.trim(),
      unita_misura: testo(nuova.unita_misura),
      quantita: cifra(nuova.quantita),
      prezzo_unitario: cifra(nuova.prezzo_unitario),
      importo: null,
      iva_percentuale: null,
      order_item_id: null,
      origine: "manuale",
      ai_originale: null,
      testo_grezzo: null,
      note: null,
    };
    await aggiungiRighe.mutateAsync([riga]);
    setNuova(null);
  };

  const inCorso = aggiornaRiga.isPending || aggiungiRighe.isPending || eliminaRiga.isPending;

  if (isError) return <Card><CardHeader><CardTitle className="text-base">Merce sulla bolla</CardTitle></CardHeader><CardContent><p role="alert" className="text-sm text-destructive">Le righe non sono disponibili: il documento non è vuoto. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p></CardContent></Card>;

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <ListTree className="h-4 w-4 text-primary" />
            Merce sulla bolla
            <Badge variant="secondary" className="text-xs">
              {righe.length}
            </Badge>
            {aiConfidenza != null && (
              <Badge variant="outline" className="text-[10px] font-normal gap-1">
                <Sparkles className="h-3 w-3" />
                letta dall'AI · {Math.round(aiConfidenza * 100)}%
              </Badge>
            )}
            {ordine.length > 0 && righe.length > 0 && (
              <Badge variant="outline" className={cn("text-[10px] font-normal", daScegliere > 0 ? "border-amber-300 text-amber-800" : "border-emerald-300 text-emerald-800")}>
                {abbinate} di {righe.length} abbinate{ordiniToccati.length > 1 ? ` · ${ordiniToccati.length} ordini` : " all'ordine"}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-3">
            {totale != null && (
              <span className="text-xs text-muted-foreground">
                Valore merce: <strong className="tabular-nums">{euro(totale)}</strong>
              </span>
            )}
            {modificabile && !nuova && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  setNuova(BOZZA_VUOTA);
                  setInModifica(null);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                Aggiungi riga
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : righe.length === 0 && !nuova ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {ricezioni > 0
              ? "La merce arrivata è registrata articolo per articolo qui sotto. Le righe della bolla servono per confrontarla con la fattura del fornitore."
              : "Nessuna riga registrata per questa bolla. Senza le righe non si può confrontare la bolla con la fattura del fornitore."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:font-medium">
                  <th className="w-[15%]">Codice</th>
                  <th>Descrizione</th>
                  <th className="w-[10%] text-right">Q.tà</th>
                  <th className="w-[8%]">UM</th>
                  <th className="w-[13%] text-right">€/UM</th>
                  <th className="w-[13%] text-right">Importo</th>
                  {modificabile && <th className="w-[8%]" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {righe.map((r) =>
                  inModifica === r.id ? (
                    <tr key={r.id} className="bg-primary/5 [&>td]:px-1.5 [&>td]:py-1.5">
                      <td>
                        <Input
                          value={bozza.codice_articolo}
                          onChange={(e) => setBozza({ ...bozza, codice_articolo: e.target.value })}
                          className="h-7 text-xs font-mono"
                          placeholder="codice"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.descrizione}
                          onChange={(e) => setBozza({ ...bozza, descrizione: e.target.value })}
                          className="h-7 text-xs"
                          placeholder="descrizione"
                          autoFocus
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.quantita}
                          onChange={(e) => setBozza({ ...bozza, quantita: e.target.value })}
                          inputMode="decimal"
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.unita_misura}
                          onChange={(e) => setBozza({ ...bozza, unita_misura: e.target.value })}
                          className="h-7 text-xs"
                        />
                      </td>
                      <td>
                        <Input
                          value={bozza.prezzo_unitario}
                          onChange={(e) => setBozza({ ...bozza, prezzo_unitario: e.target.value })}
                          inputMode="decimal"
                          className="h-7 text-xs text-right"
                        />
                      </td>
                      <td className="text-right text-muted-foreground">
                        {cifra(bozza.quantita) != null && cifra(bozza.prezzo_unitario) != null
                          ? euro(
                              Math.round(
                                cifra(bozza.quantita)! * cifra(bozza.prezzo_unitario)! * 100,
                              ) / 100,
                            )
                          : "—"}
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <Button
                            size="icon"
                            className="h-6 w-6"
                            onClick={salva}
                            disabled={inCorso || bozza.descrizione.trim() === ""}
                          >
                            {inCorso ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setInModifica(null)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.id} className="[&>td]:px-2 [&>td]:py-1.5 hover:bg-muted/20">
                      <td className="font-mono text-[11px] text-muted-foreground">
                        {r.codice_articolo || "—"}
                      </td>
                      <td className="max-w-[260px]">
                        <span className="flex items-center gap-1.5">
                          <span className="block truncate" title={r.descrizione}>
                            {r.descrizione}
                          </span>
                          {r.origine === "manuale" && r.ai_originale && (
                            <span
                              className="shrink-0"
                              title={`Corretta a mano. L'AI aveva letto: ${lettoDallAI(r) ?? "—"}`}
                            >
                              <PenLine className="h-3 w-3 text-amber-600" />
                            </span>
                          )}
                          {r.origine === "ai" && (
                            <span className="shrink-0" title="Letta dall'AI, non ancora controllata">
                              <Sparkles className="h-3 w-3 text-violet-500" />
                            </span>
                          )}
                        </span>
                        {r.origine === "manuale" && lettoDallAI(r) && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            l'AI aveva letto: {lettoDallAI(r)}
                          </span>
                        )}
                        {ordine.length > 0 && (
                          <AbbinamentoRiga riga={r} ordine={ordine} piuOrdini={piuOrdini} modificabile={modificabile} inCorso={abbina.isPending}
                            onScegli={(poi) => abbina.mutate({ riga: r.id, poi })} />
                        )}
                      </td>
                      <td className="text-right tabular-nums">{numero(r.quantita)}</td>
                      <td className="text-muted-foreground">{r.unita_misura || "—"}</td>
                      <td className="text-right tabular-nums">
                        {r.prezzo_unitario != null ? euro(r.prezzo_unitario) : "—"}
                      </td>
                      <td
                        className={cn(
                          "text-right tabular-nums font-medium",
                          importoRiga(r) == null && "text-amber-600",
                        )}
                      >
                        {importoRiga(r) != null ? euro(importoRiga(r)!) : "da valorizzare"}
                      </td>
                      {modificabile && (
                        <td>
                          <div className="flex items-center gap-0.5">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => apriModifica(r)}
                              title="Correggi la riga"
                            >
                              <PenLine className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => eliminaRiga.mutate(r.id)}
                              title="Togli la riga"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ),
                )}

                {nuova && (
                  <tr className="bg-emerald-50/60 [&>td]:px-1.5 [&>td]:py-1.5">
                    <td>
                      <Input
                        value={nuova.codice_articolo}
                        onChange={(e) => setNuova({ ...nuova, codice_articolo: e.target.value })}
                        className="h-7 text-xs font-mono"
                        placeholder="codice"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.descrizione}
                        onChange={(e) => setNuova({ ...nuova, descrizione: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="descrizione della merce"
                        autoFocus
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.quantita}
                        onChange={(e) => setNuova({ ...nuova, quantita: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.unita_misura}
                        onChange={(e) => setNuova({ ...nuova, unita_misura: e.target.value })}
                        className="h-7 text-xs"
                        placeholder="pz"
                      />
                    </td>
                    <td>
                      <Input
                        value={nuova.prezzo_unitario}
                        onChange={(e) => setNuova({ ...nuova, prezzo_unitario: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right"
                      />
                    </td>
                    <td className="text-right text-muted-foreground">—</td>
                    <td>
                      <div className="flex items-center gap-0.5">
                        <Button
                          size="icon"
                          className="h-6 w-6"
                          onClick={salvaNuova}
                          disabled={inCorso || nuova.descrizione.trim() === ""}
                        >
                          {inCorso ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setNuova(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {righe.length > 0 && (
                <tfoot className="border-t bg-muted/20 font-medium">
                  <tr className="[&>td]:px-2 [&>td]:py-1.5">
                    <td colSpan={2} className="text-muted-foreground">
                      Totale
                    </td>
                    <td colSpan={3} className="text-right tabular-nums">
                      {[...quantitaPerUnita].map(([um, q]) => `${numero(q)} ${um}`).join(" · ") || "—"}
                    </td>
                    <td className="text-right tabular-nums">
                      {totale != null ? euro(totale) : "—"}
                    </td>
                    {modificabile && <td />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Quello che non torna, detto invece che lasciato scoprire */}
        {scartoQuantita !== 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-amber-700">
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
            La quantità in testata è {numero(quantitaInTestata)}, la somma delle righe
            è {numero(quantitaRighe)}: {numero(Math.abs(scartoQuantita))} di differenza.
            Vale quello che c'è sulle righe — la testata è un totale che qualcuno ha
            digitato.
          </p>
        )}

        {senzaPrezzo > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {senzaPrezzo} {senzaPrezzo === 1 ? "riga" : "righe"} senza prezzo: la bolla
            non è ancora valorizzabile per intero. Potrai completare i prezzi
            collegando la fattura del fornitore.
          </p>
        )}

        {aiAvvisi && aiAvvisi.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-amber-700">
            {aiAvvisi.map((a) => (
              <li key={a} className="flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                {a}
              </li>
            ))}
          </ul>
        )}
        {consegnaDiretta && <p className="mt-3 text-xs text-emerald-800">Consegna diretta in cantiere: le righe documentano la consegna e non generano carichi di magazzino.</p>}
        {modificabile && !consegnaDiretta && !gestioneConsegneEsplicita && daRegistrare.length > 0 && (
          <Button size="sm" className="mt-3" disabled={registraArrivo.isPending} onClick={() => void chiediRegistrazione()}>
            {registraArrivo.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Registra arrivo sugli ordini
          </Button>
        )}
        {ordiniToccati.length > 1 && (
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            Questa bolla consegna:
            {ordiniToccati.map((o) => (
              <Link key={o.id} to={`/azienda/ordini-acquisto/${o.id}`} className="font-medium text-primary underline">{o.numero ?? "ordine"}</Link>
            ))}
          </p>
        )}
        {righe.length > 0 && nonInBolla.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Nell'ordine ma non su questa bolla: {nonInBolla.map((o) => o.description || "riga senza descrizione").join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
    {/* Le posizioni su misura degli altri ordini consegnati da questa bolla: quello collegato sta già nella pagina. */}
    {ordiniToccati.filter((o) => o.id !== odaId).map((o) => <ArrivoPosizioniPanel key={o.id} odaId={o.id} ddtId={ddtId} nascondiSeVuoto />)}
    </>
  );
}

/**
 * Richiesta d'offerta — dettaglio.
 *
 * Tre momenti, uno dopo l'altro:
 *   1. si scrive cosa serve (righe senza prezzo) e a chi chiederlo
 *   2. si chiede a ciascun fornitore: dalla casella aziendale, oppure fuori
 *      dall'app (telefono, WhatsApp, la propria email, al banco) e la si segna
 *      come chiesta
 *   3. arrivano le risposte — lette dall'AI o scritte a mano — si confrontano
 *      riga per riga e si aggiudica
 *
 * L'aggiudicazione e' l'unico punto in cui nasce un impegno di spesa: da li'
 * in poi si lavora sull'ordine d'acquisto, non piu' qui.
 */
import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Plus, Trash2, Send, Trophy, Mail, ExternalLink, AlertTriangle,
  FileQuestion, Users, ClipboardList, CheckCircle2, Sparkles, MoreHorizontal, Paperclip, Inbox,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import {
  QuotePageHeader, QuoteCard, QuoteChip, QuotePrimaryButton,
} from "@/components/marketing/preventivi/ui/builderUI";
import {
  useSupplierRfqDetail, totaleRigaOfferta, CANALE_RICHIESTA_LABELS, type CanaleRichiesta, type RfqSupplier,
} from "@/hooks/useSupplierRfqs";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAuth } from "@/contexts/AuthContext";
import { EmailComposeDialog, type ComposeContext } from "@/pages/azienda/email/components/EmailComposeDialog";
import { EstraiOffertaAIDialog, type RigaEstratta, type PropostaEstratta } from "@/components/rdo/EstraiOffertaAIDialog";
import { buildRdoEmailBody, buildRdoEmailSubject } from "@/lib/rdoEmail";
import {
  RDO_STATUS_LABELS, RDO_FORNITORE_LABELS, RDO_FORNITORE_COLORS,
} from "@/lib/rdoStatus";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";

const dataIt = (iso?: string | null) =>
  iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—";

export default function SupplierRfqDetail() {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const {
    rfq, items, fornitori, quotes, isLoading,
    updateRfq, addItem, updateItem, deleteItem,
    addFornitore, updateFornitore, removeFornitore, setQuote, aggiudica,
    segnaChiesta, registraOfferta, allegaOfferta,
  } = useSupplierRfqDetail(rfqId ?? null);
  const { suppliers } = useOperationalSuppliers();

  const [nuovoFornitore, setNuovoFornitore] = useState("");
  const [inviaA, setInviaA] = useState<RfqSupplier | null>(null);
  const [aggiudicaA, setAggiudicaA] = useState<RfqSupplier | null>(null);
  const [estraiDa, setEstraiDa] = useState<RfqSupplier | null>(null);
  const [motivazione, setMotivazione] = useState("");
  // un doppio clic parte prima che il bottone si disabiliti: il database rifiuta
  // il secondo, ma l'errore arrivava dopo un'aggiudicazione riuscita
  const aggiudicaInCorso = useRef(false);

  const totaliPerFornitore = useMemo(() => {
    const out: Record<string, { totale: number | null; righeCoperte: number }> = {};
    for (const f of fornitori) {
      let somma = 0;
      let coperte = 0;
      for (const it of items) {
        const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
        const t = totaleRigaOfferta(q, Number(it.quantita));
        if (t != null) {
          somma += t;
          coperte += 1;
        }
      }
      // Se il fornitore ha risposto a corpo senza dettagliare, vale il totale
      // che ha scritto lui: sommare righe vuote darebbe zero.
      const daRighe = coperte > 0 ? somma : null;
      out[f.id] = {
        totale: daRighe ?? (f.totale_offerto == null ? null : Number(f.totale_offerto)),
        // un'offerta a corpo copre tutto per definizione
        righeCoperte: daRighe == null && f.totale_offerto != null ? items.length : coperte,
      };
    }
    return out;
  }, [fornitori, items, quotes]);

  /** Chi offre meno su una riga: e' l'unico confronto che conta davvero. */
  const migliorePerRiga = useMemo(() => {
    const out: Record<string, string | null> = {};
    for (const it of items) {
      let vincitore: string | null = null;
      let minimo = Infinity;
      for (const f of fornitori) {
        const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
        const t = totaleRigaOfferta(q, Number(it.quantita));
        if (t != null && t < minimo) {
          minimo = t;
          vincitore = f.id;
        }
      }
      out[it.id] = vincitore;
    }
    return out;
  }, [items, fornitori, quotes]);

  // Il totale più basso vale solo fra offerte che coprono le stesse voci: chi
  // quota una voce su due costa meno perché manca metà fornitura, non perché conviene.
  const miglioreTotale = useMemo(() => {
    let id: string | null = null;
    let minimo = Infinity;
    const piuCompleta = Math.max(0, ...fornitori.map((f) => totaliPerFornitore[f.id]?.righeCoperte ?? 0));
    for (const f of fornitori) {
      const t = totaliPerFornitore[f.id]?.totale;
      if ((totaliPerFornitore[f.id]?.righeCoperte ?? 0) < piuCompleta) continue;
      if (t != null && t < minimo) {
        minimo = t;
        id = f.id;
      }
    }
    return id;
  }, [fornitori, totaliPerFornitore]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (!rfq) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Richiesta non trovata</p>
        <Button variant="outline" onClick={() => navigate("/azienda/ordini?tab=offerte")}>
          Torna alla lista
        </Button>
      </div>
    );
  }

  // le voci si cambiano finché non arriva la prima offerta: chi chiede per
  // telefono spesso segna la richiesta prima di aver scritto tutto l'elenco
  const modificabile = rfq.status === "bozza" ||
    (rfq.status === "inviata" && !fornitori.some((f) => f.status === "risposta"));
  // aggiudicata o annullata: si guarda, non si cambia più niente
  const chiusa = rfq.status === "aggiudicata" || rfq.status === "annullata";
  const haRisposte = fornitori.some((f) => f.status === "risposta");

  const composeContext = (f: RfqSupplier): ComposeContext => {
    const dati = {
      rfqNumber: rfq.rfq_number,
      titolo: rfq.titolo,
      descrizione: rfq.descrizione,
      fornitoreNome: f.suppliers?.name ?? null,
      aziendaNome: effectiveCompany?.name ?? null,
      dataFabbisogno: rfq.data_fabbisogno,
      scadenzaOfferte: rfq.scadenza_offerte,
      commessaCodice: rfq.orders?.order_code ?? null,
      note: rfq.note,
      righe: items.map((i) => ({
        descrizione: i.descrizione,
        quantita: i.quantita,
        unita_misura: i.unita_misura,
        note: i.note,
      })),
    };
    return {
      mode: "new",
      initialTo: f.suppliers?.email ? [f.suppliers.email] : [],
      initialSubject: buildRdoEmailSubject(dati),
      initialBodyHtml: buildRdoEmailBody(dati),
    };
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/azienda/ordini?tab=offerte")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Richieste d'offerta</span>
          <span className="sm:hidden">Indietro</span>
        </Button>
      </div>

      <QuotePageHeader
        numero={rfq.rfq_number}
        stato={
          <QuoteChip variant={rfq.status === "aggiudicata" ? "green" : rfq.status === "bozza" ? "default" : "blue"}>
            {RDO_STATUS_LABELS[rfq.status] ?? rfq.status}
          </QuoteChip>
        }
        chips={
          rfq.purchase_order_id ? (
            <Link to={`/azienda/ordini-acquisto/${rfq.purchase_order_id}`} className="inline-flex">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors">
                Ordine generato <ExternalLink className="h-3 w-3" />
              </span>
            </Link>
          ) : null
        }
        title={rfq.titolo}
        subtitle={
          rfq.data_fabbisogno ? `Serve in cantiere entro il ${dataIt(rfq.data_fabbisogno)}` : undefined
        }
        icon={<FileQuestion className="h-5 w-5" />}
        actions={
          rfq.status !== "aggiudicata" && rfq.status !== "annullata" ? (
            <>
              {haRisposte && (
                <QuotePrimaryButton
                  size="sm"
                  onClick={() => {
                    const scelto = fornitori.find((f) => f.id === miglioreTotale) ?? fornitori.find((f) => f.status === "risposta");
                    if (scelto) setAggiudicaA(scelto);
                  }}
                >
                  <Trophy className="h-3.5 w-3.5 mr-1" />
                  Aggiudica
                </QuotePrimaryButton>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateRfq.mutate({ status: "annullata" })}
                disabled={updateRfq.isPending}
              >
                Annulla richiesta
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {/* ── Cosa serve ─────────────────────────────────────────── */}
          <QuoteCard
            title="Cosa serve"
            icon={<ClipboardList className="h-4 w-4" />}
            action={
              modificabile ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addItem.mutate({ posizione: items.length })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Aggiungi voce
                </Button>
              ) : null
            }
          >
            {items.length === 0 ? (
              <p className="text-center py-6 text-sm text-muted-foreground">
                Nessuna voce. I fornitori devono sapere cosa quotare.
              </p>
            ) : (
              <div className="space-y-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center gap-2">
                    <Input
                      defaultValue={it.descrizione}
                      disabled={!modificabile}
                      onBlur={(e) => {
                        if (e.target.value !== it.descrizione) {
                          updateItem.mutate({ id: it.id, updates: { descrizione: e.target.value } });
                        }
                      }}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      defaultValue={String(it.quantita)}
                      disabled={!modificabile}
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (v !== Number(it.quantita)) updateItem.mutate({ id: it.id, updates: { quantita: v } });
                      }}
                      className="w-20 text-right"
                    />
                    <Input
                      defaultValue={it.unita_misura ?? "pz"}
                      disabled={!modificabile}
                      onBlur={(e) => {
                        if (e.target.value !== it.unita_misura) {
                          updateItem.mutate({ id: it.id, updates: { unita_misura: e.target.value } });
                        }
                      }}
                      className="w-16"
                    />
                    {modificabile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteItem.mutate(it.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </QuoteCard>

          {/* ── Confronto ──────────────────────────────────────────── */}
          {fornitori.length > 0 && items.length > 0 && (
            <QuoteCard noHeader className="p-0 sm:p-0">
              <div className="px-5 sm:px-6 pt-5 pb-3">
                <h3 className="text-[15px] font-bold text-slate-900 flex items-center gap-2.5">
                  <span className="block w-1 h-4 rounded-sm bg-gradient-to-b from-orange-500 to-eic-amber" />
                  Confronto offerte
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Scrivi i prezzi che ti hanno mandato. Il più basso di ogni riga si evidenzia da solo.
                </p>
              </div>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 pl-4 font-medium min-w-[180px]">Voce</th>
                      <th className="text-right p-2 font-medium w-20">Q.tà</th>
                      {fornitori.map((f) => (
                        <th key={f.id} className="text-right p-2 font-medium min-w-[110px]">
                          {f.suppliers?.name ?? "Fornitore"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b">
                        <td className="p-2 pl-4">{it.descrizione}</td>
                        <td className="p-2 text-right text-slate-500">
                          {Number(it.quantita).toLocaleString("it-IT")} {it.unita_misura ?? "pz"}
                        </td>
                        {fornitori.map((f) => {
                          const q = quotes.find((x) => x.rfq_item_id === it.id && x.rfq_supplier_id === f.id);
                          const tot = totaleRigaOfferta(q, Number(it.quantita));
                          const vince = migliorePerRiga[it.id] === f.id;
                          return (
                            <td key={f.id} className={`p-1 ${vince ? "bg-emerald-50" : ""}`}>
                              <Input
                                // la chiave segue il valore salvato: un prezzo letto dall'AI
                                // compare nella cella (con defaultValue restava «—», e uscendo
                                // dalla cella vuota il prezzo si cancellava)
                                key={`${q?.id ?? "nuova"}:${q?.prezzo_unitario ?? ""}`}
                                type="number"
                                step="0.01"
                                defaultValue={q?.prezzo_unitario ?? ""}
                                placeholder="—"
                                disabled={chiusa}
                                className={`h-8 text-sm text-right ${vince ? "font-semibold text-emerald-700" : ""}`}
                                onBlur={(e) => {
                                  const raw = e.target.value.trim();
                                  const v = raw === "" ? null : Number(raw);
                                  if (v === (q?.prezzo_unitario == null ? null : Number(q.prezzo_unitario))) return;
                                  setQuote.mutate({
                                    rfq_supplier_id: f.id,
                                    rfq_item_id: it.id,
                                    updates: { prezzo_unitario: v, disponibile: v != null },
                                  });
                                  // un prezzo scritto a mano è un'offerta arrivata: senza, «Aggiudica» non compariva mai
                                  if (v != null && f.status !== "risposta") registraOfferta.mutate(f);
                                }}
                              />
                              {tot != null && (
                                <span className="block text-[10px] text-slate-400 text-right pr-1 mt-0.5">
                                  {formatCurrency(tot)}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30 border-t">
                      <td colSpan={2} className="p-2 pl-4 text-right font-bold">Somma righe confrontate</td>
                      {fornitori.map((f) => {
                        const t = totaliPerFornitore[f.id]?.totale;
                        const vince = miglioreTotale === f.id;
                        return (
                          <td
                            key={f.id}
                            className={`p-2 text-right font-bold tabular-nums ${vince ? "text-emerald-700 bg-emerald-50" : ""}`}
                          >
                            {t != null ? formatCurrency(t) : "—"}
                            {t != null && (totaliPerFornitore[f.id]?.righeCoperte ?? 0) < items.length && (
                              <span className="block text-[10px] font-normal text-amber-700">
                                {totaliPerFornitore[f.id]?.righeCoperte} di {items.length} {items.length === 1 ? "voce" : "voci"}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Il totale scritto sul documento può includere costi non a
                        righe (imballo, trasporto): mostrarlo evita il "perché
                        non torna col PDF?" — il delta è proprio quella parte. */}
                    {fornitori.some((f) => f.totale_offerto != null) && (
                      <tr className="border-t text-xs text-slate-500">
                        <td colSpan={2} className="p-2 pl-4 text-right">Totale documento (con imballo/trasporto)</td>
                        {fornitori.map((f) => {
                          const doc = f.totale_offerto == null ? null : Number(f.totale_offerto);
                          const righe = totaliPerFornitore[f.id]?.totale;
                          const delta = doc != null && righe != null && Math.abs(doc - righe) > 0.5 ? doc - righe : null;
                          return (
                            <td key={f.id} className="p-2 text-right tabular-nums">
                              {doc != null ? formatCurrency(doc) : "—"}
                              {delta != null && (
                                <span className="block text-[10px] text-slate-400">
                                  {delta > 0 ? "+" : "−"}{formatCurrency(Math.abs(delta))} extra righe
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            </QuoteCard>
          )}
        </div>

        {/* ── Fornitori interpellati ───────────────────────────────── */}
        <div className="space-y-4">
          <QuoteCard title="A chi lo chiedi" icon={<Users className="h-4 w-4" />}>
            <div className="space-y-3">
              {fornitori.length === 0 && (
                <p className="text-xs text-slate-500">
                  Nessun fornitore. Chiedere a due o tre è il modo più semplice per non
                  pagare troppo.
                </p>
              )}
              {fornitori.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {f.suppliers?.name ?? "Fornitore"}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {f.inviata_at
                          ? `Chiesta${f.inviata_via ? ` per ${CANALE_RICHIESTA_LABELS[f.inviata_via]}` : ""} il ${dataIt(f.inviata_at)}`
                          : f.suppliers?.email ?? "nessuna email in anagrafica"}
                      </p>
                    </div>
                    <Badge className={`${RDO_FORNITORE_COLORS[f.status] ?? ""} text-[10px] shrink-0`}>
                      {RDO_FORNITORE_LABELS[f.status] ?? f.status}
                    </Badge>
                  </div>

                  {f.aggancio_da_confermare && (
                    <div className="flex gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-600" />
                      <span>
                        Risposta agganciata dal mittente, non dal codice: controlla che sia
                        davvero per questa richiesta.
                      </span>
                    </div>
                  )}

                  {f.status === "risposta" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] text-slate-500">Consegna (gg)</Label>
                        <Input
                          type="number"
                          className="h-7 text-xs"
                          defaultValue={f.giorni_consegna ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v !== f.giorni_consegna) {
                              updateFornitore.mutate({ id: f.id, updates: { giorni_consegna: v } });
                            }
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-[10px] text-slate-500">Offerta valida fino</Label>
                        <Input
                          type="date"
                          className="h-7 text-xs"
                          defaultValue={f.validita_offerta ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v !== f.validita_offerta) {
                              updateFornitore.mutate({ id: f.id, updates: { validita_offerta: v } });
                            }
                          }}
                        />
                      </div>
                      {/* Offerta a corpo (o con trasporto/imballo): il totale
                          del documento, scritto a mano se non lo legge l'AI. */}
                      <div>
                        <Label className="text-[10px] text-slate-500">Totale offerto (€)</Label>
                        <Input
                          key={`${f.id}:${f.totale_offerto ?? ""}`}
                          type="number"
                          step="0.01"
                          className="h-7 text-xs"
                          disabled={chiusa}
                          defaultValue={f.totale_offerto ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            if (v !== (f.totale_offerto == null ? null : Number(f.totale_offerto))) {
                              updateFornitore.mutate({ id: f.id, updates: { totale_offerto: v } });
                            }
                          }}
                        />
                      </div>
                      {/* finisce nell'ordine fornitore all'aggiudicazione */}
                      <div>
                        <Label className="text-[10px] text-slate-500">Pagamento</Label>
                        <Input
                          className="h-7 text-xs"
                          disabled={chiusa}
                          placeholder="Es. 60 gg d.f."
                          defaultValue={f.condizioni_pagamento ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim() || null;
                            if (v !== f.condizioni_pagamento) {
                              updateFornitore.mutate({ id: f.id, updates: { condizioni_pagamento: v } });
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {!chiusa && f.status !== "risposta" && (
                      f.status === "da_inviare" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1"
                          onClick={() => {
                            if (items.length === 0) {
                              toast.error("Aggiungi almeno una voce prima di chiedere l'offerta");
                              return;
                            }
                            setInviaA(f);
                          }}
                        >
                          <Mail className="h-3 w-3 mr-1" /> Chiedi offerta
                        </Button>
                      ) : (
                        // chiesta: il passo dopo è registrare la risposta, comunque sia arrivata
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1"
                          disabled={registraOfferta.isPending}
                          onClick={() => registraOfferta.mutate(f)}
                        >
                          <Inbox className="h-3 w-3 mr-1" /> Ho l'offerta
                        </Button>
                      )
                    )}
                    {!chiusa && f.status !== "risposta" && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-500" aria-label="Altre azioni" title="Altre azioni">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {f.status === "da_inviare" ? (
                            <>
                              <DropdownMenuLabel className="text-xs">L'ho già chiesta io</DropdownMenuLabel>
                              {(["telefono", "whatsapp", "email", "di_persona"] as CanaleRichiesta[]).map((via) => (
                                <DropdownMenuItem key={via} onClick={() => segnaChiesta.mutate({ id: f.id, via })}>
                                  {via === "email" ? "Con la mia email" : `Per ${CANALE_RICHIESTA_LABELS[via]}`}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => registraOfferta.mutate(f)}>Ho già l'offerta</DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => {
                                if (items.length === 0) {
                                  toast.error("Aggiungi almeno una voce prima di chiedere l'offerta");
                                  return;
                                }
                                setInviaA(f);
                              }}
                            >
                              Sollecita per email
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => updateFornitore.mutate({ id: f.id, updates: { status: "rifiutata" } })}>
                            Non fa l'offerta
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {!chiusa && f.status === "risposta" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1"
                        onClick={() => setAggiudicaA(f)}
                      >
                        <Trophy className="h-3 w-3 mr-1" /> Scegli questo
                      </Button>
                    )}
                    {/* La lettura AI del preventivo: propone i prezzi nella
                        griglia, l'umano conferma. Sempre disponibile: anche chi
                        non ha l'email agganciata ha un PDF da caricare. */}
                    {!chiusa && <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-orange-500 hover:text-orange-600"
                      title="Leggi il preventivo con l'AI"
                      onClick={() => {
                        if (items.length === 0) {
                          toast.error("Aggiungi le voci della richiesta prima di leggere il preventivo");
                          return;
                        }
                        setEstraiDa(f);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </Button>}
                    {/* Il preventivo arrivato su WhatsApp o su carta: si allega
                        anche senza farlo leggere all'AI, e i prezzi si scrivono a mano. */}
                    {!chiusa && f.status === "risposta" && !f.allegato_url && (
                      <label
                        className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-500 hover:bg-accent hover:text-slate-700"
                        title="Allega l'offerta (PDF o foto)"
                      >
                        {allegaOfferta.isPending ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" /> : <Paperclip className="h-3.5 w-3.5" />}
                        <input
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) allegaOfferta.mutate({ id: f.id, file });
                          }}
                        />
                      </label>
                    )}
                    {/* Offerta originale (PDF letto dall'AI o allegato email):
                        il confronto si controlla sul documento, non a memoria. */}
                    {f.allegato_url && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-slate-500 hover:text-slate-700"
                        title="Apri l'offerta originale"
                        onClick={async () => {
                          const raw = f.allegato_url!;
                          if (/^https?:\/\//.test(raw)) { window.open(raw, "_blank"); return; }
                          const slash = raw.indexOf("/");
                          const { data, error } = await supabase.storage
                            .from(raw.slice(0, slash))
                            .createSignedUrl(raw.slice(slash + 1), 600);
                          if (error || !data?.signedUrl) {
                            toast.error("Non riesco ad aprire l'allegato dell'offerta");
                            return;
                          }
                          window.open(data.signedUrl, "_blank");
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {modificabile && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFornitore.mutate(f.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {!chiusa && (
                <div className="flex gap-2 pt-1">
                  <Select value={nuovoFornitore} onValueChange={setNuovoFornitore}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Aggiungi fornitore" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers
                        .filter((s) => s.is_active && !fornitori.some((f) => f.supplier_id === s.id))
                        .map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!nuovoFornitore || addFornitore.isPending}
                    onClick={() => {
                      addFornitore.mutate(nuovoFornitore, { onSuccess: () => setNuovoFornitore("") });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </QuoteCard>

          {rfq.status === "aggiudicata" && (
            <QuoteCard title="Aggiudicata" icon={<CheckCircle2 className="h-4 w-4" />}>
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">
                  Il {dataIt(rfq.aggiudicata_at)}, fornitore scelto:{" "}
                  <strong>
                    {fornitori.find((f) => f.supplier_id === rfq.supplier_id_aggiudicato)?.suppliers?.name ?? "—"}
                  </strong>
                </p>
                {rfq.motivazione_scelta && (
                  <p className="text-xs text-slate-500 italic">{rfq.motivazione_scelta}</p>
                )}
                {rfq.purchase_order_id && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => navigate(`/azienda/ordini-acquisto/${rfq.purchase_order_id}`)}
                  >
                    Apri l'ordine generato <ExternalLink className="h-3 w-3 ml-1.5" />
                  </Button>
                )}
              </div>
            </QuoteCard>
          )}
        </div>
      </div>

      {/* Invio al singolo fornitore: stesso compositore del resto dell'app. */}
      {inviaA && (
        <EmailComposeDialog
          open={!!inviaA}
          onOpenChange={(o) => { if (!o) setInviaA(null); }}
          context={composeContext(inviaA)}
          onSent={() => {
            updateFornitore.mutate({
              id: inviaA.id,
              // un sollecito non azzera l'attesa: conta dalla prima richiesta
              updates: inviaA.inviata_at
                ? { status: "inviata" }
                : { status: "inviata", inviata_at: new Date().toISOString(), inviata_via: "app" },
            });
            if (rfq.status === "bozza") updateRfq.mutate({ status: "inviata" });
          }}
        />
      )}

      {/* Lettura AI del preventivo fornitore */}
      {estraiDa && (
        <EstraiOffertaAIDialog
          open={!!estraiDa}
          onOpenChange={(o) => { if (!o) setEstraiDa(null); }}
          rfqSupplierId={estraiDa.id}
          fornitoreNome={estraiDa.suppliers?.name ?? "Fornitore"}
          haEmailAgganciata={!!estraiDa.email_inbox_id}
          onApplica={async (righe: RigaEstratta[], meta: PropostaEstratta) => {
            // I prezzi scelti finiscono nella griglia, riga per riga.
            for (const r of righe) {
              if (!r.rfq_item_id) continue;
              await setQuote.mutateAsync({
                rfq_supplier_id: estraiDa.id,
                rfq_item_id: r.rfq_item_id,
                updates: {
                  prezzo_unitario: r.prezzo_unitario,
                  sconto_percentuale: r.sconto_percentuale,
                  aliquota_iva: r.aliquota_iva,
                  disponibile: r.disponibile,
                  note: r.nota,
                },
              });
            }
            // Consegna/validita'/pagamento: si compilano solo se vuoti, per non
            // sovrascrivere quello che qualcuno ha gia' scritto a mano.
            const updates: Record<string, unknown> = {};
            if (meta.giorni_consegna != null && estraiDa.giorni_consegna == null) updates.giorni_consegna = meta.giorni_consegna;
            if (meta.validita_offerta && !estraiDa.validita_offerta) updates.validita_offerta = meta.validita_offerta;
            if (meta.condizioni_pagamento && !estraiDa.condizioni_pagamento) updates.condizioni_pagamento = meta.condizioni_pagamento;
            if (meta.totale_documento != null && estraiDa.totale_offerto == null) updates.totale_offerto = meta.totale_documento;
            if (estraiDa.status === "inviata" || estraiDa.status === "da_inviare") {
              updates.status = "risposta";
              updates.risposta_at = new Date().toISOString();
            }
            if (Object.keys(updates).length > 0) {
              await updateFornitore.mutateAsync({ id: estraiDa.id, updates });
            }
          }}
        />
      )}

      {/* Aggiudicazione */}
      <Dialog open={!!aggiudicaA} onOpenChange={(o) => { if (!o) { setAggiudicaA(null); setMotivazione(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-orange-500" />
              Aggiudica a {aggiudicaA?.suppliers?.name}
            </DialogTitle>
            <DialogDescription>
              Nasce un ordine d'acquisto in bozza con i prezzi che ha offerto. Da lì in poi
              si lavora sull'ordine.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {aggiudicaA && totaliPerFornitore[aggiudicaA.id]?.totale != null && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-slate-500">Totale offerto</span>
                <span className="font-bold text-slate-900">
                  {formatCurrency(totaliPerFornitore[aggiudicaA.id].totale as number)}
                </span>
              </div>
            )}
            {aggiudicaA && (totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0) < items.length && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Ha quotato {totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0} {(totaliPerFornitore[aggiudicaA.id]?.righeCoperte ?? 0) === 1 ? "voce" : "voci"} su {items.length}: nell'ordine
                  entrano solo quelle, le altre vanno ordinate a parte.
                </span>
              </div>
            )}
            {aggiudicaA && !((totaliPerFornitore[aggiudicaA.id]?.totale ?? 0) > 0) && (
              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
                <span>
                  Non c'è nessun prezzo: scrivi i prezzi delle voci o il totale offerto prima di
                  scegliere. Un ordine da 0 € chiuderebbe la richiesta senza costo in commessa.
                </span>
              </div>
            )}
            {aggiudicaA && (() => {
              const doc = aggiudicaA.totale_offerto == null ? null : Number(aggiudicaA.totale_offerto);
              const righe = totaliPerFornitore[aggiudicaA.id];
              const daRighe = righe && righe.righeCoperte > 0 && doc != null && righe.totale != null && righe.totale !== doc ? righe.totale : null;
              if (doc == null || daRighe == null || doc - daRighe < 0.01) return null;
              return (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Il documento dice {formatCurrency(doc)}, le voci {formatCurrency(daRighe)}: la differenza
                    ({formatCurrency(doc - daRighe)}, trasporto o imballo) non entra nell'ordine. Aggiungila lì come riga.
                  </span>
                </div>
              );
            })()}
            {aggiudicaA && miglioreTotale && aggiudicaA.id !== miglioreTotale && (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Non è l'offerta più bassa. Se scegli comunque questo fornitore, scrivi
                  perché: fra sei mesi nessuno se lo ricorderà.
                </span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rdo-motivo">Perché questo fornitore (facoltativo)</Label>
              <Textarea
                id="rdo-motivo"
                rows={2}
                value={motivazione}
                onChange={(e) => setMotivazione(e.target.value)}
                placeholder="Es. consegna in 3 giorni contro 15, ci serve per lunedì."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAggiudicaA(null)}>Annulla</Button>
            <Button
              disabled={aggiudica.isPending || !aggiudicaA || !((totaliPerFornitore[aggiudicaA.id]?.totale ?? 0) > 0)}
              onClick={() => {
                if (!aggiudicaA || aggiudicaInCorso.current) return;
                aggiudicaInCorso.current = true;
                aggiudica.mutate(
                  { rfq_supplier_id: aggiudicaA.id, motivazione: motivazione.trim() || undefined },
                  {
                    onSettled: () => { aggiudicaInCorso.current = false; },
                    onSuccess: (r) => {
                      setAggiudicaA(null);
                      setMotivazione("");
                      navigate(`/azienda/ordini-acquisto/${r.purchaseOrderId}`);
                    },
                  },
                );
              }}
            >
              <Send className="h-4 w-4 mr-1.5" />
              {aggiudica.isPending ? "Creazione ordine..." : "Aggiudica e crea ordine"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

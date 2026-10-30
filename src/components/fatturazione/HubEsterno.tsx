import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, CreditCard, FileText, Inbox, Search, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { getScadenzaInfo } from "@/lib/fatturazione/filtriDocumenti";
import { cn } from "@/lib/utils";
import type { DocumentoFiscale } from "@/types/fatturazione";
import { PROVIDER_LABELS, SegnaPagataImportataDialog, residuoImportata, useIntegrazioneFatture } from "./GestionaleEsterno";

/**
 * Le schede dell'hub fatture per chi fattura con un altro programma, quando il dato
 * nativo non c'è: i clienti e gli incassi vengono dalle fatture importate, il cassetto
 * SDI lo tiene il gestionale. Stessa struttura delle schede native, niente creazione.
 */

interface ClienteImportato {
  chiave: string;
  ragione_sociale: string | null;
  partita_iva: string | null;
  codice_fiscale: string | null;
  comune: string | null;
  fatture: number;
  note_credito: number;
  fatturato: number;
  residuo_lordo: number;
  ultima_fattura: string | null;
}

const PER_PAGINA = 30;

/** Clienti fiscali di chi importa: uno per P.IVA (poi CF, poi nome), con fatturato e residuo. */
export function ClientiFiscaliImportatiTable() {
  const companyId = useEffectiveCompanyId();
  const navigate = useNavigate();
  const [cerca, setCerca] = useState("");
  const [pagina, setPagina] = useState(0);

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["clienti-fiscali-importati", companyId],
    enabled: !!companyId,
    queryFn: async () => (await tutteLePagine((from, to) => supabase
      .from("clienti_fiscali_importati" as never)
      .select("chiave, ragione_sociale, partita_iva, codice_fiscale, comune, fatture, note_credito, fatturato, residuo_lordo, ultima_fattura")
      .eq("company_id", companyId!)
      .order("fatturato", { ascending: false })
      .order("chiave", { ascending: true })
      .range(from, to))) as unknown as ClienteImportato[],
  });

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) => [c.ragione_sociale, c.partita_iva, c.codice_fiscale, c.comune].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [data, cerca]);
  const pagine = Math.max(1, Math.ceil(filtrati.length / PER_PAGINA));
  const visibili = filtrati.slice(pagina * PER_PAGINA, pagina * PER_PAGINA + PER_PAGINA);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={cerca} onChange={(e) => { setCerca(e.target.value); setPagina(0); }} placeholder="Cerca nome, P.IVA, CF…" aria-label="Cerca clienti fiscali" className="h-9 pl-8" />
        </div>
        <p className="text-xs text-muted-foreground">Dalle fatture importate dal tuo gestionale: si aggiornano a ogni sincronizzazione.</p>
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
      ) : isError ? (
        <div role="alert" className="flex items-center gap-3 rounded-xl border p-4 text-sm">
          Clienti non disponibili adesso.
          <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
        </div>
      ) : filtrati.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {cerca ? "Nessun cliente con questa ricerca." : "Nessun cliente: compariranno con le prime fatture importate."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">Cliente</th>
                <th className="p-3 text-left font-medium">P.IVA / CF</th>
                <th className="p-3 text-right font-medium">Fatturato</th>
                <th className="p-3 text-right font-medium">Da incassare</th>
                <th className="p-3 text-right font-medium">N. fatture</th>
                <th className="p-3 text-left font-medium">Ultima fattura</th>
              </tr>
            </thead>
            <tbody>
              {visibili.map((c) => (
                <tr
                  key={c.chiave}
                  className="cursor-pointer border-b hover:bg-muted/30"
                  title="Vedi le sue fatture"
                  onClick={() => navigate(`/azienda/documenti?cerca=${encodeURIComponent(c.partita_iva ?? c.codice_fiscale ?? c.ragione_sociale ?? "")}`)}
                >
                  <td className="p-3">
                    <div className="font-medium">{c.ragione_sociale ?? "—"}</div>
                    {c.comune && <div className="text-xs text-muted-foreground">{c.comune}</div>}
                  </td>
                  <td className="p-3 font-mono text-xs">{c.partita_iva ?? c.codice_fiscale ?? "—"}</td>
                  <td className="p-3 text-right tabular-nums">{formatCurrency(Number(c.fatturato))}</td>
                  <td className={cn("p-3 text-right tabular-nums", Number(c.residuo_lordo) > 0 && "font-medium text-amber-700")}>{Number(c.residuo_lordo) > 0 ? formatCurrency(Number(c.residuo_lordo)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{c.fatture}{c.note_credito > 0 && <span className="text-xs text-muted-foreground"> + {c.note_credito} NC</span>}</td>
                  <td className="p-3 text-xs">{c.ultima_fattura ? formatDateShort(c.ultima_fattura) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagine > 1 && (
            <div className="flex items-center justify-between border-t p-3 text-xs text-muted-foreground">
              <span>{filtrati.length} clienti · pagina {pagina + 1} di {pagine}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Indietro</Button>
                <Button variant="outline" size="sm" disabled={pagina >= pagine - 1} onClick={() => setPagina(pagina + 1)}>Avanti</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface IncassoImportato {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  invoices: { invoice_number: string | null; client_company_name: string | null } | null;
}

const METODO_LABEL: Record<string, string> = { bank_transfer: "Bonifico", bonifico: "Bonifico", cash: "Contanti", card: "Carta", check: "Assegno", riba: "RiBa", other: "Altro" };

/** Registro incassi di chi importa: cosa resta da incassare e gli incassi registrati. */
export function RegistroIncassiImportate() {
  const companyId = useEffectiveCompanyId();
  const [daSegnare, setDaSegnare] = useState<DocumentoFiscale | null>(null);
  const anno = new Date().getFullYear();

  const aperte = useQuery({
    queryKey: ["incassi-importate", "aperte", companyId],
    enabled: !!companyId,
    queryFn: async () => (await tutteLePagine((from, to) => supabase
      .from("documenti_fiscali_elenco_con_importate" as never)
      .select("id, company_id, origine, external_provider, tipo, numero, data_emissione, data_scadenza, cliente_snapshot, elenco_cliente, stato, totale_documento, totale_da_pagare, importo_pagato, deleted_at")
      .eq("company_id", companyId!)
      .eq("origine", "importata")
      .is("deleted_at", null)
      .in("stato", ["emessa", "parzialmente_pagata"])
      .not("tipo", "in", "(nota_credito,proforma)")
      .order("data_scadenza", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to))) as unknown as (DocumentoFiscale & { elenco_cliente: string | null })[],
  });

  const incassi = useQuery({
    queryKey: ["incassi-importate", "registrati", companyId, anno],
    enabled: !!companyId,
    queryFn: async () => (await tutteLePagine((from, to) => supabase
      .from("invoice_payments")
      .select("id, amount, payment_date, payment_method, invoices(invoice_number, client_company_name)")
      .eq("company_id", companyId!)
      .gte("payment_date", `${anno}-01-01`)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to))) as unknown as IncassoImportato[],
  });

  const daIncassare = useMemo(() => (aperte.data ?? []).filter((d) => residuoImportata(d) > 0), [aperte.data]);
  const kpi = useMemo(() => {
    let residuo = 0, scaduto = 0;
    for (const d of daIncassare) {
      const r = residuoImportata(d);
      residuo += r;
      if (getScadenzaInfo(d)?.scaduta) scaduto += r;
    }
    const incassato = (incassi.data ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
    return { residuo, scaduto, incassato };
  }, [daIncassare, incassi.data]);

  return (
    <div className="space-y-4 max-sm:space-y-3">
      <div className="grid grid-cols-3 gap-3 max-sm:gap-2">
        {[
          { label: `Incassato ${anno}`, valore: kpi.incassato, tono: "text-emerald-700" },
          { label: "Da incassare", valore: kpi.residuo, tono: "text-slate-900" },
          { label: "Scaduto", valore: kpi.scaduto, tono: kpi.scaduto > 0 ? "text-destructive" : "text-slate-900" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 max-sm:p-2.5">
            <p className="text-xs text-muted-foreground max-sm:text-[11px]">{k.label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums max-sm:text-sm", k.tono)}>{formatCurrency(k.valore)}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-3 max-sm:px-3 max-sm:py-2">
          <Wallet className="h-4 w-4 text-muted-foreground max-sm:hidden" />
          <h2 className="text-sm font-semibold">Da incassare</h2>
          <span className="text-xs text-muted-foreground">{daIncassare.length}</span>
        </header>
        {aperte.isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : aperte.isError ? (
          <p className="p-4 text-sm text-destructive">Non riesco a caricare le fatture aperte. Riprova tra poco.</p>
        ) : daIncassare.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nessuna fattura da incassare.</p>
        ) : (
          <ul className="divide-y">
            {daIncassare.map((d) => {
              const scad = getScadenzaInfo(d);
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 max-sm:gap-2 max-sm:px-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium max-sm:text-[13px]">{d.elenco_cliente ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground max-sm:text-[11px]">
                      {d.numero} · {formatDateShort(d.data_emissione)}
                      {scad?.scaduta && <span className="font-medium text-destructive"> · scaduta da {scad.giorni} gg</span>}
                      {scad && !scad.scaduta && scad.urgente && <span className="text-amber-600"> · scade in {scad.giorni} gg</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm font-semibold tabular-nums max-sm:text-[13px]">{formatCurrency(residuoImportata(d))}</div>
                  <Button variant="outline" size="sm" className="shrink-0 gap-1.5 max-sm:h-8 max-sm:w-8 max-sm:px-0" aria-label={`Registra incasso fattura ${d.numero}`} onClick={() => setDaSegnare(d)}>
                    <CreditCard className="h-4 w-4" /><span className="max-sm:hidden">Incassa</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card">
        <header className="flex items-center gap-2 border-b px-4 py-3 max-sm:px-3 max-sm:py-2">
          <h2 className="text-sm font-semibold">Incassi registrati nel {anno}</h2>
          <span className="text-xs text-muted-foreground">{incassi.data?.length ?? 0}</span>
        </header>
        {incassi.isLoading ? (
          <div className="space-y-2 p-4"><Skeleton className="h-10" /></div>
        ) : incassi.isError ? (
          <p className="p-4 text-sm text-destructive">Non riesco a caricare gli incassi. Riprova tra poco.</p>
        ) : (incassi.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">Nessun incasso registrato quest'anno in Edilizia in Cloud. Le fatture segnate pagate nel gestionale risultano già «Pagata» nell'elenco.</p>
        ) : (
          <ul className="divide-y">
            {(incassi.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 max-sm:px-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium max-sm:text-[13px]">{p.invoices?.client_company_name ?? "—"}</div>
                  <div className="truncate text-xs text-muted-foreground max-sm:text-[11px]">
                    {p.invoices?.invoice_number ?? "—"} · {formatDateShort(p.payment_date)} · {METODO_LABEL[p.payment_method ?? ""] ?? p.payment_method ?? "—"}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 max-sm:text-[13px]">{formatCurrency(Number(p.amount))}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {companyId && <SegnaPagataImportataDialog fattura={daSegnare} companyId={companyId} onClose={() => setDaSegnare(null)} />}
    </div>
  );
}

/** Il cassetto SDI di chi fattura con un altro programma: gli invii li fa il gestionale. */
export function CassettoSdiEsterno() {
  const companyId = useEffectiveCompanyId();
  const { data: integration } = useIntegrazioneFatture(companyId);
  const gestionale = integration ? (PROVIDER_LABELS[integration.provider] ?? integration.provider) : "il tuo gestionale";
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Archive className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight tracking-tight text-slate-900">Cassetto SDI</h1>
            <p className="mt-1 text-sm text-slate-500">
              Le fatture le trasmette allo SDI {gestionale}: invii, ricevute e scarti si controllano lì.
              Qui arrivano le fatture già emesse e quelle dei fornitori.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link to="/azienda/documenti" className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40">
          <FileText className="h-5 w-5 text-orange-500" />
          <div><p className="text-sm font-semibold">Fatture emesse</p><p className="text-xs text-muted-foreground">Importate da {gestionale}</p></div>
        </Link>
        <Link to="/azienda/documenti/fatture-ricevute" className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:bg-muted/40">
          <Inbox className="h-5 w-5 text-sky-600" />
          <div><p className="text-sm font-semibold">Fatture ricevute</p><p className="text-xs text-muted-foreground">Dai fornitori, con l'XML originale</p></div>
        </Link>
      </div>
    </div>
  );
}

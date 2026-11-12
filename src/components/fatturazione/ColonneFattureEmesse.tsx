import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Columns3, MessageSquare, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableHead } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FaseSdiBadge } from "./FaseSdiBadge";
import { AllegatiFattura } from "./AllegatiFattura";
import { StatoBadge } from "./StatoBadge";
import { nomeCliente } from "@/lib/fatturazione/clienteSnapshot";
import { getScadenzaInfo } from "@/lib/fatturazione/filtriDocumenti";
import { creditoCliente, residuoDaIncassare } from "@/lib/fatturazione/incassi";
import { faseSdi } from "@/lib/fatturazione/sdiCassetto";
import { etichettaModalitaPagamento } from "@/lib/fatturazione/pagamentoFatturaRicevuta";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import type { DocumentoFiscale } from "@/types/fatturazione";

export const COLONNE_EMESSE = [
  { id: "cliente", label: "Cliente", fissa: true },
  { id: "numero", label: "Numero", fissa: true },
  { id: "data", label: "Emessa il" },
  { id: "imponibile", label: "Imponibile", cifra: true },
  { id: "iva", label: "IVA", cifra: true, opzionale: true },
  { id: "totale", label: "Totale", cifra: true },
  { id: "netto", label: "Netto a pagare", cifra: true },
  { id: "stato", label: "Stato documento", opzionale: true },
  { id: "sdi", label: "SDI" },
  { id: "incasso", label: "Incasso" },
  { id: "incassato", label: "Incassato", cifra: true },
  { id: "residuo", label: "Residuo", cifra: true },
  { id: "modalita", label: "Modalità", opzionale: true },
  { id: "scadenza", label: "Prossima scadenza" },
  { id: "commesse", label: "Collegata a" },
  { id: "note", label: "Note" },
  { id: "allegati", label: "Allegati" },
  { id: "origine", label: "Origine", opzionale: true },
] as const;
export type ColonnaEmesse = typeof COLONNE_EMESSE[number]["id"];
const predefinite = () => COLONNE_EMESSE.filter(c => !("opzionale" in c)).map(c => c.id);

/** Preferenza distinta dalle ricevute, per persona e azienda, tollerante a storage bloccato. */
export function useColonneEmesse(companyId?: string, userId?: string) {
  const key = `fatture-emesse-colonne-v1:${userId ?? "sessione"}:${companyId ?? "nessuna"}`;
  const iniziali = useMemo(() => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (Array.isArray(v)) return COLONNE_EMESSE.filter(c => ("fissa" in c) || v.includes(c.id)).map(c => c.id);
    } catch { /* preferenze facoltative */ }
    return predefinite();
  }, [key]);
  const [scelta, setScelta] = useState<{ key: string; colonne: ColonnaEmesse[] } | null>(null);
  const colonne = scelta?.key === key ? scelta.colonne : iniziali;
  const cambia = (id: ColonnaEmesse) => {
    const nuove = colonne.includes(id) ? colonne.filter(c => c !== id) : [...colonne, id];
    setScelta({ key, colonne: nuove });
    try { localStorage.setItem(key, JSON.stringify(nuove)); } catch { /* resta valida nella sessione */ }
  };
  return { colonne, cambia };
}

export function SceltaColonneEmesse({ colonne, cambia }: ReturnType<typeof useColonneEmesse>) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="gap-1.5"><Columns3 className="h-4 w-4" />Colonne</Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
      <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
      {COLONNE_EMESSE.map(c => <DropdownMenuCheckboxItem key={c.id} checked={colonne.includes(c.id)} disabled={"fissa" in c}
        onSelect={e => e.preventDefault()} onCheckedChange={() => cambia(c.id)}>{c.label}</DropdownMenuCheckboxItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function IntestazioniEmesse({ colonne }: { colonne: ColonnaEmesse[] }) {
  return <>{COLONNE_EMESSE.filter(c => colonne.includes(c.id)).map(c => <TableHead key={c.id}
    className={`whitespace-nowrap ${"cifra" in c ? "text-right" : ""} ${c.id === "cliente" ? "sticky left-0 z-10 bg-card min-w-[210px]" : ""}`}>{c.label}</TableHead>)}</>;
}

export function NoteEmessa({ doc }: { doc: DocumentoFiscale }) {
  const nota = doc.note_interne?.trim() || doc.note_documento?.trim();
  if (!nota) return <span className="text-muted-foreground">—</span>;
  return <Popover><PopoverTrigger asChild>
    <button type="button" onClick={e => e.stopPropagation()} aria-label={`Leggi le note della fattura ${doc.numero}`}
      className="flex max-w-[220px] items-center gap-1.5 text-left text-xs hover:text-primary">
      <MessageSquare className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{nota}</span>
    </button>
  </PopoverTrigger><PopoverContent className="w-96 max-w-[90vw] max-h-[60vh] overflow-y-auto text-sm" onClick={e => e.stopPropagation()}>
    {doc.note_documento?.trim() && <section><h3 className="mb-1 font-semibold">Note del documento</h3><p className="whitespace-pre-wrap break-words">{doc.note_documento}</p></section>}
    {doc.note_interne?.trim() && <section className={doc.note_documento?.trim() ? "mt-4 border-t pt-3" : ""}><h3 className="mb-1 font-semibold">Note interne · solo azienda</h3><p className="whitespace-pre-wrap break-words">{doc.note_interne}</p></section>}
  </PopoverContent></Popover>;
}

function CommesseEmessa({ doc }: { doc: DocumentoFiscale }) {
  const commesse = doc.commesse ?? [];
  if (!commesse.length) return <span className="text-muted-foreground">—</span>;
  return <Popover><PopoverTrigger asChild><button type="button" className="flex max-w-[210px] items-center gap-1 text-xs" onClick={e => e.stopPropagation()} aria-label={`Commesse della fattura ${doc.numero}`}>
    <Badge variant="outline" className="max-w-[175px] truncate inline-block">{commesse[0].codice || "Commessa"}</Badge>{commesse.length > 1 && <span>+{commesse.length - 1}</span>}
  </button></PopoverTrigger><PopoverContent onClick={e => e.stopPropagation()} className="max-h-[60vh] overflow-y-auto">
    <p className="mb-2 text-sm font-semibold">Commesse collegate</p>
    {commesse.map(c => <Link key={c.id} to={`/azienda/ordini/${c.id}`} className="block rounded p-2 text-sm hover:bg-muted"><strong>{c.codice || "Commessa"}</strong><span className="mt-1 block text-xs text-muted-foreground">{c.descrizione}</span></Link>)}
  </PopoverContent></Popover>;
}

function IncassoEmessa({ doc }: { doc: DocumentoFiscale }) {
  if (["bozza", "annullata", "stornata"].includes(doc.stato)) return <StatoBadge stato={doc.stato} />;
  const residuo = residuoDaIncassare(doc);
  const label = residuo <= 0 ? "Incassata" : doc.importo_pagato > 0 ? "Parz. incassata" : "Da incassare";
  return <Badge variant="outline" className={residuo <= 0 ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-amber-700 border-amber-200 bg-amber-50"}>{label}</Badge>;
}

function AllegatiEmessa({ doc, apri }: { doc: DocumentoFiscale; apri: () => void }) {
  return <Popover><PopoverTrigger asChild>
    <button type="button" className="inline-flex items-center gap-1 text-xs hover:text-primary" onClick={e => e.stopPropagation()} aria-label={`Apri gli allegati della fattura ${doc.numero}`}><Paperclip className="h-3.5 w-3.5" />{doc.elenco_allegati ?? doc.allegati?.length ?? 0}</button>
  </PopoverTrigger><PopoverContent className="w-[520px] max-w-[90vw] max-h-[65vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
    {/* Il componente esistente si monta solo aprendo la cella: nessuna query per riga. */}
    <AllegatiFattura companyId={doc.company_id} madre={doc.origine === "importata" ? { invoiceId: doc.id } : { documentoFiscaleId: doc.id }} sola_lettura />
    {!!doc.allegati?.length && <p className="mt-3 text-xs text-muted-foreground">Altri allegati incorporati sono disponibili nel documento.</p>}
    <Button variant="link" size="sm" className="mt-2 px-0" onClick={apri}>Apri il dettaglio della fattura</Button>
  </PopoverContent></Popover>;
}

export function CelleEmesse({ doc, colonne, apri }: { doc: DocumentoFiscale; colonne: ColonnaEmesse[]; apri: () => void }) {
  const dataScadenza = doc.elenco_prossima_scadenza === undefined ? doc.data_scadenza : doc.elenco_prossima_scadenza ?? undefined;
  const scadenza = getScadenzaInfo({ ...doc, data_scadenza: dataScadenza });
  const cliente = nomeCliente(doc.cliente_snapshot as never) || "—";
  const credito = creditoCliente(doc);
  const valori: Record<ColonnaEmesse, React.ReactNode> = {
    cliente: <span className="block max-w-[230px] truncate font-medium" title={cliente}>{cliente}</span>,
    numero: <button type="button" onClick={e => { e.stopPropagation(); apri(); }} className="block max-w-[200px] truncate font-mono text-xs hover:underline" title={doc.numero}>{doc.numero || "Bozza senza numero"}</button>,
    data: formatDateShort(doc.data_emissione),
    imponibile: formatCurrency(doc.imponibile_totale), iva: formatCurrency(doc.iva_totale),
    totale: formatCurrency(doc.totale_documento), netto: formatCurrency(doc.totale_da_pagare),
    stato: <StatoBadge stato={doc.stato} />,
    sdi: doc.origine === "importata" ? <Badge variant="outline" title="Esito SDI non disponibile nell'importazione. Verifica nel gestionale di origine.">Gestita esternamente</Badge> : faseSdi(doc) ? <FaseSdiBadge doc={doc} /> : "—",
    incasso: <IncassoEmessa doc={doc} />,
    incassato: formatCurrency(doc.importo_pagato),
    residuo: credito > 0 ? <span title="Credito del cliente, da rimborsare o compensare">Credito {formatCurrency(credito)}</span> : formatCurrency(Math.max(0, residuoDaIncassare(doc))),
    modalita: etichettaModalitaPagamento(doc.metodo_pagamento_nome || doc.metodo_pagamento_codice) || "—",
    scadenza: scadenza && dataScadenza ? <span className={scadenza.scaduta ? "text-destructive font-medium" : scadenza.urgente ? "text-amber-700" : ""}
      title={scadenza.scaduta ? `Scaduta da ${scadenza.giorni} giorni` : `Scade fra ${scadenza.giorni} giorni`}>{formatDateShort(dataScadenza)}{scadenza.scaduta && ` · ${scadenza.giorni} gg fa`}</span> : "—",
    commesse: <CommesseEmessa doc={doc} />, note: <NoteEmessa doc={doc} />,
    allegati: <AllegatiEmessa doc={doc} apri={apri} />,
    origine: doc.origine === "importata" ? (doc.external_provider || "Importata") : "Edilizia in Cloud",
  };
  return <>{COLONNE_EMESSE.filter(c => colonne.includes(c.id)).map(c => <TableCell key={c.id}
    className={`whitespace-nowrap py-3 ${"cifra" in c ? "text-right tabular-nums" : ""} ${c.id === "cliente" ? "sticky left-0 z-[1] bg-card" : ""}`}>{valori[c.id]}</TableCell>)}</>;
}

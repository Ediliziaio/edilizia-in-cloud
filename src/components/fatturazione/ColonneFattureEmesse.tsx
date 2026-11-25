import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpDown, Columns3, MessageSquare, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableHead } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export const COLONNE_EMESSE = [
  // Numero e cliente in due colonne (15/11/2026, richiesta del titolare), entrambe ferme a
  // sinistra: scorrendo a destra si sa sempre di quale fattura si parla.
  { id: "numero", label: "Numero", fissa: true },
  { id: "cliente", label: "Cliente", fissa: true },
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
  { id: "note_interne", label: "Note interne" },
  { id: "allegati", label: "Allegati" },
  { id: "origine", label: "Origine", opzionale: true },
] as const;
export type ColonnaEmesse = typeof COLONNE_EMESSE[number]["id"];
const predefinite = () => COLONNE_EMESSE.filter(c => !("opzionale" in c)).map(c => c.id);

/** Preferenza distinta dalle ricevute, per persona e azienda, tollerante a storage bloccato. */
export function useColonneEmesse(companyId?: string, userId?: string) {
  const oldKey = `fatture-emesse-colonne-v1:${userId ?? "sessione"}:${companyId ?? "nessuna"}`;
  const key=oldKey.replace("-v1:","-v2:");
  const iniziali = useMemo(() => {
    try {
      let saved=localStorage.getItem(key);
      if(saved===null){const old=JSON.parse(localStorage.getItem(oldKey)??"null");if(Array.isArray(old)){saved=JSON.stringify([...old,"note_interne"]);localStorage.setItem(key,saved);}}
      const v: unknown = JSON.parse(saved ?? "null");
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

/** Colonne visibili e, se passato, l'ordinamento: stanno in un solo menu così la barra dei filtri
 *  resta su una riga anche a 1280px (25/11/2026, come in Commesse). */
export function SceltaColonneEmesse({ colonne, cambia, ordinamento }: ReturnType<typeof useColonneEmesse> & {
  ordinamento?: { valore: string; cambia: (v: string) => void; voci: { value: string; label: string }[] };
}) {
  const t = useT();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" title={ordinamento ? `${t("Ordina per")} · ${t("Colonne visibili")}` : undefined}>
      {ordinamento && <ArrowUpDown className="h-3.5 w-3.5" />}<Columns3 className="h-3.5 w-3.5" /><span className={ordinamento ? "max-2xl:sr-only" : undefined}>{t("Colonne")}</span>
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="max-h-[70vh] overflow-y-auto">
      {ordinamento && <>
        <DropdownMenuLabel>{t("Ordina per")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={ordinamento.valore} onValueChange={ordinamento.cambia}>
          {ordinamento.voci.map(v => <DropdownMenuRadioItem key={v.value} value={v.value}>{t(v.label)}</DropdownMenuRadioItem>)}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
      </>}
      <DropdownMenuLabel>{t("Colonne visibili")}</DropdownMenuLabel>
      {COLONNE_EMESSE.map(c => <DropdownMenuCheckboxItem key={c.id} checked={colonne.includes(c.id)} disabled={"fissa" in c}
        onSelect={e => e.preventDefault()} onCheckedChange={() => cambia(c.id)}>{t(c.label)}</DropdownMenuCheckboxItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** La casella di selezione è larga 2.5rem e ferma a sinistra: la colonna della fattura le sta accanto. */
export const STICKY_SELEZIONE = "sticky left-0 w-10 min-w-10 max-w-10";
const STICKY_NUMERO = "sticky left-10 w-[150px] min-w-[150px] max-w-[150px]";
/** Il cliente sta subito dopo il numero (2.5rem della casella + 150px del numero). */
const STICKY_CLIENTE = "sticky left-[calc(2.5rem+150px)] min-w-[200px] max-w-[280px] shadow-[1px_0_0_hsl(var(--border))]";
const FISSA: Partial<Record<ColonnaEmesse, string>> = { numero: STICKY_NUMERO, cliente: STICKY_CLIENTE };

export function IntestazioniEmesse({ colonne }: { colonne: ColonnaEmesse[] }) {
  const t = useT();
  return <>{COLONNE_EMESSE.filter(c => colonne.includes(c.id)).map(c => <TableHead key={c.id}
    className={`whitespace-nowrap ${"cifra" in c ? "text-right" : ""} ${FISSA[c.id] ? `${FISSA[c.id]} z-20 bg-card` : ""}`}>{t(c.label)}</TableHead>)}</>;
}

export function NoteEmessa({ doc, interne=false }: { doc: DocumentoFiscale; interne?:boolean }) {
  const t = useT();
  const nota = (interne?doc.note_interne:doc.note_documento)?.trim();
  if (!nota) return <span className="text-muted-foreground">—</span>;
  return <Popover><PopoverTrigger asChild>
    <button type="button" onClick={e => e.stopPropagation()} aria-label={interne ? t("Leggi le note interne della fattura {numero}", { numero: doc.numero ?? "" }) : t("Leggi le note della fattura {numero}", { numero: doc.numero ?? "" })}
      className="flex max-w-[220px] items-center gap-1.5 text-left text-xs hover:text-primary">
      <MessageSquare className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{nota}</span>
    </button>
  </PopoverTrigger><PopoverContent className="w-96 max-w-[90vw] max-h-[60vh] overflow-y-auto text-sm" onClick={e => e.stopPropagation()}>
    <section><h3 className="mb-1 font-semibold">{interne?t("Note interne · solo azienda"):t("Note del documento")}</h3><p className="whitespace-pre-wrap break-words">{nota}</p></section>
  </PopoverContent></Popover>;
}

function CommesseEmessa({ doc, collega }: { doc: DocumentoFiscale; collega?:()=>void }) {
  const t = useT();
  const commesse = doc.commesse ?? [];
  if (!commesse.length) return collega?<button type="button" onClick={e=>{e.stopPropagation();collega();}} className="text-xs text-primary hover:underline" aria-label={t("Collega la fattura {numero} a una commessa", { numero: doc.numero ?? "" })}>{t("Collega")}</button>:<span className="text-muted-foreground">—</span>;
  return <Popover><PopoverTrigger asChild><button type="button" className="flex max-w-[210px] items-center gap-1 text-xs" onClick={e => e.stopPropagation()} aria-label={t("Commesse della fattura {numero}", { numero: doc.numero ?? "" })}>
    <Badge variant="outline" className="max-w-[175px] truncate inline-block">{commesse[0].codice || t("Commessa")}</Badge>{commesse.length > 1 && <span>+{commesse.length - 1}</span>}
  </button></PopoverTrigger><PopoverContent onClick={e => e.stopPropagation()} className="max-h-[60vh] overflow-y-auto">
    <p className="mb-2 text-sm font-semibold">{t("Commesse collegate")}</p>
    {commesse.map(c => <Link key={c.id} to={`/azienda/ordini/${c.id}`} className="block rounded p-2 text-sm hover:bg-muted"><strong>{c.codice || t("Commessa")}</strong><span className="mt-1 block text-xs text-muted-foreground">{c.descrizione}</span></Link>)}
  </PopoverContent></Popover>;
}

function IncassoEmessa({ doc, incassa }: { doc: DocumentoFiscale; incassa?:()=>void }) {
  const t = useT();
  if (["bozza", "annullata", "stornata"].includes(doc.stato)) return <StatoBadge stato={doc.stato} />;
  const residuo = residuoDaIncassare(doc);
  const label = residuo <= 0 ? t("Incassata") : doc.importo_pagato > 0 ? t("Parz. incassata") : t("Da incassare");
  const badge=<Badge variant="outline" className={residuo <= 0 ? "text-emerald-700 border-emerald-200 bg-emerald-50" : "text-amber-700 border-amber-200 bg-amber-50"}>{label}</Badge>;
  return incassa&&residuo>0?<button type="button" className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={e=>{e.stopPropagation();incassa();}} aria-label={t("Registra incasso fattura {numero}", { numero: doc.numero ?? "" })}>{badge}</button>:badge;
}

function AllegatiEmessa({ doc, apri }: { doc: DocumentoFiscale; apri: () => void }) {
  const t = useT();
  return <Popover><PopoverTrigger asChild>
    <button type="button" className="inline-flex items-center gap-1 text-xs hover:text-primary" onClick={e => e.stopPropagation()} aria-label={t("Apri gli allegati della fattura {numero}", { numero: doc.numero ?? "" })}><Paperclip className="h-3.5 w-3.5" />{doc.elenco_allegati ?? doc.allegati?.length ?? 0}</button>
  </PopoverTrigger><PopoverContent className="w-[520px] max-w-[90vw] max-h-[65vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
    {/* Il componente esistente si monta solo aprendo la cella: nessuna query per riga. */}
    <AllegatiFattura companyId={doc.company_id} madre={doc.origine === "importata" ? { invoiceId: doc.id } : { documentoFiscaleId: doc.id }} sola_lettura />
    {!!doc.allegati?.length && <p className="mt-3 text-xs text-muted-foreground">{t("Altri allegati incorporati sono disponibili nel documento.")}</p>}
    <Button variant="link" size="sm" className="mt-2 px-0" onClick={apri}>{t("Apri il dettaglio della fattura")}</Button>
  </PopoverContent></Popover>;
}

export function CelleEmesse({ doc, colonne, apri, incassa, collega }: { doc: DocumentoFiscale; colonne: ColonnaEmesse[]; apri: () => void; incassa?:()=>void; collega?:()=>void }) {
  const t = useT();
  const dataScadenza = doc.elenco_prossima_scadenza === undefined ? doc.data_scadenza : doc.elenco_prossima_scadenza ?? undefined;
  const scadenza = getScadenzaInfo({ ...doc, data_scadenza: dataScadenza });
  const cliente = nomeCliente(doc.cliente_snapshot as never) || "—";
  const credito = creditoCliente(doc);
  const valori: Record<ColonnaEmesse, React.ReactNode> = {
    numero: <button type="button" onClick={e => { e.stopPropagation(); apri(); }} className="block w-full truncate text-left font-mono text-xs hover:underline" title={doc.numero || t("Bozza senza numero")}>
      {doc.numero || t("Bozza")}
    </button>,
    cliente: <button type="button" onClick={e => { e.stopPropagation(); apri(); }} className="block w-full truncate text-left font-medium hover:underline" title={cliente}>
      {cliente}
    </button>,
    data: formatDateShort(doc.data_emissione),
    imponibile: formatCurrency(doc.imponibile_totale), iva: formatCurrency(doc.iva_totale),
    totale: formatCurrency(doc.totale_documento), netto: formatCurrency(doc.totale_da_pagare),
    stato: <StatoBadge stato={doc.stato} />,
    sdi: doc.origine === "importata" ? <Badge variant="outline" title={t("Esito SDI non disponibile nell'importazione. Verifica nel gestionale di origine.")}>{t("Gestita esternamente")}</Badge> : faseSdi(doc) ? <FaseSdiBadge doc={doc} /> : "—",
    incasso: <IncassoEmessa doc={doc} incassa={incassa} />,
    incassato: formatCurrency(doc.importo_pagato),
    residuo: credito > 0 ? <span title={t("Credito del cliente, da rimborsare o compensare")}>{t("Credito {credito}", { credito: formatCurrency(credito) })}</span> : formatCurrency(Math.max(0, residuoDaIncassare(doc))),
    modalita: etichettaModalitaPagamento(doc.metodo_pagamento_nome || doc.metodo_pagamento_codice) || "—",
    scadenza: scadenza && dataScadenza ? <span className={scadenza.scaduta ? "text-destructive font-medium" : scadenza.urgente ? "text-amber-700" : ""}
      title={scadenza.scaduta ? t("Scaduta da {giorni} giorni", { giorni: scadenza.giorni }) : t("Scade fra {giorni} giorni", { giorni: scadenza.giorni })}>{formatDateShort(dataScadenza)}{scadenza.scaduta && ` · ${t("{giorni} gg fa", { giorni: scadenza.giorni })}`}</span> : "—",
    commesse: <CommesseEmessa doc={doc} collega={collega} />, note: <NoteEmessa doc={doc} />, note_interne:<NoteEmessa doc={doc} interne />,
    allegati: <AllegatiEmessa doc={doc} apri={apri} />,
    origine: doc.origine === "importata" ? (doc.external_provider || t("Importata")) : "Edilizia in Cloud",
  };
  return <>{COLONNE_EMESSE.filter(c => colonne.includes(c.id)).map(c => <TableCell key={c.id}
    className={`whitespace-nowrap py-2 ${"cifra" in c ? "text-right tabular-nums" : ""} ${FISSA[c.id] ? `${FISSA[c.id]} z-[1] bg-card group-hover:bg-[color-mix(in_srgb,hsl(var(--muted))_50%,hsl(var(--card)))]` : ""}`}>{valori[c.id]}</TableCell>)}</>;
}

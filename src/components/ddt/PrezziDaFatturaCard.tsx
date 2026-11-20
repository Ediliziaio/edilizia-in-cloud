import { UniformSelect } from "@/components/ui/uniform-select";
import { useMemo, useState, type ReactNode, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/usePermissions";
import { useDDTRighe, type DDTRicezione } from "@/hooks/useDDTRicezione";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { queryKeys } from "@/lib/queryKeys";
import { useDebounce } from "@/hooks/useDebounce";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { proponiPrezziFattura, righeDocumentoFattura, righePrezzoDiQuestoDdt } from "@/lib/ddt/proponiPrezziFattura";

interface Fattura {
  id: string;
  numero_fattura: string;
  data_fattura: string;
  cedente_ragione_sociale: string;
}
interface Valore {
  id: string;
  riga_id: string;
  fattura_id: string;
  quantita: number;
  prezzo_unitario: number;
  fatture_ricevute?: { numero_fattura: string };
}
interface PrezzoDiverso {
  riga_id: string;
  descrizione: string | null;
  prezzo_bolla: number;
  prezzo_fattura: number;
  /** true: la fattura copre tutta la riga e il suo prezzo ha preso il posto di quello della bolla. */
  sostituito: boolean;
}
const euro = (n: number) => Number(n).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 4 });
function descriviDifferenza(d: PrezzoDiverso) {
  const cosa = d.descrizione?.trim() || "Riga";
  return d.sostituito
    ? `${cosa}: ${euro(d.prezzo_bolla)} in bolla, ora ${euro(d.prezzo_fattura)} dalla fattura`
    : `${cosa}: resta ${euro(d.prezzo_bolla)} della bolla, la fattura parziale dice ${euro(d.prezzo_fattura)}`;
}

type Props = { ddt: DDTRicezione; incorporato?: boolean; altreAzioni?: ReactNode };
type Bozze = Record<string, { q: string; prezzo: string }>;
const nuovoConfronto = (fattura: string) => ({ fattura, bozze: {} as Bozze, selezionate: null as Set<string> | null, confermo: false });

function useConfrontoFattura(fattura: string, proposte: Bozze) {
  const [stato, setStato] = useState(() => nuovoConfronto(fattura));
  // Il confronto appartiene a un documento: non può conservare la conferma
  // quando cambia la fattura, anche tornando a un documento già aperto.
  if (stato.fattura !== fattura) setStato(nuovoConfronto(fattura));
  const corrente = stato.fattura === fattura ? stato : nuovoConfronto(fattura);
  const bozze = { ...proposte, ...corrente.bozze };
  const selezionate = corrente.selezionate ?? new Set(Object.keys(proposte));
  return {
    bozze, selezionate, confermo: corrente.confermo,
    setBozze: (azione: SetStateAction<Bozze>) => setStato(p => ({ ...p, bozze: typeof azione === 'function' ? azione({ ...proposte, ...p.bozze }) : azione, selezionate: p.selezionate ?? new Set(Object.keys(proposte)) })),
    setSelezionate: (azione: SetStateAction<Set<string>>) => setStato(p => ({ ...p, bozze: { ...proposte, ...p.bozze }, selezionate: typeof azione === 'function' ? azione(p.selezionate ?? new Set(Object.keys(proposte))) : azione })),
    setConfermo: (confermo: boolean) => setStato(p => ({ ...p, bozze: { ...proposte, ...p.bozze }, selezionate: p.selezionate ?? new Set(Object.keys(proposte)), confermo })),
  };
}

export function PrezziDaFatturaCard(props: Props) {
  return <PrezziDaFatturaForm key={props.ddt.id} {...props} />;
}
function PrezziDaFatturaForm({
  ddt,
  incorporato = false,
  altreAzioni,
}: {
  ddt: DDTRicezione;
  /**
   * Dentro la voce «Fattura del fornitore» dei Collegamenti, senza scheda né
   * spiegazione (11/11/2026): la sezione a sé ripeteva la fattura che i
   * Collegamenti mostrano già. Il confronto è lo stesso.
   */
  incorporato?: boolean;
  /** Azioni da mettere sulla stessa riga del pulsante (es. «Collega una fattura»). */
  altreAzioni?: ReactNode;
}) {
  const p = usePermissions();
  const qc = useQueryClient();
  const visibile = p.canViewCosts || p.canManagePurchasing;
  const modificabile = p.canManagePurchasing && !p.solaLettura;
  const righe = useDDTRighe(ddt.id);
  const [aperto, setAperto] = useState(false);
  const [sceltaFattura, setFattura] = useState<string | null>(null);
  const [ricerca, setRicerca] = useState("");
  const ricercaFattura = useDebounce(ricerca.trim(), 300);
  const valori = useQuery<Valore[]>({
    queryKey: ["ddt-valorizzazioni", ddt.company_id, ddt.id],
    enabled: visibile,
    queryFn: async () => {
      const { data, error } = await db
        .from("ddt_valorizzazioni")
        .select("*,fatture_ricevute(numero_fattura)")
        .eq("company_id", ddt.company_id)
        .eq("ddt_id", ddt.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const fatture = useQuery<Fattura[]>({
    queryKey: [
      "ddt-fatture-fornitore",
      ddt.company_id,
      ddt.id,
      ddt.supplier_id,
      ricercaFattura,
    ],
    enabled: visibile && aperto && !!ddt.supplier_id,
    queryFn: async () => {
      const { data, error } = await db.rpc("ddt_fatture_fornitore", {
        p_ddt: ddt.id,
        p_cerca: ricercaFattura,
        p_limite: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });
  const collegate = useQuery<Array<{ id: string; numero_ddt: string; fatture_ricevute: { id: string; numero_fattura: string | null; data_fattura: string | null } | null }>>({
    // Identico contratto della scheda Collegamenti: la lettura viene condivisa.
    queryKey: ['ddt-fatture-collegate', ddt.company_id, ddt.id],
    enabled: modificabile && aperto,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.from('fattura_ddt')
        .select('id,numero_ddt,fatture_ricevute(id,numero_fattura,data_fattura)')
        .eq('company_id', ddt.company_id).eq('ddt_ricezione_id', ddt.id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const documentiCollegati = [...new Set((collegate.data ?? []).map(f => f.fatture_ricevute?.id).filter((id): id is string => !!id))];
  const fattura = sceltaFattura ?? (!ricerca.trim() && documentiCollegati.length === 1 ? documentiCollegati[0] : '');
  const documento = useQuery({
    queryKey: ['ddt-fattura-righe', ddt.company_id, ddt.id, fattura],
    enabled: modificabile && aperto && !!fattura,
    queryFn: async () => {
      const [originale, contesto, legami] = await Promise.all([
        db.from('fatture_ricevute')
          .select('id,numero_fattura,data_fattura,cedente_ragione_sociale,righe,xml_raw,indice_corpo').eq('company_id', ddt.company_id).eq('id', fattura).maybeSingle(),
        db.rpc('fattura_riconciliazione_contesto', { p_fattura: fattura, p_documenti: { ddt: [ddt.id], oda: [] } }),
        db.rpc('fattura_ddt_riepilogo', { p_fattura: fattura }),
      ]);
      for (const risposta of [originale, contesto, legami]) if (risposta.error) throw risposta.error;
      const { data } = originale;
      if (!data || data.id !== fattura) throw new Error('Fattura non disponibile');
      const perRiga = (contesto.data as { contesto?: { ddt_per_numero_xml?: Record<string, string[]> } })?.contesto?.ddt_per_numero_xml;
      const piuDdt = ((legami.data as { ddt?: unknown[] })?.ddt?.length ?? 0) > 1;
      return {
        id: String(data.id), numero_fattura: String(data.numero_fattura ?? ''), data_fattura: String(data.data_fattura ?? ''),
        cedente_ragione_sociale: String(data.cedente_ragione_sociale ?? ''),
        righe: righePrezzoDiQuestoDdt(righeDocumentoFattura(data), ddt.id, perRiga, piuDdt),
      };
    },
  });
  const proposte = useMemo(() => documento.data?.id === fattura
    ? proponiPrezziFattura(righe.data ?? [], documento.data.righe) : {}, [documento.data, fattura, righe.data]);
  const { bozze, selezionate, confermo, setBozze, setSelezionate, setConfermo } = useConfrontoFattura(fattura, proposte);
  const elencoFatture = documento.data?.id === fattura && !fatture.data?.some(f => f.id === fattura)
    ? [...(fatture.data ?? []), documento.data] : fatture.data ?? [];
  const salva = useMutation({
    mutationFn: async () => {
      if (!confermo || !fattura || !selezionate.size)
        throw new Error("Scegli la fattura e controlla i prezzi");
      const v = [...selezionate].map((id) => ({
        riga_id: id,
        quantita: Number(
          (
            bozze[id]?.q ??
            String(righe.data?.find((r) => r.id === id)?.quantita ?? "")
          ).replace(",", "."),
        ),
        prezzo_unitario: bozze[id]?.prezzo?.trim()
          ? Number(bozze[id].prezzo.replace(",", "."))
          : null,
      }));
      if (
        v.some(
          (r) =>
            !Number.isFinite(r.quantita) ||
            r.quantita <= 0 ||
            r.prezzo_unitario == null ||
            !Number.isFinite(r.prezzo_unitario) ||
            r.prezzo_unitario < 0,
        )
      )
        throw new Error(
          "Inserisci quantità e prezzo presenti nella fattura, IVA esclusa",
        );
      const { data, error } = await db.rpc("ddt_valorizza_da_fattura", {
        p_ddt: ddt.id,
        p_fattura: fattura,
        p_righe: v,
      });
      if (error) throw error;
      return ((data as { prezzi_diversi?: PrezzoDiverso[] } | null)?.prezzi_diversi ?? []) as PrezzoDiverso[];
    },
    onSuccess: (diversi) => {
      setSelezionate(new Set());
      setBozze({});
      setConfermo(false);
      toast.success(
        "Prezzi confrontati con la fattura, nessun nuovo arrivo registrato",
      );
      refreshMaterialQueries(qc);
      // 12/11/2026: un prezzo della bolla diverso da quello fatturato non
      // cambia in silenzio. Se la fattura copre tutta la riga vince lei,
      // altrimenti resta quello della bolla: in entrambi i casi lo si dice.
      if (diversi.length > 0)
        toast.warning(
          diversi.length === 1 ? "Un prezzo della bolla è diverso dalla fattura" : `${diversi.length} prezzi della bolla sono diversi dalla fattura`,
          { description: diversi.map(descriviDifferenza).join(" · "), duration: 12_000 },
        );
      for (const key of [
        queryKeys.warehouse.stockAll,
        queryKeys.warehouse.itemsAll,
      ])
        void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) =>
      toast.error("Prezzi non aggiornati", { description: e.message }),
  });
  if (!visibile)
    return incorporato && altreAzioni ? (
      <div className="mt-1 flex flex-wrap gap-x-3">{altreAzioni}</div>
    ) : null;
  const precedenti = (
    <>
      {!!valori.data?.length && (
        <ul className="divide-y rounded-xl border px-3">
          {valori.data.map((v) => (
            <li key={v.id} className="py-2 text-xs">
              {righe.data?.find((r) => r.id === v.riga_id)?.descrizione} ·{" "}
              {Number(v.quantita).toLocaleString("it-IT")} ×{" "}
              {Number(v.prezzo_unitario).toLocaleString("it-IT", {
                style: "currency",
                currency: "EUR",
              })}{" "}
              ·{" "}
              <Link
                className="underline"
                to={`/azienda/documenti/fatture-ricevute?cerca=${encodeURIComponent(v.fatture_ricevute?.numero_fattura ?? "")}`}
              >
                Fattura
              </Link>
            </li>
          ))}
        </ul>
      )}
      {valori.isError && (
        <p role="alert" className="text-destructive">
          Confronti precedenti non disponibili.{" "}
          <button className="underline" onClick={() => void valori.refetch()}>
            Riprova
          </button>
        </p>
      )}
    </>
  );
  const confronto = (
    <>
      {aperto && (
        <fieldset
          disabled={salva.isPending || valori.isError}
          className="space-y-3"
        >
          <label className="block space-y-1 text-xs">
            Cerca per numero o data
            <Input
              value={ricerca}
              onChange={(e) => {
                setRicerca(e.target.value);
                setFattura("");
              }}
              placeholder="Numero della fattura"
            />
          </label>
          <label className="block space-y-1 text-xs">
            Fattura dello stesso fornitore
            <UniformSelect
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={fattura}
              onChange={(e) => {
                setFattura(e.target.value);
              }}
            >
              <option value="">
                {fatture.isLoading ? "Caricamento…" : "Seleziona la fattura"}
              </option>
              {elencoFatture.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.numero_fattura} · {f.data_fattura} ·{" "}
                  {f.cedente_ragione_sociale}
                </option>
              ))}
            </UniformSelect>
          </label>
          {(fatture.data?.length ?? 0) >= 100 && (
            <p className="text-xs text-muted-foreground">
              Mostrate le prime 100 fatture del fornitore. Cerca il numero o la
              data per trovare quelle precedenti.
            </p>
          )}
          {fatture.isError && (
            <p className="text-destructive">
              Fatture non disponibili.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void fatture.refetch()}
              >
                Riprova
              </button>
            </p>
          )}
          {!ddt.supplier_id && (
            <p className="text-amber-800">
              Associa prima il fornitore della bolla.
            </p>
          )}
          {fatture.isSuccess && !fatture.data?.length && (
            <p className="text-muted-foreground">
              Nessuna fattura trovata per questo fornitore. Importa prima
              l’originale nella sezione Fatture ricevute.
            </p>
          )}
          {!!fattura && documento.isPending && <p role="status">Leggo quantità e prezzi della fattura…</p>}
          {!!fattura && documento.isError && <p role="alert">Non riesco a leggere le righe della fattura. Puoi compilare il confronto a mano oppure <button type="button" className="underline" onClick={() => void documento.refetch()}>riprovare</button>.</p>}
          {!!fattura && documento.isSuccess && <div className="rounded-lg border bg-muted/20 p-3 text-xs">
            <p>{Object.keys(proposte).length > 0
              ? `${Object.keys(proposte).length === 1 ? '1 riga proposta' : `${Object.keys(proposte).length} righe proposte`} dalla fattura, con quantità e prezzi netti dopo gli sconti. Controlla i dati prima di confermare.`
              : 'Nessun abbinamento univoco con unità compatibili: scegli le righe e verifica quantità e prezzo sulla fattura.'}</p>
            {Object.keys(proposte).length > 0 && <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { setBozze(proposte); setSelezionate(new Set(Object.keys(proposte))); setConfermo(false); }}>Riprendi righe dalla fattura</Button>}
          </div>}
          <ul className="space-y-2" aria-busy={!!fattura && documento.isPending}>
            {righe.data?.map((r) => {
              const v = bozze[r.id];
              return (
                <li className="space-y-2 rounded-lg border p-3" key={r.id}>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      disabled={!!fattura && documento.isPending}
                      checked={selezionate.has(r.id)}
                      onChange={(e) => {
                        const c = e.target.checked;
                        setSelezionate((p) => {
                          const n = new Set(p);
                          if (c) n.add(r.id);
                          else n.delete(r.id);
                          return n;
                        });
                        setConfermo(false);
                      }}
                    />
                    {r.descrizione}
                  </label>
                  {selezionate.has(r.id) && (
                    <div className="grid grid-cols-2 items-end gap-2">
                      <label className="text-xs">
                        Quantità fatturata ({r.unita_misura})
                        <Input
                          aria-label={`Quantità fatturata ${r.descrizione}`}
                          inputMode="decimal"
                          value={v?.q ?? String(r.quantita ?? "")}
                          onChange={(e) => {
                            setBozze((p) => ({
                              ...p,
                              [r.id]: {
                                q: e.target.value,
                                prezzo: p[r.id]?.prezzo ?? "",
                              },
                            }));
                            setConfermo(false);
                          }}
                        />
                      </label>
                      <label className="text-xs">
                        Prezzo unitario IVA esclusa
                        <Input
                          aria-label={`Prezzo in fattura ${r.descrizione}`}
                          inputMode="decimal"
                          value={v?.prezzo ?? ""}
                          placeholder="Da fattura"
                          onChange={(e) => {
                            setBozze((p) => ({
                              ...p,
                              [r.id]: {
                                q: p[r.id]?.q ?? String(r.quantita ?? ""),
                                prezzo: e.target.value,
                              },
                            }));
                            setConfermo(false);
                          }}
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={confermo}
              onChange={(e) => setConfermo(e.target.checked)}
            />
            Ho confrontato le righe con la fattura originale. I prezzi sono
            unitari e al netto dell’IVA.
          </label>
          <Button
            disabled={
              !confermo || !fattura || !selezionate.size || salva.isPending || documento.isPending
            }
            onClick={() => salva.mutate()}
          >
            {salva.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Salva il confronto prezzi
          </Button>
        </fieldset>
      )}
    </>
  );
  if (incorporato)
    return (
      <div className="space-y-2">
        {!!valori.data?.length && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {valori.data.map((v) => (
              <li key={v.id} className="truncate">
                {righe.data?.find((r) => r.id === v.riga_id)?.descrizione} ·{" "}
                {Number(v.quantita).toLocaleString("it-IT")} ×{" "}
                {Number(v.prezzo_unitario).toLocaleString("it-IT", {
                  style: "currency",
                  currency: "EUR",
                })}
              </li>
            ))}
          </ul>
        )}
        {valori.isError && (
          <p role="alert" className="text-xs text-destructive">
            Confronti precedenti non disponibili.{" "}
            <button className="underline" onClick={() => void valori.refetch()}>
              Riprova
            </button>
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {altreAzioni}
          {modificabile && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              aria-expanded={aperto}
              onClick={() => setAperto((v) => !v)}
            >
              {aperto ? "Chiudi confronto" : "Confronta una fattura"}
            </button>
          )}
        </div>
        {aperto && (
          <div className="rounded-md border bg-muted/20 p-2 text-sm">
            {confronto}
          </div>
        )}
      </div>
    );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-orange-600" />
          Prezzi e fattura del fornitore
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          La bolla può rimanere senza prezzi. Quando arriva la fattura,
          confronta le quantità e completa i prezzi degli articoli della
          commessa e dei carichi di magazzino. La contabilizzazione e la
          ripartizione del costo restano nella fattura.
        </p>
        {precedenti}
        {modificabile && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAperto((v) => !v)}
          >
            {aperto ? "Chiudi confronto" : "Confronta una fattura"}
          </Button>
        )}
        {confronto}
      </CardContent>
    </Card>
  );
}

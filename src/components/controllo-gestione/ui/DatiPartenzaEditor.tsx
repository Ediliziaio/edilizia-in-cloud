/**
 * Dati di partenza del Controllo di Gestione: patrimonio netto dell'anno e
 * beni dell'azienda (cespiti). Senza patrimonio lo Stato patrimoniale non
 * quadra; senza cespiti gli ammortamenti sono zero.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useAggiungiCespite, useCespiti, useDismettiCespite, usePatrimonioNetto, useSalvaPatrimonioNetto,
  type PatrimonioNettoRow,
} from "@/hooks/controlloGestione/usePatrimonioCespiti";
import { formatEuro, parseImportoIt } from "@/lib/controlloGestione/indiciBanca";
import { formatDateIt } from "@/lib/formatters";
import { Landmark, Truck, Trash2, Plus } from "lucide-react";

type CampoPn = Exclude<keyof PatrimonioNettoRow, "id" | "esercizio" | "note">;

const CAMPI_PN: { campo: CampoPn; label: string; aiuto?: string }[] = [
  { campo: "capitale_sociale", label: "Capitale sociale" },
  { campo: "riserva_legale", label: "Riserva legale" },
  { campo: "riserva_straordinaria", label: "Riserva straordinaria" },
  { campo: "altre_riserve", label: "Altre riserve" },
  { campo: "utili_perdite_a_nuovo", label: "Utili (o perdite) portati a nuovo", aiuto: "Le perdite con il segno meno" },
  { campo: "fondo_tfr", label: "Fondo TFR" },
  { campo: "fondo_rischi", label: "Fondo rischi" },
  { campo: "altri_fondi", label: "Altri fondi" },
];

function aTesto(v: number | null | undefined): string {
  if (v === null || v === undefined || v === 0) return "";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(v);
}

export function PatrimonioNettoEditor({ anno }: { anno: number }) {
  const q = usePatrimonioNetto(anno);
  return (
    <Card id="patrimonio" className="scroll-mt-24 rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" /> Patrimonio netto {anno}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Copia i valori dall'ultimo bilancio depositato (stato patrimoniale, voce A del passivo, e fondi). Importi
          in euro, per esempio 100.000 oppure 100000,50.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          // Il form riparte dai valori salvati quando cambiano anno o dati.
          <PatrimonioForm key={`${anno}-${q.data ? JSON.stringify(q.data) : "vuoto"}`} anno={anno} riga={q.data ?? null} />
        )}
      </CardContent>
    </Card>
  );
}

function PatrimonioForm({ anno, riga }: { anno: number; riga: PatrimonioNettoRow | null }) {
  const salva = useSalvaPatrimonioNetto();
  const { toast } = useToast();
  const [valori, setValori] = useState<Record<CampoPn, string>>(
    () => Object.fromEntries(CAMPI_PN.map((c) => [c.campo, aTesto(riga?.[c.campo])])) as Record<CampoPn, string>,
  );

  const handleSalva = async () => {
    const numeri: Partial<Record<CampoPn, number>> = {};
    for (const c of CAMPI_PN) {
      const n = parseImportoIt(valori[c.campo]);
      if (Number.isNaN(n)) {
        toast({ title: "Importo non valido", description: `Controlla «${c.label}» (es. 100.000 oppure 100000,50).`, variant: "destructive" });
        return;
      }
      if (n !== null && n < 0 && c.campo !== "utili_perdite_a_nuovo") {
        toast({ title: "Importo non valido", description: `«${c.label}» non può essere negativo.`, variant: "destructive" });
        return;
      }
      numeri[c.campo] = n ?? 0;
    }
    try {
      await salva.mutateAsync({
        esercizio: anno,
        capitale_sociale: numeri.capitale_sociale ?? 0,
        riserva_legale: numeri.riserva_legale ?? 0,
        riserva_straordinaria: numeri.riserva_straordinaria ?? 0,
        altre_riserve: numeri.altre_riserve ?? 0,
        utili_perdite_a_nuovo: numeri.utili_perdite_a_nuovo ?? 0,
        // L'utile dell'anno lo calcola il Conto economico: qui non si tocca.
        utile_perdita_esercizio: riga?.utile_perdita_esercizio ?? 0,
        fondo_tfr: numeri.fondo_tfr ?? 0,
        fondo_rischi: numeri.fondo_rischi ?? 0,
        altri_fondi: numeri.altri_fondi ?? 0,
        note: riga?.note ?? null,
      });
      toast({ title: `Patrimonio ${anno} salvato` });
    } catch (e) {
      toast({ title: "Patrimonio non salvato", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  return (
    <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CAMPI_PN.map((c) => (
              <div key={c.campo}>
                <Label className="text-xs" htmlFor={`pn-${c.campo}`}>{c.label} (€)</Label>
                <Input
                  id={`pn-${c.campo}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={valori[c.campo]}
                  onChange={(e) => setValori((v) => ({ ...v, [c.campo]: e.target.value }))}
                />
                {c.aiuto && <p className="mt-0.5 text-[11px] text-muted-foreground">{c.aiuto}</p>}
              </div>
            ))}
          </div>
        <Button size="sm" onClick={handleSalva} disabled={salva.isPending}>
          {salva.isPending ? "Salvataggio…" : "Salva patrimonio"}
        </Button>
    </>
  );
}

const CATEGORIE = [
  { value: "materiale", label: "Bene materiale (mezzi, attrezzature, immobili)" },
  { value: "immateriale", label: "Bene immateriale (software, licenze)" },
  { value: "finanziaria", label: "Partecipazione o investimento" },
];

export function CespitiEditor() {
  const q = useCespiti();
  const aggiungi = useAggiungiCespite();
  const dismetti = useDismettiCespite();
  const { toast } = useToast();
  const [nuovo, setNuovo] = useState({
    descrizione: "",
    categoria: "materiale",
    data_acquisto: "",
    costo: "",
    aliquota: "20",
    fondo: "",
  });

  const handleAggiungi = async () => {
    const costo = parseImportoIt(nuovo.costo);
    const fondo = parseImportoIt(nuovo.fondo) ?? 0;
    const aliquota = Number(nuovo.aliquota.replace(",", "."));
    if (!nuovo.descrizione.trim() || !nuovo.data_acquisto || costo === null || Number.isNaN(costo) || costo < 0) {
      toast({ title: "Mancano dati", description: "Servono descrizione, data di acquisto e costo.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(aliquota) || aliquota < 0 || aliquota > 100 || Number.isNaN(fondo) || fondo < 0) {
      toast({ title: "Valori non validi", description: "L'aliquota va da 0 a 100, il fondo non può essere negativo.", variant: "destructive" });
      return;
    }
    try {
      await aggiungi.mutateAsync({
        descrizione: nuovo.descrizione.trim(),
        categoria: nuovo.categoria,
        data_acquisto: nuovo.data_acquisto,
        costo_storico: costo,
        aliquota_amm: aliquota,
        fondo_amm: fondo,
      });
      setNuovo({ descrizione: "", categoria: "materiale", data_acquisto: "", costo: "", aliquota: "20", fondo: "" });
      toast({ title: "Bene aggiunto" });
    } catch (e) {
      toast({ title: "Bene non aggiunto", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  const handleDismetti = async (id: string, descrizione: string) => {
    try {
      await dismetti.mutateAsync(id);
      toast({ title: `«${descrizione}» tolto dal calcolo` });
    } catch (e) {
      toast({ title: "Operazione non riuscita", description: e instanceof Error ? e.message : "Riprova.", variant: "destructive" });
    }
  };

  return (
    <Card id="cespiti" className="scroll-mt-24 rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4" /> Beni dell'azienda (cespiti)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Mezzi, attrezzature, immobili e software comprati per lavorare. Servono per calcolare gli ammortamenti:
          la quota annua è costo × aliquota (es. autocarri 20%, attrezzatura 15%, fabbricati 3%).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : q.data && q.data.length > 0 ? (
          <ul className="divide-y rounded-xl border">
            {q.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.descrizione}</p>
                  <p className="text-xs text-muted-foreground">
                    Acquistato il {formatDateIt(c.data_acquisto)} · {formatEuro(c.costo_storico)} · ammortamento{" "}
                    {new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(c.aliquota_amm)}% l'anno
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 gap-1 text-xs"
                  disabled={dismetti.isPending}
                  onClick={() => handleDismetti(c.id, c.descrizione)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Dismesso
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun bene caricato.</p>
        )}

        <div className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2">
            <Label className="text-xs" htmlFor="ces-descr">Descrizione</Label>
            <Input id="ces-descr" placeholder="es. Autocarro Iveco Daily" value={nuovo.descrizione}
              onChange={(e) => setNuovo((n) => ({ ...n, descrizione: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Tipo di bene</Label>
            <Select value={nuovo.categoria} onValueChange={(v) => setNuovo((n) => ({ ...n, categoria: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIE.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs" htmlFor="ces-data">Data di acquisto</Label>
            <Input id="ces-data" type="date" value={nuovo.data_acquisto}
              onChange={(e) => setNuovo((n) => ({ ...n, data_acquisto: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="ces-costo">Costo (€)</Label>
            <Input id="ces-costo" inputMode="decimal" placeholder="es. 35.000" value={nuovo.costo}
              onChange={(e) => setNuovo((n) => ({ ...n, costo: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="ces-aliq">Ammortamento % l'anno</Label>
            <Input id="ces-aliq" inputMode="decimal" value={nuovo.aliquota}
              onChange={(e) => setNuovo((n) => ({ ...n, aliquota: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs" htmlFor="ces-fondo">Già ammortizzato (€)</Label>
            <Input id="ces-fondo" inputMode="decimal" placeholder="0" value={nuovo.fondo}
              onChange={(e) => setNuovo((n) => ({ ...n, fondo: e.target.value }))} />
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-4">
            <Button size="sm" className="gap-1.5" onClick={handleAggiungi} disabled={aggiungi.isPending}>
              <Plus className="h-4 w-4" /> Aggiungi bene
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

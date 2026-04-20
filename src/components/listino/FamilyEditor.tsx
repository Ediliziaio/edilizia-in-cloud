/**
 * Preventivatore Verticalizzato Serramentisti — FASE 4.3
 *
 * Editor multi-step per una famiglia articoli (article_families). 5 step:
 *  1. Dati base (nome, categoria, descrizione, modalità prezzo, UM, IVA)
 *  2. Prezzo base + griglia L×H (solo se modalità=griglia)
 *  3. Assi di variazione (delegato a FamilyAxesEditor)
 *  4. Posa default (tariffa + quantità)
 *  5. Riepilogo + salva
 *
 * Modalità:
 *  - new: crea al click "Salva dati base" nello Step 1 e poi resta in edit
 *  - edit: carica via useFamily(id)
 *
 * Preview prezzo live (FamilyPricePreview) affiancata dallo Step 3 in poi.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  Save,
  CopyPlus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useFamily } from "@/hooks/useFamilies";
import { useFamilyMutations } from "@/hooks/useFamilyMutations";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { FamilyAxesEditor } from "./FamilyAxesEditor";
import { FamilyGridEditor } from "./FamilyGridEditor";
import { FamilyPricePreview } from "./FamilyPricePreview";
import type { ModalitaPrezzoBase } from "@/types/articleFamily";

interface Categoria {
  id: string;
  nome: string;
}

interface Tariffa {
  id: string;
  nome: string;
  tipo: string;
}

const MODALITA_CARDS: Array<{
  value: ModalitaPrezzoBase;
  label: string;
  descrizione: string;
}> = [
  { value: "griglia", label: "Griglia L×H", descrizione: "Matrice dimensioni → prezzo. Default serramenti." },
  { value: "mq", label: "Al mq", descrizione: "Prezzo moltiplicato per la superficie." },
  { value: "pz", label: "A pezzo", descrizione: "Prezzo fisso per ogni pezzo." },
  { value: "misura_libera", label: "Misura libera", descrizione: "Prezzo manuale al preventivo." },
];

const UM_OPTIONS = ["pz", "mq", "ml", "mc", "kg", "a_corpo"];
const IVA_OPTIONS = [4, 5, 10, 22];

export function FamilyEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = useEffectiveCompanyId();
  const { createFamily, updateFamily, duplicateFamily } = useFamilyMutations();

  const isNew = !id || id === "nuova";
  const { family, isLoading: loadingFamily } = useFamily(isNew ? null : id);

  const [activeStep, setActiveStep] = useState("1");

  // ── Form state Step 1 ────────────────────────────────────────────────────
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState<string | "none">("none");
  const [descrizione, setDescrizione] = useState("");
  const [modalita, setModalita] = useState<ModalitaPrezzoBase>("griglia");
  const [unitOfMeasure, setUnitOfMeasure] = useState("pz");
  const [vatRate, setVatRate] = useState("22");
  const [grigliaXLabel, setGrigliaXLabel] = useState("Larghezza (mm)");
  const [grigliaYLabel, setGrigliaYLabel] = useState("Altezza (mm)");

  // Step 2
  const [prezzoVendita, setPrezzoVendita] = useState("0");
  const [prezzoAcquisto, setPrezzoAcquisto] = useState("0");

  // Step 4
  const [posaTariffaId, setPosaTariffaId] = useState<string | "none">("none");
  const [posaQuantita, setPosaQuantita] = useState("1");
  // Sprint A §4.3 / Step 10 — flag posa legata. Se true (default), la riga posa
  // auto-generata dal preventivatore resta legata alla riga prodotto: DELETE
  // cascade + QUANTITY sync. Se false, la posa resta indipendente.
  const [posaLinked, setPosaLinked] = useState<boolean>(true);

  // Bootstrap da family caricata
  useEffect(() => {
    if (family) {
      setNome(family.nome);
      setCategoriaId(family.categoria_id ?? "none");
      setDescrizione(family.descrizione ?? "");
      setModalita(family.modalita_prezzo_base);
      setUnitOfMeasure(family.unit_of_measure);
      setVatRate(String(family.vat_rate));
      setGrigliaXLabel(family.griglia_asse_x_label);
      setGrigliaYLabel(family.griglia_asse_y_label);
      setPrezzoVendita(String(family.prezzo_base_vendita));
      setPrezzoAcquisto(String(family.prezzo_base_acquisto));
      setPosaTariffaId(family.posa_tariffa_default_id ?? "none");
      setPosaQuantita(String(family.posa_quantita_default));
      // `posa_linked` arriva dalla migration Step 3; fino alla rigenerazione
      // dei types potrebbe non essere presente → default true.
      const pl = (family as unknown as { posa_linked?: boolean | null }).posa_linked;
      setPosaLinked(pl ?? true);
    }
  }, [family]);

  // ── Query: categorie + tariffe ──────────────────────────────────────────
  const { data: categorie = [] } = useQuery({
    queryKey: ["listino-categorie-for-editor", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listino_categorie")
        .select("id, nome")
        .eq("company_id", companyId!)
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Categoria[];
    },
  });

  const { data: tariffe = [] } = useQuery({
    queryKey: ["tariffe-for-editor", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tariffe_aziendali")
        .select("id, nome, tipo")
        .eq("company_id", companyId!)
        .order("nome", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Tariffa[];
    },
  });

  // ── Salvataggio Step 1 (crea/aggiorna dati base) ───────────────────────
  const saveBase = async (): Promise<string | null> => {
    const vertical =
      (effectiveCompany as { vertical?: string } | null)?.vertical ?? "generico";
    const payload = {
      nome: nome.trim(),
      categoria_id: categoriaId === "none" ? null : categoriaId,
      descrizione: descrizione.trim() || null,
      modalita_prezzo_base: modalita,
      unit_of_measure: unitOfMeasure,
      vat_rate: parseFloat(vatRate) || 22,
      griglia_asse_x_label: grigliaXLabel,
      griglia_asse_y_label: grigliaYLabel,
      prezzo_base_vendita: parseFloat(prezzoVendita) || 0,
      prezzo_base_acquisto: parseFloat(prezzoAcquisto) || 0,
      posa_tariffa_default_id: posaTariffaId === "none" ? null : posaTariffaId,
      posa_quantita_default: parseFloat(posaQuantita) || 1,
      posa_linked: posaLinked,
    };

    try {
      if (isNew) {
        const created = await createFamily.mutateAsync({
          ...payload,
          vertical,
          immagine_url: null,
          pdf_scheda_url: null,
          griglia_unita: "mm",
          attivo: true,
          sort_order: 0,
          custom_field_values: {},
        });
        toast.success("Famiglia creata");
        // Redirect a /:id per continuare editing
        navigate(`/azienda/impostazioni/listino/famiglie/${created.id}`, {
          replace: true,
        });
        return created.id;
      } else if (family) {
        await updateFamily.mutateAsync({ id: family.id, patch: payload });
        toast.success("Famiglia aggiornata");
        return family.id;
      }
    } catch (err) {
      toast.error("Errore salvataggio", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
    return null;
  };

  const canSaveBase = nome.trim().length > 0;
  const saving = createFamily.isPending || updateFamily.isPending;

  // Duplica
  const handleDuplicate = async () => {
    if (!family) return;
    try {
      const newId = await duplicateFamily.mutateAsync({
        sourceId: family.id,
        newName: `${family.nome} (copia)`,
      });
      toast.success("Famiglia duplicata");
      navigate(`/azienda/impostazioni/listino/famiglie/${newId}`);
    } catch (err) {
      toast.error("Errore duplicazione", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  if (!isNew && loadingFamily) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" aria-hidden="true" />
        Caricamento famiglia…
      </div>
    );
  }

  if (!isNew && !family) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="font-medium">Famiglia non trovata</p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => navigate("/azienda/impostazioni/listino/famiglie")}
          >
            Torna al catalogo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/azienda/impostazioni/listino/famiglie")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Famiglie
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold truncate">
              {isNew ? "Nuova famiglia" : family?.nome}
            </h1>
            {!isNew && family ? (
              <p className="text-xs text-muted-foreground">
                Aggiornata{" "}
                {new Date(family.updated_at).toLocaleString("it-IT", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            ) : null}
          </div>
        </div>
        {!isNew && family ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicateFamily.isPending}
          >
            {duplicateFamily.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <CopyPlus className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Duplica
          </Button>
        ) : null}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Colonna principale: step */}
        <div className="lg:col-span-2">
          <Tabs value={activeStep} onValueChange={setActiveStep}>
            <TabsList className="grid grid-cols-5 w-full">
              <TabsTrigger value="1">1. Dati base</TabsTrigger>
              <TabsTrigger value="2" disabled={isNew}>2. Prezzo</TabsTrigger>
              <TabsTrigger value="3" disabled={isNew}>3. Assi</TabsTrigger>
              <TabsTrigger value="4" disabled={isNew}>4. Posa</TabsTrigger>
              <TabsTrigger value="5" disabled={isNew}>5. Riepilogo</TabsTrigger>
            </TabsList>

            {/* STEP 1 — Dati base */}
            <TabsContent value="1" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dati base</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="f-nome">Nome famiglia *</Label>
                    <Input
                      id="f-nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="es. Finestra PVC 2 ante"
                    />
                  </div>
                  <div>
                    <Label htmlFor="f-categoria">Categoria</Label>
                    <Select
                      value={categoriaId}
                      onValueChange={(v) => setCategoriaId(v)}
                    >
                      <SelectTrigger id="f-categoria">
                        <SelectValue placeholder="Nessuna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna categoria</SelectItem>
                        {categorie.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="f-descrizione">Descrizione</Label>
                    <Textarea
                      id="f-descrizione"
                      value={descrizione}
                      onChange={(e) => setDescrizione(e.target.value)}
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label>Modalità prezzo base</Label>
                    <RadioGroup
                      value={modalita}
                      onValueChange={(v) => setModalita(v as ModalitaPrezzoBase)}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2"
                    >
                      {MODALITA_CARDS.map((m) => (
                        <label
                          key={m.value}
                          htmlFor={`mod-${m.value}`}
                          className={`flex gap-3 p-3 border rounded-md cursor-pointer transition-all ${modalita === m.value ? "border-primary ring-2 ring-primary/20 bg-primary/5" : "hover:border-primary/50"}`}
                        >
                          <RadioGroupItem
                            id={`mod-${m.value}`}
                            value={m.value}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{m.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {m.descrizione}
                            </div>
                          </div>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="f-um">Unità di misura</Label>
                      <Select value={unitOfMeasure} onValueChange={setUnitOfMeasure}>
                        <SelectTrigger id="f-um">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {UM_OPTIONS.map((um) => (
                            <SelectItem key={um} value={um}>
                              {um}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="f-iva">IVA %</Label>
                      <Select value={vatRate} onValueChange={setVatRate}>
                        <SelectTrigger id="f-iva">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {IVA_OPTIONS.map((v) => (
                            <SelectItem key={v} value={String(v)}>
                              {v}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {modalita === "griglia" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="f-griglia-x">Etichetta asse X</Label>
                        <Input
                          id="f-griglia-x"
                          value={grigliaXLabel}
                          onChange={(e) => setGrigliaXLabel(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="f-griglia-y">Etichetta asse Y</Label>
                        <Input
                          id="f-griglia-y"
                          value={grigliaYLabel}
                          onChange={(e) => setGrigliaYLabel(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    const id = await saveBase();
                    if (id && !isNew) setActiveStep("2");
                  }}
                  disabled={!canSaveBase || saving}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                      Salvataggio…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                      {isNew ? "Crea famiglia" : "Salva dati base"}
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* STEP 2 — Prezzo */}
            <TabsContent value="2" className="space-y-4 mt-4">
              {modalita === "griglia" && family ? (
                <FamilyGridEditor
                  familyId={family.id}
                  asseXLabel={grigliaXLabel}
                  asseYLabel={grigliaYLabel}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Prezzo base</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Applicato come moltiplicatore o valore fisso a seconda della modalità scelta.
                    </p>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="f-prezzo-vendita">Prezzo vendita</Label>
                      <Input
                        id="f-prezzo-vendita"
                        type="number"
                        step="0.01"
                        value={prezzoVendita}
                        onChange={(e) => setPrezzoVendita(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="f-prezzo-acquisto">Prezzo acquisto</Label>
                      <Input
                        id="f-prezzo-acquisto"
                        type="number"
                        step="0.01"
                        value={prezzoAcquisto}
                        onChange={(e) => setPrezzoAcquisto(e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 flex justify-end">
                      <Button onClick={saveBase} disabled={!canSaveBase || saving}>
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                            Salvataggio…
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                            Salva prezzo
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* STEP 3 — Assi */}
            <TabsContent value="3" className="mt-4">
              {family ? <FamilyAxesEditor family={family} /> : null}
            </TabsContent>

            {/* STEP 4 — Posa */}
            <TabsContent value="4" className="space-y-4 mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Posa default</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    La posa verrà aggiunta automaticamente al preventivo quando si seleziona un articolo di questa famiglia.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label htmlFor="f-posa-tariffa">Tariffa posa</Label>
                    <Select value={posaTariffaId} onValueChange={setPosaTariffaId}>
                      <SelectTrigger id="f-posa-tariffa">
                        <SelectValue placeholder="Nessuna" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nessuna posa automatica</SelectItem>
                        {tariffe.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.nome}{" "}
                            <span className="text-muted-foreground ml-2">{t.tipo}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="f-posa-quantita">Quantità default</Label>
                    <Input
                      id="f-posa-quantita"
                      type="number"
                      step="0.01"
                      value={posaQuantita}
                      onChange={(e) => setPosaQuantita(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  {/* Sprint A §4.3 / Step 10 — Posa legata al prodotto */}
                  <div className="flex items-start justify-between gap-3 rounded-md border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="f-posa-linked" className="cursor-pointer">
                        Posa legata al prodotto
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Se attivo, cancellare o modificare la riga prodotto
                        aggiorna anche la riga posa. Se disattivo, posa e
                        prodotto vivono in modo indipendente.
                      </p>
                    </div>
                    <Switch
                      id="f-posa-linked"
                      checked={posaLinked}
                      onCheckedChange={setPosaLinked}
                      disabled={posaTariffaId === "none"}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveBase} disabled={saving}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                          Salvataggio…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-2" aria-hidden="true" />
                          Salva posa
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* STEP 5 — Riepilogo */}
            <TabsContent value="5" className="space-y-4 mt-4">
              {family ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Riepilogo famiglia</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <Row label="Nome" value={family.nome} />
                    <Row
                      label="Categoria"
                      value={
                        categorie.find((c) => c.id === family.categoria_id)?.nome ??
                        "Nessuna"
                      }
                    />
                    <Row label="Modalità prezzo" value={family.modalita_prezzo_base} />
                    <Row label="UM" value={family.unit_of_measure} />
                    <Row label="IVA" value={`${family.vat_rate}%`} />
                    <Row
                      label="Posa"
                      value={
                        family.posa_tariffa_default_id
                          ? `${tariffe.find((t) => t.id === family.posa_tariffa_default_id)?.nome ?? "—"} (${family.posa_quantita_default})`
                          : "Nessuna"
                      }
                    />
                    <div>
                      <div className="font-medium mb-1">Assi ({family.axes.length})</div>
                      {family.axes.length === 0 ? (
                        <p className="text-muted-foreground">Nessun asse configurato.</p>
                      ) : (
                        <ul className="space-y-1">
                          {family.axes.map((ax) => (
                            <li key={ax.id} className="flex gap-2 items-center">
                              <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                              <span className="font-medium">{ax.nome}</span>
                              <Badge variant="outline" className="text-xs">
                                {ax.values.length}{" "}
                                {ax.values.length === 1 ? "valore" : "valori"}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="flex gap-2 pt-3 border-t">
                      <Button
                        onClick={() =>
                          navigate("/azienda/impostazioni/listino/famiglie")
                        }
                        variant="outline"
                      >
                        Torna al catalogo
                      </Button>
                      <Button onClick={handleDuplicate} disabled={duplicateFamily.isPending}>
                        {duplicateFamily.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                            Duplicazione…
                          </>
                        ) : (
                          <>
                            <CopyPlus className="h-4 w-4 mr-2" aria-hidden="true" />
                            Salva e crea copia
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: preview prezzo */}
        <div className="lg:col-span-1">
          {!isNew && family ? (
            <div className="sticky top-4">
              <FamilyPricePreview family={family} />
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Salva i dati base per iniziare a configurare assi, griglia prezzi e vedere la preview live.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b pb-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

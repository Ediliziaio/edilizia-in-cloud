import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Candidate {
  id: string;
  version: string;
  title: string;
  content: string;
  persona_keys: string[] | null;
  kb_section: string;
  review_state: string;
  reviewed_content: string | null;
}
type ReviewState = "pending" | "approved" | "rejected";
const states: Record<ReviewState, string> = {
  pending: "Da verificare", approved: "Approvati", rejected: "Esclusi",
};

export function LearningReview() {
  const [state, setState] = useState<ReviewState>("pending");
  const [offset, setOffset] = useState(0);
  const client = useQueryClient();
  const candidates = useQuery({
    queryKey: ["silvio-learning-review", state, offset],
    queryFn: async () => {
      // Local migration: keep this boundary explicit until DB types are regenerated.
      const { data, error } = await supabase.rpc("silvio_learning_candidates" as never,
        { p_state: state, p_offset: offset } as never);
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Risposta revisione non valida");
      return data as unknown as Candidate[];
    },
  });
  const review = useMutation({
    mutationFn: async ({ candidate, decision, content }: { candidate: Candidate; decision: "approved" | "rejected"; content?: string }) => {
      const { data, error } = await supabase.rpc("silvio_review_learning" as never, {
        p_document_id: candidate.id, p_version: candidate.version,
        p_decision: decision, p_content: content?.trim() ?? null,
      } as never);
      if (error) throw error;
      if ((data as { ok?: boolean } | null)?.ok !== true) throw new Error("Revisione non confermata");
    },
    onSuccess: (_, { decision }) => {
      toast.success(decision === "approved" ? "Regola verificata salvata" : "Esempio escluso dalla memoria");
    },
    onError: (error) => toast.error("Revisione non salvata", { description: error.message }),
    onSettled: () => {
      client.invalidateQueries({ queryKey: ["silvio-learning-review"] });
      client.invalidateQueries({ queryKey: ["silvio-persona-memory"] });
      client.invalidateQueries({ queryKey: ["silvio-persona-memory-count"] });
    },
  });

  return <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">Verifica prima di insegnare a Silvio</CardTitle>
      <p className="text-xs text-muted-foreground">
        Un voto non certifica una risposta. Leggi l'esempio e scrivi solo una regola verificata,
        senza dati riservati o istruzioni copiate dalla conversazione. Queste memorie restano nell'area amministrativa.
      </p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div role="group" aria-label="Stato revisione" className="flex flex-wrap gap-2">
        {(Object.keys(states) as ReviewState[]).map(value => <Button key={value} size="sm"
          variant={state === value ? "default" : "outline"} aria-pressed={state === value}
          onClick={() => { setState(value); setOffset(0); }}>{states[value]}</Button>)}
      </div>
      {candidates.isPending ? <p role="status" className="text-sm">Caricamento esempi…</p>
        : candidates.isError ? <div role="alert" className="space-y-2 text-sm">
          <p>Revisione non disponibile. Verifica che il database sia aggiornato: gli esempi non vengono approvati automaticamente.</p>
          <Button size="sm" variant="outline" onClick={() => candidates.refetch()}>Riprova</Button>
        </div> : <>
          {!candidates.data.length && <p className="text-sm text-muted-foreground">Nessun esempio in questa pagina.</p>}
          {candidates.data.map(candidate => <ReviewCard key={`${candidate.id}:${candidate.version}:${candidate.review_state}`}
            candidate={candidate} pending={review.isPending}
            onReview={(decision, content) => review.mutate({ candidate, decision, content })} />)}
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0 || review.isPending} onClick={() => setOffset(Math.max(0, offset - 20))}>Precedenti</Button>
            <span className="text-xs text-muted-foreground">Pagina {offset / 20 + 1}</span>
            <Button size="sm" variant="outline" disabled={candidates.data.length < 20 || review.isPending} onClick={() => setOffset(offset + 20)}>Successivi</Button>
          </div>
        </>}
    </CardContent>
  </Card>;
}

function ReviewCard({ candidate, pending, onReview }: {
  candidate: Candidate; pending: boolean;
  onReview: (decision: "approved" | "rejected", content?: string) => void;
}) {
  const [content, setContent] = useState(candidate.reviewed_content ?? "");
  const valid = content.trim().length >= 20 && content.trim().length <= 500 && !!candidate.persona_keys?.length;
  return <details className="rounded-lg border p-3">
    <summary className="cursor-pointer text-sm font-medium break-words">
      {candidate.kb_section === "avoid_pattern" ? "Da evitare" : "Esempio utile"} · {candidate.persona_keys?.join(", ") || "Persona da assegnare"}
    </summary>
    <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground break-words">{candidate.title}</p>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 font-sans text-xs">{candidate.content}</pre>
      <label className="block text-sm" htmlFor={`learning-${candidate.id}`}>Regola verificata da conservare</label>
      <Textarea id={`learning-${candidate.id}`} value={content} maxLength={500} rows={3}
        onChange={event => setContent(event.target.value)} disabled={pending}
        placeholder="Scrivi cosa Silvio deve fare o evitare, dopo aver verificato l'esempio." />
      <p className="text-xs text-muted-foreground">{content.trim().length}/500 caratteri · minimo 20. Non viene salvata automaticamente la risposta originale.</p>
      {!candidate.persona_keys?.length && <p className="text-xs text-amber-700">Assegna prima una persona al documento nel Cervello.</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending || !valid} onClick={() => onReview("approved", content)}>Approva regola</Button>
        <Button size="sm" variant="outline" disabled={pending || candidate.review_state === "rejected"}
          onClick={() => onReview("rejected")}>{candidate.review_state === "approved" ? "Revoca approvazione" : "Escludi esempio"}</Button>
      </div>
    </div>
  </details>;
}

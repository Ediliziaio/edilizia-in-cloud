/**
 * @file SmsCompose.tsx
 * @description Form composizione e invio SMS manuale transazionale.
 * @author Claude Code — AEDIX S.r.l.
 * @date 2026-04-07
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useSendSms } from "@/hooks/useSendSms";
import { calcolaPartiSms } from "@/lib/sms-utils";

const schema = z.object({
  to_number: z
    .string()
    .min(1, "Numero obbligatorio")
    .regex(/^(\+39)?[0-9]{9,10}$/, "Inserisci un numero italiano valido (es. +393331234567)"),
  body: z
    .string()
    .min(1, "Il messaggio non può essere vuoto")
    .max(1600, "Messaggio troppo lungo"),
});

type FormValues = z.infer<typeof schema>;

export function SmsCompose() {
  const { sendSms, isPending } = useSendSms();
  const [charCount, setCharCount] = useState(0);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { to_number: "", body: "" },
  });

  const bodyValue = watch("body");
  const partiSms = calcolaPartiSms(bodyValue ?? "");

  const onSubmit = (values: FormValues) => {
    sendSms(
      { to_number: values.to_number, body: values.body },
      { onSuccess: () => { reset(); setCharCount(0); } }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5 text-[#1E3A5F]" />
          Nuovo SMS
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Destinatario */}
          <div className="space-y-1.5">
            <Label htmlFor="to_number">Numero destinatario</Label>
            <Input
              id="to_number"
              placeholder="+39 333 123 4567"
              {...register("to_number")}
              className={errors.to_number ? "border-red-400" : ""}
            />
            {errors.to_number && (
              <p className="text-xs text-red-600">{errors.to_number.message}</p>
            )}
          </div>

          {/* Messaggio */}
          <div className="space-y-1.5">
            <Label htmlFor="body">Messaggio</Label>
            <Textarea
              id="body"
              placeholder="Scrivi il testo del messaggio SMS..."
              rows={4}
              {...register("body", {
                onChange: (e) => setCharCount(e.target.value.length),
              })}
              className={errors.body ? "border-red-400" : ""}
            />
            {errors.body && (
              <p className="text-xs text-red-600">{errors.body.message}</p>
            )}

            {/* Contatore caratteri */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Info className="h-3 w-3" />
                Charset: {partiSms.charset.toUpperCase()}
              </span>
              <span>
                {charCount} car. · {partiSms.parti} SMS
                {partiSms.parti > 1 ? " (messaggio multiplo)" : ""}
              </span>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#1E3A5F] hover:bg-[#162d4a] text-white"
          >
            <Send className="h-4 w-4 mr-2" />
            {isPending ? "Invio in corso…" : "Invia SMS"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

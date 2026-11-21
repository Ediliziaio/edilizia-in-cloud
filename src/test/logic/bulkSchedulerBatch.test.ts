import { expect, it, vi } from "vitest";
import { checkDeliveryResponse, mustStopFallback, runScheduledBatch } from "../../../supabase/functions/automation-bulk-scheduler-runner/batch";

it("registra un invio esterno incerto e prosegue con i destinatari successivi", async () => {
  const invii: string[] = [];
  let prossimo = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    switch (name) {
      case "bulk_scheduler_acquire":
        return { data: { run_id: "run", lease: "lease", company_id: "azienda", flow_name: "Promemoria", config: {} }, error: null };
      case "bulk_scheduler_claim_delivery":
        prossimo++;
        return { data: prossimo <= 2 ? { id: String(prossimo), user_id: String(prossimo), eligible: true } : null, error: null };
      case "bulk_scheduler_record_delivery":
        invii.push(`${args.p_delivery}:${args.p_action}:${args.p_channel}`);
        return { data: null, error: null };
      default:
        return { data: { status: "partial", sent: 1, failed: 1 }, error: null };
    }
  });
  const risultato = await runScheduledBatch({ rpc }, "flow", "2026-11-21", {
    maxTargets: 200,
    deadline: Infinity,
    nextRun: () => "2026-11-22",
    send: async (_flow, recipient, control) => {
      try {
        await control.external("email", async () => checkDeliveryResponse(recipient.id === "1" ? 503 : 402, false, "Errore provider"));
      } catch (error) {
        if (mustStopFallback(error)) throw error;
      }
      return "silvio_chat";
    },
  });
  expect(invii).toEqual(["1:begin_external:email", "1:uncertain:email", "2:begin_external:email", "2:rejected:null", "2:sent:silvio_chat"]);
  expect(risultato).toMatchObject({ status: "partial", sent: 1, failed: 1 });
});

type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export type Recipient = {
  id: string;
  user_id: string;
  eligible: boolean;
  first_name: string | null;
  email: string | null;
};
type Occurrence<Config> = { company_id: string; flow_name: string; config: Config };
type Acquired<Config> = Occurrence<Config> & { run_id: string; lease: string };
type Result = { status: string; sent: number; failed: number; pending?: number };

export class DeliveryRejected extends Error {}
class DeliveryUncertain extends Error {}
export class BatchPersistenceError extends Error {}

export interface DeliveryControl {
  external(channel: string, operation: () => Promise<void>): Promise<void>;
}

export async function runScheduledBatch<Config>(
  client: RpcClient,
  flowId: string,
  due: string,
  options: {
    maxTargets: number;
    deadline: number;
    nextRun: (config: Config) => string;
    send: (flow: Occurrence<Config>, recipient: Recipient, control: DeliveryControl) => Promise<string | null>;
  },
): Promise<Result> {
  const rpc = async <T>(name: string, args: Record<string, unknown>) => {
    let response;
    try {
      response = await client.rpc(name, args);
    } catch {
      throw new BatchPersistenceError(name);
    }
    if (response.error) throw new BatchPersistenceError(`${name}: ${response.error.message}`);
    return response.data as T;
  };
  const run = await rpc<Acquired<Config> | null>("bulk_scheduler_acquire", {
    p_flow_id: flowId,
    p_scheduled_for: due,
  });
  if (!run) return { status: "busy", sent: 0, failed: 0 };
  const runArgs = { p_run: run.run_id, p_lease: run.lease };

  for (let i = 0; i < options.maxTargets && Date.now() < options.deadline; i++) {
    const recipient = await rpc<Recipient | null>("bulk_scheduler_claim_delivery", runArgs);
    if (!recipient) break;
    const record = (action: string, channel: string | null = null) => rpc("bulk_scheduler_record_delivery", {
      ...runArgs, p_delivery: recipient.id, p_action: action, p_channel: channel,
    });
    const control: DeliveryControl = {
      async external(channel, operation) {
        await record("begin_external", channel);
        try {
          await operation();
        } catch (err) {
          if (err instanceof DeliveryRejected) {
            await record("rejected");
            throw err;
          }
          throw new DeliveryUncertain(channel);
        }
      },
    };
    let channel: string | null = null;
    try {
      if (recipient.eligible) channel = await options.send(run, recipient, control);
    } catch (err) {
      if (err instanceof BatchPersistenceError) throw err;
      if (err instanceof DeliveryUncertain) await record("uncertain", err.message);
      else await record("failed");
      continue;
    }
    await record(channel ? "sent" : "skipped", channel);
  }

  return await rpc<Result>("bulk_scheduler_finish_batch", {
    ...runArgs, p_next_run_at: options.nextRun(run.config),
  });
}

export function checkDeliveryResponse(status: number, accepted: boolean, message: string) {
  if (accepted) return;
  if (status >= 400 && status < 500 && status !== 408 && status !== 409) {
    throw new DeliveryRejected(message);
  }
  throw new Error(message);
}

export function mustStopFallback(err: unknown): boolean {
  return err instanceof BatchPersistenceError || err instanceof DeliveryUncertain;
}

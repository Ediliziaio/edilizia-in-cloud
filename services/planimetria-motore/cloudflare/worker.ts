/**
 * Worker davanti al motore planimetrie (Cloudflare Containers), 23/11/2026.
 *
 * Il container (Blender + LibreDWG) si accende alla prima richiesta e si spegne
 * dopo qualche minuto senza lavoro: da fermo non costa niente. Ogni istanza fa
 * un lavoro alla volta; se è occupata risponde 429 e l'app riprova, quindi qui
 * si sceglie un'istanza a caso fra quelle del gruppo.
 *
 * Il Worker non guarda i biglietti: li verifica il container, che ha il segreto.
 */
import { Container, getRandom } from "@cloudflare/containers";

export class MotorePlanimetrie extends Container {
  defaultPort = 8080;
  sleepAfter = "4m";
  enableInternet = true; // serve solo per mandare l'esito «render fallito» a Supabase
}

type Env = {
  MOTORE: DurableObjectNamespace<MotorePlanimetrie>;
  ISTANZE?: string;
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const istanze = Math.min(10, Math.max(1, Number(env.ISTANZE ?? "3") || 3));
    const motore = await getRandom(env.MOTORE, istanze);
    return motore.fetch(request);
  },
};

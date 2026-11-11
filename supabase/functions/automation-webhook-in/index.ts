/** Public gateway, authenticated by a per-endpoint 256-bit bearer secret.
 * Timestamp/replay checks, bounded JSON and atomic tenant-scoped inbox in helper/RPC. */
import {createClient} from 'npm:@supabase/supabase-js@2.106.2';
import {getCorsHeaders} from '../_shared/headers.ts';
import {inboundWebhookHandler} from '../_shared/inboundAutomationWebhook.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
Deno.serve(inboundWebhookHandler(db,getCorsHeaders));

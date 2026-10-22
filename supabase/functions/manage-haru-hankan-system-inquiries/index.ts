import {adapter,createManage} from '../_shared/system-handlers.mjs';
const backend=adapter(Deno.env.get('SUPABASE_URL') ?? '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
Deno.serve(createManage(backend));

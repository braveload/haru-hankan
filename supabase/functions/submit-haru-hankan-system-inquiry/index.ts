import {adapter,createSubmit} from '../_shared/system-handlers.mjs';
// Release gate. Change only after approved DB security and operational checks.
const ACCEPTING = true;
const backend=adapter(Deno.env.get('SUPABASE_URL') ?? '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
Deno.serve(createSubmit({...backend,accepting:ACCEPTING}));

import {adapter} from '../_shared/system-handlers.mjs';
import {createVisits} from '../_shared/visits.mjs';
// Reuse platform-provided secrets; never put server credentials in static files.
Deno.serve(createVisits(adapter(Deno.env.get('SUPABASE_URL') ?? '',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')));

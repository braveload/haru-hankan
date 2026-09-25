import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://haru-hankan.onrender.com"]);
const ADMIN_EMAIL = "zxc1316@naver.com";
const statuses = new Set(["new", "contacted", "closed"]);

const headers = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
});
const respond = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: headers(origin) });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    return ALLOWED_ORIGINS.has(origin)
      ? new Response(null, { status: 204, headers: headers(origin) })
      : new Response(null, { status: 403 });
  }
  if (!ALLOWED_ORIGINS.has(origin)) return respond(origin, 403, { error: "요청을 처리할 수 없습니다." });
  if (req.method !== "GET" && req.method !== "PATCH") return respond(origin, 405, { error: "지원하지 않는 요청입니다." });

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !serviceRoleKey) return respond(origin, 401, { error: "로그인이 필요합니다." });

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user || String(authData.user.email ?? "").toLowerCase() !== ADMIN_EMAIL) {
    return respond(origin, 403, { error: "문의 관리 권한이 없습니다." });
  }

  if (req.method === "GET") {
    const { data, error } = await admin
      .from("haru_hankan_inquiries")
      .select("id, name, contact, inquiry_type, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error("inquiry admin list failed", error.code);
      return respond(origin, 500, { error: "문의 목록을 불러오지 못했습니다." });
    }
    return respond(origin, 200, { inquiries: data ?? [] });
  }

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return respond(origin, 413, { error: "요청 내용이 너무 깁니다." });
    payload = JSON.parse(raw);
  } catch {
    return respond(origin, 400, { error: "입력 형식을 확인해 주세요." });
  }
  const id = typeof payload.id === "string" ? payload.id : "";
  const status = typeof payload.status === "string" ? payload.status : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !statuses.has(status)) {
    return respond(origin, 400, { error: "문의 상태 변경 정보를 확인해 주세요." });
  }
  const { data, error } = await admin
    .from("haru_hankan_inquiries")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error || !data) {
    console.error("inquiry admin update failed", error?.code);
    return respond(origin, 500, { error: "상태 변경에 실패했습니다." });
  }
  return respond(origin, 200, { inquiry: data });
});

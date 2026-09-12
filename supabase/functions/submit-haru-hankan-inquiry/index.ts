import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set(["https://haru-hankan.onrender.com"]);
const jsonHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin",
});
const respond = (origin: string, status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders(origin) });
const normalize = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max + 1) : "";
const validContact = (value: string) => {
  if (value.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 && digits.length <= 15;
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") {
    return ALLOWED_ORIGINS.has(origin)
      ? new Response(null, { status: 204, headers: jsonHeaders(origin) })
      : new Response(null, { status: 403 });
  }
  if (req.method !== "POST" || !ALLOWED_ORIGINS.has(origin)) {
    return new Response(JSON.stringify({ error: "요청을 처리할 수 없습니다." }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 8192) return respond(origin, 413, { error: "입력 내용이 너무 깁니다." });

  let payload: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 8192) return respond(origin, 413, { error: "입력 내용이 너무 깁니다." });
    payload = JSON.parse(raw);
  } catch {
    return respond(origin, 400, { error: "입력 형식을 확인해 주세요." });
  }

  const name = normalize(payload.name, 100);
  const contact = normalize(payload.contact, 150);
  const inquiryType = normalize(payload.inquiry_type, 30);
  const message = normalize(payload.message, 1000);
  const website = normalize(payload.website, 200);
  const startedAt = Number(payload.started_at);
  const elapsed = Date.now() - startedAt;
  const allowedTypes = new Set(["landing_page", "logo_branding", "cardpilot", "other"]);

  if (website) return respond(origin, 200, { ok: true, reference: "HH-RECEIVED" });
  if (!name || name.length > 100) return respond(origin, 400, { error: "이름 또는 회사명을 확인해 주세요." });
  if (!validContact(contact) || contact.length > 150) return respond(origin, 400, { error: "연락처를 확인해 주세요." });
  if (!allowedTypes.has(inquiryType)) return respond(origin, 400, { error: "문의 분야를 선택해 주세요." });
  if (message.length > 1000) return respond(origin, 400, { error: "문의 내용은 1,000자 이내로 작성해 주세요." });
  if (payload.privacy_consent !== true) return respond(origin, 400, { error: "개인정보 수집·이용 동의가 필요합니다." });
  if (!Number.isFinite(startedAt) || elapsed < 2000 || elapsed > 86400000) {
    return respond(origin, 400, { error: "페이지를 새로고침한 뒤 다시 시도해 주세요." });
  }

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const source = `haru-hankan-v1|${forwarded}|${userAgent}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const fingerprintHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond(origin, 503, { error: "문의 저장소를 준비 중입니다." });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: allowed, error: rateError } = await admin.rpc("allow_haru_hankan_inquiry", {
    p_fingerprint_hash: fingerprintHash,
  });
  if (rateError) {
    console.error("inquiry rate check failed", rateError.code);
    return respond(origin, 503, { error: "잠시 후 다시 시도해 주세요." });
  }
  if (!allowed) return respond(origin, 429, { error: "10분 뒤 다시 문의해 주세요." });

  const { data, error } = await admin.from("haru_hankan_inquiries").insert({
    name, contact, inquiry_type: inquiryType, message, privacy_consent: true,
  }).select("id").single();
  if (error || !data) {
    console.error("inquiry insert failed", error?.code);
    return respond(origin, 500, { error: "접수에 실패했습니다." });
  }
  return respond(origin, 201, {
    ok: true,
    reference: `HH-${String(data.id).replaceAll("-", "").slice(0, 8).toUpperCase()}`,
  });
});

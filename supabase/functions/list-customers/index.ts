import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://admin.paybeforebite.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
]);

const corsHeadersFor = (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  return {
    ...(ALLOWED_ORIGINS.has(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const respond = (payload: unknown, status = 200) => json(payload, status, corsHeaders);
  if (req.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableKey = publishableKeysRaw
    ? JSON.parse(publishableKeysRaw).default
    : Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = secretKeysRaw
    ? JSON.parse(secretKeysRaw).default
    : Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !publishableKey || !secretKey) {
    return respond({ error: "Supabase function secrets are not configured." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return respond({ error: "Authentication required." }, 401);

  const userClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminClient = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
  if (userError || !userData.user) return respond({ error: "Invalid authentication session." }, 401);

  const { data: platformAdmin } = await adminClient.from("platform_admins")
    .select("user_id").eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (!platformAdmin) return respond({ error: "Platform administrator access is required." }, 403);

  const { data, error } = await adminClient.from("restaurants")
    .select("id,name,slug,status,plan,owner_name,owner_email,phone,created_at,activated_at")
    .order("created_at", { ascending: false });

  if (error) return respond({ error: error.message }, 400);
  return respond({ customers: data || [] });
});

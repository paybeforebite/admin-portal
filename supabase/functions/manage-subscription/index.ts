import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  const publishableKey = publishableKeysRaw ? JSON.parse(publishableKeysRaw).default : Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = secretKeysRaw ? JSON.parse(secretKeysRaw).default : Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !publishableKey || !secretKey) return json({ error: "Supabase function secrets are not configured." }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const adminClient = createClient(supabaseUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) return json({ error: "Invalid authentication session." }, 401);

  const { data: platformAdmin, error: adminError } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminError || !platformAdmin) return json({ error: "Platform administrator access is required." }, 403);

  const body = await req.json();
  const restaurantId = String(body.restaurantId || "").trim();
  const planCode = String(body.plan || "").trim().toLowerCase();
  const billingCycle = String(body.billingCycle || "monthly").trim().toLowerCase();

  if (!restaurantId || !["starter","basic","pro","business","enterprise"].includes(planCode)) {
    return json({ error: "Restaurant and a valid plan are required." }, 400);
  }
  if (!["monthly","yearly"].includes(billingCycle)) {
    return json({ error: "Invalid billing cycle." }, 400);
  }

  const { data: plan, error: planError } = await adminClient
    .from("plans")
    .select("id,code,name,price_monthly,price_yearly,currency")
    .eq("code", planCode)
    .eq("is_active", true)
    .single();

  if (planError || !plan) return json({ error: "Selected plan is not available." }, 400);

  const { data: restaurant, error: restaurantError } = await adminClient
    .from("restaurants")
    .select("id,name,plan")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) return json({ error: "Restaurant not found." }, 404);

  const now = new Date().toISOString();

  const { data: current, error: currentError } = await adminClient
    .from("subscriptions")
    .select("id,plan_id,status,billing_cycle")
    .eq("restaurant_id", restaurantId)
    .in("status", ["trialing","active","past_due","paused"])
    .maybeSingle();

  if (currentError) return json({ error: currentError.message }, 400);

  if (current) {
    await adminClient.from("subscriptions").update({
      status: "cancelled",
      cancelled_at: now,
      end_date: now,
      updated_at: now,
    }).eq("id", current.id);
  }

  const { data: subscription, error: subscriptionError } = await adminClient
    .from("subscriptions")
    .insert({
      restaurant_id: restaurantId,
      plan_id: plan.id,
      status: "active",
      billing_cycle: billingCycle,
      start_date: now,
    })
    .select("id,restaurant_id,plan_id,status,billing_cycle,start_date,end_date,plans(code,name,price_monthly,price_yearly,currency)")
    .single();

  if (subscriptionError) return json({ error: subscriptionError.message }, 400);

  await adminClient.from("subscription_history").insert({
    restaurant_id: restaurantId,
    subscription_id: subscription.id,
    old_plan_id: current?.plan_id || null,
    new_plan_id: plan.id,
    old_status: current?.status || null,
    new_status: "active",
    reason: "Platform admin plan assignment",
  });

  await adminClient.from("restaurants").update({
    plan: planCode,
  }).eq("id", restaurantId);

  return json({ success: true, subscription });
});

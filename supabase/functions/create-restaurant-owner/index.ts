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

  if (!supabaseUrl || !publishableKey || !secretKey) {
    return json({ error: "Supabase function secrets are not configured." }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Authentication required." }, 401);
  }

  const accessToken = authHeader.replace("Bearer ", "");
  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const adminClient = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return json({ error: "Invalid authentication session." }, 401);
  }

  const { data: platformAdmin, error: adminCheckError } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (adminCheckError || !platformAdmin) {
    return json({ error: "Platform administrator access is required." }, 403);
  }

  const body = await req.json();
  const name = String(body.name || "").trim();
  const ownerName = String(body.ownerName || "").trim();
  const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const plan = String(body.plan || "basic").trim().toLowerCase();

  if (!name || !ownerName || !ownerEmail) {
    return json({ error: "Restaurant name, owner name and owner email are required." }, 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return json({ error: "Enter a valid owner email address." }, 400);
  }

  if (!["starter", "basic", "pro", "business", "enterprise"].includes(plan)) {
    return json({ error: "Invalid plan." }, 400);
  }

  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50) || "restaurant";
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: restaurant, error: restaurantError } = await adminClient
    .from("restaurants")
    .insert({
      name,
      slug,
      status: "pending",
      plan,
      owner_name: ownerName,
      owner_email: ownerEmail,
      phone: phone || null,
    })
    .select("id,name,slug,status,plan")
    .single();

  if (restaurantError) {
    return json({ error: restaurantError.message }, 400);
  }

  const siteUrl = "https://paybeforebite.github.io/restaurant-pos";
  const redirectTo = new URL("update-password.html", siteUrl.endsWith("/") ? siteUrl : siteUrl + "/").href;

  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(ownerEmail, {
    data: {
      restaurant_id: restaurant.id,
      restaurant_name: name,
      role: "owner",
      owner_name: ownerName,
    },
    redirectTo,
  });

  if (inviteError || !invited.user) {
    await adminClient.from("restaurants").delete().eq("id", restaurant.id);
    return json({ error: inviteError?.message || "Unable to send invitation." }, 400);
  }

  const { error: memberError } = await adminClient
    .from("restaurant_members")
    .insert({
      user_id: invited.user.id,
      restaurant_id: restaurant.id,
      role: "owner",
      is_active: true,
      invited_email: ownerEmail,
      invited_at: new Date().toISOString(),
    });

  if (memberError) {
    await adminClient.auth.admin.deleteUser(invited.user.id);
    await adminClient.from("restaurants").delete().eq("id", restaurant.id);
    return json({ error: memberError.message }, 400);
  }

  const { data: selectedPlan, error: planError } = await adminClient
    .from("plans")
    .select("id")
    .eq("code", plan)
    .eq("is_active", true)
    .single();

  if (planError || !selectedPlan) {
    await adminClient.auth.admin.deleteUser(invited.user.id);
    await adminClient.from("restaurants").delete().eq("id", restaurant.id);
    return json({ error: "The selected subscription plan is not available." }, 400);
  }

  const { error: subscriptionError } = await adminClient
    .from("subscriptions")
    .insert({
      restaurant_id: restaurant.id,
      plan_id: selectedPlan.id,
      status: "active",
      billing_cycle: "monthly",
      start_date: new Date().toISOString(),
    });

  if (subscriptionError) {
    await adminClient.auth.admin.deleteUser(invited.user.id);
    await adminClient.from("restaurants").delete().eq("id", restaurant.id);
    return json({ error: subscriptionError.message }, 400);
  }

  return json({
    success: true,
    restaurant,
    owner: {
      email: ownerEmail,
      user_id: invited.user.id,
    },
    message: "Restaurant created and activation email sent.",
  });
});

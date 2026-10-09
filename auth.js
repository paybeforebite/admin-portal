// Platform-admin-only session guard for the standalone admin portal.
const config = window.SUPABASE_CONFIG || {};
const client = window.supabase && config.url && config.publishableKey
  ? window.supabase.createClient(config.url, config.publishableKey)
  : null;

window.SUPABASE_CLIENT = client;
window.IS_PLATFORM_ADMIN = false;

const PLATFORM_PAGES = new Set([
  "platform-dashboard.html",
  "customers.html",
  "subscriptions.html",
  "analytics.html",
  "settings.html",
]);

function currentPage() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function redirectToLogin() {
  const page = currentPage();
  if (page !== "index.html" && PLATFORM_PAGES.has(page)) {
    sessionStorage.setItem("paybeforebite_requested_page", page);
  }
  if (page !== "index.html") window.location.replace("index.html");
}

async function isActivePlatformAdmin(userId) {
  const { data, error } = await client
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function guardPlatformPage() {
  if (!client) {
    if (currentPage() !== "index.html") redirectToLogin();
    throw new Error("Supabase is not configured.");
  }

  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;

  if (!session) {
    redirectToLogin();
    return null;
  }

  // The login controller handles sign-in and redirects after verifying admin status.
  if (currentPage() === "index.html") return session;

  let authorized = false;
  try {
    authorized = await isActivePlatformAdmin(session.user.id);
  } catch (_) {
    // Fail closed if the admin lookup fails.
    await client.auth.signOut();
    redirectToLogin();
    return null;
  }

  if (!authorized) {
    await client.auth.signOut();
    sessionStorage.removeItem("paybeforebite_requested_page");
    window.location.replace("index.html");
    return null;
  }

  window.IS_PLATFORM_ADMIN = true;
  document.querySelectorAll("[data-user-email]").forEach((element) => {
    element.textContent = session.user.email || "";
  });

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await client.auth.signOut();
      } finally {
        sessionStorage.removeItem("paybeforebite_requested_page");
        window.location.replace("index.html");
      }
    });
  });

  return session;
}

window.restaurantAuthReady = guardPlatformPage();

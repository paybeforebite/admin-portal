const form = document.getElementById("adminLoginForm");
const message = document.getElementById("adminLoginMessage");
const button = document.getElementById("adminLoginButton");

function showLoginMessage(text, isError = true) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.classList.toggle("success", !isError);
}

async function verifyPlatformAdmin(user) {
  const client = window.SUPABASE_CLIENT;
  if (!client || !user) return false;

  const { data, error } = await client
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function routeAuthorizedAdmin() {
  const client = window.SUPABASE_CLIENT;
  if (!client) throw new Error("Admin sign-in is temporarily unavailable.");

  const { data: { session }, error } = await client.auth.getSession();
  if (error) throw error;
  if (!session) return false;

  const isAdmin = await verifyPlatformAdmin(session.user);
  if (!isAdmin) {
    await client.auth.signOut();
    showLoginMessage("This account is not authorized to access the platform admin portal.");
    return false;
  }

  const requested = sessionStorage.getItem("paybeforebite_requested_page");
  sessionStorage.removeItem("paybeforebite_requested_page");
  const allowedPages = ["platform-dashboard.html", "customers.html", "subscriptions.html", "analytics.html", "settings.html"];
  window.location.replace(allowedPages.includes(requested) ? requested : "platform-dashboard.html");
  return true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  button.textContent = "Signing in…";
  showLoginMessage("");

  try {
    const client = window.SUPABASE_CLIENT;
    if (!client) throw new Error("Admin sign-in is temporarily unavailable.");

    const email = document.getElementById("adminEmail").value.trim().toLowerCase();
    const password = document.getElementById("adminPassword").value;
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error("Unable to sign in with those credentials.");

    const isAdmin = await verifyPlatformAdmin(data.user);
    if (!isAdmin) {
      await client.auth.signOut();
      throw new Error("This account is not authorized to access the platform admin portal.");
    }

    sessionStorage.removeItem("paybeforebite_requested_page");
    window.location.replace("platform-dashboard.html");
  } catch (error) {
    showLoginMessage(error.message || "Sign-in failed.");
  } finally {
    button.disabled = false;
    button.textContent = "Sign in";
  }
});

(async () => {
  try {
    await window.restaurantAuthReady;
    await routeAuthorizedAdmin();
  } catch (_) {
    // Keep the login page usable when there is no session or Supabase is offline.
  }
})();

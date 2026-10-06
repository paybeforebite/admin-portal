const config=window.SUPABASE_CONFIG||{};
const client=window.supabase&&config.url&&config.publishableKey?window.supabase.createClient(config.url,config.publishableKey):null;
window.SUPABASE_CLIENT=client;

const PLATFORM_PAGES=[
  "platform-dashboard.html",
  "customers.html",
  "subscriptions.html",
  "analytics.html",
  "settings.html"
];

const RESTAURANT_PAGES=[
  "dashboard.html",
  "billing.html",
  "menu.html",
  "restaurant-customers.html",
  "staff.html",
  "reports.html",
  "profile.html",
  "subscription.html"
];

const OWNER_ADMIN_PAGES=[
  "menu.html",
  "restaurant-customers.html",
  "staff.html",
  "subscription.html"
];

function currentPage(){
  return window.location.pathname.split("/").pop()||"index.html";
}

function redirectToLogin(){
  const page=currentPage();
  if(page==="index.html") return;
  const allowedNext=[...PLATFORM_PAGES,...RESTAURANT_PAGES];
  const next=allowedNext.includes(page)?page:"dashboard.html";
  sessionStorage.setItem("paybeforebite_requested_page", next);
  window.location.replace("index.html");
}

async function denyRouteAccess(){
  // Never expose a protected page after a direct/unauthorized URL attempt.
  // Clear the session and force the user through the login page again.
  if(client){
    try{ await client.auth.signOut(); }catch(_){}
  }
  sessionStorage.removeItem("paybeforebite_requested_page");
  window.location.replace("index.html");
}

async function loadRestaurantSession(){
  if(!client) throw new Error("Supabase is not configured.");

  const {data:{session},error}=await client.auth.getSession();
  if(error) throw error;
  if(!session){redirectToLogin();return null;}

  const {data:platformAdmin,error:platformError}=await client
    .from("platform_admins")
    .select("user_id")
    .eq("user_id",session.user.id)
    .eq("is_active",true)
    .maybeSingle();

  if(platformError) throw platformError;
  window.IS_PLATFORM_ADMIN=Boolean(platformAdmin);

  document.querySelectorAll("[data-logout]").forEach(b=>b.addEventListener("click",async()=>{
    b.disabled=true;
    await client.auth.signOut();
    location.replace("index.html");
  }));

  const page=currentPage();

  // Platform routes are restricted to active platform administrators.
  if(PLATFORM_PAGES.includes(page)&&!window.IS_PLATFORM_ADMIN){
    await denyRouteAccess();
    return null;
  }

  // A platform-only account should not enter restaurant routes unless it also
  // has an active restaurant membership.
  const {data:m,error:me}=await client
    .from("restaurant_members")
    .select("restaurant_id,role,restaurants(name,slug)")
    .eq("user_id",session.user.id)
    .eq("is_active",true)
    .maybeSingle();

  if(me) throw me;

  if(!m){
    if(window.IS_PLATFORM_ADMIN){
      window.RESTAURANT_ID=null;
      window.RESTAURANT_ROLE="platform_admin";
      window.RESTAURANT_NAME="PayBeforeBite Admin";
      document.querySelectorAll("[data-user-email]").forEach(e=>e.textContent=session.user.email||"");
      document.querySelectorAll("[data-restaurant-name]").forEach(e=>e.textContent="PayBeforeBite Admin");

      if(!PLATFORM_PAGES.includes(page)){
        await denyRouteAccess();
        return null;
      }
      return session;
    }

    await client.auth.signOut();
    window.location.replace("index.html");
    return null;
  }

  window.RESTAURANT_ID=m.restaurant_id;
  window.RESTAURANT_ROLE=String(m.role||"").trim().toLowerCase();
  window.RESTAURANT_NAME=m.restaurants?.name||"Restaurant";

  document.querySelectorAll("[data-user-email]").forEach(e=>e.textContent=session.user.email||"");
  document.querySelectorAll("[data-restaurant-name]").forEach(e=>e.textContent=window.RESTAURANT_NAME);
  document.querySelectorAll("[data-platform-admin]").forEach(e=>e.style.display=window.IS_PLATFORM_ADMIN?"flex":"none");

  // Restaurant routes require an active restaurant membership.
  if(RESTAURANT_PAGES.includes(page)){
    if(OWNER_ADMIN_PAGES.includes(page)&&!["owner","admin"].includes(window.RESTAURANT_ROLE)){
      await denyRouteAccess();
      return null;
    }
  }

  return session;
}

window.restaurantAuthReady=loadRestaurantSession();

const PLAN_CATALOG = [
  { code: "starter", name: "Starter", monthly: 299, yearly: 2999, limit: "100 invoices/day", staff: "2 staff", features: ["Billing", "Menu", "Dashboard"] },
  { code: "basic", name: "Basic", monthly: 599, yearly: 5999, limit: "300 invoices/day", staff: "5 staff", features: ["Billing", "Menu", "Customers", "Excel/PDF", "Multi-device"] },
  { code: "pro", name: "Pro", monthly: 999, yearly: 9999, limit: "1,000 invoices/day", staff: "10 staff", features: ["Everything in Basic", "Inventory", "Advanced reports", "Priority support"] },
  { code: "business", name: "Business", monthly: 1999, yearly: 19999, limit: "5,000 invoices/day", staff: "25 staff", features: ["Everything in Pro", "Multi-outlet", "API access", "Advanced operations"] },
  { code: "enterprise", name: "Enterprise", monthly: 0, yearly: 0, limit: "Custom", staff: "Custom", features: ["All features", "Custom integrations", "Dedicated support", "Custom SLA"] }
];

const state = { subscriptions: [] };
const tableBody = document.getElementById("subscriptionTableBody");
const message = document.getElementById("subscriptionMessage");
const modal = document.getElementById("subscriptionModal");
const form = document.getElementById("subscriptionForm");
const formMessage = document.getElementById("subscriptionFormMessage");

function money(value) {
  if (!value) return "Custom";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
}

function date(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function renderPlanCards() {
  document.getElementById("planCards").innerHTML = PLAN_CATALOG.map((plan) => \`
    <article class="subscription-plan-card \${plan.code === "pro" ? "featured" : ""}">
      \${plan.code === "pro" ? '<span class="plan-featured-badge">Recommended</span>' : ""}
      <div class="subscription-plan-header">
        <div><p class="eyebrow">\${escapeHtml(plan.code.toUpperCase())}</p><h3>\${escapeHtml(plan.name)}</h3></div>
        <strong>\${plan.monthly ? money(plan.monthly) : "Custom"}</strong>
      </div>
      <p class="subscription-price-note">\${plan.monthly ? "per month" : "Contact PayBeforeBite"}</p>
      <div class="subscription-plan-meta"><span>\${escapeHtml(plan.limit)}</span><span>\${escapeHtml(plan.staff)}</span></div>
      <ul>\${plan.features.map(feature => \`<li>\${escapeHtml(feature)}</li>\`).join("")}</ul>
      <div class="subscription-yearly">\${plan.yearly ? \`\${money(plan.yearly)}/year\` : "Custom annual pricing"}</div>
    </article>
  \`).join("");
}

function renderSubscriptions() {
  tableBody.innerHTML = state.subscriptions.length ? state.subscriptions.map((subscription) => {
    const plan = subscription.plans || {};
    const restaurant = subscription.restaurants || {};
    return \`
      <tr>
        <td><strong>\${escapeHtml(restaurant.name || "Restaurant")}</strong><div class="customer-slug">\${escapeHtml(restaurant.owner_name || restaurant.owner_email || "—")}</div></td>
        <td><span class="plan-badge">\${escapeHtml(plan.name || "Unknown")}</span><div class="customer-slug">\${plan.price_monthly ? \`\${money(plan.price_monthly)}/mo\` : "Custom"}</div></td>
        <td>\${escapeHtml(subscription.billing_cycle || "monthly")}</td>
        <td><span class="status-badge status-\${escapeHtml(subscription.status)}">\${escapeHtml(subscription.status)}</span></td>
        <td>\${date(subscription.start_date)}</td>
        <td><button class="action-btn" data-change-plan="\${escapeHtml(subscription.id)}">Change</button></td>
      </tr>
    \`;
  }).join("") : '<tr><td colspan="6" class="customer-empty">No subscriptions found.</td></tr>';

  tableBody.querySelectorAll("[data-change-plan]").forEach((button) => {
    button.addEventListener("click", () => openModal(button.dataset.changePlan));
  });
}

async function loadSubscriptions() {
  message.textContent = "Loading subscriptions...";
  try {
    const session = await window.restaurantAuthReady;
    if (!session || !window.SUPABASE_CLIENT) return;
    const { data, error } = await window.SUPABASE_CLIENT.functions.invoke("list-subscriptions");
    if (error) throw error;
    state.subscriptions = data?.subscriptions || [];
    renderSubscriptions();
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message || "Unable to load subscriptions.";
  }
}

function openModal(subscriptionId) {
  const subscription = state.subscriptions.find(item => item.id === subscriptionId);
  if (!subscription) return;
  document.getElementById("subscriptionRestaurantId").value = subscription.restaurant_id;
  document.getElementById("subscriptionModalTitle").textContent = \`Change plan — \${subscription.restaurants?.name || "Restaurant"}\`;
  document.getElementById("subscriptionPlan").value = subscription.plans?.code || "basic";
  document.getElementById("subscriptionBillingCycle").value = subscription.billing_cycle || "monthly";
  formMessage.textContent = "";
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  form.reset();
  formMessage.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("saveSubscriptionBtn");
  button.disabled = true;
  button.textContent = "Saving...";
  formMessage.textContent = "";
  try {
    const session = await window.restaurantAuthReady;
    if (!session || !window.SUPABASE_CLIENT) throw new Error("Your session has expired.");
    const { data, error } = await window.SUPABASE_CLIENT.functions.invoke("manage-subscription", {
      body: {
        restaurantId: document.getElementById("subscriptionRestaurantId").value,
        plan: document.getElementById("subscriptionPlan").value,
        billingCycle: document.getElementById("subscriptionBillingCycle").value
      }
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    closeModal();
    await loadSubscriptions();
    message.className = "login-message success";
    message.textContent = "Subscription updated successfully.";
  } catch (error) {
    formMessage.textContent = error.message || "Unable to update subscription.";
  } finally {
    button.disabled = false;
    button.textContent = "Save Plan";
  }
});

const refreshButton = document.getElementById("refreshSubscriptionsBtn");
refreshButton.addEventListener("click", async () => {
  refreshButton.disabled = true;
  refreshButton.textContent = "Refreshing...";
  message.className = "login-message";
  try {
    await loadSubscriptions();
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Refresh";
  }
});
document.getElementById("closeSubscriptionModal").addEventListener("click", closeModal);
document.getElementById("cancelSubscriptionBtn").addEventListener("click", closeModal);
modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});

renderPlanCards();
loadSubscriptions();

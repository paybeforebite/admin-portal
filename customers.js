const customerState = { customers: [] };

const tableBody = document.getElementById("customerTableBody");
const modal = document.getElementById("customerModal");
const form = document.getElementById("customerForm");
const formMessage = document.getElementById("customerFormMessage");
const message = document.getElementById("customerMessage");
const search = document.getElementById("customerSearch");
const statusFilter = document.getElementById("customerStatusFilter");

function moneyDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function planLabel(plan) {
  return ({ starter: "Starter", basic: "Basic", pro: "Pro", business: "Business", enterprise: "Enterprise" })[plan] || plan;
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderStats() {
  const customers = customerState.customers;
  document.getElementById("totalCustomers").textContent = customers.length;
  document.getElementById("pendingCustomers").textContent = customers.filter(c => c.status === "pending").length;
  document.getElementById("activeCustomers").textContent = customers.filter(c => c.status === "active").length;
  document.getElementById("suspendedCustomers").textContent = customers.filter(c => c.status === "suspended").length;
}

function renderCustomers() {
  const query = search.value.trim().toLowerCase();
  const status = statusFilter.value;

  const rows = customerState.customers.filter((customer) => {
    const matchesSearch = !query || [customer.name, customer.owner_name, customer.owner_email]
      .some(value => String(value || "").toLowerCase().includes(query));
    return matchesSearch && (!status || customer.status === status);
  });

  tableBody.innerHTML = rows.length ? rows.map(customer => `
    <tr>
      <td><strong>${escapeHtml(customer.name)}</strong><div class="customer-slug">${escapeHtml(customer.slug)}</div></td>
      <td><strong>${escapeHtml(customer.owner_name || "—")}</strong><div class="customer-slug">${escapeHtml(customer.owner_email || "—")}</div></td>
      <td><span class="plan-badge">${escapeHtml(planLabel(customer.plan))}</span></td>
      <td><span class="status-badge status-${escapeHtml(customer.status)}">${escapeHtml(statusLabel(customer.status))}</span></td>
      <td>${moneyDate(customer.created_at)}</td>
      <td>${moneyDate(customer.activated_at)}</td>
    </tr>
  `).join("") : '<tr><td colspan="6" class="customer-empty">No restaurants found.</td></tr>';
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

async function loadCustomers() {
  message.textContent = "Loading customers...";
  try {
    const session = await window.restaurantAuthReady;
    if (!session || !window.SUPABASE_CLIENT) return;

    const { data, error } = await window.SUPABASE_CLIENT.functions.invoke("list-customers");
    if (error) throw error;

    customerState.customers = data?.customers || [];
    renderStats();
    renderCustomers();
    message.textContent = "";
  } catch (error) {
    message.textContent = error.message || "Unable to load customers.";
  }
}

function openModal() {
  modal.classList.remove("hidden");
  document.getElementById("customerRestaurantName").focus();
}

function closeModal() {
  modal.classList.add("hidden");
  form.reset();
  formMessage.textContent = "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";
  const button = document.getElementById("createCustomerBtn");
  button.disabled = true;
  button.textContent = "Creating...";

  try {
    const session = await window.restaurantAuthReady;
    if (!session || !window.SUPABASE_CLIENT) throw new Error("Your session has expired.");

    const { data, error } = await window.SUPABASE_CLIENT.functions.invoke("create-restaurant-owner", {
      body: {
        name: document.getElementById("customerRestaurantName").value.trim(),
        ownerName: document.getElementById("customerOwnerName").value.trim(),
        ownerEmail: document.getElementById("customerOwnerEmail").value.trim(),
        phone: document.getElementById("customerPhone").value.trim(),
        plan: document.getElementById("customerPlan").value
      }
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    closeModal();
    await loadCustomers();
    message.className = "login-message success";
    message.textContent = "Restaurant created and activation email sent successfully.";
  } catch (error) {
    formMessage.textContent = error.message || "Unable to create restaurant.";
  } finally {
    button.disabled = false;
    button.textContent = "Create & Send Activation";
  }
});

document.getElementById("newCustomerBtn").addEventListener("click", openModal);
document.getElementById("closeCustomerModal").addEventListener("click", closeModal);
document.getElementById("cancelCustomerBtn").addEventListener("click", closeModal);
document.getElementById("refreshCustomersBtn").addEventListener("click", loadCustomers);
search.addEventListener("input", renderCustomers);
statusFilter.addEventListener("change", renderCustomers);

loadCustomers();

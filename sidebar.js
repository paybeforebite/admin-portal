const sidebar = document.getElementById("appSidebar");
const sidebarLogo = document.querySelector(".sidebar-logo");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const SIDEBAR_STATE_KEY = "restaurantSidebarExpandedV2";

function ensureMobileMenuButton() {
  if (document.getElementById("mobileMenuButton")) return;

  const button = document.createElement("button");
  button.id = "mobileMenuButton";
  button.className = "mobile-menu-button";
  button.type = "button";
  button.setAttribute("aria-label", "Open navigation menu");
  button.setAttribute("aria-controls", "appSidebar");
  button.setAttribute("aria-expanded", "false");
  button.innerHTML = '<span aria-hidden="true">☰</span>';
  document.body.appendChild(button);

  button.addEventListener("click", toggleSidebar);
}

function setMobileMenuState(open) {
  const button = document.getElementById("mobileMenuButton");
  if (!button) return;
  button.setAttribute("aria-expanded", String(open));
  button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  button.innerHTML = open
    ? '<span aria-hidden="true">×</span>'
    : '<span aria-hidden="true">☰</span>';
}

function setSidebarState(expanded) {
  if (!sidebar) return;
  sidebar.classList.toggle("collapsed", !expanded);
  document.body.classList.toggle("sidebar-expanded", expanded);
  localStorage.setItem(SIDEBAR_STATE_KEY, String(expanded));

  if (sidebarLogo) {
    sidebarLogo.setAttribute("aria-expanded", String(expanded));
    sidebarLogo.setAttribute(
      "aria-label",
      expanded ? "Collapse navigation" : "Expand navigation"
    );
    sidebarLogo.setAttribute(
      "title",
      expanded ? "Collapse navigation" : "Expand navigation"
    );
  }
}

function closeMobileSidebar() {
  if (!sidebar) return;
  sidebar.classList.remove("mobile-open");
  if (sidebarOverlay) sidebarOverlay.classList.remove("visible");
  setMobileMenuState(false);
}

function toggleSidebar() {
  if (!sidebar) return;

  if (window.matchMedia("(max-width: 760px)").matches) {
    const open = !sidebar.classList.contains("mobile-open");
    sidebar.classList.toggle("mobile-open", open);
    sidebarOverlay?.classList.toggle("visible", open);
    setMobileMenuState(open);
    return;
  }

  setSidebarState(sidebar.classList.contains("collapsed"));
}

function initSidebar() {
  if (!sidebar) return;

  ensureMobileMenuButton();

  const savedState = localStorage.getItem(SIDEBAR_STATE_KEY);
  const isMobile = window.matchMedia("(max-width: 760px)").matches;
  setSidebarState(savedState === null ? !isMobile : savedState === "true");

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  sidebar.querySelectorAll(".sidebar-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === currentPage);
  });

  sidebarLogo?.addEventListener("click", toggleSidebar);
  sidebarLogo?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSidebar();
    }
  });

  sidebarOverlay?.addEventListener("click", closeMobileSidebar);

  sidebar.querySelectorAll(".sidebar-link").forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 760px)").matches) {
        closeMobileSidebar();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && window.matchMedia("(max-width: 760px)").matches) {
      closeMobileSidebar();
    }
  });

  window.addEventListener("resize", () => {
    if (!window.matchMedia("(max-width: 760px)").matches) {
      closeMobileSidebar();
      const expanded = localStorage.getItem(SIDEBAR_STATE_KEY);
      setSidebarState(expanded !== "false");
    } else {
      setMobileMenuState(sidebar.classList.contains("mobile-open"));
    }
  });
}

initSidebar();

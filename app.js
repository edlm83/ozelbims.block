/*
   Block Inventory Management System - Core Application Engine (Compat Mode)
   Özel Bims Envanter Takip ve Yönetim Sistemi
   Enforces a frictionless View-Only by default flow. 
   Unlocks full administrative entry/edits via a simple password prompt.
*/

// --- CONFIGURATION ---
const ADMIN_PASSWORD = "1234"; // default manager password to unlock actions

// --- STATE MANAGEMENT ---
let currentUser = null;
let blockTypesList = [];
let monthlyChartInstance = null;
let distributionChartInstance = null;

// --- CORE SYSTEM INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  setupEventListeners();
  checkSession();
  initAutoSync();
  updateNetworkStatus();
});

const updateNetworkStatus = () => {
  const badge = document.getElementById("network-status");
  if (!badge) return;
  const dot = badge.querySelector(".network-dot");
  const text = document.getElementById("network-text");
  
  if (navigator.onLine) {
    dot.className = "network-dot online-dot";
    text.textContent = "Bağlı ve Hazır";
    badge.style.setProperty("--network-bg", "hsla(142, 76%, 45%, 0.08)");
    badge.style.setProperty("--network-border", "hsla(142, 76%, 45%, 0.2)");
    badge.style.setProperty("--network-text-color", "var(--success)");
  } else {
    dot.className = "network-dot offline-dot";
    text.textContent = "Bağlantı Yok";
    badge.style.setProperty("--network-bg", "hsla(0, 84%, 60%, 0.08)");
    badge.style.setProperty("--network-border", "hsla(0, 84%, 60%, 0.2)");
    badge.style.setProperty("--network-text-color", "var(--danger)");
  }
};

window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

const initTheme = () => {
  const savedTheme = localStorage.getItem("theme") || "dark";
  const toggleIcon = document.getElementById("theme-toggle-icon");
  if (savedTheme === "light") {
    document.body.classList.add("light-theme");
    if (toggleIcon) {
      toggleIcon.className = "fas fa-moon";
    }
  } else {
    document.body.classList.remove("light-theme");
    if (toggleIcon) {
      toggleIcon.className = "fas fa-sun";
    }
  }
};

// --- SESSION MANAGEMENT ---
const checkSession = () => {
  const isAdminLoggedIn = sessionStorage.getItem("admin_logged_in");
  if (isAdminLoggedIn === "true") {
    currentUser = { role: "admin", name: "Genel Yönetici" };
  } else {
    currentUser = { role: "viewer", name: "Takipçi İzleyici" };
  }
  onLoginSuccess();
};

const onLoginSuccess = async () => {
  const roleBadge = document.getElementById("header-user-role");
  const loginBtn = document.getElementById("btn-admin-login");
  
  roleBadge.className = "badge-role"; // reset classes
  
  if (currentUser.role === "admin") {
    roleBadge.textContent = "Yönetici Modu";
    roleBadge.classList.add("badge-admin");
    
    loginBtn.innerHTML = '<i class="fas fa-lock"></i> Yönetici Çıkışı';
    loginBtn.className = "btn btn-secondary";
    loginBtn.style.borderColor = "hsla(0, 84%, 60%, 0.3)";
    loginBtn.style.color = "var(--danger)";
  } else {
    roleBadge.textContent = "İzleyici Modu";
    roleBadge.classList.add("badge-owner");
    
    loginBtn.innerHTML = '<i class="fas fa-key"></i> Yönetici Girişi';
    loginBtn.className = "btn btn-primary";
    loginBtn.style.borderColor = "";
    loginBtn.style.color = "";
  }

  // Handle Navigation Toggles based on current permissions
  enforceRolePermissions();
  
  // Load core datasets
  await refreshApplicationData();
};

const enforceRolePermissions = () => {
  const tabProd = document.getElementById("tab-production-portal");
  const tabDisp = document.getElementById("tab-dispatch-portal");
  const tabAdmin = document.getElementById("tab-admin-portal");

  if (currentUser.role === "admin") {
    // Reveal all portal inputs
    tabProd.classList.remove("hidden");
    tabDisp.classList.remove("hidden");
    tabAdmin.classList.remove("hidden");
  } else {
    // View-Only: hide inputs and lock view to owner dashboard
    tabProd.classList.add("hidden");
    tabDisp.classList.add("hidden");
    tabAdmin.classList.add("hidden");
    
    switchTab("owner-dashboard");
  }
};

// --- NOTIFICATION BANNER UTILITY ---
const showAlert = (message, type = "success") => {
  const container = document.getElementById("alert-container");
  const banner = document.getElementById("alert-banner");
  const icon = document.getElementById("alert-icon");
  const messageSpan = document.getElementById("alert-message");

  banner.className = `alert-banner alert-${type}`;
  messageSpan.textContent = message;

  if (type === "success") {
    icon.className = "fas fa-check-circle";
  } else if (type === "error") {
    icon.className = "fas fa-exclamation-circle";
  } else {
    icon.className = "fas fa-info-circle";
  }

  container.style.display = "block";
  container.style.opacity = "1";

  setTimeout(() => {
    container.style.opacity = "0";
    setTimeout(() => {
      container.style.display = "none";
    }, 300);
  }, 4000);
};

// --- CUSTOM DIALOG CONFIRM MODAL UTILITY ---
const showConfirm = (message, callback) => {
  const modal = document.getElementById("confirm-modal");
  const msgEl = document.getElementById("confirm-modal-message");
  const btnApprove = document.getElementById("btn-confirm-approve");
  const btnCancel = document.getElementById("btn-confirm-cancel");
  const btnClose = document.getElementById("btn-close-confirm-modal");

  msgEl.innerHTML = message;
  modal.classList.add("active");

  // Clear previous event listeners using cloneNode
  const newApprove = btnApprove.cloneNode(true);
  btnApprove.replaceWith(newApprove);
  
  const closeModal = () => {
    modal.classList.remove("active");
  };

  newApprove.addEventListener("click", () => {
    closeModal();
    callback();
  });

  btnCancel.onclick = closeModal;
  btnClose.onclick = closeModal;
  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };
};

// --- DATA MANAGEMENT ENGINE ---
const refreshApplicationData = async () => {
  try {
    blockTypesList = await window.dbOps.getBlockTypes();
    
    // Populate Select Options inside forms
    populateBlockSelects();

    // Refresh Sub-Views based on what is active
    await renderStatsAndDashboard();

    // Update Connection & Sync Status (Current browser time)
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");
    const syncTimeStr = `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    
    const lastSyncEl = document.getElementById("last-sync-time");
    if (lastSyncEl) {
      lastSyncEl.textContent = syncTimeStr;
    }

    // Update Last Data Entry Status (Accurate last database modification timestamp)
    let lastUpdateTs = await window.dbOps.getLastUpdateTimestamp();
    const txs = await window.dbOps.getTransactions();
    
    // Fallback to latest transaction if no explicit modification has been tracked yet
    if (!lastUpdateTs && txs.length > 0) {
      lastUpdateTs = txs[0].date;
    }
    
    let lastDataUpdateStr = "Kayıtlı işlem bulunamadı";
    if (lastUpdateTs) {
      const dateObj = new Date(lastUpdateTs);
      const dDay = String(dateObj.getDate()).padStart(2, "0");
      const dMonth = String(dateObj.getMonth() + 1).padStart(2, "0");
      const dYear = dateObj.getFullYear();
      const dHours = String(dateObj.getHours()).padStart(2, "0");
      const dMinutes = String(dateObj.getMinutes()).padStart(2, "0");
      const dSeconds = String(dateObj.getSeconds()).padStart(2, "0");
      lastDataUpdateStr = `${dDay}/${dMonth}/${dYear} ${dHours}:${dMinutes}:${dSeconds}`;
    }
    
    const lastDataUpdateEl = document.getElementById("last-data-update-time");
    if (lastDataUpdateEl) {
      lastDataUpdateEl.textContent = lastDataUpdateStr;
    }
  } catch (error) {
    showAlert("Veriler yüklenirken hata oluştu: " + error.message, "error");
  }
};

const populateBlockSelects = () => {
  const selects = [
    document.getElementById("prod-block-type"),
    document.getElementById("prod-damage-type"),
    document.getElementById("rep-block-type"),
    document.getElementById("load-damage-type"),
    document.getElementById("edit-tx-block-type")
  ];

  selects.forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">Seçiniz...</option>';
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} - ${b.blocks_per_pallet || 120} adet/palet`;
      sel.appendChild(opt);
    });
  });

  const firstDispSelect = document.querySelector(".disp-item-select");
  if (firstDispSelect) {
    firstDispSelect.innerHTML = '<option value="">Seçiniz...</option>';
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} - ${b.blocks_per_pallet || 120} adet/palet`;
      firstDispSelect.appendChild(opt);
    });
  }
};

// Render elements inside active subview
const renderStatsAndDashboard = async () => {
  const activeTab = document.querySelector(".tab-btn.active");
  if (!activeTab) return;
  const viewId = activeTab.getAttribute("data-target");

  if (viewId === "owner-dashboard") {
    const stats = await window.dbOps.getStats();
    document.getElementById("stat-total-stock").textContent = stats.totalStock.toLocaleString("tr-TR");
    document.getElementById("stat-month-production").textContent = stats.monthProduction.toLocaleString("tr-TR");
    document.getElementById("stat-month-dispatch").textContent = stats.monthDispatch.toLocaleString("tr-TR");
    document.getElementById("stat-total-repair").textContent = stats.totalUnderRepair.toLocaleString("tr-TR");

    renderInventoryTable();
    renderDashboardLogs();
    renderDashboardCharts();
  } 
  
  else if (viewId === "production-portal" || viewId === "dispatch-portal") {
    renderPortalLogs(viewId);
  }
  
  else if (viewId === "admin-portal") {
    renderAdminBlockList();
  }
};

// --- RENDERING VIEWS IMPLEMENTATIONS ---

// Available Stocks Table
const renderInventoryTable = () => {
  const tbody = document.getElementById("inventory-table-body");
  const searchQuery = document.getElementById("inventory-search").value.toLowerCase();
  tbody.innerHTML = "";

  const filtered = blockTypesList.filter(b => b.name.toLowerCase().includes(searchQuery));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Arama sonucuyla eşleşen blok tipi bulunamadı.</td></tr>`;
    return;
  }

  filtered.forEach(b => {
    const min = b.min_threshold || 10;
    const max = b.max_threshold || 100;
    const perPallet = b.blocks_per_pallet || 120;
    const current = b.current_stock; // in pallets

    // Convert to pieces for reference
    const initPieces = b.initial_stock * perPallet;
    const repairPieces = b.under_repair_stock * perPallet;
    const currentPieces = current * perPallet;

    let stockClass = "stock-high";
    let stockStatus = "Bolluk Seviyesinde";
    let badgeColor = "hsl(142, 76%, 45%)"; // Vibrant green

    if (current <= min) {
      stockClass = "stock-low";
      stockStatus = "Kritik Stok (Tehlike)";
      badgeColor = "hsl(0, 84%, 60%)"; // Danger Red
    } else if (current > min && current <= min + (max - min) * 0.5) {
      stockClass = "stock-medium";
      stockStatus = "Kritik Sınıra Yakın";
      badgeColor = "hsl(45, 100%, 51%)"; // Warning Gold/Orange
    } else if (current > min + (max - min) * 0.5 && current < max) {
      stockClass = "stock-high";
      stockStatus = "Güvenli Seviyede";
      badgeColor = "hsl(88, 76%, 45%)"; // Light Green
    } else {
      stockClass = "stock-high";
      stockStatus = "Bolluk Seviyesinde";
      badgeColor = "hsl(142, 76%, 45%)"; // Vibrant Green
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--text-primary);">${b.name}</td>
      <td style="color: var(--text-secondary); font-size: 0.85rem;">
        <span style="font-weight: bold; color: var(--text-primary);">${b.initial_stock.toLocaleString("tr-TR")}</span> palet<br>
        <span style="color: var(--text-muted); font-size: 0.75rem;">(${initPieces.toLocaleString("tr-TR")} adet)</span>
      </td>
      <td style="color: var(--warning); font-size: 0.85rem;">
        <span style="font-weight: bold;">${b.under_repair_stock.toLocaleString("tr-TR")}</span> palet<br>
        <span style="color: var(--text-muted); font-size: 0.75rem;">(${repairPieces.toLocaleString("tr-TR")} adet)</span>
      </td>
      <td style="font-size: 0.9rem; color: ${current <= min ? "var(--danger)" : "var(--text-primary)"};">
        <span style="font-weight: 800; font-size: 1.05rem;">${current.toLocaleString("tr-TR")}</span> palet<br>
        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">(${currentPieces.toLocaleString("tr-TR")} adet)</span>
      </td>
      <td>
        <span class="stock-indicator ${stockClass}" style="background-color: ${badgeColor};"></span>
        <span style="font-size: 0.85rem; font-weight: bold; color: ${badgeColor};">${stockStatus}</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
};

// General Logs Rendering (With Delete & Edit Hooks)
const renderDashboardLogs = async () => {
  const container = document.getElementById("dashboard-log-list");
  container.innerHTML = "";
  const txs = await window.dbOps.getTransactions();

  if (txs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">İşlem geçmişi tamamen boş.</div>`;
    return;
  }

  txs.slice(0, 15).forEach(t => {
    let qtySign = "";
    let qtyClass = "";
    let actionTitle = "";
    let itemClass = "";

    if (t.type === "production") {
      qtySign = "+";
      qtyClass = "qty-plus";
      actionTitle = `Üretim Girişi: ${t.block_name}`;
      itemClass = "prod";
    } else if (t.type === "dispatch") {
      qtySign = "-";
      qtyClass = "qty-minus";
      actionTitle = `Sevkiyat Çıkışı: ${t.block_name}`;
      itemClass = "disp";
    } else if (t.type === "waste") {
      qtySign = "-";
      qtyClass = "qty-minus";
      actionTitle = `Kullanılamaz Heder: ${t.block_name}`;
      itemClass = "waste";
    } else if (t.type === "to_repair") {
      qtySign = "-";
      qtyClass = "qty-warning";
      actionTitle = `Onarıma Sevk: ${t.block_name}`;
      itemClass = "to_repair";
    } else if (t.type === "repaired") {
      qtySign = "+";
      qtyClass = "qty-accent";
      actionTitle = `Stoğa Geri Kazanım: ${t.block_name}`;
      itemClass = "repaired";
    }

    const dateObj = new Date(t.date);
    const timeStr = dateObj.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }) + " " + dateObj.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const isEditable = currentUser.role === "admin"; // Buttons only show in admin/manager mode!

    const block = blockTypesList.find(b => b.id === t.block_type_id);
    const perPallet = block ? block.blocks_per_pallet : 120;
    const pieces = t.quantity * perPallet;

    const item = document.createElement("div");
    item.className = `log-item ${itemClass}`;
    item.style.flexDirection = "column";
    item.style.alignItems = "stretch";
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="log-details">
          <span class="log-title">${actionTitle}</span>
          <span class="log-meta">
            <i class="fas fa-user-edit"></i> ${t.created_by} • 
            <i class="fas fa-clock"></i> ${timeStr} 
            ${t.notes ? `• <i class="fas fa-sticky-note"></i> ${t.notes}` : ""}
          </span>
        </div>
        <div style="text-align: left; display: flex; flex-direction: column;">
          <span class="log-quantity ${qtyClass}">${qtySign}${t.quantity.toLocaleString("tr-TR")} palet</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-top: 0.1rem;">(${pieces.toLocaleString("tr-TR")} adet)</span>
        </div>
      </div>
      ${isEditable ? `
      <div class="log-actions" style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm btn-edit-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> Düzenle
        </button>
        <button class="btn btn-secondary btn-sm btn-delete-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0,84%,60%,0.2);">
          <i class="fas fa-trash-alt"></i> Sil
        </button>
      </div>
      ` : ""}
    `;
    container.appendChild(item);
  });

  bindLogActionsEvents(txs);
};

// Portal logs render
const renderPortalLogs = async (portalId) => {
  const containerId = portalId === "production-portal" ? "prod-portal-logs" : "disp-portal-logs";
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  const txs = await window.dbOps.getTransactions();
  const todayStart = new Date().setHours(0,0,0,0);
  // In single-auth flow, all operations are entered by 'Genel Yönetici'
  const myTxs = txs.filter(t => t.date >= todayStart && t.created_by === "Genel Yönetici");

  if (myTxs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">Bugün henüz bir işlem kaydetmediniz.</div>`;
    return;
  }

  myTxs.forEach(t => {
    let actionTitle = "";
    let badgeClass = "";
    let sign = "";

    if (t.type === "production") {
      actionTitle = "Üretim Girişi";
      badgeClass = "badge-prod";
      sign = "+";
    } else if (t.type === "dispatch") {
      actionTitle = "Sevkiyat Çıkışı";
      badgeClass = "badge-disp";
      sign = "-";
    } else if (t.type === "waste") {
      actionTitle = "Kullanılamaz Fire";
      badgeClass = "badge-admin";
      sign = "-";
    } else if (t.type === "to_repair") {
      actionTitle = "Onarıma Sevk";
      badgeClass = "badge-disp";
      sign = "-";
    } else if (t.type === "repaired") {
      actionTitle = "Stoğa Kazanım";
      badgeClass = "badge-owner";
      sign = "+";
    }

    const timeStr = new Date(t.date).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", hour12: false });

    const block = blockTypesList.find(b => b.id === t.block_type_id);
    const perPallet = block ? block.blocks_per_pallet : 120;
    const pieces = t.quantity * perPallet;

    const item = document.createElement("div");
    item.className = "log-item";
    item.style.flexDirection = "column";
    item.style.alignItems = "stretch";
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="log-details">
          <span class="log-title">${t.block_name}</span>
          <span class="log-meta">
            <span class="badge-role ${badgeClass}" style="padding: 0.15rem 0.4rem; font-size: 0.7rem;">${actionTitle}</span>
            • <i class="fas fa-clock"></i> ${timeStr} 
            ${t.notes ? `• ${t.notes}` : ""}
          </span>
        </div>
        <div style="text-align: left; display: flex; flex-direction: column;">
          <span class="log-quantity" style="color: var(--primary); font-weight: bold;">${sign}${t.quantity.toLocaleString("tr-TR")} palet</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">(${pieces.toLocaleString("tr-TR")} adet)</span>
        </div>
      </div>
      <div class="log-actions" style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm btn-edit-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> Düzenle
        </button>
        <button class="btn btn-secondary btn-sm btn-delete-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0,84%,60%,0.2);">
          <i class="fas fa-trash-alt"></i> Sil
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  bindLogActionsEvents(txs);
};

// Bind Click Listeners to Edit and Delete buttons on dynamic logs list
const bindLogActionsEvents = (txs) => {
  // 1. DELETE ACTION
  document.querySelectorAll(".btn-delete-tx").forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // remove duplicate events
  });
  
  document.querySelectorAll(".btn-delete-tx").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const txId = btn.getAttribute("data-id");
      showConfirm("⚠️ Bu işlemi silmek istediğinizden tamamen emin misiniz? Stok miktarları anlık olarak geri hesaplanacaktır!", async () => {
        try {
          await window.dbOps.deleteTransaction(txId);
          showAlert("İşlem silindi ve stok miktarları başarıyla geri güncellendi!", "success");
          await refreshApplicationData();
        } catch (error) {
          showAlert("Silme işlemi esnasında hata: " + error.message, "error");
        }
      });
    });
  });

  // 2. EDIT ACTION (Modal trigger)
  document.querySelectorAll(".btn-edit-tx").forEach(btn => {
    btn.replaceWith(btn.cloneNode(true)); // remove duplicate events
  });

  document.querySelectorAll(".btn-edit-tx").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const txId = btn.getAttribute("data-id");
      const tx = txs.find(t => t.id === txId);
      if (!tx) return;

      document.getElementById("edit-tx-id").value = tx.id;
      
      let typeLabel = "İşlem";
      if (tx.type === "production") typeLabel = "Üretim Girişi";
      else if (tx.type === "dispatch") typeLabel = "Sevkiyat Çıkışı";
      else if (tx.type === "waste") typeLabel = "Kullanılamaz Fire";
      else if (tx.type === "to_repair") typeLabel = "Onarıma Sevk";
      else if (tx.type === "repaired") typeLabel = "Stoğa Kazanım";

      document.getElementById("edit-tx-label").textContent = `${typeLabel} | Sorumlu: ${tx.created_by}`;
      document.getElementById("edit-tx-block-type").value = tx.block_type_id;
      document.getElementById("edit-tx-quantity").value = tx.quantity;
      document.getElementById("edit-tx-notes").value = tx.notes || "";

      document.getElementById("edit-tx-modal").classList.add("active");
    });
  });
};

const renderAdminBlockList = () => {
  const container = document.getElementById("admin-block-types-list");
  container.innerHTML = "";

  if (blockTypesList.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted);">Sistemde tanımlı blok tipi bulunamadı.</div>`;
    return;
  }

  blockTypesList.forEach(b => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.style.borderLeftColor = "var(--danger)";
    item.style.flexDirection = "column";
    item.style.alignItems = "stretch";
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="log-details">
          <span class="log-title" style="font-weight: bold; color: var(--text-primary);">${b.name}</span>
          <span class="log-meta">
            Palet Kapasitesi: <span style="color: var(--accent-blue); font-weight: bold;">${b.blocks_per_pallet || 120} adet</span> • 
            Başlangıç Stoğu: ${b.initial_stock.toLocaleString("tr-TR")} palet • 
            Kritik Sınır: <span style="color: var(--danger); font-weight: bold;">${(b.min_threshold || 10).toLocaleString("tr-TR")} palet</span> • 
            Bolluk Sınırı: <span style="color: var(--success); font-weight: bold;">${(b.max_threshold || 100).toLocaleString("tr-TR")} palet</span>
          </span>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm edit-block-btn" data-id="${b.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> Özellikleri Düzenle
        </button>
        <button class="btn btn-secondary btn-sm delete-block-btn" data-id="${b.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0, 84%, 60%, 0.2);">
          <i class="fas fa-trash-alt"></i> Sil
        </button>
      </div>
    `;
    container.appendChild(item);
  });

  // Bind Edit Block Events
  document.querySelectorAll(".edit-block-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-id");
      const block = blockTypesList.find(b => b.id === id);
      if (!block) return;

      document.getElementById("edit-block-id").value = block.id;
      document.getElementById("edit-block-name").value = block.name;
      document.getElementById("edit-block-min-threshold").value = block.min_threshold || 10;
      document.getElementById("edit-block-max-threshold").value = block.max_threshold || 100;
      document.getElementById("edit-block-initial-stock").value = block.initial_stock || 0;
      document.getElementById("edit-block-per-pallet").value = block.blocks_per_pallet || 120;

      document.getElementById("edit-block-modal").classList.add("active");
    });
  });

  document.querySelectorAll(".delete-block-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.getAttribute("data-id");
      const block = blockTypesList.find(b => b.id === id);
      showConfirm(`⚠️ <strong>"${block.name}"</strong> blok tipini tamamen silmek istediğinizden emin misiniz? Bu tipe ait tüm envanter verileri silinecektir!`, async () => {
        try {
          await window.dbOps.deleteBlockType(id);
          showAlert("Blok tipi başarıyla silindi!", "success");
          await refreshApplicationData();
        } catch (error) {
          showAlert("Silme işlemi esnasında hata: " + error.message, "error");
        }
      });
    });
  });
};

const renderDashboardCharts = async () => {
  const data = await window.dbOps.getAnalyticsData();

  if (monthlyChartInstance) monthlyChartInstance.destroy();
  if (distributionChartInstance) distributionChartInstance.destroy();

  const isLight = document.body.classList.contains("light-theme");
  const chartTextColor = isLight ? "hsl(222, 15%, 35%)" : "hsl(218, 15%, 75%)";
  const chartTickColor = isLight ? "hsl(222, 10%, 45%)" : "hsl(218, 12%, 55%)";
  const chartGridColor = isLight ? "hsla(222, 15%, 35%, 0.08)" : "hsla(222, 25%, 25%, 0.2)";

  const ctxMonthly = document.getElementById("monthlyChart").getContext("2d");
  monthlyChartInstance = new Chart(ctxMonthly, {
    type: "line",
    data: {
      labels: data.weeklyComparison.labels,
      datasets: [
        {
          label: "Günlük Toplam Üretim",
          data: data.weeklyComparison.production,
          borderColor: "hsl(142, 76%, 45%)",
          backgroundColor: "hsla(142, 76%, 45%, 0.1)",
          borderWidth: 3,
          tension: 0.35,
          fill: true
        },
        {
          label: "Günlük Toplam Sevkiyat",
          data: data.weeklyComparison.dispatch,
          borderColor: "hsl(358, 90%, 52%)",
          backgroundColor: "hsla(358, 90%, 52%, 0.1)",
          borderWidth: 3,
          tension: 0.35,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: chartTextColor, font: { family: "Tajawal" } } }
      },
      scales: {
        x: { grid: { color: chartGridColor }, ticks: { color: chartTickColor, font: { family: "Tajawal" } } },
        y: { grid: { color: chartGridColor }, ticks: { color: chartTickColor, font: { family: "Tajawal" } } }
      }
    }
  });

  const ctxDist = document.getElementById("stockDistributionChart").getContext("2d");
  distributionChartInstance = new Chart(ctxDist, {
    type: "doughnut",
    data: {
      labels: data.distribution.labels,
      datasets: [{
        label: "Palet Miktarı",
        data: data.distribution.datasets[0].data,
        backgroundColor: data.distribution.datasets[0].backgroundColor,
        borderColor: data.distribution.datasets[0].borderColor,
        borderWidth: data.distribution.datasets[0].borderWidth
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: "right", 
          labels: { color: chartTextColor, font: { family: "Tajawal" } } 
        }
      }
    }
  });
};

const switchTab = (targetViewId) => {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    if (btn.getAttribute("data-target") === targetViewId) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  document.querySelectorAll(".tab-content").forEach(view => {
    if (view.id === `subview-${targetViewId}`) {
      view.classList.remove("hidden");
    } else {
      view.classList.add("hidden");
    }
  });

  renderStatsAndDashboard();
};

// --- EVENTS BINDINGS ---
const setupEventListeners = () => {
  
  // 1. Admin Login Button Trigger (Unlocks Modal or executes Logout)
  document.getElementById("btn-admin-login").addEventListener("click", () => {
    if (currentUser.role === "viewer") {
      // Show login modal
      document.getElementById("admin-login-modal").classList.add("active");
      document.getElementById("admin-password").focus();
    } else {
      // Log out of admin, go back to viewer
      currentUser = { role: "viewer", name: "Takipçi İzleyici" };
      sessionStorage.removeItem("admin_logged_in");
      showAlert("Yönetici kontrol paneli kilitlendi ve İzleyici Moduna dönüldü.", "info");
      onLoginSuccess();
    }
  });

  // 2. Admin Login Modal Closures
  const loginModal = document.getElementById("admin-login-modal");
  document.getElementById("btn-close-login-modal").addEventListener("click", () => {
    loginModal.classList.remove("active");
  });
  loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) {
      loginModal.classList.remove("active");
    }
  });

  // 3. Admin Password Submission Handler
  document.getElementById("form-admin-login").addEventListener("submit", (e) => {
    e.preventDefault();
    const passInput = document.getElementById("admin-password");
    const pass = passInput.value;

    if (pass === ADMIN_PASSWORD) {
      currentUser = { role: "admin", name: "Genel Yönetici" };
      sessionStorage.setItem("admin_logged_in", "true");
      
      loginModal.classList.remove("active");
      document.getElementById("form-admin-login").reset();
      passInput.blur(); // Dismiss soft keyboard on mobile!
      
      showAlert("Yönetici yetkileri başarıyla aktif edildi!", "success");
      onLoginSuccess();
    } else {
      showAlert("Yönetici şifresi hatalı! Lütfen tekrar deneyiniz.", "error");
    }
  });

  // 4. Theme Toggle Button Handler
  document.getElementById("btn-theme-toggle").addEventListener("click", () => {
    const isLight = document.body.classList.toggle("light-theme");
    const toggleIcon = document.getElementById("theme-toggle-icon");
    if (isLight) {
      localStorage.setItem("theme", "light");
      if (toggleIcon) toggleIcon.className = "fas fa-moon";
    } else {
      localStorage.setItem("theme", "dark");
      if (toggleIcon) toggleIcon.className = "fas fa-sun";
    }
    renderDashboardCharts(); // Redraw charts with correct text colors!
  });

  // Tabs Switch
  document.getElementById("tab-nav-bar").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab-btn");
    if (!btn) return;
    switchTab(btn.getAttribute("data-target"));
  });

  // Search Filter
  document.getElementById("inventory-search").addEventListener("input", renderInventoryTable);

  // ==========================================
  // MULTI-ITEM DISPATCH UI LOGIC
  // ==========================================
  
  document.getElementById("btn-add-dispatch-row").addEventListener("click", () => {
    const container = document.getElementById("dispatch-items-container");
    const row = document.createElement("div");
    row.className = "dispatch-item-row grid-2";
    row.style.cssText = "margin-bottom: 0.75rem; align-items: flex-end; position: relative;";
    
    row.innerHTML = `
      <div class="form-group" style="margin-bottom: 0; width: 100%;">
        <select class="form-input disp-item-select" required>
          <option value="">Seçiniz...</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0; width: 100%; display: flex; gap: 0.5rem; align-items: center;">
        <input class="form-input disp-item-qty" type="number" min="1" placeholder="Örn: 15" required>
        <button type="button" class="btn btn-danger btn-remove-row" style="width: auto; padding: 0.75rem; border-radius: var(--border-radius-sm); margin-bottom: 0;">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;

    const selectEl = row.querySelector(".disp-item-select");
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} - ${b.blocks_per_pallet || 120} adet/palet`;
      selectEl.appendChild(opt);
    });

    row.querySelector(".btn-remove-row").addEventListener("click", () => {
      row.remove();
    });

    container.appendChild(row);
  });

  const resetDispatchForm = () => {
    document.getElementById("form-add-dispatch").reset();
    const container = document.getElementById("dispatch-items-container");
    const rows = container.querySelectorAll(".dispatch-item-row");
    for (let i = 1; i < rows.length; i++) {
      rows[i].remove();
    }
  };

  // Dispatch/Loading Submit
  document.getElementById("form-add-dispatch").addEventListener("submit", async (e) => {
    e.preventDefault();
    const customer = document.getElementById("disp-customer").value.trim();
    const ticketNo = document.getElementById("disp-ticket-no").value.trim();
    const notes = document.getElementById("disp-notes").value.trim();

    const rows = document.querySelectorAll(".dispatch-item-row");
    const itemsToLoad = [];
    
    rows.forEach(row => {
      const blockId = row.querySelector(".disp-item-select").value;
      const qty = Number(row.querySelector(".disp-item-qty").value);
      if (blockId && qty > 0) {
        itemsToLoad.push({ blockId, qty });
      }
    });

    if (itemsToLoad.length === 0) {
      showAlert("Fişe en az bir adet blok tipi eklemelisiniz!", "error");
      return;
    }

    try {
      const stockAggregate = {};
      itemsToLoad.forEach(item => {
        stockAggregate[item.blockId] = (stockAggregate[item.blockId] || 0) + item.qty;
      });

      for (const blockId in stockAggregate) {
        const block = blockTypesList.find(b => b.id === blockId);
        if (!block) throw new Error("Blok tipi tanımlı değil!");
        if (block.current_stock < stockAggregate[blockId]) {
          throw new Error(`"${block.name}" için yetersiz stok! Mevcut Stok: ${block.current_stock} palet - İstenen: ${stockAggregate[blockId]} palet.`);
        }
      }

      const fullNotesPrefix = `Müşteri: ${customer} | Fiş No ${ticketNo}`;
      for (const item of itemsToLoad) {
        const itemNotes = `${fullNotesPrefix} ${notes ? `| ${notes}` : ""}`;
        await window.dbOps.addTransaction(item.blockId, "dispatch", item.qty, itemNotes, currentUser.name);
      }

      showAlert(`Sevkiyat fişi No ${ticketNo} başarıyla kaydedildi ve stoklar düşüldü!`, "success");
      resetDispatchForm();
      await refreshApplicationData();
    } catch (err) {
      showAlert("Yükleme kaydı başarısız: " + err.message, "error");
    }
  });

  // ==========================================
  // TRANSACTION EDIT MODAL SUBMIT
  // ==========================================
  
  const editTxModal = document.getElementById("edit-tx-modal");
  
  document.getElementById("btn-close-edit-modal").addEventListener("click", () => {
    editTxModal.classList.remove("active");
  });
  
  editTxModal.addEventListener("click", (e) => {
    if (e.target === editTxModal) {
      editTxModal.classList.remove("active");
    }
  });

  document.getElementById("form-edit-tx").addEventListener("submit", async (e) => {
    e.preventDefault();
    const txId = document.getElementById("edit-tx-id").value;
    const blockTypeId = document.getElementById("edit-tx-block-type").value;
    const qty = document.getElementById("edit-tx-quantity").value;
    const notes = document.getElementById("edit-tx-notes").value.trim();

    try {
      await window.dbOps.editTransaction(txId, blockTypeId, qty, notes);
      showAlert("İşlem başarıyla güncellendi ve stoklar yeniden hesaplandı!", "success");
      editTxModal.classList.remove("active");
      await refreshApplicationData();
    } catch (err) {
      showAlert("Güncelleme başarısız: " + err.message, "error");
    }
  });

  // ==========================================
  // REMAINING SINGLE TRANSACTIONS SUBMISSIONS
  // ==========================================

  // Production Submit
  document.getElementById("form-add-production").addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = document.getElementById("prod-block-type").value;
    const qty = document.getElementById("prod-quantity").value;
    const notes = document.getElementById("prod-notes").value;

    if (!typeId) {
      showAlert("Lütfen blok tipini seçiniz!", "error");
      return;
    }

    try {
      await window.dbOps.addTransaction(typeId, "production", qty, notes, currentUser.name);
      showAlert("Üretim işlemi başarıyla kaydedildi ve stok artırıldı!", "success");
      document.getElementById("form-add-production").reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("Hata: " + err.message, "error");
    }
  });

  // Unified Damage/Zayiat/Waste Submit
  const formLoadDam = document.getElementById("form-loading-damage");
  formLoadDam.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = document.getElementById("load-damage-type").value;
    const location = document.getElementById("load-damage-location").value;
    const waste = Number(document.getElementById("load-damage-waste").value || 0);
    const repair = Number(document.getElementById("load-damage-repair").value || 0);
    const notes = document.getElementById("load-damage-notes").value.trim();

    if (!typeId) {
      showAlert("Lütfen blok tipini seçiniz!", "error");
      return;
    }
    if (waste === 0 && repair === 0) {
      showAlert("Lütfen fire veya onarılacak kırık miktarlarını giriniz!", "error");
      return;
    }

    try {
      const locationPrefix = `[${location}]`;
      const fullNotes = notes ? `${locationPrefix} ${notes}` : `${locationPrefix} Hasar kaydı`;
      
      if (waste > 0) {
        await window.dbOps.addTransaction(typeId, "waste", waste, fullNotes, currentUser.name);
      }
      if (repair > 0) {
        await window.dbOps.addTransaction(typeId, "to_repair", repair, fullNotes, currentUser.name);
      }

      showAlert("Hasar ve zayiat kaydı başarıyla eklendi!", "success");
      formLoadDam.reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("Kaydetme esnasında hata: " + err.message, "error");
    }
  });

  // Repairs Toggles
  const formRepComp = document.getElementById("form-repaired-complete");
  const btnTogRep = document.getElementById("toggle-repair-success");
  const btnTogDam = document.getElementById("toggle-loading-damage");

  btnTogRep.addEventListener("click", () => {
    btnTogRep.style.background = "var(--bg-tertiary)";
    btnTogDam.style.background = "transparent";
    formRepComp.classList.remove("hidden");
    formLoadDam.classList.add("hidden");
  });

  btnTogDam.addEventListener("click", () => {
    btnTogDam.style.background = "var(--bg-tertiary)";
    btnTogRep.style.background = "transparent";
    formLoadDam.classList.remove("hidden");
    formRepComp.classList.add("hidden");
  });

  // Repair Complete Submit
  formRepComp.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = document.getElementById("rep-block-type").value;
    const qty = document.getElementById("rep-quantity").value;

    if (!typeId) {
      showAlert("Lütfen blok tipini seçiniz!", "error");
      return;
    }

    try {
      await window.dbOps.addTransaction(typeId, "repaired", qty, "Onarılan bimslerin stoğa iadesi", currentUser.name);
      showAlert("Hasarlı bimslerin onarımı başarıyla onaylandı ve stoğa iade edildi!", "success");
      formRepComp.reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("Hata: " + err.message, "error");
    }
  });

  // Admin Create Block Type Submit
  document.getElementById("form-create-block").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("block-name").value.trim();
    const initStock = document.getElementById("block-initial-stock").value || 0;
    const minTh = document.getElementById("block-min-threshold").value;
    const maxTh = document.getElementById("block-max-threshold").value;
    const perPallet = document.getElementById("block-per-pallet").value;

    try {
      await window.dbOps.createBlockType(name, 0, 0, 0, initStock, minTh, maxTh, perPallet);
      showAlert(`"${name}" blok tipi başarıyla tanımlandı ve başlangıç stoğu kuruldu!`, "success");
      document.getElementById("form-create-block").reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("Hata: " + err.message, "error");
    }
  });

  // Edit Block Modal Close
  const blockModal = document.getElementById("edit-block-modal");
  document.getElementById("btn-close-block-modal").addEventListener("click", () => {
    blockModal.classList.remove("active");
  });
  blockModal.addEventListener("click", (e) => {
    if (e.target === blockModal) {
      blockModal.classList.remove("active");
    }
  });

  // Edit Block Type Form Submit
  document.getElementById("form-edit-block").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("edit-block-id").value;
    const name = document.getElementById("edit-block-name").value.trim();
    const minTh = document.getElementById("edit-block-min-threshold").value;
    const maxTh = document.getElementById("edit-block-max-threshold").value;
    const initStock = document.getElementById("edit-block-initial-stock").value || 0;
    const perPallet = document.getElementById("edit-block-per-pallet").value;

    try {
      await window.dbOps.updateBlockType(id, name, 0, 0, 0, minTh, maxTh, perPallet, initStock);
      showAlert(`"${name}" blok tipinin özellikleri başarıyla güncellendi!`, "success");
      blockModal.classList.remove("active");
      await refreshApplicationData();
    } catch (err) {
      showAlert("Güncelleme esnasında hata: " + err.message, "error");
    }
  });

};

// --- AUTOMATIC & MANUAL BACKGROUND SYNC SYSTEM ---
const initAutoSync = () => {
  // 1. Manual Sync Button Click Listener
  const btnSync = document.getElementById("btn-manual-sync");
  if (btnSync) {
    btnSync.addEventListener("click", async () => {
      const syncIcon = document.getElementById("sync-icon");
      if (syncIcon) syncIcon.classList.add("fa-spin");
      
      try {
        await refreshApplicationData();
        showAlert("Veriler başarıyla senkronize edildi ve envanter güncellendi!", "success");
      } catch (err) {
        showAlert("Senkronizasyon hatası: " + err.message, "error");
      } finally {
        if (syncIcon) {
          // Keep spinning for 600ms for visual satisfaction
          setTimeout(() => {
            syncIcon.classList.remove("fa-spin");
          }, 600);
        }
      }
    });
  }

  // 2. Automatic periodic background sync every 60 seconds
  setInterval(async () => {
    const syncIcon = document.getElementById("sync-icon");
    if (syncIcon) syncIcon.classList.add("fa-spin");
    
    try {
      await refreshApplicationData();
    } catch (err) {
      console.warn("Background auto-sync failed:", err.message);
    } finally {
      if (syncIcon) {
        setTimeout(() => {
          syncIcon.classList.remove("fa-spin");
        }, 600);
      }
    }
  }, 60000);
};

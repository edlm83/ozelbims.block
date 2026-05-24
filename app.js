/*
   Block Inventory Management System - Core Application Engine (Compat Mode)
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
  setupEventListeners();
  checkSession();
  initAutoSync();
});

// --- SESSION MANAGEMENT ---
const checkSession = () => {
  const isAdminLoggedIn = sessionStorage.getItem("admin_logged_in");
  if (isAdminLoggedIn === "true") {
    currentUser = { role: "admin", name: "المدير العام" };
  } else {
    currentUser = { role: "viewer", name: "المشاهد المتابع" };
  }
  onLoginSuccess();
};

const onLoginSuccess = async () => {
  const roleBadge = document.getElementById("header-user-role");
  const loginBtn = document.getElementById("btn-admin-login");
  
  roleBadge.className = "badge-role"; // reset classes
  
  if (currentUser.role === "admin") {
    roleBadge.textContent = "وضع الإدارة والعمليات";
    roleBadge.classList.add("badge-admin");
    
    loginBtn.innerHTML = '<i class="fas fa-lock"></i> خروج المدير';
    loginBtn.className = "btn btn-secondary";
    loginBtn.style.borderColor = "hsla(0, 84%, 60%, 0.3)";
    loginBtn.style.color = "var(--danger)";
  } else {
    roleBadge.textContent = "وضع المشاهدة";
    roleBadge.classList.add("badge-owner");
    
    loginBtn.innerHTML = '<i class="fas fa-key"></i> دخول المدير';
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
    
    let lastDataUpdateStr = "لا يوجد حركات مسجلة";
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
    showAlert("حدث خطأ أثناء تحميل البيانات: " + error.message, "error");
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
    sel.innerHTML = '<option value="">اختر النوع...</option>';
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} - ${b.blocks_per_pallet || 120} حبة/باليت`;
      sel.appendChild(opt);
    });
  });

  const firstDispSelect = document.querySelector(".disp-item-select");
  if (firstDispSelect) {
    firstDispSelect.innerHTML = '<option value="">اختر النوع...</option>';
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} - ${b.blocks_per_pallet || 120} حبة/باليت`;
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
    document.getElementById("stat-total-stock").textContent = stats.totalStock.toLocaleString("en-US");
    document.getElementById("stat-month-production").textContent = stats.monthProduction.toLocaleString("en-US");
    document.getElementById("stat-month-dispatch").textContent = stats.monthDispatch.toLocaleString("en-US");
    document.getElementById("stat-total-repair").textContent = stats.totalUnderRepair.toLocaleString("en-US");

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
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">لا توجد تطابقات للبحث.</td></tr>`;
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
    let stockStatus = "متوفر بكثرة";
    let badgeColor = "hsl(142, 76%, 45%)"; // Vibrant green

    if (current <= min) {
      stockClass = "stock-low";
      stockStatus = "منخفض جداً (خطر)";
      badgeColor = "hsl(0, 84%, 60%)"; // Danger Red
    } else if (current > min && current <= min + (max - min) * 0.5) {
      stockClass = "stock-medium";
      stockStatus = "قارب على الانخفاض";
      badgeColor = "hsl(45, 100%, 51%)"; // Warning Gold/Orange
    } else if (current > min + (max - min) * 0.5 && current < max) {
      stockClass = "stock-high";
      stockStatus = "متوفر بشكل جيد";
      badgeColor = "hsl(88, 76%, 45%)"; // Light Green
    } else {
      stockClass = "stock-high";
      stockStatus = "متوفر بكثرة";
      badgeColor = "hsl(142, 76%, 45%)"; // Vibrant Green
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: var(--text-primary);">${b.name}</td>
      <td style="color: var(--text-secondary); font-size: 0.85rem;">
        <span style="font-weight: bold; color: var(--text-primary);">${b.initial_stock.toLocaleString("en-US")}</span> باليت<br>
        <span style="color: var(--text-muted); font-size: 0.75rem;">(${initPieces.toLocaleString("en-US")} حبة)</span>
      </td>
      <td style="color: var(--warning); font-size: 0.85rem;">
        <span style="font-weight: bold;">${b.under_repair_stock.toLocaleString("en-US")}</span> باليت<br>
        <span style="color: var(--text-muted); font-size: 0.75rem;">(${repairPieces.toLocaleString("en-US")} حبة)</span>
      </td>
      <td style="font-size: 0.9rem; color: ${current <= min ? "var(--danger)" : "var(--text-primary)"};">
        <span style="font-weight: 800; font-size: 1.05rem;">${current.toLocaleString("en-US")}</span> باليت<br>
        <span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 600;">(${currentPieces.toLocaleString("en-US")} حبة)</span>
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
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">سجل العمليات فارغ تماماً.</div>`;
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
      actionTitle = `إنتاج: ${t.block_name}`;
      itemClass = "prod";
    } else if (t.type === "dispatch") {
      qtySign = "-";
      qtyClass = "qty-minus";
      actionTitle = `تحميل: ${t.block_name}`;
      itemClass = "disp";
    } else if (t.type === "waste") {
      qtySign = "-";
      qtyClass = "qty-minus";
      actionTitle = `هدر/كسر كلي: ${t.block_name}`;
      itemClass = "waste";
    } else if (t.type === "to_repair") {
      qtySign = "-";
      qtyClass = "qty-warning";
      actionTitle = `إحالة للصيانة: ${t.block_name}`;
      itemClass = "to_repair";
    } else if (t.type === "repaired") {
      qtySign = "+";
      qtyClass = "qty-accent";
      actionTitle = `تم إصلاحه وإعادته: ${t.block_name}`;
      itemClass = "repaired";
    }

    const dateObj = new Date(t.date);
    const timeStr = dateObj.toLocaleDateString("en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }) + " " + dateObj.toLocaleTimeString("en-US", {
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
          <span class="log-quantity ${qtyClass}">${qtySign}${t.quantity.toLocaleString("en-US")} باليت</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; margin-top: 0.1rem;">(${pieces.toLocaleString("en-US")} حبة)</span>
        </div>
      </div>
      ${isEditable ? `
      <div class="log-actions" style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm btn-edit-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> تعديل
        </button>
        <button class="btn btn-secondary btn-sm btn-delete-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0,84%,60%,0.2);">
          <i class="fas fa-trash-alt"></i> حذف
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
  // In single-auth flow, all operations are entered by 'المدير العام'
  const myTxs = txs.filter(t => t.date >= todayStart && t.created_by === "المدير العام");

  if (myTxs.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">لم يتم تسجيل أي حركة اليوم بعد.</div>`;
    return;
  }

  myTxs.forEach(t => {
    let actionTitle = "";
    let badgeClass = "";
    let sign = "";

    if (t.type === "production") {
      actionTitle = "تسجيل إنتاج";
      badgeClass = "badge-prod";
      sign = "+";
    } else if (t.type === "dispatch") {
      actionTitle = "تحميل صادرات";
      badgeClass = "badge-disp";
      sign = "-";
    } else if (t.type === "waste") {
      actionTitle = "هدر/كسر كلي";
      badgeClass = "badge-admin";
      sign = "-";
    } else if (t.type === "to_repair") {
      actionTitle = "كسر تحت الإصلاح";
      badgeClass = "badge-disp";
      sign = "-";
    } else if (t.type === "repaired") {
      actionTitle = "إرجاع مصلح للمخزون";
      badgeClass = "badge-owner";
      sign = "+";
    }

    const timeStr = new Date(t.date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

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
          <span class="log-quantity" style="color: var(--primary); font-weight: bold;">${sign}${t.quantity.toLocaleString("en-US")} باليت</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold;">(${pieces.toLocaleString("en-US")} حبة)</span>
        </div>
      </div>
      <div class="log-actions" style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm btn-edit-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> تعديل
        </button>
        <button class="btn btn-secondary btn-sm btn-delete-tx" data-id="${t.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0,84%,60%,0.2);">
          <i class="fas fa-trash-alt"></i> حذف
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
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const txId = btn.getAttribute("data-id");
      if (confirm("⚠️ هل أنت متأكد تماماً من حذف هذه الحركة؟ سيتم عكس تأثيرها الحسابي في أرصدة المخازن فوراً!")) {
        try {
          await window.dbOps.deleteTransaction(txId);
          showAlert("تم حذف الحركة وإرجاع المخازن بنجاح!", "success");
          await refreshApplicationData();
        } catch (error) {
          showAlert("خطأ أثناء الحذف: " + error.message, "error");
        }
      }
    });
  });

  // 2. EDIT ACTION (Modal trigger)
  document.querySelectorAll(".btn-edit-tx").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const txId = btn.getAttribute("data-id");
      const tx = txs.find(t => t.id === txId);
      if (!tx) return;

      document.getElementById("edit-tx-id").value = tx.id;
      
      let typeLabel = "عملية";
      if (tx.type === "production") typeLabel = "إنتاج صالح";
      else if (tx.type === "dispatch") typeLabel = "تحميل صادرات";
      else if (tx.type === "waste") typeLabel = "هدر/تالف كلي";
      else if (tx.type === "to_repair") typeLabel = "كسر تحت الإصلاح";
      else if (tx.type === "repaired") typeLabel = "بلوك مصلح للبيع";

      document.getElementById("edit-tx-label").textContent = `${typeLabel} | المدخل: ${tx.created_by}`;
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
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 2rem 0;">لا يوجد أي أنواع بلوك معرّفة حالياً.</div>`;
    return;
  }

  blockTypesList.forEach(b => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.style.borderRightColor = "var(--danger)";
    item.style.flexDirection = "column";
    item.style.alignItems = "stretch";
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div class="log-details">
          <span class="log-title" style="font-weight: bold; color: var(--text-primary);">${b.name}</span>
          <span class="log-meta">
            سعة الباليت: <span style="color: var(--accent-blue); font-weight: bold;">${b.blocks_per_pallet || 120} حبة</span> • 
            رصيد أول المدة: ${b.initial_stock.toLocaleString("en-US")} باليت • 
            حد الخطر: <span style="color: var(--danger); font-weight: bold;">${(b.min_threshold || 10).toLocaleString("en-US")} باليت</span> • 
            حد الوفرة: <span style="color: var(--success); font-weight: bold;">${(b.max_threshold || 100).toLocaleString("en-US")} باليت</span>
          </span>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; margin-top: 0.6rem; justify-content: flex-end; border-top: 1px dashed hsla(222,25%,35%,0.3); padding-top: 0.5rem;">
        <button class="btn btn-secondary btn-sm edit-block-btn" data-id="${b.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--accent-blue); border-color: hsla(210,100%,56%,0.2);">
          <i class="fas fa-edit"></i> تعديل المواصفات
        </button>
        <button class="btn btn-secondary btn-sm delete-block-btn" data-id="${b.id}" style="width: auto; padding: 0.25rem 0.6rem; font-size: 0.75rem; color: var(--danger); border-color: hsla(0, 84%, 60%, 0.2);">
          <i class="fas fa-trash-alt"></i> حذف
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
      document.getElementById("edit-block-per-pallet").value = block.blocks_per_pallet || 120;

      document.getElementById("edit-block-modal").classList.add("active");
    });
  });

  document.querySelectorAll(".delete-block-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const id = btn.getAttribute("data-id");
      const block = blockTypesList.find(b => b.id === id);
      if (confirm(`⚠️ هل أنت متأكد تماماً من حذف نوع البلوك "${block.name}"؟ سيتم مسح بيانات المخزون الخاص به بالكامل!`)) {
        await window.dbOps.deleteBlockType(id);
        showAlert("تم حذف نوع البلوك بنجاح!", "success");
        await refreshApplicationData();
      }
    });
  });
};

const renderDashboardCharts = async () => {
  const data = await window.dbOps.getAnalyticsData();

  if (monthlyChartInstance) monthlyChartInstance.destroy();
  if (distributionChartInstance) distributionChartInstance.destroy();

  const ctxMonthly = document.getElementById("monthlyChart").getContext("2d");
  monthlyChartInstance = new Chart(ctxMonthly, {
    type: "line",
    data: {
      labels: data.weeklyComparison.labels,
      datasets: [
        {
          label: "إجمالي الإنتاج اليومي",
          data: data.weeklyComparison.production,
          borderColor: "hsl(142, 76%, 45%)",
          backgroundColor: "hsla(142, 76%, 45%, 0.1)",
          borderWidth: 3,
          tension: 0.35,
          fill: true
        },
        {
          label: "إجمالي فياش التحميل الصادرة",
          data: data.weeklyComparison.dispatch,
          borderColor: "hsl(20, 95%, 55%)",
          backgroundColor: "hsla(20, 95%, 55%, 0.1)",
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
        legend: { labels: { color: "hsl(218, 15%, 75%)", font: { family: "Tajawal" } } }
      },
      scales: {
        x: { grid: { color: "hsla(222, 25%, 25%, 0.2)" }, ticks: { color: "hsl(218, 12%, 55%)", font: { family: "Tajawal" } } },
        y: { grid: { color: "hsla(222, 25%, 25%, 0.2)" }, ticks: { color: "hsl(218, 12%, 55%)", font: { family: "Tajawal" } } }
      }
    }
  });

  const ctxDist = document.getElementById("stockDistributionChart").getContext("2d");
  distributionChartInstance = new Chart(ctxDist, {
    type: "doughnut",
    data: data.distribution,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: "right", 
          labels: { color: "hsl(218, 15%, 75%)", font: { family: "Tajawal" } } 
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
        showAlert("تمت مزامنة البيانات وتحديث المخازن بنجاح!", "success");
      } catch (err) {
        showAlert("خطأ أثناء المزامنة: " + err.message, "error");
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
      currentUser = { role: "viewer", name: "المشاهد المتابع" };
      sessionStorage.removeItem("admin_logged_in");
      showAlert("تم قفل لوحة التحكم، والعودة لوضع المشاهدة فقط.", "info");
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
    const pass = document.getElementById("admin-password").value;

    if (pass === ADMIN_PASSWORD) {
      currentUser = { role: "admin", name: "المدير العام" };
      sessionStorage.setItem("admin_logged_in", "true");
      
      loginModal.classList.remove("active");
      document.getElementById("form-admin-login").reset();
      
      showAlert("تم تفعيل صلاحيات الإدارة والعمليات الكاملة بنجاح!", "success");
      onLoginSuccess();
    } else {
      showAlert("رمز المرور السري غير صحيح! يرجى إعادة المحاولة.", "error");
    }
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
          <option value="">اختر النوع...</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0; width: 100%; display: flex; gap: 0.5rem; align-items: center;">
        <input class="form-input disp-item-qty" type="number" min="1" placeholder="مثلاً: 500" required>
        <button type="button" class="btn btn-danger btn-remove-row" style="width: auto; padding: 0.75rem; border-radius: var(--border-radius-sm); margin-bottom: 0;">
          <i class="fas fa-trash-alt"></i>
        </button>
      </div>
    `;

    const selectEl = row.querySelector(".disp-item-select");
    blockTypesList.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = `${b.name} (${b.dimensions.length}×${b.dimensions.width}×${b.dimensions.height} سم)`;
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
      showAlert("يرجى إضافة نوع واحد من البلوك على الأقل للفيش!", "error");
      return;
    }

    try {
      const stockAggregate = {};
      itemsToLoad.forEach(item => {
        stockAggregate[item.blockId] = (stockAggregate[item.blockId] || 0) + item.qty;
      });

      for (const blockId in stockAggregate) {
        const block = blockTypesList.find(b => b.id === blockId);
        if (!block) throw new Error("نوع البلوك غير معرّف!");
        if (block.current_stock < stockAggregate[blockId]) {
          throw new Error(`رصيد المخزون لا يكفي لـ "${block.name}"! المتاح بالساحة: ${block.current_stock} - المطلوب: ${stockAggregate[blockId]}.`);
        }
      }

      const fullNotesPrefix = `العميل: ${customer} | فيش رقم ${ticketNo}`;
      for (const item of itemsToLoad) {
        const itemNotes = `${fullNotesPrefix} ${notes ? `| ${notes}` : ""}`;
        await window.dbOps.addTransaction(item.blockId, "dispatch", item.qty, itemNotes, currentUser.name);
      }

      showAlert(`تم تسجيل فيش التحميل رقم ${ticketNo} بنجاح وخصم الأرصدة!`, "success");
      resetDispatchForm();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ أثناء تسجيل التحميل: " + err.message, "error");
    }
  });

  // ==========================================
  // TRANSACTION EDIT MODAL SUBMIT
  // ==========================================
  
  const editModal = document.getElementById("edit-tx-modal");
  
  document.getElementById("btn-close-edit-modal").addEventListener("click", () => {
    editModal.classList.remove("active");
  });
  
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) {
      editModal.classList.remove("active");
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
      showAlert("تم تعديل العملية وإعادة احتساب الأرصدة بنجاح!", "success");
      editModal.classList.remove("active");
      await refreshApplicationData();
    } catch (err) {
      showAlert("فشل التعديل: " + err.message, "error");
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
      showAlert("يرجى اختيار نوع البلوك!", "error");
      return;
    }

    try {
      await window.dbOps.addTransaction(typeId, "production", qty, notes, currentUser.name);
      showAlert("تم حفظ عملية الإنتاج بنجاح وزيادة المخزون الفعلي!", "success");
      document.getElementById("form-add-production").reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ: " + err.message, "error");
    }
  });

  // Production Damage/Waste Submit
  document.getElementById("form-prod-damage").addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = document.getElementById("prod-damage-type").value;
    const waste = Number(document.getElementById("prod-damage-waste").value || 0);
    const repair = Number(document.getElementById("prod-damage-repair").value || 0);
    const notes = document.getElementById("prod-damage-notes").value;

    if (!typeId) {
      showAlert("يرجى اختيار نوع البلوك!", "error");
      return;
    }
    if (waste === 0 && repair === 0) {
      showAlert("يرجى إدخال كميات الكسر تالف كلي أو تحت الإصلاح!", "error");
      return;
    }

    try {
      if (waste > 0) {
        await window.dbOps.addTransaction(typeId, "waste", waste, "تالف ساحة إنتاج: " + notes, currentUser.name);
      }
      if (repair > 0) {
        await window.dbOps.addTransaction(typeId, "to_repair", repair, "تحت الإصلاح إنتاج: " + notes, currentUser.name);
      }

      showAlert("تم تسجيل الكسر والهدر اليومي وتحديث الأرصدة!", "success");
      document.getElementById("form-prod-damage").reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ أثناء الحفظ: " + err.message, "error");
    }
  });

  // Repairs Toggles
  const formRepComp = document.getElementById("form-repaired-complete");
  const formLoadDam = document.getElementById("form-loading-damage");
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
      showAlert("يرجى اختيار نوع البلوك!", "error");
      return;
    }

    try {
      await window.dbOps.addTransaction(typeId, "repaired", qty, "إرجاع بلوك مصلح للساحة", currentUser.name);
      showAlert("تم تأكيد إصلاح البلوك وإعادته إلى المخزون المتاح بنجاح!", "success");
      formRepComp.reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ: " + err.message, "error");
    }
  });

  // Loading Damage Submit
  formLoadDam.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typeId = document.getElementById("load-damage-type").value;
    const waste = Number(document.getElementById("load-damage-waste").value || 0);
    const repair = Number(document.getElementById("load-damage-repair").value || 0);

    if (!typeId) {
      showAlert("يرجى اختيار نوع البلوك!", "error");
      return;
    }
    if (waste === 0 && repair === 0) {
      showAlert("يرجى إدخال كمية التالف أو ما يجب إصلاحه!", "error");
      return;
    }

    try {
      if (waste > 0) {
        await window.dbOps.addTransaction(typeId, "waste", waste, "كسر تحميل تالف نهائي", currentUser.name);
      }
      if (repair > 0) {
        await window.dbOps.addTransaction(typeId, "to_repair", repair, "كسر تحميل بحاجة لإصلاح", currentUser.name);
      }

      showAlert("تم تسجيل كسر تحميل وتحديث الأرصدة بنجاح!", "success");
      formLoadDam.reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ: " + err.message, "error");
    }
  });

  // Admin Create Block Type Submit
  document.getElementById("form-create-block").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("block-name").value.trim();
    const initStock = document.getElementById("block-initial-stock").value;
    const minTh = document.getElementById("block-min-threshold").value;
    const maxTh = document.getElementById("block-max-threshold").value;
    const perPallet = document.getElementById("block-per-pallet").value;

    try {
      await window.dbOps.createBlockType(name, 0, 0, 0, initStock, minTh, maxTh, perPallet);
      showAlert(`تم تعريف نوع البلوك "${name}" وتثبيت رصيد أول المدة بالنجاح!`, "success");
      document.getElementById("form-create-block").reset();
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ: " + err.message, "error");
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
    const perPallet = document.getElementById("edit-block-per-pallet").value;

    try {
      await window.dbOps.updateBlockType(id, name, 0, 0, 0, minTh, maxTh, perPallet);
      showAlert(`تم تعديل مواصفات نوع البلوك "${name}" بنجاح!`, "success");
      blockModal.classList.remove("active");
      await refreshApplicationData();
    } catch (err) {
      showAlert("خطأ أثناء التعديل: " + err.message, "error");
    }
  });

};

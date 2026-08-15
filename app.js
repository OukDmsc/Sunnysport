const STORAGE_KEYS = {
  catalog: "catalogItems"
};

const DEFAULT_ITEM_IMAGE = "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80";
const ITEM_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

function buildLocalImageUrl(itemId, extension) {
  return `images/${itemId}.${extension}`;
}

function getItemImage(item) {
  if (item.image) {
    return item.image;
  }

  const localFileCandidates = ITEM_IMAGE_EXTENSIONS.map((extension) => buildLocalImageUrl(item.id, extension));
  return localFileCandidates[0] || DEFAULT_ITEM_IMAGE;
}
const items = [
  { id: 1, name: "ទា1.1", price: 58000, stock: 1000, image: "https://i.postimg.cc/hjmQ9Z77/duck.jpg" },
  { id: 2, name: "ត្រីមូល", price: 6500, stock: 1000, image: "https://i.postimg.cc/5NzQzQzQ/tri-mool.jpg" },
  { id: 3, name: "ត្រីឆ្លាត", price: 6000, stock: 1000, image: "https://i.postimg.cc/5NzQzQzQ/tri-chlat.jpg" },
  { id: 4, name: "គូទមាន់", price: 6500, stock: 1000, image: "https://i.postimg.cc/TYSsxdV6/photo-2026-07-22-10-08-21.jpg" },
  { id: 5, name: "ស្លាបមាន់sadia", price: 6500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 6, name: "ស្លាបខ្លី", price: 14000, stock: 1000, image: "https://i.postimg.cc/mg6SjqhP/slab-cley.jpg" },
  { id: 7, name: "កោះមាន់", price: 9500, stock: 1000, image: "https://i.postimg.cc/nV7wzHMf/kors-chickhen.jpg" },
  { id: 8, name: "ភ្លៅមាន់", price: 10500, stock: 1000, image: "https://i.postimg.cc/wxVLFPGR/plov-mean.jpg" },
  { id: 9, name: "ជើងមាន់Aviva", price: 8000, stock: 1000, image: "https://i.postimg.cc/cHrF3NRj/jerng-aviva.jpg" },
  { id: 10, name: "ត្រីបន្ទះ", price: 13500, stock: 1000, image: "https://i.postimg.cc/tCWJtMvp/fish.jpg" },
  { id: 11, name: "នំឈីស", price: 14500, stock: 1000, image: "https://i.postimg.cc/V6kHvMSB/nom-chise.jpg" },
  { id: 12, name: "មីសួរដើម", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 13, name: "មីសួរដើមតូច", price: 13000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 14, name: "គ្រាប់ខ្នុល", price: 14000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 15, name: "CHOJO16ដើម", price: 13700, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 16, name: "CHOJOនំប៉ាវ", price: 13500, stock: 1000, image: "https://i.postimg.cc/rpkwByD7/nom-pov.jpg" },
  { id: 17, name: "ស្លាបវែង", price: 11000, stock: 1000, image: "https://i.postimg.cc/rpf2fqxN/slab-veng.jpg" },
  { id: 18, name: "អណ្ដាត", price: 12500, stock: 1000, image: "https://i.postimg.cc/QNTxdWpZ/orn-dard.jpg" },
  { id: 19, name: "ប្រហិតបង្គា", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 20, name: "ក្ដាមធំ១២ដើម", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 21, name: "តៅហ៊ូជ្រុង", price: 12500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 22, name: "គាវ", price: 10500, stock: 1000, image: "https://i.postimg.cc/G2VMCzYw/photo-2026-07-31-20-06-42.jpg" },
  { id: 23, name: "ចាំបូមាស", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 24, name: "ប៉ាតេក្ដាម", price: 9000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 25, name: "សាច់ក្រក់ធំ", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 26, name: "chojoមឺកខ្លី", price: 14000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 27, name: "កន្សោមពង", price: 15000, stock: 1000, image: "https://i.postimg.cc/t4JnpC9Q/krop-knol.jpg" },
  { id: 28, name: "chojoមឺកក្រហម", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 29, name: "ឈីសតូច21ដើម", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 31, name: "ឈីសធំ26ដើម", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 32, name: "'ដកpm", price: 12000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 33, name: "ត្រចៀក", price: 12500, stock: 1000, image: "https://i.postimg.cc/Qx9xNyZp/slik.jpg" },
  { id: 34, name: "ក្បាលពោះវៀន", price: 10000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 35, name: "CP16", price: 9000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 36, name: "CP40", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 37, name: "ត្រីHP", price: 10500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 38, name: "ត្រីបន្លែ", price: 10500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 39, name: "តៅហ៊ូចៀន", price: 13500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 40, name: "បង្គា", price: 14500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 41, name: "ចាំបូ20", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 42, name: "មីសួរគ្រាប់ធំ", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 43, name: "ជើងជ្រូកមូល", price: 11000, stock: 1000, image: "https://i.postimg.cc/Zn0z0gRM/jerng.jpg" },
  { id: 44, name: "ត្រីស", price: 10000, stock: 1000, image: "https://i.postimg.cc/NfpgkHvP/photo-1-2026-07-29-11-27-40.jpg" },
  { id: 45, name: "បន្លែពណ៏", price: 10500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 46, name: "បន្លែស្លឹកខ្ទឹម", price: 10000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 47, name: "ជើងទាខ", price: 9800, stock: 1000, image: "https://i.postimg.cc/d0vMGD3S/jerng-duck.jpg" },
  { id: 48, name: "ដក AM", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 49, name: "ដកមីសួរ", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 50, name: "ប៉ាទេ cp", price: 11600, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 51, name: "ជើង P83", price: 7800, stock: 1000, image: "https://i.postimg.cc/cJbdNRkD/jerng.jpg" },
  { id: 52, name: "ជើងវែង", price: 11000, stock: 1000, image: "https://i.postimg.cc/VkTVv5q7/jerng-mean-ot-c.jpg" },
  { id: 53, name: "សណ្ដែក", price: 1600, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 54, name: "គុយទាវ", price: 4300, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 55, name: "លត+កាត់", price: 2500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 56, name: "នំ", price: 2200, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 57, name: "ចុងGT", price: 6500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 59, name: "ស្រួយ២០ដើម", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE},
  { id: 60, name: "បន្តះស", price: 9000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 61, name: "ដកAM", price: 11500, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 62, name: "ក្ដាមស្នូរ", price: 14500, stock: 1000, image: "https://i.postimg.cc/HxyQHW4s/crap-sno.jpg" },
  { id: 63, name: "ប៉ាតេជ្រុង", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE },
  { id: 64, name: "ស្រួយ២០ដើម", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE},
  { id: 65, name: "ប៊", price: 11000, stock: 1000, image: DEFAULT_ITEM_IMAGE},
]

const receipts = [];
const selectedItems = [];
let showSavedReceipt = true;
let searchQuery = "";
const ADMIN_ROLES = new Set(["owner", "admin", "dev"]);
const ROLE_CREDENTIALS = {
  owner: { name: "dara", password: "dara67123" },
  admin: { name: "ddomm7", password: "ddomm7123" },
  dev: { name: "dev", password: "ddomm7123" }
};
const itemsGrid = document.getElementById("itemsGrid");
const searchItemsInput = document.getElementById("searchItems");
const receiptItemSelect = document.getElementById("receiptItem");
const receiptPreview = document.getElementById("receiptPreview");
const receiptForm = document.getElementById("receiptForm");

// ========== ZOOM FUNCTIONALITY ==========
const ZOOM_STORAGE_KEY = "pageZoomLevel";
const MIN_ZOOM = 0.75; // 75%
const MAX_ZOOM = 2.0; // 200%
const ZOOM_STEP = 0.1; // 10%
let currentZoom = parseFloat(localStorage.getItem(ZOOM_STORAGE_KEY)) || 1;

function initializeZoom() {
  applyZoom(currentZoom);
  updateZoomDisplay();
}

function applyZoom(zoomLevel) {
  document.body.style.transform = `scale(${zoomLevel})`;
  document.body.style.transformOrigin = "top center";
  document.body.style.width = `${100 / zoomLevel}%`;
  document.body.style.height = `${100 / zoomLevel}%`;
}

function updateZoomDisplay() {
  const zoomPercentage = Math.round(currentZoom * 100);
  const zoomLevelDisplay = document.getElementById("zoomLevel");
  if (zoomLevelDisplay) {
    zoomLevelDisplay.textContent = zoomPercentage + "%";
  }
}

function setZoom(zoomLevel) {
  currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel));
  localStorage.setItem(ZOOM_STORAGE_KEY, currentZoom.toString());
  applyZoom(currentZoom);
  updateZoomDisplay();
}

function zoomIn() {
  setZoom(currentZoom + ZOOM_STEP);
}

function zoomOut() {
  setZoom(currentZoom - ZOOM_STEP);
}

function resetZoom() {
  setZoom(1);
}

// Desktop: Zoom with Ctrl/Cmd + Mouse Wheel
document.addEventListener("wheel", (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    if (e.deltaY > 0) {
      zoomOut();
    } else {
      zoomIn();
    }
  }
}, { passive: false });

// Desktop: Zoom with Ctrl/Cmd + Plus/Minus keys
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoomIn();
    } else if (e.key === "-") {
      e.preventDefault();
      zoomOut();
    } else if (e.key === "0") {
      e.preventDefault();
      resetZoom();
    }
  }
});

// Mobile: Pinch zoom detection
let lastDistance = 0;

document.addEventListener("touchmove", (e) => {
  if (e.touches.length === 2) {
    e.preventDefault();
    const touch1 = e.touches[0];
    const touch2 = e.touches[1];
    
    const distance = Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    );
    
    if (lastDistance > 0) {
      const delta = distance - lastDistance;
      if (Math.abs(delta) > 5) {
        if (delta > 0) {
          zoomIn();
        } else {
          zoomOut();
        }
        lastDistance = distance;
      }
    } else {
      lastDistance = distance;
    }
  }
}, { passive: false });

document.addEventListener("touchend", () => {
  lastDistance = 0;
});

// Button controls
function setupZoomButtons() {
  const zoomInBtn = document.getElementById("zoomInBtn");
  const zoomOutBtn = document.getElementById("zoomOutBtn");
  const zoomResetBtn = document.getElementById("zoomResetBtn");
  
  if (zoomInBtn) zoomInBtn.addEventListener("click", zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener("click", zoomOut);
  if (zoomResetBtn) zoomResetBtn.addEventListener("click", resetZoom);
}

// Initialize zoom on page load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initializeZoom();
    setupZoomButtons();
  });
} else {
  initializeZoom();
  setupZoomButtons();
}
const customerNameInput = document.getElementById("customerName");
const receiptQtyInput = document.getElementById("receiptQty");
const createReceiptBtn = document.getElementById("createReceiptBtn");
const resetReceiptBtn = document.getElementById("resetReceiptBtn");
const receiptCard = document.querySelector(".receipt-card");
const roleButtons = Array.from(document.querySelectorAll(".role-btn"));
const loginPanel = document.getElementById("loginPanel");
const loginTitle = document.getElementById("loginTitle");
const loginNameInput = document.getElementById("loginName");
const loginPasswordInput = document.getElementById("loginPassword");
const loginSubmitBtn = document.getElementById("loginSubmit");
const loginCancelBtn = document.getElementById("loginCancel");
const loginStatusText = document.getElementById("loginStatus");
let currentRole = "customer";
let pendingRole = null;

function getCurrentRole() {
  return currentRole;
}

function canUseAdminControls() {
  return ADMIN_ROLES.has(getCurrentRole());
}

function showLoginPanel(role) {
  pendingRole = role;
  if (loginTitle) {
    loginTitle.textContent = `${role[0].toUpperCase()}${role.slice(1)} login`;
  }
  if (loginPanel) {
    loginPanel.classList.remove("hidden");
  }
  if (loginStatusText) {
    loginStatusText.textContent = "";
  }
  if (loginNameInput) {
    loginNameInput.value = "";
    loginNameInput.focus();
  }
  if (loginPasswordInput) {
    loginPasswordInput.value = "";
  }
}

function hideLoginPanel() {
  pendingRole = null;
  if (loginPanel) {
    loginPanel.classList.add("hidden");
  }
  if (loginStatusText) {
    loginStatusText.textContent = "";
  }
}

function setRoleAccess() {
  const isAdmin = canUseAdminControls();
  const formControls = [receiptForm, receiptItemSelect, receiptQtyInput, customerNameInput, createReceiptBtn, resetReceiptBtn];

  roleButtons.forEach((button) => {
    const isActive = button.dataset.role === currentRole;
    button.classList.toggle("is-active", isActive);
  });

  if (receiptCard) {
    receiptCard.style.display = isAdmin ? "block" : "none";
  }

  formControls.forEach((element) => {
    if (!element) return;
    element.disabled = !isAdmin;
    if (element.tagName === "FORM" || element.tagName === "SELECT" || element.tagName === "INPUT" || element.tagName === "BUTTON") {
      element.style.opacity = isAdmin ? "1" : "0.5";
    }
  });

  if (!isAdmin) {
    selectedItems.length = 0;
    receiptPreview.innerHTML = "";
  }
}

function authenticateRole(role) {
  const credentials = ROLE_CREDENTIALS[role];
  if (!credentials) {
    currentRole = role;
    setRoleAccess();
    return;
  }

  showLoginPanel(role);
}

function submitRoleLogin() {
  const role = pendingRole;
  const credentials = ROLE_CREDENTIALS[role];

  if (!credentials || !loginNameInput || !loginPasswordInput || !loginStatusText) {
    return;
  }

  const enteredName = loginNameInput.value.trim().toLowerCase();
  const enteredPassword = loginPasswordInput.value;

  if (!enteredName || !enteredPassword) {
    loginStatusText.textContent = "Please enter both login name and password.";
    return;
  }

  if (enteredName === credentials.name && enteredPassword === credentials.password) {
    currentRole = role;
    hideLoginPanel();
    setRoleAccess();
    renderItems();
    renderReceipt();
    return;
  }

  loginStatusText.textContent = "Incorrect login name or password.";
  currentRole = "customer";
  setRoleAccess();
}

function loadItemsFromLocalStorage() {
  const savedItems = localStorage.getItem(STORAGE_KEYS.catalog);
  if (!savedItems) {
    saveItemsToLocalStorage();
    return;
  }

  try {
    const parsedItems = JSON.parse(savedItems);
    if (!Array.isArray(parsedItems)) {
      saveItemsToLocalStorage();
      return;
    }

    parsedItems.forEach((savedItem) => {
      const currentItem = items.find((item) => item.id === savedItem.id);
      if (!currentItem) return;

      currentItem.name = savedItem.name || currentItem.name;
      currentItem.price = Number(savedItem.price) || currentItem.price;
      currentItem.stock = Number(savedItem.stock) || currentItem.stock;
    });
  } catch (error) {
    console.error("Error loading catalog from localStorage:", error);
    saveItemsToLocalStorage();
  }
}

function saveItemsToLocalStorage() {
  localStorage.setItem(STORAGE_KEYS.catalog, JSON.stringify(items));
}

function populateSelects() {
  const options = items
    .map((item) => `<option value="${item.id}">${item.name}</option>`)
    .join("");
  receiptItemSelect.innerHTML = options;

  const firstItem = items[0];
  if (firstItem) {
    receiptItemSelect.value = firstItem.id;
  }
}

function getFilteredItems() {
  if (!searchQuery.trim()) {
    return items;
  }
  const query = searchQuery.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().includes(query));
}

function renderItems() {
  const isAdmin = canUseAdminControls();
  const filteredItems = getFilteredItems();
  itemsGrid.innerHTML = filteredItems
    .map(
      (item) => {
        const imageSrc = getItemImage(item);
        return `
          <article class="item-card" data-item-id="${item.id}">
            <img class="item-photo" src="${imageSrc}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_ITEM_IMAGE}'" />
            <h3>${item.name}</h3>
            ${isAdmin ? `<div class="price-display">${item.price.toLocaleString()}៛</div>` : ""}
            ${isAdmin ? `
              <div class="price-editor-row">
                <input class="price-input" type="number" min="0" value="${item.price}" data-item-id="${item.id}" />
                <button type="button" class="save-price-btn" data-item-id="${item.id}">Save</button>
              </div>
            ` : ""}
          </article>
        `;
      }
    )
    .join("");

  document.querySelectorAll(".item-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (!isAdmin) {
        return;
      }

      if (event.target.closest(".price-input") || event.target.closest(".save-price-btn")) {
        return;
      }

      const itemId = Number(card.getAttribute("data-item-id"));
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;
      receiptItemSelect.value = item.id;
      receiptQtyInput.value = 1;
      const enteredName = customerNameInput.value.trim();
      customerNameInput.value = enteredName;
      addSelectedItem(item, 1, enteredName);
    });
  });

  if (!isAdmin) {
    return;
  }

  document.querySelectorAll(".save-price-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const itemId = Number(button.getAttribute("data-item-id"));
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const priceInput = button.parentElement?.querySelector(".price-input");
      if (!priceInput) return;

      const newPrice = Number(priceInput.value);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        alert("Please enter a valid price.");
        return;
      }

      item.price = newPrice;
      selectedItems.forEach((entry) => {
        if (entry.itemId === item.id) {
          entry.price = item.price;
          entry.total = entry.price * entry.quantity;
        }
      });
      saveItemsToLocalStorage();
      renderItems();
      renderReceipt();
    });
  });

  document.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const itemId = Number(input.getAttribute("data-item-id"));
      const item = items.find((entry) => entry.id === itemId);
      if (!item) return;

      const newPrice = Number(input.value);
      if (!Number.isFinite(newPrice) || newPrice < 0) {
        alert("Please enter a valid price.");
        return;
      }

      item.price = newPrice;
      selectedItems.forEach((entry) => {
        if (entry.itemId === item.id) {
          entry.price = item.price;
          entry.total = entry.price * entry.quantity;
        }
      });
      saveItemsToLocalStorage();
      renderItems();
      renderReceipt();
    });
  });
}

function getReceiptMarkup(receipt) {
  const now = new Date();
  const date = now.toLocaleDateString("en-GB");
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const isDraft = receipt.receiptNo === "DRAFT";
  const customerNameText = receipt.customerName && receipt.customerName.trim() && receipt.customerName !== "Customer"
    ? receipt.customerName
    : "...........";
  const receiptNoText = isDraft ? "............" : receipt.receiptNo;
  const totalQty = receipt.items.reduce((sum, entry) => sum + entry.quantity, 0);
  const exchangeRate = 4100; // 1 USD = 4100 Riel
  const totalUsd = (receipt.total / exchangeRate).toFixed(2);
  const itemsMarkup = receipt.items.length
    ? receipt.items
        .map((entry) => {
          // If this is a placeholder (no real itemId), render a non-editable placeholder row
          if (!entry.itemId) {
            return `
            <div class="receipt-row receipt-item-row">
              <div class="receipt-item-info">
                <span><strong>${entry.itemName || "..........."}</strong></span>
              </div>
              <span class="receipt-item-total">${entry.total ? entry.total.toLocaleString() + '៛' : ''}</span>
            </div>
          `;
          }

          // For draft receipts: show editable row with quantity input + remove button
          if (isDraft) {
            return `
              <div class="receipt-row receipt-item-row" data-item-id="${entry.itemId}">
                <div class="receipt-item-info">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <strong>${entry.itemName}</strong>
                    <input class="draft-qty" type="number" min="0" value="${entry.quantity}" data-item-id="${entry.itemId}" style="width:70px;padding:6px;border-radius:6px;border:1px solid #e5e7eb;" />
                    <button class="draft-remove" data-item-id="${entry.itemId}" style="padding:4px 10px;border-radius:6px;background:#ef4444;color:#fff;border:none;cursor:pointer;font-weight:bold;font-size:16px;line-height:1;">✕</button>
                  </div>
                  <div class="receipt-item-meta">Unit: ${entry.price.toLocaleString()}៛</div>
                </div>
                <span class="receipt-item-total">${entry.total.toLocaleString()}៛</span>
              </div>
            `;
          }

          // For saved receipts: show simple view without edit controls
          return `
            <div class="receipt-row receipt-item-row" data-item-id="${entry.itemId}">
              <div class="receipt-item-info">
                <div>
                  <strong>${entry.itemName}</strong>
                  <span style="margin-left: 10px; color: #666;">x${entry.quantity}</span>
                </div>
                <div class="receipt-item-meta">Unit: ${entry.price.toLocaleString()}៛</div>
              </div>
              <span class="receipt-item-total">${entry.total.toLocaleString()}៛</span>
            </div>
          `;
        })
        .join("")
    : "";

  return `
    <div class="receipt-paper">
      <p class="receipt-title">${isDraft ? "Draft Preview" : "តារា សាឡឺ"}</p>
      <div class="receipt-header">
        <div class="receipt-meta receipt-meta-left">
          <p><strong>Customer Name:</strong> ${customerNameText}</p>
          <p><strong>Date:</strong> ${date}</p>
          <p><strong>Time:</strong> ${time}</p>
          <p><strong>ឃ្លាំង:</strong> A29 A30</p>
        </div>
        <div class="receipt-meta receipt-meta-right">
          <p><strong>Receipt No:</strong> ${receiptNoText}</p>
          <p><strong>Seller:</strong> តារា​</p>
          <p><strong>Tell:</strong> 097 885 8784</p>
        </div>
      </div>
      ${itemsMarkup}
      <div class="receipt-row qty-row">
        <span>សរុបចំនួន</span>
        <span>${totalQty}</span>
      </div>
      <div class="receipt-row total-row">
        <span>Total Riel</span>
        <span>${receipt.total.toLocaleString()}៛</span>
      </div>
      <div class="receipt-row total-row">
        <span>Total Dollar</span>
        <span>$ ${totalUsd}</span>
      </div>
      <div class="signature-row">
        <div class="signature-box">
          <p>Seller Signature</p>
          <div class="signature-line"></div>
        </div>
        <div class="signature-box">
          <p>Customer Signature</p>
          <div class="signature-line"></div>
        </div>
      </div>
      <div class="receipt-location">Location: ភូមិកណ្ដាល សង្កាត់​ រលួស ខណ្ឌ ដង្កោ ភ្នំពេញ</div>
      ${!isDraft ? `<div style="margin-top: 20px; text-align: center;"><button class="edit-receipt-btn" data-receipt-no="${receipt.receiptNo}" style="padding:10px 20px;border-radius:6px;background:#c76b16;color:#fff;border:none;cursor:pointer;font-weight:bold;font-size:14px;">Edit Receipt</button></div>` : ''}
    </div>
  `;
}

function getDraftReceipt() {
  const customerName = customerNameInput.value.trim();
  const draftItems = selectedItems.map((entry) => ({ ...entry }));
  const total = draftItems.reduce((sum, entry) => sum + (entry.total || 0), 0);

  return {
    customerName,
    receiptNo: "DRAFT",
    items: draftItems,
    total,
    date: new Date().toLocaleString()
  };
}

function renderReceipt() {
  const customerName = customerNameInput.value.trim();

  if (!showSavedReceipt) {
    if (!customerName || !selectedItems.length) {
      receiptPreview.innerHTML = `<div class="empty-receipt-message"><p>Enter customer name and add at least one item to show the receipt preview.</p></div>`;
      return;
    }

    const draftReceipt = getDraftReceipt();
    receiptPreview.innerHTML = getReceiptMarkup(draftReceipt);
    attachDraftListeners();
    return;
  }

  // When showing saved receipts, fallback to draft if no history exists.
  if (!receipts.length) {
    if (!customerName || !selectedItems.length) {
      receiptPreview.innerHTML = `<div class="empty-receipt-message"><p>Enter customer name and add at least one item to show the receipt preview.</p></div>`;
      return;
    }

    const draftReceipt = getDraftReceipt();
    receiptPreview.innerHTML = getReceiptMarkup(draftReceipt);
    attachDraftListeners();
    return;
  }

  const receipt = receipts[receipts.length - 1];
  receiptPreview.innerHTML = getReceiptMarkup(receipt);
  attachSavedReceiptListeners();
}

function attachDraftListeners() {
  // Quantity change listeners
  document.querySelectorAll('.draft-qty').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = Number(e.target.getAttribute('data-item-id'));
      let qty = Number(e.target.value) || 0;
      const entry = selectedItems.find((it) => it.itemId === id);
      if (!entry) return;
      if (qty < 0) qty = 0;
      entry.quantity = qty;
      entry.total = entry.price * entry.quantity;
      renderItems();
      renderReceipt();
    });
  });

  // Remove item listeners
  document.querySelectorAll('.draft-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = Number(e.target.getAttribute('data-item-id'));
      const idx = selectedItems.findIndex((it) => it.itemId === id);
      if (idx === -1) return;
      selectedItems.splice(idx, 1);
      renderItems();
      renderReceipt();
    });
  });
}

function editSavedReceipt(receiptNo) {
  const receipt = receipts.find((r) => r.receiptNo === receiptNo);
  if (!receipt) {
    alert("Receipt not found.");
    return;
  }

  // Load the receipt data back into the form
  customerNameInput.value = receipt.customerName;
  selectedItems.length = 0;
  selectedItems.push(...receipt.items.map((item) => ({ ...item })));

  // Switch to draft mode
  showSavedReceipt = false;

  // Update the UI
  renderItems();
  renderReceipt();
  
  // Scroll to form
  document.querySelector(".receipt-card").scrollIntoView({ behavior: "smooth" });
}

function attachSavedReceiptListeners() {
  document.querySelectorAll('.edit-receipt-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const receiptNo = e.target.getAttribute('data-receipt-no');
      editSavedReceipt(receiptNo);
    });
  });
}

function addSelectedItem(item, qty, customerName) {
  const safeQty = Number(qty) || 1;

  const existingItem = selectedItems.find((entry) => entry.itemId === item.id);
  const newQuantity = existingItem ? existingItem.quantity + safeQty : safeQty;

  if (item.stock < newQuantity) {
    alert("Not stock.");
    return;
  }

  if (existingItem) {
    existingItem.quantity = newQuantity;
    existingItem.total = existingItem.price * existingItem.quantity;
  } else {
    selectedItems.push({
      customerName: customerName || "Customer",
      itemName: item.name,
      itemId: item.id,
      quantity: safeQty,
      price: item.price,
      total: item.price * safeQty
    });
  }

  renderItems();
  renderReceipt();
}

function createReceipt() {
  const customerName = customerNameInput.value.trim();
  if (!customerName) {
    alert("Please enter the customer name before saving the receipt.");
    customerNameInput.focus();
    return;
  }

  if (!selectedItems.length) {
    alert("Add at least one item before creating the receipt.");
    return;
  }

  const total = selectedItems.reduce((sum, entry) => sum + entry.total, 0);
  const receiptNo = `${selectedItems[0].itemId}-${Date.now().toString().slice(-4)}`;
  const savedReceipt = {
    customerName,
    receiptNo,
    items: selectedItems.map((entry) => ({ ...entry })),
    total,
    date: new Date().toLocaleString()
  };

  selectedItems.forEach((entry) => {
    const item = items.find((product) => product.id === entry.itemId);
    if (item) {
      item.stock -= entry.quantity;
    }
  });

  receipts.push(savedReceipt);
  saveReceiptsToLocalStorage();
  selectedItems.length = 0;
  receiptForm.reset();
  receiptQtyInput.value = 1;
  showSavedReceipt = true;
  renderItems();
  renderReceipt();
}

receiptForm.addEventListener("submit", function (event) {
  event.preventDefault();
  const customerName = customerNameInput.value.trim();
  const itemId = Number(receiptItemSelect.value);
  const qty = Number(receiptQtyInput.value);
  const item = items.find((entry) => entry.id === itemId);

  if (!item) return;

  addSelectedItem(item, qty, customerName || "");
  receiptItemSelect.value = items[0].id;
  receiptQtyInput.value = 1;
  if (!customerName) {
    customerNameInput.value = "";
  }
});

createReceiptBtn.addEventListener("click", createReceipt);
resetReceiptBtn.addEventListener("click", resetReceipt);

function resetReceipt() {
  selectedItems.length = 0;
  customerNameInput.value = "";
  receiptForm.reset();
  receiptQtyInput.value = 1;
  if (items[0]) {
    receiptItemSelect.value = items[0].id;
  }
  showSavedReceipt = false;
  renderItems();
  renderReceipt();
}

function saveReceiptsToLocalStorage() {
  localStorage.setItem("receiptHistory", JSON.stringify(receipts));
}

function loadReceiptsFromLocalStorage() {
  const savedReceipts = localStorage.getItem("receiptHistory");
  if (savedReceipts) {
    try {
      const parsedReceipts = JSON.parse(savedReceipts);
      receipts.length = 0;
      receipts.push(...parsedReceipts);
    } catch (error) {
      console.error("Error loading receipts from localStorage:", error);
    }
  }
}

loadItemsFromLocalStorage();

function viewReceiptHistory() {
  if (!receipts.length) {
    alert("No receipt history available.");
    return;
  }

  let historyText = "Receipt History:\n\n";
  receipts.forEach((receipt, index) => {
    historyText += `${index + 1}. Receipt No: ${receipt.receiptNo}\n`;
    historyText += `   Customer: ${receipt.customerName}\n`;
    historyText += `   Date: ${receipt.date}\n`;
    historyText += `   Items: ${receipt.items.length}\n`;
    historyText += `   Total: $${(receipt.total / 4100).toFixed(2)} / ${receipt.total.toLocaleString()}៛\n\n`;
  });

  alert(historyText);
}

function getReceiptForExport() {
  if (selectedItems.length) {
    const customerName = customerNameInput.value.trim() || selectedItems[0].customerName || "Customer";
    const total = selectedItems.reduce((sum, entry) => sum + entry.total, 0);
    return {
      customerName,
      receiptNo: `DRAFT-${Date.now().toString().slice(-4)}`,
      items: selectedItems.map((entry) => ({ ...entry })),
      total,
      date: new Date().toLocaleString()
    };
  }

  const lastReceipt = receipts[receipts.length - 1];
  if (!lastReceipt) {
    return null;
  }

  return {
    ...lastReceipt,
    items: lastReceipt.items.map((entry) => ({ ...entry }))
  };
}

function init() {
  loadReceiptsFromLocalStorage();
  populateSelects();
  
  if (searchItemsInput) {
    searchItemsInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      renderItems();
    });
  }
  
  roleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedRole = button.dataset.role || "customer";
      if (selectedRole === "customer") {
        currentRole = "customer";
        hideLoginPanel();
        setRoleAccess();
        renderItems();
        renderReceipt();
        return;
      }

      authenticateRole(selectedRole);
      renderItems();
      renderReceipt();
    });
  });

  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener("click", submitRoleLogin);
  }

  if (loginCancelBtn) {
    loginCancelBtn.addEventListener("click", () => {
      currentRole = "customer";
      hideLoginPanel();
      setRoleAccess();
      renderItems();
      renderReceipt();
    });
  }

  if (loginPasswordInput) {
    loginPasswordInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitRoleLogin();
      }
    });
  }

  setRoleAccess();
  renderItems();
  renderReceipt();

  const viewHistoryBtn = document.getElementById("viewHistory");
  if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener("click", viewReceiptHistory);
  }

  const downloadWordBtn = document.getElementById("downloadWord");
  if (downloadWordBtn) {
    downloadWordBtn.addEventListener("click", buildWordDocument);
  }

  const downloadExcelBtn = document.getElementById("downloadExcel");
  if (downloadExcelBtn) {
    downloadExcelBtn.addEventListener("click", buildExcelDocument);
  }

  const printReceiptBtn = document.getElementById("printReceipt");
  if (printReceiptBtn) {
    printReceiptBtn.addEventListener("click", () => window.print());
  }
}

window.addEventListener("DOMContentLoaded", init);

function escapeRtf(text) {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par ");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function buildWordDocument() {
  const receipt = getReceiptForExport();
  if (!receipt) return;

  const date = new Date().toLocaleDateString("en-GB");
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const itemsBody = receipt.items
    .map((entry) => `Product: ${entry.itemName} | Product ID: ${entry.itemId} | Qty: ${entry.quantity} | Unit Price: ${entry.price.toLocaleString()}៛ | Item Total: ${entry.total.toLocaleString()}៛`)
    .join("\par ");
  const body = `${receipt.customerName}\par Date: ${date}\par Time: ${time}\par Location: ភូមិ...... សង្កាត់...... ស្រុក...... ខេត្ត......\par \par ${itemsBody}\par \par Total Price: ${receipt.total.toLocaleString()}៛\par \par Seller Signature: ____________________\par Customer Signature: ____________________`;
  const rtf = `{\\rtf1\\ansi\\deff0 {\\fonttbl\\f0 Arial;} \n\\viewkind4\\uc1 \n\\pard\\f0\\fs24 ${escapeRtf(body)}\\par\n}`;

  downloadFile("receipt.rtf", rtf, "application/rtf");
}

function buildExcelDocument() {
  const receipt = getReceiptForExport();
  if (!receipt) {
    alert("Please create or select a receipt before downloading Excel.");
    return;
  }

  const date = new Date().toLocaleDateString("en-GB");
  const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const exchangeRate = 4100;
  const totalUsd = (receipt.total / exchangeRate).toFixed(2);
  const itemsRows = receipt.items
    .map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.itemName || "-")}</td>
        <td>${entry.quantity}</td>
        <td>${entry.price.toLocaleString()}៛</td>
        <td>${entry.total.toLocaleString()}៛</td>
      </tr>
    `)
    .join("");

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; }
          td { border: 1px solid #333; padding: 6px 8px; }
          .title { font-weight: bold; font-size: 18px; text-align: center; }
          .label { font-weight: bold; background: #f4f0e6; }
          .total { font-weight: bold; background: #fff4d5; }
        </style>
        <xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>
      </head>
      <body>
        <table>
          <tr>
            <td colspan="5" class="title">Official Receipt</td>
          </tr>
          <tr>
            <td class="label">Receipt No</td>
            <td colspan="4">${escapeHtml(receipt.receiptNo || "DRAFT")}</td>
          </tr>
          <tr>
            <td class="label">Customer Name</td>
            <td colspan="4">${escapeHtml(receipt.customerName || "Customer")}</td>
          </tr>
          <tr>
            <td class="label">Date</td>
            <td colspan="4">${escapeHtml(date)}</td>
          </tr>
          <tr>
            <td class="label">Time</td>
            <td colspan="4">${escapeHtml(time)}</td>
          </tr>
          <tr>
            <td class="label">Location</td>
            <td colspan="4">ភូមិ..... សង្កាត់​ ..... ខណ្ឌ .... ខេត្ត.... </td>
          </tr>
          <tr>
            <td class="label">No</td>
            <td class="label">Item</td>
            <td class="label">Qty</td>
            <td class="label">Unit Price</td>
            <td class="label">Amount</td>
          </tr>
          ${itemsRows}
          <tr>
            <td colspan="4" class="total">Total (៛)</td>
            <td class="total">${receipt.total.toLocaleString()}៛</td>
          </tr>
          <tr>
            <td colspan="4" class="total">Total (USD)</td>
            <td class="total">$${totalUsd}</td>
          </tr>
          <tr>
            <td class="label">Seller Signature</td>
            <td colspan="4"></td>
          </tr>
          <tr>
            <td class="label">Customer Signature</td>
            <td colspan="4"></td>
          </tr>
        </table>
      </body>
    </html>
  `;

  downloadFile("receipt.xls", html, "application/vnd.ms-excel");
}

// Preview popup removed per user request

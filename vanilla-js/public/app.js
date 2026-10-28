const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const savedLang = localStorage.getItem("sunny-language") || "en";
let language = savedLang === "km" ? "km" : "en";
let fields = [];
let settings = { openingHours: "06:00-24:00", usdToKhrRate: 4100, bookingFeeKhr: 5000 };
let customer = null;
let admin = false;
let bookings = [];
let resetToken = "";
let recovery = null;
let currentAdminTab = "bookings";
let currentDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Phnom_Penh" });

const translations = {
  "Book a field": "កក់ទីលាន", "My bookings": "ការកក់របស់ខ្ញុំ", "Sign out": "ចាកចេញ",
  "Administrator dashboard": "ផ្ទាំងគ្រប់គ្រង", "Bookings": "ការកក់", "Schedule": "កាលវិភាគ",
  "Fields": "ទីលាន", "Payments": "ការទូទាត់", "Customers": "អតិថិជន",
  "Settings & reports": "ការកំណត់ និងរបាយការណ៍", "Administrator sign in": "ចូលអ្នកគ្រប់គ្រង",
};
const t = (value) => language === "km" ? (translations[value] || value) : value;

function showNotice(message, error = false) {
  const node = error ? $("#error") : $("#notice");
  const other = error ? $("#notice") : $("#error");
  other.classList.add("hidden");
  node.textContent = message;
  node.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function clearNotice() {
  $("#notice").classList.add("hidden");
  $("#error").classList.add("hidden");
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin", ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}
const json = (method, body) => ({ method, body: JSON.stringify(body) });
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]));
const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
const accessTokens = () => {
  try { return JSON.parse(localStorage.getItem("sunny-sport-club-booking-access") || "[]"); }
  catch { return []; }
};
function rememberAccess(bookingId, token) {
  const rows = accessTokens().filter((item) => item.bookingId !== bookingId);
  rows.unshift({ bookingId, token });
  localStorage.setItem("sunny-sport-club-booking-access", JSON.stringify(rows.slice(0, 50)));
}
function dateInputValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Phnom_Penh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function statusPill(value) {
  const cls = String(value || "").toLowerCase();
  return `<span class="pill ${escapeHtml(cls)}">${escapeHtml(value || "—")}</span>`;
}
function safeDateLabel(value) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? escapeHtml(value) : date.toLocaleDateString(language === "km" ? "km-KH" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function availableStartTimes() {
  const match = /^(\d\d):00-(\d\d|24):00$/.exec(settings.openingHours);
  const start = match ? Number(match[1]) * 60 : 360;
  const end = match ? Number(match[2]) * 60 : 1440;
  const options = [];
  for (let minute = start; minute + 60 <= end; minute += 30) {
    options.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return options;
}
function updateTotals() {
  const field = fields.find((item) => item.id === $("#field-select").value);
  const duration = Number($("#booking-form").elements.duration.value || 1);
  if (!field) { $("#booking-total").textContent = ""; return; }
  const fee = Math.round(settings.bookingFeeKhr * 100 / settings.usdToKhrRate);
  $("#booking-total").textContent = `Estimated total: ${money(field.hourlyRateCents * duration + fee)} (includes ${money(fee)} booking fee). A 10% deposit is required via manual KHQR.`;
}
async function loadAvailability() {
  const fieldId = $("#field-select").value;
  const date = $("#booking-form").elements.date.value;
  if (!fieldId || !date) return;
  const result = await api(`/api/availability?fieldId=${encodeURIComponent(fieldId)}&date=${encodeURIComponent(date)}`);
  const busy = new Set(result.unavailable);
  $$("#start-time option").forEach((option) => { option.disabled = busy.has(option.value); });
}
async function loadPublic() {
  const [fieldRows, publicSettings] = await Promise.all([api("/api/fields"), api("/api/public-config")]);
  fields = fieldRows;
  settings = publicSettings;
  $("#field-select").innerHTML = fields.length
    ? fields.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)} · ${money(item.hourlyRateCents)}/hr</option>`).join("")
    : `<option value="">No fields currently available</option>`;
  $("#start-time").innerHTML = availableStartTimes().map((time) => `<option value="${time}">${time}</option>`).join("");
  $("#hours-label").textContent = `Open ${settings.openingHours.replace("-", "–")}`;
  const date = $("#booking-form").elements.date;
  date.min = dateInputValue();
  if (!date.value) date.value = date.min;
  updateTotals();
}
function formValues(form) { return Object.fromEntries(new FormData(form).entries()); }
function hideCustomerForms() {
  ["login-form", "register-form", "recovery-form", "verify-form", "reset-form"].forEach((id) => $(`#${id}`).classList.add("hidden"));
}
function showCustomerForm(name) {
  hideCustomerForms();
  if (name) $(`#${name}`).classList.remove("hidden");
}
function updateCustomerState(value) {
  customer = value || null;
  $("#customer-signout").classList.toggle("hidden", !customer);
  if (customer) {
    $("#booking-form").elements.customerName.value = customer.name;
    $("#booking-form").elements.phone.value = customer.phone || "";
    hideCustomerForms();
    showNotice(`Signed in as ${customer.name}.`);
  }
}
async function loadCustomerBookings() {
  try {
    const result = await api("/api/customer/bookings", json("POST", { action: "list", tokens: accessTokens().map((item) => item.token) }));
    const rows = result.bookings || [];
    if (!rows.length) {
      $("#customer-bookings").textContent = customer ? "No bookings yet." : "Sign in to view your booking history.";
      return;
    }
    $("#customer-bookings").innerHTML = `<table><thead><tr><th>Reference</th><th>Field</th><th>Date / time</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((booking) => {
      const access = accessTokens().find((item) => item.bookingId === booking.id);
      const canCancel = booking.status === "PENDING" && booking.paymentStatus === "PENDING" && (customer || access);
      return `<tr><td>${escapeHtml(booking.reference)}</td><td>${escapeHtml(booking.field?.name)}</td><td>${safeDateLabel(booking.date)}<br>${escapeHtml(booking.startTime)}–${escapeHtml(booking.endTime)}</td><td>${money(booking.totalCents)}</td><td>${statusPill(booking.status)} ${statusPill(booking.paymentStatus)}</td><td>${canCancel ? `<button class="button secondary cancel-customer" data-id="${escapeHtml(booking.id)}" data-token="${escapeHtml(access?.token || "")}">Cancel</button>` : ""}</td></tr>`;
    }).join("")}</tbody></table>`;
    $$(".cancel-customer").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("Cancel this unpaid booking and release its time slot?")) return;
      try {
        await api("/api/customer/bookings", json("POST", { action: "cancel", bookingId: button.dataset.id, ...(button.dataset.token ? { token: button.dataset.token } : {}) }));
        showNotice("Booking cancelled.");
        await loadCustomerBookings();
      } catch (error) { showNotice(error.message, true); }
    }));
  } catch (error) { $("#customer-bookings").textContent = error.message; }
}
async function loadAdmin() {
  bookings = await api("/api/bookings");
  const report = await api("/api/reports?period=week");
  $("#admin-summary").innerHTML = [
    ["Bookings this week", report.bookingCount], ["Paid revenue", money(report.revenueCents)],
    ["Pending payments", report.pendingPayments], ["Active fields", fields.filter((item) => item.active).length],
  ].map(([label, value]) => `<div class="stat"><span class="muted">${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");
  await renderAdminTab();
}
function bookingTable(rows, showActions = true) {
  if (!rows.length) return `<p class="muted">No bookings found.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Reference / customer</th><th>Field</th><th>Date / time</th><th>Total / paid</th><th>Status</th>${showActions ? "<th>Actions</th>" : ""}</tr></thead><tbody>${rows.map((booking) => `<tr>
    <td><b>${escapeHtml(booking.reference)}</b><br>${escapeHtml(booking.customerName)}<br><span class="muted">${escapeHtml(booking.phone)}</span></td>
    <td>${escapeHtml(booking.field?.name)}</td><td>${safeDateLabel(booking.date)}<br>${escapeHtml(booking.startTime)}–${escapeHtml(booking.endTime)}</td>
    <td>${money(booking.totalCents)}<br><span class="muted">Paid ${money(booking.amountPaidCents)}</span></td>
    <td>${statusPill(booking.status)} ${statusPill(booking.paymentStatus)}</td>
    ${showActions ? `<td><div class="actions">
      ${booking.paymentStatus === "PENDING" && booking.status !== "CANCELLED" ? `<button class="button primary pay-action" data-id="${escapeHtml(booking.id)}" data-action="verify">Verify deposit</button><button class="button secondary pay-action" data-id="${escapeHtml(booking.id)}" data-action="fail">Fail</button>` : ""}
      ${booking.paymentStatus === "PAID" ? `<button class="button secondary pay-action" data-id="${escapeHtml(booking.id)}" data-action="refund">Record refund</button>` : ""}
      ${booking.status !== "CANCELLED" ? `<button class="button secondary admin-cancel" data-id="${escapeHtml(booking.id)}">Cancel</button><button class="button secondary admin-reschedule" data-id="${escapeHtml(booking.id)}">Reschedule</button>` : ""}
    </div></td>` : ""}
  </tr>`).join("")}</tbody></table></div>`;
}
async function renderAdminTab() {
  const area = $("#admin-content");
  try {
    if (currentAdminTab === "bookings") {
      area.innerHTML = `<div class="toolbar"><input id="booking-search" type="search" placeholder="Search reference, customer or phone"><select id="booking-filter"><option value="ALL">All bookings</option><option value="ACTIVE">Active</option><option value="PENDING">Pending payment</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option></select><button id="refresh-admin" class="button secondary">Refresh</button></div><div id="booking-table"></div>`;
      const update = () => {
        const search = $("#booking-search").value.toLowerCase();
        const filter = $("#booking-filter").value;
        const rows = bookings.filter((item) => [item.reference, item.customerName, item.phone, item.field?.name].some((value) => String(value || "").toLowerCase().includes(search)))
          .filter((item) => filter === "ALL" || (filter === "ACTIVE" ? item.status !== "CANCELLED" : item.status === filter || item.paymentStatus === filter));
        $("#booking-table").innerHTML = bookingTable(rows);
        bindBookingActions();
      };
      $("#booking-search").addEventListener("input", update);
      $("#booking-filter").addEventListener("change", update);
      $("#refresh-admin").addEventListener("click", async () => { await loadAdmin(); });
      update();
    } else if (currentAdminTab === "schedule") {
      area.innerHTML = `<div class="toolbar"><label>Schedule date <input id="schedule-date" type="date" value="${currentDate}"></label></div><div id="schedule-table"></div>`;
      const show = () => {
        currentDate = $("#schedule-date").value;
        const rows = bookings.filter((item) => item.date === currentDate && item.status !== "CANCELLED").sort((a, b) => a.startTime.localeCompare(b.startTime));
        $("#schedule-table").innerHTML = bookingTable(rows, false);
      };
      $("#schedule-date").addEventListener("change", show); show();
    } else if (currentAdminTab === "payments") {
      area.innerHTML = bookingTable(bookings.filter((item) => item.paymentStatus !== "PAID" || item.status === "CANCELLED"));
      bindBookingActions();
    } else if (currentAdminTab === "customers") {
      const distinct = new Map();
      for (const item of bookings) {
        const key = item.customerAccountId || `${item.customerName}|${item.phone}`;
        if (!distinct.has(key)) distinct.set(key, { name: item.customerName, phone: item.phone, count: 0, latest: item.date });
        distinct.get(key).count += 1;
      }
      const rows = [...distinct.values()].sort((a, b) => b.latest.localeCompare(a.latest));
      area.innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>Customer</th><th>Phone</th><th>Bookings</th><th>Latest booking</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.phone)}</td><td>${item.count}</td><td>${safeDateLabel(item.latest)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No customer bookings yet.</p>`;
    } else if (currentAdminTab === "fields") {
      fields = await api("/api/fields");
      area.innerHTML = `<div class="toolbar"><h3>Fields</h3><button id="new-field" class="button primary">Add field</button></div>
        <div class="table-wrap"><table><thead><tr><th>Name</th><th>Surface</th><th>Hourly price</th><th>Status</th><th></th></tr></thead><tbody>${fields.map((field) => `<tr><td>${escapeHtml(field.name)}</td><td>${escapeHtml(field.surface)}</td><td>${money(field.hourlyRateCents)}</td><td>${field.active ? "Active" : "Inactive"}</td><td><button class="button secondary edit-field" data-id="${escapeHtml(field.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div><form id="field-form" class="form-grid hidden card"><input name="id" type="hidden"><label>Name<input name="name" minlength="2" maxlength="50" required></label><label>Surface<input name="surface" value="Artificial turf" required></label><label>Hourly price (USD)<input name="price" type="number" min="0" step="0.01" required></label><label>Description<input name="description" maxlength="250"></label><label>Active<select name="active"><option value="true">Active</option><option value="false">Inactive</option></select></label><button class="button primary">Save field</button></form>`;
      $("#new-field").addEventListener("click", () => { $("#field-form").reset(); $("#field-form").elements.id.value = ""; $("#field-form").classList.remove("hidden"); });
      $$(".edit-field").forEach((button) => button.addEventListener("click", () => {
        const item = fields.find((field) => field.id === button.dataset.id);
        const form = $("#field-form");
        form.elements.id.value = item.id; form.elements.name.value = item.name; form.elements.surface.value = item.surface;
        form.elements.price.value = (item.hourlyRateCents / 100).toFixed(2); form.elements.description.value = item.description || "";
        form.elements.active.value = String(item.active); form.classList.remove("hidden");
      }));
      $("#field-form").addEventListener("submit", saveField);
    } else if (currentAdminTab === "settings") {
      const [saved, report] = await Promise.all([api("/api/settings"), api("/api/reports?period=week")]);
      area.innerHTML = `<h3>Booking settings</h3><form id="settings-form" class="form-grid compact">
        <label>Opening hours (HH:00-HH:00)<input name="openingHours" value="${escapeHtml(saved.openingHours)}" required></label>
        <label>USD to KHR rate<input name="usdToKhrRate" type="number" min="1000" max="10000" value="${saved.usdToKhrRate}" required></label>
        <label>Booking fee in KHR<input name="bookingFeeKhr" type="number" min="0" max="1000000" value="${saved.bookingFeeKhr}" required></label>
        <button class="button primary">Save settings</button></form>
        <div class="card"><h3>Integrations</h3><p>Email recovery: ${saved.emailRecoveryConfigured ? "Configured" : "Not configured"} · SMS recovery: ${saved.phoneRecoveryConfigured ? "Configured" : "Not configured"} · Telegram: ${saved.telegramConfigured ? "Configured" : "Not configured"} · KHQR: ${saved.khqrConfigured ? "Configured" : "Not configured"}</p><p class="muted">Payment mode: ${escapeHtml(saved.paymentMode)}. Configure providers in the server environment, not this browser.</p><button id="telegram-test" class="button secondary">Send Telegram test</button></div>
        <div class="report-row"><label>Report period<select id="report-period"><option value="day">Today</option><option value="week" selected>Last 7 days</option><option value="month">This month</option></select></label><div class="card">Bookings: <b id="report-count">${report.bookingCount}</b> · Revenue: <b id="report-revenue">${money(report.revenueCents)}</b> · Pending: <b id="report-pending">${report.pendingPayments}</b></div></div>`;
      $("#settings-form").addEventListener("submit", saveSettings);
      $("#telegram-test").addEventListener("click", async () => {
        try { await api("/api/admin/telegram-test", json("POST", {})); showNotice("Telegram test message sent."); }
        catch (error) { showNotice(error.message, true); }
      });
      $("#report-period").addEventListener("change", async (event) => {
        try {
          const value = await api(`/api/reports?period=${encodeURIComponent(event.target.value)}`);
          $("#report-count").textContent = value.bookingCount; $("#report-revenue").textContent = money(value.revenueCents); $("#report-pending").textContent = value.pendingPayments;
        } catch (error) { showNotice(error.message, true); }
      });
    }
  } catch (error) { area.textContent = error.message; }
}
function bindBookingActions() {
  $$(".pay-action").forEach((button) => button.addEventListener("click", async () => {
    const action = button.dataset.action;
    const prompt = action === "verify" ? "Confirm receipt of this booking deposit (manual KHQR verification)?" : action === "refund" ? "Confirm the refund was actually completed?" : "Mark payment failed and release this slot?";
    if (!confirm(prompt)) return;
    try { await api(`/api/payments/${button.dataset.id}`, json("POST", { action })); showNotice("Payment status updated."); await loadAdmin(); }
    catch (error) { showNotice(error.message, true); }
  }));
  $$(".admin-cancel").forEach((button) => button.addEventListener("click", async () => {
    if (!confirm("Cancel this booking and release its time slot?")) return;
    try { await api(`/api/bookings/${button.dataset.id}`, json("PATCH", { action: "cancel" })); showNotice("Booking cancelled."); await loadAdmin(); }
    catch (error) { showNotice(error.message, true); }
  }));
  $$(".admin-reschedule").forEach((button) => button.addEventListener("click", async () => {
    const item = bookings.find((booking) => booking.id === button.dataset.id);
    const date = prompt("New date (YYYY-MM-DD)", item?.date || currentDate);
    if (!date) return;
    const startTime = prompt("New start time (HH:MM)", item?.startTime || "18:00");
    if (!startTime) return;
    try { await api(`/api/bookings/${button.dataset.id}`, json("PATCH", { action: "reschedule", date, startTime })); showNotice("Booking rescheduled."); await loadAdmin(); }
    catch (error) { showNotice(error.message, true); }
  }));
}
async function saveField(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const id = form.elements.id.value;
  const input = {
    name: form.elements.name.value, surface: form.elements.surface.value,
    hourlyRateCents: Math.round(Number(form.elements.price.value) * 100),
    description: form.elements.description.value, active: form.elements.active.value === "true",
  };
  try {
    await api("/api/fields", json(id ? "PATCH" : "POST", id ? { id, ...input } : input));
    showNotice("Field saved."); await loadPublic(); await loadAdmin();
  } catch (error) { showNotice(error.message, true); }
}
async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  try {
    await api("/api/settings", json("PUT", {
      openingHours: form.elements.openingHours.value,
      usdToKhrRate: Number(form.elements.usdToKhrRate.value),
      bookingFeeKhr: Number(form.elements.bookingFeeKhr.value),
    }));
    showNotice("Settings saved."); await loadPublic(); await loadAdmin();
  } catch (error) { showNotice(error.message, true); }
}
async function refreshAuthState() {
  const [adminResult, customerResult] = await Promise.all([api("/api/admin/me"), api("/api/customer/me")]);
  admin = adminResult.authenticated;
  customer = customerResult.authenticated ? customerResult.customer : null;
  $("#customer-signout").classList.toggle("hidden", !customer);
  $("#admin-login-area").classList.toggle("hidden", admin);
  $("#admin-console").classList.toggle("hidden", !admin);
  if (admin) await loadAdmin();
  else await loadCustomerBookings();
}

function applyLanguage() {
  $("#language-toggle").textContent = language === "en" ? "ខ្មែរ" : "English";
  $("#book").querySelector("h2").textContent = t("Book a field");
  $("#my-bookings").querySelector("h2").textContent = t("My bookings");
  $("#admin").querySelector("h2").textContent = admin ? t("Administrator dashboard") : t("Administrator sign in");
  $$("#admin-tabs button").forEach((button) => {
    const source = button.dataset.tab === "settings" ? "Settings & reports" : button.dataset.tab[0].toUpperCase() + button.dataset.tab.slice(1);
    button.textContent = t(source);
  });
}
$("#language-toggle").addEventListener("click", () => {
  language = language === "en" ? "km" : "en";
  localStorage.setItem("sunny-language", language);
  applyLanguage();
});
$("#show-login").addEventListener("click", () => showCustomerForm("login-form"));
$("#show-register").addEventListener("click", () => showCustomerForm("register-form"));
$("#show-recovery").addEventListener("click", () => showCustomerForm("recovery-form"));
$("#admin-entry").addEventListener("click", () => { $("#admin").classList.toggle("hidden"); $("#admin").scrollIntoView({ behavior: "smooth" }); });
$("#booking-form").elements.date.addEventListener("change", () => loadAvailability().catch((error) => showNotice(error.message, true)));
$("#field-select").addEventListener("change", () => {
  updateTotals();
  loadAvailability().catch((error) => showNotice(error.message, true));
});
$("#booking-form").elements.duration.addEventListener("change", updateTotals);
$("#booking-form").addEventListener("submit", async (event) => {
  event.preventDefault(); clearNotice();
  if (!customer) { showNotice("Sign in or create a customer account before booking.", true); showCustomerForm("login-form"); return; }
  const input = formValues(event.currentTarget);
  input.duration = Number(input.duration);
  try {
    const result = await api("/api/bookings", json("POST", input));
    rememberAccess(result.booking.id, result.customerAccessToken);
    const payment = result.payment;
    $("#booking-result").innerHTML = `<h3>Booking ${escapeHtml(result.booking.reference)} created</h3><p>${escapeHtml(result.booking.field.name)} · ${safeDateLabel(result.booking.date)} · ${escapeHtml(result.booking.startTime)}–${escapeHtml(result.booking.endTime)}</p><p>Total ${money(result.booking.totalCents)} · Deposit ${money(payment.depositCents)}</p><p>${escapeHtml(payment.instructions)}</p>${payment.paymentUrl ? `<p><a class="button primary" href="${escapeHtml(payment.paymentUrl)}" target="_blank" rel="noopener">Open KHQR payment link</a></p>` : ""}${payment.qrImageUrl ? `<img src="${escapeHtml(payment.qrImageUrl)}" alt="KHQR payment code" width="220">` : ""}<p class="muted">Payment is manual. Admin confirmation is required; no payment was collected automatically.</p>`;
    $("#booking-result").classList.remove("hidden");
    showNotice("Booking created. Your reference and deposit instructions are shown below.");
    await loadCustomerBookings();
  } catch (error) { showNotice(error.message, true); }
});
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { const result = await api("/api/customer/login", json("POST", formValues(event.currentTarget))); updateCustomerState(result.customer); await loadCustomerBookings(); }
  catch (error) { showNotice(error.message, true); }
});
$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { const result = await api("/api/customer/register", json("POST", formValues(event.currentTarget))); updateCustomerState(result.customer); await loadCustomerBookings(); }
  catch (error) { showNotice(error.message, true); }
});
$("#recovery-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formValues(event.currentTarget);
  recovery = values;
  try { const result = await api("/api/customer/forgot-password", json("POST", values)); showNotice(result.message || "If an account matches, instructions will be sent."); showCustomerForm("verify-form"); }
  catch (error) { showNotice(error.message, true); }
});
$("#verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const result = await api("/api/customer/verify-reset-code", json("POST", { ...recovery, ...formValues(event.currentTarget) }));
    resetToken = result.resetToken; showCustomerForm("reset-form");
  } catch (error) { showNotice(error.message, true); }
});
$("#reset-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/customer/reset-password", json("POST", { resetToken, ...formValues(event.currentTarget) }));
    resetToken = ""; showCustomerForm("login-form"); showNotice("Password reset. Sign in with your new password.");
  } catch (error) { showNotice(error.message, true); }
});
$("#customer-signout").addEventListener("click", async () => {
  try { await api("/api/customer/logout", json("POST", {})); updateCustomerState(null); await refreshAuthState(); showNotice("Signed out."); }
  catch (error) { showNotice(error.message, true); }
});
$("#refresh-customer-bookings").addEventListener("click", loadCustomerBookings);
$("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/login", json("POST", formValues(event.currentTarget)));
    admin = true; $("#admin-login-area").classList.add("hidden"); $("#admin-console").classList.remove("hidden"); await loadAdmin(); showNotice("Signed in to the administrator dashboard.");
  } catch (error) { showNotice(error.message, true); }
});
$("#admin-logout").addEventListener("click", async () => {
  try { await api("/api/admin/logout", json("POST", {})); admin = false; $("#admin-login-area").classList.remove("hidden"); $("#admin-console").classList.add("hidden"); showNotice("Administrator signed out."); }
  catch (error) { showNotice(error.message, true); }
});
$("#admin-tabs").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-tab]");
  if (!button) return;
  currentAdminTab = button.dataset.tab;
  $$("#admin-tabs button").forEach((item) => item.classList.toggle("selected", item === button));
  await renderAdminTab();
});

async function init() {
  try {
    await loadPublic();
    await refreshAuthState();
    applyLanguage();
    await loadAvailability();
  } catch (error) { showNotice(error.message, true); }
}
init();

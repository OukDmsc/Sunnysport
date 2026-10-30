"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { LanguageToggle, useLanguage } from "@/lib/language";
import { formatTime, formatTimeRange } from "@/lib/time";
import { calculateBookingAmountDueCents } from "@/lib/deposit";
import {
  BOOKING_DISCOUNT_CENTS,
  BOOKING_DURATION_HOURS,
  PLAYING_HOURS,
  calculateFinalBookingTotalCents,
  calculateTotalCents,
} from "@/lib/booking";

type Field = {
  id: string;
  name: string;
  surface: string;
  hourlyRateCents: number;
  description: string;
  active: boolean;
};

type Booking = {
  id: string;
  reference: string;
  customerName: string;
  phone: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  totalCents: number;
  bookingFeeCents: number;
  amountPaidCents: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  field: Field;
};

type CustomerAccount = { id: string; name: string; email: string | null; phone: string | null };
type AdminSettings = {
  openingHours: string;
  usdToKhrRate: number;
  paymentMode: string;
  telegramConfigured: boolean;
  khqrConfigured: boolean;
  khqrAmountPrefillConfigured: boolean;
  khqrDynamicConfigurationStarted: boolean;
  emailRecoveryConfigured: boolean;
  phoneRecoveryConfigured: boolean;
};
type PublicConfig = { openingHours: string; usdToKhrRate: number };

type PageTab = "overview" | "bookings" | "calendar" | "fields" | "payments" | "customers" | "settings";
type CustomerBookingAccess = { bookingId: string; token: string };
const CUSTOMER_BOOKING_STORAGE_KEY = "sunny-sport-club-booking-access";
const CUSTOMER_BOOKING_HISTORY_HIDDEN_BEFORE_KEY = "sunny-sport-club-booking-history-hidden-before";

const tabs: { id: PageTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "◫" },
  { id: "bookings", label: "Bookings", icon: "▤" },
  { id: "calendar", label: "Schedule", icon: "▦" },
  { id: "fields", label: "Fields", icon: "⚽" },
  { id: "payments", label: "Payments", icon: "＄" },
  { id: "customers", label: "Customers", icon: "♙" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

const localToday = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.errorCode ? `${data.error ?? "The request could not be completed."} (${data.errorCode})` : data.error ?? "The request could not be completed.");
  return data as T;
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatKhqrAmount(currency: "USD" | "KHR", amount: number, language: "en" | "km") {
  return currency === "KHR"
    ? `៛${Math.round(amount).toLocaleString(language === "km" ? "km-KH" : "en")}`
    : `$${amount.toFixed(2)}`;
}

function moneyRiel(cents: number, rate: number, language: "en" | "km" = "en") {
  return `៛${Math.round(cents / 100 * rate).toLocaleString(language === "km" ? "km-KH" : "en")}`;
}

function formatDate(date: string, language: "en" | "km" = "en") {
  return new Date(`${date}T12:00:00`).toLocaleDateString(language === "km" ? "km-KH" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Phnom_Penh",
  });
}

function StatusPill({ value }: { value: string }) {
  const { t } = useLanguage();
  return <span className={`pill ${value.toLowerCase()}`}>{t(value.toLowerCase())}</span>;
}

function Brand() {
  const { t } = useLanguage();
  return <div className="brand"><img className="brand-logo" src="/sunny-sport-club.jpg" alt="Sunny Sports Club" /><span><span className="brand-wordmark">SUNNY <span className="brand-accent">SPORT CLUB</span></span><small>{t("FIELD MANAGEMENT")}</small></span></div>;
}

export default function Home() {
  const { language, t } = useLanguage();
  const [fields, setFields] = useState<Field[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [authenticated, setAuthenticated] = useState(false);
  const [customerAccount, setCustomerAccount] = useState<CustomerAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<PageTab>("overview");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [today, setToday] = useState(localToday());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig>({ openingHours: PLAYING_HOURS, usdToKhrRate: 4100 });
  const [newBookingOpen, setNewBookingOpen] = useState(false);
  const [customerBookingsVersion, setCustomerBookingsVersion] = useState(0);

  const loadFields = useCallback(async () => {
    const [availableFields, config] = await Promise.all([
      api<Field[]>("/api/fields"),
      api<PublicConfig>("/api/public-config"),
    ]);
    setFields(availableFields);
    setPublicConfig(config);
  }, []);
  const loadAdminData = useCallback(async () => {
    const [rows, fieldRows, preferences] = await Promise.all([
      api<Booking[]>("/api/bookings"),
      api<Field[]>("/api/fields"),
      api<AdminSettings>("/api/settings"),
    ]);
    setBookings(rows);
    setFields(fieldRows);
    setSettings(preferences);
    setPublicConfig({ openingHours: PLAYING_HOURS, usdToKhrRate: preferences.usdToKhrRate });
  }, []);

  useEffect(() => {
    let active = true;
    api<{ authenticated: boolean }>("/api/admin/me")
      .then(async (result) => {
        if (!active) return;
        setAuthenticated(result.authenticated);
        if (result.authenticated) await loadAdminData();
        else {
          await loadFields();
          const session = await api<{ authenticated: boolean; customer?: CustomerAccount }>("/api/customer/me");
          if (active && session.authenticated) setCustomerAccount(session.customer ?? null);
        }
      })
      .catch((cause: Error) => setError(t(cause.message)))
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, [loadAdminData, loadFields, t]);

  const todaysBookings = bookings.filter((booking) => booking.date === today && booking.status !== "CANCELLED");
  const paidBookings = bookings.filter((booking) => booking.paymentStatus === "PAID");
  const pendingBookings = bookings.filter((booking) => booking.paymentStatus === "PENDING");
  const revenue = paidBookings.reduce((total, booking) => total + booking.amountPaidCents, 0);
  const visibleBookings = useMemo(() => bookings.filter((booking) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [booking.reference, booking.customerName, booking.phone, booking.field.name].some((value) => value.toLowerCase().includes(query));
    const matchesFilter = filter === "ALL" || (filter === "ACTIVE" ? booking.status !== "CANCELLED" : booking.paymentStatus === filter || booking.status === filter);
    return matchesQuery && matchesFilter;
  }), [bookings, search, filter]);
  const pagedBookings = visibleBookings.slice(page * 8, page * 8 + 8);

  async function refresh() {
    await loadAdminData();
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      setAuthenticated(true);
      await loadAdminData();
      setMessage(t("Signed in to the administrator dashboard."));
    } catch (cause) {
      setError(t((cause as Error).message));
    }
  }

  async function logout() {
    await api("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
    setBookings([]);
    setSettings(null);
    setTab("overview");
    setNewBookingOpen(false);
    await loadFields();
    setMessage(t("You have been signed out."));
  }

  async function customerLogout() {
    await api("/api/customer/logout", { method: "POST" });
    setCustomerAccount(null);
    setCustomerBookingsVersion((version) => version + 1);
    setMessage(t("You have been signed out."));
  }

  async function notifyResult(result: { notification?: { delivered: boolean; reason?: string } }) {
    if (result.notification && !result.notification.delivered && result.notification.reason !== "Telegram is not configured.") {
      setMessage(`${t("Saved successfully.")} ${t(result.notification.reason ?? "")}`);
    }
    await refresh();
  }

  async function reviewPayment(booking: Booking, action: "verify" | "fail" | "refund") {
    const transactionReference = action === "verify"
      ? window.prompt(t("Enter the transaction reference shown in your bank or payment provider's transaction history."))
      : null;
    if (action === "verify" && !transactionReference?.trim()) return;
    const prompt = action === "verify"
      ? `${t("Confirm that you verified receipt of")} ${money(calculateBookingAmountDueCents(booking.totalCents, booking.bookingFeeCents))} ${t("for")} ${booking.reference}? ${t("This is manual KHQR verification.")} ${t("Transaction reference")}: ${transactionReference?.trim()}`
      : action === "refund"
        ? `${t("Confirm that")} ${money(booking.totalCents)} ${t("was actually refunded for")} ${booking.reference}?`
        : `${t("Mark payment")} ${booking.reference} ${t("as failed and release its time slot?")}`;
    if (!window.confirm(prompt)) return;
    try {
      const result = await api<{ notification?: { delivered: boolean; reason?: string } }>(`/api/payments/${booking.id}`, {
        method: "POST",
        body: JSON.stringify(action === "verify"
          ? { action, transactionReference: transactionReference?.trim() }
          : { action }),
      });
      setMessage(t(action === "verify" ? "Payment verified; booking confirmed." : action === "refund" ? "Refund recorded." : "Payment marked failed; time slot released."));
      await notifyResult(result);
    } catch (cause) {
      setError(t((cause as Error).message));
    }
  }

  async function updateBooking(booking: Booking, action: "cancel" | "reschedule") {
    let body: Record<string, string> = { action };
    if (action === "cancel") {
      if (!window.confirm(`${t("Confirm cancellation of")} ${booking.reference}?`)) return;
    } else {
      const date = window.prompt(t("New date (YYYY-MM-DD)"), booking.date);
      if (!date) return;
      const startTime = window.prompt(t("New start time (HH:MM, 30-minute intervals)"), booking.startTime);
      if (!startTime) return;
      body = { action, date, startTime };
    }
    try {
      const result = await api<{ notification?: { delivered: boolean; reason?: string } }>(`/api/bookings/${booking.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage(t(action === "cancel" ? "Booking cancelled." : "Booking rescheduled."));
      await notifyResult(result);
    } catch (cause) {
      setError(t((cause as Error).message));
    }
  }

  async function deleteBooking(booking: Booking) {
    const confirmed = window.confirm(
      `${t("Permanently delete booking history for")} #${booking.reference}? ${t("This cannot be undone. Payment, customer, date, and booking records will be removed.")}`,
    );
    if (!confirmed) return;
    try {
      await api<{ deleted: boolean }>(`/api/bookings/${booking.id}`, { method: "DELETE" });
      setMessage(t("Booking history permanently deleted."));
      await refresh();
    } catch (cause) {
      setError(t((cause as Error).message));
    }
  }

  if (!loaded) return <main className="loading"><span className="loader" />{t("Preparing your pitch...")}</main>;

  return (
    <main className="app-shell">
      {error && <div className="toast toast-error" role="alert"><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
      {message && <div className="toast toast-success" role="status"><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}
      {authenticated ? (
        <div className="dashboard">
          <aside className="sidebar">
            <Brand />
            <div className="side-label">{t("WORKSPACE")}</div>
            <nav>{tabs.map((item) => <button key={item.id} className={`nav-item ${tab === item.id ? "selected" : ""}`} onClick={() => { setTab(item.id); setPage(0); }}><span>{item.icon}</span>{t(item.label)}{item.id === "payments" && pendingBookings.length > 0 && <i>{pendingBookings.length}</i>}</button>)}</nav>
            <div className="sidebar-bottom">
              <div className="admin-card"><span className="avatar">AD</span><span><b>{t("Administrator")}</b><small>{t("Field manager")}</small></span><button aria-label={t("Sign out")} onClick={logout}>↗</button></div>
              <div className="version">SUNNY SPORT CLUB · {t("Cambodia")}</div>
            </div>
          </aside>
          <section className="main-area">
            <header className="topbar"><div><span className="eyebrow">{t("FIELD OPERATIONS")}</span><h1>{t(tabs.find((item) => item.id === tab)?.label ?? "Overview")}</h1></div><div className="top-actions"><span className="live-indicator">{t("OPEN TODAY")}</span><button className="outline-button" onClick={() => { setTab("bookings"); setNewBookingOpen(true); }}>＋ {t("New booking")}</button><span className="today-label">{formatDate(today, language)}</span><LanguageToggle /></div></header>
            <div className="content">
              {tab === "overview" && <Overview bookings={bookings} today={today} todayCount={todaysBookings.length} revenue={revenue} pending={pendingBookings.length} settings={settings} onViewBookings={() => setTab("bookings")} />}
              {tab === "bookings" && <BookingsPanel bookings={pagedBookings} fields={fields.filter((field) => field.active)} openingHours={PLAYING_HOURS} usdToKhrRate={settings?.usdToKhrRate ?? publicConfig.usdToKhrRate} creating={newBookingOpen} onCreatingChange={setNewBookingOpen} total={visibleBookings.length} page={page} search={search} filter={filter} onSearch={(value) => { setSearch(value); setPage(0); }} onFilter={(value) => { setFilter(value); setPage(0); }} onPage={setPage} onReview={reviewPayment} onUpdate={updateBooking} onDelete={deleteBooking} onCreated={refresh} onError={setError} />}
              {tab === "calendar" && <CalendarPanel bookings={bookings} fields={fields} openingHours={PLAYING_HOURS} date={today} onDate={setToday} />}
              {tab === "fields" && <FieldsPanel fields={fields} usdToKhrRate={settings?.usdToKhrRate ?? publicConfig.usdToKhrRate} onSaved={async () => { await loadAdminData(); setMessage(t("Field details saved.")); }} onError={(value) => setError(value)} />}
              {tab === "payments" && <PaymentsPanel bookings={bookings} onReview={reviewPayment} onDelete={deleteBooking} />}
              {tab === "customers" && <CustomersPanel bookings={bookings} />}
              {tab === "settings" && settings && <SettingsPanel settings={settings} onSaved={(value) => { setSettings(value); setPublicConfig({ openingHours: PLAYING_HOURS, usdToKhrRate: value.usdToKhrRate }); setMessage(t("Settings saved.")); }} onError={(value) => setError(value)} />}
              <div className="dashboard-foot">{t("Made for the game")} <span>·</span> {t("Cambodia")} <span>·</span> {t("Prices shown in USD")}</div>
            </div>
          </section>
        </div>
      ) : (
        <div className="public-page">
          <header className="public-nav"><Brand /><div className="public-nav-actions"><LanguageToggle />{customerAccount ? <><a className="text-button" href="#my-bookings">{t("My bookings")}</a><span className="customer-nav-name">{customerAccount.name}</span><button className="text-button" onClick={customerLogout}>{t("Sign out")}</button></> : <a className="text-button" href="#book-field">{t("Customer sign in")}</a>}<button className="text-button" onClick={() => document.getElementById("admin-login")?.scrollIntoView({ behavior: "smooth" })}>{t("Admin sign in")} <span>↗</span></button></div></header>
          <section className="hero">
            <div className="hero-copy"><span className="eyebrow">{t("YOUR NEXT GAME STARTS HERE")}</span><h1>{t("Book the pitch.")}<br /><em>{t("Bring the game.")}</em></h1><p>{t("Easy field booking for teams, friends, and unforgettable match nights.")}</p><div className="hero-actions"><a href="#book-field" className="primary-button">{t("Book a field")} <span>↓</span></a><span className="hero-note"><b>●</b> {t("Online booking available")}</span></div><div className="hero-stats"><span><b>{fields.length || "—"}</b> {t("pitches")}</span><span><b>{formatTimeRange(publicConfig.openingHours, language)}</b> {t("daily hours")}</span><span><b>KHQR</b> {t("payment")}</span></div></div>
            <div className="hero-visual"><div className="field-art"><div className="pitch-line center-line" /><div className="pitch-circle" /><div className="pitch-box pitch-box-left" /><div className="pitch-box pitch-box-right" /><div className="pitch-goal pitch-goal-left" /><div className="pitch-goal pitch-goal-right" /><span className="art-ball">⚽</span></div><div className="hero-float"><span>✦</span><span><b>{t("Make time for the match")}</b><small>{t("Book online in a few taps")}</small></span></div><div className="hero-deco">PITCH<br />READY</div></div>
          </section>
          <section id="book-field" className="booking-section"><div className="section-heading"><span className="eyebrow">{t("QUICK & EASY")}</span><h2>{t("Reserve your field")}</h2><p>{t("Pick your pitch and game time. We'll hold your booking while payment is verified.")}</p></div>{customerAccount ? <BookingForm customer={customerAccount} fields={fields.filter((field) => field.active)} openingHours={PLAYING_HOURS} usdToKhrRate={publicConfig.usdToKhrRate} onComplete={(booking) => { setMessage(`${t("Booking")} ${booking.reference} ${t("created. Please complete KHQR payment.")}`); setCustomerBookingsVersion((version) => version + 1); }} onError={setError} /> : <CustomerAuthPanel onAuthenticated={(customer) => { setCustomerAccount(customer); setCustomerBookingsVersion((version) => version + 1); setMessage(t("You are signed in. You can now book a field.")); }} onError={setError} />}</section>
          {customerAccount && <section id="my-bookings" className="booking-section customer-bookings-section"><div className="section-heading"><span className="eyebrow">{t("BOOKING HISTORY")}</span><h2>{t("My bookings")}</h2><p>{t("Review unpaid bookings, cancel them, or hide your saved booking history from this device.")}</p></div><CustomerBookingsPanel refreshVersion={customerBookingsVersion} signedIn onError={setError} onMessage={setMessage} /></section>}
          <footer id="admin-login" className="public-footer">
            <div className="footer-brand"><Brand /><span>{t("Professional field management for every match.")}</span></div>
            <section className="footer-contact" aria-label={t("Contact and social media")}>
              <h2>{t("Contact and social media")}</h2>
              <div className="footer-contact-links">
                <a href="https://www.facebook.com/share/1CZngPua16/" target="_blank" rel="noopener noreferrer">Facebook page <span>↗</span></a>
                <a href="https://www.tiktok.com/@allbuykh?_r=1&_t=ZS-9AtsaDsV5wV" target="_blank" rel="noopener noreferrer">TikTok <span>@allbuykh ↗</span></a>
                <a href="https://t.me/Oukdomm7" target="_blank" rel="noopener noreferrer">Telegram <span>@Oukdomm7 ↗</span></a>
                <a href="https://t.me/sao_makara168" target="_blank" rel="noopener noreferrer">Telegram <span>@sao_makara168 ↗</span></a>
                <a href="tel:+85516212268">+855 16 212 268</a>
                <a href="tel:+855966853140">+855 966 853 140</a>
                <a href="https://maps.app.goo.gl/QAcpMkJxFvjUdEer6" target="_blank" rel="noopener noreferrer">{t("Open location in Google Maps")} <span>↗</span></a>
              </div>
              <div className="footer-telegram">
                <a href="https://i.postimg.cc/9FDRN0pq/nobackground-tg-m.jpg" target="_blank" rel="noopener noreferrer">
                  <img src="https://i.postimg.cc/9FDRN0pq/nobackground-tg-m.jpg" alt={t("Telegram contact QR code 1")} loading="lazy" />
                </a>
                <a href="https://i.postimg.cc/28gbpYcs/nobackgound-tg-o.jpg" target="_blank" rel="noopener noreferrer">
                  <img src="https://i.postimg.cc/28gbpYcs/nobackgound-tg-o.jpg" alt={t("Telegram contact QR code 2")} loading="lazy" />
                </a>
                <span>{t("Telegram QR codes — scan to connect")}</span>
              </div>
            </section>
            <LoginForm onSubmit={login} />
            <small>© {new Date().getFullYear()} SUNNY SPORT CLUB · {t("Football field management")}</small>
          </footer>
        </div>
      )}
    </main>
  );
}

function Overview({ bookings, today, todayCount, revenue, pending, settings, onViewBookings }: {
  bookings: Booking[]; today: string; todayCount: number; revenue: number; pending: number; settings: AdminSettings | null; onViewBookings: () => void;
}) {
  const { language, t } = useLanguage();
  const [period, setPeriod] = useState("week");
  const [report, setReport] = useState<{ bookingCount: number; revenueCents: number } | null>(null);
  useEffect(() => {
    api<{ bookingCount: number; revenueCents: number }>(`/api/reports?period=${period}`)
      .then(setReport)
      .catch((cause: Error) => console.error("Revenue report could not be loaded:", cause));
  }, [period]);
  const recent = bookings.slice(0, 5);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return { key, label: date.toLocaleDateString(language === "km" ? "km-KH" : "en", { weekday: "short", timeZone: "Asia/Phnom_Penh" }), total: bookings.filter((booking) => booking.date === key && booking.paymentStatus === "PAID").reduce((sum, booking) => sum + booking.amountPaidCents, 0) };
  });
  const max = Math.max(...days.map((day) => day.total), 1);
  return <div className="stack">
    <div className="welcome-line"><div><h2>{t("Good day, admin")} <span>✦</span></h2><p>{t("Here's what's happening at your fields today.")}</p></div><span className="date-chip">◷ &nbsp;{formatDate(today, language)}</span></div>
    <div className="stat-grid">
      <StatCard label="Today's bookings" value={String(todayCount).padStart(2, "0")} icon="▦" tone="green" detail="Active reservations" />
      <StatCard label="Total bookings" value={String(bookings.length).padStart(2, "0")} icon="▤" tone="blue" detail="All time" />
      <StatCard label="Paid revenue" value={money(revenue)} icon="$" tone="amber" detail="Verified payments" />
      <StatCard label="Pending payments" value={String(pending).padStart(2, "0")} icon="◷" tone="rose" detail="Needs your review" />
    </div>
    <div className="overview-grid">
      <section className="panel revenue-panel"><div className="panel-heading"><div><span className="eyebrow">{t("REVENUE REPORT")}</span><h3>{t("Revenue overview")}</h3></div><select className="filter-select report-select" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="day">{t("Today")}</option><option value="week">{t("Last 7 days")}</option><option value="month">{t("This month")}</option></select></div><div className="report-summary"><strong>{report ? money(report.revenueCents) : money(revenue)}</strong><span>{report?.bookingCount ?? bookings.length} {t("bookings in selected period")}</span></div><div className="chart"><div className="chart-y"><span>$300</span><span>$200</span><span>$100</span><span>$0</span></div><div className="bars">{days.map((day) => <div className="bar-col" key={day.key}><span className="bar-value">{day.total ? money(day.total) : ""}</span><div className="bar-track"><i style={{ height: `${Math.max(3, day.total / max * 100)}%` }} /></div><small>{day.label}</small></div>)}</div></div></section>
      <section className="panel status-panel"><div className="panel-heading"><div><span className="eyebrow">{t("AT A GLANCE")}</span><h3>{t("Booking status")}</h3></div><span className="round-icon">◉</span></div><div className="status-summary"><div className="donut"><div><b>{bookings.length}</b><small>{t("bookings")}</small></div></div><div className="legend"><p><i className="dot dot-green" />{t("Confirmed")} <b>{bookings.filter((item) => item.status === "CONFIRMED").length}</b></p><p><i className="dot dot-yellow" />{t("Awaiting payment")} <b>{pending}</b></p><p><i className="dot dot-gray" />{t("Cancelled")} <b>{bookings.filter((item) => item.status === "CANCELLED").length}</b></p></div></div><div className="status-hint">{t("Payment status is only confirmed after an administrator verifies KHQR receipt.")}</div></section>
    </div>
    <section className="panel recent-panel"><div className="panel-heading"><div><span className="eyebrow">{t("THE LATEST")}</span><h3>{t("Recent bookings")}</h3></div><button className="link-button" onClick={onViewBookings}>{t("View all bookings")} <span>→</span></button></div><BookingTable bookings={recent} compact /></section>
    <div className="integration-row"><div><span className={`integration-dot ${settings?.telegramConfigured ? "active" : ""}`} /><b>Telegram</b><small>{settings?.telegramConfigured ? t("Connected") : t("Not configured")}</small></div><div><span className={`integration-dot ${settings?.khqrConfigured ? "active" : ""}`} /><b>{t("KHQR")}</b><small>{settings?.khqrConfigured ? t("Merchant QR configured") : t("Add merchant QR")}</small></div><div className="integration-mode"><b>{t("Manual payment mode")}</b><small>{t("Payments require administrator verification")}</small></div></div>
  </div>;
}

function StatCard({ label, value, icon, tone, detail }: { label: string; value: string; icon: string; tone: string; detail: string }) {
  const { t } = useLanguage();
  return <div className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{t(label)}</span><strong>{value}</strong><small>{t(detail)}</small></div>;
}

function BookingsPanel({ bookings, fields, openingHours, usdToKhrRate, creating, onCreatingChange, total, page, search, filter, onSearch, onFilter, onPage, onReview, onUpdate, onDelete, onCreated, onError }: {
  bookings: Booking[]; fields: Field[]; openingHours: string; usdToKhrRate: number; creating: boolean; onCreatingChange: (open: boolean) => void; total: number; page: number; search: string; filter: string;
  onSearch: (value: string) => void; onFilter: (value: string) => void; onPage: (value: number) => void;
  onReview: (booking: Booking, action: "verify" | "fail" | "refund") => void; onUpdate: (booking: Booking, action: "cancel" | "reschedule") => void; onDelete: (booking: Booking) => void; onCreated: () => void; onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  return <div className="stack"><div className="page-intro"><div><h2>{t("Bookings management")}</h2><p>{t("Search, review, and update field reservations.")}</p></div><button className="primary-button small" onClick={() => onCreatingChange(true)}>＋ {t("New booking")}</button></div>
    {creating && <div className="modal-backdrop"><section className="panel new-booking-modal"><div className="panel-heading"><div><span className="eyebrow">{t("ADMIN RESERVATION")}</span><h3>{t("Create a booking")}</h3></div><button className="icon-button" onClick={() => onCreatingChange(false)}>×</button></div><BookingForm fields={fields} openingHours={openingHours} usdToKhrRate={usdToKhrRate} trackForCustomer={false} onComplete={() => { onCreatingChange(false); onCreated(); }} onError={onError} /></section></div>}
    <section className="panel table-panel"><div className="table-toolbar"><label className="search-box"><span>⌕</span><input placeholder={t("Search name, phone, field or reference")} value={search} onChange={(event) => onSearch(event.target.value)} /></label><select className="filter-select" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="ALL">{t("All statuses")}</option><option value="ACTIVE">{t("Active bookings")}</option><option value="PENDING">{t("Payment pending")}</option><option value="PAID">{t("Paid")}</option><option value="FAILED">{t("Failed")}</option><option value="CANCELLED">{t("Cancelled")}</option></select></div>
      <BookingTable bookings={bookings} actions onReview={onReview} onUpdate={onUpdate} onDelete={onDelete} />
      <div className="pagination"><span>{t("Showing")} {total ? page * 8 + 1 : 0}–{Math.min((page + 1) * 8, total)} {t("of")} {total}</span><div><button disabled={page === 0} onClick={() => onPage(page - 1)}>←</button><span>{page + 1}</span><button disabled={(page + 1) * 8 >= total} onClick={() => onPage(page + 1)}>→</button></div></div>
    </section></div>;
}

function BookingTable({ bookings, compact = false, actions = false, onReview, onUpdate, onDelete }: {
  bookings: Booking[]; compact?: boolean; actions?: boolean; onReview?: (booking: Booking, action: "verify" | "fail" | "refund") => void; onUpdate?: (booking: Booking, action: "cancel" | "reschedule") => void; onDelete?: (booking: Booking) => void;
}) {
  const { language, t } = useLanguage();
  return <div className="table-wrap"><table><thead><tr><th>{t("BOOKING")}</th><th>{t("CUSTOMER")}</th><th>{t("FIELD & TIME")}</th><th>{t("DATE")}</th><th>{t("AMOUNT")}</th><th>{t("PAYMENT")}</th>{actions && <th>{t("ACTIONS")}</th>}</tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><td><b className="reference">#{booking.reference}</b><small className="cell-sub">{t(booking.status)}</small></td><td><b>{booking.customerName}</b><small className="cell-sub">{booking.phone}</small></td><td><b>{t(booking.field.name)}</b><small className="cell-sub">{formatTime(booking.startTime, language)}–{formatTime(booking.endTime, language)} · {booking.duration}{t("hour")}</small></td><td>{formatDate(booking.date, language)}</td><td><b>{money(booking.totalCents)}</b><small className="cell-sub">{t(booking.bookingFeeCents < 0 ? "Booking discount" : booking.bookingFeeCents > 0 ? "Legacy booking fee" : "No booking fee")}: {booking.bookingFeeCents < 0 ? "-" : ""}{money(Math.abs(booking.bookingFeeCents))}</small><small className="cell-sub">{t(booking.paymentStatus === "PAID" ? "Amount received" : "Amount due")}: {money(booking.paymentStatus === "PAID" ? booking.amountPaidCents : calculateBookingAmountDueCents(booking.totalCents, booking.bookingFeeCents))}</small></td><td><StatusPill value={booking.paymentStatus} /></td>{actions && <td><div className="action-cell">{booking.paymentStatus === "PENDING" && <><button className="action-confirm" title={t("Verify payment and confirm booking")} onClick={() => onReview?.(booking, "verify")}>{t("Verify")}</button><button className="icon-button" title={t("Mark payment failed")} onClick={() => onReview?.(booking, "fail")}>×</button></>}{booking.paymentStatus === "PAID" && <button className="action-refund" title={t("Record a refund already processed")} onClick={() => onReview?.(booking, "refund")}>{t("Refund")}</button>}{onUpdate && booking.status !== "CANCELLED" && <><button className="icon-button" title={t("Reschedule")} onClick={() => onUpdate(booking, "reschedule")}>↗</button><button className="icon-button" title={t("Cancel booking")} onClick={() => onUpdate(booking, "cancel")}>−</button></>}{onDelete && <button className="action-delete" title={t("Permanently delete booking history")} aria-label={`${t("Permanently delete booking history")} #${booking.reference}`} onClick={() => onDelete(booking)}>{t("Delete")}</button>}</div></td>}</tr>)}</tbody></table>{bookings.length === 0 && <div className="empty-state"><span>▤</span><b>{t("No bookings found")}</b><small>{t("New customer reservations will show here.")}</small></div>}</div>;
}

function CustomerAuthPanel({ onAuthenticated, onError }: {
  onAuthenticated: (customer: CustomerAccount) => void; onError: (message: string) => void;
}) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "verify" | "reset" | "success">("login");
  const [identifier, setIdentifier] = useState("");
  const [channel, setChannel] = useState<"email" | "phone">("email");
  const [resetToken, setResetToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeError, setNoticeError] = useState(false);

  function returnToLogin() {
    setMode("login");
    setIdentifier("");
    setResetToken("");
    setNotice("");
    setNoticeError(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setNotice("");
    setNoticeError(false);
    try {
      if (mode === "login") {
        const result = await api<{ customer: CustomerAccount }>("/api/customer/login", {
          method: "POST",
          body: JSON.stringify({ identifier: form.get("identifier"), password: form.get("password") }),
        });
        onAuthenticated(result.customer);
      } else if (mode === "register") {
        const result = await api<{ customer: CustomerAccount }>("/api/customer/register", {
          method: "POST",
          body: JSON.stringify({ name: form.get("name"), identifier: form.get("identifier"), password: form.get("password") }),
        });
        onAuthenticated(result.customer);
      } else if (mode === "forgot") {
        const identifier = String(form.get("identifier") ?? "").trim();
        const result = await api<{ message: string }>("/api/customer/forgot-password", {
          method: "POST",
          body: JSON.stringify({ identifier, channel }),
        });
        setIdentifier(identifier);
        setMode("verify");
        setNotice(t(result.message));
      } else if (mode === "verify") {
        const result = await api<{ resetToken: string }>("/api/customer/verify-reset-code", {
          method: "POST",
          body: JSON.stringify({ identifier, channel, code: form.get("code") }),
        });
        setResetToken(result.resetToken);
        setMode("reset");
        setNotice("");
      } else {
        await api("/api/customer/reset-password", {
          method: "POST",
          body: JSON.stringify({
            resetToken,
            password: form.get("password"),
            confirmPassword: form.get("confirmPassword"),
          }),
        });
        setResetToken("");
        setMode("success");
        setNotice(t("Your password has been changed. Sign in with your new password."));
      }
    } catch (cause) {
      const message = t((cause as Error).message);
      if (mode === "login" || mode === "register") onError(message);
      else {
        setNotice(message);
        setNoticeError(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "login" ? "Customer sign in"
    : mode === "register" ? "Create a customer account"
      : mode === "forgot" ? "Forgot password"
        : mode === "verify" ? "Verify recovery code"
          : mode === "reset" ? "Choose a new password"
            : mode === "success" ? "Password changed"
              : "Reset password";

  return <section className="panel customer-auth-panel">
    <div className="panel-heading"><div><span className="eyebrow">{t("CUSTOMER ACCOUNT")}</span><h3>{t(heading)}</h3></div><span className="round-icon">♙</span></div>
    <p className="customer-history-note">{t("Sign in or create an account to make and manage bookings.")}</p>
    {mode === "success" ? <div className="customer-auth-form">
      <p className="customer-auth-notice" role="status">{notice}</p>
      <button type="button" className="primary-button" onClick={returnToLogin}>{t("Return to sign in")}</button>
    </div> : <form className="customer-auth-form" onSubmit={submit}>
      {mode === "login" && <>
        <label>{t("Email or phone")}<input name="identifier" required autoComplete="username" /></label>
        <label>{t("Password")}<input name="password" type="password" required autoComplete="current-password" /></label>
      </>}
      {mode === "register" && <>
        <label>{t("Full name")}<input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        <label>{t("Email or phone")}<input name="identifier" type="text" required maxLength={254} autoComplete="username" /></label>
        <label>{t("Password")}<input name="password" type="password" required minLength={8} maxLength={16} autoComplete="new-password" /><small style={{ color: "#687a6d", fontSize: "11px", fontWeight: 400, lineHeight: 1.6 }}>លេខកូដសម្ងាត់ត្រូវមានពី 8 ដល់ 16 តួអក្សរ។ អ្នកអាចប្រើលេខកូដតាមដែលអ្នកចង់បាន។</small></label>
      </>}
      {mode === "forgot" && <>
        <label>{t(channel === "email" ? "Account email" : "Account phone number")}
          <input name="identifier" type={channel === "email" ? "email" : "tel"} required autoComplete={channel === "email" ? "email" : "tel"} defaultValue={identifier} />
        </label>
        <fieldset className="recovery-method-options">
          <legend>{t("Choose recovery method")}</legend>
          <label><input type="radio" name="recoveryMethod" checked={channel === "email"} onChange={() => setChannel("email")} />{t("Email OTP")}</label>
          <label><input type="radio" name="recoveryMethod" checked={channel === "phone"} onChange={() => setChannel("phone")} />{t("SMS OTP")}</label>
        </fieldset>
      </>}
      {mode === "verify" && <>
        <p>{t("Enter the six-digit code sent to your selected recovery method.")}</p>
        <label>{t("Six-digit recovery code")}<input name="code" type="text" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" /></label>
      </>}
      {mode === "reset" && <>
        <label>{t("New password")}<input name="password" type="password" required minLength={8} maxLength={16} autoComplete="new-password" /></label>
        <label>{t("Confirm new password")}<input name="confirmPassword" type="password" required minLength={8} maxLength={16} autoComplete="new-password" /></label>
      </>}
      {notice && <p className={`customer-auth-notice ${noticeError ? "error" : ""}`} role={noticeError ? "alert" : "status"}>{notice}</p>}
      <button type="submit" className="primary-button" disabled={busy}>{busy ? t("Please wait...") : t(mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send recovery code" : mode === "verify" ? "Verify code" : "Save new password")}</button>
    </form>}
    <div className="customer-auth-links">
      {mode === "login" && <><button className="text-button" onClick={() => { setNotice(""); setMode("register"); }}>{t("Create account")}</button><button className="text-button" onClick={() => { setNotice(""); setMode("forgot"); }}>{t("Forgot password?")}</button></>}
      {mode === "verify" && <button className="text-button" onClick={() => { setNotice(""); setNoticeError(false); setMode("forgot"); }}>{t("Request another recovery code")}</button>}
      {mode !== "login" && mode !== "success" && <button className="text-button" onClick={returnToLogin}>{t("Back to sign in")}</button>}
    </div>
  </section>;
}

function CustomerBookingsPanel({ refreshVersion, signedIn, onError, onMessage }: {
  refreshVersion: number; signedIn: boolean; onError: (message: string) => void; onMessage: (message: string) => void;
}) {
  const { language, t } = useLanguage();
  const [accesses, setAccesses] = useState<CustomerBookingAccess[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [hiddenBefore, setHiddenBefore] = useState(0);

  useEffect(() => {
    try {
      const hiddenTimestamp = Number(window.localStorage.getItem(CUSTOMER_BOOKING_HISTORY_HIDDEN_BEFORE_KEY) ?? 0);
      setHiddenBefore(Number.isFinite(hiddenTimestamp) ? hiddenTimestamp : 0);
      const saved: unknown = JSON.parse(window.localStorage.getItem(CUSTOMER_BOOKING_STORAGE_KEY) ?? "[]");
      const valid = Array.isArray(saved)
        ? saved.filter((item): item is CustomerBookingAccess => Boolean(item && typeof item === "object" && "bookingId" in item && typeof item.bookingId === "string" && "token" in item && typeof item.token === "string" && /^[a-f0-9]{64}$/i.test(item.token))).slice(-50)
        : [];
      setAccesses(valid);
      window.localStorage.setItem(CUSTOMER_BOOKING_STORAGE_KEY, JSON.stringify(valid));
    } catch (cause) {
      console.error("Customer booking history could not be read from this device:", cause);
      onError(t("Booking history could not be read from this device."));
      setAccesses([]);
    }
  }, [refreshVersion, onError, t]);

  useEffect(() => {
    let active = true;
    if (!accesses.length && !signedIn) {
      setBookings([]);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    api<{ bookings: Booking[] }>("/api/customer/bookings", {
      method: "POST",
      body: JSON.stringify({ action: "list", tokens: accesses.map((item) => item.token) }),
    }).then((value) => {
      if (active) setBookings(value.bookings.filter((booking) => new Date(booking.createdAt).getTime() > hiddenBefore));
    }).catch((cause: Error) => {
      if (active) onError(t(cause.message));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [accesses, hiddenBefore, signedIn, onError, t]);

  async function cancelBooking(booking: Booking) {
    const access = accesses.find((item) => item.bookingId === booking.id);
    if ((!access?.token && !signedIn) || !window.confirm(`${t("Cancel this unpaid booking?")} #${booking.reference}`)) return;
    setBusy(booking.id);
    try {
      await api("/api/customer/bookings", {
        method: "POST",
        body: JSON.stringify(signedIn ? { action: "cancel", bookingId: booking.id } : { action: "cancel", token: access?.token }),
      });
      const refreshed = await api<{ bookings: Booking[] }>("/api/customer/bookings", {
        method: "POST",
        body: JSON.stringify({ action: "list", tokens: accesses.map((item) => item.token) }),
      });
      setBookings(refreshed.bookings);
      onMessage(t("Booking cancelled."));
    } catch (cause) {
      onError(t((cause as Error).message));
    } finally {
      setBusy(null);
    }
  }

  function clearHistory() {
    if ((!accesses.length && !bookings.length) || !window.confirm(t("Hide booking history from this device? This will not delete records or cancel bookings."))) return;
    try {
      const hiddenAt = Date.now();
      window.localStorage.setItem(CUSTOMER_BOOKING_HISTORY_HIDDEN_BEFORE_KEY, String(hiddenAt));
      window.localStorage.removeItem(CUSTOMER_BOOKING_STORAGE_KEY);
      setHiddenBefore(hiddenAt);
      setAccesses([]);
      setBookings([]);
      onMessage(t("Booking history hidden from this device."));
    } catch (cause) {
      console.error("Customer booking history could not be cleared from this device:", cause);
      onError(t("Booking history could not be cleared from this device."));
    }
  }

  return <section className="panel customer-history-panel">
    <div className="panel-heading"><div><span className="eyebrow">{t("BOOKING HISTORY")}</span><h3>{t("Saved bookings")}</h3></div><button className="outline-button compact" disabled={(!accesses.length && !bookings.length) || loading} onClick={clearHistory}>{t("Clear history")}</button></div>
    <p className="customer-history-note">{t("Only payment-verified bookings appear in the field schedule. Unpaid bookings are pending and can be cancelled here; clearing history hides it on this device only.")}</p>
    {loading ? <div className="empty-state">{t("Loading bookings...")}</div> : bookings.length ? <div className="customer-booking-list">{bookings.map((booking) => {
      const token = accesses.find((item) => item.bookingId === booking.id)?.token;
      return <article className="customer-booking-card" key={booking.id}>
        <div className="customer-booking-heading"><div><b>#{booking.reference}</b><small>{t(booking.field.name)} · {formatDate(booking.date, language)} · {formatTime(booking.startTime, language)}–{formatTime(booking.endTime, language)}</small></div><StatusPill value={booking.paymentStatus} /></div>
        <div className="customer-booking-details"><span>{t("TOTAL PRICE")} <b>{money(booking.totalCents)}</b></span><span>{t(booking.paymentStatus === "PAID" ? "Amount received" : "Amount due")} <b>{money(booking.paymentStatus === "PAID" ? booking.amountPaidCents : calculateBookingAmountDueCents(booking.totalCents, booking.bookingFeeCents))}</b></span></div>
        {booking.status === "PENDING" && booking.paymentStatus === "PENDING" && <button className="outline-button compact customer-cancel-button" disabled={busy === booking.id} onClick={() => cancelBooking(booking)}>{busy === booking.id ? t("Cancelling...") : t("Cancel unpaid booking")}</button>}
        {!token && <small>{t("Booking access is unavailable on this device.")}</small>}
      </article>;
    })}</div> : <div className="empty-state"><span>▤</span><b>{t("No saved bookings on this device")}</b><small>{t("Bookings created in this browser will appear here. Clearing history does not delete business records.")}</small></div>}
  </section>;
}

function CalendarPanel({ bookings, fields, openingHours, date, onDate }: { bookings: Booking[]; fields: Field[]; openingHours: string; date: string; onDate: (date: string) => void }) {
  const { language, t } = useLanguage();
  const [opening, closing] = openingHours.split("-");
  const openingMinute = Number(opening.slice(0, 2)) * 60;
  const closingMinute = Number(closing.slice(0, 2)) * 60;
  const slots = Array.from({ length: Math.max(0, (closingMinute - openingMinute) / 30) }, (_, index) => {
    const minutes = openingMinute + index * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${minutes % 60 === 0 ? "00" : "30"}`;
  });
  return <div className="stack"><div className="page-intro"><div><h2>{t("Field schedule")}</h2><p>{t("Availability across all pitches in 30-minute increments.")}</p></div><input type="date" className="date-input" min={localToday()} value={date} onChange={(event) => onDate(event.target.value)} /></div>
    <section className="panel calendar-panel"><div className="calendar-legend"><span><i className="legend-available" />{t("Available")}</span><span><i className="legend-booked" />{t("Booked")}</span></div><p className="customer-history-note">{t("Only paid, confirmed bookings appear in this schedule. Pending unpaid reservations are reviewed in Payments and remain unavailable until reviewed to prevent duplicate bookings.")}</p><div className="schedule-scroll"><div className="schedule-grid" style={{ gridTemplateColumns: `100px repeat(${fields.length}, minmax(150px, 1fr))` }}><div className="schedule-header time-header">{t("TIME")}</div>{fields.map((field) => <div className="schedule-header" key={field.id}><b>{t(field.name)}</b><small>{money(field.hourlyRateCents)}/{t("hour")}</small></div>)}{slots.map((time) => <div className="schedule-row" key={time}><div className="time-cell">{formatTime(time, language)}</div>{fields.map((field) => {
      const booking = bookings.find((item) => item.field.id === field.id && item.date === date && item.status === "CONFIRMED" && item.paymentStatus === "PAID" && time >= item.startTime && time < item.endTime);
      return <div key={`${field.id}-${time}`} className={`schedule-cell ${booking ? booking.paymentStatus === "PENDING" ? "pending-slot" : "booked-slot" : ""}`}>{booking && time === booking.startTime ? <span title={`${booking.customerName} · ${formatTime(booking.startTime, language)}-${formatTime(booking.endTime, language)}`}>{booking.customerName}<small>#{booking.reference}</small></span> : null}</div>;
    })}</div>)}</div></div></section></div>;
}

function BookingForm({ fields, openingHours, usdToKhrRate, customer, trackForCustomer = true, onComplete, onError }: {
  fields: Field[]; openingHours: string; usdToKhrRate: number; customer?: CustomerAccount; trackForCustomer?: boolean; onComplete: (booking: Booking) => void; onError: (message: string) => void;
}) {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState(localToday());
  const [startTime, setStartTime] = useState("18:00");
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ booking: Booking; customerAccessToken: string; payment: { qrImageUrl: string | null; paymentUrl: string | null; paymentQrDataUrl: string | null; amountCents: number; bookingDiscountCents: number; amountPrefilled: boolean; khqrCurrency: "USD" | "KHR" | null; khqrAmount: number | null; qrExpiresAt: string | null; instructions: string } } | null>(null);
  const field = fields.find((item) => item.id === selected) ?? fields[0];
  const [openValue, closeValue] = openingHours.split("-");
  const openingMinute = Number(openValue?.slice(0, 2)) * 60;
  const closingMinute = Number(closeValue?.slice(0, 2)) * 60;
  const startOptions = Array.from({ length: Math.max(0, (closingMinute - openingMinute - BOOKING_DURATION_HOURS * 60) / 30 + 1) }, (_, index) => {
    const minute = openingMinute + index * 30;
    return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${minute % 60 === 0 ? "00" : "30"}`;
  });
  useEffect(() => {
    if (!startOptions.includes(startTime)) setStartTime(startOptions[0] ?? "");
  }, [openingHours, startOptions, startTime]);
  const duration = BOOKING_DURATION_HOURS;
  const startMinute = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3));
  useEffect(() => { if (field && !selected) setSelected(field.id); }, [field, selected]);
  useEffect(() => {
    if (!field || !date) return;
    api<{ unavailable: string[] }>(`/api/availability?fieldId=${encodeURIComponent(field.id)}&date=${date}`)
      .then((value) => setUnavailable(value.unavailable))
      .catch((cause: Error) => onError(t(cause.message)));
  }, [field, date, onError, t]);
  useEffect(() => {
    if (!result || !trackForCustomer || result.booking.paymentStatus !== "PENDING") return;
    let active = true;
    const checkStatus = async () => {
      try {
        const value = await api<{ bookings: Booking[] }>("/api/customer/bookings", {
          method: "POST",
          body: JSON.stringify({ action: "list", tokens: [result.customerAccessToken] }),
        });
        if (!active) return;
        const current = value.bookings.find((booking) => booking.id === result.booking.id);
        if (current) setResult((previous) => previous ? { ...previous, booking: current } : previous);
      } catch {
        // Keep the booking pending in the UI when a status check is temporarily unavailable.
      }
    };
    const interval = window.setInterval(checkStatus, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [result?.booking.id, result?.booking.paymentStatus, result?.customerAccessToken, trackForCustomer]);
  const endMinutes = startMinute + BOOKING_DURATION_HOURS * 60;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  const slotsBlocked = Array.from({ length: BOOKING_DURATION_HOURS * 2 }, (_, index) => {
    const minutes = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3)) + index * 30;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }).some((slot) => unavailable.includes(slot));
  const rentalTotalCents = calculateTotalCents(field?.hourlyRateCents ?? 0, BOOKING_DURATION_HOURS);
  const finalTotalCents = Math.max(0, rentalTotalCents - BOOKING_DISCOUNT_CENTS);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!field) return onError(t("No active football fields are available right now."));
    if (slotsBlocked) return onError(t("That time is unavailable. Choose another slot."));
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const value = await api<{ booking: Booking; customerAccessToken: string; payment: { qrImageUrl: string | null; paymentUrl: string | null; paymentQrDataUrl: string | null; amountCents: number; bookingDiscountCents: number; amountPrefilled: boolean; khqrCurrency: "USD" | "KHR" | null; khqrAmount: number | null; qrExpiresAt: string | null; instructions: string } }>("/api/bookings", {
        method: "POST",
        body: JSON.stringify({ fieldId: field.id, customerName: form.get("customerName"), phone: form.get("phone"), notes: form.get("notes"), date, startTime, duration }),
      });
      if (trackForCustomer) {
        try {
          const saved = JSON.parse(window.localStorage.getItem(CUSTOMER_BOOKING_STORAGE_KEY) ?? "[]") as CustomerBookingAccess[];
          const accesses = saved.filter((item) => /^[a-f0-9]{64}$/i.test(item.token));
          accesses.push({ bookingId: value.booking.id, token: value.customerAccessToken });
          window.localStorage.setItem(CUSTOMER_BOOKING_STORAGE_KEY, JSON.stringify(accesses.slice(-50)));
        } catch (cause) {
          console.error("Customer booking access could not be saved on this device:", cause);
          onError(t("Save this booking reference; booking history storage is unavailable in this browser."));
        }
      }
      setResult(value);
      onComplete(value.booking);
    } catch (cause) {
      onError(t((cause as Error).message));
    } finally { setBusy(false); }
  }
  if (result) return (
    <div className="booking-result">
      <div className="result-top"><span className="result-check">{result.booking.paymentStatus === "PAID" ? "✓" : "…"}</span><div><span className="eyebrow">{t("BOOKING RECEIVED")}</span><h3>{t(result.booking.paymentStatus === "PAID" ? "Payment verified" : result.booking.status === "CANCELLED" ? "Booking cancelled" : "Payment pending")}</h3><p>{t(result.booking.paymentStatus === "PAID" ? "Payment verified and booking confirmed." : result.booking.status === "CANCELLED" ? "This booking is not confirmed. Contact the club if you already paid." : "Your booking is not confirmed yet. It will be confirmed only after the club verifies your payment.")}</p></div></div>
      <div className="result-details"><span>{t("REFERENCE")}<strong>#{result.booking.reference}</strong></span><span>{t("COURT RENTAL")}<strong>{money(result.booking.totalCents - result.booking.bookingFeeCents)}</strong></span><span>{t("BOOKING DISCOUNT")}<strong>-{money(Math.abs(result.booking.bookingFeeCents))}<small>-{moneyRiel(Math.abs(result.booking.bookingFeeCents), usdToKhrRate, language)}</small></strong></span><span>{t("TOTAL PRICE")}<strong>{money(result.booking.totalCents)}<small>{moneyRiel(result.booking.totalCents, usdToKhrRate, language)}</small></strong></span><span>{t("AMOUNT DUE")}<strong>{money(result.payment.amountCents)}<small>{moneyRiel(result.payment.amountCents, usdToKhrRate, language)}</small></strong></span><span>{t("TIME")}<strong>{formatDate(result.booking.date, language)} · {formatTime(result.booking.startTime, language)}–{formatTime(result.booking.endTime, language)}</strong></span></div>
      {result.booking.paymentStatus === "PENDING" && <div className="manual-payment"><div>{result.payment.paymentQrDataUrl ? <img src={result.payment.paymentQrDataUrl} alt={t(result.payment.amountPrefilled ? "KHQR with the full amount due encoded" : "Scan to open KHQR payment link")} /> : result.payment.qrImageUrl ? <img src={result.payment.qrImageUrl} alt={t("Configured merchant KHQR payment code")} /> : <div className="qr-placeholder"><span>▦</span><small>{t("KHQR PAYMENT")}<br />{result.payment.paymentUrl ? t("OPEN PAYMENT LINK BELOW") : t("NOT CONFIGURED")}</small></div>}</div><div><span className="eyebrow">{t("FULL PAYMENT VIA KHQR")}</span><p>{t(result.payment.instructions)}</p><b>{t("Amount due")}: {money(result.payment.amountCents)} · {t("Use reference")} #{result.booking.reference}</b>{result.payment.amountPrefilled && result.payment.khqrCurrency && result.payment.khqrAmount !== null && <small>{t("Amount encoded in QR")}: {formatKhqrAmount(result.payment.khqrCurrency, result.payment.khqrAmount, language)}{result.payment.qrExpiresAt ? ` · ${t("QR expires")} ${new Date(result.payment.qrExpiresAt).toLocaleTimeString(language === "km" ? "km-KH" : "en", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Phnom_Penh" })}` : ""}</small>}<small>{t(result.payment.amountPrefilled ? "The booking stays pending until an administrator verifies payment. A payment screenshot does not confirm payment." : result.payment.paymentUrl ? "Check that the payment page shows the full amount due before paying. The booking stays pending until an administrator verifies payment." : "Pay the full amount shown above using your banking app and include the booking reference. The booking stays pending until an administrator verifies payment.")}</small></div></div>}
      {result.booking.paymentStatus === "PENDING" && result.payment.paymentUrl && <a className="primary-button payment-link-button" href={result.payment.paymentUrl} target="_blank" rel="noopener noreferrer">{t("Pay with KHQR")} <span>↗</span></a>}
      {result.booking.paymentStatus === "PENDING" && <small role="status">{t("Payment status refreshes automatically after the club verifies it.")}</small>}
      <button className="outline-button" onClick={() => setResult(null)}>{t("Book another field")}</button>
    </div>
  );
  return (
    <form className="booking-form" onSubmit={submit}>
      <div className="booking-field-select">{fields.map((item, index) => <button type="button" key={item.id} onClick={() => setSelected(item.id)} className={`field-option ${field?.id === item.id ? "active" : ""}`}><span className="field-option-icon">{index === 0 ? "⚽" : index === 1 ? "◉" : "✦"}</span><span><b>{t(item.name)}</b><small>{t(item.surface)}</small></span><strong>{money(item.hourlyRateCents)}<small>/hr</small><small className="field-price-khr">{moneyRiel(item.hourlyRateCents, usdToKhrRate, language)}</small></strong></button>)}{fields.length === 0 && <div className="empty-state">{t("No fields are available right now.")}</div>}</div>
      <div className="booking-form-grid">
        <label>{t("YOUR NAME")}<input name="customerName" required minLength={2} maxLength={80} placeholder={t("e.g. Dara Sok")} defaultValue={customer?.name} readOnly={Boolean(customer)} /></label>
        <label>{t("PHONE NUMBER")}<input name="phone" required placeholder="+855 12 345 678" defaultValue={customer?.phone ?? ""} readOnly={Boolean(customer?.phone)} /></label>
        <label>{t("BOOKING DATE")}<input type="date" required min={localToday()} value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>{t("START TIME")}<select value={startTime} onChange={(event) => setStartTime(event.target.value)}>{startOptions.map((time) => <option key={time} value={time} disabled={unavailable.includes(time)}>{formatTime(time, language)}{unavailable.includes(time) ? ` · ${t("Unavailable")}` : ""}</option>)}</select></label>
        <label>{t("DURATION")}<input value={`${BOOKING_DURATION_HOURS} ${t("hour")}`} readOnly /></label>
        <label>{t("EXTRA NOTES")} <span className="optional">{t("OPTIONAL")}</span><input name="notes" maxLength={500} placeholder={t("Any details for the field team?")} /></label>
      </div>
      <div className="booking-total"><div><span>{t("ESTIMATED TOTAL")}</span><small>{field ? `${t(field.name)} · ${formatTime(startTime, language)}–${formatTime(endTime, language)}` : t("Select an available pitch")}{slotsBlocked && <b className="availability-warning"> · {t("Time unavailable")}</b>}</small><small>{t("Two-hour rental")} · {t("Booking discount")}: -{money(BOOKING_DISCOUNT_CENTS)}</small></div><strong>{money(finalTotalCents)}<small>{moneyRiel(finalTotalCents, usdToKhrRate, language)}</small></strong></div>
      <button className="primary-button booking-submit" type="submit" disabled={busy || fields.length === 0 || slotsBlocked || !startTime || finalTotalCents <= 0}>{busy ? t("Placing your booking...") : t("Reserve this pitch")} <span>→</span></button>
      <p className="form-footnote">{t("This is a booking request. Your time slot is confirmed only after payment verification.")}</p>
    </form>
  );
}

function FieldsPanel({ fields, usdToKhrRate, onSaved, onError }: { fields: Field[]; usdToKhrRate: number; onSaved: () => void; onError: (message: string) => void }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function setFieldAvailability(field: Field) {
    const active = !field.active;
    if (!window.confirm(t(active ? "Restore this field for customer bookings?" : "Remove this field from customer bookings? Existing booking history will be kept."))) return;
    setBusy(true);
    try {
      await api("/api/fields", { method: "PATCH", body: JSON.stringify({ ...field, active }) });
      onSaved();
    } catch (cause) {
      onError(t((cause as Error).message));
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), surface: form.get("surface"), hourlyRateCents: Math.round(Number(form.get("hourlyRate")) * 100), description: form.get("description"), active: form.get("active") === "on" };
    setBusy(true);
    try {
      if (editing === "new") await api("/api/fields", { method: "POST", body: JSON.stringify(body) });
      else if (editing) await api("/api/fields", { method: "PATCH", body: JSON.stringify({ ...body, id: editing }) });
      setEditing(null);
      onSaved();
    } catch (cause) { onError(t((cause as Error).message)); }
    finally { setBusy(false); }
  }
  const current = fields.find((field) => field.id === editing);
  return <div className="stack"><div className="page-intro"><div><h2>{t("Football fields")}</h2><p>{t("Manage pitch details, availability, and hourly prices.")}</p></div><button className="primary-button small" onClick={() => setEditing("new")}>＋ {t("Add a field")}</button></div>{editing && <section className="panel edit-panel"><div className="panel-heading"><h3>{t(editing === "new" ? "Add a field" : "Edit field")}</h3><button className="icon-button" onClick={() => setEditing(null)}>×</button></div><form className="settings-form" onSubmit={save}><label>{t("FIELD NAME")}<input name="name" required defaultValue={current?.name ?? ""} /></label><label>{t("SURFACE")}<input name="surface" required defaultValue={current?.surface ?? "Artificial turf"} /></label><label>{t("HOURLY RATE (USD)")}<input name="hourlyRate" type="number" min="0" max="100000" step="0.01" required defaultValue={current ? (current.hourlyRateCents / 100).toFixed(2) : "20.00"} /></label><label>{t("DESCRIPTION")}<input name="description" defaultValue={current?.description ?? ""} /></label><label className="checkbox-label"><input type="checkbox" name="active" defaultChecked={current?.active ?? true} /> {t("Available for customer bookings")}</label><button className="primary-button small" disabled={busy}>{busy ? t("Saving...") : t("Save field")}</button></form></section>}<div className="field-cards">{fields.map((field, index) => <article className="field-card panel" key={field.id}><div className={`field-card-art art-${index % 3}`}><span>⚽</span><small>{field.active ? t("AVAILABLE") : t("HIDDEN")}</small></div><div className="field-card-info"><div><h3>{t(field.name)}</h3><span className={`field-state ${field.active ? "is-active" : ""}`}>{t(field.active ? "Active" : "Hidden")}</span></div><p>{t(field.surface)}</p><p>{t(field.description || "No description provided.")}</p><div className="field-card-bottom"><strong>{money(field.hourlyRateCents)}<small>{t("/ hour")} · {moneyRiel(field.hourlyRateCents, usdToKhrRate)}</small></strong><div className="field-actions"><button className="outline-button compact" disabled={busy} onClick={() => setEditing(field.id)}>{t("Edit field")}</button><button className="outline-button compact" disabled={busy} onClick={() => setFieldAvailability(field)}>{t(field.active ? "Remove" : "Restore")}</button></div></div></div></article>)}</div></div>;
}

function PaymentsPanel({ bookings, onReview, onDelete }: { bookings: Booking[]; onReview: (booking: Booking, action: "verify" | "fail" | "refund") => void; onDelete: (booking: Booking) => void }) {
  const { t } = useLanguage();
  const [filter, setFilter] = useState("PENDING");
  const rows = bookings.filter((booking) => filter === "ALL" || booking.paymentStatus === filter);
  const pendingTotal = bookings.filter((booking) => booking.paymentStatus === "PENDING").reduce((sum, booking) => sum + booking.totalCents, 0);
  return <div className="stack"><div className="page-intro"><div><h2>{t("Payments")}</h2><p>{t("Review KHQR payments and record verified outcomes.")}</p></div><div className="payment-summary"><span>{t("PENDING TOTAL")}</span><b>{money(pendingTotal)}</b></div></div><div className="payment-notice"><span>ⓘ</span><div><b>{t("Manual KHQR verification is enabled.")}</b><p>{t("Confirm payment only after checking the transaction in your trusted bank or payment-provider channel. An uploaded screenshot is never accepted as proof.")}</p></div></div><section className="panel table-panel"><div className="table-toolbar"><span className="toolbar-title">{t("Payment activity")}</span><select className="filter-select" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="PENDING">{t("Pending")}</option><option value="PAID">{t("Paid")}</option><option value="FAILED">{t("Failed")}</option><option value="REFUNDED">{t("Refunded")}</option><option value="CANCELLED">{t("Cancelled")}</option><option value="ALL">{t("All payments")}</option></select></div><BookingTable bookings={rows} actions onReview={onReview} onDelete={onDelete} /></section></div>;
}

function CustomersPanel({ bookings }: { bookings: Booking[] }) {
  const { language, t } = useLanguage();
  const customers = new Map<string, { name: string; phone: string; count: number; spent: number; latest: string }>();
  for (const booking of bookings) {
    const key = booking.phone.replace(/\D/g, "");
    const item = customers.get(key) ?? { name: booking.customerName, phone: booking.phone, count: 0, spent: 0, latest: booking.date };
    item.count++;
    if (booking.paymentStatus === "PAID") item.spent += booking.amountPaidCents;
    if (booking.date > item.latest) item.latest = booking.date;
    customers.set(key, item);
  }
  const rows = [...customers.values()].sort((a, b) => b.count - a.count);
  return <div className="stack"><div className="page-intro"><div><h2>{t("Customers")}</h2><p>{t("Customer details are grouped using the provided phone number.")}</p></div><span className="count-chip">{rows.length} {t("customers")}</span></div><section className="panel table-panel"><div className="table-wrap"><table><thead><tr><th>{t("CUSTOMER")}</th><th>{t("PHONE")}</th><th>{t("BOOKINGS")}</th><th>{t("PAID TOTAL")}</th><th>{t("LAST BOOKING")}</th></tr></thead><tbody>{rows.map((customer) => <tr key={customer.phone}><td><b>{customer.name}</b></td><td>{customer.phone}</td><td>{customer.count}</td><td><b>{money(customer.spent)}</b></td><td>{formatDate(customer.latest, language)}</td></tr>)}</tbody></table>{rows.length === 0 && <div className="empty-state">{t("Customer history will appear when bookings are received.")}</div>}</div></section></div>;
}

function SettingsPanel({ settings, onSaved, onError }: { settings: AdminSettings; onSaved: (value: AdminSettings) => void; onError: (message: string) => void }) {
  const { language, t } = useLanguage();
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramTestSent, setTelegramTestSent] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ usdToKhrRate: Number(form.get("usdToKhrRate")) }) });
      onSaved({ ...settings, openingHours: PLAYING_HOURS, usdToKhrRate: Number(form.get("usdToKhrRate")) });
    } catch (cause) { onError(t((cause as Error).message)); }
    finally { setSaving(false); }
  }
  async function sendTelegramTest() {
    setTestingTelegram(true);
    setTelegramTestSent(false);
    try {
      await api("/api/admin/telegram-test", { method: "POST" });
      setTelegramTestSent(true);
    } catch (cause) {
      onError(t((cause as Error).message));
    } finally {
      setTestingTelegram(false);
    }
  }
  return (
    <div className="stack">
      <div className="page-intro">
        <div><h2>{t("Settings")}</h2><p>{t("Configure field operation preferences and integration status.")}</p></div>
      </div>
      <div className="settings-grid">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">{t("OPERATIONS")}</span><h3>{t("Booking preferences")}</h3></div><span className="round-icon">⚙</span></div>
          <form className="settings-form" onSubmit={save}>
            <label>{t("PLAYING HOURS")} <small>{t("Online bookings accepted 24 hours; playing times are fixed to local Cambodia time.")}</small><strong>{formatTimeRange(PLAYING_HOURS, language)}</strong></label>
            <label>{t("USD TO KHR DISPLAY RATE")} <small>{t("Reference rate for customer-facing price display")}</small><input name="usdToKhrRate" type="number" min="1000" max="10000" defaultValue={settings.usdToKhrRate} required /></label>
            <div className="rate-preview">{t("Fixed session length")}: {BOOKING_DURATION_HOURS} {t("hour")}<br />{t("Flat discount per booking")}: -{money(BOOKING_DISCOUNT_CENTS)}<br />$1 = ៛{settings.usdToKhrRate.toLocaleString(language === "km" ? "km-KH" : "en")} <small>{t("KHR display reference only")}</small></div>
            <button className="primary-button small" disabled={saving}>{saving ? t("Saving preferences...") : t("Save preferences")}</button>
          </form>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><span className="eyebrow">{t("CONNECTIONS")}</span><h3>{t("Integrations")}</h3></div><span className="round-icon">◉</span></div>
          <div className="integration-setting"><span className={`integration-dot ${settings.telegramConfigured ? "active" : ""}`} /><div><b>{t("Telegram notifications")}</b><small>{settings.telegramConfigured ? t("Bot token and group chat configured") : t("Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.local")}</small></div><span className="settings-state">{settings.telegramConfigured ? t("READY") : t("SETUP")}</span></div>
          <button type="button" className="outline-button" disabled={!settings.telegramConfigured || testingTelegram} onClick={sendTelegramTest}>{testingTelegram ? t("Sending test message...") : t("Send test message to group")}</button>
          {telegramTestSent && <small role="status">{t("Test message sent to Telegram group.")}</small>}
          <div className="integration-setting"><span className={`integration-dot ${settings.khqrAmountPrefillConfigured ? "active" : ""}`} /><div><b>{t("KHQR payment")}</b><small>{settings.khqrAmountPrefillConfigured ? t("Each booking QR includes the exact full amount due") : settings.khqrDynamicConfigurationStarted ? t("Dynamic KHQR settings are incomplete; check the server .env") : settings.khqrConfigured ? t("Static QR or link configured; its amount is not prefilled") : t("Configure KHQR merchant details in the server .env")}</small></div><span className="settings-state">{settings.khqrAmountPrefillConfigured ? t("READY") : settings.khqrConfigured && !settings.khqrDynamicConfigurationStarted ? t("STATIC") : t("SETUP")}</span></div>
          <div className="integration-setting"><span className={`integration-dot ${settings.emailRecoveryConfigured ? "active" : ""}`} /><div><b>{t("Email password recovery")}</b><small>{settings.emailRecoveryConfigured ? t("SMTP email delivery is configured") : t("Configure SMTP settings in the server .env")}</small></div><span className="settings-state">{settings.emailRecoveryConfigured ? t("READY") : t("SETUP")}</span></div>
          <div className="integration-setting"><span className={`integration-dot ${settings.phoneRecoveryConfigured ? "active" : ""}`} /><div><b>{t("Phone password recovery")}</b><small>{settings.phoneRecoveryConfigured ? t("Twilio SMS delivery is configured") : t("Configure Twilio settings in the server .env")}</small></div><span className="settings-state">{settings.phoneRecoveryConfigured ? t("READY") : t("SETUP")}</span></div>
          <div className="secure-note"><b>{t("Manual mode only")}</b><p>{t("Payment confirmation is performed by an administrator. No bank credentials are stored here and there is no simulated automatic verification.")}</p></div>
          <div className="integration-setting"><span className="integration-dot active" /><div><b>{t("Admin authentication")}</b><small>{t("Environment-based credentials · Secure HTTP-only session cookie")}</small></div><span className="settings-state">{t("ACTIVE")}</span></div>
        </section>
      </div>
    </div>
  );
}

function LoginForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const { t } = useLanguage();
  return <form id="admin-login" className="login-form" onSubmit={onSubmit}><div><span className="eyebrow">{t("ADMIN AREA")}</span><h3>{t("Team sign in")}</h3></div><input name="username" autoComplete="username" placeholder={t("Username")} required /><input name="password" type="password" autoComplete="current-password" placeholder={t("Password")} required /><button type="submit" className="primary-button small">{t("Sign in")} <span>→</span></button></form>;
}

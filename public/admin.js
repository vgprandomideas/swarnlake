const state = {
  config: null,
  dashboard: null,
  registrations: [],
  filters: {
    search: "",
    eventId: "",
    ageCategoryId: "",
    participantType: "",
    flatNumber: ""
  }
};

const elements = {
  loginPanel: document.querySelector("#login-panel"),
  adminShell: document.querySelector("#admin-shell"),
  loginForm: document.querySelector("#login-form"),
  loginStatus: document.querySelector("#login-status"),
  logoutButton: document.querySelector("#logout-button"),
  dashboardGrid: document.querySelector("#dashboard-grid"),
  filterForm: document.querySelector("#filter-form"),
  filterEvent: document.querySelector("#filter-event"),
  filterAge: document.querySelector("#filter-age"),
  filterStatus: document.querySelector("#filter-status"),
  exportCsv: document.querySelector("#export-csv"),
  exportXlsx: document.querySelector("#export-xlsx"),
  registrationTable: document.querySelector("#registration-table"),
  settingsForm: document.querySelector("#settings-form"),
  settingsStatus: document.querySelector("#settings-status"),
  eventAdminGrid: document.querySelector("#event-admin-grid"),
  addEventForm: document.querySelector("#add-event-form"),
  addEventAgeCategories: document.querySelector("#add-event-age-categories"),
  eventStatus: document.querySelector("#event-status"),
  resetFilters: document.querySelector("#reset-filters")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function formatDate(value, options = {}) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...options
  });
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value ?? 0));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(body.error || "Request failed.");
  }

  return body;
}

function toQueryString(filters) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function setLoggedIn(isLoggedIn) {
  elements.loginPanel.classList.toggle("hidden", isLoggedIn);
  elements.adminShell.classList.toggle("hidden", !isLoggedIn);
  elements.logoutButton.classList.toggle("hidden", !isLoggedIn);
}

function renderFilters() {
  elements.filterEvent.innerHTML = [
    '<option value="">All events</option>',
    ...state.config.events.map((event) => `<option value="${event.id}">${escapeHtml(event.name)}</option>`)
  ].join("");

  elements.filterAge.innerHTML = [
    '<option value="">All age categories</option>',
    ...state.config.ageCategories.map(
      (category) => `<option value="${category.id}">${escapeHtml(category.label)}</option>`
    )
  ].join("");

  elements.addEventAgeCategories.innerHTML = state.config.ageCategories
    .map((category) => `<option value="${category.id}">${escapeHtml(category.label)}</option>`)
    .join("");

  elements.filterForm.search.value = state.filters.search;
  elements.filterForm.eventId.value = state.filters.eventId;
  elements.filterForm.ageCategoryId.value = state.filters.ageCategoryId;
  elements.filterForm.participantType.value = state.filters.participantType;
  elements.filterForm.flatNumber.value = state.filters.flatNumber;
}

function renderDashboard() {
  const overview = state.dashboard.overview;
  const upcoming = state.dashboard.nextDeadlines
    .map((event) => `<li>${escapeHtml(event.name)} - closes ${formatDate(event.closeAt)}</li>`)
    .join("");

  elements.dashboardGrid.innerHTML = `
    <div class="metric-card">
      <span>Total registrations</span>
      <strong>${overview.totalRegistrations}</strong>
      <p>All submitted entries across every event.</p>
    </div>
    <div class="metric-card">
      <span>Total revenue</span>
      <strong>${formatMoney(overview.totalRevenue)}</strong>
      <p>Calculated from currently registered entries.</p>
    </div>
    <div class="metric-card">
      <span>Unique flats</span>
      <strong>${overview.uniqueFlats}</strong>
      <p>Households represented so far in the festival.</p>
    </div>
    <div class="metric-card">
      <span>Child participants</span>
      <strong>${overview.childParticipants}</strong>
      <p>Registrations created with participant type child.</p>
    </div>
    <div class="metric-card">
      <span>Adult participants</span>
      <strong>${overview.adultParticipants}</strong>
      <p>Registrations created with participant type adult.</p>
    </div>
    <div class="metric-card">
      <span>Next deadlines</span>
      <strong>${state.dashboard.nextDeadlines.length}</strong>
      <ul>${upcoming || "<li>No upcoming deadlines.</li>"}</ul>
    </div>
  `;
}

function renderTable() {
  elements.registrationTable.innerHTML = state.registrations.length
    ? state.registrations
        .map(
          (registration) => `
            <tr>
              <td>${escapeHtml(registration.registrationCode)}</td>
              <td>
                <strong>${escapeHtml(registration.participantName)}</strong><br />
                <span>${escapeHtml(registration.participantType)}</span><br />
                <span>${escapeHtml(registration.mobileNumber)}</span>
              </td>
              <td>${escapeHtml(registration.flatNumber)}</td>
              <td>${escapeHtml(registration.ageCategoryLabel)} (${registration.age})</td>
              <td>${escapeHtml(registration.eventNames)}</td>
              <td>${formatMoney(registration.totalFee)}</td>
              <td>${escapeHtml(registration.paymentReference)}</td>
              <td><a href="${registration.screenshotUrl}" target="_blank" rel="noreferrer">Open proof</a></td>
              <td>${formatDate(registration.submittedAt)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="9">No registrations match the current filters.</td>
      </tr>
    `;
}

function renderSettingsForm() {
  const settings = state.config.settings;

  elements.settingsForm.registrationStartDate.value = settings.registrationStartDate;
  elements.settingsForm.supportEmail.value = settings.supportEmail;
  elements.settingsForm.supportPhone.value = settings.supportPhone;
  elements.settingsForm.contactName.value = settings.contactName;
  elements.settingsForm.defaultFee.value = settings.defaultFee;
  elements.settingsForm.liveCountEnabled.value = String(settings.liveCountEnabled);
  elements.settingsForm.upiPayeeName.value = settings.payment.upiPayeeName;
  elements.settingsForm.upiId.value = settings.payment.upiId;
  elements.settingsForm.gpayNumber.value = settings.payment.gpayNumber;
  elements.settingsForm.note.value = settings.payment.note;
  elements.settingsForm.gatewayProvider.value = settings.payment.gatewayProvider;
  elements.settingsForm.gatewayEnabled.value = String(settings.payment.gatewayEnabled);
  elements.settingsForm.gatewayLabel.value = settings.payment.gatewayLabel;
}

function renderEventsAdmin() {
  elements.eventAdminGrid.innerHTML = state.config.events
    .map(
      (event) => `
        <article class="event-admin-card">
          <strong>${escapeHtml(event.name)}</strong>
          <p>${escapeHtml(event.category)} • ${escapeHtml(event.weekLabel)}</p>
          <form data-event-id="${event.id}" class="event-edit-form">
            <label>
              <span>Event Date</span>
              <input name="eventDate" type="date" value="${event.eventDate}" required />
            </label>
            <label>
              <span>Closing Time</span>
              <input
                name="closeAt"
                type="datetime-local"
                value="${new Date(event.closeAt).toISOString().slice(0, 16)}"
                required
              />
            </label>
            <label>
              <span>Fee (INR)</span>
              <input name="fee" type="number" min="0" value="${event.fee}" required />
            </label>
            <label>
              <span>Enabled</span>
              <select name="enabled">
                <option value="true" ${event.enabled ? "selected" : ""}>Yes</option>
                <option value="false" ${event.enabled ? "" : "selected"}>No</option>
              </select>
            </label>
            <button class="ghost-button" type="submit">Save Event</button>
          </form>
        </article>
      `
    )
    .join("");

  for (const form of elements.eventAdminGrid.querySelectorAll(".event-edit-form")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const eventId = event.currentTarget.dataset.eventId;

      try {
        await api(`/api/admin/events/${eventId}`, {
          method: "PATCH",
          body: JSON.stringify({
            eventDate: formData.get("eventDate"),
            closeAt: new Date(formData.get("closeAt")).toISOString(),
            fee: Number(formData.get("fee")),
            enabled: formData.get("enabled") === "true"
          })
        });
        elements.eventStatus.textContent = "Event updated.";
        await loadAdminData();
      } catch (error) {
        elements.eventStatus.textContent = error.message;
      }
    });
  }
}

async function loadRegistrations() {
  const result = await api(`/api/admin/registrations${toQueryString(state.filters)}`);
  state.registrations = result.rows;
  renderTable();
  const query = toQueryString(state.filters);
  elements.exportCsv.href = `/api/admin/export.csv${query}`;
  elements.exportXlsx.href = `/api/admin/export.xlsx${query}`;
  elements.filterStatus.textContent = `${result.total} registrations loaded.`;
}

async function loadAdminData() {
  const [config, dashboard] = await Promise.all([api("/api/admin/config"), api("/api/admin/dashboard")]);
  state.config = config;
  state.dashboard = dashboard;
  renderFilters();
  renderDashboard();
  renderSettingsForm();
  renderEventsAdmin();
  await loadRegistrations();
}

async function bootstrapSession() {
  try {
    await api("/api/admin/session");
    setLoggedIn(true);
    await loadAdminData();
  } catch (error) {
    setLoggedIn(false);
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.loginForm);
  elements.loginStatus.textContent = "Signing in...";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    });
    elements.loginStatus.textContent = "";
    setLoggedIn(true);
    await loadAdminData();
  } catch (error) {
    elements.loginStatus.textContent = error.message;
  }
});

elements.logoutButton.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST", headers: {} });
  setLoggedIn(false);
});

elements.filterForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.filterForm);
  state.filters = {
    search: formData.get("search").trim(),
    eventId: formData.get("eventId"),
    ageCategoryId: formData.get("ageCategoryId"),
    participantType: formData.get("participantType"),
    flatNumber: formData.get("flatNumber").trim()
  };

  try {
    await loadRegistrations();
  } catch (error) {
    elements.filterStatus.textContent = error.message;
  }
});

elements.resetFilters.addEventListener("click", async () => {
  elements.filterForm.reset();
  state.filters = {
    search: "",
    eventId: "",
    ageCategoryId: "",
    participantType: "",
    flatNumber: ""
  };
  await loadRegistrations();
});

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.settingsForm);
  elements.settingsStatus.textContent = "Saving settings...";

  try {
    await api("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        registrationStartDate: formData.get("registrationStartDate"),
        supportEmail: formData.get("supportEmail"),
        supportPhone: formData.get("supportPhone"),
        contactName: formData.get("contactName"),
        defaultFee: Number(formData.get("defaultFee")),
        liveCountEnabled: formData.get("liveCountEnabled") === "true",
        payment: {
          upiPayeeName: formData.get("upiPayeeName"),
          upiId: formData.get("upiId"),
          gpayNumber: formData.get("gpayNumber"),
          note: formData.get("note"),
          gatewayProvider: formData.get("gatewayProvider"),
          gatewayEnabled: formData.get("gatewayEnabled") === "true",
          gatewayLabel: formData.get("gatewayLabel")
        }
      })
    });
    elements.settingsStatus.textContent = "Settings saved.";
    await loadAdminData();
  } catch (error) {
    elements.settingsStatus.textContent = error.message;
  }
});

elements.addEventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(elements.addEventForm);
  elements.eventStatus.textContent = "Creating event...";

  try {
    await api("/api/admin/events", {
      method: "POST",
      body: JSON.stringify({
        name: formData.get("name"),
        category: formData.get("category"),
        weekLabel: formData.get("weekLabel"),
        eventDate: formData.get("eventDate"),
        closeAt: new Date(formData.get("closeAt")).toISOString(),
        fee: Number(formData.get("fee")),
        venue: formData.get("venue"),
        format: formData.get("format"),
        description: formData.get("description"),
        allowedParticipantTypes: formData.getAll("allowedParticipantTypes"),
        allowedAgeCategoryIds: formData.getAll("allowedAgeCategoryIds")
      })
    });
    elements.eventStatus.textContent = "Event created.";
    elements.addEventForm.reset();
    await loadAdminData();
  } catch (error) {
    elements.eventStatus.textContent = error.message;
  }
});

bootstrapSession();

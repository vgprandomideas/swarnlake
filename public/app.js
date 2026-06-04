const state = {
  config: null,
  selectedEvents: new Set(),
  selectedFile: null
};

const elements = {
  liveCountPill: document.querySelector("#live-count-pill"),
  heroStats: document.querySelector("#hero-stats"),
  scheduleTableBody: document.querySelector("#schedule-table-body"),
  eventGrid: document.querySelector("#event-grid"),
  ageCategory: document.querySelector("#age-category"),
  participantType: document.querySelector("#participant-type"),
  eligibilityMessage: document.querySelector("#eligibility-message"),
  form: document.querySelector("#registration-form"),
  formStatus: document.querySelector("#form-status"),
  uploadChip: document.querySelector("#upload-chip"),
  summary: document.querySelector("#selection-summary"),
  confirmationPanel: document.querySelector("#confirmation-panel"),
  payeeName: document.querySelector("#payee-name"),
  upiId: document.querySelector("#upi-id"),
  gpayNumber: document.querySelector("#gpay-number"),
  paymentNote: document.querySelector("#payment-note"),
  upiButton: document.querySelector("#upi-button"),
  copyUpiButton: document.querySelector("#copy-upi-button"),
  gatewayNote: document.querySelector("#gateway-note")
};

function formatDate(value, options = {}) {
  return new Date(value).toLocaleDateString("en-IN", {
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function getSelectedEvents() {
  return state.config.events.filter((event) => state.selectedEvents.has(event.id));
}

function buildUpiLink(amount, flatNumber) {
  const payment = state.config.settings.payment;
  const params = new URLSearchParams({
    pa: payment.upiId,
    pn: payment.upiPayeeName,
    am: String(amount),
    cu: "INR",
    tn: `PPF26 ${flatNumber || "Registration"}`
  });

  return `upi://pay?${params.toString()}`;
}

function getEligibility(event) {
  const ageCategoryId = elements.ageCategory.value;
  const participantType = elements.participantType.value;
  const reasons = [];

  if (ageCategoryId && !event.allowedAgeCategoryIds.includes(ageCategoryId)) {
    reasons.push("Age category mismatch");
  }

  if (participantType && !event.allowedParticipantTypes.includes(participantType)) {
    reasons.push("Participant type mismatch");
  }

  if (!event.enabled) {
    reasons.push("Disabled");
  }

  const closed = Date.now() > Date.parse(event.closeAt);
  if (closed) {
    reasons.push("Registration closed");
  }

  return {
    eligible: reasons.length === 0,
    reasons
  };
}

function syncSelectedEventsWithEligibility() {
  for (const event of state.config.events) {
    const { eligible } = getEligibility(event);
    if (!eligible) {
      state.selectedEvents.delete(event.id);
    }
  }
}

function renderHeroStats() {
  const config = state.config;
  const eventCount = config.events.filter((event) => event.enabled).length;
  const closingSoon = [...config.events]
    .filter((event) => event.enabled && Date.now() <= Date.parse(event.closeAt))
    .sort((left, right) => left.closeAt.localeCompare(right.closeAt))[0];

  elements.heroStats.innerHTML = `
    <div class="stat-card">
      <span class="meta-label">Live registrations</span>
      <strong>${config.liveRegistrationCount}</strong>
      <span>and counting across the community</span>
    </div>
    <div class="stat-card">
      <span class="meta-label">Active events</span>
      <strong>${eventCount}</strong>
      <span>across indoor, outdoor, and family play</span>
    </div>
    <div class="stat-card">
      <span class="meta-label">Base fee</span>
      <strong>${formatMoney(config.settings.defaultFee)}</strong>
      <span>per event unless a custom fee is set</span>
    </div>
    <div class="stat-card">
      <span class="meta-label">Next close</span>
      <strong>${closingSoon ? formatDate(closingSoon.closeAt) : "Open"}</strong>
      <span>${closingSoon ? escapeHtml(closingSoon.name) : "All future events are open"}</span>
    </div>
  `;
}

function renderAgeCategories() {
  elements.ageCategory.innerHTML = [
    '<option value="">Select age category</option>',
    ...state.config.ageCategories.map(
      (category) => `<option value="${category.id}">${escapeHtml(category.label)}</option>`
    )
  ].join("");
}

function renderEvents() {
  syncSelectedEventsWithEligibility();
  elements.eventGrid.innerHTML = state.config.events
    .map((event, index) => {
      const { eligible, reasons } = getEligibility(event);
      const isSelected = state.selectedEvents.has(event.id);
      const cardClasses = [
        "event-card",
        isSelected ? "is-selected" : "",
        !eligible ? "is-disabled" : ""
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <article class="${cardClasses}" style="--delay:${index * 40}ms">
          <header>
            <div>
              <div class="tag-row">
                <span class="tag">${escapeHtml(event.category)}</span>
                <span class="tag accent">${escapeHtml(event.weekLabel)}</span>
              </div>
              <h3>${escapeHtml(event.name)}</h3>
            </div>
            <label>
              <input
                type="checkbox"
                data-event-id="${event.id}"
                ${isSelected ? "checked" : ""}
                ${eligible ? "" : "disabled"}
              />
            </label>
          </header>
          <p>${escapeHtml(event.description)}</p>
          <div class="event-meta">
            <span class="tag ok">${formatMoney(event.fee)}</span>
            <span class="tag">${escapeHtml(event.timeLabel || event.format)}</span>
            <span class="tag">${escapeHtml(event.dateLabel || formatDate(event.eventDate))}</span>
          </div>
          <div class="event-categories">
            ${(event.categoryLabels ?? []).map((label) => `<span class="category-pill">${escapeHtml(label)}</span>`).join("")}
          </div>
          <small>Registration closes on ${formatDate(event.closeAt, { hour: "numeric", minute: "2-digit" })}</small>
          ${reasons.length ? `<small>${escapeHtml(reasons.join(" | "))}</small>` : "<small>Eligible to register.</small>"}
        </article>
      `;
    })
    .join("");

  for (const checkbox of elements.eventGrid.querySelectorAll("input[type='checkbox']")) {
    checkbox.addEventListener("change", (event) => {
      const { eventId } = event.currentTarget.dataset;
      if (event.currentTarget.checked) {
        state.selectedEvents.add(eventId);
      } else {
        state.selectedEvents.delete(eventId);
      }
      updateSummary();
      renderEvents();
    });
  }
}

function renderScheduleTable() {
  elements.scheduleTableBody.innerHTML = state.config.events
    .map(
      (event) => `
        <tr>
          <td class="schedule-date">${escapeHtml(event.dateLabel || formatDate(event.eventDate))}</td>
          <td class="schedule-day">${escapeHtml(event.dayLabel || "")}</td>
          <td class="schedule-time">${escapeHtml(event.timeLabel || "")}</td>
          <td class="schedule-event-name accent-${escapeHtml(event.posterAccent || "blue")}">${escapeHtml(event.name)}</td>
          <td>
            <div class="category-stack">
              ${(event.categoryLabels ?? []).map((label) => `<span class="category-pill">${escapeHtml(label)}</span>`).join("")}
            </div>
          </td>
        </tr>
      `
    )
    .join("");
}

function updateEligibilityCopy() {
  const ageCategoryText = elements.ageCategory.options[elements.ageCategory.selectedIndex]?.textContent || "not selected";
  const participantType = elements.participantType.value || "not selected";
  elements.eligibilityMessage.textContent = `Eligibility view: age category ${ageCategoryText}, participant type ${participantType}.`;
}

function updateSummary() {
  const selectedEvents = getSelectedEvents();
  const totalFee = selectedEvents.reduce((sum, event) => sum + Number(event.fee ?? 0), 0);
  const flatNumber = elements.form.flatNumber.value.trim().toUpperCase();
  const payment = state.config.settings.payment;

  elements.liveCountPill.textContent = `${state.config.liveRegistrationCount} registrations live`;
  elements.payeeName.textContent = payment.upiPayeeName;
  elements.upiId.textContent = payment.upiId;
  elements.gpayNumber.textContent = payment.gpayNumber;
  elements.paymentNote.textContent = payment.note;
  elements.gatewayNote.textContent = payment.gatewayEnabled
    ? payment.gatewayLabel
    : `${payment.gatewayLabel} Until then, UPI / GPay with proof upload is the active method.`;

  if (selectedEvents.length) {
    elements.summary.innerHTML = `
      <div class="summary-box">
        <span class="meta-label">Selected events</span>
        <strong>${selectedEvents.length}</strong>
        <ul>${selectedEvents.map((event) => `<li>${escapeHtml(event.name)} - ${formatMoney(event.fee)}</li>`).join("")}</ul>
      </div>
      <div class="summary-box">
        <span class="meta-label">Total payable</span>
        <strong>${formatMoney(totalFee)}</strong>
        <p>Use the UPI button or pay manually to ${escapeHtml(payment.upiId)} before submitting the proof.</p>
      </div>
    `;
  } else {
    elements.summary.innerHTML = `
      <div class="summary-box">
        <span class="meta-label">Waiting for selection</span>
        <strong>No events chosen yet</strong>
        <p>Pick one or more events above to calculate the payment amount.</p>
      </div>
    `;
  }

  elements.upiButton.href = totalFee > 0 ? buildUpiLink(totalFee, flatNumber || "Flat") : "#";
  elements.upiButton.setAttribute("aria-disabled", totalFee > 0 ? "false" : "true");
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Unable to read the uploaded file."));
    reader.readAsDataURL(file);
  });
}

async function loadConfig() {
  const response = await fetch("/api/public/config");
  if (!response.ok) {
    throw new Error("Unable to load the registration configuration.");
  }

  state.config = await response.json();
  renderAgeCategories();
  renderHeroStats();
  renderScheduleTable();
  updateEligibilityCopy();
  renderEvents();
  updateSummary();
}

function bindEvents() {
  elements.ageCategory.addEventListener("change", () => {
    updateEligibilityCopy();
    renderEvents();
    updateSummary();
  });

  elements.participantType.addEventListener("change", () => {
    updateEligibilityCopy();
    renderEvents();
    updateSummary();
  });

  elements.form.flatNumber.addEventListener("input", updateSummary);

  document.querySelector("#proof-upload").addEventListener("change", (event) => {
    const [file] = event.currentTarget.files ?? [];
    state.selectedFile = file ?? null;
    elements.uploadChip.textContent = file
      ? `${file.name} selected (${Math.round(file.size / 1024)} KB)`
      : "No file selected yet.";
  });

  elements.copyUpiButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.config.settings.payment.upiId);
      elements.copyUpiButton.textContent = "Copied";
      setTimeout(() => {
        elements.copyUpiButton.textContent = "Copy UPI ID";
      }, 1400);
    } catch (error) {
      elements.formStatus.textContent = "Copy failed. Please copy the UPI ID manually.";
    }
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    elements.formStatus.textContent = "Submitting registration...";
    elements.confirmationPanel.classList.add("hidden");

    try {
      if (!state.selectedFile) {
        throw new Error("Please upload the payment proof file before submitting.");
      }

      const dataUrl = await fileToDataUrl(state.selectedFile);
      const payload = {
        flatNumber: elements.form.flatNumber.value,
        participantName: elements.form.participantName.value,
        participantType: elements.form.participantType.value,
        mobileNumber: elements.form.mobileNumber.value,
        age: Number(elements.form.age.value),
        ageCategoryId: elements.form.ageCategoryId.value,
        email: elements.form.email.value,
        paymentReference: elements.form.paymentReference.value,
        eventIds: [...state.selectedEvents],
        website: elements.form.website.value,
        screenshot: {
          name: state.selectedFile.name,
          dataUrl
        }
      };

      const response = await fetch("/api/registrations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error || "Registration could not be submitted.");
      }

      state.config.liveRegistrationCount += 1;
      elements.form.reset();
      state.selectedEvents.clear();
      state.selectedFile = null;
      elements.uploadChip.textContent = "No file selected yet.";
      elements.formStatus.textContent = "Registration submitted successfully.";
      updateEligibilityCopy();
      elements.confirmationPanel.innerHTML = `
        <div class="section-heading">
          <p class="eyebrow">Confirmed</p>
          <h2>Your entry has been recorded</h2>
        </div>
        <p class="hero-text">
          Registration code <strong>${escapeHtml(body.registration.registrationCode)}</strong>
          was created for <strong>${escapeHtml(body.registration.participantName)}</strong>.
        </p>
        <div class="summary-list">
          <div class="summary-box">
            <span class="meta-label">Amount submitted</span>
            <strong>${formatMoney(body.registration.totalFee)}</strong>
            <p>Payment status: ${escapeHtml(body.registration.paymentStatus.replaceAll("_", " "))}</p>
          </div>
          <div class="summary-box">
            <span class="meta-label">What's next</span>
            <p>The sports committee can now verify the payment proof from the admin dashboard.</p>
          </div>
        </div>
      `;
      elements.confirmationPanel.classList.remove("hidden");
      renderHeroStats();
      renderEvents();
      updateSummary();
      window.location.hash = "register";
    } catch (error) {
      elements.formStatus.textContent = error.message;
    }
  });
}

loadConfig()
  .then(bindEvents)
  .catch((error) => {
    elements.formStatus.textContent = error.message;
    elements.liveCountPill.textContent = "Configuration unavailable";
  });

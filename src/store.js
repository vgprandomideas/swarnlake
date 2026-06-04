import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { createSeedData } from "./seed-data.js";
import { createSessionToken, hashPassword, verifyPassword } from "./security.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function byNewest(left, right, key = "submittedAt") {
  return String(right[key] ?? "").localeCompare(String(left[key] ?? ""));
}

export class FileStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.adminUsername = options.adminUsername ?? "committee";
    this.adminPassword = options.adminPassword ?? "PlayFest2026!";
    this.state = null;
  }

  async initialize() {
    await mkdir(dirname(this.filePath), { recursive: true });

    try {
      const contents = await readFile(this.filePath, "utf8");
      this.state = JSON.parse(contents);
      this.state.sessions ??= [];
      this.state.registrations ??= [];
      this.state.events ??= [];
      this.state.ageCategories ??= [];
      this.state.settings ??= {};
      this.state.settings.payment ??= {};
      this.state.settings.adminUsers ??= [];

      if (this.state.events.some((event) => event.id === "kids-fun-run")) {
        const adminUsers = this.state.settings.adminUsers ?? [];
        const seed = createSeedData({
          adminUsername: adminUsers[0]?.username ?? this.adminUsername,
          adminPasswordHash: adminUsers[0]?.passwordHash ?? hashPassword(this.adminPassword)
        });
        this.state.events = seed.events;
        this.state.meta.shortName = seed.meta.shortName;
        this.state.meta.appName = seed.meta.appName;
        await this.save();
      }
    } catch (error) {
      this.state = createSeedData({
        adminUsername: this.adminUsername,
        adminPasswordHash: hashPassword(this.adminPassword)
      });
      await this.save();
    }

    const adminUsers = this.state.settings.adminUsers ?? [];
    if (!adminUsers.length) {
      this.state.settings.adminUsers = [
        {
          id: "committee-admin",
          username: this.adminUsername,
          passwordHash: hashPassword(this.adminPassword),
          fullName: "Sports Committee Admin",
          role: "super_admin"
        }
      ];
      await this.save();
    }
  }

  async save() {
    this.state.meta.updatedAt = new Date().toISOString();
    await writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }

  snapshot() {
    return clone(this.state);
  }

  purgeExpiredSessions() {
    const now = Date.now();
    this.state.sessions = this.state.sessions.filter((session) => Date.parse(session.expiresAt) > now);
  }

  listAgeCategories() {
    return clone(this.state.ageCategories);
  }

  listEvents() {
    return clone(this.state.events).sort((left, right) => left.eventDate.localeCompare(right.eventDate));
  }

  getAgeCategory(id) {
    return this.state.ageCategories.find((category) => category.id === id) ?? null;
  }

  getEvent(id) {
    return this.state.events.find((event) => event.id === id) ?? null;
  }

  getPublicConfig() {
    const countsByEvent = this.state.registrations.reduce((accumulator, registration) => {
      for (const eventId of registration.eventIds) {
        accumulator[eventId] = (accumulator[eventId] ?? 0) + 1;
      }
      return accumulator;
    }, {});

    return {
      meta: clone(this.state.meta),
      settings: {
        registrationStartDate: this.state.settings.registrationStartDate,
        supportEmail: this.state.settings.supportEmail,
        supportPhone: this.state.settings.supportPhone,
        contactName: this.state.settings.contactName,
        defaultFee: this.state.settings.defaultFee,
        liveCountEnabled: this.state.settings.liveCountEnabled,
        payment: clone(this.state.settings.payment)
      },
      liveRegistrationCount: this.state.registrations.length,
      ageCategories: this.listAgeCategories(),
      events: this.listEvents().map((event) => ({
        ...event,
        registrationCount: countsByEvent[event.id] ?? 0
      }))
    };
  }

  getAdminConfig() {
    return {
      settings: {
        registrationStartDate: this.state.settings.registrationStartDate,
        supportEmail: this.state.settings.supportEmail,
        supportPhone: this.state.settings.supportPhone,
        contactName: this.state.settings.contactName,
        defaultFee: this.state.settings.defaultFee,
        liveCountEnabled: this.state.settings.liveCountEnabled,
        payment: clone(this.state.settings.payment),
        adminUsers: (this.state.settings.adminUsers ?? []).map((user) => ({
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role
        }))
      },
      ageCategories: this.listAgeCategories(),
      events: this.listEvents()
    };
  }

  buildRegistrationRecord(payload) {
    const sequence = String(this.state.registrations.length + 1).padStart(4, "0");
    return {
      id: `registration-${Date.now()}-${sequence}`,
      registrationCode: `PPF26-${sequence}`,
      ...payload
    };
  }

  async createRegistration(payload) {
    const record = this.buildRegistrationRecord(payload);
    this.state.registrations.push(record);
    await this.save();
    return clone(record);
  }

  listRegistrations(filters = {}) {
    const searchTerm = String(filters.search ?? "").trim().toLowerCase();
    const eventId = String(filters.eventId ?? "").trim();
    const ageCategoryId = String(filters.ageCategoryId ?? "").trim();
    const participantType = String(filters.participantType ?? "").trim();
    const flatNumber = String(filters.flatNumber ?? "").trim().toLowerCase();

    const ageCategories = new Map(this.state.ageCategories.map((item) => [item.id, item]));
    const events = new Map(this.state.events.map((item) => [item.id, item]));

    return this.state.registrations
      .map((registration) => {
        const eventNames = registration.eventIds
          .map((registeredEventId) => events.get(registeredEventId)?.name ?? registeredEventId)
          .join(", ");

        return {
          ...clone(registration),
          ageCategoryLabel: ageCategories.get(registration.ageCategoryId)?.label ?? registration.ageCategoryId,
          eventNames
        };
      })
      .filter((registration) => {
        if (eventId && !registration.eventIds.includes(eventId)) {
          return false;
        }

        if (ageCategoryId && registration.ageCategoryId !== ageCategoryId) {
          return false;
        }

        if (participantType && registration.participantType !== participantType) {
          return false;
        }

        if (flatNumber && !registration.flatNumber.toLowerCase().includes(flatNumber)) {
          return false;
        }

        if (searchTerm) {
          const haystack = [
            registration.registrationCode,
            registration.flatNumber,
            registration.participantName,
            registration.mobileNumber,
            registration.eventNames,
            registration.paymentReference
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => byNewest(left, right));
  }

  getExportRows(filters = {}) {
    return this.listRegistrations(filters).map((registration) => ({
      "Registration Code": registration.registrationCode,
      "Submitted At": registration.submittedAt,
      "Flat Number": registration.flatNumber,
      "Participant Name": registration.participantName,
      "Participant Type": registration.participantType,
      "Mobile Number": registration.mobileNumber,
      Age: registration.age,
      "Age Category": registration.ageCategoryLabel,
      Events: registration.eventNames,
      "Event Count": registration.eventIds.length,
      "Amount Paid (INR)": registration.totalFee,
      "Payment Reference": registration.paymentReference,
      "Payment Mode": registration.paymentMethod,
      "Payment Status": registration.paymentStatus,
      "Screenshot URL": registration.screenshotUrl,
      Email: registration.email ?? "",
      Notes: registration.notes ?? ""
    }));
  }

  getDashboardData() {
    const registrations = this.listRegistrations();
    const events = this.listEvents();
    const ageCategoryMap = new Map(this.state.ageCategories.map((category) => [category.id, category.label]));

    const registrationsByEvent = events.map((event) => {
      const eventRegistrations = registrations.filter((registration) => registration.eventIds.includes(event.id));
      return {
        id: event.id,
        name: event.name,
        closeAt: event.closeAt,
        eventDate: event.eventDate,
        count: eventRegistrations.length,
        revenue: eventRegistrations.reduce((total, registration) => total + Number(registration.totalFee ?? 0), 0)
      };
    });

    const registrationsByAge = this.state.ageCategories.map((category) => ({
      id: category.id,
      label: category.label,
      count: registrations.filter((registration) => registration.ageCategoryId === category.id).length
    }));

    const uniqueFlats = new Set(registrations.map((registration) => registration.flatNumber.toUpperCase()));

    return {
      overview: {
        totalRegistrations: registrations.length,
        totalRevenue: registrations.reduce((total, registration) => total + Number(registration.totalFee ?? 0), 0),
        childParticipants: registrations.filter((registration) => registration.participantType === "child").length,
        adultParticipants: registrations.filter((registration) => registration.participantType === "adult").length,
        uniqueFlats: uniqueFlats.size,
        pendingVerification: registrations.filter((registration) => registration.paymentStatus === "awaiting_verification")
          .length
      },
      registrationsByEvent,
      registrationsByAge,
      recentRegistrations: registrations.slice(0, 8),
      nextDeadlines: events
        .filter((event) => event.enabled)
        .sort((left, right) => left.closeAt.localeCompare(right.closeAt))
        .slice(0, 5)
        .map((event) => ({
          id: event.id,
          name: event.name,
          closeAt: event.closeAt,
          eventDate: event.eventDate
        })),
      ageCategoryLabels: Object.fromEntries(ageCategoryMap)
    };
  }

  async authenticateAdmin(username, password) {
    const adminUser =
      (this.state.settings.adminUsers ?? []).find(
        (user) => user.username.toLowerCase() === String(username ?? "").trim().toLowerCase()
      ) ?? null;

    if (!adminUser) {
      return null;
    }

    if (!verifyPassword(password, adminUser.passwordHash)) {
      return null;
    }

    return {
      id: adminUser.id,
      username: adminUser.username,
      fullName: adminUser.fullName,
      role: adminUser.role
    };
  }

  async createSession(user) {
    this.purgeExpiredSessions();

    const session = {
      token: createSessionToken(),
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    this.state.sessions.push(session);
    await this.save();
    return clone(session);
  }

  async deleteSession(token) {
    const before = this.state.sessions.length;
    this.state.sessions = this.state.sessions.filter((session) => session.token !== token);
    if (this.state.sessions.length !== before) {
      await this.save();
    }
  }

  async getSessionUser(token) {
    this.purgeExpiredSessions();

    const session = this.state.sessions.find((item) => item.token === token);
    if (!session) {
      return null;
    }

    const user = (this.state.settings.adminUsers ?? []).find((item) => item.id === session.userId);
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role
    };
  }

  async updateSettings(patch) {
    const nextSettings = {
      ...this.state.settings,
      registrationStartDate: patch.registrationStartDate ?? this.state.settings.registrationStartDate,
      supportEmail: patch.supportEmail ?? this.state.settings.supportEmail,
      supportPhone: patch.supportPhone ?? this.state.settings.supportPhone,
      contactName: patch.contactName ?? this.state.settings.contactName,
      defaultFee:
        patch.defaultFee !== undefined ? Number(patch.defaultFee) || this.state.settings.defaultFee : this.state.settings.defaultFee,
      liveCountEnabled:
        patch.liveCountEnabled !== undefined ? Boolean(patch.liveCountEnabled) : this.state.settings.liveCountEnabled,
      payment: {
        ...this.state.settings.payment,
        ...(patch.payment ?? {})
      }
    };

    nextSettings.adminUsers = this.state.settings.adminUsers;
    this.state.settings = nextSettings;
    await this.save();
    return this.getAdminConfig().settings;
  }

  async createEvent(payload) {
    const event = {
      id: payload.id,
      name: payload.name,
      category: payload.category,
      eventDate: payload.eventDate,
      closeAt: payload.closeAt,
      weekLabel: payload.weekLabel,
      fee: Number(payload.fee),
      venue: payload.venue,
      format: payload.format,
      enabled: payload.enabled,
      description: payload.description ?? "",
      notes: payload.notes ?? "",
      dateLabel: payload.dateLabel ?? "",
      dayLabel: payload.dayLabel ?? "",
      timeLabel: payload.timeLabel ?? "",
      categoryLabels: clone(payload.categoryLabels ?? []),
      posterAccent: payload.posterAccent ?? "blue",
      allowedAgeCategoryIds: clone(payload.allowedAgeCategoryIds),
      allowedParticipantTypes: clone(payload.allowedParticipantTypes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.state.events.push(event);
    await this.save();
    return clone(event);
  }

  async updateEvent(eventId, patch) {
    const eventIndex = this.state.events.findIndex((event) => event.id === eventId);
    if (eventIndex === -1) {
      return null;
    }

    this.state.events[eventIndex] = {
      ...this.state.events[eventIndex],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    await this.save();
    return clone(this.state.events[eventIndex]);
  }
}

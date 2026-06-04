import http from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildXlsxBuffer, toCsv } from "./exporters.js";
import { FileStore } from "./store.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const projectRoot = resolve(currentDir, "..");
const publicDir = join(projectRoot, "public");
const defaultDataFile = join(projectRoot, "data", "store.json");
const defaultUploadDir = join(projectRoot, "uploads");
const SESSION_COOKIE = "ppf26_session";
const REQUEST_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const allowedUploadMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
const allowedExtensions = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "application/pdf": ".pdf"
};

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".pdf": "application/pdf"
};

const submissionTracker = new Map();

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload));
}

function sendBuffer(response, statusCode, buffer, contentType, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": buffer.length,
    ...headers
  });
  response.end(buffer);
}

function sendError(response, statusCode, message, extra = {}) {
  sendJson(response, statusCode, { error: message, ...extra });
}

function createHttpError(statusCode, message, extra = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.extra = extra;
  return error;
}

async function readJsonBody(request, limitBytes = REQUEST_LIMIT_BYTES) {
  const chunks = [];
  let total = 0;

  for await (const chunk of request) {
    total += chunk.length;
    if (total > limitBytes) {
      throw createHttpError(413, "Request body exceeds the allowed size.");
    }
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    return null;
  }
}

function parseCookies(header = "") {
  return header.split(";").reduce((accumulator, pair) => {
    const [key, ...valueParts] = pair.trim().split("=");
    if (!key) {
      return accumulator;
    }

    accumulator[key] = decodeURIComponent(valueParts.join("="));
    return accumulator;
  }, {});
}

function buildSetCookie(token) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${24 * 60 * 60}`;
}

function clearCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function getBearerToken(request) {
  const header = request.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

async function getAuthContext(store, request) {
  const cookies = parseCookies(request.headers.cookie ?? "");
  const token = getBearerToken(request) ?? cookies[SESSION_COOKIE];
  const user = token ? await store.getSessionUser(token) : null;
  return { token, user };
}

function requireAdmin(response, authContext) {
  if (!authContext.user) {
    sendError(response, 401, "Admin login required.");
    return false;
  }

  return true;
}

function getClientIp(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length) {
    return forwardedFor.split(",")[0].trim();
  }

  return request.socket.remoteAddress ?? "unknown";
}

function enforceRateLimit(ipAddress) {
  const now = Date.now();
  const windowStart = now - 60 * 60 * 1000;
  const recentHits = (submissionTracker.get(ipAddress) ?? []).filter((timestamp) => timestamp >= windowStart);

  if (recentHits.length >= 6) {
    throw createHttpError(429, "Too many registration attempts from this network. Please try again later.");
  }

  recentHits.push(now);
  submissionTracker.set(ipAddress, recentHits);
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "entry";
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(String(dataUrl ?? ""));
  if (!match) {
    throw createHttpError(400, "Uploaded proof must be sent as a base64 data URL.");
  }

  const [, mimeType, encoded] = match;
  return {
    mimeType,
    buffer: Buffer.from(encoded, "base64")
  };
}

function buildUpiLink(paymentSettings, amount, flatNumber) {
  const params = new URLSearchParams({
    pa: paymentSettings.upiId,
    pn: paymentSettings.upiPayeeName,
    am: String(amount),
    cu: "INR",
    tn: `PPF26 ${flatNumber}`
  });

  return `upi://pay?${params.toString()}`;
}

function serveStaticFile(response, resolvedPath) {
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(resolvedPath)] ?? "application/octet-stream"
  });
  createReadStream(resolvedPath).pipe(response);
}

async function serveStatic(requestPath, response) {
  const targetPath =
    requestPath === "/" ? "/index.html" : requestPath === "/admin" || requestPath === "/admin/" ? "/admin.html" : requestPath;
  const safePath = normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  const resolvedPath = join(publicDir, safePath);

  if (!resolvedPath.startsWith(publicDir)) {
    sendError(response, 403, "Forbidden");
    return;
  }

  if (!existsSync(resolvedPath)) {
    sendError(response, 404, "Not found");
    return;
  }

  const fileInfo = await stat(resolvedPath);
  if (fileInfo.isDirectory()) {
    sendError(response, 403, "Forbidden");
    return;
  }

  serveStaticFile(response, resolvedPath);
}

async function serveUpload(uploadDir, requestPath, response) {
  const fileName = basename(requestPath.slice("/uploads/".length));
  const resolvedPath = join(uploadDir, fileName);

  if (!resolvedPath.startsWith(uploadDir) || !existsSync(resolvedPath)) {
    sendError(response, 404, "Upload not found");
    return;
  }

  const fileInfo = await stat(resolvedPath);
  if (fileInfo.isDirectory()) {
    sendError(response, 403, "Forbidden");
    return;
  }

  serveStaticFile(response, resolvedPath);
}

function sanitizePhoneNumber(rawValue) {
  return String(rawValue ?? "")
    .replace(/[^\d+]/g, "")
    .trim();
}

function matchesAgeCategory(age, category) {
  if (!category) {
    return false;
  }

  if (category.minAge !== null && age < category.minAge) {
    return false;
  }

  if (category.maxAge !== null && age > category.maxAge) {
    return false;
  }

  return true;
}

function normalizeEventPayload(payload, ageCategories) {
  const normalizedId = payload.id ? slugify(payload.id) : slugify(payload.name);
  const allowedAgeCategoryIds = Array.isArray(payload.allowedAgeCategoryIds) ? payload.allowedAgeCategoryIds : [];
  const allowedParticipantTypes = Array.isArray(payload.allowedParticipantTypes)
    ? payload.allowedParticipantTypes
    : ["child", "adult"];

  if (!payload.name || !payload.category || !payload.eventDate || !payload.closeAt || !payload.weekLabel) {
    throw createHttpError(400, "name, category, weekLabel, eventDate, and closeAt are required for an event.");
  }

  if (!allowedAgeCategoryIds.length) {
    throw createHttpError(400, "At least one age category must be selected for an event.");
  }

  const eventDate = String(payload.eventDate).trim();
  const closeAt = new Date(payload.closeAt);
  const fee = Number(payload.fee ?? 0);

  if (Number.isNaN(Date.parse(eventDate))) {
    throw createHttpError(400, "Event date is invalid.");
  }

  if (Number.isNaN(closeAt.getTime())) {
    throw createHttpError(400, "Closing time is invalid.");
  }

  if (!Number.isFinite(fee) || fee < 0) {
    throw createHttpError(400, "Fee must be a valid non-negative number.");
  }

  for (const ageCategoryId of allowedAgeCategoryIds) {
    if (!ageCategories.some((category) => category.id === ageCategoryId)) {
      throw createHttpError(400, `Unknown age category: ${ageCategoryId}`);
    }
  }

  return {
    id: normalizedId,
    name: String(payload.name).trim(),
    category: String(payload.category).trim(),
    dateLabel: String(payload.dateLabel ?? "").trim(),
    dayLabel: String(payload.dayLabel ?? "").trim(),
    timeLabel: String(payload.timeLabel ?? "").trim(),
    weekLabel: String(payload.weekLabel).trim(),
    eventDate,
    closeAt: closeAt.toISOString(),
    fee,
    venue: String(payload.venue ?? "Purva Swanlake Apartments").trim(),
    format: String(payload.format ?? "Individual").trim(),
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : true,
    description: String(payload.description ?? "").trim(),
    notes: String(payload.notes ?? "").trim(),
    categoryLabels: Array.isArray(payload.categoryLabels) ? payload.categoryLabels.map((item) => String(item).trim()).filter(Boolean) : [],
    posterAccent: String(payload.posterAccent ?? "blue").trim() || "blue",
    allowedAgeCategoryIds,
    allowedParticipantTypes
  };
}

function validateRegistrationPayload(payload, config) {
  if (payload.website) {
    throw createHttpError(400, "Spam protection triggered.");
  }

  const flatNumber = String(payload.flatNumber ?? "").trim().toUpperCase();
  const participantName = String(payload.participantName ?? "").trim();
  const participantType = String(payload.participantType ?? "").trim().toLowerCase();
  const mobileNumber = sanitizePhoneNumber(payload.mobileNumber);
  const age = Number(payload.age);
  const ageCategoryId = String(payload.ageCategoryId ?? "").trim();
  const eventIds = Array.isArray(payload.eventIds) ? payload.eventIds.map((item) => String(item)) : [];
  const paymentReference = String(payload.paymentReference ?? "").trim();
  const email = String(payload.email ?? "").trim().toLowerCase();

  if (!flatNumber || !participantName || !participantType || !mobileNumber || !ageCategoryId || !paymentReference) {
    throw createHttpError(400, "Please complete all required registration fields.");
  }

  if (!["child", "adult"].includes(participantType)) {
    throw createHttpError(400, "Participant type must be either child or adult.");
  }

  if (!Number.isInteger(age) || age < 1 || age > 100) {
    throw createHttpError(400, "Age must be a whole number between 1 and 100.");
  }

  if (!/^\+?\d{10,13}$/u.test(mobileNumber)) {
    throw createHttpError(400, "Enter a valid mobile number.");
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw createHttpError(400, "Enter a valid email address or leave it blank.");
  }

  if (!eventIds.length) {
    throw createHttpError(400, "Choose at least one sport or event.");
  }

  const ageCategory = config.ageCategories.find((category) => category.id === ageCategoryId);
  if (!ageCategory) {
    throw createHttpError(400, "Choose a valid age category.");
  }

  if (!matchesAgeCategory(age, ageCategory)) {
    throw createHttpError(400, "Age does not match the selected age category.");
  }

  const registrationStartDate = new Date(`${config.settings.registrationStartDate}T00:00:00`);
  if (Date.now() < registrationStartDate.getTime()) {
    throw createHttpError(400, "Registration has not opened yet.");
  }

  const selectedEvents = eventIds.map((eventId) => config.events.find((event) => event.id === eventId)).filter(Boolean);
  if (selectedEvents.length !== eventIds.length) {
    throw createHttpError(400, "One or more selected events are no longer available.");
  }

  for (const event of selectedEvents) {
    if (!event.enabled) {
      throw createHttpError(400, `${event.name} is currently disabled.`);
    }

    if (Date.now() > Date.parse(event.closeAt)) {
      throw createHttpError(400, `Registration for ${event.name} is closed.`);
    }

    if (!event.allowedAgeCategoryIds.includes(ageCategoryId)) {
      throw createHttpError(400, `${event.name} is not open for the selected age category.`);
    }

    if (!event.allowedParticipantTypes.includes(participantType)) {
      throw createHttpError(400, `${event.name} is not open for the selected participant type.`);
    }
  }

  if (!payload.screenshot?.dataUrl || !payload.screenshot?.name) {
    throw createHttpError(400, "Payment screenshot upload is mandatory.");
  }

  const decodedUpload = parseDataUrl(payload.screenshot.dataUrl);
  if (!allowedUploadMimeTypes.has(decodedUpload.mimeType)) {
    throw createHttpError(400, "Allowed proof formats are JPG, PNG, or PDF.");
  }

  if (decodedUpload.buffer.length > MAX_UPLOAD_BYTES) {
    throw createHttpError(400, "Upload size must be 5 MB or smaller.");
  }

  const totalFee = selectedEvents.reduce((total, event) => total + Number(event.fee ?? config.settings.defaultFee ?? 0), 0);

  return {
    flatNumber,
    participantName,
    participantType,
    mobileNumber,
    age,
    ageCategoryId,
    eventIds,
    paymentReference,
    email,
    totalFee,
    screenshot: {
      name: String(payload.screenshot.name).trim(),
      mimeType: decodedUpload.mimeType,
      buffer: decodedUpload.buffer
    }
  };
}

async function saveUpload(uploadDir, flatNumber, screenshot) {
  const extension = allowedExtensions[screenshot.mimeType] ?? (extname(screenshot.name).toLowerCase() || ".bin");
  const fileName = `${Date.now()}-${slugify(flatNumber)}-${randomUUID().slice(0, 8)}${extension}`;
  const absolutePath = join(uploadDir, fileName);
  await writeFile(absolutePath, screenshot.buffer);

  return {
    fileName,
    screenshotUrl: `/uploads/${fileName}`,
    screenshotOriginalName: screenshot.name,
    screenshotMimeType: screenshot.mimeType,
    screenshotSize: screenshot.buffer.length
  };
}

function buildQueryFilters(url) {
  return {
    search: url.searchParams.get("search") ?? "",
    eventId: url.searchParams.get("eventId") ?? "",
    ageCategoryId: url.searchParams.get("ageCategoryId") ?? "",
    participantType: url.searchParams.get("participantType") ?? "",
    flatNumber: url.searchParams.get("flatNumber") ?? ""
  };
}

export async function createServer(options = {}) {
  const dataPath = resolve(options.dataPath ?? defaultDataFile);
  const uploadDir = resolve(options.uploadDir ?? defaultUploadDir);
  const adminUsername = process.env.PPF_ADMIN_USERNAME ?? options.adminUsername ?? "committee";
  const adminPassword = process.env.PPF_ADMIN_PASSWORD ?? options.adminPassword ?? "PlayFest2026!";
  const store = new FileStore(dataPath, { adminUsername, adminPassword });

  await mkdir(dirname(dataPath), { recursive: true });
  await mkdir(uploadDir, { recursive: true });
  await store.initialize();

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const { pathname } = url;

      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "purva-play-fest-2026" });
        return;
      }

      if (request.method === "GET" && pathname === "/api/public/config") {
        sendJson(response, 200, store.getPublicConfig());
        return;
      }

      if (request.method === "POST" && pathname === "/api/registrations") {
        const payload = await readJsonBody(request);
        if (!payload) {
          sendError(response, 400, "Invalid JSON body.");
          return;
        }

        enforceRateLimit(getClientIp(request));

        const config = store.getPublicConfig();
        const normalized = validateRegistrationPayload(payload, config);
        const upload = await saveUpload(uploadDir, normalized.flatNumber, normalized.screenshot);

        const registration = await store.createRegistration({
          flatNumber: normalized.flatNumber,
          participantName: normalized.participantName,
          participantType: normalized.participantType,
          mobileNumber: normalized.mobileNumber,
          age: normalized.age,
          ageCategoryId: normalized.ageCategoryId,
          eventIds: normalized.eventIds,
          totalFee: normalized.totalFee,
          paymentReference: normalized.paymentReference,
          paymentMethod: "upi_gpay",
          paymentStatus: "awaiting_verification",
          screenshotUrl: upload.screenshotUrl,
          screenshotOriginalName: upload.screenshotOriginalName,
          screenshotMimeType: upload.screenshotMimeType,
          screenshotSize: upload.screenshotSize,
          email: normalized.email,
          notes: "",
          submittedAt: new Date().toISOString()
        });

        sendJson(response, 201, {
          message: "Registration submitted successfully.",
          registration: {
            ...registration,
            paymentLink: buildUpiLink(config.settings.payment, registration.totalFee, registration.flatNumber)
          }
        });
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/login") {
        const payload = await readJsonBody(request);
        if (!payload) {
          sendError(response, 400, "Invalid JSON body.");
          return;
        }

        const user = await store.authenticateAdmin(payload.username, payload.password);
        if (!user) {
          sendError(response, 401, "Invalid admin credentials.");
          return;
        }

        const session = await store.createSession(user);
        sendJson(
          response,
          200,
          {
            user,
            token: session.token
          },
          { "Set-Cookie": buildSetCookie(session.token) }
        );
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/logout") {
        const authContext = await getAuthContext(store, request);
        if (authContext.token) {
          await store.deleteSession(authContext.token);
        }
        sendJson(response, 200, { ok: true }, { "Set-Cookie": clearCookie() });
        return;
      }

      const authContext = await getAuthContext(store, request);

      if (request.method === "GET" && pathname === "/api/admin/session") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        sendJson(response, 200, { user: authContext.user });
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/dashboard") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        sendJson(response, 200, store.getDashboardData());
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/config") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        sendJson(response, 200, store.getAdminConfig());
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/registrations") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const filters = buildQueryFilters(url);
        const rows = store.listRegistrations(filters);
        sendJson(response, 200, {
          total: rows.length,
          rows
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/export.csv") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const csv = toCsv(store.getExportRows(buildQueryFilters(url)));
        sendBuffer(response, 200, Buffer.from(csv, "utf8"), "text/csv; charset=utf-8", {
          "Content-Disposition": 'attachment; filename="ppf26-registrations.csv"'
        });
        return;
      }

      if (request.method === "GET" && pathname === "/api/admin/export.xlsx") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const buffer = await buildXlsxBuffer(store.getExportRows(buildQueryFilters(url)), "PPF26 Registrations");
        sendBuffer(
          response,
          200,
          buffer,
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          {
            "Content-Disposition": 'attachment; filename="ppf26-registrations.xlsx"'
          }
        );
        return;
      }

      if (request.method === "PATCH" && pathname === "/api/admin/settings") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const payload = await readJsonBody(request);
        if (!payload) {
          sendError(response, 400, "Invalid JSON body.");
          return;
        }

        const settings = await store.updateSettings(payload);
        sendJson(response, 200, settings);
        return;
      }

      if (request.method === "POST" && pathname === "/api/admin/events") {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const payload = await readJsonBody(request);
        if (!payload) {
          sendError(response, 400, "Invalid JSON body.");
          return;
        }

        const normalizedEvent = normalizeEventPayload(payload, store.listAgeCategories());
        if (store.getEvent(normalizedEvent.id)) {
          sendError(response, 409, "An event with this identifier already exists.");
          return;
        }

        const createdEvent = await store.createEvent(normalizedEvent);
        sendJson(response, 201, createdEvent);
        return;
      }

      if (request.method === "PATCH" && pathname.startsWith("/api/admin/events/")) {
        if (!requireAdmin(response, authContext)) {
          return;
        }

        const payload = await readJsonBody(request);
        if (!payload) {
          sendError(response, 400, "Invalid JSON body.");
          return;
        }

        const eventId = pathname.slice("/api/admin/events/".length);
        const existingEvent = store.getEvent(eventId);
        if (!existingEvent) {
          sendError(response, 404, "Event not found.");
          return;
        }

        const mergedEvent = normalizeEventPayload(
          {
            ...existingEvent,
            ...payload,
            id: existingEvent.id
          },
          store.listAgeCategories()
        );

        const updatedEvent = await store.updateEvent(eventId, mergedEvent);
        sendJson(response, 200, updatedEvent);
        return;
      }

      if (request.method === "GET" && pathname.startsWith("/uploads/")) {
        await serveUpload(uploadDir, pathname, response);
        return;
      }

      if (request.method === "GET") {
        await serveStatic(pathname, response);
        return;
      }

      sendError(response, 405, "Method not allowed.");
    } catch (error) {
      sendError(response, error.statusCode ?? 500, error.message ?? "Unexpected error.", error.extra ?? {});
    }
  });
}

if (process.argv[1] === currentFile) {
  const port = Number(process.env.PORT ?? 4186);
  const server = await createServer();
  server.listen(port, () => {
    console.log(`Purva Play Fest 2026 running at http://localhost:${port}`);
  });
}

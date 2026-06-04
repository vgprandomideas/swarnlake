import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createServer } from "../src/server.js";

async function main() {
  const sandbox = await mkdtemp(join(tmpdir(), "ppf26-test-"));
  const dataPath = join(sandbox, "store.json");
  const uploadDir = join(sandbox, "uploads");
  const server = await createServer({ dataPath, uploadDir, adminPassword: "PlayFest2026!" });

  await new Promise((resolve) => server.listen(0, resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const cookieJar = { value: "" };

  const request = async (path, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    if (cookieJar.value) {
      headers.set("cookie", cookieJar.value);
    }

    const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      cookieJar.value = setCookie.split(";")[0];
    }

    return response;
  };

  try {
    const configResponse = await request("/api/public/config");
    assert.equal(configResponse.status, 200);
    const config = await configResponse.json();
    assert.ok(config.events.length >= 10);

    const registrationPayload = {
      flatNumber: "B-903",
      participantName: "Aarav Menon",
      participantType: "child",
      mobileNumber: "+919876543210",
      age: 10,
      ageCategoryId: "6-10",
      paymentReference: "UTR123456",
      email: "aarav@example.com",
      eventIds: ["table-tennis", "chess"],
      website: "",
      screenshot: {
        name: "proof.png",
        dataUrl:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9W9VHtQAAAAASUVORK5CYII="
      }
    };

    const registrationResponse = await request("/api/registrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(registrationPayload)
    });
    assert.equal(registrationResponse.status, 201);
    const registrationBody = await registrationResponse.json();
    assert.equal(registrationBody.registration.registrationCode, "PPF26-0001");

    const loginResponse = await request("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: "committee",
        password: "PlayFest2026!"
      })
    });
    assert.equal(loginResponse.status, 200);

    const dashboardResponse = await request("/api/admin/dashboard");
    assert.equal(dashboardResponse.status, 200);
    const dashboard = await dashboardResponse.json();
    assert.equal(dashboard.overview.totalRegistrations, 1);

    const filteredResponse = await request("/api/admin/registrations?eventId=table-tennis");
    assert.equal(filteredResponse.status, 200);
    const filtered = await filteredResponse.json();
    assert.equal(filtered.total, 1);

    const csvResponse = await request("/api/admin/export.csv");
    assert.equal(csvResponse.status, 200);
    const csvBody = await csvResponse.text();
    assert.ok(csvBody.includes("Aarav Menon"));

    const xlsxResponse = await request("/api/admin/export.xlsx");
    assert.equal(xlsxResponse.status, 200);
    const xlsxBytes = new Uint8Array(await xlsxResponse.arrayBuffer());
    assert.ok(xlsxBytes.length > 500);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main()
  .then(() => {
    console.log("PPF26 tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

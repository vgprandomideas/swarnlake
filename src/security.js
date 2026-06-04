import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const HASH_BYTES = 64;

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, HASH_BYTES).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, encodedValue) {
  if (!encodedValue || !encodedValue.includes(":")) {
    return false;
  }

  try {
    const [salt, storedHash] = encodedValue.split(":");
    const actualHash = scryptSync(password, salt, HASH_BYTES).toString("hex");
    return timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(storedHash, "hex"));
  } catch (error) {
    return false;
  }
}

export function createSessionToken() {
  return randomBytes(32).toString("hex");
}

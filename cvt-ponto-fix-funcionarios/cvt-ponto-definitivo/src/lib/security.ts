import crypto from "node:crypto";

const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

export async function hashPassword(password: string, salt?: Buffer) {
  const realSalt = salt ?? crypto.randomBytes(16);
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(password, realSalt, 32, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) reject(err); else resolve(derivedKey);
    });
  });
  return { hash: key.toString("base64"), salt: realSalt.toString("base64") };
}

export async function verifyPassword(password: string, hashB64: string, saltB64: string) {
  try {
    const actual = await hashPassword(password, Buffer.from(saltB64, "base64"));
    const a = Buffer.from(actual.hash, "base64");
    const b = Buffer.from(hashB64, "base64");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString("base64url"); }
export function sha256(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }

export function timingSafeTextEqual(a: string, b: string) {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) throw new Error("ORIGIN");
}

export function clientIp(request: Request) {
  return request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

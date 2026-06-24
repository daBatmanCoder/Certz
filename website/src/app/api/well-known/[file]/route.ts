// Serves the product site's OWN Certz cert so the browser extension can verify
// this very site (eat-our-own-dog-food). Reached via the rewrite in
// next.config.ts: /.well-known/certz/<file> -> /api/well-known/<file>.
//
//   certificate.pem  -> the site's Certz leaf certificate (PEM)
//   ca-root.pem      -> the Certz CA root (PEM)
//   sign?nonce=<hex> -> proof-of-possession: sign a FRESH nonce with the leaf
//                       private key so a verifier knows we hold the key now.
//
// By default we reuse the local `localhost` cert issued for the demo (single
// source of truth). Override the dir/domain with CERTZ_SITE_CERT_DIR /
// CERTZ_SITE_DOMAIN. NOTE: verify against http://localhost:3100 (not 127.0.0.1)
// so the hostname matches the certificate's SAN.
import { readFileSync } from "node:fs";
import path from "node:path";
import { pemToDer, signChallenge } from "@certz/sdk";
import { DEPLOYMENT } from "@/lib/certz/deployment";

export const runtime = "nodejs";

const CERT_DIR =
  process.env.CERTZ_SITE_CERT_DIR ??
  path.resolve(process.cwd(), "..", "demo-site", "certs");
const DOMAIN = process.env.CERTZ_SITE_DOMAIN ?? "localhost";

const CORS = {
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};

function pem(name: string): string {
  return readFileSync(path.join(CERT_DIR, name), "utf8");
}

function pemResponse(name: string): Response {
  return new Response(pem(name), {
    status: 200,
    headers: { "content-type": "application/x-pem-file", ...CORS },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;

  try {
    if (file === "certificate.pem") return pemResponse(`${DOMAIN}.pem`);
    if (file === "ca-root.pem") {
      return new Response(DEPLOYMENT.caRootPem.trim(), {
        status: 200,
        headers: { "content-type": "application/x-pem-file", ...CORS },
      });
    }

    if (file === "sign") {
      const nonceHex = (new URL(req.url).searchParams.get("nonce") ?? "").replace(/^0x/, "");
      if (!/^[0-9a-fA-F]{16,128}$/.test(nonceHex)) {
        return Response.json({ error: "nonce must be 8-64 hex bytes" }, { status: 400, headers: CORS });
      }
      const nonce = Uint8Array.from(nonceHex.match(/../g)!.map((h) => parseInt(h, 16)));
      const leafPrivateKey = pemToDer(pem(`${DOMAIN}.key.pem`));
      const sig = signChallenge(leafPrivateKey, nonce);
      const signature = [...sig.compact].map((b) => b.toString(16).padStart(2, "0")).join("");
      return Response.json(
        { domain: DOMAIN, nonce: nonceHex, alg: "ecdsa-p256-sha256", signature },
        { headers: CORS },
      );
    }

    return Response.json({ error: "not found" }, { status: 404, headers: CORS });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "well-known read failed";
    return Response.json({ error: msg }, { status: 500, headers: CORS });
  }
}

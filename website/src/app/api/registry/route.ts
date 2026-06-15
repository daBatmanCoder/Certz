// GET /api/registry?digest=0x...   -> { isValid, record }
// GET /api/registry?domain=foo.com -> { digests: [...] }
//
// Read-only proxy for the public on-chain transparency registry. Proxied through
// the server so the browser doesn't depend on the RPC allowing cross-origin reads.
import { NextResponse } from "next/server";
import { registryRead } from "@/lib/certz/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const digest = url.searchParams.get("digest");
    const domain = url.searchParams.get("domain");
    const registry = registryRead();

    if (digest) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(digest)) {
        return NextResponse.json({ error: "digest must be 0x + 64 hex" }, { status: 400 });
      }
      const [isValid, record] = await Promise.all([
        registry.isValid(digest),
        registry.getRecord(digest),
      ]);
      return NextResponse.json({
        isValid,
        record: record.exists
          ? {
              domain: record.domain,
              issuedAt: Number(record.issuedAt),
              notAfter: Number(record.notAfter),
              revoked: record.revoked,
            }
          : null,
      });
    }

    if (domain) {
      const digests: string[] = await registry.digestsForDomain(domain);
      return NextResponse.json({ digests });
    }

    return NextResponse.json({ error: "provide ?digest= or ?domain=" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "registry read failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

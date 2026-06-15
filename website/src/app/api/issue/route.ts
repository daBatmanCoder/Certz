// POST /api/issue
// Fulfills a previously-requested certificate: checks DNS-01 ownership, then has
// the confidential CA sign the digest inside the TEE and anchor it on-chain.
//
// Honesty about the trust model:
//  - For a domain you actually control, we REQUIRE a matching DNS TXT record
//    (real DNS-01) before issuing.
//  - For demo placeholder domains (*.example etc.) there is no real DNS to check,
//    so we issue via the owner-only devFulfill path and label it as a demo.
//  - On-chain authorization is always devFulfill here because the production
//    fulfill() is gated to an attested ROFL TEE oracle, which isn't deployed in
//    this demo. The signing itself still happens inside the Sapphire enclave.
import { NextResponse } from "next/server";
import { Resolver } from "node:dns/promises";
import { caWithSigner, registryRead } from "@/lib/certz/server";
import { isDemoPlaceholderDomain } from "@/lib/certz/deployment";

export const runtime = "nodejs";

// DNS-01 lookup strategy (in order of trust / freshness):
//   1. The domain's own AUTHORITATIVE nameservers, queried directly. This is
//      cache-free and reflects the record the instant it's saved -- exactly how
//      Let's Encrypt validates. No propagation wait.
//   2. Public recursive resolvers (Cloudflare/Google/Quad9) + the system one,
//      as a fallback if we can't reach the authoritative servers.
// We accept the record if ANY source returns a matching value.
// Override the recursive set with CERTZ_DNS_SERVERS="1.1.1.1,8.8.8.8".
const PUBLIC_DNS = (process.env.CERTZ_DNS_SERVERS ?? "1.1.1.1,8.8.8.8,9.9.9.9")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function txtVia(servers: string[] | null, name: string): Promise<string[]> {
  try {
    const resolver = new Resolver({ timeout: 4000, tries: 1 });
    if (servers && servers.length) resolver.setServers(servers);
    const records = await resolver.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

// Find the IPs of the authoritative nameservers for `domain`, walking up labels
// (sub.foo.com -> foo.com) until an NS delegation is found.
async function authoritativeIps(domain: string): Promise<string[]> {
  const sys = new Resolver({ timeout: 4000, tries: 1 });
  const labels = domain.split(".").filter(Boolean);
  for (let i = 0; i <= Math.max(0, labels.length - 2); i++) {
    const zone = labels.slice(i).join(".");
    try {
      const hosts = await sys.resolveNs(zone);
      const ips: string[] = [];
      for (const h of hosts) {
        try {
          ips.push(...(await sys.resolve4(h)));
        } catch {}
      }
      if (ips.length) return [...new Set(ips)];
    } catch {
      // try the parent zone
    }
  }
  return [];
}

async function dnsMatches(domain: string, challenge: string): Promise<boolean> {
  const name = `_certz-challenge.${domain}`;
  const want = challenge.replace(/^0x/, "");
  const authIps = await authoritativeIps(domain);
  const attempts = [
    txtVia(authIps.length ? authIps : null, name), // authoritative (cache-free)
    txtVia(null, name), // system resolver
    ...PUBLIC_DNS.map((s) => txtVia([s], name)), // public recursive resolvers
  ];
  const flat = (await Promise.all(attempts)).flat();
  return flat.some((v) => v === challenge || v.replace(/^0x/, "") === want);
}

export async function POST(req: Request) {
  try {
    const { requestId } = await req.json();
    if (!/^0x[0-9a-fA-F]{64}$/.test(requestId ?? "")) {
      return NextResponse.json({ error: "requestId (0x + 64 hex) required" }, { status: 400 });
    }

    const ca = caWithSigner();
    const request = await ca.getRequest(requestId);
    if (!request.exists) {
      return NextResponse.json({ error: "unknown requestId" }, { status: 404 });
    }
    const domain: string = request.domain;
    const challenge: string = request.challenge;

    // DNS-01 ownership gate.
    const isDemo = isDemoPlaceholderDomain(domain);
    let dnsVerified = false;
    if (!isDemo) {
      dnsVerified = await dnsMatches(domain, challenge);
      if (!dnsVerified) {
        return NextResponse.json(
          {
            error:
              `DNS-01 not satisfied. Publish a TXT record at _certz-challenge.${domain} ` +
              `with value ${challenge}, wait for propagation, then try again.`,
          },
          { status: 412 },
        );
      }
    }

    // Fulfill (signs inside the TEE) unless already fulfilled.
    let txHash: string | undefined;
    if (!request.fulfilled) {
      const tx = await ca.devFulfill(requestId);
      const receipt = await tx.wait();
      txHash = receipt.hash;
    }

    const signatureDer: string = await ca.getSignature(requestId);

    // Read the anchored registry record.
    const registry = registryRead();
    const record = await registry.getRecord(request.tbsSha256);

    return NextResponse.json({
      domain,
      signatureDer,
      txHash,
      dnsVerified,
      demo: isDemo,
      record: {
        issuedAt: Number(record.issuedAt),
        notAfter: Number(record.notAfter),
        revoked: record.revoked,
        tbsSha256: request.tbsSha256,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "issuance failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

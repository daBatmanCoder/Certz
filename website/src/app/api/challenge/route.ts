// POST /api/challenge
// Submits a real requestCertificate(...) transaction to the ConfidentialCA on
// Sapphire testnet and returns the requestId + DNS-01 challenge nonce.
//
// The browser builds the TBSCertificate and keeps the private key; it only sends
// us the digest to anchor. We pay gas with the server key.
import { NextResponse } from "next/server";
import { caWithSigner } from "@/lib/certz/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { domain, tbsDigestHex, notAfter } = await req.json();
    if (typeof domain !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tbsDigestHex ?? "")) {
      return NextResponse.json({ error: "domain and tbsDigestHex (0x + 64 hex) required" }, { status: 400 });
    }
    if (!Number.isInteger(notAfter) || notAfter <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "notAfter must be a future unix timestamp" }, { status: 400 });
    }

    const ca = caWithSigner();
    const tx = await ca.requestCertificate(domain, tbsDigestHex, notAfter);
    const receipt = await tx.wait();

    let requestId: string | undefined;
    let challenge: string | undefined;
    for (const log of receipt.logs) {
      try {
        const ev = ca.interface.parseLog(log);
        if (ev?.name === "ChallengeRequested") {
          requestId = ev.args.requestId;
          challenge = ev.args.challenge;
        }
      } catch {}
    }
    if (!requestId || !challenge) {
      return NextResponse.json({ error: "ChallengeRequested event not found" }, { status: 502 });
    }

    return NextResponse.json({ requestId, challenge, txHash: receipt.hash });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "challenge request failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

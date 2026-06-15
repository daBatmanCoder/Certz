import type { CertzClient } from "./client";
import { MockCertzClient } from "./mockClient";
import { SapphireCertzClient } from "./sapphireClient";

export type { CertzClient } from "./client";
export * from "./types";

/*
 * Single entry point for the Certz data-layer.
 *
 * By default this is the REAL Sapphire-backed client: cryptography runs in the
 * browser via @certz/sdk, and on-chain ops go through the /api routes. The mock
 * remains available for fully-offline UI development behind an env flag:
 *
 *   NEXT_PUBLIC_CERTZ_BACKEND=mock   -> in-browser simulation (no chain)
 *   (unset / anything else)          -> real Sapphire testnet
 */
let singleton: CertzClient | null = null;

export function getCertzClient(): CertzClient {
  if (!singleton) {
    singleton =
      process.env.NEXT_PUBLIC_CERTZ_BACKEND === "mock"
        ? new MockCertzClient()
        : new SapphireCertzClient();
  }
  return singleton;
}

/** True when the active client is a local simulation rather than real chain. */
export function isMockBackend(client: CertzClient): boolean {
  return client.backend === "mock";
}

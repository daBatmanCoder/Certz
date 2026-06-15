import type { Metadata } from "next";
import { VerifyPanel } from "./verify-panel";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Verify a certificate",
  description:
    "Out-of-band verification of a presented certificate against the Certz CA root and on-chain transparency registry.",
};

export default function VerifyPage() {
  return (
    <Container className="py-14 sm:py-20">
      <VerifyPanel />
    </Container>
  );
}

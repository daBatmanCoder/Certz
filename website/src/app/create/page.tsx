import type { Metadata } from "next";
import { CreateWizard } from "./create-wizard";
import { Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Create a certificate",
  description:
    "Run the Certz issuance flow: prove domain ownership with DNS-01 and receive an X.509 certificate anchored in the on-chain registry.",
};

export default function CreatePage() {
  return (
    <Container className="py-14 sm:py-20">
      <CreateWizard />
    </Container>
  );
}

import type { Metadata } from "next";
import { Badge, Container } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy for the Certz website and Certz Verifier browser extension.",
};

const sections: { title: string; body: React.ReactNode }[] = [
  {
    title: "Overview",
    body: (
      <>
        <p>
          Certz is a research proof of concept for a confidential, on-chain
          certificate authority on Oasis Sapphire testnet. This policy describes
          how the Certz website and the Certz Verifier browser extension handle
          information.
        </p>
        <p className="mt-3">
          We do not sell personal data. We do not run advertising trackers on the
          Certz website. The extension performs verification locally in your
          browser when you open it.
        </p>
      </>
    ),
  },
  {
    title: "Certz website",
    body: (
      <>
        <p>When you use certz.app (or a deployed mirror of this site):</p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <span className="text-foreground">Certificate creation.</span> Your
            leaf private key is generated in your browser and is not sent to our
            servers. We receive only the domain name, a certificate digest
            (hash), and expiry you submit for on-chain issuance.
          </li>
          <li>
            <span className="text-foreground">DNS-01 verification.</span> Our
            server checks public DNS TXT records at{" "}
            <code className="text-muted-strong">_certz-challenge.&lt;domain&gt;</code>{" "}
            to confirm domain control before issuing a certificate.
          </li>
          <li>
            <span className="text-foreground">Blockchain transactions.</span>{" "}
            Issuance requests are submitted to Oasis Sapphire testnet. Transaction
            data (domain, digests, addresses) is public on-chain by design.
          </li>
          <li>
            <span className="text-foreground">Server logs.</span> Our hosting
            provider (for example Vercel) may log standard HTTP metadata such as
            IP address, request path, and timestamps. We do not use those logs
            for advertising.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "Certz Verifier extension",
    body: (
      <>
        <p>
          The Certz Verifier Chrome extension checks whether the site in your
          active tab advertises a valid Certz certificate. It runs only when you
          open the extension popup.
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>
            <span className="text-foreground">Active tab URL.</span> The
            extension reads the hostname of your current tab to know which site to
            verify. It does not browse your history or monitor tabs in the
            background.
          </li>
          <li>
            <span className="text-foreground">Site requests.</span> From your
            browser, it fetches{" "}
            <code className="text-muted-strong">
              /.well-known/certz/certificate.pem
            </code>{" "}
            and{" "}
            <code className="text-muted-strong">/.well-known/certz/sign</code>{" "}
            on that site&apos;s origin. Those requests go directly to the site
            you are visiting, not through Certz servers.
          </li>
          <li>
            <span className="text-foreground">On-chain lookup.</span> The
            extension calls the public Oasis Sapphire testnet RPC endpoint to
            read the Certz registry contract. Only certificate digests and
            contract state are queried — no account or wallet data from you is
            sent.
          </li>
          <li>
            <span className="text-foreground">No remote code.</span> Verification
            logic and the pinned CA root are bundled inside the extension. The
            extension does not load executable code from third-party servers.
          </li>
          <li>
            <span className="text-foreground">No analytics.</span> The extension
            does not include analytics SDKs and does not report verification
            results to Certz.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "What we do not collect",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>Browser history or browsing activity outside the active tab</li>
        <li>Leaf private keys generated during certificate creation</li>
        <li>Payment or billing information (Certz is a free research demo)</li>
        <li>Advertising profiles or cross-site tracking identifiers</li>
      </ul>
    ),
  },
  {
    title: "Third-party services",
    body: (
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <span className="text-foreground">Oasis Sapphire testnet</span> — public
          blockchain RPC and smart contracts
        </li>
        <li>
          <span className="text-foreground">Hosting providers</span> — website
          deployment and CDN (for example Vercel)
        </li>
        <li>
          <span className="text-foreground">Google Chrome Web Store</span> — if
          you install the extension from the store, Google&apos;s policies apply
          to that distribution channel
        </li>
      </ul>
    ),
  },
  {
    title: "Data retention",
    body: (
      <p>
        On-chain registry records are permanent and public by design. Website
        server logs are retained only as long as our hosting provider keeps them.
        The extension stores no persistent user profile on Certz infrastructure.
      </p>
    ),
  },
  {
    title: "Children",
    body: (
      <p>
        Certz is not directed at children under 13. We do not knowingly collect
        personal information from children.
      </p>
    ),
  },
  {
    title: "Changes",
    body: (
      <p>
        We may update this policy as the project evolves. The &ldquo;Last
        updated&rdquo; date below will change when we do. Continued use of the
        website or extension after an update means you accept the revised policy.
      </p>
    ),
  },
  {
    title: "Contact",
    body: (
      <p>
        Questions about this policy can be raised on the{" "}
        <a
          href="https://github.com/daBatmanCoder/Certz/issues"
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent-strong hover:underline"
        >
          Certz GitHub repository
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <Container className="py-14 sm:py-20">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Privacy Policy
          </h1>
          <Badge>extension &amp; website</Badge>
        </div>
        <p className="text-sm text-muted">Last updated: June 25, 2026</p>
        <p className="mt-4 max-w-2xl text-muted">
          This page satisfies the Chrome Web Store privacy-policy requirement for
          the Certz Verifier extension and documents practices for the Certz
          website.
        </p>

        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent-strong">
                {section.title}
              </h2>
              <div className="mt-4 text-sm leading-relaxed text-muted">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}

import { Link } from 'react-router-dom';

export default function Overview() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Purroxy Documentation</h1>
      <p>
        Purroxy gives Claude Desktop secure access to websites behind your
        login. You add a site, tell Purroxy what you want done, and it saves
        that as a capability Claude can repeat on your behalf, without ever
        seeing your credentials.
      </p>

      <div className="not-prose grid gap-4 mt-8">
        <Link to="/docs/what-is-a-site" className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
          <div className="card-body p-5">
            <h3 className="font-semibold text-base-content mb-1">What is a Site?</h3>
            <p className="text-sm text-base-content/50">
              Understand what Purroxy Sites are, how they connect to Claude, and why they matter.
            </p>
          </div>
        </Link>
        <Link to="/docs/getting-started" className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
          <div className="card-body p-5">
            <h3 className="font-semibold text-base-content mb-1">Getting Started</h3>
            <p className="text-sm text-base-content/50">
              Build your first Site in five minutes.
            </p>
          </div>
        </Link>
        <Link to="/docs/security" className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
          <div className="card-body p-5">
            <h3 className="font-semibold text-base-content mb-1">Security</h3>
            <p className="text-sm text-base-content/50">
              How Purroxy keeps your credentials safe: by design, not by promise.
            </p>
          </div>
        </Link>
        <Link to="/docs/publishing" className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
          <div className="card-body p-5">
            <h3 className="font-semibold text-base-content mb-1">Publishing Sites</h3>
            <p className="text-sm text-base-content/50">
              Share what you built. Submit a Site to the public library and unlock free access.
            </p>
          </div>
        </Link>
        <Link to="/docs/pricing" className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
          <div className="card-body p-5">
            <h3 className="font-semibold text-base-content mb-1">Pricing &amp; Contributor Program</h3>
            <p className="text-sm text-base-content/50">
              Free trial, simple monthly plan, and how to get Purroxy free forever.
            </p>
          </div>
        </Link>
      </div>
    </article>
  );
}

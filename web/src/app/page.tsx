import DownloadButton from './DownloadButton';

export default function Home() {
  return (
    <main className="min-h-screen bg-base-100">
      {/* Nav */}
      <nav className="navbar max-w-5xl mx-auto px-6">
        <div className="flex-1 flex items-center gap-1.5">
          <img src="/icon-192.png" alt="Purroxy" className="w-5 h-5 rounded" />
          <span className="font-bold text-base-content text-sm">Purroxy</span>
        </div>
        <div className="flex gap-4 text-sm">
          <a href="https://docs.purroxy.com" className="link link-hover text-base-content/60 hover:text-base-content">Docs</a>
          <a href="/marketplace" className="link link-hover text-base-content/60 hover:text-base-content">Library</a>
          <a href="#pricing" className="link link-hover text-base-content/60 hover:text-base-content">Pricing</a>
        </div>
      </nav>

      {/* Hero */}
      <section id="download" className="max-w-4xl mx-auto px-6 py-20 text-center">
        <img src="/icon-192.png" alt="Purroxy" className="w-24 h-24 rounded-2xl mx-auto mb-8" />
        <h1 className="text-4xl font-bold tracking-tight text-base-content mb-4">
          Give Claude secure access<br />to your accounts.
        </h1>
        <p className="text-base-content/60 text-lg mb-6 max-w-xl mx-auto">
          Purroxy lets Claude act on websites that require your login:
          email, banking, insurance, domains. Your credentials
          never leave your machine.
        </p>
        <DownloadButton />
      </section>

      {/* How it works */}
      <section className="bg-base-200 py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-12 text-base-content">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-10">
            <div className="text-center">
              <div className="text-3xl mb-4">1</div>
              <h3 className="font-semibold text-base-content mb-2">Log in once, securely</h3>
              <p className="text-sm text-base-content/60">Enter a URL: your email, bank, insurance portal. You log in through a secure embedded browser. Credentials never touch any AI.</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-4">2</div>
              <h3 className="font-semibold text-base-content mb-2">Teach Claude what to do</h3>
              <p className="text-sm text-base-content/60">Purroxy walks through the site with AI and builds a capability like "check my claims", "read my latest emails", or "renew my domains."</p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-4">3</div>
              <h3 className="font-semibold text-base-content mb-2">Ask Claude, it acts as you</h3>
              <p className="text-sm text-base-content/60">"Check my Aetna claim status." Claude uses your secure local session to get the data. Your password is never stored or shared.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-6 text-base-content">Security is architecture, not policy</h2>
          <p className="text-center text-sm text-base-content/60 mb-8 max-w-2xl mx-auto">
            Other tools tell their AI "don't leak the password." Purroxy removes the password
            from the data before the AI ever sees it. The difference matters.
          </p>
          <div className="grid md:grid-cols-3 gap-3">
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4">
                <h3 className="font-semibold text-base-content text-sm">Zero-knowledge login</h3>
                <p className="text-xs text-base-content/60 mt-1">You log in through the real website. Purroxy never sees your password, only the session cookies.</p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4">
                <h3 className="font-semibold text-base-content text-sm">Encrypted vault</h3>
                <p className="text-xs text-base-content/60 mt-1">Credit cards, account numbers, and other sensitive data stored in your OS keychain. Typed into forms by Purroxy, never sent to Claude.</p>
              </div>
            </div>
            <div className="card bg-base-100 border border-base-300">
              <div className="card-body p-4">
                <h3 className="font-semibold text-base-content text-sm">Data scrubbing</h3>
                <p className="text-xs text-base-content/60 mt-1">Vault values are removed from page content before Claude sees it. Not filtered by a prompt. Absent from the API call entirely.</p>
              </div>
            </div>
          </div>
          <p className="text-center mt-4">
            <a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer" className="text-xs link link-primary">Full security documentation</a>
          </p>
        </div>
      </section>

      {/* MCP */}
      <section className="bg-base-200 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-4 text-base-content">Automate your accounts with complete safety</h2>
          <p className="text-base-content/60 mb-8 max-w-2xl mx-auto">
            Purroxy securely bridges your logged-in sessions to Claude Desktop.
            Your credentials never touch any AI. They stay encrypted on your machine.
          </p>
          <div className="mockup-code text-left max-w-lg mx-auto">
            <pre className="pl-6 text-base-content/60"><code>// Claude checks your insurance claim for you</code></pre>
            <pre className="pl-6"><code>{'{'}</code></pre>
            <pre className="pl-6"><code>  &quot;name&quot;: &quot;checkMyClaim&quot;,</code></pre>
            <pre className="pl-6"><code>  &quot;inputs&quot;: {'{'}</code></pre>
            <pre className="pl-6"><code>    &quot;claim_number&quot;: &quot;CLM-2026-4821&quot;</code></pre>
            <pre className="pl-6"><code>  {'}'}</code></pre>
            <pre className="pl-6"><code>{'}'}</code></pre>
          </div>

          {/* Testimonial */}
          <div className="max-w-lg mx-auto mt-10">
            <blockquote className="text-sm text-base-content/60 italic leading-relaxed">
              &ldquo;I was doing 30-40 DMV lookups a day by hand, copy-pasting plate numbers one at a time. Now my AI agent handles it. I just review the results.&rdquo;
            </blockquote>
            <p className="text-xs text-base-content/50 mt-3">
              Paul Garrity, Underwriter &middot; Garrity Insurance, Canton OH
            </p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-base-200 pt-0 pb-16">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-3 text-base-content">Pricing</h2>

          <div className="card bg-base-100 border border-base-300 shadow-sm">
            <div className="card-body p-8 text-center space-y-4">
              <p className="text-4xl font-bold text-base-content">$3.89<span className="text-base font-normal text-base-content/40"> / month</span></p>
              <p className="text-sm text-base-content/60">
                7-day free trial. Everything included. Cancel anytime.
              </p>
              <a href="#download" className="btn btn-primary">Download Free</a>

              <div className="divider text-xs text-base-content/30">or</div>

              <div className="bg-success/10 border border-success/20 rounded-lg px-4 py-3">
                <p className="text-sm font-medium text-success">Contribute a site, use Purroxy free forever</p>
                <p className="text-xs text-base-content/50 mt-1">
                  Build a site for the public library. Once approved, your subscription stops
                  and you keep full access permanently.
                </p>
                <a href="https://docs.purroxy.com/publishing" target="_blank" rel="noopener noreferrer" className="btn btn-success btn-outline btn-xs mt-2">Learn how</a>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-base-content/40 mt-6">
            All plans include OS keychain encryption, zero-knowledge credential handling, and full <a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer" className="link link-hover text-primary">security guarantees</a>.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer border-t border-base-300 py-8">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Purroxy" className="w-5 h-5 rounded" />
            <p className="text-sm text-base-content/50">Purroxy</p>
          </div>
          <div className="flex gap-4 text-sm text-base-content/50">
            <a href="https://docs.purroxy.com" className="link link-hover hover:text-base-content">Docs</a>
            <a href="/marketplace" className="link link-hover hover:text-base-content">Library</a>
            <a href="/creator" className="link link-hover hover:text-base-content">Creators</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

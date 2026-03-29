export default function GettingStarted() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Getting Started</h1>
      <p className="lead">
        Build your first Purroxy Site in about five minutes.
        All you need is a website URL and a goal.
      </p>

      <h2>Download and launch Purroxy</h2>
      <p>
        Download Purroxy for your platform from the{' '}
        <a href="/#download">home page</a>. Open it and enter your{' '}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
          Anthropic API key
        </a>{' '}
        when prompted. This key is how Purroxy communicates with Claude
        to understand and navigate websites. It is encrypted and stored
        locally on your machine.
      </p>

      <h2>Add a site</h2>
      <p>
        Click <strong>+ Add Site</strong> on the home screen and enter the URL
        of the website you want to automate. Purroxy will load the site, read
        it, and suggest things you could automate, like "Check my claim status"
        or "Look up an order by number." Pick a suggestion or type your own goal.
      </p>
      <p>
        Be specific. "Look up order status by order number" works better
        than "do stuff with orders."
      </p>

      <h2>Log in when prompted</h2>
      <p>
        If the site requires authentication, Purroxy shows you the real website
        in an embedded browser. You log in directly, handle any CAPTCHAs or
        two-factor prompts, and click <strong>"I'm done, continue"</strong> when
        finished. Purroxy picks up where you left off.
      </p>
      <p>
        Your credentials never touch the AI. See{' '}
        <a href="/docs/security">Security</a> for details on how this works.
      </p>

      <h2>Build a capability</h2>
      <p>
        Purroxy navigates the site, asks you for any input it needs (a claim
        number, a search term), and presents the result as plain text in the
        chat. If the result looks right, click <strong>"Save this capability"</strong>.
        You can add more capabilities to the same site at any time.
      </p>

      <h2>Connect to Claude Desktop</h2>
      <p>
        Go to <strong>Settings &gt; Claude Desktop</strong> and click{' '}
        <strong>Install for Claude Desktop</strong>. Purroxy writes the MCP
        config for you. Restart Claude Desktop to pick up the connection.
        That's it. No manual config editing required.
      </p>

      <h2>Use it from Claude</h2>
      <p>
        Open Claude Desktop and ask for what you need in plain English:
      </p>
      <blockquote>
        "Check the status of claim #12345 on Aetna."
      </blockquote>
      <p>
        Claude calls your site, Purroxy logs in and fetches the data, and
        Claude shows you the answer. No browser required.
      </p>

      <div className="not-prose mt-12 flex flex-wrap gap-3">
        <a href="/docs/what-is-a-site" className="btn btn-ghost btn-sm">
          ← What is a Site?
        </a>
        <a href="/docs/security" className="btn btn-primary btn-sm">
          Security →
        </a>
        <a href="/docs/publishing" className="btn btn-ghost btn-sm">
          Publishing Sites →
        </a>
      </div>
    </article>
  );
}

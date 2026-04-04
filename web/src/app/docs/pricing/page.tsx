export default function Pricing() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Pricing</h1>
      <p className="lead">
        Purroxy costs $3.89/month after a 7-day free trial. Contribute a site
        to the public library and use it free forever.
      </p>

      <h2>The plan</h2>
      <p>
        There is one plan. It includes everything: unlimited sites,
        capabilities, executions, and devices. Zero-knowledge credential
        security is always on.
      </p>
      <p>
        When you sign up, you get 7 days free with full access. After that,
        it is $3.89/month billed through Stripe. Cancel anytime from Settings.
      </p>

      <h2>Contributor program</h2>
      <p>
        Publish a site to the public library or improve an existing one. If
        your contribution is approved, your account is upgraded to Contributor
        and you never pay again. If you were already on the monthly plan,
        billing stops immediately.
      </p>
      <p>
        This applies to both new sites and improvements to existing ones.
        Adding capabilities to a site someone else started counts. The goal
        is a useful library, not gatekeeping.
      </p>

      <h2>FAQ</h2>

      <h3>What happens after the trial?</h3>
      <p>
        If you subscribe before the trial ends, your plan continues
        seamlessly. If you do not subscribe, capabilities stop running until
        you subscribe or contribute a site.
      </p>

      <h3>Can I cancel?</h3>
      <p>
        Yes, anytime. Go to Settings &gt; Account &gt; Manage subscription.
        There are no contracts or commitments.
      </p>

      <h3>How does the contributor program work?</h3>
      <p>
        Build a site in the desktop app, submit it to the public library, and
        wait for a review. Most reviews take 2 to 4 days. Once approved, your
        site goes live and your account is free forever. See{' '}
        <a href="/docs/publishing">Publishing Sites</a> for details.
      </p>

      <h3>What counts as an approvable contribution?</h3>
      <p>
        Any site that targets a real, publicly accessible website and provides
        at least one genuinely useful capability. It does not need to be
        perfect. Improving an existing site with new capabilities also counts.
        If it works and helps people, it qualifies.
      </p>

      <h3>If I pay while my submission is in review, do I get a refund?</h3>
      <p>
        No. Contributor status stops future billing the moment your site is
        approved, but we do not refund charges that already went through.
        The monthly cost is $3.89 and reviews take 2 to 4 days, so the
        overlap is small. Think of it this way: free lifetime access is a
        genuinely generous thank-you for contributing. We just ask that the
        modest fee that keeps things running stays as-is.
      </p>

      <h3>Can I export my data?</h3>
      <p>
        Yes. Go to Settings &gt; Account and click <strong>Export backup</strong>.
        This creates a zip file containing all your site definitions and
        capability configurations. Sensitive data (credentials, session
        cookies, vault entries) are not included in the export. You can share
        this backup or use it to restore your sites on another machine.
      </p>

      <div className="not-prose mt-8 flex gap-3">
        <a href="/docs/publishing" className="btn btn-ghost btn-sm">
          Publishing Sites
        </a>
        <a href="/docs/security" className="btn btn-ghost btn-sm">
          Security
        </a>
        <a href="/docs/getting-started" className="btn btn-ghost btn-sm">
          Getting Started
        </a>
      </div>
    </article>
  );
}

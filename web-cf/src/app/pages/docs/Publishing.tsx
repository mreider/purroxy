import { Link } from 'react-router-dom';

export default function Publishing() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>Publishing Sites</h1>
      <p className="lead">
        The public library is community-built. Anyone can contribute a site,
        and anyone can improve an existing one. If your contribution is
        approved, you get free Purroxy access forever.
      </p>

      <h2>Sites belong to everyone</h2>
      <p>
        Published sites are not owned by any single person. They belong to
        the community. If someone publishes a site for Yahoo Mail with two
        capabilities and you add three more, that counts as a contribution.
        You both get Contributor status. The goal is to make every site as
        useful as possible for everyone.
      </p>

      <h2>How to submit</h2>
      <ol>
        <li>
          <strong>Build your site</strong> with at least one capability.
          Follow the <Link to="/docs/getting-started">Getting Started</Link> guide
          if you haven't built one yet.
        </li>
        <li>
          <strong>Give it a clear name and description.</strong> These are
          visible in the public library. "Check order status by order number"
          is more helpful than "order stuff."
        </li>
        <li>
          <strong>Test each capability</strong> to confirm it works reliably.
        </li>
        <li>
          <strong>Click Submit to Library</strong> in the desktop app. Purroxy
          packages your site and sends it to the review queue.
        </li>
      </ol>

      <div className="not-prose alert alert-info alert-soft my-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          className="stroke-current shrink-0 w-5 h-5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p className="text-sm font-medium">What gets submitted?</p>
          <p className="text-xs mt-1">
            Only metadata: name, description, capabilities, and automation
            steps. <strong>Credentials and session cookies are never
            included.</strong> Your login stays on your machine.
          </p>
        </div>
      </div>

      <h2>What we look for</h2>
      <p>
        Reviews are not meant to be gatekeeping. We want to keep the library
        high-quality and useful. Here is what we check:
      </p>
      <ul>
        <li>The site targets a real, publicly accessible website</li>
        <li>Capabilities work as described</li>
        <li>The site provides value that requires Purroxy (if Claude can already access the data without logging in, Purroxy does not add anything)</li>
        <li>It is not a duplicate of something already in the library (if a similar site exists, improve it instead)</li>
        <li>Names and descriptions are clear and helpful</li>
      </ul>
      <p>
        If something needs work, we will let you know what to change. Most
        submissions are approved. Reviews typically take 2 to 4 days.
      </p>

      <h2>Improving existing sites</h2>
      <p>
        You do not need to start from scratch. If a site already exists in
        the library but is missing capabilities you want, add them and
        resubmit. Improvements count the same as new sites for Contributor
        status. The more useful the library is, the better it is for everyone.
      </p>

      <h2>After approval</h2>
      <ul>
        <li>Your site goes live in the public library</li>
        <li>
          Your account is upgraded to <strong>Contributor</strong> (free
          forever). If you had a paid subscription, billing stops immediately.
        </li>
        <li>
          A public record is created on{' '}
          <a
            href="https://github.com/mreider/purroxy-sites"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>{' '}
          for transparency
        </li>
      </ul>

      <h2>Or submit via GitHub PR</h2>
      <p>
        If you prefer working with Git, open a pull request on the{' '}
        <a
          href="https://github.com/mreider/purroxy-sites"
          target="_blank"
          rel="noopener noreferrer"
        >
          mreider/purroxy-sites
        </a>{' '}
        repository. Link your GitHub username in your Purroxy account settings
        so we can match the PR to your account. The same contributor upgrade
        applies when merged.
      </p>

      <h2>Tips</h2>
      <ul>
        <li>
          <strong>Pick a popular site.</strong> Well-known services (insurance
          portals, government sites, CRMs) help more people.
        </li>
        <li>
          <strong>Add multiple capabilities.</strong> A site with 3 to 5
          capabilities is more valuable than one with a single action.
        </li>
        <li>
          <strong>Browse first.</strong> Check the library before submitting.
          If a similar site exists, enhance it rather than duplicating it.
        </li>
      </ul>

      <div className="not-prose mt-8 flex gap-3">
        <Link to="/docs/getting-started" className="btn btn-ghost btn-sm">
          Getting Started
        </Link>
        <Link to="/docs/security" className="btn btn-ghost btn-sm">
          Security
        </Link>
        <Link to="/docs/pricing" className="btn btn-primary btn-sm">
          Pricing
        </Link>
      </div>
    </article>
  );
}

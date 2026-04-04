import { Link } from 'react-router-dom';

export default function WhatIsASite() {
  return (
    <article className="prose prose-neutral max-w-none">
      <h1>What is a Purroxy Site?</h1>

      <p className="lead">
        Purroxy is a single connector you add to Claude Desktop.
        Once installed, it lets Claude interact with websites that require
        your login. Check a claim status, renew a domain, pull a report
        from your CRM. Your credentials never leave your machine.
      </p>

      <h2>One install, many Sites</h2>
      <p>
        You install Purroxy once. Then you build <strong>Sites</strong>.
        A Site is one website you have given Claude access to. Each Site
        can have multiple <strong>Capabilities</strong>, where each
        Capability is one specific thing Claude can do on that website on
        your behalf: checking an order status, downloading a statement,
        reading recent notifications.
      </p>
      <p>
        Claude can already search the open web. What it cannot do is act
        as <em>you</em> on sites that need your password. Sites solve that.
      </p>

      <h2>How it works</h2>
      <p>
        Purroxy uses <strong>MCP</strong> (Model Context Protocol), an open
        standard that lets AI assistants talk to local tools. Purroxy runs
        as a small program on your computer. Claude Desktop talks to it
        over a local connection, never over the internet. When Claude
        needs to use one of your Sites, Purroxy handles the website
        interaction and returns just the data Claude asked for.
      </p>
      <p>
        Sensitive data like passwords and tokens are stored in a local
        vault on your machine, encrypted at rest. They are injected into
        website requests at runtime but are never sent to Claude or any
        remote server.
      </p>

      <h2>Building a Site</h2>
      <p>You build Capabilities one at a time through a chat with Purroxy:</p>
      <ol>
        <li>Enter the website URL</li>
        <li>Purroxy explores the site and suggests what you could automate</li>
        <li>Pick a goal or type your own</li>
        <li>Purroxy navigates, asks you to log in when needed, and captures the result</li>
        <li>Confirm, and that Capability is saved to your Site</li>
      </ol>
      <p>
        Come back and add more Capabilities any time. Sites can also be
        shared: publish yours to the public library and anyone with an
        account on that website can use it.
      </p>

      <div className="not-prose mt-12 flex flex-wrap gap-3">
        <Link to="/docs/getting-started" className="btn btn-primary btn-sm">
          Build your first Site
        </Link>
        <Link to="/docs/security" className="btn btn-outline btn-sm">
          Security model
        </Link>
        <Link to="/docs/publishing" className="btn btn-outline btn-sm">
          Publishing a Site
        </Link>
      </div>
    </article>
  );
}

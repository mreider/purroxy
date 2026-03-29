---
layout: default
title: Getting Started
nav_order: 3
---

# Getting Started

Build your first Purroxy Site in about five minutes. All you need is a website URL and a goal.

## Download and launch Purroxy

Download Purroxy for your platform from [purroxy.com](https://purroxy.com). Open it and enter your [Anthropic API key](https://console.anthropic.com/settings/keys) when prompted. This key is how Purroxy communicates with Claude to understand and navigate websites. It is encrypted and stored locally on your machine.

## Add a site

Click **+ Add Site** and enter the URL of the website you want to automate. Purroxy will load the site, read it, and suggest things you could automate, like "Check my claim status" or "Look up an order by number." Pick a suggestion or type your own goal.

Be specific. "Look up order status by order number" works better than "do stuff with orders."

## Log in when prompted

If the site requires authentication, Purroxy shows you the real website in an embedded browser. You log in directly, handle any CAPTCHAs or two-factor prompts, and click **Done** when finished. Purroxy picks up where you left off.

Your credentials never touch the AI. See [Security]({% link security.md %}) for details on how this works.

## Build a capability

Purroxy navigates the site, asks you for any input it needs (a claim number, a search term), and presents the result in the chat. If the result looks right, click **Save this capability**. You can add more capabilities to the same site at any time.

## Install for Claude Desktop

Your site appears in the **My Sites** list. Click **Setup Claude**, then **Install**. Purroxy writes the config for you. Restart Claude Desktop and you are connected.

## Use it from Claude

Open Claude Desktop and ask for what you need in plain English:

> "Check the status of claim #12345 on Aetna."

Claude calls your site, Purroxy logs in and fetches the data, and Claude shows you the answer. No browser required.

---

[What is a Site?]({% link what-is-a-site.md %}){: .btn .mr-2 }
[Security]({% link security.md %}){: .btn .btn-primary .mr-2 }
[Publishing Sites]({% link publishing.md %}){: .btn .mr-2 }

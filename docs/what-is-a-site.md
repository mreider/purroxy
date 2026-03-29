---
layout: default
title: What is a Site?
nav_order: 2
---

# What is a Purroxy Site?

Purroxy is a single connector you add to Claude Desktop. Once installed, it lets Claude interact with websites that require your login. Check a claim status, renew a domain, pull a report from your CRM. Your credentials never leave your machine.

## One install, many Sites

You install Purroxy once. Then you build **Sites**. A Site is one website you have given Claude access to. Each Site can have multiple **Capabilities**, where each Capability is one specific thing Claude can do on that website on your behalf: checking an order status, downloading a statement, reading recent notifications.

Claude can already search the open web. What it cannot do is act as *you* on sites that need your password. Sites solve that.

## How it works

Purroxy uses **MCP** (Model Context Protocol), an open standard that lets AI assistants talk to local tools. Purroxy runs as a small program on your computer. Claude Desktop talks to it over a local connection, never over the internet. When Claude needs to use one of your Sites, Purroxy handles the website interaction and returns just the data Claude asked for.

Sensitive data like passwords and tokens are stored in a local vault on your machine, encrypted at rest. They are injected into website requests at runtime but are never sent to Claude or any remote server.

## Building a Site

You build Capabilities one at a time through a chat with Purroxy:

1. Enter the website URL
2. Purroxy explores the site and suggests what you could automate
3. Pick a goal or type your own
4. Purroxy navigates, asks you to log in when needed, and captures the result
5. Confirm, and that Capability is saved to your Site

Come back and add more Capabilities any time. Sites can also be shared: publish yours to the public library and anyone with an account on that website can use it.

---

[Build your first Site]({% link getting-started.md %}){: .btn .btn-primary .mr-2 }
[Security model]({% link security.md %}){: .btn .mr-2 }
[Publishing a Site]({% link publishing.md %}){: .btn .mr-2 }

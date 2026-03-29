export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-base-100">
      {/* Docs nav */}
      <nav className="navbar border-b border-base-300">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Purroxy" className="w-6 h-6 rounded" />
              <span className="font-bold text-base-content text-sm">Purroxy</span>
            </a>
            <span className="text-base-content/40">/</span>
            <span className="text-sm text-base-content/60">Documentation</span>
          </div>
          <div className="flex gap-4 text-sm text-base-content/50">
            <a href="/marketplace" className="link link-hover hover:text-base-content">Library</a>
            <a href="/#download" className="link link-hover hover:text-base-content">Download</a>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-base-200 py-8 pr-6 hidden md:block">
          <ul className="menu menu-sm">
            <li><a href="/docs">Overview</a></li>
            <li><a href="/docs/what-is-a-site">What is a Site?</a></li>
            <li><a href="/docs/getting-started">Getting Started</a></li>
            <li><a href="/docs/security">Security</a></li>
            <li><a href="/docs/publishing">Publishing Sites</a></li>
            <li><a href="/docs/pricing">Pricing &amp; Contributor Program</a></li>
          </ul>
        </aside>

        {/* Content */}
        <main className="flex-1 py-8 px-8 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

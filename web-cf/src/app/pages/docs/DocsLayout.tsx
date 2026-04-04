import { Link, Outlet } from 'react-router-dom';

export default function DocsLayout() {
  return (
    <div className="min-h-screen bg-base-100">
      {/* Docs nav */}
      <nav className="navbar border-b border-base-300">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <img src="/icon-192.png" alt="Purroxy" className="w-6 h-6 rounded" />
              <span className="font-bold text-base-content text-sm">Purroxy</span>
            </Link>
            <span className="text-base-content/40">/</span>
            <span className="text-sm text-base-content/60">Documentation</span>
          </div>
          <div className="flex gap-4 text-sm text-base-content/50">
            <Link to="/marketplace" className="link link-hover hover:text-base-content">Library</Link>
            <Link to="/#download" className="link link-hover hover:text-base-content">Download</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-base-200 py-8 pr-6 hidden md:block">
          <ul className="menu menu-sm">
            <li><Link to="/docs">Overview</Link></li>
            <li><Link to="/docs/what-is-a-site">What is a Site?</Link></li>
            <li><Link to="/docs/getting-started">Getting Started</Link></li>
            <li><Link to="/docs/security">Security</Link></li>
            <li><Link to="/docs/publishing">Publishing Sites</Link></li>
            <li><Link to="/docs/pricing">Pricing &amp; Contributor Program</Link></li>
          </ul>
        </aside>

        {/* Content */}
        <main className="flex-1 py-8 px-8 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

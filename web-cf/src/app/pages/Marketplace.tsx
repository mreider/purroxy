import { useState, useEffect } from 'react';

interface Site {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  site_url: string;
  capabilities: string | null;
  author: string | null;
  profile_id: string | null;
  download_count: number;
  average_rating: number | null;
  published_at: string | null;
}

interface PurroxyDesktop {
  isDesktop: boolean;
  installedProfiles: string[];
  install: (profileId: string, version: number) => void;
}

declare global {
  interface Window {
    purroxyDesktop?: PurroxyDesktop;
  }
}

export default function Marketplace() {
  const [sites, setSites] = useState<Site[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isDesktop, setIsDesktop] = useState(false);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkDesktop = () => {
      if (window.purroxyDesktop?.isDesktop) {
        setIsDesktop(true);
        setInstalledIds(new Set(window.purroxyDesktop.installedProfiles || []));
      }
    };
    checkDesktop();
    window.addEventListener('purroxy-desktop-ready', checkDesktop);
    window.addEventListener('purroxy-profile-installed', checkDesktop);
    return () => {
      window.removeEventListener('purroxy-desktop-ready', checkDesktop);
      window.removeEventListener('purroxy-profile-installed', checkDesktop);
    };
  }, []);

  useEffect(() => {
    fetchSites();
  }, [search]);

  const fetchSites = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);

    const res = await fetch(`/api/sites?${params}`);
    const data = (await res.json()) as { sites: Site[]; total: number };
    setSites(data.sites);
    setTotal(data.total);
    setLoading(false);
  };

  const handleInstall = (profileId: string) => {
    if (isDesktop) {
      window.location.href = `purroxy://install/${profileId}`;
    }
  };

  const parseCaps = (caps: string | null): string[] => {
    if (!caps) return [];
    try { return JSON.parse(caps); }
    catch { return []; }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">Public Library</h1>
        <p className="text-base-content/60 text-sm">
          Community-built sites. Install one and start automating in minutes.
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search sites..."
          className="input input-bordered w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Results count */}
      <p className="text-xs text-base-content/50 mb-4">
        {loading ? <span className="loading loading-spinner loading-xs"></span> : `${total} site${total !== 1 ? 's' : ''}`}
      </p>

      {/* Profile grid */}
      {!loading && sites.length === 0 && (
        <div className="text-center py-16 text-base-content/50">
          <p className="text-lg mb-1">No sites yet.</p>
          <p className="text-sm">Be the first to publish one.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sites.map((s) => {
          const caps = parseCaps(s.capabilities);
          return (
            <div key={s.id} className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
              <div className="card-body p-4 gap-3">
                <div>
                  <h3 className="font-semibold text-sm">{s.name}</h3>
                  <p className="text-xs text-base-content/50 font-mono">{s.site_url}</p>
                  {s.author && <p className="text-xs text-base-content/50 mt-0.5">by {s.author}</p>}
                </div>

                {s.description && (
                  <p className="text-xs text-base-content/60 line-clamp-2">{s.description}</p>
                )}

                {caps.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {caps.map((cap) => (
                      <span key={cap} className="badge badge-ghost badge-xs font-mono">
                        {cap}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-base-content/50 mt-auto pt-2 border-t border-base-200">
                  <span>{caps.length} capabilit{caps.length !== 1 ? 'ies' : 'y'}</span>
                  <span>{s.download_count} download{s.download_count !== 1 ? 's' : ''}</span>
                </div>

                {isDesktop && s.profile_id && (
                  <button
                    className={`btn btn-sm ${
                      installedIds.has(s.profile_id)
                        ? 'btn-ghost btn-disabled'
                        : 'btn-primary'
                    }`}
                    onClick={() => !installedIds.has(s.profile_id!) && handleInstall(s.profile_id!)}
                    disabled={installedIds.has(s.profile_id)}
                  >
                    {installedIds.has(s.profile_id) ? 'Installed' : 'Install'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

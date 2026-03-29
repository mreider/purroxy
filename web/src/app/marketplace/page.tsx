'use client';

import { useState, useEffect } from 'react';

interface Profile {
  id: string;
  name: string;
  description: string | null;
  site_name: string;
  site_base_url: string;
  category: string | null;
  tags: string | null;
  auth_type: string;
  endpoint_count: number;
  download_count: number;
  average_rating: number | null;
  creator_name: string | null;
  creator_email: string;
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

const AUTH_TYPE_LABELS: Record<string, string> = {
  session_cookie: 'Cookie',
  bearer_token: 'Bearer',
  oauth2_authorization_code: 'OAuth2',
  oauth2_implicit: 'OAuth2',
  api_key: 'API Key',
  custom: 'Custom',
};

export default function MarketplacePage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
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
    // Desktop injects purroxyDesktop after dom-ready, so listen for the signal
    window.addEventListener('purroxy-desktop-ready', checkDesktop);
    window.addEventListener('purroxy-profile-installed', checkDesktop);
    return () => {
      window.removeEventListener('purroxy-desktop-ready', checkDesktop);
      window.removeEventListener('purroxy-profile-installed', checkDesktop);
    };
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [search]);

  const fetchProfiles = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);

    const res = await fetch(`/api/profiles?${params}`);
    const data = await res.json();
    setProfiles(data.profiles);
    setTotal(data.total);
    setLoading(false);
  };

  const handleInstall = (profileId: string) => {
    if (isDesktop) {
      // Use custom protocol so the Electron webview can intercept it
      window.location.href = `purroxy://install/${profileId}`;
    }
  };

  const parseTags = (tags: string | null): string[] => {
    if (!tags) return [];
    try { return JSON.parse(tags); }
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
      {!loading && profiles.length === 0 && (
        <div className="text-center py-16 text-base-content/50">
          <p className="text-lg mb-1">No sites yet.</p>
          <p className="text-sm">Be the first to publish one.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {profiles.map((p) => (
          <div key={p.id} className="card bg-base-100 border border-base-300 hover:border-primary transition-colors">
            <div className="card-body p-4 gap-3">
              <div>
                <h3 className="font-semibold text-sm">{p.name}</h3>
                <p className="text-xs text-base-content/50 font-mono">{p.site_base_url}</p>
                <p className="text-xs text-base-content/50 mt-0.5">by {p.creator_name || p.creator_email?.split('@')[0] || 'Unknown'}</p>
              </div>

              {p.description && (
                <p className="text-xs text-base-content/60 line-clamp-2">{p.description}</p>
              )}

              <div className="flex flex-wrap gap-1">
                <span className="badge badge-primary badge-soft badge-xs font-mono">
                  {AUTH_TYPE_LABELS[p.auth_type] || p.auth_type}
                </span>
                {p.category && (
                  <span className="badge badge-ghost badge-xs font-mono">
                    {p.category}
                  </span>
                )}
                {parseTags(p.tags).map((tag) => (
                  <span key={tag} className="badge badge-ghost badge-xs font-mono">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-base-content/50 mt-auto pt-2 border-t border-base-200">
                <span>{p.endpoint_count} capabilit{p.endpoint_count !== 1 ? 'ies' : 'y'}</span>
                <span>{p.download_count} download{p.download_count !== 1 ? 's' : ''}</span>
              </div>

              {isDesktop && (
                <button
                  className={`btn btn-sm ${
                    installedIds.has(p.id)
                      ? 'btn-ghost btn-disabled'
                      : 'btn-primary'
                  }`}
                  onClick={() => !installedIds.has(p.id) && handleInstall(p.id)}
                  disabled={installedIds.has(p.id)}
                >
                  {installedIds.has(p.id) ? 'Installed' : 'Install'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

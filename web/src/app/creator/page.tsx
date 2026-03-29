'use client';

import { useState, useEffect } from 'react';

interface MyProfile {
  id: string;
  name: string;
  site_name: string;
  status: string;
  download_count: number;
  average_rating: number | null;
  endpoint_count: number;
  current_version: number;
  published_at: string | null;
}

export default function CreatorDashboard() {
  const [profiles, setProfiles] = useState<MyProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch creator's profiles (uses session cookie)
    fetch('/api/profiles?status=all&creator=me')
      .then((r) => r.json())
      .then((data) => {
        setProfiles(data.profiles || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  const totalDownloads = profiles.reduce((s, p) => s + p.download_count, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Creator Dashboard</h1>

      <div className="stats stats-vertical md:stats-horizontal border border-base-300 w-full mb-8">
        <div className="stat">
          <div className="stat-title">Published</div>
          <div className="stat-value">{profiles.filter((p) => p.status === 'approved').length}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Total Downloads</div>
          <div className="stat-value">{totalDownloads}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Pending Review</div>
          <div className="stat-value">{profiles.filter((p) => p.status === 'pending').length}</div>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-4">My Sites</h2>
      {profiles.length === 0 ? (
        <p className="text-sm text-base-content/50 py-8 text-center">No sites submitted yet.</p>
      ) : (
        <div className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="card bg-base-100 border border-base-300">
              <div className="card-body p-4 flex-row items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{p.name}</h3>
                  <p className="text-xs text-base-content/50">{p.site_name} - {p.endpoint_count} capabilit{p.endpoint_count !== 1 ? 'ies' : 'y'} - v{p.current_version}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-base-content/50">{p.download_count} downloads</span>
                  {p.average_rating != null && p.average_rating > 0 && (
                    <div className="rating rating-xs rating-half">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <input key={n} type="radio" className="mask mask-star-2 bg-warning" checked={Math.round(p.average_rating!) === n} readOnly />
                      ))}
                    </div>
                  )}
                  <span className={`badge badge-sm badge-soft ${
                    p.status === 'approved' ? 'badge-success'
                    : p.status === 'pending' ? 'badge-warning'
                    : 'badge-error'
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

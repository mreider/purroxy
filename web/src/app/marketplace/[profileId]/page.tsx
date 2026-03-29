'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';

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
  current_version: number;
  published_at: string | null;
}

interface Review {
  rating: number;
  review_text: string | null;
  created_at: string;
  display_name: string | null;
  email: string;
}

const AUTH_LABELS: Record<string, string> = {
  session_cookie: 'Cookie-based session',
  bearer_token: 'Bearer token',
  oauth2_authorization_code: 'OAuth2',
  api_key: 'API Key',
  custom: 'Custom auth',
};

export default function ProfileDetailPage() {
  const params = useParams();
  const profileId = params?.profileId as string;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profileId) return;
    Promise.all([
      fetch(`/api/profiles/${profileId}`).then((r) => r.json()),
      fetch(`/api/reviews?profileId=${profileId}`).then((r) => r.json()),
    ]).then(([profileData, reviewData]) => {
      setProfile(profileData.profile || null);
      setReviews(reviewData.reviews || []);
      setLoading(false);
    });
  }, [profileId]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="alert alert-warning alert-soft max-w-sm mx-auto">
          <span>Site not found.</span>
        </div>
      </div>
    );
  }

  const tags = (() => { try { return JSON.parse(profile.tags || '[]'); } catch { return []; } })();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">{profile.name}</h1>
        <p className="text-sm text-base-content/40 font-mono mb-2">{profile.site_base_url}</p>
        <p className="text-sm text-base-content/50">by {profile.creator_name || 'Unknown'}</p>
      </div>

      {profile.description && (
        <p className="text-base-content/60 mb-6">{profile.description}</p>
      )}

      <div className="stats stats-vertical md:stats-horizontal border border-base-300 w-full mb-8">
        <div className="stat">
          <div className="stat-title">Capabilities</div>
          <div className="stat-value text-lg">{profile.endpoint_count}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Downloads</div>
          <div className="stat-value text-lg">{profile.download_count}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Rating</div>
          <div className="stat-value text-lg">{profile.average_rating ? `${profile.average_rating}/5` : '--'}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Auth</div>
          <div className="stat-value text-sm">{AUTH_LABELS[profile.auth_type] || profile.auth_type}</div>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-6">
          {tags.map((tag: string) => (
            <span key={tag} className="badge badge-ghost badge-sm">{tag}</span>
          ))}
        </div>
      )}

      <div className="divider"></div>

      <h2 className="text-lg font-semibold mb-4">Reviews</h2>
      {reviews.length === 0 ? (
        <p className="text-sm text-base-content/40">No reviews yet.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r, i) => (
            <div key={i} className="card bg-base-100 border border-base-200">
              <div className="card-body p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">
                    {r.display_name || r.email?.split('@')[0] || 'Anonymous'}
                  </span>
                  <span className="text-xs text-base-content/40">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                </div>
                {r.review_text && <p className="text-sm text-base-content/60">{r.review_text}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-base-content/40 mt-8">
        Version {profile.current_version} {profile.published_at && `· Published ${new Date(profile.published_at).toLocaleDateString()}`}
      </div>
    </div>
  );
}

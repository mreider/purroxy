import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

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

interface Review {
  rating: number;
  review_text: string | null;
  created_at: string;
  display_name: string | null;
  email: string;
}

export default function MarketplaceDetail() {
  const { slug } = useParams<{ slug: string }>();

  const [site, setSite] = useState<Site | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      fetch(`/api/sites/${slug}`).then((r) => r.json()),
      fetch(`/api/reviews?profileId=${slug}`).then((r) => r.json()),
    ]).then(([siteData, reviewData]: [any, any]) => {
      setSite(siteData.site || null);
      setReviews(reviewData.reviews || []);
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  if (!site) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="alert alert-warning alert-soft max-w-sm mx-auto">
          <span>Site not found.</span>
        </div>
      </div>
    );
  }

  const caps: string[] = (() => { try { return JSON.parse(site.capabilities || '[]'); } catch { return []; } })();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">{site.name}</h1>
        <p className="text-sm text-base-content/40 font-mono mb-2">{site.site_url}</p>
        {site.author && <p className="text-sm text-base-content/50">by {site.author}</p>}
      </div>

      {site.description && (
        <p className="text-base-content/60 mb-6">{site.description}</p>
      )}

      <div className="stats stats-vertical md:stats-horizontal border border-base-300 w-full mb-8">
        <div className="stat">
          <div className="stat-title">Capabilities</div>
          <div className="stat-value text-lg">{caps.length}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Downloads</div>
          <div className="stat-value text-lg">{site.download_count}</div>
        </div>
        <div className="stat">
          <div className="stat-title">Rating</div>
          <div className="stat-value text-lg">{site.average_rating ? `${site.average_rating}/5` : '--'}</div>
        </div>
      </div>

      {caps.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-2">Capabilities</h2>
          <div className="flex flex-wrap gap-1">
            {caps.map((cap: string) => (
              <span key={cap} className="badge badge-ghost badge-sm">{cap}</span>
            ))}
          </div>
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
        {site.published_at && `Published ${new Date(site.published_at).toLocaleDateString()}`}
      </div>
    </div>
  );
}

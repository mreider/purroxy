'use client';

import { useState, useEffect } from 'react';

interface Submission {
  id: string;
  profile_id: string;
  version: number;
  status: string;
  validation_result: string | null;
  created_at: string;
  profile_name: string;
  profile_site: string;
  submitter_email: string;
}

export default function AdminPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubmissions = async () => {
    setLoading(true);
    const res = await fetch('/api/admin/submissions');
    const data = await res.json();
    setSubmissions(data.submissions || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleAction = async (submissionId: string, action: 'approve' | 'reject') => {
    const reason = action === 'reject' ? prompt('Rejection reason:') : undefined;
    if (action === 'reject' && !reason) return;

    await fetch(`/api/admin/submissions/${submissionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason }),
    });

    fetchSubmissions();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  const pending = submissions.filter((s) => s.status === 'pending');
  const reviewed = submissions.filter((s) => s.status !== 'pending');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Review Queue</h1>

      <h2 className="text-lg font-semibold mb-3">Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <p className="text-sm text-base-content/50 py-4">No submissions pending review.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {pending.map((s) => {
            const validation = s.validation_result ? JSON.parse(s.validation_result) : null;
            return (
              <div key={s.id} className="card bg-base-100 border border-base-300">
                <div className="card-body p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-semibold text-sm">{s.profile_name}</h3>
                      <p className="text-xs text-base-content/50">{s.profile_site} - v{s.version} - by {s.submitter_email}</p>
                      <p className="text-xs text-base-content/40">{new Date(s.created_at).toLocaleString()}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn btn-success btn-xs"
                        onClick={() => handleAction(s.id, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        className="btn btn-error btn-xs"
                        onClick={() => handleAction(s.id, 'reject')}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  {validation && !validation.valid && (
                    <div className="alert alert-error alert-soft text-xs mt-2">
                      <div>
                        <strong>Validation errors:</strong>
                        <ul className="list-disc ml-4 mt-1">
                          {validation.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2 className="text-lg font-semibold mb-3">Reviewed ({reviewed.length})</h2>
      <div className="space-y-2">
        {reviewed.map((s) => (
          <div key={s.id} className="card bg-base-100 border border-base-200">
            <div className="card-body p-3 flex-row items-center justify-between">
              <div>
                <span className="text-sm">{s.profile_name}</span>
                <span className="text-xs text-base-content/50 ml-2">by {s.submitter_email}</span>
              </div>
              <span className={`badge badge-sm ${
                s.status === 'approved' ? 'badge-success badge-soft' : 'badge-error badge-soft'
              }`}>
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

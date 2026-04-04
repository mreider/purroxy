import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100 px-4">
        <div className="alert alert-error alert-soft max-w-sm">
          <span className="text-sm">Invalid reset link. Request a new one from the app.</span>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
    } else {
      setDone(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 px-4">
      <div className="card bg-base-100 border border-base-300 max-w-sm w-full">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <img src="/icon-192.png" alt="Purroxy" className="w-8 h-8 rounded-lg" />
            <h2 className="card-title text-lg">New Password</h2>
          </div>

          {done ? (
            <>
              <div className="alert alert-success alert-soft">
                <span className="text-sm">Password updated. You can log in with your new password in the Purroxy app.</span>
              </div>
              <Link to="/" className="btn btn-ghost btn-sm mt-4">Back to Purroxy</Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-base-content/60">
                Choose a new password. Must be at least 8 characters with uppercase, lowercase, and a number.
              </p>
              <input
                type="password"
                placeholder="New password"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                minLength={8}
              />
              <input
                type="password"
                placeholder="Confirm password"
                className="input input-bordered w-full"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setError(''); }}
                required
              />
              {error && <p className="text-xs text-error">{error}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={loading || !password || !confirm}>
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Something went wrong.');
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 px-4">
      <div className="card bg-base-100 border border-base-300 max-w-sm w-full">
        <div className="card-body">
          <div className="flex items-center gap-2 mb-4">
            <img src="/icon-192.png" alt="Purroxy" className="w-8 h-8 rounded-lg" />
            <h2 className="card-title text-lg">Reset Password</h2>
          </div>

          {sent ? (
            <div className="alert alert-success alert-soft">
              <span className="text-sm">If an account exists with that email, a reset link has been sent. Check your inbox.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-base-content/60">
                Enter your email and we'll send you a link to reset your password.
              </p>
              <input
                type="email"
                placeholder="Email"
                className="input input-bordered w-full"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                required
              />
              {error && <p className="text-xs text-error">{error}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email.trim()}>
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Send Reset Link'}
              </button>
            </form>
          )}

          <div className="text-center mt-4">
            <a href="/" className="link link-hover text-xs text-base-content/60 hover:text-base-content">Back to Purroxy</a>
          </div>
        </div>
      </div>
    </div>
  );
}

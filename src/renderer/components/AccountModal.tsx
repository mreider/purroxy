import React, { useState, useEffect } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoggedIn: () => void;
}

const SERVER_URL = 'https://purroxy.com';

export default function AccountModal({ open, onClose, onLoggedIn }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'verify'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      window.purroxy.getLicenseKey().then(setLicenseKey);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);

    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body: any = { email: email.trim(), password };
      if (mode === 'signup' && displayName.trim()) {
        body.displayName = displayName.trim();
      }

      const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // Needs email verification
      if (data.needsVerification) {
        setEmail(data.email || email.trim());
        setMode('verify');
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setLoading(false);
        return;
      }

      // Save the license key locally
      if (data.user?.licenseKey) {
        await window.purroxy.setLicenseKey(data.user.licenseKey);
        setLicenseKey(data.user.licenseKey);
        onLoggedIn();
      }
    } catch (err: any) {
      setError(err.message || 'Could not reach the server.');
    }
    setLoading(false);
  };

  const handleResendVerification = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, resend: true }),
      });
      const data = await res.json();
      if (data.resentEmail) {
        setInfo('Verification email sent! Check your inbox.');
      } else {
        setError(data.error || 'Could not resend.');
      }
    } catch (err: any) {
      setError(err.message || 'Could not reach the server.');
    }
    setLoading(false);
  };

  const handleTryLogin = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.needsVerification) {
        setError('Email not verified yet. Check your inbox or resend below.');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
        setLoading(false);
        return;
      }
      if (data.user?.licenseKey) {
        await window.purroxy.setLicenseKey(data.user.licenseKey);
        setLicenseKey(data.user.licenseKey);
        onLoggedIn();
      }
    } catch (err: any) {
      setError(err.message || 'Could not reach the server.');
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    await window.purroxy.clearLockPin();
    await window.purroxy.setLicenseKey('');
    setLicenseKey(null);
    setEmail('');
    setPassword('');
    setMode('login');
  };

  return (
    <div className="modal modal-open" onClick={onClose}>
      <div className="modal-box max-w-sm space-y-4" onClick={(e) => e.stopPropagation()}>

        {licenseKey ? (
          <>
            <h3 className="font-semibold text-sm">Account</h3>
            <div className="bg-base-200 rounded-lg p-3">
              <div className="flex justify-between text-xs">
                <span className="text-base-content/60">License</span>
                <span className="font-mono text-base-content/70">{licenseKey}</span>
              </div>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Log Out</button>
              <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            </div>
          </>
        ) : mode === 'verify' ? (
          <>
            <div className="text-center space-y-3">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-primary">
                  <path d="M3 4a2 2 0 0 0-2 2v1.161l8.441 4.221a1.25 1.25 0 0 0 1.118 0L19 7.162V6a2 2 0 0 0-2-2H3Z" />
                  <path d="m19 8.839-7.77 3.885a2.75 2.75 0 0 1-2.46 0L1 8.839V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.839Z" />
                </svg>
              </div>
              <h3 className="font-semibold text-sm">Check your email</h3>
              <p className="text-xs text-base-content/60">
                We sent a verification link to <strong>{email}</strong>.
                Click the link, then come back here and log in.
              </p>
            </div>

            {error && <p className="text-xs text-error text-center">{error}</p>}
            {info && <p className="text-xs text-success text-center">{info}</p>}

            <button
              className="btn btn-primary btn-sm btn-block"
              onClick={handleTryLogin}
              disabled={loading}
            >
              {loading ? <span className="loading loading-spinner loading-xs"></span> : "I've verified, log me in"}
            </button>

            <button
              className="btn btn-ghost btn-xs btn-block text-base-content/50"
              onClick={handleResendVerification}
              disabled={loading}
            >
              Resend verification email
            </button>

            <button
              className="text-[10px] text-base-content/30 hover:text-base-content text-center block mx-auto"
              onClick={() => { setMode('login'); setError(''); setInfo(''); }}
            >
              Back to login
            </button>
          </>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                className={`text-sm font-medium pb-1 ${mode === 'login' ? 'border-b-2 border-primary text-base-content' : 'text-base-content/60'}`}
                onClick={() => { setMode('login'); setError(''); setInfo(''); }}
              >
                Log In
              </button>
              <button
                className={`text-sm font-medium pb-1 ${mode === 'signup' ? 'border-b-2 border-primary text-base-content' : 'text-base-content/60'}`}
                onClick={() => { setMode('signup'); setError(''); setInfo(''); }}
              >
                Sign Up
              </button>
            </div>

            <form className="space-y-3" onSubmit={handleSubmit}>
              {mode === 'signup' && (
                <input
                  type="text"
                  placeholder="Display name (optional)"
                  className="input input-sm w-full"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              )}
              <input
                type="email"
                placeholder="Email"
                className="input input-sm w-full"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                required
              />
              <input
                type="password"
                placeholder="Password"
                className="input input-sm w-full"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                minLength={8}
              />

              {mode === 'signup' && (
                <p className="text-[10px] text-base-content/50">
                  8+ characters, uppercase, lowercase, and a number.
                </p>
              )}

              {error && (
                <p className="text-xs text-error">{error}</p>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-sm btn-block"
                disabled={loading || !email.trim() || password.length < 8}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : mode === 'signup' ? 'Create Account' : 'Log In'}
              </button>
            </form>

            {mode === 'login' && (
              <button
                className="text-[10px] text-base-content/50 hover:text-base-content text-center block mx-auto"
                onClick={() => window.open('https://purroxy.com/forgot-password', '_blank')}
              >
                Forgot password?
              </button>
            )}

            <p className="text-[10px] text-base-content/50 text-center">
              7-day free trial, then $3.89/month. Publish a site to get free access forever.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

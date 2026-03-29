'use client';

import { useState, useEffect } from 'react';

const SERVER_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://purroxy.com';
const SPACES_URL = 'https://purroxy-releases.nyc3.digitaloceanspaces.com';

type Platform = 'mac' | 'win' | 'linux';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'win';
  if (ua.includes('linux')) return 'linux';
  return 'mac';
}

const platformLabels: Record<Platform, string> = {
  mac: 'macOS',
  win: 'Windows',
  linux: 'Linux',
};

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [platform, setPlatform] = useState<Platform>('mac');
  const [version, setVersion] = useState<{ version: string; dmg: string; exe: string; appimage: string } | null>(null);

  useEffect(() => {
    setPlatform(detectPlatform());
    fetch(`${SPACES_URL}/latest/version.json`)
      .then((r) => r.json())
      .then(setVersion)
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${SERVER_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok && !data.needsVerification) {
        setError(data.error || 'Something went wrong.');
        setLoading(false);
        return;
      }

      setDone(true);
    } catch (err: any) {
      setError(err.message || 'Could not reach the server.');
    }
    setLoading(false);
  };

  const downloads: Record<Platform, { file: string; label: string }> = version ? {
    mac: { file: version.dmg, label: 'Download for macOS' },
    win: { file: version.exe, label: 'Download for Windows' },
    linux: { file: version.appimage, label: 'Download for Linux' },
  } : {
    mac: { file: '', label: 'Download for macOS' },
    win: { file: '', label: 'Download for Windows' },
    linux: { file: '', label: 'Download for Linux' },
  };

  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <nav className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <img src="/icon-192.png" alt="Purroxy" className="w-7 h-7 rounded" />
          <span className="font-bold text-base-content text-sm">Purroxy</span>
        </a>
      </nav>

      <div className="max-w-sm mx-auto px-6 py-16">
        {!done ? (
          <>
            <h1 className="text-2xl font-bold text-center mb-2">Create your account</h1>
            <p className="text-sm text-base-content/60 text-center mb-8">
              Sign up to download Purroxy and start building.
            </p>

            <form className="space-y-3" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Display name (optional)"
                className="input input-bordered w-full"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <input
                type="email"
                placeholder="Email"
                className="input input-bordered w-full"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                required
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                className="input input-bordered w-full"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                required
                minLength={8}
              />
              <p className="text-[10px] text-base-content/40">
                8+ characters, uppercase, lowercase, and a number.
              </p>

              {error && <p className="text-xs text-error">{error}</p>}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading || !email.trim() || password.length < 8}
              >
                {loading ? <span className="loading loading-spinner loading-xs"></span> : 'Create Account'}
              </button>
            </form>

            <p className="text-[10px] text-base-content/40 text-center mt-4">
              7-day free trial, then $3.89/month. Publish a site to get free access forever.
            </p>

            <p className="text-xs text-base-content/50 text-center mt-6">
              Already have an account?{' '}
              <a href="/login" className="link link-primary">Log in</a> to download.
            </p>
          </>
        ) : (
          <>
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-success">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-xl font-bold">You're in!</h2>
              <p className="text-sm text-base-content/60">
                Check your email to verify your account, then download Purroxy.
              </p>
            </div>

            <div className="mt-8 space-y-3">
              {version && (
                <a
                  href={`${SPACES_URL}/latest/${downloads[platform].file}`}
                  className="btn btn-primary btn-block btn-lg"
                >
                  {downloads[platform].label}
                </a>
              )}
              <div className="flex justify-center gap-3 text-xs text-base-content/50">
                {(['mac', 'win', 'linux'] as Platform[]).filter((p) => p !== platform).map((p) => (
                  <a
                    key={p}
                    href={version ? `${SPACES_URL}/latest/${downloads[p].file}` : '#'}
                    className="link link-hover"
                  >
                    {platformLabels[p]}
                  </a>
                ))}
              </div>
            </div>

            <div className="mt-8 bg-base-200 rounded-lg p-4 space-y-2">
              <p className="text-xs font-semibold text-base-content/50">Next steps</p>
              <ol className="text-sm text-base-content/60 space-y-1 list-decimal list-inside">
                <li>Check your email and verify your account</li>
                <li>Install and open Purroxy</li>
                <li>Log in with <strong>{email}</strong></li>
                <li>Add your first site and start building</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

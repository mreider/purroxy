'use client';

import { useState, useEffect } from 'react';

export default function LaunchPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldown > 0 || !code.trim()) return;

    setChecking(true);
    setError(false);

    try {
      const res = await fetch('/api/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });

      if (res.ok) {
        window.location.href = '/';
      } else {
        setError(true);
        setCooldown(5);
        setCode('');
      }
    } catch {
      setError(true);
      setCooldown(5);
    }
    setChecking(false);
  };

  return (
    <div className="min-h-screen bg-base-100 flex items-center justify-center px-4">
      <div className="max-w-xs w-full text-center space-y-6">
        <img src="/icon-192.png" alt="Purroxy" className="w-16 h-16 rounded-2xl mx-auto" />
        <div>
          <h1 className="text-xl font-bold text-base-content">Purroxy</h1>
          <p className="text-sm text-base-content/50 mt-1">Pre-launch access</p>
        </div>

        <form className="space-y-3" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Enter launch code"
            className={`input input-bordered w-full text-center font-mono tracking-wider ${error ? 'input-error' : ''}`}
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(false); }}
            disabled={cooldown > 0}
            autoFocus
          />

          {error && cooldown > 0 && (
            <p className="text-sm text-error">
              Wrong code. Try again in {cooldown}s
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={checking || cooldown > 0 || !code.trim()}
          >
            {checking ? (
              <span className="loading loading-spinner loading-xs" />
            ) : cooldown > 0 ? (
              `${cooldown}s`
            ) : (
              'Continue'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import TopNav from './TopNav';
import Library from './Library';
import BuildChat from './BuildChat';
import Settings from './Settings';
import ApiKeySetup from './ApiKeySetup';
import './App.css';

function BuildRoute() {
  const navigate = useNavigate();
  return (
    <BuildChat
      onComplete={() => navigate('/')}
      onCancel={() => navigate('/')}
    />
  );
}

function EditBuildRoute() {
  const { profileId } = useParams<{ profileId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const capabilityId = searchParams.get('capability') || undefined;
  return (
    <BuildChat
      existingProfileId={profileId}
      editCapabilityId={capabilityId}
      onComplete={() => navigate('/')}
      onCancel={() => navigate('/')}
    />
  );
}

function InlineAuth({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body: any = { email: email.trim(), password };
      if (mode === 'signup' && displayName.trim()) body.displayName = displayName.trim();

      const res = await fetch(`https://purroxy.com${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (data.needsVerification) {
        setInfo(`We sent a verification email to ${email.trim()}. Click the link in the email, then log in here.`);
        setMode('login');
        setLoading(false);
        return;
      }
      if (!res.ok) { setError(data.error || 'Something went wrong.'); setLoading(false); return; }
      if (data.user?.licenseKey) {
        await window.purroxy.setLicenseKey(data.user.licenseKey);
        onLoggedIn();
      }
    } catch (err: any) { setError(err.message || 'Server unreachable.'); }
    setLoading(false);
  };

  return (
    <div className="max-w-sm w-full">
      <div className="card bg-base-100 border border-base-300 shadow-lg">
        <div className="card-body p-8">
          <div className="text-center mb-4">
            <img src="./icon-192.png" alt="Purroxy" className="w-14 h-14 rounded-xl mx-auto mb-3" />
            <h2 className="text-xl font-semibold text-base-content">
              {mode === 'signup' ? 'Get started with Purroxy' : 'Welcome back'}
            </h2>
            <p className="text-sm text-base-content/50 mt-1">
              {mode === 'signup' ? 'Create an account for your 7-day free trial.' : 'Log in to continue.'}
            </p>
          </div>

          <div role="tablist" className="tabs tabs-boxed tabs-sm mb-4">
            <button role="tab" className={`tab flex-1 ${mode === 'signup' ? 'tab-active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>Sign Up</button>
            <button role="tab" className={`tab flex-1 ${mode === 'login' ? 'tab-active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Log In</button>
          </div>

          {info && <div className="alert alert-info text-xs mb-3">{info}</div>}

          <form className="space-y-3" onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <label className="form-control w-full">
                <div className="label"><span className="label-text text-xs">Display name <span className="text-base-content/30">(optional)</span></span></div>
                <input type="text" className="input input-bordered w-full" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </label>
            )}
            <label className="form-control w-full">
              <div className="label"><span className="label-text text-xs">Email</span></div>
              <input type="email" className="input input-bordered w-full" required autoFocus value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }} />
            </label>
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text text-xs">Password</span>
                {mode === 'login' && (
                  <a href="https://purroxy.com/forgot-password" target="_blank" rel="noopener noreferrer"
                    className="label-text-alt link link-primary text-[11px]">Forgot?</a>
                )}
              </div>
              <input type="password" className="input input-bordered w-full" required minLength={8}
                value={password} onChange={(e) => { setPassword(e.target.value); setError(''); }} />
              {mode === 'signup' && (
                <div className="label"><span className="label-text-alt text-base-content/30">8+ characters, uppercase, lowercase, and a number.</span></div>
              )}
            </label>

            {error && <div className="alert alert-error alert-soft text-xs">{error}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loading || !email.trim() || password.length < 8}>
              {loading ? <span className="loading loading-spinner loading-xs" /> : mode === 'signup' ? 'Create Account' : 'Log In'}
            </button>
          </form>

          <p className="text-[10px] text-base-content/30 text-center mt-3">
            7-day free trial. $3.89/month after. Publish a site for free access forever.
          </p>
        </div>
      </div>
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    if (!pin) return;
    setLoading(true);
    setError('');
    const result = await window.purroxy.unlock(pin);
    if (result.success) {
      onUnlock();
    } else {
      setError(result.error || 'Wrong PIN.');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-base-100/95 z-50 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-xs">
        <img src="./icon-192.png" alt="Purroxy" className="w-16 h-16 rounded-xl mx-auto opacity-50" />
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-base-content">Purroxy is locked</h2>
          <p className="text-sm text-base-content/50">
            Enter your PIN to unlock and let Claude access your sites.
          </p>
        </div>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleUnlock(); }}>
          <input
            type="password"
            placeholder="PIN"
            className={`input input-bordered w-full font-mono text-center tracking-widest ${error ? 'input-error' : ''}`}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
            maxLength={8}
            autoFocus
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading || !pin}
          >
            {loading ? <span className="loading loading-spinner loading-xs" /> : 'Unlock'}
          </button>
        </form>
        <p className="text-[10px] text-base-content/30">
          Forgot your PIN? Log out from Account and log back in to reset it.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    window.purroxy.getLicenseKey().then((key) => setHasAccount(!!key));
    window.purroxy.getApiKey().then((key) => setHasApiKey(key !== null));
    window.purroxy.getLockStatus().then((s) => setLocked(s.locked));
    const unsub = window.purroxy.onLocked(() => setLocked(true));
    return unsub;
  }, []);

  // Still loading
  if (hasAccount === null || hasApiKey === null) {
    return (
      <div className="flex items-center justify-center h-screen bg-base-100">
        <span className="loading loading-spinner loading-md text-primary" />
      </div>
    );
  }

  // Not logged in — must sign up/log in first
  if (!hasAccount) {
    return (
      <div className="flex flex-col h-screen bg-base-100 text-base-content">
        <header className="flex items-center justify-center px-4 py-3 border-b border-base-300 shrink-0">
          <div className="flex items-center gap-2">
            <img src="./icon-192.png" alt="Purroxy" className="w-7 h-7 object-contain rounded" />
            <span className="text-sm font-semibold tracking-tight">Purroxy</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <InlineAuth onLoggedIn={() => setHasAccount(true)} />
        </main>
      </div>
    );
  }

  // No API key yet — must set up before using the app
  if (!hasApiKey) {
    return (
      <div className="flex flex-col h-screen bg-base-100 text-base-content">
        <header className="flex items-center justify-center px-4 py-3 border-b border-base-300 shrink-0">
          <div className="flex items-center gap-2">
            <img src="./icon-192.png" alt="Purroxy" className="w-7 h-7 object-contain rounded" />
            <span className="text-sm font-semibold tracking-tight">Purroxy</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <ApiKeySetup
            onApiKeySet={async (key) => { await window.purroxy.setApiKey(key); setHasApiKey(true); }}
            onReset={() => {}}
            done={false}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-base-100 text-base-content">
      <TopNav />

      <main className="flex-1 overflow-auto p-4 scrollbar-thin">
        <Routes>
          <Route path="/" element={<Library />} />
          <Route path="/build" element={<BuildRoute />} />
          <Route path="/build/:profileId" element={<EditBuildRoute />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      {/* Lock screen overlay */}
      {locked && <LockScreen onUnlock={() => setLocked(false)} />}
    </div>
  );
}

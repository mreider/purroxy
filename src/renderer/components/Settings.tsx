import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

type SettingsTab = 'account' | 'vault' | 'claude' | 'autolock';

export default function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<SettingsTab>('account');

  return (
    <div className="flex h-full -m-4">
      {/* Sidebar */}
      <div className="w-44 shrink-0 border-r border-base-300 bg-base-200/30 py-4 px-2 flex flex-col">
        <button
          className="btn btn-ghost btn-sm justify-start text-base-content/50 mb-3"
          onClick={() => navigate('/')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path fillRule="evenodd" d="M12.5 9.75A2.75 2.75 0 0 0 9.75 7H4.56l2.22 2.22a.75.75 0 1 1-1.06 1.06l-3.5-3.5a.75.75 0 0 1 0-1.06l3.5-3.5a.75.75 0 0 1 1.06 1.06L4.56 5.5h5.19a4.25 4.25 0 0 1 0 8.5h-1a.75.75 0 0 1 0-1.5h1a2.75 2.75 0 0 0 2.75-2.75Z" clipRule="evenodd" />
          </svg>
          My Sites
        </button>

        <ul className="menu menu-sm gap-0.5">
          <li><button className={tab === 'account' ? 'active' : ''} onClick={() => setTab('account')}>Account</button></li>
          <li><button className={tab === 'vault' ? 'active' : ''} onClick={() => setTab('vault')}>Vault</button></li>
          <li><button className={tab === 'claude' ? 'active' : ''} onClick={() => setTab('claude')}>Claude Desktop</button></li>
          <li><button className={tab === 'autolock' ? 'active' : ''} onClick={() => setTab('autolock')}>Auto-lock</button></li>
        </ul>

        <div className="mt-auto px-2 space-y-1">
          <a href="https://docs.purroxy.com" target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-base-content/30 hover:text-base-content/60 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path d="M8 .5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15ZM6.75 5.5a1.25 1.25 0 1 0 2.5 0 1.25 1.25 0 0 0-2.5 0ZM8 7.75a.75.75 0 0 0-.75.75v3a.75.75 0 0 0 1.5 0v-3A.75.75 0 0 0 8 7.75Z" />
            </svg>
            Docs
          </a>
          <a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-base-content/30 hover:text-base-content/60 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
              <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
            </svg>
            Security
          </a>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          {tab === 'account' && <AccountPanel />}
          {tab === 'vault' && <VaultPanel />}
          {tab === 'claude' && <ClaudePanel />}
          {tab === 'autolock' && <AutoLockPanel />}
        </div>
      </div>
    </div>
  );
}

// --- Account Panel ---

function AccountPanel() {
  const [status, setStatus] = useState<{ accountType: string; trialDaysLeft: number; email: string | null; isLoggedIn: boolean } | null>(null);
  const [profile, setProfile] = useState<{ email: string; displayName: string | null; subscriptionStatus: string; contributorStatus: string; createdAt: string } | null>(null);
  const [accountMsg, setAccountMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginName, setLoginName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editValue2, setEditValue2] = useState('');
  const [editError, setEditError] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const showMsg = (type: 'success' | 'error', text: string) => { setAccountMsg({ type, text }); setTimeout(() => setAccountMsg(null), 5000); };
  const handleSubscribe = async () => { const r = await window.purroxy.subscribe(); if (r.error) showMsg('error', r.error); };
  const handleManage = async () => { const r = await window.purroxy.manageSubscription(); if (r.error) showMsg('error', r.error); };
  const loadAll = () => { window.purroxy.getAccountStatus().then(setStatus); window.purroxy.getProfile().then(setProfile); };
  useEffect(() => { loadAll(); }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(''); setLoginLoading(true);
    try {
      const endpoint = loginMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const body: any = { email: loginEmail.trim(), password: loginPassword };
      if (loginMode === 'signup' && loginName.trim()) body.username = loginName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const res = await fetch(`https://purroxy.com${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.needsVerification) { setLoginError(`Verification email sent to ${loginEmail.trim()}. Click the link, then log in.`); setLoginMode('login'); setLoginLoading(false); return; }
      if (!res.ok) { setLoginError(data.error || 'Something went wrong.'); setLoginLoading(false); return; }
      if (data.user?.licenseKey) { await window.purroxy.setLicenseKey(data.user.licenseKey); loadAll(); }
    } catch (err: any) { setLoginError(err.message || 'Server unreachable.'); }
    setLoginLoading(false);
  };

  const handleLogout = async () => { await window.purroxy.clearLockPin(); await window.purroxy.setLicenseKey(''); setProfile(null); loadAll(); };

  const handleSaveEdit = async () => {
    setEditError(''); setEditLoading(true);
    let updates: Record<string, string> = {};
    if (editField === 'displayName') updates = { displayName: editValue };
    if (editField === 'email') updates = { newEmail: editValue };
    if (editField === 'password') updates = { currentPassword: editValue, newPassword: editValue2 };
    const result = await window.purroxy.updateProfile(updates);
    if (result.success || result.emailChanged) { setEditField(null); setEditValue(''); setEditValue2(''); loadAll(); if (result.emailChanged) showMsg('success', result.message || 'Email updated.'); }
    else { setEditError(result.error || 'Failed.'); }
    setEditLoading(false);
  };

  if (!status) return <div className="flex justify-center py-12"><span className="loading loading-spinner loading-md text-primary" /></div>;

  // --- Logged in view ---
  if (status.isLoggedIn) {
    return (
      <div className="space-y-6">
        {accountMsg && <div className={`alert text-sm ${accountMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>{accountMsg.text}</div>}

        {/* User card */}
        <div className="card bg-base-200 shadow-sm">
          <div className="card-body p-5">
            <div className="flex items-center gap-4">
              <div className="avatar placeholder">
                <div className="bg-primary text-primary-content w-12 rounded-full">
                  <span className="text-lg">{(profile?.displayName || profile?.email || '?').charAt(0).toUpperCase()}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base-content truncate">{profile?.displayName || 'No display name'}</p>
                <p className="text-sm text-base-content/50 truncate">{profile?.email || status.email || ''}</p>
              </div>
              {/* Status badge */}
              {status.accountType === 'trial' && (
                <div className="text-right">
                  <span className="badge badge-primary badge-outline">{status.trialDaysLeft}d trial</span>
                </div>
              )}
              {status.accountType === 'subscribed' && <span className="badge badge-success">Subscribed</span>}
              {status.accountType === 'contributor' && <span className="badge badge-success">Contributor</span>}
              {status.accountType === 'expired' && <span className="badge badge-error">Expired</span>}
              {status.accountType === 'cancelled' && <span className="badge badge-warning">Cancelled</span>}
            </div>

            {/* Trial progress */}
            {status.accountType === 'trial' && (
              <div className="mt-3">
                <progress className="progress progress-primary w-full" value={7 - status.trialDaysLeft} max="7" />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-base-content/40">{status.trialDaysLeft} day{status.trialDaysLeft !== 1 ? 's' : ''} remaining</span>
                  <button className="text-[10px] link link-primary" onClick={handleSubscribe}>Subscribe now</button>
                </div>
              </div>
            )}

            {/* Subscription actions */}
            {status.accountType === 'subscribed' && (
              <div className="mt-2">
                <button className="link link-primary text-xs" onClick={handleManage}>Manage subscription</button>
              </div>
            )}
            {(status.accountType === 'expired' || status.accountType === 'cancelled') && (
              <button className="btn btn-primary btn-sm mt-3" onClick={handleSubscribe}>
                {status.accountType === 'cancelled' ? 'Resubscribe' : 'Subscribe'} ($3.89/mo)
              </button>
            )}
            {status.accountType === 'contributor' && (
              <p className="text-xs text-success mt-2">Free forever. Thank you for contributing.</p>
            )}
          </div>
        </div>

        {/* Profile fields */}
        {profile && (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body p-0 divide-y divide-base-200">
              <ProfileRow label="Display name" value={profile.displayName || 'Not set'} onEdit={() => { setEditField('displayName'); setEditValue(profile.displayName || ''); }} />
              <ProfileRow label="Email" value={profile.email} onEdit={() => { setEditField('email'); setEditValue(''); }} />
              <ProfileRow label="Password" value="********" onEdit={() => { setEditField('password'); setEditValue(''); setEditValue2(''); }} editLabel="Change" />
              <div className="px-4 py-3">
                <p className="text-[10px] text-base-content/30">Member since {new Date(profile.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        )}

        {!profile && (
          <div className="card bg-base-100 border border-base-300">
            <div className="card-body p-4">
              <p className="text-sm text-base-content/40">Could not load profile from server.</p>
            </div>
          </div>
        )}

        {/* Export & Logout */}
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm text-base-content/30" onClick={async () => {
            const r = await window.purroxy.exportBackup();
            if (r.success) showMsg('success', `Backup saved to ${r.path}`);
            else if (r.error) showMsg('error', r.error);
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.879a1.5 1.5 0 0 1 1.06.44l1.122 1.12A1.5 1.5 0 0 0 9.62 4H12.5A1.5 1.5 0 0 1 14 5.5v1.401a2.986 2.986 0 0 0-1.5-.401h-9A2.986 2.986 0 0 0 1 7.901V11.5A1.5 1.5 0 0 0 2.5 13h.585A1.5 1.5 0 0 1 2 11.5v-8Z" />
              <path d="M1 11.5A1.5 1.5 0 0 1 2.5 10h9A1.5 1.5 0 0 1 13 11.5v.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-.5Z" />
            </svg>
            Export backup
          </button>
          <button className="btn btn-ghost btn-sm text-base-content/30" onClick={handleLogout}>Log out</button>
        </div>

        {/* Edit modal */}
        {editField && (
          <div className="modal modal-open" onClick={() => { setEditField(null); setEditError(''); }}>
            <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-lg mb-4">
                {editField === 'displayName' ? 'Display name' : editField === 'email' ? 'Email address' : 'Password'}
              </h3>
              <div className="space-y-3">
                {editField === 'displayName' && (
                  <label className="form-control w-full">
                    <div className="label"><span className="label-text text-xs">New display name</span></div>
                    <input type="text" className="input input-bordered w-full" value={editValue}
                      onChange={(e) => setEditValue(e.target.value)} autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }} />
                  </label>
                )}
                {editField === 'email' && (
                  <label className="form-control w-full">
                    <div className="label"><span className="label-text text-xs">New email address</span></div>
                    <input type="email" className="input input-bordered w-full" value={editValue}
                      onChange={(e) => setEditValue(e.target.value)} autoFocus />
                    <div className="label"><span className="label-text-alt text-base-content/40">A verification email will be sent to confirm the change.</span></div>
                  </label>
                )}
                {editField === 'password' && (
                  <>
                    <label className="form-control w-full">
                      <div className="label"><span className="label-text text-xs">Current password</span></div>
                      <input type="password" className="input input-bordered w-full" value={editValue}
                        onChange={(e) => setEditValue(e.target.value)} autoFocus />
                    </label>
                    <label className="form-control w-full">
                      <div className="label"><span className="label-text text-xs">New password</span></div>
                      <input type="password" className="input input-bordered w-full" value={editValue2}
                        onChange={(e) => setEditValue2(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); }} />
                      <div className="label"><span className="label-text-alt text-base-content/40">8+ characters, uppercase, lowercase, and a number.</span></div>
                    </label>
                  </>
                )}
                {editError && <div className="alert alert-error alert-soft text-xs">{editError}</div>}
              </div>
              <div className="modal-action">
                <button className="btn btn-ghost" onClick={() => { setEditField(null); setEditError(''); }}>Cancel</button>
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editLoading || !editValue}>
                  {editLoading ? <span className="loading loading-spinner loading-xs" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Not logged in view ---
  return (
    <div className="space-y-6">
      {accountMsg && <div className={`alert text-sm ${accountMsg.type === 'success' ? 'alert-success' : 'alert-error'}`}>{accountMsg.text}</div>}

      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body p-6">
          <div className="text-center mb-2">
            <h3 className="text-lg font-semibold text-base-content">
              {loginMode === 'signup' ? 'Create your account' : 'Welcome back'}
            </h3>
            <p className="text-sm text-base-content/50 mt-1">
              {loginMode === 'signup' ? 'Start your 7-day free trial.' : 'Log in to continue.'}
            </p>
          </div>

          {/* Tab switch */}
          <div role="tablist" className="tabs tabs-boxed tabs-sm mb-4 self-center">
            <button role="tab" className={`tab ${loginMode === 'login' ? 'tab-active' : ''}`} onClick={() => { setLoginMode('login'); setLoginError(''); }}>Log In</button>
            <button role="tab" className={`tab ${loginMode === 'signup' ? 'tab-active' : ''}`} onClick={() => { setLoginMode('signup'); setLoginError(''); }}>Sign Up</button>
          </div>

          <form className="space-y-3" onSubmit={handleLogin}>
            {loginMode === 'signup' && (
              <label className="form-control w-full">
                <div className="label"><span className="label-text text-xs">Username <span className="text-base-content/30">(public, permanent)</span></span></div>
                <input type="text" className="input input-bordered w-full" value={loginName} onChange={(e) => setLoginName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="3-30 chars, letters, numbers, hyphens" />
                <div className="label"><span className="label-text-alt text-[10px] text-base-content/40">Your username will appear publicly on any sites you contribute.</span></div>
              </label>
            )}
            <label className="form-control w-full">
              <div className="label"><span className="label-text text-xs">Email</span></div>
              <input type="email" className="input input-bordered w-full" required value={loginEmail}
                onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }} autoFocus />
            </label>
            <label className="form-control w-full">
              <div className="label">
                <span className="label-text text-xs">Password</span>
                {loginMode === 'login' && (
                  <a href="https://purroxy.com/forgot-password" target="_blank" rel="noopener noreferrer"
                    className="label-text-alt link link-primary text-[11px]">Forgot?</a>
                )}
              </div>
              <input type="password" className="input input-bordered w-full" required minLength={8}
                value={loginPassword} onChange={(e) => { setLoginPassword(e.target.value); setLoginError(''); }} />
              {loginMode === 'signup' && (
                <div className="label"><span className="label-text-alt text-base-content/30">8+ characters, uppercase, lowercase, and a number.</span></div>
              )}
            </label>

            {loginError && <div className="alert alert-error alert-soft text-xs">{loginError}</div>}

            <button type="submit" className="btn btn-primary btn-block" disabled={loginLoading || !loginEmail.trim() || loginPassword.length < 8}>
              {loginLoading ? <span className="loading loading-spinner loading-xs" /> : loginMode === 'signup' ? 'Create Account' : 'Log In'}
            </button>
          </form>

          <p className="text-[10px] text-base-content/30 text-center mt-2">
            7-day free trial. $3.89/month after. Publish a site for free access forever.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProfileRow({ label, value, onEdit, editLabel = 'Edit' }: { label: string; value: string; onEdit: () => void; editLabel?: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 group">
      <div>
        <p className="text-[10px] text-base-content/40 uppercase tracking-wider">{label}</p>
        <p className="text-sm text-base-content mt-0.5">{value}</p>
      </div>
      <button className="btn btn-ghost btn-xs opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40" onClick={onEdit}>{editLabel}</button>
    </div>
  );
}

// --- Vault Panel ---

function VaultPanel() {
  const [keys, setKeys] = useState<string[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [error, setError] = useState('');
  const [apiKeyDisplay, setApiKeyDisplay] = useState<string | null>(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [changingKey, setChangingKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  useEffect(() => { window.purroxy.vaultList().then(setKeys); window.purroxy.getApiKey().then(setApiKeyDisplay); }, []);

  const handleSaveApiKey = async () => {
    const trimmed = newApiKey.trim();
    if (!trimmed.startsWith('sk-ant-') || trimmed.length < 40) { setApiKeyError('Invalid API key format.'); return; }
    setApiKeyError(''); setChangingKey(true);
    try { await window.purroxy.validateApiKey(trimmed); await window.purroxy.setApiKey(trimmed); setApiKeyDisplay(await window.purroxy.getApiKey()); setNewApiKey(''); setApiKeySaved(true); setTimeout(() => setApiKeySaved(false), 2000); }
    catch { setApiKeyError('Invalid API key.'); }
    setChangingKey(false);
  };

  const handleAddVaultEntry = async () => {
    const key = newKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) { setError('Key is required.'); return; }
    if (!newValue.trim()) { setError('Value is required.'); return; }
    if (keys.includes(key)) { setError('That key already exists.'); return; }
    setError('');
    await window.purroxy.vaultSet(key, newValue.trim());
    setKeys([...keys, key]); setNewKey(''); setNewValue('');
  };

  const handleDeleteVaultEntry = async (key: string) => {
    await window.purroxy.vaultDelete(key);
    setKeys(keys.filter((k) => k !== key));
    setConfirmDeleteKey(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-base-content">Vault</h3>
        <p className="text-sm text-base-content/50 mt-1">
          Encrypted by your OS keychain. Values are typed directly into websites and never sent to Claude.
          {' '}<a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer" className="link link-primary text-xs">Learn more</a>
        </p>
      </div>

      {/* API Key */}
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-4">
          <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Claude API Key</p>
          {apiKeyDisplay ? (
            <div className="flex items-center justify-between">
              <code className="text-sm text-base-content/60">{apiKeyDisplay}</code>
              <button className="btn btn-ghost btn-xs" onClick={() => setApiKeyDisplay(null)}>Change</button>
            </div>
          ) : (
            <div className="join w-full">
              <input type="password" placeholder="sk-ant-..." className={`input input-bordered join-item flex-1 font-mono text-sm ${apiKeyError ? 'input-error' : ''}`}
                value={newApiKey} onChange={(e) => { setNewApiKey(e.target.value); setApiKeyError(''); setApiKeySaved(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveApiKey(); }} />
              <button className="btn btn-primary join-item" disabled={changingKey || !newApiKey.trim()} onClick={handleSaveApiKey}>
                {changingKey ? <span className="loading loading-spinner loading-xs" /> : apiKeySaved ? 'Saved' : 'Save'}
              </button>
            </div>
          )}
          {apiKeyError && <p className="text-xs text-error mt-1">{apiKeyError}</p>}
        </div>
      </div>

      {/* Vault entries */}
      <div>
        <p className="text-xs font-semibold text-base-content/50 uppercase tracking-wider mb-2">Sensitive Data</p>
        <p className="text-xs text-base-content/40 mb-3">
          Credit cards, account numbers, and other private values. Claude sees only the key names.
        </p>

        {keys.length > 0 && (
          <div className="card bg-base-100 border border-base-300 mb-3">
            <div className="card-body p-0 divide-y divide-base-200">
              {keys.map((key) => (
                <div key={key} className="flex items-center justify-between px-4 py-2.5 group">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-success/50">
                      <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-mono">{key}</span>
                  </div>
                  <button className="btn btn-ghost btn-xs text-error/40 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setConfirmDeleteKey(key)}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card bg-base-200/50 border border-base-300">
          <div className="card-body p-3">
            <div className="join w-full">
              <input type="text" placeholder="key (e.g. credit_card)" className="input input-bordered input-sm join-item flex-1 font-mono"
                value={newKey} onChange={(e) => { setNewKey(e.target.value); setError(''); }} />
              <input type="password" placeholder="value" className="input input-bordered input-sm join-item flex-1 font-mono"
                value={newValue} onChange={(e) => { setNewValue(e.target.value); setError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddVaultEntry(); }} />
              <button className="btn btn-primary btn-sm join-item" onClick={handleAddVaultEntry} disabled={!newKey.trim() || !newValue.trim()}>Add</button>
            </div>
            {error && <p className="text-xs text-error mt-1">{error}</p>}
          </div>
        </div>
      </div>

      {/* Vault delete confirmation */}
      {confirmDeleteKey && (
        <div className="modal modal-open" onClick={() => setConfirmDeleteKey(null)}>
          <div className="modal-box max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Remove vault entry</h3>
            <p className="text-sm text-base-content/60">
              Remove <strong>{confirmDeleteKey}</strong> from the vault? Any capabilities that use this key will stop working until you add it back.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDeleteKey(null)}>Cancel</button>
              <button className="btn btn-error btn-sm" onClick={() => handleDeleteVaultEntry(confirmDeleteKey)}>Remove</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Claude Desktop Panel ---

function ClaudePanel() {
  const [mcpInstalled, setMcpInstalled] = useState<boolean | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [justUninstalled, setJustUninstalled] = useState(false);

  useEffect(() => { window.purroxy.checkMcpInstalled().then((s) => setMcpInstalled(s.installed)); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-base-content">Claude Desktop</h3>
        <p className="text-sm text-base-content/50 mt-1">
          Connect Purroxy so Claude can use all your sites and capabilities.
        </p>
      </div>

      {mcpInstalled === null ? (
        <div className="flex justify-center py-8"><span className="loading loading-spinner loading-md text-primary" /></div>
      ) : (
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body p-5">
            {mcpInstalled ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-success">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-medium text-success">Connected</p>
                  <p className="text-xs text-base-content/40">Restart Claude Desktop to pick up changes</p>
                </div>
                <button className="btn btn-ghost btn-sm text-error/50" onClick={async () => { setMcpLoading(true); await window.purroxy.uninstallMcpConfig(); setMcpInstalled(false); setJustUninstalled(true); setMcpLoading(false); }}
                  disabled={mcpLoading}>{mcpLoading ? <span className="loading loading-spinner loading-xs" /> : 'Remove'}</button>
              </div>
            ) : justUninstalled ? (
              <div className="text-center space-y-3">
                <p className="text-sm text-base-content/60">Removed. Restart Claude Desktop to complete.</p>
                <button className="btn btn-primary btn-sm" onClick={async () => { setMcpLoading(true); setJustUninstalled(false); await window.purroxy.installMcpConfig(); setMcpInstalled(true); setMcpLoading(false); }}
                  disabled={mcpLoading}>{mcpLoading ? <span className="loading loading-spinner loading-xs" /> : 'Reinstall'}</button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-sm text-base-content/60">One click to connect. Claude will see all your sites.</p>
                <button className="btn btn-primary" onClick={async () => { setMcpLoading(true); await window.purroxy.installMcpConfig(); setMcpInstalled(true); setMcpLoading(false); }}
                  disabled={mcpLoading}>{mcpLoading ? <span className="loading loading-spinner loading-xs" /> : 'Install for Claude Desktop'}</button>
                <a href="https://docs.purroxy.com/getting-started" target="_blank" rel="noopener noreferrer" className="text-xs text-base-content/30 block">Manual setup</a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Auto-lock Panel ---

function AutoLockPanel() {
  const [autoLockEnabled, setAutoLockEnabled] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(5);
  const [hasPin, setHasPin] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    window.purroxy.getSettings().then((s) => { setAutoLockEnabled(s.autoLockEnabled); setAutoLockMinutes(s.autoLockMinutes); });
    window.purroxy.hasLockPin().then((r) => setHasPin(r.hasPin));
  }, []);

  const handleToggleAutoLock = (enabled: boolean) => { if (enabled && !hasPin) { setShowPinSetup(true); return; } setAutoLockEnabled(enabled); };
  const handleSetPin = async () => {
    if (pin.length < 4) { setPinError('PIN must be at least 4 digits.'); return; }
    if (pin !== pinConfirm) { setPinError('PINs do not match.'); return; }
    setPinError(''); await window.purroxy.setLockPin(pin); setHasPin(true); setAutoLockEnabled(true); setShowPinSetup(false); setPin(''); setPinConfirm('');
  };
  const [showClearPinModal, setShowClearPinModal] = useState(false);
  const handleClearPin = async () => { setShowClearPinModal(false); await window.purroxy.clearLockPin(); setHasPin(false); setAutoLockEnabled(false); };
  const handleSaveSettings = async () => { await window.purroxy.saveSettings({ autoLockEnabled, autoLockMinutes }); setSettingsSaved(true); setTimeout(() => setSettingsSaved(false), 2000); };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-base-content">Auto-lock</h3>
        <p className="text-sm text-base-content/50 mt-1">
          Protect your sessions when you step away. Claude cannot access anything while locked.
        </p>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body p-5 space-y-4">
          <div className="form-control">
            <label className="label cursor-pointer justify-start gap-3">
              <input type="checkbox" className="toggle toggle-primary" checked={autoLockEnabled} onChange={(e) => handleToggleAutoLock(e.target.checked)} />
              <span className="label-text">Lock after inactivity</span>
            </label>
          </div>

          {autoLockEnabled && (
            <>
              <label className="form-control w-full max-w-xs">
                <div className="label"><span className="label-text text-xs">Lock after</span></div>
                <select className="select select-bordered select-sm w-full" value={autoLockMinutes} onChange={(e) => setAutoLockMinutes(Number(e.target.value))}>
                  <option value={1}>1 minute</option>
                  <option value={2}>2 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>1 hour</option>
                </select>
              </label>

              {hasPin ? (
                <div className="flex items-center gap-2">
                  <span className="badge badge-success badge-sm gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                      <path fillRule="evenodd" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7A1.5 1.5 0 0 0 3 8.5v5A1.5 1.5 0 0 0 4.5 15h7a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 11.5 7V4.5A3.5 3.5 0 0 0 8 1Zm2 6V4.5a2 2 0 1 0-4 0V7h4Z" clipRule="evenodd" />
                    </svg>
                    PIN set
                  </span>
                  <button className="btn btn-ghost btn-xs text-base-content/40" onClick={() => setShowPinSetup(true)}>Change</button>
                  <button className="btn btn-ghost btn-xs text-error/50" onClick={() => setShowClearPinModal(true)}>Remove</button>
                </div>
              ) : null}
            </>
          )}

          <button className="btn btn-primary btn-sm" onClick={handleSaveSettings}>
            {settingsSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-base-content/30">
        Forgot your PIN? Log out and log back in to reset it.
      </p>

      {/* Clear PIN confirmation */}
      {showClearPinModal && (
        <div className="modal modal-open" onClick={() => setShowClearPinModal(false)}>
          <div className="modal-box max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Remove PIN</h3>
            <p className="text-sm text-base-content/60">
              This will disable auto-lock and remove your PIN. Claude Desktop will be able to use your capabilities while Purroxy is open.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowClearPinModal(false)}>Cancel</button>
              <button className="btn btn-error btn-sm" onClick={handleClearPin}>Remove PIN</button>
            </div>
          </div>
        </div>
      )}

      {showPinSetup && (
        <div className="modal modal-open" onClick={() => setShowPinSetup(false)}>
          <div className="modal-box max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-lg mb-1">{hasPin ? 'Change PIN' : 'Set a PIN'}</h3>
            <p className="text-sm text-base-content/50 mb-4">You will need this PIN to unlock Purroxy.</p>
            <div className="space-y-3">
              <input type="password" placeholder="Enter PIN (4+ digits)" className="input input-bordered w-full font-mono text-center tracking-[0.3em] text-lg"
                value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setPinError(''); }} maxLength={8} autoFocus />
              <input type="password" placeholder="Confirm PIN" className="input input-bordered w-full font-mono text-center tracking-[0.3em] text-lg"
                value={pinConfirm} onChange={(e) => { setPinConfirm(e.target.value.replace(/\D/g, '')); setPinError(''); }} maxLength={8}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSetPin(); }} />
              {pinError && <div className="alert alert-error alert-soft text-xs">{pinError}</div>}
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost" onClick={() => { setShowPinSetup(false); setPin(''); setPinConfirm(''); setPinError(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSetPin} disabled={!pin || !pinConfirm}>{hasPin ? 'Update' : 'Set PIN'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

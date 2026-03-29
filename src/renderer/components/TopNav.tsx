import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

type ThemeMode = 'system' | 'light' | 'dark';

function getSystemDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(mode: ThemeMode): void {
  if (mode === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'purroxy-dark' : 'purroxy-light');
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export default function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const [totalTokens, setTotalTokens] = useState(0);
  const [activityLog, setActivityLog] = useState<{ timestamp: string; type: string; site: string; capability: string; status: string; durationMs?: number }[]>([]);
  const [showActivity, setShowActivity] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const activeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.purroxy.getTokenUsage().then((t) => setTotalTokens(t.total));
    const unsub = window.purroxy.onTokenUpdate((t) => setTotalTokens(t.total));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.purroxy.onProxyActivity((entry) => {
      setActivityLog((prev) => [entry, ...prev].slice(0, 50));
      setIsActive(true);
      if (activeTimer.current) clearTimeout(activeTimer.current);
      activeTimer.current = setTimeout(() => setIsActive(false), 3000);
    });
    return unsub;
  }, []);

  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = (localStorage.getItem('purroxy-theme') as ThemeMode) || 'system';
    applyTheme(saved);
    return saved;
  });

  useEffect(() => {
    applyTheme(themeMode);
    localStorage.setItem('purroxy-theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (themeMode === 'system') applyTheme('system'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && getSystemDark());

  return (
    <header className="flex items-center justify-between px-4 py-2 border-b border-base-300 bg-base-100 shrink-0">
      <div className="flex items-center gap-2">
        <img src="./icon-192.png" alt="Purroxy" className="w-6 h-6 object-contain rounded" />
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost btn-sm btn-square text-base-content/40 hover:text-base-content"
          onClick={() => {
            if (location.pathname.startsWith('/build')) {
              window.purroxy.agentCancel().catch(() => {});
            }
            navigate('/');
          }}
          title="Home"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M9.293 2.293a1 1 0 0 1 1.414 0l7 7A1 1 0 0 1 17 11h-1v6a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6H3a1 1 0 0 1-.707-1.707l7-7Z" clipRule="evenodd" />
          </svg>
        </button>

        <a
          href="https://docs.purroxy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm btn-square text-base-content/40 hover:text-base-content"
          title="Documentation"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
          </svg>
        </a>

        <button
          className={`btn btn-ghost btn-sm btn-square ${isActive ? 'text-warning' : 'text-base-content/40'} hover:text-base-content`}
          onClick={() => setShowActivity(true)}
          title="Claude Desktop activity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
          </svg>
        </button>


        <div
          className="flex items-center gap-1 px-2 py-1 text-xs font-mono text-base-content/30 select-none"
          title={`API tokens used this session: ${totalTokens.toLocaleString()} (input + output)`}
        >
          {formatTokens(totalTokens)}
          <span className="text-[10px]">tokens</span>
        </div>

        <button
          className="btn btn-ghost btn-sm btn-square text-base-content/40 hover:text-base-content"
          onClick={() => setThemeMode(isDark ? 'light' : 'dark')}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>

        <button
          className="btn btn-ghost btn-sm btn-square text-base-content/40 hover:text-base-content"
          onClick={() => navigate('/settings')}
          title="Account & Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" fill="currentColor" className="w-4 h-4">
            <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304l-91.4 0z" />
          </svg>
        </button>
      </div>

      {/* Activity log modal */}
      {showActivity && (
        <div className="modal modal-open" onClick={() => { setShowActivity(false); setActivityLog([]); }}>
          <div className="modal-box max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Claude Desktop Activity</h3>
              {activityLog.length > 0 && (
                <button className="btn btn-ghost btn-xs text-base-content/40" onClick={() => setActivityLog([])}>
                  Clear
                </button>
              )}
            </div>

            {activityLog.length === 0 ? (
              <div className="py-6 text-center space-y-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-8 h-8 text-base-content/20 mx-auto">
                  <path d="M11.983 1.907a.75.75 0 0 0-1.292-.657l-8.5 9.5A.75.75 0 0 0 2.75 12h6.572l-1.305 6.093a.75.75 0 0 0 1.292.657l8.5-9.5A.75.75 0 0 0 17.25 8h-6.572l1.305-6.093Z" />
                </svg>
                <p className="text-sm text-base-content/40">No activity yet</p>
                <p className="text-xs text-base-content/30">
                  When Claude Desktop uses your Purroxy capabilities, requests and responses will appear here in real time.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
                {activityLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-base-200/50">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      entry.status === 'running' ? 'bg-warning animate-pulse' :
                      entry.status === 'success' ? 'bg-success' : 'bg-error'
                    }`} />
                    <span className="text-base-content/40 font-mono shrink-0">
                      {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    <span className="text-base-content truncate">{entry.capability}</span>
                    {entry.durationMs != null && (
                      <span className="text-base-content/30 font-mono shrink-0">{(entry.durationMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowActivity(false); setActivityLog([]); }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

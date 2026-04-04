import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentMessage } from '../../shared/types';
import ApiKeySetup from './ApiKeySetup';
import TosWarning from './TosWarning';

interface Props {
  existingProfileId?: string;
  editCapabilityId?: string;
  onComplete: (profileId: string) => void;
  onCancel?: () => void;
}

export default function BuildChat({ existingProfileId, editCapabilityId, onComplete, onCancel }: Props) {
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [url, setUrl] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [showTos, setShowTos] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserContext, setBrowserContext] = useState('');
  const [hasLoggedIn, setHasLoggedIn] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [editCapability, setEditCapability] = useState<{ name: string; description: string } | null>(null);
  const [paramOverrides, setParamOverrides] = useState<{ stepIndex: number; isParameter: boolean; parameterName: string }[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'browser'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const webviewContainerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<any>(null);
  const webContentsIdRef = useRef<number | null>(null);

  useEffect(() => {
    window.purroxy.getApiKey().then((key) => setHasApiKey(key !== null));
  }, []);

  // Auto-switch to browser tab when showBrowser becomes true
  useEffect(() => { if (showBrowser) setActiveTab('browser'); }, [showBrowser]);
  // Auto-switch back to chat when browser is done
  useEffect(() => { if (!showBrowser && browserContext) setActiveTab('chat'); }, [showBrowser, browserContext]);

  // Load existing profile context when editing a capability
  useEffect(() => {
    if (!existingProfileId) return;
    (async () => {
      const profile = await window.purroxy.loadProfile(existingProfileId);
      if (profile) {
        const siteUrl = profile.manifest.siteBaseUrl;
        setUrl(siteUrl);
      }
      if (editCapabilityId) {
        const wf = await window.purroxy.loadWorkflow(existingProfileId, editCapabilityId);
        if (wf) {
          setEditCapability({ name: wf.name, description: wf.description });
        }
      }
    })();
  }, [existingProfileId, editCapabilityId]);

  // Create webview once on mount (hidden until needed)
  const webviewCreated = useRef(false);
  useEffect(() => {
    const container = webviewContainerRef.current;
    if (!container || webviewCreated.current) return;
    webviewCreated.current = true;

    const webview = document.createElement('webview');
    webview.setAttribute('partition', 'persist:target');
    webview.setAttribute('webpreferences', 'contextIsolation=yes');
    webview.style.width = '100%';
    webview.style.height = '100%';
    webview.style.border = 'none';
    webview.setAttribute('src', 'about:blank');

    webviewRef.current = webview;
    container.appendChild(webview);

    webview.addEventListener('dom-ready', () => {
      const id = (webview as any).getWebContentsId();
      webContentsIdRef.current = id;
    });

    // Prevent popups from opening external windows; navigate in-place instead
    webview.addEventListener('new-window', (e: any) => {
      e.preventDefault();
      if (e.url && e.url !== 'about:blank') {
        (webview as any).loadURL(e.url);
      }
    });

    return () => {
      if (container.contains(webview)) container.removeChild(webview);
      webviewRef.current = null;
      webviewCreated.current = false;
      webContentsIdRef.current = null;
    };
  }, []);

  // Listen for agent messages
  useEffect(() => {
    const unsub = window.purroxy.onAgentMessage((msg: AgentMessage) => {
      // Status messages (id='status') replace the previous status instead of appending
      if (msg.id === 'status') {
        if (!msg.content) {
          // Empty status = clear it
          setMessages((prev) => prev.filter((m) => m.id !== 'status'));
          setThinking(false);
        } else {
          setMessages((prev) => {
            const withoutOldStatus = prev.filter((m) => m.id !== 'status');
            return [...withoutOldStatus, msg];
          });
          setThinking(true);
        }
        return;
      }

      // Clear status AND any lingering progress messages when a real message arrives
      setMessages((prev) => {
        const cleaned = prev.filter((m) => m.id !== 'status');
        return [...cleaned, msg];
      });

      if (msg.isProgress) {
        setThinking(true);
      } else {
        setThinking(false);
      }

      if (msg.showBrowser) {
        // Don't show browser immediately — let the safety card render first.
        // User clicks "Ready" in the card to reveal the browser.
        setBrowserContext(msg.content);
        setThinking(false);
      }

      if (msg.resultData) {
        setThinking(false);
        // Initialize parameter overrides from the agent's guesses
        if (msg.resultData.typedValues) {
          setParamOverrides(msg.resultData.typedValues.map((tv) => ({
            stepIndex: tv.stepIndex,
            isParameter: tv.isParameter,
            parameterName: tv.parameterName,
          })));
        }
      }
    });
    return unsub;
  }, []);

  // Listen for completion
  useEffect(() => {
    const unsub = window.purroxy.onAgentComplete((data) => {
      onComplete(data.profileId);
    });
    return unsub;
  }, [onComplete]);

  // Auto-scroll
  useEffect(() => {
    if (!showBrowser) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showBrowser]);

  const handleStart = () => {
    if (!url.trim()) return;
    setShowTos(true);
  };

  const handleTosAccepted = useCallback(() => {
    setShowTos(false);

    // Wait for webview to be ready
    const tryStart = async () => {
      const wcId = webContentsIdRef.current;
      if (!wcId) {
        setTimeout(tryStart, 100);
        return;
      }
      const fullUrl = url.trim().startsWith('http') ? url.trim() : 'https://' + url.trim();
      setConnecting(true);
      try {
        const editOpts = existingProfileId
          ? { existingProfileId, existingWorkflowId: editCapabilityId }
          : undefined;
        await window.purroxy.agentStart(fullUrl, wcId, editOpts);
        setStarted(true);
        setThinking(true);
        setUrl(fullUrl);
      } catch (err: any) {
        alert(err.message || 'Could not reach that site.');
      } finally {
        setConnecting(false);
      }
    };
    tryStart();
  }, [url, existingProfileId, editCapabilityId]);

  const handleSend = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    setThinking(true);
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }]);
    window.purroxy.agentReply(text);
  };

  const handleOptionClick = (value: string, label: string) => {
    setThinking(true);
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: label,
    }]);
    window.purroxy.agentReply(value);
  };

  const handleBrowserDone = () => {
    setShowBrowser(false);
    setHasLoggedIn(true);
    setThinking(true);
    window.purroxy.agentReply('I\'m done interacting with the browser. Please check the page and continue.');
  };

  const handleConfirm = async () => {
    setConfirmed(true);
    setSaving(true);
    try {
      await window.purroxy.agentConfirm(paramOverrides.length > 0 ? paramOverrides : undefined);
    } catch (err: any) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error saving: ${err.message}`,
      }]);
      setSaving(false);
      setConfirmed(false);
    }
  };

  const handleReject = () => {
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: "That's not what I was looking for.",
    }]);
    window.purroxy.agentReply("That's not what I was looking for. Let me try a different approach.");
  };

  const handleCancel = () => {
    window.purroxy.agentCancel();
    if (onCancel) {
      onCancel();
    } else {
      setStarted(false);
      setMessages([]);
      setUrl('');
      setShowBrowser(false);
    }
  };

  let hostname = '';
  try { hostname = new URL(url.startsWith('http') ? url : 'https://' + url).hostname; } catch {}

  // Determine what to show in the main area
  let content: React.ReactNode;

  if (hasApiKey === null) {
    content = <div className="flex items-center justify-center h-full"><span className="loading loading-spinner loading-md text-primary" /></div>;
  } else if (!hasApiKey) {
    content = (
      <ApiKeySetup
        onApiKeySet={async (key) => { await window.purroxy.setApiKey(key); setHasApiKey(true); }}
        onReset={() => {}}
        done={false}
      />
    );
  } else if (!started) {
    content = (
      <div className="flex flex-col items-center justify-center h-full gap-8 max-w-lg mx-auto">
        {showTos && (
          <TosWarning
            siteName={hostname || url}
            onAccept={handleTosAccepted}
            onCancel={() => setShowTos(false)}
          />
        )}
        {connecting ? (
          <>
            <span className="loading loading-spinner loading-lg text-primary" />
            <p className="text-sm text-base-content/50">Connecting to {hostname || url}...</p>
          </>
        ) : editCapability ? (
          <>
            <div className="space-y-3 text-center max-w-md mx-auto">
              <h2 className="text-lg font-semibold">Edit Capability</h2>
              <div className="bg-base-200 rounded-lg p-3 text-left space-y-1">
                <p className="text-sm font-medium text-base-content">{editCapability.name}</p>
                {editCapability.description && (
                  <p className="text-xs text-base-content/50">{editCapability.description}</p>
                )}
              </div>
              <p className="text-sm text-base-content/60 leading-relaxed">
                Tell Purroxy what to change about this capability.
                It will connect to <strong>{hostname || url}</strong> and modify the capability.
              </p>
            </div>
            <form className="flex gap-2 w-full" onSubmit={(e) => { e.preventDefault(); handleStart(); }}>
              <input
                type="text"
                placeholder="e.g. also tell me which emails are important"
                className="input input-bordered flex-1"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={!inputText.trim() && !url.trim()}>
                Go
              </button>
            </form>
            <button className="btn btn-ghost btn-sm text-base-content/40" onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : existingProfileId ? (
          <>
            <div className="space-y-3 text-center max-w-md mx-auto">
              <h2 className="text-lg font-semibold">Add Capability</h2>
              <p className="text-sm text-base-content/60 leading-relaxed">
                Teach Claude something new to do on <strong>{hostname || url}</strong>.
                You'll log in and show Purroxy what you want done.
              </p>
            </div>
            <button className="btn btn-primary" onClick={handleStart} disabled={!url.trim()}>
              Connect to {hostname || url}
            </button>
            <button className="btn btn-ghost btn-sm text-base-content/40" onClick={handleCancel}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <div className="space-y-3 text-center max-w-md mx-auto">
              <h2 className="text-lg font-semibold">Add a Site</h2>
              <p className="text-sm text-base-content/60 leading-relaxed">
                Give Claude <strong>secure access</strong> to any website that requires your login.
                Email, banking, insurance, domain management.
                Your credentials never leave your machine or touch any AI.
              </p>
              <p className="text-xs text-base-content/40 leading-relaxed">
                You log in once in a secure embedded browser. Purroxy learns
                what you want to do and saves it as a capability Claude can
                repeat on your behalf, without ever seeing your password.
                {' '}<a href="https://docs.purroxy.com/what-is-a-site" target="_blank" rel="noopener noreferrer" className="link link-primary">Learn more</a>
              </p>
            </div>
            <form className="flex gap-2 w-full" onSubmit={(e) => { e.preventDefault(); handleStart(); }}>
              <input
                type="text"
                placeholder="example.com"
                className="input input-bordered flex-1 font-mono"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary" disabled={!url.trim()}>
                Go
              </button>
            </form>
            <button className="btn btn-ghost btn-sm text-base-content/40" onClick={handleCancel}>
              Cancel
            </button>
          </>
        )}
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex items-center justify-between px-3 py-1 border-b border-base-300 shrink-0 bg-base-100">
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-xs text-base-content/40" onClick={handleCancel}>
              Back
            </button>
            <span className="text-base-content/20 mx-1">|</span>
            <div role="tablist" className="tabs tabs-boxed tabs-xs bg-base-200">
              <button
                role="tab"
                className={`tab ${activeTab === 'chat' ? 'tab-active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                Chat
              </button>
              <button
                role="tab"
                className={`tab ${activeTab === 'browser' ? 'tab-active' : ''} ${showBrowser ? 'text-warning font-semibold' : ''}`}
                onClick={() => { setActiveTab('browser'); if (!showBrowser) setShowBrowser(true); }}
              >
                Browser {showBrowser && <span className="w-1.5 h-1.5 rounded-full bg-warning ml-1 animate-pulse" />}
              </button>
            </div>
            <span className="text-xs font-mono text-base-content/30 ml-2 truncate max-w-40">{hostname || url}</span>
          </div>
          <div>
            {showBrowser && activeTab === 'browser' && (
              <button className="btn btn-success btn-xs" onClick={handleBrowserDone}>
                Done, continue
              </button>
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className={`flex-1 min-h-0 flex flex-col ${activeTab !== 'chat' ? 'hidden' : ''}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin max-w-2xl mx-auto w-full">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                siteUrl={url}
                onOptionClick={handleOptionClick}
                onConfirm={handleConfirm}
                onReject={handleReject}
                confirmed={confirmed}
                saving={saving}
                showBrowser={showBrowser}
                onShowBrowser={() => { setShowBrowser(true); setActiveTab('browser'); }}
                hasLoggedIn={hasLoggedIn}
                paramOverrides={paramOverrides}
                onParamToggle={(stepIndex, isParameter, parameterName) => {
                  setParamOverrides((prev) =>
                    prev.map((p) => p.stepIndex === stepIndex ? { ...p, isParameter, parameterName } : p)
                  );
                }}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            className="flex gap-2 p-3 border-t border-base-300 shrink-0 max-w-2xl mx-auto w-full"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          >
            <input
              type="text"
              placeholder="Type a message..."
              className="input input-bordered input-sm flex-1 font-mono"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={confirmed}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={!inputText.trim() || confirmed}
            >
              Send
            </button>
          </form>
        </div>

        {/* Browser panel - webview container is rendered outside content, referenced here */}
        <div className={`flex-1 min-h-0 flex flex-col ${activeTab !== 'browser' ? 'hidden' : ''}`}>
          {showBrowser && (
            <div className="px-3 py-1.5 bg-warning/10 border-b border-warning/30 shrink-0">
              <p className="text-xs text-base-content/60 text-center">
                {hasLoggedIn
                  ? 'Navigate to what you need, then click Done.'
                  : 'Log in and complete any verification steps. Your credentials stay on your machine.'}
              </p>
            </div>
          )}
          {/* webview container is the persistent div rendered at root level below */}
          {!showBrowser && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-base-content/30">Browser will appear here when needed</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Webview is always in the DOM so webContentsId is available before agent starts.
  // When browser tab is active, it fills the browser panel. Otherwise it's invisible.
  const webviewVisible = started && activeTab === 'browser';

  return (
    <div className="relative h-full flex flex-col">
      <div className="flex-1 min-h-0">
        {content}
      </div>
      <div
        ref={webviewContainerRef}
        className={webviewVisible ? 'absolute inset-0 top-[41px] z-10 bg-white' : 'absolute w-0 h-0 overflow-hidden'}
      />
    </div>
  );
}

// --- Waiting phrases ---
const WAITING_PHRASES = [
  'Working on it',
  'Still at it',
  'Just a moment',
  'Almost there',
  'Hang tight',
  'Still working',
  'Not giving up',
  'One more second',
  'Bear with me',
  'Getting there',
  'Thinking it through',
  'Figuring this out',
  'Making progress',
  'On it',
  'Crunching away',
  'Patience is a virtue',
  'Good things take time',
  'Working behind the scenes',
];

function useRotatingPhrase(active: boolean, intervalMs = 5000): string {
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setIndex(0); return; }
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % WAITING_PHRASES.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return WAITING_PHRASES[index];
}

function ProgressBubble({ content }: { content: string }) {
  const [elapsed, setElapsed] = React.useState(0);
  const phrase = useRotatingPhrase(elapsed > 4, 3000);

  React.useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [content]);

  const displayText = elapsed > 4 ? phrase : content;

  return (
    <div className="flex items-center gap-2 py-1.5 pl-1">
      <span className="loading loading-spinner loading-xs text-primary" />
      <span className="text-xs text-base-content/50">{displayText}</span>
    </div>
  );
}

// --- Message rendering ---

function MessageBubble({
  msg,
  siteUrl,
  onOptionClick,
  onConfirm,
  onReject,
  confirmed,
  saving,
  showBrowser,
  onShowBrowser,
  paramOverrides,
  onParamToggle,
  hasLoggedIn,
}: {
  msg: AgentMessage;
  siteUrl: string;
  onOptionClick: (value: string, label: string) => void;
  onConfirm: () => void;
  onReject: () => void;
  confirmed: boolean;
  saving: boolean;
  showBrowser: boolean;
  onShowBrowser?: () => void;
  paramOverrides: { stepIndex: number; isParameter: boolean; parameterName: string }[];
  onParamToggle: (stepIndex: number, isParameter: boolean, parameterName: string) => void;
  hasLoggedIn: boolean;
}) {
  let hostname = '';
  try { hostname = new URL(siteUrl.startsWith('http') ? siteUrl : 'https://' + siteUrl).hostname; } catch {}
  if (msg.isProgress) {
    return <ProgressBubble content={msg.content} />;
  }

  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-primary/10 text-base-content rounded-2xl rounded-br-sm px-4 py-2 max-w-[80%]">
          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  // Result card
  if (msg.resultData) {
    const capabilityName = msg.resultData.summary;
    return (
      <div className="space-y-2">
        <div className="bg-base-200 border border-base-300 rounded-xl overflow-hidden max-w-[95%]">
          {/* Header: what we built */}
          <div className="px-4 pt-4 pb-3 space-y-1">
            <p className="text-[10px] font-semibold text-base-content/40 uppercase tracking-wider">New capability for {hostname || siteUrl}</p>
            <p className="text-base font-semibold text-base-content">{capabilityName}</p>
            {msg.resultData.description && (
              <p className="text-xs text-base-content/50">{msg.resultData.description}</p>
            )}
          </div>

          {/* Sample data (collapsible) */}
          <div className="px-4 pb-3">
            <details className="group">
              <summary className="text-[10px] text-base-content/40 uppercase tracking-wider cursor-pointer select-none hover:text-base-content/60">
                Sample response (click to expand)
              </summary>
              <div className="bg-base-100 rounded-lg p-3 font-mono text-xs space-y-1 mt-1.5">
                {Object.entries(msg.resultData.data).map(([key, value]) => (
                  <ResultValue key={key} label={key} value={value} />
                ))}
              </div>
            </details>
          </div>

          {/* Parameter review */}
          {msg.resultData.typedValues && msg.resultData.typedValues.length > 0 && !confirmed && (
            <div className="px-4 pb-3">
              <p className="text-[10px] text-base-content/40 uppercase tracking-wider mb-2">Inputs</p>
              <p className="text-[10px] text-base-content/40 mb-2">
                Toggle values that should change each time Claude runs this capability.
              </p>
              <div className="space-y-2">
                {msg.resultData.typedValues.map((tv) => {
                  const override = paramOverrides.find((p) => p.stepIndex === tv.stepIndex);
                  const isParam = override?.isParameter ?? tv.isParameter;
                  const paramName = override?.parameterName ?? tv.parameterName;
                  return (
                    <div key={tv.stepIndex} className="flex items-center gap-2 bg-base-100 rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        className="checkbox checkbox-xs checkbox-primary"
                        checked={isParam}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const name = paramName || tv.description.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
                          onParamToggle(tv.stepIndex, checked, name);
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-base-content/60">{tv.description}</p>
                        {isParam ? (
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="badge badge-xs badge-primary">parameter</span>
                            <input
                              className="input input-xs font-mono flex-1 max-w-32"
                              value={paramName}
                              onChange={(e) => onParamToggle(tv.stepIndex, true, e.target.value)}
                              placeholder="param_name"
                            />
                          </div>
                        ) : (
                          <p className="text-xs font-mono text-base-content/40 truncate mt-0.5">
                            Fixed: "{tv.value}"
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-4 py-3 border-t border-base-300/50">
            {!confirmed ? (
              <div className="space-y-2">
                <p className="text-xs text-base-content/50">
                  Save "<strong>{capabilityName}</strong>" as a capability for <strong>{hostname}</strong>?
                  Claude will be able to run this on your behalf using your secure local session.
                </p>
                <div className="flex gap-2">
                  <button className="btn btn-primary btn-sm" onClick={onConfirm}>
                    Save capability
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={onReject}>
                    Not quite right
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                {saving ? (
                  <><span className="loading loading-spinner loading-xs text-primary" /> Saving to {hostname}...</>
                ) : (
                  <span className="text-success font-medium">Saved to {hostname}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Browser handoff
  if (msg.showBrowser) {
    // After login: simple text-only card (no button, no action needed from old handoffs)
    if (hasLoggedIn) {
      return (
        <div className="space-y-2">
          <div className="bg-base-200/50 border border-base-300 rounded-xl p-3 max-w-[90%]">
            <p className="text-xs text-base-content/40">{msg.content}</p>
          </div>
        </div>
      );
    }

    // First time: login card with security info
    return (
      <div className="space-y-2">
        <div className="bg-base-200 border border-base-300 rounded-xl p-4 max-w-[90%] space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-success">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
            </svg>
            Time to log in
          </div>
          <p className="text-sm text-base-content/80">{msg.content}</p>
          <div className="bg-success/10 border border-success/20 rounded-lg px-3 py-2 space-y-1">
            <p className="text-xs font-medium text-success">Your credentials are safe</p>
            <p className="text-xs text-base-content/50">
              This is a secure embedded browser running on your machine. Your username, password,
              and session data are <strong>never sent to any AI</strong>. Not to Claude, not to Purroxy servers,
              not anywhere. They stay encrypted on your computer.
            </p>
            <p className="text-xs text-base-content/50">
              <strong>Complete the full login</strong> including any two-factor authentication,
              verification codes, or security prompts. Click Done only when you're fully signed in.
            </p>
            <a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer" className="text-[10px] link link-success">
              How Purroxy protects your data
            </a>
          </div>
          {!showBrowser && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onShowBrowser?.()}
            >
              Ready, show the login
            </button>
          )}
          {showBrowser && (
            <p className="text-xs text-base-content/40">
              Log in above, then click "Done, continue building" when you're finished.
            </p>
          )}
        </div>
      </div>
    );
  }

  // Assistant message with optional capability choices
  if (msg.options && msg.options.length > 0) {
    return (
      <div className="space-y-3 max-w-[90%]">
        <p className="text-sm text-base-content/70 whitespace-pre-wrap">{msg.content}</p>
        <div className="space-y-2">
          {msg.options.map((opt) => (
            <button
              key={opt.value}
              className="w-full text-left px-4 py-3 rounded-lg border border-base-300 bg-base-100 hover:border-primary hover:bg-primary/5 transition-colors group"
              onClick={() => onOptionClick(opt.value, opt.label)}
            >
              <span className="text-sm font-medium text-base-content group-hover:text-primary">{opt.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-base-content/30 pl-1">Or type your own below</p>
      </div>
    );
  }

  // Plain assistant message
  return (
    <div className="space-y-2">
      <div className="bg-base-200 rounded-2xl rounded-bl-sm px-4 py-2 max-w-[80%]">
        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}

// --- Result value renderer (handles nested objects/arrays) ---

function formatPrimitive(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return '[complex value]'; }
  }
  return String(v);
}

function ResultValue({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div className="flex gap-2">
        <span className="text-base-content/40 shrink-0">{label}:</span>
        <span className="text-base-content/30 italic">none</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="flex gap-2">
          <span className="text-base-content/40 shrink-0">{label}:</span>
          <span className="text-base-content/30 italic">empty</span>
        </div>
      );
    }
    if (typeof value[0] !== 'object') {
      return (
        <div className="flex gap-2">
          <span className="text-base-content/40 shrink-0">{label}:</span>
          <span className="text-base-content">{value.join(', ')}</span>
        </div>
      );
    }
    return (
      <div>
        <span className="text-base-content/40">{label} ({value.length}):</span>
        <div className="ml-3 mt-1 space-y-2 border-l-2 border-base-300 pl-3">
          {value.map((item, i) => (
            <div key={i} className="space-y-0.5">
              {typeof item === 'object' && item !== null
                ? Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-base-content/40 shrink-0">{k}:</span>
                      <span className="text-base-content break-all">{formatPrimitive(v)}</span>
                    </div>
                  ))
                : <span className="text-base-content">{formatPrimitive(item)}</span>
              }
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === 'object') {
    return (
      <div>
        <span className="text-base-content/40">{label}:</span>
        <div className="ml-3 mt-0.5 space-y-0.5 border-l-2 border-base-300 pl-3">
          {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-base-content/40 shrink-0">{k}:</span>
              <span className="text-base-content break-all">{formatPrimitive(v)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <span className="text-base-content/40 shrink-0">{label}:</span>
      <span className="text-base-content break-all">{formatPrimitive(value)}</span>
    </div>
  );
}

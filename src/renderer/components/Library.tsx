import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileInfo, Workflow } from '../../shared/types';

export default function Library() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<ProfileInfo[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, Workflow[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [mcpInstalled, setMcpInstalled] = useState<boolean | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, { submitted: boolean; status?: string; rejectionReason?: string; submittedAt?: string; githubPrUrl?: string }>>({});
  const [showSubmitModal, setShowSubmitModal] = useState<string | null>(null);
  const [showRejectionInfo, setShowRejectionInfo] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const result = await window.purroxy.listProfiles();
    setSites(result.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name)));
    const caps: Record<string, Workflow[]> = {};
    for (const site of result) {
      const wfs = await window.purroxy.listWorkflows(site.manifest.id);
      if (wfs.length > 0) caps[site.manifest.id] = wfs;
    }
    setCapabilities(caps);
    setLoading(false);
  };

  useEffect(() => {
    load();
    window.purroxy.checkMcpInstalled().then((s) => setMcpInstalled(s.installed));
  }, []);

  const showFeedback = (type: 'success' | 'error', text: string) => { setFeedback({ type, text }); setTimeout(() => setFeedback(null), 5000); };

  const [showRemoveModal, setShowRemoveModal] = useState<{ type: 'site' | 'capability'; siteId: string; wf?: Workflow } | null>(null);

  const handleDeleteSite = async (id: string) => {
    setShowRemoveModal(null);
    await window.purroxy.deleteProfile(id);
    if (expandedSite === id) setExpandedSite(null);
    load();
  };

  const handleDeleteCapability = async (profileId: string, wf: Workflow) => {
    setShowRemoveModal(null);
    await window.purroxy.deleteWorkflow(profileId, wf.id);
    setCapabilities((prev) => ({ ...prev, [profileId]: (prev[profileId] || []).filter((w) => w.id !== wf.id) }));
  };

  const handleStartEdit = (wf: Workflow) => { setEditingId(wf.id); setEditName(wf.name); setEditDesc(wf.description || ''); };

  const handleSaveEdit = async (profileId: string, wf: Workflow) => {
    const updated = { ...wf, name: editName.trim() || wf.name, description: editDesc.trim(), updatedAt: new Date().toISOString() };
    await window.purroxy.saveWorkflow(updated);
    setCapabilities((prev) => ({ ...prev, [profileId]: (prev[profileId] || []).map((w) => w.id === wf.id ? updated : w) }));
    setEditingId(null);
  };

  const [tryModal, setTryModal] = useState<{ siteName: string; capName: string } | null>(null);
  const [tryLoading, setTryLoading] = useState(false);

  const handleTryCapability = async () => {
    if (!tryModal) return;
    setTryLoading(true);
    const result = await window.purroxy.openClaude(`${tryModal.capName} using Purroxy (${tryModal.siteName})`);
    setTryLoading(false);
    setTryModal(null);
    if (result.success) showFeedback('success', 'Claude Desktop opened. Paste the prompt to get started.');
    else showFeedback('error', result.message);
  };

  const handleSubmitToLibrary = async (profileId: string) => {
    setSubmitting(true); setShowSubmitModal(null);
    const result = await window.purroxy.submitSite(profileId);
    if (result.success) { showFeedback('success', 'Submitted for review. You will receive an email when it is reviewed.'); setSubmissions((prev) => ({ ...prev, [profileId]: { submitted: true, status: 'pending', submittedAt: new Date().toISOString(), githubPrUrl: result.githubPr || undefined } })); }
    else showFeedback('error', result.error || 'Submission failed.');
    setSubmitting(false);
  };

  const handleSetupClaude = async () => {
    await window.purroxy.installMcpConfig(); setMcpInstalled(true);
    showFeedback('success', 'Purroxy installed for Claude Desktop. Restart Claude Desktop to connect.');
  };

  const getFavicon = (site: ProfileInfo) => {
    if (site.manifest.faviconUrl) return site.manifest.faviconUrl;
    try { return `https://www.google.com/s2/favicons?domain=${new URL(site.manifest.siteBaseUrl).hostname}&sz=64`; } catch { return null; }
  };

  const isPublic = (siteId: string) => submissions[siteId]?.status === 'approved';

  if (loading) return <div className="flex items-center justify-center h-full"><span className="loading loading-spinner loading-md text-primary" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-base-content">My Sites</h1>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => window.open('https://purroxy.com/marketplace', '_blank')}>
            Browse Library
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/build')}>
            + Add Site
          </button>
        </div>
      </div>

      {/* Claude status */}
      {sites.length > 0 && Object.values(capabilities).some((c) => c.length > 0) && (
        <div className="flex items-center justify-between mb-4 px-3 py-2 rounded-lg bg-base-200/50 border border-base-300">
          {mcpInstalled ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                <span className="text-xs text-base-content/50">Connected to Claude Desktop</span>
              </div>
              <button className="btn btn-ghost btn-xs text-base-content/40" onClick={() => window.purroxy.openClaude('What can Purroxy do?')}>Open Claude</button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-base-content/20 shrink-0" />
                <span className="text-xs text-base-content/40">Not connected to Claude Desktop</span>
              </div>
              <button className="btn btn-ghost btn-xs text-primary" onClick={handleSetupClaude}>Setup</button>
            </>
          )}
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className={`alert alert-soft text-xs mb-4 ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          <span className="flex-1">{feedback.text}</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setFeedback(null)}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
          </button>
        </div>
      )}

      {/* Site grid */}
      {sites.length === 0 ? (
        <div className="border-2 border-dashed border-base-300 rounded-xl p-10 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors" onClick={() => navigate('/build')}>
          <p className="text-base-content/60 mb-1">No sites yet</p>
          <p className="text-sm text-base-content/30">Give Claude secure access to websites that require your login.</p>
        </div>
      ) : (
        <>
          {/* Grid of site cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {sites.map((site) => {
              const caps = capabilities[site.manifest.id] || [];
              const isExpanded = expandedSite === site.manifest.id;
              const favicon = getFavicon(site);
              const pub = isPublic(site.manifest.id);
              const sub = submissions[site.manifest.id];

              return (
                <div
                  key={site.manifest.id}
                  className={`card bg-base-100 border cursor-pointer transition-all ${isExpanded ? 'border-primary col-span-full' : 'border-base-300 hover:border-primary/40'}`}
                  onClick={() => {
                    const newExpanded = isExpanded ? null : site.manifest.id;
                    setExpandedSite(newExpanded);
                    if (newExpanded && !submissions[newExpanded]) {
                      window.purroxy.getSubmissionStatus(newExpanded).then((s) => setSubmissions((prev) => ({ ...prev, [newExpanded]: s })));
                    }
                  }}
                >
                  <div className="card-body p-3">
                    {/* Card header */}
                    <div className="flex items-center gap-2.5">
                      {favicon ? (
                        <img src={favicon} alt="" className="w-8 h-8 rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      ) : (
                        <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-xs">
                          {(site.manifest.siteName || site.manifest.name).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-base-content truncate">{site.manifest.name}</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-[10px] text-base-content/30 font-mono truncate">{site.manifest.siteBaseUrl}</p>
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`w-3.5 h-3.5 text-base-content/20 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                      </svg>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mt-1">
                      {pub && <span className="badge badge-success badge-xs">Public</span>}
                      {sub?.status === 'pending' && (
                        sub?.githubPrUrl ? (
                          <span className="badge badge-ghost badge-xs text-base-content/40 cursor-pointer hover:text-primary" onClick={(e) => { e.stopPropagation(); window.open(sub.githubPrUrl, '_blank'); }}>In review (view PR)</span>
                        ) : (
                          <span className="badge badge-ghost badge-xs text-base-content/40">In review</span>
                        )
                      )}
                      <span className="text-[10px] text-base-content/30">{caps.length} capabilit{caps.length !== 1 ? 'ies' : 'y'}</span>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-base-200 space-y-3" onClick={(e) => e.stopPropagation()}>
                        {/* Capabilities */}
                        {caps.length > 0 ? (
                          <div className="space-y-1">
                            {caps.map((cap) => (
                              <div key={cap.id}>
                                {editingId === cap.id ? (
                                  <div className="space-y-2 bg-base-200/50 rounded-lg p-2">
                                    <input className="input input-xs w-full font-semibold" value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(site.manifest.id, cap); if (e.key === 'Escape') setEditingId(null); }} />
                                    <input className="input input-xs w-full text-base-content/60" value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(site.manifest.id, cap); if (e.key === 'Escape') setEditingId(null); }} />
                                    <div className="flex gap-1">
                                      <button className="btn btn-primary btn-xs" onClick={() => handleSaveEdit(site.manifest.id, cap)}>Save</button>
                                      <button className="btn btn-ghost btn-xs" onClick={() => setEditingId(null)}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-between py-1 hover:bg-base-200/30 -mx-1 px-1 rounded group">
                                    <div className="min-w-0">
                                      <p className="text-xs font-medium text-base-content truncate">{cap.name}</p>
                                      {cap.description && cap.description !== cap.name && <p className="text-[10px] text-base-content/40 truncate">{cap.description}</p>}
                                    </div>
                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                      <button className="btn btn-primary btn-xs" onClick={() => setTryModal({ siteName: site.manifest.siteName || site.manifest.name, capName: cap.name })}>Try</button>
                                      <button className="btn btn-ghost btn-xs text-base-content/30" onClick={() => handleStartEdit(cap)}>Rename</button>
                                      <button className="btn btn-ghost btn-xs text-base-content/30" onClick={() => navigate(`/build/${site.manifest.id}?capability=${cap.id}`)}>Edit</button>
                                      <button className="btn btn-ghost btn-xs text-base-content/30 hover:text-error" onClick={() => setShowRemoveModal({ type: 'capability', siteId: site.manifest.id, wf: cap })}>Remove</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[10px] text-base-content/30">No capabilities yet.</p>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 pt-2 border-t border-base-200 flex-wrap">
                          <button className="btn btn-primary btn-xs" onClick={() => navigate(`/build/${site.manifest.id}`)}>+ Capability</button>
                          {(() => {
                            if (sub?.status === 'approved') return null; // already public, no action needed
                            if (sub?.status === 'pending') return null; // badge shows above
                            if (sub?.status === 'rejected') return (
                              <button className="btn btn-ghost btn-xs text-base-content/30" onClick={() => setShowRejectionInfo(site.manifest.id)} title="Submission details">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                                  <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM9 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM6.75 8a.75.75 0 0 0 0 1.5h.75v1.75a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8.25 8h-1.5Z" clipRule="evenodd" />
                                </svg>
                              </button>
                            );
                            return (
                              <button className="btn btn-ghost btn-xs text-success" onClick={() => setShowSubmitModal(site.manifest.id)} disabled={submitting || caps.length === 0}>
                                {submitting ? <span className="loading loading-spinner loading-xs" /> : 'Submit'}
                              </button>
                            );
                          })()}
                          <button className="btn btn-ghost btn-xs text-base-content/30 hover:text-error" onClick={() => setShowRemoveModal({ type: 'site', siteId: site.manifest.id })}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Submission confirmation modal */}
      {showSubmitModal && (
        <div className="modal modal-open" onClick={() => setShowSubmitModal(null)}>
          <div className="modal-box max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Submit to Public Library</h3>
            <p className="text-sm text-base-content/60">
              If approved, this site goes live in the library and your account becomes Contributor (free forever).
            </p>
            <div className="text-xs text-base-content/50 space-y-2">
              <p className="font-semibold text-base-content/70">Before you submit:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>If a similar site already exists, enhance it instead of duplicating. Enhancements qualify for Contributor status too.</li>
                <li>Duplicate submissions of existing sites will not be approved. Browse the library first.</li>
                <li>Sites with malicious intent or that violate terms of service will be rejected and accounts may be deleted.</li>
                <li>Sites must provide genuine value that requires Purroxy. If Claude can access the same data without logging in, it does not qualify.</li>
                <li>Very niche sites that only serve one person should remain private. The library should be broadly useful.</li>
              </ul>
            </div>
            <div className="text-xs text-base-content/40">
              Reviews typically take 2 to 4 days. Questions? Email <a href="mailto:admin@purroxy.com" className="link link-primary">admin@purroxy.com</a>
            </div>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setShowSubmitModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => handleSubmitToLibrary(showSubmitModal)} disabled={submitting}>
                {submitting ? <span className="loading loading-spinner loading-xs" /> : 'Submit for Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection info modal */}
      {showRejectionInfo && (() => {
        const sub = submissions[showRejectionInfo];
        return (
          <div className="modal modal-open" onClick={() => setShowRejectionInfo(null)}>
            <div className="modal-box max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-base">Submission Details</h3>
              <div className="text-sm text-base-content/60 space-y-2">
                <p>Submitted on {sub?.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'unknown date'}.</p>
                <p>After review, this site was not added to the public library. You can still use it privately. Feel free to resubmit after making changes.</p>
                {sub?.rejectionReason && <div className="bg-base-200 rounded-lg px-3 py-2 text-xs text-base-content/50">{sub.rejectionReason}</div>}
              </div>
              <p className="text-xs text-base-content/40">Questions? Email <a href="mailto:admin@purroxy.com" className="link link-primary">admin@purroxy.com</a></p>
              <div className="modal-action">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowRejectionInfo(null)}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Remove confirmation modal */}
      {showRemoveModal && (() => {
        const isSite = showRemoveModal.type === 'site';
        const site = sites.find((s) => s.manifest.id === showRemoveModal.siteId);
        const isPrivate = !isPublic(showRemoveModal.siteId);
        const name = isSite ? (site?.manifest.name || 'this site') : (showRemoveModal.wf?.name || 'this capability');

        return (
          <div className="modal modal-open" onClick={() => setShowRemoveModal(null)}>
            <div className="modal-box max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-base">Remove {isSite ? 'site' : 'capability'}</h3>
              <p className="text-sm text-base-content/60">
                Remove <strong>{name}</strong>{isSite ? ' and all its capabilities' : ''}?
              </p>

              {isPrivate && isSite && (
                <div className="alert alert-warning alert-soft text-xs">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
                  </svg>
                  <span>This is a private site. Removing it means it is gone forever. Consider backing up your sites first (Settings &gt; Account &gt; Export).</span>
                </div>
              )}

              <div className="modal-action">
                <button className="btn btn-ghost btn-sm" onClick={() => setShowRemoveModal(null)}>Cancel</button>
                <button className="btn btn-error btn-sm" onClick={() => {
                  if (isSite) handleDeleteSite(showRemoveModal.siteId);
                  else if (showRemoveModal.wf) handleDeleteCapability(showRemoveModal.siteId, showRemoveModal.wf);
                }}>Remove</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Try capability modal */}
      {tryModal && (
        <div className="modal modal-open" onClick={() => setTryModal(null)}>
          <div className="modal-box max-w-sm space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-base">Try in Claude Desktop</h3>
            <p className="text-sm text-base-content/60">
              A prompt will be copied to your clipboard:
            </p>
            <div className="bg-base-200 rounded-lg px-3 py-2">
              <code className="text-sm text-base-content">{tryModal.capName} using Purroxy ({tryModal.siteName})</code>
            </div>
            <p className="text-sm text-base-content/60">
              Paste it into Claude Desktop to run this capability.
            </p>
            <div className="modal-action">
              <button className="btn btn-ghost btn-sm" onClick={() => setTryModal(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleTryCapability} disabled={tryLoading}>
                {tryLoading ? <span className="loading loading-spinner loading-xs" /> : 'Open Claude Desktop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

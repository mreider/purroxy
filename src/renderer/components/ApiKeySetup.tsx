import React, { useState } from 'react';

interface Props {
  onApiKeySet: (key: string) => void;
  onReset: () => void;
  done: boolean;
}

export default function ApiKeySetup({ onApiKeySet, onReset, done }: Props) {
  const [key, setKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;

    if (!trimmed.startsWith('sk-ant-') || trimmed.length < 40) {
      setError('Invalid API key.');
      return;
    }

    setError('');
    setValidating(true);

    try {
      await window.purroxy.validateApiKey(trimmed);
      onApiKeySet(trimmed);
    } catch {
      setError('Invalid API key.');
    } finally {
      setValidating(false);
    }
  };

  const handleReset = () => {
    setKey('');
    setError('');
    onReset();
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 max-w-lg mx-auto">
      <img src="./icon-192.png" alt="Purroxy" className="w-16 h-16 rounded-xl mx-auto" />

      <div className="space-y-3 text-center">
        <p className="text-sm text-base-content/60 leading-relaxed">
          Purroxy uses Claude to analyze captured browser traffic and discover
          hidden API endpoints. Enter your Anthropic API key to get started.
        </p>
      </div>

      {done ? (
        <>
          <div role="alert" className="alert alert-success alert-soft w-full">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current w-5 h-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>API key connected.</span>
          </div>
          <button className="btn btn-ghost btn-sm text-base-content/40" onClick={handleReset}>
            Use a different key
          </button>
        </>
      ) : (
        <>
          <form className="flex gap-2 w-full" onSubmit={handleSubmit}>
            <input
              type="password"
              placeholder="sk-ant-..."
              className={`input font-mono flex-1 ${error ? 'input-error' : ''}`}
              value={key}
              onChange={(e) => { setKey(e.target.value); setError(''); }}
              disabled={validating}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={validating || !key.trim()}>
              {validating ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Validating
                </>
              ) : (
                'Connect'
              )}
            </button>
          </form>

          {error && (
            <div role="alert" className="alert alert-error alert-soft w-full">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current w-5 h-5 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-sm">{error}</span>
            </div>
          )}

          <p className="text-sm text-base-content/40 text-center leading-relaxed">
            Your API key is encrypted and stored locally using your OS keychain.
            It is never sent to our servers. All Claude calls are made directly from your device.
            {' '}<a href="https://docs.purroxy.com/security" target="_blank" rel="noopener noreferrer" className="link link-primary">Learn more about security</a>
          </p>
        </>
      )}
    </div>
  );
}

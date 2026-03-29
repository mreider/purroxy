import React from 'react';

interface Props {
  siteName: string;
  onAccept: () => void;
  onCancel: () => void;
}

export default function TosWarning({ siteName, onAccept, onCancel }: Props) {
  return (
    <div className="modal modal-open">
      <div className="modal-box max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="currentColor" className="w-5 h-5 text-warning shrink-0">
            <path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480H40c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24V296c0 13.3 10.7 24 24 24s24-10.7 24-24V184c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/>
          </svg>
          <h3 className="font-semibold text-sm">Terms of Service Notice</h3>
        </div>

        <p className="text-sm text-base-content/70 leading-relaxed">
          Automating <strong>{siteName}</strong> may violate its Terms of Service.
          You are responsible for ensuring your use complies with the site's terms.
        </p>

        <p className="text-xs text-base-content/40 leading-relaxed">
          Purroxy does not bypass CAPTCHAs, rate limits, or anti-bot measures.
          Conservative rate limits are applied by default to protect your account.
          If the site blocks the request, Purroxy will tell you why.
        </p>

        <div className="modal-action">
          <button className="btn btn-primary btn-sm" onClick={onAccept}>
            I Understand, Continue
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

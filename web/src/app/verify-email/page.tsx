'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function VerifyEmailContent() {
  const params = useSearchParams();
  const success = params.get('success') === 'true';
  const expired = params.get('expired') === 'true';
  const token = params.get('token');

  if (token && !success) {
    if (typeof window !== 'undefined') {
      window.location.href = `/api/auth/verify-email?token=${token}`;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-md"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-100 px-4">
      <div className="card bg-base-100 border border-base-300 max-w-sm w-full">
        <div className="card-body items-center text-center">
          <img src="/icon-192.png" alt="Purroxy" className="w-12 h-12 rounded-xl mb-2" />
          {success ? (
            <>
              <h2 className="card-title text-lg">Email Verified</h2>
              <p className="text-sm text-base-content/60">
                Your email has been verified. You can close this page and log in from the Purroxy app.
              </p>
            </>
          ) : expired ? (
            <>
              <h2 className="card-title text-lg">Already Verified</h2>
              <p className="text-sm text-base-content/60">
                This link has already been used or has expired. If your email is verified, just log in from the Purroxy app.
              </p>
            </>
          ) : (
            <>
              <h2 className="card-title text-lg">Verify Your Email</h2>
              <p className="text-sm text-base-content/60">
                Check your inbox for a verification link. Click it to activate your account.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><span className="loading loading-spinner loading-md"></span></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

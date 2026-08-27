import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { completeOAuthCallback } from '../sync/auth';

export function OAuthCallbackPage() {
  const [params] = useSearchParams();
  const [detail, setDetail] = useState('Opening this ranch’s folder…');
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await completeOAuthCallback(params);
        if (cancelled) return;
        setOk(result.ok);
        setDetail(result.detail);
        if (result.ok) {
          window.setTimeout(() => {
            window.location.replace('/settings?sync=connected');
          }, 400);
        }
      } catch (error) {
        if (cancelled) return;
        setOk(false);
        setDetail(
          error instanceof Error
            ? error.message
            : 'Folder connect failed. Try again from Settings.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <div className="onboard">
      <div className="onboard-card">
        <h1 className="page-header" style={{ fontFamily: 'var(--font-display)' }}>
          {ok === false ? 'Could not connect' : 'Connecting'}
        </h1>
        <p className="lede">{detail}</p>
        {ok === false ? (
          <p style={{ marginTop: '1rem' }}>
            <Link className="btn primary" to="/settings">
              Back to Settings
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

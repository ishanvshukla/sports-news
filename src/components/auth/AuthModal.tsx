import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  onClose(): void;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

export default function AuthModal({ onClose }: Props) {
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState(() =>
    GOOGLE_CLIENT_ID ? '' : 'Google sign-in is not configured for this deployment.'
  );
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    async function handleCredential(response: { credential: string }) {
      setError('');
      setLoading(true);
      try {
        await loginWithGoogle(response.credential);
        onClose();
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    // The GIS script is loaded (deferred) from index.html; it's usually
    // ready by the time this modal mounts, but poll briefly in case it
    // hasn't finished loading yet.
    let attempts = 0;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.google || !buttonRef.current) {
        if (attempts++ < 50) setTimeout(tryRender, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 280,
        text: 'continue_with',
        shape: 'pill',
      });
    };
    tryRender();

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 bg-espn-card border border-espn-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6">
          <div className="flex items-center gap-2">
            <span className="font-display font-black italic text-lg text-white tracking-wide uppercase">
              Side<span className="text-gold">lines</span>
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-white transition-colors w-7 h-7 flex items-center justify-center text-lg leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 pt-5 pb-2 text-center">
          <p className="font-oswald uppercase tracking-wider text-sm text-gray-400">Sign in to sync your preferences</p>
        </div>

        {/* Google sign-in */}
        <div className="px-6 py-6 flex flex-col items-center gap-4">
          <div ref={buttonRef} className={loading ? 'opacity-50 pointer-events-none' : undefined} />

          {loading && (
            <p className="text-gray-500 text-xs font-inter">Signing in…</p>
          )}

          {error && (
            <p className="text-red-400 text-xs font-inter text-center bg-red-400/10 rounded-lg py-2 px-3">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

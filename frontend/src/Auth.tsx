import { useEffect, useState } from 'react';
import { supabase } from './supabase';

type AuthMode = 'login' | 'signup';

export default function Auth() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  });
  const [mode, setMode]         = useState<AuthMode>('login');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [success, setSuccess]   = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // session change triggers App re-render via onAuthStateChange
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('Account created. Check your email to confirm, then log in.');
        setMode('login');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', theme);
    }
  }, [theme]);

  const palette = theme === 'dark'
    ? {
        pageBg: '#050C1A',
        gridLine: 'rgba(29,78,216,0.03)',
        glow: 'radial-gradient(ellipse, rgba(29,78,216,0.08) 0%, transparent 70%)',
        cardBg: '#0A1628',
        cardBorder: 'rgba(255,255,255,0.06)',
        cardShadow: '0 24px 64px rgba(0,0,0,0.4)',
        title: '#E8F0FF',
        muted: '#2E4A66',
        trackBg: 'rgba(255,255,255,0.03)',
        trackBorder: 'rgba(255,255,255,0.06)',
        inputBg: 'rgba(255,255,255,0.03)',
        inputBorder: 'rgba(255,255,255,0.08)',
        inputText: '#E8F0FF',
        submitBg: 'rgba(29,78,216,0.25)',
        submitDisabledBg: 'rgba(29,78,216,0.15)',
        submitText: '#93BBFF',
        submitDisabledText: '#2E4A66',
        footnote: '#1A2E44',
      }
    : {
        pageBg: '#F3F7FD',
        gridLine: 'rgba(59,130,246,0.08)',
        glow: 'radial-gradient(ellipse, rgba(37,99,235,0.16) 0%, transparent 72%)',
        cardBg: '#FFFFFF',
        cardBorder: 'rgba(148,163,184,0.28)',
        cardShadow: '0 22px 56px rgba(30,64,175,0.16)',
        title: '#0F172A',
        muted: '#64748B',
        trackBg: '#F1F5F9',
        trackBorder: 'rgba(148,163,184,0.32)',
        inputBg: '#FFFFFF',
        inputBorder: 'rgba(148,163,184,0.45)',
        inputText: '#0F172A',
        submitBg: '#DBEAFE',
        submitDisabledBg: '#E2E8F0',
        submitText: '#1D4ED8',
        submitDisabledText: '#94A3B8',
        footnote: '#94A3B8',
      };

  return (
    <div
      style={{
        minHeight: '100svh',
        background: palette.pageBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Sora, sans-serif',
        padding: '24px',
      }}
    >
      {/* Subtle grid background */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: `
            linear-gradient(${palette.gridLine} 1px, transparent 1px),
            linear-gradient(90deg, ${palette.gridLine} 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          pointerEvents: 'none',
        }}
      />

      {/* Glow */}
      <div
        style={{
          position: 'fixed',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '600px',
          height: '300px',
          background: palette.glow,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '400px',
          background: palette.cardBg,
          border: `1px solid ${palette.cardBorder}`,
          borderRadius: '16px',
          padding: '40px',
          boxShadow: palette.cardShadow,
        }}
      >
        {/* Logo / wordmark */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
            }}
          >
            {/* Pulse icon */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <polyline
                points="1,11 5,11 7,4 9,18 11,9 13,14 15,11 21,11"
                stroke="#1d4ed8"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: palette.title,
                letterSpacing: '-0.4px',
              }}
            >
              ClinicEar
            </span>
          </div>
          <p style={{ fontSize: '12px', color: palette.muted, margin: 0 }}>
            AI Clinical Documentation
          </p>
        </div>

        {/* Mode toggle */}
        <div
          style={{
            display: 'flex',
            background: palette.trackBg,
            border: `1px solid ${palette.trackBorder}`,
            borderRadius: '8px',
            padding: '3px',
            marginBottom: '28px',
          }}
        >
          {(['login', 'signup'] as AuthMode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); setSuccess(null); }}
              style={{
                flex: 1,
                padding: '7px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'Sora, sans-serif',
                transition: 'all 0.15s',
                background: mode === m ? 'rgba(29,78,216,0.2)' : 'transparent',
                color: mode === m ? '#1D4ED8' : palette.muted,
              }}
            >
              {m === 'login' ? 'Sign In' : 'Sign Up'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: palette.muted,
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="you@hospital.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: palette.inputBg,
                border: `1px solid ${palette.inputBorder}`,
                borderRadius: '8px',
                color: palette.inputText,
                fontSize: '13px',
                fontFamily: 'Sora, sans-serif',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(29,78,216,0.5)')}
              onBlur={(e) => (e.target.style.borderColor = palette.inputBorder)}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                fontWeight: 600,
                color: palette.muted,
                marginBottom: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: palette.inputBg,
                border: `1px solid ${palette.inputBorder}`,
                borderRadius: '8px',
                color: palette.inputText,
                fontSize: '13px',
                fontFamily: 'Sora, sans-serif',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'rgba(29,78,216,0.5)')}
              onBlur={(e) => (e.target.style.borderColor = palette.inputBorder)}
            />
          </div>
        </div>

        {/* Error / success */}
        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#FCA5A5',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              background: 'rgba(16,185,129,0.08)',
              border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: '8px',
              fontSize: '12px',
              color: '#6EE7B7',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
            {success}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          style={{
            width: '100%',
            padding: '11px',
            background: loading || !email || !password
              ? palette.submitDisabledBg
              : palette.submitBg,
            border: '1px solid rgba(29,78,216,0.35)',
            borderRadius: '8px',
            color: loading || !email || !password ? palette.submitDisabledText : palette.submitText,
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'Sora, sans-serif',
            cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {loading
            ? 'Please wait...'
            : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        {/* HIPAA note */}
        <p
          style={{
            marginTop: '20px',
            fontSize: '10px',
            color: palette.footnote,
            textAlign: 'center',
            lineHeight: '1.5',
          }}
        >
          For demo purposes only. No patient data is stored or transmitted.
        </p>
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { Moon, Sun } from 'lucide-react';
import { supabase } from '../supabase';
import { Patient } from '../types';

export interface PreSessionProps {
    onStart: (mode: 'live' | 'demo', patient: Patient) => void;
  }

const API = import.meta.env.VITE_API_URL || '/api';

export default function PreSession({ onStart }: PreSessionProps) {
  const [theme, setTheme]                 = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    return window.localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  });
  const [query, setQuery]                   = useState('');
  const [results, setResults]               = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [loading, setLoading]               = useState(false);
  const [showDropdown, setShowDropdown]     = useState(false);
  const debounceRef                         = useRef<ReturnType<typeof setTimeout> | null>(null);

  const palette = theme === 'dark'
    ? {
        pageBg: '#050C1A',
        topBarBg: '#0A1628',
        border: 'rgba(255,255,255,0.08)',
        subtleBorder: 'rgba(255,255,255,0.04)',
        title: '#E8F0FF',
        muted: '#2E4A66',
        inputText: '#E8F0FF',
        cardBg: '#0A1628',
        cardHover: 'rgba(29,78,216,0.1)',
        successBorder: 'rgba(16,185,129,0.2)',
        successText: '#10b981',
        actionBg: 'rgba(29,78,216,0.25)',
        actionBorder: 'rgba(29,78,216,0.35)',
        actionText: '#93BBFF',
        signOutText: '#2E4A66',
      }
    : {
        pageBg: '#F3F7FD',
        topBarBg: '#FFFFFF',
        border: 'rgba(148,163,184,0.35)',
        subtleBorder: 'rgba(148,163,184,0.2)',
        title: '#0F172A',
        muted: '#64748B',
        inputText: '#0F172A',
        cardBg: '#FFFFFF',
        cardHover: 'rgba(29,78,216,0.08)',
        successBorder: 'rgba(16,185,129,0.28)',
        successText: '#059669',
        actionBg: '#DBEAFE',
        actionBorder: 'rgba(29,78,216,0.25)',
        actionText: '#1D4ED8',
        signOutText: '#64748B',
      };

  // Recent consultations
  const [recent, setRecent] = useState<{ id: string; created_at: string; patients: Patient; soap: Record<string, unknown> }[]>([]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = theme;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    const fetchRecent = async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch(`${API}/consultations/recent`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) setRecent(json);
    };
    fetchRecent();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || selectedPatient) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`${API}/patients/search?q=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          setResults(await res.json());
          setShowDropdown(true);
        }
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query, selectedPatient]);

  const handleSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowDropdown(false);
    setQuery('');
  };

  const handleBack = () => {
    setSelectedPatient(null);
    setQuery('');
    setResults([]);
  };

  return (
    <div
      style={{
        minHeight: '100svh',
        background: palette.pageBg,
        fontFamily: 'Sora, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: '48px',
          background: palette.topBarBg,
          borderBottom: `1px solid ${palette.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
            <polyline points="1,11 5,11 7,4 9,18 11,9 13,14 15,11 21,11"
              stroke="#1d4ed8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8F0FF', letterSpacing: '-0.3px' }}>
            ClinicalEar
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'transparent',
              border: `1px solid ${palette.border}`,
              borderRadius: '6px',
              color: palette.muted,
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Sora, sans-serif',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
          >
            {theme === 'light' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            style={{
              background: 'transparent',
              border: `1px solid ${palette.border}`,
              borderRadius: '6px',
              color: palette.signOutText,
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'Sora, sans-serif',
              padding: '4px 10px',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#FCA5A5';
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
              e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = palette.signOutText;
              e.currentTarget.style.borderColor = palette.border;
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '80px' }}>

        <p style={{ fontSize: '11px', color: palette.muted, marginBottom: '8px', letterSpacing: '0.6px', fontWeight: 600, textTransform: 'uppercase' }}>
          New Consultation
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: palette.title, margin: '0 0 32px', letterSpacing: '-0.5px' }}>
          {selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'Search for a patient'}
        </h1>

        {/* Search / selected state */}
        <div style={{ width: '100%', maxWidth: '440px', position: 'relative' }}>

          {!selectedPatient ? (
            <>
              {/* Search input */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: palette.cardBg,
                  border: `1px solid ${palette.border}`,
                  borderRadius: '10px',
                  padding: '12px 16px',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={palette.muted} strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Search by name or MRN..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: palette.inputText,
                    fontSize: '13px',
                    fontFamily: 'Sora, sans-serif',
                  }}
                />
                {loading && (
                  <span style={{ fontSize: '10px', color: palette.muted }}>searching...</span>
                )}
              </div>

              {/* Dropdown */}
              {showDropdown && results.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: palette.cardBg,
                    border: `1px solid ${palette.border}`,
                    borderRadius: '10px',
                    overflow: 'hidden',
                    zIndex: 10,
                  }}
                >
                  {results.map((patient) => (
                    <div
                      key={patient.id}
                      onMouseDown={() => handleSelect(patient)}
                      style={{
                        padding: '10px 16px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: `1px solid ${palette.subtleBorder}`,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = palette.cardHover}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontSize: '13px', color: palette.title, fontWeight: 600 }}>
                        {patient.last_name}, {patient.first_name}
                      </span>
                      <span style={{ fontSize: '11px', color: palette.muted }}>
                        Health Number {patient.health_num}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Selected patient card */}
              <div
                style={{
                  background: palette.cardBg,
                  border: `1px solid ${palette.successBorder}`,
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: palette.successText, fontSize: '13px' }}>✓</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: palette.title }}>
                      {selectedPatient.last_name}, {selectedPatient.first_name}
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: palette.muted }}>
                      Health Number {selectedPatient.health_num} · DOB {selectedPatient.dob}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleBack}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${palette.border}`,
                    borderRadius: '6px',
                    color: palette.muted,
                    fontSize: '11px',
                    fontWeight: 600,
                    fontFamily: 'Sora, sans-serif',
                    padding: '4px 10px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = palette.actionText;
                    e.currentTarget.style.borderColor = 'rgba(29,78,216,0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = palette.muted;
                    e.currentTarget.style.borderColor = palette.border;
                  }}
                >
                  Change
                </button>
              </div>

              {/* Start buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={() => onStart('live', selectedPatient)}
                  style={{
                    flex: 1,
                    padding: '11px',
                    background: palette.actionBg,
                    border: `1px solid ${palette.actionBorder}`,
                    borderRadius: '8px',
                    color: palette.actionText,
                    fontSize: '13px',
                    fontWeight: 600,
                    fontFamily: 'Sora, sans-serif',
                    cursor: 'pointer',
                  }}
                >
                  Confirm
                </button>
              </div>
            </>
          )}
        </div>

        {/* Recent consultations */}
        {recent.length > 0 && (
          <div style={{ width: '100%', maxWidth: '440px', marginTop: '48px' }}>
            <p style={{
              fontSize: '11px', color: palette.muted, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px'
            }}>
              Recent Consultations
            </p>
            {recent.filter(c => c.patients).map((c) => (
              <div
                key={c.id}
                onClick={() => handleSelect(c.patients)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: `1px solid ${palette.subtleBorder}`,
                    cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                <div>
                    <p style={{ margin: 0, fontSize: '13px', color: palette.title, fontWeight: 600 }}>
                    {c.patients.last_name}, {c.patients.first_name}
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: palette.muted }}>
                    {new Date(c.created_at).toLocaleDateString()}
                    {c.soap?.assessment ? ` · ${String(c.soap.assessment).slice(0, 40)}...` : ''}
                    </p>
              </div>
            </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { Patient } from '../types';
import { Search, User, Calendar, Hash, Mic, Play, ArrowLeft, Clock, ChevronRight, Plus } from 'lucide-react';

export interface PreSessionProps {
  onStart: (mode: 'live' | 'demo', patient: Patient) => void;
}

const API = import.meta.env.VITE_API_URL || '/api';

type RecentConsult = {
  id: string;
  created_at: string;
  patients: Patient;
  soap: Record<string, unknown>;
};

function formatDob(dob?: string) {
  if (!dob) return '—';
  const d = new Date(dob);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function PreSession({ onStart }: PreSessionProps) {
  const [query, setQuery]                       = useState('');
  const [results, setResults]                   = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient]   = useState<Patient | null>(null);
  const [loading, setLoading]                   = useState(false);
  const [showDropdown, setShowDropdown]         = useState(false);
  const [recent, setRecent]                     = useState<RecentConsult[]>([]);
  const [recentLoading, setRecentLoading]       = useState(true);
  const debounceRef                             = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef                                = useRef<HTMLInputElement>(null);

  // Load recent consultations once on mount
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`${API}/consultations/recent`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setRecent(await res.json());
      } finally {
        setRecentLoading(false);
      }
    })();
  }, []);

  // Debounced patient search
  useEffect(() => {
    if (!query.trim() || selectedPatient) {
      setResults([]);
      setShowDropdown(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const res = await fetch(`${API}/patients/search?q=${encodeURIComponent(query.trim())}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const patients: Patient[] = await res.json();
          setResults(patients);
          setShowDropdown(true);
        }
      } finally {
        setLoading(false);
      }
    }, 280);
  }, [query, selectedPatient]);

  const handleSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    setShowDropdown(false);
    setQuery('');
  };

  const handleClear = () => {
    setSelectedPatient(null);
    setQuery('');
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div style={{ minHeight: '100svh', background: '#050C1A', fontFamily: 'Sora, sans-serif', display: 'flex', flexDirection: 'column' }}>

      {/* ── Top bar ── */}
      <div style={{
        height: '48px', background: '#091422',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center',
        padding: '0 20px', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 22 22" fill="none">
            <polyline points="1,11 5,11 7,4 9,18 11,9 13,14 15,11 21,11"
              stroke="#1d4ed8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#E8F0FF', letterSpacing: '-0.3px' }}>ClinicalEar</span>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '6px', color: '#2E4A66', fontSize: '11px',
            fontWeight: 600, fontFamily: 'Sora, sans-serif', padding: '4px 10px', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#FCA5A5'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#2E4A66'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'transparent'; }}
        >
          Sign Out
        </button>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 20px 40px' }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>

          {/* Page title */}
          <p style={{ fontSize: '11px', color: '#1E3A5A', marginBottom: '6px', letterSpacing: '0.8px', fontWeight: 700, textTransform: 'uppercase' }}>
            New Consultation
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#E8F0FF', margin: '0 0 28px', letterSpacing: '-0.5px' }}>
            {selectedPatient ? `${selectedPatient.first_name} ${selectedPatient.last_name}` : 'Find a patient'}
          </h1>

          {/* ── Patient search / selected card ── */}
          {!selectedPatient ? (
            <div style={{ position: 'relative' }}>
              {/* Search box */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: '#0A1628', border: '1px solid rgba(255,255,255,0.09)',
                borderRadius: '10px', padding: '11px 16px',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}>
                <Search size={14} color="#2E4A66" style={{ flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => results.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  placeholder="Search by name or health number…"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    color: '#E8F0FF', fontSize: '13px', fontFamily: 'Sora, sans-serif',
                  }}
                />
                {loading && <span style={{ fontSize: '10px', color: '#1E3A5A' }}>searching…</span>}
              </div>

              {/* Dropdown results */}
              {showDropdown && results.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#0D1E35', border: '1px solid rgba(255,255,255,0.09)',
                  borderRadius: '10px', overflow: 'hidden', zIndex: 10,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                }}>
                  {results.map((p, i) => (
                    <div
                      key={p.id}
                      onMouseDown={() => handleSelect(p)}
                      style={{
                        padding: '10px 16px', cursor: 'pointer',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(29,78,216,0.12)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '30px', height: '30px', borderRadius: '8px',
                          background: 'rgba(29,78,216,0.12)', border: '1px solid rgba(29,78,216,0.2)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          <User size={13} color="#4A7FCA" />
                        </div>
                        <div>
                          <p style={{ margin: 0, fontSize: '13px', color: '#E8F0FF', fontWeight: 600 }}>
                            {p.last_name}, {p.first_name}
                          </p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#2E4A66' }}>
                            DOB {formatDob(p.dob)}
                          </p>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', color: '#2E4A66', fontFamily: 'JetBrains Mono, monospace' }}>
                        #{p.health_num}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* No results hint */}
              {showDropdown && results.length === 0 && !loading && query.trim().length > 1 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: '#0D1E35', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '10px', padding: '14px 16px', zIndex: 10,
                  color: '#2E4A66', fontSize: '12px', textAlign: 'center',
                }}>
                  No patients found for "{query}"
                </div>
              )}
            </div>
          ) : (
            /* ── Selected patient — start session ── */
            <div>
              {/* Patient info card */}
              <div style={{
                background: '#0A1628',
                border: '1px solid rgba(16,185,129,0.22)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                {/* Card header */}
                <div style={{
                  padding: '12px 16px',
                  background: 'rgba(16,185,129,0.07)',
                  borderBottom: '1px solid rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px', height: '34px', borderRadius: '9px',
                      background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <User size={15} color="#34D399" />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#E8F0FF' }}>
                        {selectedPatient.first_name} {selectedPatient.last_name}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#2E4A66' }}>Patient selected</p>
                    </div>
                  </div>
                  <button
                    onClick={handleClear}
                    style={{
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: '6px', color: '#2E4A66', fontSize: '11px',
                      fontWeight: 600, fontFamily: 'Sora, sans-serif',
                      padding: '4px 10px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '4px',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#93BBFF'; e.currentTarget.style.borderColor = 'rgba(29,78,216,0.3)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#2E4A66'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; }}
                  >
                    <ArrowLeft size={11} /> Change
                  </button>
                </div>

                {/* Patient details grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {[
                    { icon: <Calendar size={12} color="#2E4A66" />, label: 'Date of Birth', value: formatDob(selectedPatient.dob) },
                    { icon: <Hash size={12} color="#2E4A66" />, label: 'Health Number', value: `#${selectedPatient.health_num}` },
                    { icon: <User size={12} color="#2E4A66" />, label: 'Patient ID', value: selectedPatient.id.slice(0, 8) + '…' },
                  ].map((item, i) => (
                    <div key={i} style={{
                      padding: '10px 14px',
                      borderRight: i < 2 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                        {item.icon}
                        <span style={{ fontSize: '9px', color: '#1E3A5A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {item.label}
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: '#7A9AB8', fontFamily: 'JetBrains Mono, monospace' }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Session type buttons */}
              <p style={{ fontSize: '11px', color: '#1E3A5A', margin: '20px 0 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                Choose session type
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>

                {/* Live session */}
                <button
                  onClick={() => onStart('live', selectedPatient)}
                  style={{
                    flex: 1, padding: '14px 12px',
                    background: 'rgba(29,78,216,0.18)',
                    border: '1px solid rgba(29,78,216,0.35)',
                    borderRadius: '10px', cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(29,78,216,0.26)'; e.currentTarget.style.borderColor = 'rgba(29,78,216,0.5)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(29,78,216,0.18)'; e.currentTarget.style.borderColor = 'rgba(29,78,216,0.35)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '7px',
                      background: 'rgba(29,78,216,0.25)', border: '1px solid rgba(29,78,216,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Mic size={13} color="#93BBFF" />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#93BBFF', fontFamily: 'Sora, sans-serif' }}>
                      Live Session
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#2E4A66', lineHeight: 1.5 }}>
                    Real-time transcription with ElevenLabs diarization
                  </p>
                </button>

                {/* Demo session */}
                <button
                  onClick={() => onStart('demo', selectedPatient)}
                  style={{
                    flex: 1, padding: '14px 12px',
                    background: 'rgba(139,92,246,0.1)',
                    border: '1px solid rgba(139,92,246,0.25)',
                    borderRadius: '10px', cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.18)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.25)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '7px',
                      background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Play size={13} color="#C4B5FD" />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#C4B5FD', fontFamily: 'Sora, sans-serif' }}>
                      Demo
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '11px', color: '#2E4A66', lineHeight: 1.5 }}>
                    Replay the sample heart failure consultation
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ── Recent consultations ── */}
          <div style={{ marginTop: '48px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={12} color="#1E3A5A" />
                <span style={{ fontSize: '11px', color: '#1E3A5A', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  Recent Consultations
                </span>
              </div>
            </div>

            {recentLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{
                    height: '60px', borderRadius: '10px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    animation: 'shimmer 1.5s infinite',
                  }} />
                ))}
              </div>
            )}

            {!recentLoading && recent.length === 0 && (
              <p style={{ fontSize: '12px', color: '#1A2E44', textAlign: 'center', padding: '20px 0' }}>
                No recent consultations
              </p>
            )}

            {!recentLoading && recent.filter((c) => c.patients).map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px',
                  background: '#0A1628',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '10px',
                  marginBottom: '6px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(29,78,216,0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
                onClick={() => handleSelect(c.patients)}
              >
                {/* Left: patient info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
                    background: 'rgba(29,78,216,0.1)', border: '1px solid rgba(29,78,216,0.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <User size={13} color="#4A7FCA" />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#CBD5E1', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.patients.last_name}, {c.patients.first_name}
                    </p>
                    <p style={{ margin: 0, fontSize: '11px', color: '#1E3A5A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.soap?.assessment ? `${String(c.soap.assessment).slice(0, 45)}…` : 'No assessment recorded'}
                    </p>
                  </div>
                </div>

                {/* Right: time + new consult button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
                  <span style={{ fontSize: '10px', color: '#1E3A5A' }}>{timeAgo(c.created_at)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStart('live', c.patients);
                    }}
                    title="Start new live consultation for this patient"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '4px 9px',
                      background: 'rgba(29,78,216,0.12)',
                      border: '1px solid rgba(29,78,216,0.25)',
                      borderRadius: '6px',
                      color: '#93BBFF',
                      fontSize: '11px', fontWeight: 600, fontFamily: 'Sora, sans-serif',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(29,78,216,0.22)'; e.currentTarget.style.borderColor = 'rgba(29,78,216,0.4)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(29,78,216,0.12)'; e.currentTarget.style.borderColor = 'rgba(29,78,216,0.25)'; }}
                  >
                    <Plus size={10} />
                    New Consult
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

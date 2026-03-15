import { useEffect, useState } from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import App from './App';
import Auth from './Auth';
import PreSession from './components/PreSession';
import { Patient } from './types';
import './index.css';

const THEME_STORAGE_KEY = 'theme';

function getBootTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = (window.localStorage.getItem(THEME_STORAGE_KEY) || '').trim().toLowerCase();
  if (stored === 'dark') return 'dark';
  window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
  return 'light';
}

function Root() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [patient, setPatient] = useState<Patient | null>(null);
    const [mode, setMode] = useState<'live' | 'demo' | null>(null);
  
    useEffect(() => {
      if (typeof document !== 'undefined') {
        document.documentElement.dataset.theme = getBootTheme();
      }

      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
  
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        // only update session on actual auth events, not on every render
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setPatient(null);
          setMode(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setSession(session);
        }
      });
  
      return () => subscription.unsubscribe();
    }, []);
  
    const handleStart = (selectedMode: 'live' | 'demo', selectedPatient: Patient) => {
      setPatient(selectedPatient);
      setMode(selectedMode);
    };
  
    const handleEndSession = () => {
      setPatient(null);
      setMode(null);
    };
  
    if (loading) return null;
    if (!session) return <Auth />;
    if (!patient) return <PreSession onStart={handleStart} />;
    return <App patient={patient} mode={mode} onEndSession={handleEndSession} />;
  }
  
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
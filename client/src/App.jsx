import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Leads from './pages/Leads.jsx';
import LeadDetail from './pages/LeadDetail.jsx';
import BulkUpload from './pages/BulkUpload.jsx';
import Sources from './pages/Sources.jsx';
import Users from './pages/Users.jsx';
import UserDetail from './pages/UserDetail.jsx';
import Reports from './pages/Reports.jsx';
import Schedule from './pages/Schedule.jsx';
import Voicemails from './pages/Voicemails.jsx';
import Queue from './pages/Queue.jsx';
import Settings from './pages/Settings.jsx';
import Scripts from './pages/Scripts.jsx';
import PowerDialer from './pages/PowerDialer.jsx';
import Commissions from './pages/Commissions.jsx';
import Revenue from './pages/Revenue.jsx';
import { DialerProvider } from './dialer/DialerContext.jsx';
import Softphone from './components/Softphone.jsx';

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <DialerProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" />} />
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<Leads />} />
        <Route path="/leads/import" element={<BulkUpload />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/revenue" element={<Revenue />} />
        <Route path="/commissions" element={<Commissions />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/voicemail" element={<Voicemails />} />
        <Route path="/queue" element={<Queue />} />
        <Route path="/dialer" element={<PowerDialer />} />
        <Route path="/scripts" element={<Scripts />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/sources" element={<Sources />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      <Softphone />
    </DialerProvider>
  );
}

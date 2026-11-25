import React, { useCallback, useEffect, useState } from 'react';
import { api, getAuthToken, setAuthToken } from './api';
import { FeedbackProvider } from './components/UiFeedback';
import AppShell from './components/AppShell';
import LoginView from './components/LoginView';
import Dashboard from './components/Dashboard';
import ReportsView from './components/ReportsView';
import ProjectorView from './components/ProjectorView';
import SessionDetail from './components/SessionDetail';
import StudentCheckIn from './components/StudentCheckIn';

function getCurrentPath() {
  return window.location.pathname;
}

function AppContent() {
  const [path, setPath] = useState(getCurrentPath());
  const [teacher, setTeacher] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('attendqr_theme') || 'light');

  const [classes, setClasses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [detailCrumb, setDetailCrumb] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('attendqr_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const navigate = useCallback((nextPath) => {
    if (nextPath !== window.location.pathname + window.location.search) {
      window.history.pushState({}, '', nextPath);
    }
    setPath(window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  useEffect(() => {
    const onPop = () => setPath(getCurrentPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (window.location.hash && window.location.hash.length > 1) {
      const hashParams = new URLSearchParams(window.location.hash.slice(1));
      const googleToken = hashParams.get('google_auth');
      const googleErr = hashParams.get('auth_error');
      if (googleToken || googleErr) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (googleToken) {
        setAuthToken(googleToken);
      }
      if (googleErr) {
        setAuthError(googleErr);
      }
    }

    const token = getAuthToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    api
      .me()
      .then((res) => {
        setAuthError('');
        setTeacher(res.teacher);
      })
      .catch(() => {
        setAuthToken('');
        setTeacher(null);
      })
      .finally(() => setCheckingAuth(false));
  }, []);

  const refreshWorkspace = useCallback(async () => {
    if (!teacher) return;
    setLoadingWorkspace(true);
    try {
      const [clsRes, sessRes] = await Promise.all([api.getClasses(), api.getSessions()]);
      setClasses(clsRes.classes);
      setSessions(sessRes.sessions);
    } catch {
    } finally {
      setLoadingWorkspace(false);
    }
  }, [teacher]);

  useEffect(() => {
    if (teacher) {
      refreshWorkspace();
    }
  }, [teacher, refreshWorkspace]);

  useEffect(() => {
    if (!path.startsWith('/session/')) {
      setDetailCrumb(null);
    }
  }, [path]);

  // Public student QR check-in route (QR code scan required)
  if (path === '/checkin' || path === '/scan') {
    return <StudentCheckIn onGoHome={() => navigate('/')} />;
  }

  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: 'var(--ink-muted)' }}>
        Loading AttendQR...
      </div>
    );
  }

  if (!teacher) {
    return (
      <LoginView
        initialError={authError}
        onAuthenticated={(t) => {
          setAuthError('');
          setTeacher(t);
          navigate('/');
        }}
      />
    );
  }

  // Full-bleed Projector route: /session/:id/present
  const presentMatch = path.match(/^\/session\/([^/]+)\/present$/);
  if (presentMatch) {
    const sessionId = presentMatch[1];
    return (
      <ProjectorView
        sessionId={sessionId}
        onBack={() => {
          refreshWorkspace();
          navigate('/');
        }}
        onOpenDetail={(id) => {
          refreshWorkspace();
          navigate(`/session/${id}`);
        }}
      />
    );
  }

  const liveSessions = sessions.filter((s) => s.status === 'active' || s.status === 'paused');
  const detailMatch = path.match(/^\/session\/([^/]+)$/);

  let pageContent = null;
  if (detailMatch) {
    const sessionId = detailMatch[1];
    pageContent = (
      <SessionDetail
        sessionId={sessionId}
        onBack={() => navigate('/sessions')}
        onOpenProjector={(id) => navigate(`/session/${id}/present`)}
        onSessionLoaded={(sess) =>
          setDetailCrumb({
            parentLabel: 'Attendance Register',
            parentPath: '/sessions',
            current: sess.title,
          })
        }
      />
    );
  } else if (path === '/reports') {
    pageContent = <ReportsView classes={classes} />;
  } else {
    const viewMode =
      path === '/sessions' ? 'sessions' : path === '/courses' ? 'courses' : 'overview';
    pageContent = (
      <Dashboard
        viewMode={viewMode}
        teacher={teacher}
        classes={classes}
        sessions={sessions}
        loading={loadingWorkspace}
        onRefresh={refreshWorkspace}
        onNavigate={navigate}
        onOpenProjector={(id) => navigate(`/session/${id}/present`)}
        onOpenSessionDetail={(id) => navigate(`/session/${id}`)}
      />
    );
  }

  return (
    <AppShell
      path={path}
      teacher={teacher}
      theme={theme}
      onToggleTheme={toggleTheme}
      onNavigate={navigate}
      onLogout={() => {
        setAuthToken('');
        setTeacher(null);
        navigate('/');
      }}
      liveSessions={liveSessions}
      onOpenProjector={(id) => navigate(`/session/${id}/present`)}
      breadcrumb={detailMatch ? detailCrumb : null}
    >
      {pageContent}
    </AppShell>
  );
}

export default function App() {
  return (
    <FeedbackProvider>
      <AppContent />
    </FeedbackProvider>
  );
}

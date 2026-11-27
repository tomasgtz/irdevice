import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { StatusProvider } from './status/StatusContext';
import { TopBar } from './components/TopBar';
import { Spinner } from './components/ui';
import { ForgotPassword, ResetPassword, SignIn, SignUp, Welcome } from './pages/AuthPages';
import Home from './pages/Home';
import AddDevice from './pages/AddDevice';
import Setup from './pages/Setup';
import Remote from './pages/Remote';
import EditControl from './pages/EditControl';
import Settings from './pages/Settings';

const LAST_KEY = 'lastPath';
const RESUMABLE = /^\/(home|add|settings|controls\/\d+(\/(setup|edit))?)$/;

function lastPath(): string {
  try {
    const p = localStorage.getItem(LAST_KEY);
    if (p && RESUMABLE.test(p)) return p;
  } catch { /* storage unavailable */ }
  return '/home';
}

/** "/" -> straight back to wherever the user left off (or the welcome screen if there's no session). */
function Root() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return <Navigate to={user ? lastPath() : '/welcome'} replace />;
}

function PublicOnly() {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function Protected() {
  const { user, ready } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    if (user && RESUMABLE.test(pathname)) {
      try { localStorage.setItem(LAST_KEY, pathname); } catch { /* ignore */ }
    }
  }, [pathname, user]);

  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/welcome" replace />;
  return (
    <StatusProvider>
      <div className="app">
        <TopBar />
        <Outlet />
      </div>
    </StatusProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route element={<PublicOnly />}>
            <Route path="/welcome" element={<Welcome />} />
            <Route path="/sign-in" element={<SignIn />} />
            <Route path="/sign-up" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Route>
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<Protected />}>
            <Route path="/home" element={<Home />} />
            <Route path="/add" element={<AddDevice />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/controls/:id" element={<Remote />} />
            <Route path="/controls/:id/setup" element={<Setup />} />
            <Route path="/controls/:id/edit" element={<EditControl />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

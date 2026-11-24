import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, LayoutGrid, Feather, LogOut, ShieldCheck } from 'lucide-react';
import { getToken, getTeacherName, clearToken } from './api.js';
import { APP_NAME, APP_TAGLINE, Avatar, ThemeToggle } from './components/ui.jsx';
import PrintPage from './pages/PrintPage.jsx';
import Login from './pages/Login.jsx';
import Classes from './pages/Classes.jsx';
import ClassPage from './pages/ClassPage.jsx';
import CommentsPage from './pages/CommentsPage.jsx';
import StylePage from './pages/StylePage.jsx';
import './styles.css';

function RequireLogin({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

function Layout({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const name = getTeacherName();
  const logout = () => {
    clearToken();
    navigate('/login');
  };
  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/" className="brand">
          <span className="brand-mark"><GraduationCap size={20} /></span>
          <span className="brand-name">{APP_NAME}<small>{APP_TAGLINE}</small></span>
        </Link>
        <nav className="nav">
          <Link to="/" className={pathname === '/' || pathname.startsWith('/classes') ? 'active' : ''}>
            <LayoutGrid size={18} /><span>Classes</span>
          </Link>
          <NavLink to="/style"><Feather size={18} /><span>My style</span></NavLink>
        </nav>
        <div className="sidebar-foot">
          <div className="privacy-note">
            <ShieldCheck size={16} />
            <span>Learner names are never sent to the AI.</span>
          </div>
          <div className="user">
            <Avatar name={name || 'T'} />
            <span className="user-name">{name || 'Teacher'}</span>
            <ThemeToggle />
            <button className="icon-btn" onClick={logout} title="Log out" aria-label="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

const page = (element) => <RequireLogin><Layout>{element}</Layout></RequireLogin>;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={page(<Classes />)} />
        <Route path="/classes/:id" element={page(<ClassPage />)} />
        <Route path="/classes/:id/comments" element={page(<CommentsPage />)} />
        <Route path="/classes/:id/print" element={<RequireLogin><PrintPage /></RequireLogin>} />
        <Route path="/style" element={page(<StylePage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

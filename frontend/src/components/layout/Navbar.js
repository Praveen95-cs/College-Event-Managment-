import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  TrophyIcon,
  MegaphoneIcon
} from '@heroicons/react/24/outline';
import Notifications from './Notifications';
import AvenorLogo from './AvenorLogo';

const linkClass = ({ isActive }) =>
  `inline-flex items-center gap-2 h-9 px-2.5 xl:px-3 rounded-[8px] text-[14px] font-medium whitespace-nowrap transition-colors duration-150 ${
    isActive
      ? 'bg-[#262421] text-[#efe9de] border border-[#efe9de]/[0.08]'
      : 'text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18] border border-transparent'
  }`;

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    setIsMobileMenuOpen(false);
    navigate('/');
  };

  return (
    <nav className="sticky top-0 z-40 bg-[#12110f]/95 backdrop-blur border-b border-[#efe9de]/[0.08]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="shrink-0 hover:opacity-90 transition-opacity duration-150">
              <AvenorLogo size="md" showSubtitle={false} />
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              <NavLink to="/" end className={linkClass}>
                Home
              </NavLink>
              <NavLink to="/events" className={linkClass}>
                <CalendarIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>Events</span>
              </NavLink>
              <NavLink to="/campus-feed" className={linkClass}>
                <MegaphoneIcon className="h-4 w-4 text-[#ebb05d] shrink-0" strokeWidth={1.5} />
                <span>Campus Feed</span>
              </NavLink>
              <NavLink to="/competitions" className={linkClass}>
                <TrophyIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>Competitions</span>
              </NavLink>
              {user && (user.role === 'admin' || user.role === 'organizer') && (
                <NavLink to="/create-event" className={linkClass}>
                  Create event
                </NavLink>
              )}
              <NavLink to="/community" className={linkClass}>
                <ChatBubbleLeftRightIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                <span>Community</span>
              </NavLink>
              {user?.role === 'admin' && (
                <NavLink to="/admin" className={linkClass}>
                  Admin
                </NavLink>
              )}
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <>
                <Notifications />
                <Link
                  to="/profile"
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-[8px] text-[14px] text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18] transition-colors duration-150 max-w-[220px]"
                >
                  <span className="truncate font-medium text-[#efe9de]">{user.name}</span>
                  <span className="text-[12px] font-mono text-[#ebb05d] shrink-0">{user.role}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[8px] text-[13px] font-medium text-[#efe9de] bg-[#262421] hover:bg-[#302d29] border border-[#efe9de]/10 transition-colors duration-150 active:scale-[0.98]"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4 text-[#aaa398]" strokeWidth={1.5} />
                  <span>Log out</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex items-center h-9 px-3.5 rounded-[8px] text-[14px] font-medium text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center h-9 px-4 rounded-[8px] text-[14px] font-medium text-[#12110f] bg-[#e09132] hover:bg-[#eb9f44] transition-colors duration-150 active:scale-[0.98]"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            {user && <Notifications />}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-[8px] text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18] transition-colors duration-150"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <XMarkIcon className="h-5 w-5" /> : <Bars3Icon className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden border-t border-[#efe9de]/[0.08] bg-[#12110f] px-4 py-3 space-y-1">
          <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#efe9de] hover:bg-[#1c1a18]">
            Home
          </Link>
          <Link to="/events" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
            Events
          </Link>
          <Link to="/campus-feed" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center gap-2 h-10 px-3 rounded-[8px] text-sm text-[#ebb05d] hover:text-[#efe9de] hover:bg-[#1c1a18]">
            <MegaphoneIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span>Campus Feed</span>
          </Link>
          <Link to="/competitions" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
            Competitions
          </Link>
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link to="/create-event" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
              Create event
            </Link>
          )}
          <Link to="/community" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
            Community
          </Link>
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
              Admin
            </Link>
          )}
          <div className="pt-2 mt-2 border-t border-[#efe9de]/[0.08] space-y-1">
            {user ? (
              <>
                <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#efe9de] hover:bg-[#1c1a18]">
                  Profile
                </Link>
                <button onClick={handleLogout} className="w-full text-left flex items-center h-10 px-3 rounded-[8px] text-sm text-[#e5484d] hover:bg-[#1c1a18]">
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm text-[#aaa398] hover:text-[#efe9de] hover:bg-[#1c1a18]">
                  Sign in
                </Link>
                <Link to="/register" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center h-10 px-3 rounded-[8px] text-sm font-medium text-[#ebb05d] hover:bg-[#1c1a18]">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;

import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  CalendarIcon,
  ChatBubbleLeftRightIcon,
  Bars3Icon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';
import Notifications from './Notifications';

const linkClass = ({ isActive }) =>
  `${isActive ? 'text-white border-violet-400' : 'text-gray-300 border-transparent hover:text-white hover:border-violet-400'} inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors`;

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
    <nav className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center min-w-0">
            <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-indigo-600 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-600/30 group-hover:shadow-violet-600/50 transition-all group-hover:scale-105">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L3 21h4.5l2-4.5h5l2 4.5H21L12 2z" />
                  <path d="M10.5 13.5h3" />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center">
                  Ave<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400">nor</span>
                </span>
                <span className="text-[10px] font-medium tracking-widest text-violet-400/80 uppercase -mt-1 hidden sm:block">
                  Elevate Every Event
                </span>
              </div>
            </Link>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-6">
              <NavLink to="/" end className={linkClass}>Home</NavLink>
              <NavLink to="/events" className={linkClass}>
                <CalendarIcon className="h-4 w-4 mr-1" />
                Events
              </NavLink>
              <NavLink to="/competitions" className={linkClass}>
                <TrophyIcon className="h-4 w-4 mr-1" />
                Competitions
              </NavLink>
              {user && (user.role === 'admin' || user.role === 'organizer') && (
                <NavLink to="/create-event" className={linkClass}>Create Event</NavLink>
              )}
              <NavLink to="/community" className={linkClass}>
                <ChatBubbleLeftRightIcon className="h-4 w-4 mr-1" />
                Community
              </NavLink>
              {user?.role === 'admin' && (
                <NavLink to="/admin" className={linkClass}>Admin</NavLink>
              )}
            </div>
          </div>

          <div className="hidden sm:flex sm:items-center sm:space-x-3">
            {user ? (
              <>
                <Notifications />
                <Link to="/profile" className="max-w-[180px] truncate text-sm text-gray-300 hover:text-white">
                  {user.name}
                  <span className="ml-2 text-xs uppercase tracking-wide text-violet-300">{user.role}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium text-white bg-gray-700 hover:bg-red-600 transition-colors"
                >
                  <ArrowRightOnRectangleIcon className="h-4 w-4 mr-1.5" />
                  Log out
                </button>
              </>
            ) : (
              <div className="flex space-x-3">
                <Link to="/login" className="px-4 py-2 rounded-md text-sm font-medium text-gray-100 bg-gray-800 hover:bg-gray-700">
                  Sign in
                </Link>
                <Link to="/register" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-violet-600 hover:bg-violet-700">
                  Sign up
                </Link>
              </div>
            )}
          </div>

          <div className="flex items-center sm:hidden">
            {user && <Notifications />}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="ml-2 p-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-800"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <XMarkIcon className="h-6 w-6" /> : <Bars3Icon className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-800 bg-gray-900 px-4 py-3 space-y-2">
          <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Home</Link>
          <Link to="/events" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Events</Link>
          <Link to="/competitions" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Competitions</Link>
          {user && (user.role === 'admin' || user.role === 'organizer') && (
            <Link to="/create-event" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Create Event</Link>
          )}
          <Link to="/community" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Community</Link>
          {user?.role === 'admin' && (
            <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Admin</Link>
          )}
          {user ? (
            <>
              <Link to="/profile" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Profile</Link>
              <button onClick={handleLogout} className="w-full text-left py-2 text-red-300">Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-gray-200">Sign in</Link>
              <Link to="/register" onClick={() => setIsMobileMenuOpen(false)} className="block py-2 text-violet-300">Sign up</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
};

export default Navbar;

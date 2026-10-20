import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-950 text-gray-400 py-10 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center shadow-md shadow-violet-600/30">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2L3 21h4.5l2-4.5h5l2 4.5H21L12 2z" />
                <path d="M10.5 13.5h3" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Ave<span className="text-violet-400">nor</span>
              </h3>
              <p className="text-xs text-gray-400">Elevate Every Event.</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <Link to="/events" className="hover:text-violet-300 transition-colors">Events</Link>
            <Link to="/competitions" className="hover:text-violet-300 transition-colors">Competitions</Link>
            <Link to="/community" className="hover:text-violet-300 transition-colors">Community</Link>
            <Link to="/about" className="hover:text-violet-300 transition-colors">About</Link>
            <Link to="/privacy-policy" className="hover:text-violet-300 transition-colors">Privacy</Link>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-gray-800/80 flex flex-col sm:flex-row justify-between items-center gap-2 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} Avenor Platform. All rights reserved.</p>
          <p className="text-gray-400">Built for College Students, Clubs & Campus Life</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

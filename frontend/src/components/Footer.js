import React from 'react';
import { Link } from 'react-router-dom';
import AvenorLogo from './AvenorLogo';

const Footer = () => {
  return (
    <footer className="bg-gray-950 text-gray-400 py-10 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <Link to="/" className="hover:opacity-90 transition-opacity">
            <AvenorLogo size="sm" subtitle="Elevate Every Event" />
          </Link>
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

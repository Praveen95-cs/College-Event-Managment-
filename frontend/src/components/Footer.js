import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-950 text-gray-400 py-8 border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h3 className="text-lg font-bold text-violet-400">College Event Manager</h3>
            <p className="text-sm">Discover, book, and run campus events.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-sm">
            <Link to="/events" className="hover:text-violet-300">Events</Link>
            <Link to="/community" className="hover:text-violet-300">Community</Link>
            <Link to="/about" className="hover:text-violet-300">About</Link>
            <Link to="/privacy-policy" className="hover:text-violet-300">Privacy</Link>
          </div>
        </div>
        <p className="mt-6 pt-6 border-t border-gray-800 text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} College Event Manager
        </p>
      </div>
    </footer>
  );
};

export default Footer;

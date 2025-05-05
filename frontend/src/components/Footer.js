import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-gray-300 py-8 border-t border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-xl font-bold text-violet-400">College Event Manager</h3>
            <p className="text-gray-400">Your one-stop solution for college events</p>
          </div>
          <div className="flex space-x-6">
            <Link to="/about" className="text-gray-400 hover:text-violet-400 transition-colors duration-200">About</Link>
            <Link to="/privacy-policy" className="text-gray-400 hover:text-violet-400 transition-colors duration-200">Privacy Policy</Link>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-400">
          <p>&copy; {new Date().getFullYear()} College Event Manager. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer; 
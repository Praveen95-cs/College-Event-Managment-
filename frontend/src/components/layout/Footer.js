import React from 'react';
import { Link } from 'react-router-dom';
import AvenorLogo from './AvenorLogo';

const Footer = () => {
  return (
    <footer className="bg-[#12110f] text-[#8a847a] py-10 border-t border-[#efe9de]/[0.08]">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <Link to="/" className="hover:opacity-90 transition-opacity duration-150">
            <AvenorLogo size="sm" showSubtitle={true} subtitle="Campus events and coding arenas" />
          </Link>
          <div className="flex flex-wrap gap-6 text-[14px] text-[#aaa398]">
            <Link to="/events" className="hover:text-[#efe9de] transition-colors duration-150">Events</Link>
            <Link to="/campus-feed" className="hover:text-[#efe9de] transition-colors duration-150">Campus Feed</Link>
            <Link to="/competitions" className="hover:text-[#efe9de] transition-colors duration-150">Competitions</Link>
            <Link to="/community" className="hover:text-[#efe9de] transition-colors duration-150">Community</Link>
            <Link to="/about" className="hover:text-[#efe9de] transition-colors duration-150">About</Link>
            <Link to="/privacy-policy" className="hover:text-[#efe9de] transition-colors duration-150">Privacy</Link>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-[#efe9de]/[0.06] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[12px] text-[#8a847a]">
          <p>&copy; {new Date().getFullYear()} Avenor. All rights reserved.</p>
          <p>Built for college students, clubs, and department organizers</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

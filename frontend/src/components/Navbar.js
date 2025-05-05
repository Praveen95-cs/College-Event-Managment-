import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { 
  HomeIcon, 
  CalendarIcon, 
  UserIcon, 
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

const Navbar = () => {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-gray-800 shadow-lg border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-2xl font-bold text-violet-400">
                College Events
              </Link>
            </div>
            {user && (
              <div className="ml-6">
                <Menu as="div" className="relative">
                  <div>
                    <Menu.Button className="bg-gray-700 rounded-full flex text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500">
                      <span className="sr-only">Open user menu</span>
                      <div className="h-8 w-8 rounded-full bg-violet-900 flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-violet-200" />
                      </div>
                    </Menu.Button>
                  </div>
                  <Transition
                    as={Fragment}
                    enter="transition ease-out duration-200"
                    enterFrom="transform opacity-0 scale-95"
                    enterTo="transform opacity-100 scale-100"
                    leave="transition ease-in duration-75"
                    leaveFrom="transform opacity-100 scale-100"
                    leaveTo="transform opacity-0 scale-95"
                  >
                    <Menu.Items className="origin-top-left absolute left-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <Menu.Item>
                        {({ active }) => (
                          <Link
                            to="/profile"
                            className={`${
                              active ? 'bg-gray-700' : ''
                            } block px-4 py-2 text-sm text-gray-300 hover:text-white`}
                          >
                            Your Profile
                          </Link>
                        )}
                      </Menu.Item>
                      {user.role === 'admin' && (
                        <Menu.Item>
                          {({ active }) => (
                            <Link
                              to="/admin"
                              className={`${
                                active ? 'bg-gray-700' : ''
                              } block px-4 py-2 text-sm text-gray-300 hover:text-white`}
                            >
                              Admin Dashboard
                            </Link>
                          )}
                        </Menu.Item>
                      )}
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={logout}
                            className={`${
                              active ? 'bg-gray-700' : ''
                            } block w-full text-left px-4 py-2 text-sm text-gray-300 hover:text-white`}
                          >
                            Sign out
                          </button>
                        )}
                      </Menu.Item>
                    </Menu.Items>
                  </Transition>
                </Menu>
              </div>
            )}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/"
                className="nav-link inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-violet-400 text-sm font-medium"
              >
                <HomeIcon className="h-5 w-5 mr-1" />
                Home
              </Link>
              <Link
                to="/events"
                className="nav-link inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-violet-400 text-sm font-medium"
              >
                <CalendarIcon className="h-5 w-5 mr-1" />
                Events
              </Link>
              <Link
                to="/motivation"
                className="nav-link inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-violet-400 text-sm font-medium"
              >
                Motivation
              </Link>
              <Link
                to="/community"
                className="nav-link inline-flex items-center px-1 pt-1 border-b-2 border-transparent hover:border-violet-400 text-sm font-medium"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-1" />
                Community
              </Link>
            </div>
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            {!user && (
              <div className="flex space-x-4">
                <Link
                  to="/login"
                  className="button-secondary px-4 py-2 rounded-md text-sm font-medium"
                >
                  Sign in
                </Link>
                <Link
                  to="/register"
                  className="button-primary px-4 py-2 rounded-md text-sm font-medium"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 
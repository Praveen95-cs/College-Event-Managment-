import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { 
  CalendarIcon, 
  UserGroupIcon, 
  BellIcon,
  CpuChipIcon,
  ArrowRightIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const Home = () => {
  const { user } = useAuth();
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const response = await axios.get('/api/events/public');
        setUpcomingEvents(Array.isArray(response.data) ? response.data.slice(0, 6) : []);
      } catch {
        setUpcomingEvents([]);
      }
    };
    loadEvents();
  }, []);

  const departments = [
    {
      name: 'Computer Technology',
      icon: CpuChipIcon,
      description: 'Explore the world of computer technology and software development'
    },
    {
      name: 'Information Technology',
      icon: CpuChipIcon,
      description: 'Discover networking, systems, and information services events'
    }
  ];

  const features = [
    {
      name: 'Event Discovery',
      description: 'Find and join exciting college events happening around you',
      icon: CalendarIcon,
      color: 'bg-gradient-to-br from-pink-500 to-rose-500'
    },
    {
      name: 'Community',
      description: 'Connect with students from your department and across campus',
      icon: UserGroupIcon,
      color: 'bg-gradient-to-br from-violet-500 to-purple-500'
    },
    {
      name: 'Real-time Updates',
      description: 'Stay informed with instant notifications about event changes',
      icon: BellIcon,
      color: 'bg-gradient-to-br from-cyan-500 to-blue-500'
    },
    {
      name: 'Interactive Learning',
      description: 'Engage in hands-on workshops and practical sessions',
      icon: SparklesIcon,
      color: 'bg-gradient-to-br from-amber-500 to-orange-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <img
            className="w-full h-full object-cover object-center"
            src="/images/college.png"
            alt="College campus"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-purple-900 to-gray-900 mix-blend-multiply opacity-90" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[linear-gradient(45deg,_rgba(0,0,0,0.1)_25%,_transparent_25%,_transparent_50%,_rgba(0,0,0,0.1)_50%,_rgba(0,0,0,0.1)_75%,_transparent_75%,_transparent)] bg-[length:20px_20px]" />
        </div>
        <div className="relative max-w-7xl mx-auto py-24 px-4 sm:py-32 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-sm font-semibold uppercase tracking-widest text-violet-300">Campus events, in one place</p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              {user ? `Welcome back, ${user.name.split(' ')[0]}` : 'College Event Manager'}
            </h1>
            <p className="mt-6 text-xl text-purple-100 max-w-3xl">
              Discover workshops, book seats, and stay in sync with your department.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Link
                to="/events"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-base font-medium text-gray-900 bg-white hover:bg-violet-50 transition-colors"
              >
                <CalendarIcon className="h-5 w-5 mr-2" />
                Browse Events
              </Link>
              {!user && (
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-base font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors"
                >
                  Get Started
                  <ArrowRightIcon className="h-5 w-5 ml-2" />
                </Link>
              )}
              {user?.role === 'student' && (
                <Link
                  to="/community"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-base font-medium text-white bg-white/10 hover:bg-white/20 transition-colors"
                >
                  Open community
                </Link>
              )}
              {(user?.role === 'admin' || user?.role === 'organizer') && (
                <Link
                  to={user.role === 'admin' ? '/admin' : '/create-event'}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-lg text-base font-medium text-white bg-violet-600 hover:bg-violet-700 transition-colors"
                >
                  {user.role === 'admin' ? 'Open dashboard' : 'Create an event'}
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base text-purple-400 font-semibold tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Everything you need to stay connected
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <motion.div
                key={feature.name}
                whileHover={{ y: -5 }}
                className="relative p-6 bg-gray-800 rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-200"
              >
                <div className={`absolute -top-4 left-4 p-3 rounded-lg ${feature.color} text-white`}>
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-white">{feature.name}</h3>
                <p className="mt-2 text-base text-gray-300">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Events Section */}
      <div className="py-16 bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base text-purple-400 font-semibold tracking-wide uppercase">Upcoming Events</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Don't miss out on these exciting events
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {upcomingEvents.length === 0 && (
              <p className="sm:col-span-2 text-center text-gray-400">
                No upcoming events yet. Check back after organizers publish events.
              </p>
            )}
            {upcomingEvents.map((event) => (
              <motion.div
                key={event._id}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-900 rounded-lg shadow-md overflow-hidden border border-gray-700"
              >
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white">{event.title}</h3>
                  <div className="mt-2 flex items-center text-sm text-gray-300">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    {event.date ? format(new Date(event.date), 'MMM d, yyyy') : ''} {event.time ? `at ${event.time}` : ''}
                  </div>
                  <div className="mt-4">
                    <Link
                      to={`/events/${event._id}`}
                      className="inline-flex items-center text-sm font-medium text-purple-400 hover:text-purple-300"
                    >
                      Learn more
                      <ArrowRightIcon className="h-4 w-4 ml-1" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Departments Section */}
      <div className="py-16 bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base text-purple-400 font-semibold tracking-wide uppercase">Departments</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Join Your Department
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((department) => (
              <motion.div
                key={department.name}
                whileHover={{ y: -5 }}
                className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700"
              >
                <div className="p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <span className="inline-flex p-3 rounded-lg bg-purple-900 text-purple-300">
                        <department.icon className="h-6 w-6" />
                      </span>
                    </div>
                    <div className="ml-4">
                      <h3 className="text-lg font-medium text-white">{department.name}</h3>
                    </div>
                  </div>
                  <p className="mt-4 text-base text-gray-300">{department.description}</p>
                  <Link
                    to="/events"
                    className="mt-6 inline-flex items-center text-sm font-medium text-purple-400 hover:text-purple-300"
                  >
                    View department events
                    <ArrowRightIcon className="h-4 w-4 ml-1" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {!user && (
        <div className="bg-gradient-to-r from-violet-900 to-gray-900">
          <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              <span className="block">New here?</span>
              <span className="block text-violet-200">Create a student account to book events.</span>
            </h2>
            <div className="mt-8 flex gap-3 lg:mt-0">
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-5 py-3 rounded-lg text-base font-medium text-gray-900 bg-white hover:bg-violet-50"
              >
                Create account
              </Link>
              <Link
                to="/events"
                className="inline-flex items-center justify-center px-5 py-3 rounded-lg text-base font-medium text-white bg-violet-600 hover:bg-violet-700"
              >
                Browse events
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home; 
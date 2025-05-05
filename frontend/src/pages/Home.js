import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    // Fetch upcoming events and announcements
    setUpcomingEvents([
      { id: 1, title: 'Tech Workshop', date: '2024-03-15', time: '10:00 AM' },
      { id: 2, title: 'Coding Competition', date: '2024-03-20', time: '2:00 PM' }
    ]);
    setAnnouncements([
      { id: 1, title: 'New Department Website', content: 'Check out our new department website!' },
      { id: 2, title: 'Scholarship Opportunities', content: 'Apply for scholarships now!' }
    ]);
  }, []);

  const departments = [
    {
      name: 'Computer Technology',
      icon: CpuChipIcon,
      description: 'Explore the world of computer technology and software development',
      stats: {
        students: '500+',
        events: '50+',
        projects: '100+'
      }
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
            <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Welcome to College Event Manager
            </h1>
            <p className="mt-6 text-xl text-purple-100 max-w-3xl">
              Your one-stop solution for managing and discovering college events. Connect with your department, stay updated, and make the most of your college experience.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to="/events"
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-white hover:bg-purple-50 transition-colors duration-200"
                >
                  <CalendarIcon className="h-5 w-5 mr-2" />
                  Browse Events
                </Link>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to="/register"
                  className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700 transition-colors duration-200"
                >
                  Get Started
                  <ArrowRightIcon className="h-5 w-5 ml-2" />
                </Link>
              </motion.div>
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
            {upcomingEvents.map((event) => (
              <motion.div
                key={event.id}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-900 rounded-lg shadow-md overflow-hidden border border-gray-700"
              >
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white">{event.title}</h3>
                  <div className="mt-2 flex items-center text-sm text-gray-300">
                    <CalendarIcon className="h-5 w-5 mr-2" />
                    {event.date} at {event.time}
                  </div>
                  <div className="mt-4">
                    <Link
                      to={`/events/${event.id}`}
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
                  <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-400">{department.stats.students}</p>
                      <p className="text-sm text-gray-400">Students</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-400">{department.stats.events}</p>
                      <p className="text-sm text-gray-400">Events</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-400">{department.stats.projects}</p>
                      <p className="text-sm text-gray-400">Projects</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Announcements Section */}
      <div className="py-16 bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base text-purple-400 font-semibold tracking-wide uppercase">Announcements</h2>
            <p className="mt-2 text-3xl leading-8 font-extrabold tracking-tight text-white sm:text-4xl">
              Stay Updated
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-2">
            {announcements.map((announcement) => (
              <motion.div
                key={announcement.id}
                whileHover={{ scale: 1.02 }}
                className="bg-gray-900 rounded-lg shadow-md overflow-hidden border border-gray-700"
              >
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white">{announcement.title}</h3>
                  <p className="mt-2 text-base text-gray-300">{announcement.content}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-purple-900 to-gray-900">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:py-16 lg:px-8 lg:flex lg:items-center lg:justify-between">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span className="block">Ready to get started?</span>
            <span className="block text-purple-200">Join our community today.</span>
          </h2>
          <div className="mt-8 flex lg:mt-0 lg:flex-shrink-0">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="inline-flex rounded-md shadow"
            >
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-gray-900 bg-white hover:bg-purple-50"
              >
                Get started
              </Link>
            </motion.div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="ml-3 inline-flex rounded-md shadow"
            >
              <Link
                to="/events"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
              >
                Learn more
              </Link>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 
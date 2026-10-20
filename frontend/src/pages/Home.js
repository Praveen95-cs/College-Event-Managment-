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
  SparklesIcon,
  TrophyIcon,
  AcademicCapIcon,
  TicketIcon,
  BuildingLibraryIcon,
  CodeBracketIcon
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

  const stats = [
    { label: 'Campus Events & Fests', value: '50+', icon: CalendarIcon, color: 'text-amber-400' },
    { label: 'Department Clubs', value: '12+', icon: BuildingLibraryIcon, color: 'text-violet-400' },
    { label: 'Active Students', value: '1,500+', icon: UserGroupIcon, color: 'text-emerald-400' },
    { label: 'Live Contests', value: 'Live 24/7', icon: TrophyIcon, color: 'text-cyan-400' }
  ];

  const departments = [
    {
      name: 'Computer Technology',
      icon: CpuChipIcon,
      tag: 'Coding, AI & Web Dev',
      description: 'Host to technical hackathons, algorithmic coding battles, open-source workshops, and guest tech talks.'
    },
    {
      name: 'Information Technology',
      icon: CpuChipIcon,
      tag: 'Cloud, Cyber & Systems',
      description: 'Hands-on network security clinics, cloud architecture seminars, and system design challenges.'
    },
    {
      name: 'Campus Arts & Culture',
      icon: SparklesIcon,
      tag: 'Fests & Creativity',
      description: 'Annual cultural galas, inter-college music and dance competitions, drama fests, and photography clubs.'
    }
  ];

  const features = [
    {
      name: 'Campus Fests & Workshops',
      description: 'Discover annual cultural fests, technical symposiums, hands-on lab sessions, and guest seminars.',
      icon: CalendarIcon,
      color: 'from-amber-500 to-orange-600',
      tag: 'Events'
    },
    {
      name: 'Coding Battles & Quizzes',
      description: 'Compete in timed programming arenas with Monaco Editor (Python, C++, Java, JS) and live campus leaderboards.',
      icon: CodeBracketIcon,
      color: 'from-cyan-500 to-blue-600',
      tag: 'Competitions'
    },
    {
      name: 'Student Department Hub',
      description: 'Connect with peers, collaborate on student club initiatives, and stay tuned to department announcements.',
      icon: UserGroupIcon,
      color: 'from-violet-500 to-purple-600',
      tag: 'Community'
    },
    {
      name: 'Instant RSVP & Reminders',
      description: 'One-click event bookings, instant seat reservations, real-time schedule updates, and live alerts.',
      icon: TicketIcon,
      color: 'from-emerald-500 to-teal-600',
      tag: 'Smart Access'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-violet-500 selection:text-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden border-b border-gray-800/80 bg-gradient-to-b from-gray-900 via-gray-950 to-gray-950">
        <div className="absolute inset-0">
          <img
            className="w-full h-full object-cover object-center opacity-25 filter brightness-75 contrast-125"
            src="/images/college.png"
            alt="College campus grounds"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/80 to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-violet-900/30 via-transparent to-transparent" />
        </div>

        <div className="relative max-w-7xl mx-auto pt-20 pb-24 px-4 sm:pt-28 sm:pb-32 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            {/* Campus Pill Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30 mb-6 backdrop-blur-md">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
              </span>
              <span>🎓 College Campus Events & Student Life Portal</span>
            </div>

            {/* Main Title */}
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
              {user ? (
                <>Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-fuchsia-400">{user.name.split(' ')[0]}</span>!</>
              ) : (
                <>
                  Your Campus.<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-indigo-300 to-fuchsia-400">
                    Your Events. Your Stage.
                  </span>
                </>
              )}
            </h1>

            {/* Brand Tagline & Real Human Campus Story */}
            <p className="mt-4 text-xl sm:text-2xl font-bold text-gray-200">
              Avenor — <span className="text-violet-300">Elevate Every Event.</span>
            </p>
            <p className="mt-3 text-base sm:text-lg text-gray-300 leading-relaxed">
              The central gathering place for university cultural fests, department symposiums, tech hackathons, and student club meetups. Join your friends, compete on live leaderboards, and experience campus life to the fullest.
            </p>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                to="/events"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-gray-950 bg-white hover:bg-violet-50 transition-all shadow-lg hover:shadow-violet-500/20 hover:-translate-y-0.5"
              >
                <CalendarIcon className="h-5 w-5 mr-2 text-violet-700" />
                Explore Campus Events
              </Link>
              <Link
                to="/competitions"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-all shadow-lg shadow-violet-600/30 hover:-translate-y-0.5"
              >
                <TrophyIcon className="h-5 w-5 mr-2" />
                Coding & Quiz Arena
              </Link>
              {!user && (
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl text-base font-semibold text-gray-200 bg-gray-900/90 hover:bg-gray-800 border border-gray-700 transition-all hover:-translate-y-0.5"
                >
                  Student Sign Up
                  <ArrowRightIcon className="h-4 w-4 ml-2" />
                </Link>
              )}
            </div>
          </motion.div>

          {/* Quick Stats Grid */}
          <div className="mt-16 pt-10 border-t border-gray-800/80 grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((s, idx) => (
              <div key={idx} className="flex items-center gap-3 bg-gray-900/40 border border-gray-800/60 rounded-xl p-4 backdrop-blur-sm">
                <div className={`p-2.5 rounded-lg bg-gray-800/80 ${s.color}`}>
                  <s.icon className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-xl sm:text-2xl font-black text-white">{s.value}</div>
                  <div className="text-xs text-gray-400 font-medium">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Campus Pillars Section */}
      <div className="py-20 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold tracking-widest text-violet-400 uppercase bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
              Campus Life Experience
            </span>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Everything Happening on Campus, in One Place
            </h2>
            <p className="mt-3 text-base text-gray-400">
              Built specifically for college students, organizers, and faculty to keep campus buzzing with opportunities.
            </p>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <motion.div
                key={feature.name}
                whileHover={{ y: -4 }}
                className="relative p-6 bg-gray-900/80 rounded-2xl border border-gray-800/80 shadow-lg hover:border-violet-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.color} text-white shadow-md`}>
                      <feature.icon className="h-6 w-6" />
                    </div>
                    <span className="text-[11px] font-semibold text-gray-400 bg-gray-800 px-2.5 py-1 rounded-full">
                      {feature.tag}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight">{feature.name}</h3>
                  <p className="mt-2 text-sm text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-800/60">
                  <Link
                    to={feature.tag === 'Competitions' ? '/competitions' : feature.tag === 'Community' ? '/community' : '/events'}
                    className="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-violet-300"
                  >
                    Explore feature <ArrowRightIcon className="h-3 w-3 ml-1" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Upcoming Events Section */}
      <div className="py-20 bg-gray-900/50 border-y border-gray-800/70">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <span className="text-xs font-bold tracking-widest text-violet-400 uppercase bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
                Live Campus Calendar
              </span>
              <h2 className="mt-3 text-3xl font-extrabold text-white tracking-tight">
                Featured Campus Events
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                Book your pass early before seats fill up.
              </p>
            </div>
            <Link
              to="/events"
              className="inline-flex items-center text-sm font-semibold text-violet-400 hover:text-violet-300"
            >
              View full calendar <ArrowRightIcon className="h-4 w-4 ml-1.5" />
            </Link>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingEvents.length === 0 ? (
              <div className="sm:col-span-3 text-center py-16 bg-gray-900/40 rounded-2xl border border-dashed border-gray-800">
                <CalendarIcon className="h-10 w-10 text-gray-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-gray-300">No events currently scheduled</h3>
                <p className="text-xs text-gray-500 mt-1">Student organizers will publish new fests and symposiums soon.</p>
                {(user?.role === 'organizer' || user?.role === 'admin') && (
                  <Link
                    to="/create-event"
                    className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700"
                  >
                    Create the first event
                  </Link>
                )}
              </div>
            ) : (
              upcomingEvents.map((event) => (
                <motion.div
                  key={event._id}
                  whileHover={{ y: -3 }}
                  className="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-md hover:border-gray-700 transition-all flex flex-col justify-between"
                >
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-2 text-xs text-violet-400 font-semibold mb-2">
                      <span className="bg-violet-500/10 px-2.5 py-1 rounded-md border border-violet-500/20">
                        {event.department || 'Campus Wide'}
                      </span>
                      {event.category && (
                        <span className="text-gray-400 capitalize">{event.category}</span>
                      )}
                    </div>
                    <h3 className="text-lg font-bold text-white line-clamp-1">{event.title}</h3>
                    <p className="mt-2 text-xs text-gray-400 line-clamp-2">
                      {event.description || 'Join your classmates and department members for this upcoming college event.'}
                    </p>
                    <div className="mt-4 flex items-center text-xs text-gray-300 gap-4">
                      <span className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-1.5 text-violet-400" />
                        {event.date ? format(new Date(event.date), 'MMM d, yyyy') : 'TBD'}
                      </span>
                      {event.time && (
                        <span className="text-gray-400">at {event.time}</span>
                      )}
                    </div>
                  </div>

                  <div className="px-6 py-3.5 bg-gray-950/60 border-t border-gray-800/80 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-medium">
                      {event.capacity ? `${event.capacity} Seats` : 'Open Entry'}
                    </span>
                    <Link
                      to={`/events/${event._id}`}
                      className="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-white"
                    >
                      Event Details <ArrowRightIcon className="h-3 w-3 ml-1" />
                    </Link>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Departments & Student Societies */}
      <div className="py-20 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto">
            <span className="text-xs font-bold tracking-widest text-violet-400 uppercase bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
              Department Hubs
            </span>
            <h2 className="mt-4 text-3xl font-extrabold text-white tracking-tight">
              Connect With Your Department
            </h2>
            <p className="mt-3 text-sm text-gray-400">
              Find activities, student clubs, and technical sessions tailored to your branch.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((dept) => (
              <motion.div
                key={dept.name}
                whileHover={{ y: -4 }}
                className="p-6 bg-gray-900/70 rounded-2xl border border-gray-800 hover:border-violet-500/40 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 rounded-xl bg-violet-950 text-violet-400 border border-violet-800/50">
                      <dept.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{dept.name}</h3>
                      <span className="text-xs text-violet-400 font-medium">{dept.tag}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">{dept.description}</p>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-800">
                  <Link
                    to="/events"
                    className="inline-flex items-center text-xs font-semibold text-violet-400 hover:text-violet-300"
                  >
                    View branch events <ArrowRightIcon className="h-3 w-3 ml-1" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Campus Community Callout */}
      {!user && (
        <div className="relative overflow-hidden bg-gradient-to-r from-violet-950 via-indigo-950 to-gray-950 border-t border-violet-800/40 py-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-2xl text-center lg:text-left">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-violet-500/20 text-violet-300 border border-violet-500/30 mb-3">
                <AcademicCapIcon className="h-4 w-4" /> Anna University Student Community
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                Be Part of Campus Life at Avenor
              </h2>
              <p className="mt-3 text-sm text-gray-300">
                Create a student profile to RSVP for cultural nights, enroll in coding challenges, get event passes, and never miss what's happening on campus.
              </p>
            </div>
            <div className="flex flex-wrap gap-4 shrink-0">
              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl text-sm font-semibold text-gray-950 bg-white hover:bg-violet-50 shadow-lg transition-all"
              >
                Join with Student Email
              </Link>
              <Link
                to="/events"
                className="px-6 py-3.5 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 shadow-md transition-all"
              >
                Browse All Events
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
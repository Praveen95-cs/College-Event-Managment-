import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { 
  CalendarIcon, 
  UserGroupIcon, 
  ArrowRightIcon,
  TrophyIcon,
  AcademicCapIcon,
  ClockIcon,
  MapPinIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { AvenorMark } from '../components/AvenorLogo';

const Home = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchCampusData = async () => {
      try {
        const [eventsRes, compRes] = await Promise.allSettled([
          axios.get('/api/events/public'),
          axios.get('/api/competitions')
        ]);

        if (isMounted) {
          if (eventsRes.status === 'fulfilled' && Array.isArray(eventsRes.value.data)) {
            setEvents(eventsRes.value.data.slice(0, 4));
          } else {
            setEvents([]);
          }

          if (compRes.status === 'fulfilled' && Array.isArray(compRes.value.data)) {
            const activeComps = compRes.value.data.filter(c => c.status === 'published' || c.status === 'active');
            setCompetitions(activeComps.slice(0, 3));
          } else {
            setCompetitions([]);
          }
        }
      } catch {
        if (isMounted) {
          setEvents([]);
          setCompetitions([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCampusData();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 selection:bg-violet-600 selection:text-white">
      {/* Hero Welcome Section with Campus Background Image */}
      <section className="relative overflow-hidden border-b border-gray-800/80 bg-gray-950 pt-16 pb-24 px-4 sm:px-6 lg:px-8">
        {/* Campus Background Image & Overlays */}
        <div className="absolute inset-0 pointer-events-none select-none z-0">
          <img
            src="/images/college.png"
            alt="College Campus"
            className="w-full h-full object-cover object-center opacity-30 filter brightness-90 contrast-110"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/85 to-gray-950/60" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-950/40 via-transparent to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* Prominent Logo Section */}
          <div className="inline-flex items-center gap-3 p-2 pr-4 rounded-2xl bg-gray-900/80 border border-violet-500/30 shadow-xl backdrop-blur-md mb-6 hover:border-violet-500/50 transition">
            <AvenorMark size="md" />
            <div className="text-left">
              <span className="text-xs font-black tracking-wider text-white uppercase block leading-none">
                AVENOR
              </span>
              <span className="text-[10px] font-medium text-violet-300 block mt-0.5 leading-none">
                Elevate Every Event
              </span>
            </div>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white max-w-3xl mx-auto leading-tight">
            {user ? (
              <>
                Welcome, <span className="text-violet-400">{user.name.split(' ')[0]}</span>.
                <br />
                <span className="text-gray-300 text-2xl sm:text-3xl font-medium block mt-2">
                  Here is what's happening on campus today.
                </span>
              </>
            ) : (
              <>
                Welcome to <span className="text-violet-400">Avenor</span>
                <br />
                <span className="text-gray-200 text-2xl sm:text-4xl font-semibold block mt-2">
                  College Events, Workshops & Competitions
                </span>
              </>
            )}
          </h1>

          <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            The official place to discover college fests, register for department workshops, and join student coding challenges.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/events"
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-950 bg-white hover:bg-gray-100 transition shadow"
            >
              <CalendarIcon className="h-4 w-4 mr-2 text-violet-600" />
              Browse Events
            </Link>
            <Link
              to="/competitions"
              className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 transition shadow"
            >
              <TrophyIcon className="h-4 w-4 mr-2" />
              Coding Arena
            </Link>
            {!user ? (
              <Link
                to="/register"
                className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-gray-900 hover:bg-gray-800 border border-gray-700 transition"
              >
                Sign Up as Student
              </Link>
            ) : (
              (user.role === 'organizer' || user.role === 'admin') && (
                <Link
                  to="/create-event"
                  className="inline-flex items-center px-5 py-2.5 rounded-lg text-sm font-medium text-gray-300 bg-gray-900 hover:bg-gray-800 border border-gray-700 transition"
                >
                  Post New Event
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      {/* Fresher-Friendly Quick Start Guide */}
      <section className="py-12 border-b border-gray-800/80 bg-gray-900/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white tracking-tight">New to Campus? How It Works</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">Get involved in campus life in three simple steps.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-sm mb-3">
                1
              </div>
              <h3 className="text-base font-semibold text-white">Find Events</h3>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                Check the campus calendar for upcoming symposiums, technical seminars, cultural fests, and club meetups.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-sm mb-3">
                2
              </div>
              <h3 className="text-base font-semibold text-white">One-Click Registration</h3>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                Reserve your seat instantly with your student account. Get timely reminders so you never miss an event.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-gray-900 border border-gray-800">
              <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center font-bold text-sm mb-3">
                3
              </div>
              <h3 className="text-base font-semibold text-white">Compete & Connect</h3>
              <p className="mt-1 text-xs text-gray-400 leading-relaxed">
                Participate in coding battles and department quizzes, view live leaderboards, and meet peers across branches.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Real Upcoming Events Section */}
      <section className="py-16 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Upcoming Campus Events</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">Real-time schedule of workshops, fests, and symposiums.</p>
          </div>
          <Link
            to="/events"
            className="inline-flex items-center text-xs sm:text-sm font-semibold text-violet-400 hover:text-violet-300 transition"
          >
            View all events <ArrowRightIcon className="h-3.5 w-3.5 ml-1" />
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12 text-sm text-gray-500">
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 rounded-xl bg-gray-900/60 border border-gray-800 text-center">
            <CalendarIcon className="h-10 w-10 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-200">No events currently scheduled</h3>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-md mx-auto">
              Organizers and student coordinators will publish upcoming events here. Check back soon!
            </p>
            {(user?.role === 'organizer' || user?.role === 'admin') && (
              <Link
                to="/create-event"
                className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700"
              >
                Post an event now
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {events.map((event) => (
              <div
                key={event._id}
                className="p-5 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                    <span className="font-medium text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">
                      {event.department || 'Campus'}
                    </span>
                    <span className="capitalize">{event.type || 'Event'}</span>
                  </div>
                  <h3 className="text-base font-bold text-white line-clamp-1">{event.title}</h3>
                  <p className="mt-1.5 text-xs text-gray-400 line-clamp-2">
                    {event.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-300">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center text-gray-400">
                      <ClockIcon className="h-3.5 w-3.5 mr-1 text-gray-500" />
                      {event.date ? format(new Date(event.date), 'MMM d') : 'TBD'}
                    </span>
                    {event.location && (
                      <span className="flex items-center text-gray-400">
                        <MapPinIcon className="h-3.5 w-3.5 mr-1 text-gray-500" />
                        {event.location}
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/events/${event._id}`}
                    className="font-semibold text-violet-400 hover:text-white"
                  >
                    Details &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Real Live Competitions Section (If any exist) */}
      {competitions.length > 0 && (
        <section className="py-12 border-t border-gray-800/80 bg-gray-900/20">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Active Competitions</h2>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">Live challenges currently open for student entries.</p>
              </div>
              <Link
                to="/competitions"
                className="inline-flex items-center text-xs sm:text-sm font-semibold text-violet-400 hover:text-violet-300 transition"
              >
                All Competitions &rarr;
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {competitions.map((comp) => (
                <div key={comp._id} className="p-4 rounded-xl bg-gray-900 border border-gray-800 flex flex-col justify-between">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
                      Live
                    </span>
                    <h3 className="text-sm font-bold text-white line-clamp-1">{comp.title}</h3>
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">{comp.description}</p>
                  </div>
                  <Link
                    to={`/competitions/${comp._id}`}
                    className="mt-4 inline-flex items-center text-xs font-semibold text-violet-400 hover:text-white"
                  >
                    Enter Arena &rarr;
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Simple Fresher Resources Section */}
      <section className="py-14 border-t border-gray-800 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl font-bold text-white tracking-tight mb-6">Student Resources & Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Link
            to="/events"
            className="p-5 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-gray-700 transition block group"
          >
            <div className="p-2.5 rounded-lg bg-gray-800 text-violet-400 inline-block mb-3 group-hover:bg-violet-600 group-hover:text-white transition">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Event Hub</h3>
            <p className="mt-1 text-xs text-gray-400">Search by department, event type, or date.</p>
          </Link>

          <Link
            to="/competitions"
            className="p-5 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-gray-700 transition block group"
          >
            <div className="p-2.5 rounded-lg bg-gray-800 text-violet-400 inline-block mb-3 group-hover:bg-violet-600 group-hover:text-white transition">
              <TrophyIcon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Coding & Quizzes</h3>
            <p className="mt-1 text-xs text-gray-400">Practice with Monaco Editor in Python, C++, Java, or JS.</p>
          </Link>

          <Link
            to="/community"
            className="p-5 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-gray-700 transition block group"
          >
            <div className="p-2.5 rounded-lg bg-gray-800 text-violet-400 inline-block mb-3 group-hover:bg-violet-600 group-hover:text-white transition">
              <ChatBubbleLeftRightIcon className="h-5 w-5" />
            </div>
            <h3 className="text-sm font-bold text-white">Campus Community</h3>
            <p className="mt-1 text-xs text-gray-400">Stay informed with announcements and peer discussions.</p>
          </Link>
        </div>
      </section>

      {/* Helpful Student Callout */}
      {!user && (
        <section className="py-12 border-t border-gray-800/80 bg-gray-900/40">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-base font-bold text-white">Ready to join your first campus event?</h3>
              <p className="text-xs text-gray-400 mt-0.5">Create your student account in under a minute.</p>
            </div>
            <Link
              to="/register"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-950 bg-white hover:bg-gray-100 transition shadow"
            >
              Sign Up Now
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;
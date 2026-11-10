import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import {
  CalendarIcon,
  ArrowRightIcon,
  TrophyIcon,
  ClockIcon,
  MapPinIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import AvenorLoader from '../../components/common/AvenorLoader';

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
            const activeComps = compRes.value.data.filter(
              c => c.status === 'published' || c.status === 'active'
            );
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
    return () => {
      isMounted = false;
    };
  }, []);

  const nextEvent = events[0];

  return (
    <div className="bg-[#161513] text-[#efe9de]">
      {/* Asymmetric Split Hero */}
      <section className="border-b border-[#efe9de]/[0.08] pt-12 pb-16 lg:pt-20 lg:pb-24">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-6 text-left">
              <div className="inline-flex items-center gap-3 mb-6">
                <img
                  src="/favicon.svg"
                  alt="Avenor logo"
                  className="w-10 h-10 rounded-[10px] shrink-0"
                />
                <div className="flex flex-col">
                  <span className="text-[18px] font-semibold tracking-[-0.015em] text-[#efe9de] leading-none">
                    Avenor
                  </span>
                  <span className="text-[12px] text-[#8a847a] mt-1 leading-none">
                    Campus events and coding arenas
                  </span>
                </div>
              </div>

              {user && (
                <p className="text-[13px] font-mono text-[#ebb05d] mb-4">
                  {user.name} · {user.department || user.role}
                </p>
              )}

              <h1 className="text-[36px] sm:text-[48px] lg:text-[54px] font-medium tracking-[-0.025em] leading-[1.06] text-[#efe9de]">
                {user
                  ? 'Campus schedule and live arenas'
                  : 'Campus events, workshops, and live coding arenas'}
              </h1>

              <p className="mt-5 text-[16px] sm:text-[18px] text-[#aaa398] max-w-[34rem] leading-[1.6]">
                Browse department symposiums, reserve seats in seconds, and compete in timed quizzes and coding rounds across campus.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/events" className="btn-primary h-11 px-5">
                  <CalendarIcon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                  <span>Browse events</span>
                </Link>
                <Link to="/competitions" className="btn-secondary h-11 px-5">
                  <TrophyIcon className="h-4 w-4 text-[#aaa398] shrink-0" strokeWidth={1.5} />
                  <span>Coding arena</span>
                </Link>
              </div>

              {user && (user.role === 'organizer' || user.role === 'admin') ? (
                <div className="mt-5">
                  <Link
                    to="/create-event"
                    className="inline-flex items-center gap-1.5 text-[14px] text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150"
                  >
                    <span>Post a new event</span>
                    <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Link>
                </div>
              ) : !user ? (
                <div className="mt-5">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-1.5 text-[14px] text-[#aaa398] hover:text-[#efe9de] transition-colors duration-150"
                  >
                    <span>New student? Create an account</span>
                    <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-[14px] overflow-hidden border border-[#efe9de]/[0.1] bg-[#1c1a18]">
                <div className="relative aspect-[16/10] overflow-hidden bg-[#12110f]">
                  <img
                    src="/images/college.png"
                    alt="Students working at desktop terminals inside a sunlit campus computer lab"
                    className="w-full h-full object-cover object-center"
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'linear-gradient(to top, rgba(28, 26, 24, 0.92) 0%, rgba(28, 26, 24, 0.15) 38%, transparent 100%)'
                    }}
                  />
                </div>

                <div className="px-5 py-4 border-t border-[#efe9de]/[0.08] flex items-center justify-between gap-4 bg-[#1c1a18]">
                  {nextEvent ? (
                    <>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[12px] text-[#8a847a] font-mono tabular-nums">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#e09132]" />
                          <span>Next on schedule</span>
                          <span>·</span>
                          <span>{nextEvent.date ? format(new Date(nextEvent.date), 'MMM d') : 'TBD'}</span>
                        </div>
                        <p className="text-[14px] font-medium text-[#efe9de] truncate mt-0.5">
                          {nextEvent.title}
                        </p>
                      </div>
                      <Link
                        to={`/events/${nextEvent._id}`}
                        className="shrink-0 whitespace-nowrap text-[13px] font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150"
                      >
                        Details
                      </Link>
                    </>
                  ) : (
                    <div className="flex items-center justify-between gap-4 w-full text-[13px] text-[#8a847a]">
                      <span className="min-w-0">Campus computer lab and event schedule</span>
                      <Link
                        to="/events"
                        className="text-[#ebb05d] hover:text-[#efe9de] font-medium shrink-0 whitespace-nowrap transition-colors duration-150"
                      >
                        View calendar
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Three-Step Campus Flow */}
      <section className="py-14 border-b border-[#efe9de]/[0.08] bg-[#12110f]/60">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-8">
            <div>
              <h2 className="text-[20px] font-medium text-[#efe9de] tracking-[-0.01em]">
                New to campus
              </h2>
              <p className="text-[14px] text-[#aaa398] mt-1">
                Three steps from finding a workshop to earning a verified certificate.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-6 border-t border-[#efe9de]/[0.08]">
            <div>
              <span className="font-mono text-[12px] text-[#ebb05d] tabular-nums">01</span>
              <h3 className="text-[16px] font-medium text-[#efe9de] mt-2">Find events</h3>
              <p className="mt-1.5 text-[14px] text-[#aaa398] leading-relaxed">
                Filter the campus calendar by department, seminar, technical fest, or club meetup.
              </p>
            </div>

            <div>
              <span className="font-mono text-[12px] text-[#ebb05d] tabular-nums">02</span>
              <h3 className="text-[16px] font-medium text-[#efe9de] mt-2">Reserve your seat</h3>
              <p className="mt-1.5 text-[14px] text-[#aaa398] leading-relaxed">
                Register directly with your student account and keep your pass and reminders in one place.
              </p>
            </div>

            <div>
              <span className="font-mono text-[12px] text-[#ebb05d] tabular-nums">03</span>
              <h3 className="text-[16px] font-medium text-[#efe9de] mt-2">Compete and verify</h3>
              <p className="mt-1.5 text-[14px] text-[#aaa398] leading-relaxed">
                Join live coding and quiz arenas, review verified solutions, and export merit PDFs from your profile.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Campus Events */}
      <section className="py-16 max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="text-[24px] sm:text-[28px] font-medium text-[#efe9de] tracking-[-0.015em]">
              Upcoming campus events
            </h2>
            <p className="text-[14px] text-[#aaa398] mt-1">
              Scheduled workshops, department symposiums, and club sessions.
            </p>
          </div>
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150 shrink-0"
          >
            <span>View all</span>
            <ArrowRightIcon className="h-4 w-4" strokeWidth={1.5} />
          </Link>
        </div>

        {loading ? (
          <AvenorLoader variant="section" label="Loading campus events..." className="py-12" />
        ) : events.length === 0 ? (
          <div className="p-8 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] text-center">
            <CalendarIcon className="h-8 w-8 text-[#8a847a] mx-auto mb-3" strokeWidth={1.5} />
            <h3 className="text-[16px] font-medium text-[#efe9de]">No events scheduled yet</h3>
            <p className="text-[14px] text-[#aaa398] mt-1 max-w-md mx-auto">
              Department organizers will publish upcoming sessions here once approved.
            </p>
            {(user?.role === 'organizer' || user?.role === 'admin') && (
              <Link to="/create-event" className="btn-primary mt-5 h-9 px-4 text-[13px]">
                Post an event
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {events.map((event) => (
              <div
                key={event._id}
                className="p-6 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-[12px] mb-3">
                    <span className="font-medium text-[#ebb05d] bg-[#262421] border border-[#efe9de]/[0.06] px-2.5 py-0.5 rounded-[6px]">
                      {event.department || 'Campus'}
                    </span>
                    <span className="text-[#8a847a] capitalize font-mono">
                      {event.type || 'Event'}
                    </span>
                  </div>
                  <h3 className="text-[17px] font-medium text-[#efe9de] line-clamp-1">
                    {event.title}
                  </h3>
                  <p className="mt-1.5 text-[14px] text-[#aaa398] line-clamp-2 leading-relaxed">
                    {event.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-[#efe9de]/[0.06] flex items-center justify-between text-[13px]">
                  <div className="flex items-center gap-4 text-[#aaa398] font-mono tabular-nums min-w-0">
                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      <ClockIcon className="h-4 w-4 text-[#8a847a]" strokeWidth={1.5} />
                      {event.date ? format(new Date(event.date), 'MMM d') : 'TBD'}
                    </span>
                    {event.location && (
                      <span className="inline-flex items-center gap-1.5 truncate font-sans">
                        <MapPinIcon className="h-4 w-4 text-[#8a847a] shrink-0" strokeWidth={1.5} />
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                  </div>
                  <Link
                    to={`/events/${event._id}`}
                    className="font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150 shrink-0 ml-3"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active Competitions */}
      {competitions.length > 0 && (
        <section className="py-14 border-t border-[#efe9de]/[0.08] bg-[#12110f]/40">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-end justify-between gap-4 mb-8">
              <div>
                <h2 className="text-[22px] font-medium text-[#efe9de] tracking-[-0.01em]">
                  Active competitions
                </h2>
                <p className="text-[14px] text-[#aaa398] mt-1">
                  Published coding rounds and quizzes open for student entries.
                </p>
              </div>
              <Link
                to="/competitions"
                className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150 shrink-0"
              >
                <span>All competitions</span>
                <ArrowRightIcon className="h-4 w-4" strokeWidth={1.5} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {competitions.map((comp) => {
                const enterPath =
                  comp.type === 'coding'
                    ? `/competitions/${comp._id}/code`
                    : `/competitions/${comp._id}/quiz`;

                return (
                  <div
                    key={comp._id}
                    className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] flex flex-col justify-between"
                  >
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#4cc38a]/10 text-[#4cc38a] border border-[#4cc38a]/20 mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#4cc38a]" />
                        <span>Live</span>
                      </div>
                      <h3 className="text-[16px] font-medium text-[#efe9de] line-clamp-1">
                        {comp.title}
                      </h3>
                      <p className="text-[13px] text-[#aaa398] mt-1.5 line-clamp-2 leading-relaxed">
                        {comp.description}
                      </p>
                    </div>
                    <div className="mt-5 pt-3 border-t border-[#efe9de]/[0.06] flex items-center justify-between text-[13px]">
                      <span className="font-mono text-[12px] text-[#8a847a] tabular-nums">
                        {comp.durationMinutes || 30} min · {comp.totalMarks || 0} marks
                      </span>
                      <Link
                        to={enterPath}
                        className="inline-flex items-center gap-1 font-medium text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150"
                      >
                        <span>Enter</span>
                        <ArrowRightIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Campus Directory */}
      <section className="py-14 border-t border-[#efe9de]/[0.08] max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-[20px] font-medium text-[#efe9de] tracking-[-0.01em] mb-6">
          Campus directory
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Link
            to="/events"
            className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 block"
          >
            <CalendarIcon className="h-5 w-5 text-[#8a847a] mb-3" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#efe9de]">Event hub</h3>
            <p className="mt-1 text-[13px] text-[#aaa398]">
              Search workshops, seminars, and fests by type or department.
            </p>
          </Link>

          <Link
            to="/competitions"
            className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 block"
          >
            <TrophyIcon className="h-5 w-5 text-[#8a847a] mb-3" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#efe9de]">Coding and quizzes</h3>
            <p className="mt-1 text-[13px] text-[#aaa398]">
              Solve problems in Python, C++, Java, or JavaScript in an isolated runner.
            </p>
          </Link>

          <Link
            to="/community"
            className="p-5 rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.08] hover:border-[#efe9de]/[0.16] transition-colors duration-150 block"
          >
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-[#8a847a] mb-3" strokeWidth={1.5} />
            <h3 className="text-[15px] font-medium text-[#efe9de]">Campus board</h3>
            <p className="mt-1 text-[13px] text-[#aaa398]">
              Read announcements and coordinate with organizers and classmates.
            </p>
          </Link>
        </div>
      </section>

      {/* Bottom Student Callout */}
      {!user && (
        <section className="py-12 border-t border-[#efe9de]/[0.08] bg-[#12110f]/60">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <h3 className="text-[16px] font-medium text-[#efe9de]">
                Ready to reserve your first campus seat
              </h3>
              <p className="text-[14px] text-[#aaa398] mt-0.5">
                Register with your student email to join events and track merit certificates.
              </p>
            </div>
            <Link to="/register" className="btn-primary h-10 px-5 shrink-0">
              Create student account
            </Link>
          </div>
        </section>
      )}
    </div>
  );
};

export default Home;

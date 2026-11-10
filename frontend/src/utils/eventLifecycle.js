import { format, formatDistanceToNowStrict } from 'date-fns';
import { getBackendUrl } from './apiConfig';

export function resolveMediaUrl(path) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const base = getBackendUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatEventDate(dateValue) {
  if (!dateValue) return 'Date TBD';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return 'Date TBD';
  return format(d, 'MMM d, yyyy');
}

export function formatRelativeTime(dateValue) {
  if (!dateValue) return '';
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return '';
  const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  if (diffHours < 24 && diffHours >= 0) {
    return `${formatDistanceToNowStrict(d)} ago`;
  }
  return format(d, 'MMM d, yyyy');
}

export function formatCount(num) {
  return new Intl.NumberFormat('en-US').format(Number(num || 0));
}

function parseClockToken(token) {
  const m = String(token || '').match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2]);
  const meridiem = m[3] ? m[3].toLowerCase() : null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function getEventLifecycle(event, isRegistered = false) {
  if (!event) {
    return {
      state: 'REGISTRATION CLOSED',
      isExpired: true,
      isRegistrationOpen: false,
      availableSeats: 0,
      attendeesCount: 0
    };
  }

  const now = new Date();
  const attendeesCount =
    typeof event.attendeesCount === 'number'
      ? event.attendeesCount
      : Array.isArray(event.attendees)
        ? event.attendees.length
        : 0;
  const capacity = Number(event.capacity || 0);
  const availableSeats = Math.max(0, capacity - attendeesCount);

  if (isRegistered) {
    return {
      state: 'REGISTERED',
      isExpired: event.isExpired || event.status === 'completed',
      isRegistrationOpen: false,
      availableSeats,
      attendeesCount
    };
  }

  if (event.registrationState) {
    return {
      state: event.registrationState,
      isExpired: Boolean(event.isExpired),
      isRegistrationOpen: Boolean(event.isRegistrationOpen),
      availableSeats,
      attendeesCount
    };
  }

  const rawDate = event.date ? new Date(event.date) : null;
  let startsAt = null;
  let endsAt = null;
  let hasExplicitEnd = false;

  if (rawDate && !Number.isNaN(rawDate.getTime())) {
    const matches = String(event.time || '').match(/\d{1,2}:\d{2}(?:\s*(?:am|pm))?/gi) || [];
    const s = matches[0] ? parseClockToken(matches[0]) : null;
    const e = matches[1] ? parseClockToken(matches[1]) : null;
    const y = rawDate.getFullYear();
    const mo = rawDate.getMonth();
    const d = rawDate.getDate();

    startsAt = s ? new Date(y, mo, d, s.hours, s.minutes, 0, 0) : new Date(y, mo, d, 0, 0, 0, 0);
    if (e) {
      hasExplicitEnd = true;
      endsAt = new Date(y, mo, d, e.hours, e.minutes, 59, 999);
      if (endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
    } else {
      endsAt = new Date(y, mo, d, 23, 59, 59, 999);
    }
  }

  let state = 'REGISTER NOW';
  let isExpired = false;

  if (event.status === 'completed') {
    state = 'EVENT COMPLETED';
    isExpired = true;
  } else if (event.status === 'cancelled' || event.status === 'rejected') {
    state = 'REGISTRATION CLOSED';
    isExpired = true;
  } else if (event.status === 'ongoing') {
    state = 'EVENT STARTED';
  } else if (endsAt && now > endsAt) {
    state = 'EVENT COMPLETED';
    isExpired = true;
  } else if (hasExplicitEnd && startsAt && endsAt && now >= startsAt && now <= endsAt) {
    state = 'EVENT STARTED';
  } else if (
    event.registrationOpen === false ||
    (event.registrationDeadline && now > new Date(event.registrationDeadline))
  ) {
    state = 'REGISTRATION CLOSED';
  } else if (capacity > 0 && attendeesCount >= capacity) {
    state = 'EVENT FULL';
  }

  return {
    state,
    isExpired,
    isRegistrationOpen: !isExpired && state === 'REGISTER NOW',
    availableSeats,
    attendeesCount
  };
}


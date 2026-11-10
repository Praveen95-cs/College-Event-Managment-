import React, { useState, useEffect, Fragment, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import AvenorLoader from '../common/AvenorLoader';
import { formatRelativeTime } from '../../utils/eventLifecycle';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setError('');
      const response = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user, fetchNotifications]);

  const markAsRead = async (id) => {
    try {
      await axios.put(`/api/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map((n) => axios.put(`/api/notifications/${n._id}/read`)));
      fetchNotifications();
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const deleteNotification = async (id) => {
    try {
      await axios.delete(`/api/notifications/${id}`);
      fetchNotifications();
    } catch (err) {
      console.error('Error deleting notification:', err);
    }
  };

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="relative">
      <Menu as="div" className="relative">
        {({ close }) => (
          <>
            <Menu.Button
              className="relative h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[#1c1a18] border border-[#efe9de]/[0.1] text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] focus:outline-none focus:ring-2 focus:ring-[#e09132] transition-colors duration-150"
              aria-label="Notifications"
            >
              <BellIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[12px] font-mono font-medium leading-none text-[#12110f] bg-[#e09132] rounded-[6px] tabular-nums">
                  {unreadCount}
                </span>
              )}
            </Menu.Button>

            <Transition
              as={Fragment}
              enter="transition ease-out duration-150"
              enterFrom="transform opacity-0 translate-y-1 scale-[0.98]"
              enterTo="transform opacity-100 translate-y-0 scale-100"
              leave="transition ease-in duration-100"
              leaveFrom="transform opacity-100 translate-y-0 scale-100"
              leaveTo="transform opacity-0 translate-y-1 scale-[0.98]"
            >
              <Menu.Items className="fixed inset-x-3 top-[4.25rem] w-auto sm:inset-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96 max-h-[calc(100vh-5.5rem)] flex flex-col origin-top sm:origin-top-right rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.12] shadow-[0_16px_48px_rgba(0,0,0,0.65)] focus:outline-none z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-[#efe9de]/[0.08] bg-[#12110f]/60 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-[14px] font-medium text-[#efe9de] truncate">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-[6px] text-[12px] font-mono text-[#ebb05d] bg-[#e09132]/12 border border-[#e09132]/25 tabular-nums shrink-0">
                        {unreadCount} new
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllAsRead}
                        className="text-[12px] font-medium text-[#ebb05d] hover:text-[#efe9de] px-2 py-1 rounded-[6px] hover:bg-[#262421] transition-colors duration-150"
                      >
                        Mark all
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      className="h-7 w-7 inline-flex items-center justify-center rounded-[6px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150"
                      aria-label="Close notifications"
                    >
                      <XMarkIcon className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div className="p-3 sm:p-4 overflow-y-auto flex-1">
                  {error && (
                    <div className="px-3 py-2 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[12px] mb-3 break-words">
                      {error}
                    </div>
                  )}

                  {loading ? (
                    <div className="flex justify-center py-6">
                      <AvenorLoader variant="compact" label="Loading notifications..." />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="py-8 text-center">
                      <BellIcon className="h-6 w-6 text-[#8a847a] mx-auto mb-2" strokeWidth={1.5} />
                      <p className="text-[13px] font-medium text-[#efe9de]">No notifications yet</p>
                      <p className="text-[12px] text-[#8a847a] mt-0.5">
                        Event confirmations and club alerts appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {notifications.map((notification) => {
                        const relTime = notification.createdAt
                          ? formatRelativeTime(notification.createdAt)
                          : '';
                        return (
                          <div
                            key={notification._id}
                            className={`p-3 rounded-[10px] border transition-colors duration-150 ${
                              notification.read
                                ? 'bg-[#161513] border-[#efe9de]/[0.06]'
                                : 'bg-[#262421] border-[#efe9de]/[0.1] border-l-2 border-l-[#e09132]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="flex-1 text-[13px] font-medium text-[#efe9de] break-words min-w-0">
                                {notification.title}
                              </p>
                              {relTime && (
                                <span className="text-[12px] font-mono text-[#8a847a] shrink-0 tabular-nums">
                                  {relTime}
                                </span>
                              )}
                            </div>
                            <p className="text-[12px] text-[#aaa398] mt-1 leading-relaxed break-words">
                              {notification.message}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-2.5 text-[12px]">
                              {!notification.read && (
                                <button
                                  type="button"
                                  onClick={() => markAsRead(notification._id)}
                                  className="px-2 py-1 rounded-[6px] bg-[#e09132]/12 text-[#ebb05d] hover:bg-[#e09132]/20 transition-colors duration-150 font-medium"
                                >
                                  Mark read
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteNotification(notification._id)}
                                className="px-2 py-1 rounded-[6px] text-[#8a847a] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors duration-150"
                              >
                                Dismiss
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Menu.Items>
            </Transition>
          </>
        )}
      </Menu>
    </div>
  );
};

export default Notifications;

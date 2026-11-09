import React, { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { BellIcon } from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user]);

  const fetchNotifications = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const response = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(response.data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await axios.put(`/api/notifications/${id}/read`);
      fetchNotifications();
    } catch (err) {
      console.error('Error marking notification as read:', err);
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

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <Menu as="div" className="relative">
        <Menu.Button
          className="relative h-9 w-9 inline-flex items-center justify-center rounded-[8px] bg-[#1c1a18] border border-[#efe9de]/[0.1] text-[#aaa398] hover:text-[#efe9de] hover:bg-[#262421] focus:outline-none focus:ring-2 focus:ring-[#e09132] transition-colors duration-150"
          aria-label="Notifications"
        >
          <BellIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[11px] font-mono font-medium leading-none text-[#12110f] bg-[#e09132] rounded-[6px] tabular-nums">
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
          <Menu.Items className="absolute right-0 mt-2 w-80 origin-top-right rounded-[14px] bg-[#1c1a18] border border-[#efe9de]/[0.12] shadow-[0_12px_32px_rgba(0,0,0,0.45)] focus:outline-none z-50">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-medium text-[#efe9de]">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[12px] font-mono text-[#ebb05d] tabular-nums">{unreadCount} unread</span>
                )}
              </div>
              {error && (
                <div className="text-[#e5484d] text-xs mb-3">{error}</div>
              )}
              {loading ? (
                <div className="text-[13px] text-[#8a847a] py-4">Loading notifications...</div>
              ) : notifications.length === 0 ? (
                <div className="text-[13px] text-[#8a847a] py-4">No notifications</div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification._id}
                      className={`p-3 rounded-[8px] border transition-colors duration-150 ${
                        notification.read
                          ? 'bg-[#161513] border-[#efe9de]/[0.06]'
                          : 'bg-[#262421] border-[#efe9de]/[0.1] border-l-2 border-l-[#e09132]'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#efe9de]">{notification.title}</p>
                          <p className="text-[12px] text-[#aaa398] mt-0.5 leading-relaxed">{notification.message}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[12px]">
                        {!notification.read && (
                          <button
                            onClick={() => markAsRead(notification._id)}
                            className="text-[#ebb05d] hover:text-[#efe9de] transition-colors duration-150"
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification._id)}
                          className="text-[#8a847a] hover:text-[#e5484d] transition-colors duration-150"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    </div>
  );
};

export default Notifications;

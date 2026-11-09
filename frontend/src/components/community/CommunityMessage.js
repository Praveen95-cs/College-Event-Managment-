import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/24/outline';

const CommunityMessage = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchMessages();
    } else {
      setLoading(false);
    }
  }, [user]);

  const fetchMessages = async () => {
    try {
      const response = await axios.get('/api/messages');
      setMessages(response.data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
      setError('Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    try {
      setError('');
      const response = await axios.post('/api/messages', {
        content: newMessage,
        user: user._id
      });
      setMessages([...messages, response.data]);
      setNewMessage('');
    } catch (err) {
      console.error('Error sending message:', err);
      setError('Failed to send message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (window.confirm('Are you sure you want to delete this message?')) {
      try {
        await axios.delete(`/api/messages/${messageId}`);
        setMessages(messages.filter(msg => msg._id !== messageId));
      } catch (err) {
        console.error('Error deleting message:', err);
        setError('Failed to delete message');
      }
    }
  };

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-8 text-center space-y-4">
          <ChatBubbleLeftRightIcon className="h-8 w-8 text-[#8a847a] mx-auto" strokeWidth={1.5} />
          <div>
            <h1 className="text-[20px] font-medium text-[#efe9de]">Campus board</h1>
            <p className="mt-1.5 text-[14px] text-[#aaa398]">
              Sign in with your student or organizer account to read announcements and post updates.
            </p>
          </div>
          <div className="pt-2">
            <Link to="/login" className="btn-primary h-9 px-5 text-[13px]">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="pb-6 border-b border-[#efe9de]/[0.08]">
        <h1 className="text-[28px] sm:text-[32px] font-medium tracking-[-0.02em] text-[#efe9de] leading-[1.15]">
          Campus board
        </h1>
        <p className="mt-1.5 text-[14px] text-[#aaa398]">
          Shared updates and questions from students, organizers, and staff.
        </p>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]" role="alert">
          {error}
        </div>
      )}

      <div className="rounded-[16px] bg-[#1c1a18] border border-[#efe9de]/[0.08] p-6 space-y-6">
        {loading ? (
          <div className="py-10 text-center text-[14px] text-[#8a847a]">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="py-10 text-center">
            <ChatBubbleLeftRightIcon className="h-7 w-7 text-[#8a847a] mx-auto mb-2.5" strokeWidth={1.5} />
            <p className="text-[14px] font-medium text-[#efe9de]">No messages yet</p>
            <p className="text-[13px] text-[#8a847a] mt-1">Start a thread using the composer below.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#efe9de]/[0.06]">
            {messages.map((message) => {
              const senderName = message.user?.name || 'Member';
              return (
                <div key={message._id} className="py-4 first:pt-0 last:pb-0 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="h-9 w-9 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center shrink-0 text-[13px] font-medium text-[#ebb05d]">
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-medium text-[#efe9de]">{senderName}</p>
                        <span className="text-[12px] font-mono text-[#8a847a] tabular-nums">
                          {new Date(message.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="mt-1 text-[14px] text-[#aaa398] leading-relaxed whitespace-pre-wrap">
                        {message.content}
                      </p>
                    </div>
                  </div>

                  {(user.role === 'admin' || user.role === 'organizer') && (
                    <button
                      onClick={() => handleDeleteMessage(message._id)}
                      className="p-1.5 rounded-[6px] text-[#8a847a] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors duration-150 shrink-0"
                      title="Delete message"
                    >
                      <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <form onSubmit={handleSubmit} className="pt-5 border-t border-[#efe9de]/[0.08] space-y-3">
          <div>
            <label htmlFor="message" className="block text-[13px] font-medium text-[#aaa398] mb-1.5">
              Post a message
            </label>
            <textarea
              id="message"
              name="message"
              rows={3}
              required
              className="input-field resize-y"
              placeholder="Write a message"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="btn-primary h-9 px-4 text-[13px]">
              Post message
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CommunityMessage;

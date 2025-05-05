import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { ChatBubbleLeftRightIcon, TrashIcon } from '@heroicons/react/24/outline';

const CommunityMessage = () => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user } = useAuth();

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await axios.get('/api/messages');
      setMessages(response.data);
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

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-900 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden border border-gray-700">
          <div className="p-6">
            <h3 className="text-lg font-medium text-gray-100 mb-4">Community Messages</h3>
            {error && (
              <div className="text-red-400 mb-4">{error}</div>
            )}
            {loading ? (
              <div className="text-gray-300">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="text-gray-300">No messages yet</div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message._id}
                    className="bg-gray-700 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start">
                        <div className="flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-violet-900 flex items-center justify-center">
                            <ChatBubbleLeftRightIcon className="h-6 w-6 text-violet-200" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="flex items-center">
                            <p className="text-sm font-medium text-gray-100">
                              {message.user.name}
                            </p>
                            <span className="ml-2 text-xs text-gray-400">
                              {new Date(message.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-300">{message.content}</p>
                        </div>
                      </div>
                      {(user.role === 'admin' || user.role === 'organizer') && (
                        <button
                          onClick={() => handleDeleteMessage(message._id)}
                          className="text-red-400 hover:text-red-300 transition-colors duration-200"
                          title="Delete message"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleSubmit} className="mt-6">
              <div>
                <label htmlFor="message" className="sr-only">
                  Message
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  required
                  className="block w-full border border-gray-700 rounded-lg shadow-sm py-2 px-3 bg-gray-700/50 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-colors duration-200"
                  placeholder="Share your thoughts..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-violet-600 hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-violet-500"
                >
                  Send Message
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommunityMessage; 
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { TrashIcon, ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { formatRelativeTime } from '../../utils/eventLifecycle';
import AvenorLoader from '../common/AvenorLoader';

const CommentsSection = ({ postId, onCommentsCountChange }) => {
  const { user, isAuthenticated } = useAuth();
  const [comments, setComments] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const submittingRef = useRef(false);
  const onCountChangeRef = useRef(onCommentsCountChange);
  useEffect(() => {
    onCountChangeRef.current = onCommentsCountChange;
  }, [onCommentsCountChange]);

  const fetchComments = useCallback(
    async (targetPage = 1, append = false) => {
      if (!postId) {
        setLoading(false);
        return;
      }
      try {
        if (append) setLoadingMore(true);
        else setLoading(true);
        setError('');

        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/feed/posts/${postId}/comments`, {
          params: { page: targetPage, limit: 15 },
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        const incoming = res.data?.comments || [];
        setComments(prev => {
          if (!append) return incoming;
          const existingIds = new Set(prev.map(c => c._id));
          return [...prev, ...incoming.filter(c => !existingIds.has(c._id))];
        });
        setPage(res.data?.page || targetPage);
        setHasMore(Boolean(res.data?.hasMore));
        const nextTotal = Number(res.data?.total ?? incoming.length);
        setTotal(nextTotal);
        onCountChangeRef.current?.(nextTotal);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load comments');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [postId]
  );

  useEffect(() => {
    fetchComments(1, false);
  }, [fetchComments]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !postId || submittingRef.current) return;

    try {
      submittingRef.current = true;
      setSubmitting(true);
      setError('');
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `/api/feed/posts/${postId}/comments`,
        { content: text },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const created = res.data?.comment;
      const nextCount = Number(res.data?.commentsCount ?? total + 1);
      if (created) {
        setComments(prev => (prev.some(c => c._id === created._id) ? prev : [created, ...prev]));
      }
      setDraft('');
      setTotal(nextCount);
      onCountChangeRef.current?.(nextCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post comment');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    try {
      setError('');
      const token = localStorage.getItem('token');
      const res = await axios.delete(`/api/feed/comments/${commentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setComments(prev => prev.filter(c => c._id !== commentId));
      const nextCount = Number(res.data?.commentsCount ?? Math.max(0, total - 1));
      setTotal(nextCount);
      onCountChangeRef.current?.(nextCount);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete comment');
    }
  };

  if (!postId) return null;

  return (
    <div className="space-y-4">
      {error && (
        <div className="px-3.5 py-2.5 rounded-[8px] bg-[#e5484d]/10 border border-[#e5484d]/30 text-[#e5484d] text-[13px]">
          {error}
        </div>
      )}

      {isAuthenticated && user ? (
        <form onSubmit={handleSubmit} className="flex items-start gap-2.5">
          <div className="h-9 w-9 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[13px] font-medium text-[#ebb05d] shrink-0">
            <span aria-hidden="true">{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</span>
          </div>
          <div className="flex-1 flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder="Write a comment..."
              className="input-field h-9 py-0 flex-1 text-[13px] leading-tight"
            />
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              className="btn-primary h-9 px-4 text-[13px] shrink-0"
            >
              {submitting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-3 rounded-[10px] bg-[#161513] border border-[#efe9de]/[0.08] flex items-center justify-between gap-3 text-[13px]">
          <span className="text-[#aaa398]">Sign in with your campus account to ask questions or comment.</span>
          <Link to="/login" className="btn-secondary h-8 px-3 text-[12px] shrink-0">
            Sign in
          </Link>
        </div>
      )}

      {loading ? (
        <div className="py-6 flex justify-center">
          <AvenorLoader variant="compact" label="Loading comments..." />
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8 text-center rounded-[10px] bg-[#161513]/70 border border-[#efe9de]/[0.06]">
          <ChatBubbleLeftIcon className="h-6 w-6 text-[#8a847a] mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-[13px] font-medium text-[#efe9de]">No comments yet</p>
          <p className="text-[12px] text-[#8a847a] mt-0.5">Ask a question about eligibility, timing, or certificates.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#efe9de]/[0.06]">
          {comments.map((comment) => {
            const authorName = comment.user?.name || 'Student';
            return (
              <div key={comment._id} className="py-3.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-[8px] bg-[#262421] border border-[#efe9de]/[0.08] flex items-center justify-center text-[12px] font-medium text-[#ebb05d] shrink-0">
                    <span aria-hidden="true">{authorName.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-[#efe9de]">{authorName}</span>
                      {comment.isOrganizerBadge && (
                        <span className="px-1.5 py-0.5 rounded-[6px] text-[12px] font-mono bg-[#e09132]/15 text-[#ebb05d] border border-[#e09132]/25">
                          Organizer
                        </span>
                      )}
                      <span className="text-[12px] font-mono text-[#8a847a] tabular-nums">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] text-[#aaa398] leading-relaxed whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  </div>
                </div>

                {comment.canDelete && (
                  <button
                    type="button"
                    onClick={() => handleDelete(comment._id)}
                    className="p-1.5 rounded-[6px] text-[#8a847a] hover:text-[#e5484d] hover:bg-[#e5484d]/10 transition-colors duration-150 shrink-0"
                    title="Delete comment"
                    aria-label="Delete comment"
                  >
                    <TrashIcon className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="pt-2 flex justify-center">
          <button
            type="button"
            onClick={() => fetchComments(page + 1, true)}
            disabled={loadingMore}
            className="btn-secondary h-8 px-3.5 text-[12px]"
          >
            {loadingMore ? (
              <>
                <AvenorLoader variant="inline" tone="light" />
                <span>Loading...</span>
              </>
            ) : (
              'Load earlier comments'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default CommentsSection;


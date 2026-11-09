import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import CommentsSection from './CommentsSection';

const CommentsModal = ({ item, onClose, onCommentsCountChange }) => {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#1c1a18] border border-[#efe9de]/[0.12] rounded-t-[16px] sm:rounded-[16px] w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
        <div className="px-5 py-4 border-b border-[#efe9de]/[0.08] flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="text-[12px] font-mono text-[#ebb05d]">
              {item.club?.name || 'Campus discussion'}
            </span>
            <h3 className="text-[17px] font-medium text-[#efe9de] truncate mt-0.5">
              Comments · {item.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-[8px] text-[#8a847a] hover:text-[#efe9de] hover:bg-[#262421] transition-colors duration-150 shrink-0"
            aria-label="Close comments"
          >
            <XMarkIcon className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <CommentsSection
            postId={item._id}
            onCommentsCountChange={(count) => onCommentsCountChange?.(item._id, count)}
          />
        </div>
      </div>
    </div>
  );
};

export default CommentsModal;


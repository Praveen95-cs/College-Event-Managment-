import React from 'react';

export const AvenorMark = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-xl',
    lg: 'w-12 h-12 rounded-2xl',
    xl: 'w-16 h-16 rounded-2xl'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
    xl: 'w-9 h-9'
  };

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 shadow-lg ring-1 ring-white/20 transition-transform ${sizeClasses[size] || sizeClasses.md} bg-gradient-to-tr from-violet-700 via-indigo-600 to-amber-500 shadow-violet-900/30 ${className}`}
    >
      {/* Collegiate Event Archway + Beacon Emblem */}
      <svg
        className={`${iconSizes[size] || iconSizes.md} text-white`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Modern architectural collegiate A-frame / event pavilion */}
        <path
          d="M12 3L3.5 20.5H7.5L12 11.5L16.5 20.5H20.5L12 3Z"
          fill="currentColor"
        />
        <path
          d="M8.2 16H15.8"
          stroke="#FCD34D"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {/* Spotlight / Beacon Star at the peak */}
        <circle cx="12" cy="7.5" r="1.5" fill="#FEF08A" />
      </svg>
    </div>
  );
};

export const AvenorLogo = ({
  size = 'md',
  showSubtitle = true,
  subtitle = 'Campus Events & Community',
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <AvenorMark size={size} />
      <div className="flex flex-col">
        <span className="text-xl sm:text-2xl font-black tracking-tight text-white leading-none">
          Ave<span className="text-violet-400">nor</span>
        </span>
        {showSubtitle && (
          <span className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mt-1">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default AvenorLogo;

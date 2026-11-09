import React from 'react';

export const AvenorMark = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-7 h-7 rounded-[6px]',
    md: 'w-8 h-8 rounded-[8px]',
    lg: 'w-10 h-10 rounded-[10px]',
    xl: 'w-12 h-12 rounded-[12px]'
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-[18px] h-[18px]',
    lg: 'w-5 h-5',
    xl: 'w-6 h-6'
  };

  return (
    <div
      className={`flex items-center justify-center shrink-0 bg-[#1c1a18] border border-[#efe9de]/[0.12] ${sizeClasses[size] || sizeClasses.md} ${className}`}
    >
      <svg
        className={`${iconSizes[size] || iconSizes.md} text-[#efe9de]`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 3.5L4 20.5H7.6L12 11.2L16.4 20.5H20L12 3.5Z"
          fill="currentColor"
        />
        <path
          d="M8.5 16H15.5"
          stroke="#e09132"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="12" cy="7.5" r="1.4" fill="#e09132" />
      </svg>
    </div>
  );
};

export const AvenorLogo = ({
  size = 'md',
  showSubtitle = false,
  subtitle = 'Campus events and arenas',
  className = ''
}) => {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <AvenorMark size={size} />
      <div className="flex flex-col">
        <span className="text-[17px] font-semibold tracking-tight text-[#efe9de] leading-none">
          Avenor
        </span>
        {showSubtitle && subtitle && (
          <span className="text-[12px] font-normal text-[#8a847a] leading-none mt-1">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default AvenorLogo;

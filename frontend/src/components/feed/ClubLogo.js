import React, { useState, useEffect } from 'react';
import { resolveMediaUrl } from '../../utils/eventLifecycle';

const SIZE_CLASSES = {
  sm: 'h-8 w-8 rounded-[8px] text-[12px]',
  md: 'h-10 w-10 rounded-[10px] text-[13px]',
  lg: 'h-16 w-16 rounded-[14px] text-[20px]'
};

const PALETTES = [
  'bg-[#e09132]/15 text-[#ebb05d] border-[#e09132]/30',
  'bg-[#4cc38a]/12 text-[#4cc38a] border-[#4cc38a]/25',
  'bg-[#5b8def]/15 text-[#8cb4ff] border-[#5b8def]/30',
  'bg-[#c084fc]/15 text-[#d8b4fe] border-[#c084fc]/30',
  'bg-[#f97316]/15 text-[#fdba74] border-[#f97316]/30'
];

function getClubMonogram(name) {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'AC';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].charAt(0)}${words[1].charAt(0)}`.toUpperCase();
}

function getClubPalette(name) {
  const str = String(name || 'Club');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return PALETTES[hash % PALETTES.length];
}

const ClubLogo = ({ club, fallbackName = 'C', size = 'md', className = '' }) => {
  const logoSrc = resolveMediaUrl(club?.logo);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [logoSrc]);

  const displayName = club?.name || fallbackName || 'Club';
  const monogram = getClubMonogram(displayName);
  const paletteClass = getClubPalette(displayName);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const showImage = Boolean(logoSrc && !imgFailed);

  return (
    <div
      className={`${sizeClass} border flex items-center justify-center font-mono font-semibold tracking-tight shrink-0 overflow-hidden ${
        showImage ? 'bg-[#262421] border-[#efe9de]/[0.1]' : paletteClass
      } ${className}`}
      title={displayName}
    >
      {showImage ? (
        <img
          src={logoSrc}
          alt={displayName}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{monogram}</span>
      )}
    </div>
  );
};

export default ClubLogo;

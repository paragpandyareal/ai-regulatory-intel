export default function Logo() {
  return (
    <div className="flex items-center justify-center gap-3 sm:gap-4">
      <svg 
        width="64" 
        height="64" 
        viewBox="0 0 48 48" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="w-14 h-14 sm:w-16 sm:h-16"
      >
        {/* Document shape */}
        <rect x="12" y="8" width="24" height="32" rx="2" fill="#7B9B7B" fillOpacity="0.2" stroke="#7B9B7B" strokeWidth="2"/>
        
        {/* AI lightning bolt */}
        <path 
          d="M26 14L20 24H24L22 34L28 24H24L26 14Z" 
          fill="#7B9B7B" 
          stroke="#6B8B6B" 
          strokeWidth="1.5"
          strokeLinecap="round" 
          strokeLinejoin="round"
        />
        
        {/* Document lines */}
        <line x1="16" y1="12" x2="20" y2="12" stroke="#7B9B7B" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="16" y1="16" x2="22" y2="16" stroke="#7B9B7B" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <div className="flex flex-col items-start">
        <span className="text-3xl sm:text-4xl md:text-5xl font-bold text-neutral-900 tracking-tight leading-none">
          AI Regulatory
        </span>
        <span className="text-base sm:text-lg md:text-xl font-semibold text-[#7B9B7B] tracking-wide">
          INTELLIGENCE
        </span>
      </div>
    </div>
  );
}

// Line icons from the mobile design handoff
const paths = {
  home: (<><path d="m3 10 9-7 9 7v10H3Z" /><path d="M9 20v-7h6v7" /></>),
  search: (<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>),
  grid: (<><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>),
  bag: (<><path d="M4 8h16l1 13H3Z" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /></>),
  user: (<><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>),
  heart: <path d="M12 21 3.5 12.5C-2 6 6 0 12 6c6-6 14 0 8.5 6.5Z" />,
  bell: (<><path d="M5 17h14l-2-3V9A5 5 0 0 0 7 9v5Z" /><path d="M10 21h4M12 2v2" /></>),
  pin: (<><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" /><circle cx="12" cy="10" r="2" /></>),
  arrow: <path d="m9 5 7 7-7 7" />,
  spark: (<><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" /><path d="m20 2 1 2 2 1" /></>),
  truck: (<><path d="M2 5h12v12H2ZM14 9h4l4 5v3h-8" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>),
  mic: (<><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>),
  close: <path d="m6 6 12 12M6 18 18 6" />,
};

const AtzIcon = ({ name, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths[name]}
  </svg>
);

export default AtzIcon;

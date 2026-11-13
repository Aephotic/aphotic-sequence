// Custom line icons: square caps, slightly off-true strokes so they read as inked rather than drawn by a UI kit.
const svg = (d: string, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"/>${extra}</svg>`;

export const IC = {
  menu: svg('M4 6.5h16M4 12h11.5M4 17.5h16'),
  back: svg('M14.5 5 7.5 12l7 7M8 12h12'),
  close: svg('M5.5 5.5l13 13M18.5 5.5l-13 13'),
  share: svg('M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V20h14v-7.5'),
  save: svg('M6.5 3.5h11V21L12 16.5 6.5 21z'),
  saved: svg('M6.5 3.5h11V21L12 16.5 6.5 21zM9.5 9.5l2 2 3.5-4'),
  export: svg('M12 3.5V15M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15'),
  chevron: svg('M6 9.5l6 6 6-6'),
  replay: svg('M5 12a7 7 0 1 0 2.2-5.1M5 4v4h4'),
  trash: svg('M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13M10.5 11v5.5M13.5 11v5.5'),
  link: svg('M10 14.5 14.5 10M8.5 11 6 13.5a3.2 3.2 0 0 0 4.5 4.5L13 15.5M11 8.5 13.5 6A3.2 3.2 0 0 1 18 10.5L15.5 13'),
  copy: svg('M9 8.5h10.5V21H9zM15 8.5V3.5H4.5V16H9'),
  image: svg('M3.5 5h17v14h-17zM3.5 16l5-5 4 4 3-3 5 5', '<circle cx="15.5" cy="9" r="1.2"/>'),
  info: svg('M12 10.5V17M12 7v.5', '<circle cx="12" cy="12" r="8.5"/>'),
  install: svg('M7 3.5h10V20.5H7zM12 8v6.5M9.5 12l2.5 2.5 2.5-2.5'),
  steps: svg('M4 18.5h4.5V14H13V9.5h4.5V5H21'),
  check: svg('M5 12.5l4.5 4.5L19 7.5'),
  // the one chaos star, used as the brand mark only
  star: `<svg class="ic star" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1M12 2l-1.6 2.4M12 2l1.6 2.4M12 22l-1.6-2.4M12 22l1.6-2.4M2 12l2.4-1.6M2 12l2.4 1.6M22 12l-2.4-1.6M22 12l-2.4 1.6M4.9 4.9l.6 2.8M4.9 4.9l2.8.6M19.1 19.1l-.6-2.8M19.1 19.1l-2.8-.6M19.1 4.9l-2.8.6M19.1 4.9l-.6 2.8M4.9 19.1l2.8-.6M4.9 19.1l.6-2.8"/></svg>`,
};

/** The heyitsherman mark (from the heyitsherman-web skill, unmodified) and the presenter's icons. */

/** Ink bars use currentColor, so the mark reverses on the ink band by itself; the orange band is fixed. */
export const MARK_SVG = `<svg viewBox="300 -300 1600 1600" aria-hidden="true" focusable="false"><path class="ink" d="M690-300H300v1600h230v-200c0-220,160-220,160-440V-300z"/><path class="ink" d="M1120-300H810v960c0,220-160,220-160,440v200h310V720c0-220,160-220,160-440V-300z"/><path class="accent" d="M1550-300h-310v580c0,220-160,220-160,440v580h310V340c0-220,160-220,160-440V-300z"/><path class="ink" d="M1900-300h-230v200c0,220-160,220-160,440v960h390V-300z"/></svg>`;

const ICONS = {
  prev: '<path d="M10.5 2.5 5 8l5.5 5.5-1.4 1.4L2.2 8l6.9-6.9z"/>',
  next: '<path d="M5.5 2.5 11 8l-5.5 5.5 1.4 1.4L13.8 8 6.9 1.1z"/>',
  rerun: '<path d="M8 2.5a5.5 5.5 0 1 0 5.4 6.5h-2a3.5 3.5 0 1 1-1-3.4L8.6 7.4H14V2l-2.2 2.2A5.5 5.5 0 0 0 8 2.5z"/>',
  fast: '<path d="M1.5 3v10l6-5zM8.5 3v10l6-5z"/>',
  overview: '<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>',
  sound: '<path d="M2 6h3l4-3.5v11L5 10H2zM11 5.2a4 4 0 0 1 0 5.6l-1-1a2.6 2.6 0 0 0 0-3.6zM12.8 3.4a6.5 6.5 0 0 1 0 9.2l-1-1a5 5 0 0 0 0-7.2z"/>',
  muted: '<path d="M2 6h3l4-3.5v11L5 10H2zM10.3 5.6l1.6 1.6 1.6-1.6 1 1L12.9 8.2l1.6 1.6-1 1-1.6-1.6-1.6 1.6-1-1 1.6-1.6-1.6-1.6z"/>',
  theme: '<circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.75a6.25 6.25 0 0 1 0 12.5z"/>',
  lab: '<path d="M5.5 1.5h5V3h-.75v3.6l3.9 6.4c.5.9-.1 1.5-1 1.5H3.35c-.9 0-1.5-.6-1-1.5l3.9-6.4V3H5.5zm2.25 1.5v4L6.5 9h3L8.25 7V3z"/>',
  help: '<path d="M6.1 5.6H4.3A3.7 3.7 0 0 1 8 2.2c2.1 0 3.7 1.3 3.7 3.2 0 1.5-.9 2.2-1.8 2.8-.8.5-1.1.8-1.1 1.6v.4H7v-.6c0-1.3.6-1.9 1.5-2.5.8-.5 1.3-.9 1.3-1.7 0-.9-.8-1.6-1.8-1.6s-1.8.7-1.9 1.8zM6.9 11.6h1.9v1.9H6.9z"/>',
} as const;

export type IconName = keyof typeof ICONS;

export const icon = (name: IconName) =>
  `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false" fill="currentColor">${ICONS[name]}</svg>`;

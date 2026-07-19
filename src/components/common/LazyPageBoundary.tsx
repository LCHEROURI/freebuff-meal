import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Wraps a lazy-loaded page so that, every time its route becomes active
 * (initial chunk resolve *and* every SPA navigation to a new instance of the
 * route element), the user's keyboard / screen-reader focus is moved to the
 * destination route's first heading.
 *
 * Without this, route transitions unmount whatever the user had focused
 * (button, link, form field) and the new page silently lands with
 * `document.body` as the focused element. Screen-reader users get no
 * announcement of where they are; keyboard users lose their place on the
 * previously-active control. On in-app transitions between two routes that
 * render the same lazy component (e.g. /app/plans/abc → /app/plans/xyz) the
 * boundary itself doesn't unmount, so without the pathname dep the focus
 * move never re-fires.
 *
 * The heading is given `tabindex="-1"` so the focus move succeeds without
 * pulling it into the regular Tab order — the pattern recommended by the
 * WAI-ARIA Authoring Practices for "page" landmarks.
 */
export const LazyPageBoundary = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const heading = ref.current?.querySelector<HTMLElement>(
      'h1, [role="heading"][aria-level="1"]',
    );
    if (heading) {
      if (!heading.hasAttribute('tabindex')) {
        heading.setAttribute('tabindex', '-1');
      }
      // `preventScroll: false` lets the browser bring the heading into view;
      // since we don't run <ScrollRestoration /> yet, sighted keyboard users
      // need the focus target to actually be on-screen.
      heading.focus({ preventScroll: false });
    }
    // We deliberately depend on `pathname` (not the lazy chunk id) so the
    // effect re-fires on every SPA route entry, including transitions that
    // reuse the same lazy component.
  }, [pathname]);
  return (
    // `contents` is Tailwind's utility equivalent of `display: contents`. It
    // keeps the ref'd element in the DOM (so useRef + querySelector-under-it
    // still works) but removes it from the box tree, so any layout CSS
    // targeting direct-child selectors on the route element still matches
    // the page's *real* first child.
    //
    // Trade-off: Safari < 16 had a documented bug where display:contents hid
    // nodes from VoiceOver. Modern Safari, Chrome, Firefox, Edge, NVDA, JAWS
    // (since ~2020), and TalkBack all handle it correctly, and the wrapper
    // carries no role/aria-* so no semantic information is dropped. The
    // choice is intentional — see focus restoration requirement above.
    <div ref={ref} className="contents">
      {children}
    </div>
  );
};

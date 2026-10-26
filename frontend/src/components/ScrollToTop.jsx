import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Sits inside the Router, above the routed content. React Router doesn't
// reset scroll position on navigation by default, so without this, clicking
// a link (e.g. a footer link while scrolled to the bottom) keeps you at
// whatever scroll position you were at on the previous page.
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

import { act } from "@testing-library/react";
import { useEffect } from "react";
import { useLocation, useNavigate, type Location, type NavigateFunction } from "react-router-dom";

// Render <RouterProbe /> beside the tree under test to follow links, go Back and read the URL.
const router: { location?: Location; navigate?: NavigateFunction } = {};

export const RouterProbe = () => {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    router.location = location;
    router.navigate = navigate;
  });
  return null;
};

/** Path and query string of the probe's router, e.g. "/compendium?spell=7". */
export const currentUrl = () => `${router.location?.pathname}${router.location?.search}`;

/** Navigate like a link (a path) or Back/Forward (a number), inside act. */
export const go = (to: string | number) =>
  act(async () => {
    if (typeof to === "number") await router.navigate?.(to);
    else await router.navigate?.(to);
  });

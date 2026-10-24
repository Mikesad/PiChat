"use client";

import { useEffect } from "react";
import { PICHAT_LOGO_PATH, PICHAT_LOGO_TRANSFORM, PICHAT_LOGO_VIEWBOX } from "./pichat-logo";

function iconHref(): string {
  const color =
    getComputedStyle(document.documentElement).getPropertyValue("--logo-color").trim() || "#2563EB";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${PICHAT_LOGO_VIEWBOX}"><g transform="${PICHAT_LOGO_TRANSFORM}"><path d="${PICHAT_LOGO_PATH}" fill="${color}"/></g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function applyFavicon() {
  const href = iconHref();
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));

  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = href;
    document.head.appendChild(link);
    return;
  }

  for (const link of links) {
    if (link.getAttribute("href") !== href) link.href = href;
    link.type = "image/svg+xml";
  }
}

export function ThemeFavicon() {
  useEffect(() => {
    applyFavicon();

    const themeObserver = new MutationObserver(applyFavicon);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    const headObserver = new MutationObserver(applyFavicon);
    headObserver.observe(document.head, { childList: true, subtree: true });

    return () => {
      themeObserver.disconnect();
      headObserver.disconnect();
    };
  }, []);

  return null;
}

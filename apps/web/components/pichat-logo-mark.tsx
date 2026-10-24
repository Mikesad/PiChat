import { PICHAT_LOGO_PATH, PICHAT_LOGO_TRANSFORM, PICHAT_LOGO_VIEWBOX } from "./pichat-logo";

interface PiChatLogoMarkProps {
  className?: string;
  width?: number;
  height?: number;
}

// Artistic serif "P" glyph from the PiChat brand artwork (transparent background).
// Filled with the color of its parent (--logo-color set per theme in globals.css).
export function PiChatLogoMark({ className, width = 26, height = 26 }: PiChatLogoMarkProps) {
  return (
    <svg
      viewBox={PICHAT_LOGO_VIEWBOX}
      width={width}
      height={height}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <g transform={PICHAT_LOGO_TRANSFORM}>
        <path d={PICHAT_LOGO_PATH} />
      </g>
    </svg>
  );
}

/// <reference types="vite/client" />
import 'react';

// Allow CSS custom properties (style={{ '--c': color }}) in inline styles.
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}

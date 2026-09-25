import { useEffect, useState } from 'react';

function read() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    edge: v('--edge'),
    critical: v('--critical'),
    accent: v('--accent'),
    dot: v('--dot'),
    mask: v('--minimap-mask'),
    person: v('--person'),
    system: v('--system'),
    agent: v('--agent'),
    stepStroke: v('--step-stroke'),
  };
}

export type ThemeColors = ReturnType<typeof read>;

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(read);
  useEffect(() => {
    const update = () => setColors(read());
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      media.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);
  return colors;
}

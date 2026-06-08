'use client';

import { useEffect, useRef, useState } from 'react';

export function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);
  const hasMounted = useRef(false);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : true;

    if (reduced || hasMounted.current) {
      hasMounted.current = true;
      setValue(target);
      return;
    }

    hasMounted.current = true;
    setValue(0);
    let start: number | null = null;

    function step(ts: number) {
      if (start === null) start = ts;
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    }

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

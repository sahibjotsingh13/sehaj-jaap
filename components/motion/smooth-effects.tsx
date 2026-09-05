'use client';

import { useEffect } from 'react';

export function SmoothEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches) {
      root.classList.add('motion-reduced');
      return;
    }

    root.classList.add('motion-enhanced');

    let frame = 0;
    const updateScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / max));
        root.style.setProperty('--scroll-progress', progress.toFixed(4));
        root.style.setProperty(
          '--hero-parallax',
          Math.min(34, window.scrollY * 0.035).toFixed(2) + 'px',
        );
      });
    };

    let pointerFrame = 0;
    const updatePointer = (event: PointerEvent) => {
      if (pointerFrame) return;
      const x = event.clientX;
      const y = event.clientY;
      pointerFrame = window.requestAnimationFrame(() => {
        pointerFrame = 0;
        root.style.setProperty('--pointer-x', ((x / window.innerWidth) * 2 - 1).toFixed(3));
        root.style.setProperty('--pointer-y', ((y / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };

    const revealNodes = Array.from(
      document.querySelectorAll<HTMLElement>('[data-reveal]'),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('is-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      {
        rootMargin: '0px 0px -8% 0px',
        threshold: 0.08,
      },
    );

    revealNodes.forEach((node) => observer.observe(node));
    updateScroll();

    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', updateScroll);
      window.removeEventListener('pointermove', updatePointer);
      if (frame) window.cancelAnimationFrame(frame);
      if (pointerFrame) window.cancelAnimationFrame(pointerFrame);
      root.classList.remove('motion-enhanced');
      root.style.removeProperty('--scroll-progress');
      root.style.removeProperty('--hero-parallax');
      root.style.removeProperty('--pointer-x');
      root.style.removeProperty('--pointer-y');
    };
  }, []);

  return null;
}

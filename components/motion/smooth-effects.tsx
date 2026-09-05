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
    let lastScrollY = window.scrollY;
    let lastTime = performance.now();

    const updateScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const now = performance.now();
        const currentY = window.scrollY;
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, currentY / max));
        const elapsed = Math.max(16, now - lastTime);
        const velocity = Math.max(
          -1,
          Math.min(1, ((currentY - lastScrollY) / elapsed) * 0.12),
        );

        root.style.setProperty('--scroll-progress', progress.toFixed(4));
        root.style.setProperty('--scroll-velocity', velocity.toFixed(4));
        root.style.setProperty(
          '--hero-parallax',
          Math.min(32, currentY * 0.03).toFixed(2) + 'px',
        );
        root.dataset.scrollState = currentY > 28 ? 'scrolled' : 'top';

        lastScrollY = currentY;
        lastTime = now;
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

    const observed = new WeakSet<Element>();
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

    const observeReveals = (rootNode: Document | HTMLElement = document) => {
      rootNode.querySelectorAll<HTMLElement>('[data-reveal]').forEach((node) => {
        if (!observed.has(node)) {
          observed.add(node);
          observer.observe(node);
        }
      });
    };

    observeReveals();
    const mutationObserver = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches('[data-reveal]') && !observed.has(node)) {
              observed.add(node);
              observer.observe(node);
            }
            observeReveals(node);
          }
        });
      }
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    updateScroll();
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });

    return () => {
      mutationObserver.disconnect();
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
      root.style.removeProperty('--scroll-velocity');
      delete root.dataset.scrollState;
    };
  }, []);

  return null;
}

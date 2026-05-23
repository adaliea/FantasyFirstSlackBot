import React, { useState, useRef, useEffect, useLayoutEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
}

interface Placement {
  top: number;
  left: number;
  arrowLeft: number; // px offset from tooltip's left edge for the arrow
  side: 'above' | 'below';
}

const VIEWPORT_PADDING = 8;

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  // Dismiss on outside click / tap
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent | TouchEvent): void {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (tooltipRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Dismiss on Esc
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Compute placement when opened, and on resize/scroll while open.
  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    function compute(): void {
      const trigger = triggerRef.current;
      const tip = tooltipRef.current;
      if (!trigger || !tip) return;
      const tRect = trigger.getBoundingClientRect();
      const tipW = tip.offsetWidth;
      const tipH = tip.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Prefer above; flip below if there isn't room.
      const roomAbove = tRect.top;
      const roomBelow = vh - tRect.bottom;
      const side: 'above' | 'below' =
        roomAbove >= tipH + VIEWPORT_PADDING || roomAbove >= roomBelow ? 'above' : 'below';
      const top =
        side === 'above'
          ? Math.max(VIEWPORT_PADDING, tRect.top - tipH - 8)
          : Math.min(vh - tipH - VIEWPORT_PADDING, tRect.bottom + 8);

      const triggerCenterX = tRect.left + tRect.width / 2;
      const desiredLeft = triggerCenterX - tipW / 2;
      const left = Math.max(
        VIEWPORT_PADDING,
        Math.min(vw - tipW - VIEWPORT_PADDING, desiredLeft),
      );
      // Arrow points at the trigger's center, clamped within the tooltip's body
      // so it stays attached even when we've shifted to fit the viewport.
      const arrowLeft = Math.max(8, Math.min(tipW - 8, triggerCenterX - left));

      setPlacement({ top, left, arrowLeft, side });
    }
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  const tooltipNode = open
    ? createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: placement?.top ?? -9999,
            left: placement?.left ?? -9999,
            // Bound width to viewport so long content wraps on narrow phones.
            maxWidth: 'min(20rem, calc(100vw - 16px))',
            // Hide while we haven't measured yet to avoid a one-frame flash
            // in the wrong spot.
            visibility: placement ? 'visible' : 'hidden',
          }}
          className="z-50 w-56 rounded-lg shadow-xl border border-gray-200 bg-white text-gray-800 text-sm p-3"
        >
          {content}
          {placement && (
            <div
              className={`absolute border-4 border-transparent ${
                placement.side === 'above' ? 'top-full border-t-white' : 'bottom-full border-b-white'
              }`}
              style={{ left: `${placement.arrowLeft - 4}px` }}
            />
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={triggerRef} className="relative inline-block">
      <div
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer"
      >
        {children}
      </div>
      {tooltipNode}
    </div>
  );
}

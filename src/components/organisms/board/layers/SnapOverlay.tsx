// -- Type Imports --
import type { DistanceBadge, GuideSegment } from '@/lib/board/boardSnapping';

interface SnapOverlayProps {
   guides: GuideSegment[];
   badges: DistanceBadge[];
   zoom: number;
   zIndex: number;
}

/** Screen-px half-length of a badge end tick and the gap label's offset off the measure line. */
const TICK = 4;
const LABEL_OFFSET = 8;
const LABEL_SIZE = 11;

/*
 * The Shift-drag assist overlay: bounded alignment guide lines plus equal-spacing distance badges, drawn in
 * the world layer so they track pan/zoom. Inert; every stroke and the label counter-scale by 1/zoom to hold a
 * constant on-screen weight; theme accent only. Tops the item bands.
 */
export function SnapOverlay({ guides, badges, zoom, zIndex }: SnapOverlayProps) {
   if (guides.length === 0 && badges.length === 0) return null;
   const stroke = 1 / zoom;
   const tick = TICK / zoom;
   const offset = LABEL_OFFSET / zoom;
   const fontSize = LABEL_SIZE / zoom;
   return (
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width="1" height="1" style={{ zIndex }} aria-hidden>
         {guides.map((guide, index) =>
            guide.axis === 'x' ? (
               <line key={`g${index}`} className="stroke-primary" x1={guide.coord} y1={guide.from} x2={guide.coord} y2={guide.to} strokeWidth={stroke} />
            ) : (
               <line key={`g${index}`} className="stroke-primary" x1={guide.from} y1={guide.coord} x2={guide.to} y2={guide.coord} strokeWidth={stroke} />
            ),
         )}
         {badges.map((badge, index) => {
            // A measure line between the two facing edges, end ticks, and the rounded gap value nudged off the line.
            const label = Math.round(badge.gap);
            if (badge.axis === 'x') {
               const y = badge.mid.y;
               return (
                  <g key={`b${index}`} className="stroke-primary fill-primary">
                     <line x1={badge.from} y1={y} x2={badge.to} y2={y} strokeWidth={stroke} />
                     <line x1={badge.from} y1={y - tick} x2={badge.from} y2={y + tick} strokeWidth={stroke} />
                     <line x1={badge.to} y1={y - tick} x2={badge.to} y2={y + tick} strokeWidth={stroke} />
                     <text x={badge.mid.x} y={y - offset} textAnchor="middle" stroke="none" fontSize={fontSize}>{label}</text>
                  </g>
               );
            }
            const x = badge.mid.x;
            return (
               <g key={`b${index}`} className="stroke-primary fill-primary">
                  <line x1={x} y1={badge.from} x2={x} y2={badge.to} strokeWidth={stroke} />
                  <line x1={x - tick} y1={badge.from} x2={x + tick} y2={badge.from} strokeWidth={stroke} />
                  <line x1={x - tick} y1={badge.to} x2={x + tick} y2={badge.to} strokeWidth={stroke} />
                  <text x={x + offset} y={badge.mid.y} textAnchor="start" dominantBaseline="middle" stroke="none" fontSize={fontSize}>{label}</text>
               </g>
            );
         })}
      </svg>
   );
}

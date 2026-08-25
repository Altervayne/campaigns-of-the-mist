// -- Type Imports --
import type { PdfDocument } from '@/lib/types/pdf';

/** Whether a PDF carries any markup, so a marked-up book reads as annotated at a glance. */
export function hasAnnotations(doc: PdfDocument | undefined | null): boolean {
   return !!doc?.annotations && Object.keys(doc.annotations).length > 0;
}

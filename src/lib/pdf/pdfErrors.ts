/**
 * Typed errors thrown by the pdf data layer.
 *
 * Mirrors `assetErrors.ts`: the repository throws and never swallows; it has no UI
 * concerns. The layer that wraps it is the single place that catches these and surfaces
 * them. The error carries a stable `code` so callers can branch without string-matching
 * messages.
 */

/**
 * A Dexie/IndexedDB pdf transaction failed and was rolled back. Wraps the underlying
 * cause so the original failure is not lost.
 */
export class PdfRepositoryError extends Error {
   readonly code = 'PDF_REPOSITORY_FAILED';
   constructor(message: string, options?: { cause?: unknown }) {
      super(message, options);
      this.name = 'PdfRepositoryError';
   }
}

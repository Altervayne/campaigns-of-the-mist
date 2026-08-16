// -- React Imports --
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ComponentType, ReactNode } from 'react';

// -- Icon Imports --
import {
   AlignCenter,
   AlignLeft,
   AlignRight,
   ArrowDown,
   ArrowDownToLine,
   ArrowLeft,
   ArrowLeftToLine,
   ArrowRight,
   ArrowRightToLine,
   ArrowUp,
   ArrowUpToLine,
   Trash2,
} from 'lucide-react';

// -- Component Imports --
import { MobileBottomSheet } from '@/components/mobile/shared/MobileBottomSheet';

// -- Logic Imports --
import { advanceTarget } from '@/lib/notes/tableSheetTarget';

// -- Utils Imports --
import { cn } from '@/lib/utils';

// -- Type Imports --
import type { TableContextRequest } from '@/components/organisms/note/live/tableWidget';
import type { TableTarget, TableTargetOp } from '@/lib/notes/tableSheetTarget';
import type { ColumnAlign } from '@/lib/notes/noteFormat';

interface MobileNoteTableSheetProps {
   /** The open request (null = closed). A fresh request re-seeds the walking target on the caret's cell. */
   request: TableContextRequest | null;
   /** Explicit Done / backdrop tap closes the sheet. */
   onClose: () => void;
}

/*
 * The mobile table slide-up: a STICKY bottom sheet that replaces the keyboard for structural table editing.
 * It holds a logical target cell (from the caret) and re-resolves the action bag each render against the table's
 * stable position, so ops keep hitting the right table and the target walks after each op WITHOUT refocusing a
 * DOM cell (which would re-raise the keyboard). Insert / Move / Align / Delete groups, big touch targets,
 * edge-disabled moves. App-token chrome.
 */
export function MobileNoteTableSheet({ request, onClose }: MobileNoteTableSheetProps) {
   const { t } = useTranslation();
   // Seed the walking target from the request's caret cell, including on a mount that already has a request.
   const [target, setTarget] = useState<TableTarget>(() => (request ? { row: request.row, col: request.col } : { row: 0, col: 0 }));

   // A later request (a fresh caret cell) re-seeds the target; a close leaves the last target (harmless).
   // Reset during render on a request-identity change - the recommended alternative to a setState-in-effect.
   const [seenRequest, setSeenRequest] = useState(request);
   if (request !== seenRequest) {
      setSeenRequest(request);
      if (request) setTarget({ row: request.row, col: request.col });
   }

   const actions = request ? request.resolveFor(target.row, target.col) : null;

   // Run a structural op, then advance the logical target (dims read AFTER the op so a delete clamps correctly).
   const runAdvance = (op: TableTargetOp, run: () => void) => {
      run();
      setTarget((prev) => advanceTarget(op, prev, request?.getDims() ?? null));
   };
   const runAlign = (align: ColumnAlign) => actions?.alignColumn(align);
   const runDeleteTable = () => {
      actions?.deleteTable();
      onClose();
   };

   const headerLabel =
      target.row < 0
         ? t('NoteView.tableSheet.cellHeader', { col: target.col + 1 })
         : t('NoteView.tableSheet.cellRow', { row: target.row + 1, col: target.col + 1 });

   return (
      <MobileBottomSheet isOpen={!!request} onClose={onClose}>
         {actions && (
            <div className="pb-[env(safe-area-inset-bottom)]">
               <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <span className="text-base font-semibold text-foreground">{headerLabel}</span>
                  <button
                     type="button"
                     onClick={onClose}
                     className="rounded-md px-3 py-1.5 text-sm font-medium text-foreground active:bg-muted"
                  >
                     {t('NoteView.tableSheet.done')}
                  </button>
               </div>

               <div className="space-y-3 px-4 py-3">
                  <TableSheetGroup title={t('NoteView.tableSheet.groupInsert')}>
                     <TableSheetButton icon={ArrowUpToLine} label={t('NoteView.tableSheet.insertRowAbove')} onClick={() => runAdvance('insertRowAbove', actions.insertRowAbove)} />
                     <TableSheetButton icon={ArrowDownToLine} label={t('NoteView.tableSheet.insertRowBelow')} onClick={() => runAdvance('insertRowBelow', actions.insertRowBelow)} />
                     <TableSheetButton icon={ArrowLeftToLine} label={t('NoteView.tableSheet.insertColumnLeft')} onClick={() => runAdvance('insertColumnLeft', actions.insertColumnLeft)} />
                     <TableSheetButton icon={ArrowRightToLine} label={t('NoteView.tableSheet.insertColumnRight')} onClick={() => runAdvance('insertColumnRight', actions.insertColumnRight)} />
                  </TableSheetGroup>

                  <TableSheetGroup title={t('Common.move')}>
                     <TableSheetButton icon={ArrowUp} label={t('NoteView.tableSheet.moveRowUp')} disabled={!actions.canMoveRowUp} onClick={() => runAdvance('moveRowUp', actions.moveRowUp)} />
                     <TableSheetButton icon={ArrowDown} label={t('NoteView.tableSheet.moveRowDown')} disabled={!actions.canMoveRowDown} onClick={() => runAdvance('moveRowDown', actions.moveRowDown)} />
                     <TableSheetButton icon={ArrowLeft} label={t('NoteView.tableSheet.moveColumnLeft')} disabled={!actions.canMoveColumnLeft} onClick={() => runAdvance('moveColumnLeft', actions.moveColumnLeft)} />
                     <TableSheetButton icon={ArrowRight} label={t('NoteView.tableSheet.moveColumnRight')} disabled={!actions.canMoveColumnRight} onClick={() => runAdvance('moveColumnRight', actions.moveColumnRight)} />
                  </TableSheetGroup>

                  <TableSheetGroup title={t('NoteView.tableSheet.groupAlign')}>
                     <TableSheetButton icon={AlignLeft} label={t('Common.left')} onClick={() => runAlign('left')} />
                     <TableSheetButton icon={AlignCenter} label={t('NoteView.tableSheet.alignCenter')} onClick={() => runAlign('center')} />
                     <TableSheetButton icon={AlignRight} label={t('Common.right')} onClick={() => runAlign('right')} />
                  </TableSheetGroup>

                  <TableSheetGroup title={t('NoteView.tableSheet.groupDelete')}>
                     <TableSheetButton icon={Trash2} label={t('NoteView.tableSheet.deleteRow')} destructive disabled={!actions.canDeleteRow} onClick={() => runAdvance('deleteRow', actions.deleteRow)} />
                     <TableSheetButton icon={Trash2} label={t('NoteView.tableSheet.deleteColumn')} destructive disabled={!actions.canDeleteColumn} onClick={() => runAdvance('deleteColumn', actions.deleteColumn)} />
                     <TableSheetButton icon={Trash2} label={t('Common.table')} destructive onClick={runDeleteTable} />
                  </TableSheetGroup>
               </div>
            </div>
         )}
      </MobileBottomSheet>
   );
}

/** A labeled row of table-op buttons; `role="group"` carries the group name for assistive tech. */
function TableSheetGroup({ title, children }: { title: string; children: ReactNode }) {
   return (
      <section role="group" aria-label={title}>
         <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
         <div className="flex gap-2">{children}</div>
      </section>
   );
}

/** One big touch target: icon over label, equal-width within its group. Destructive ops carry the delete token. */
function TableSheetButton({
   icon: Icon,
   label,
   onClick,
   disabled,
   destructive,
}: {
   icon: ComponentType<{ className?: string }>;
   label: string;
   onClick: () => void;
   disabled?: boolean;
   destructive?: boolean;
}) {
   return (
      <button
         type="button"
         aria-label={label}
         disabled={disabled}
         onClick={onClick}
         className={cn(
            'flex min-h-16 flex-1 basis-0 flex-col items-center justify-center gap-1 rounded-lg border border-border px-1.5 py-2 text-center text-xs font-medium leading-tight text-foreground active:bg-muted disabled:opacity-40 disabled:active:bg-transparent',
            destructive && 'border-destructive/40 text-destructive active:bg-destructive/10',
         )}
      >
         <Icon className="h-5 w-5" />
         <span>{label}</span>
      </button>
   );
}

// -- React Imports --
import type { ChangeEventHandler, RefObject } from 'react';

interface SidebarFileInputsProps {
   characterImportInputRef: RefObject<HTMLInputElement | null>;
   characterFormRef: RefObject<HTMLFormElement | null>;
   componentImportInputRef: RefObject<HTMLInputElement | null>;
   componentFormRef: RefObject<HTMLFormElement | null>;
   boardImportInputRef: RefObject<HTMLInputElement | null>;
   boardFormRef: RefObject<HTMLFormElement | null>;
   characterUpdateInputRef: RefObject<HTMLInputElement | null>;
   characterUpdateFormRef: RefObject<HTMLFormElement | null>;
   boardUpdateInputRef: RefObject<HTMLInputElement | null>;
   boardUpdateFormRef: RefObject<HTMLFormElement | null>;
   noteImportInputRef: RefObject<HTMLInputElement | null>;
   noteFormRef: RefObject<HTMLFormElement | null>;
   noteUpdateInputRef: RefObject<HTMLInputElement | null>;
   noteUpdateFormRef: RefObject<HTMLFormElement | null>;
   workspaceImportInputRef: RefObject<HTMLInputElement | null>;
   workspaceFormRef: RefObject<HTMLFormElement | null>;
   onCharacterFileSelected: ChangeEventHandler<HTMLInputElement>;
   onComponentFileSelected: ChangeEventHandler<HTMLInputElement>;
   onBoardFileSelected: ChangeEventHandler<HTMLInputElement>;
   onCharacterUpdateFileSelected: ChangeEventHandler<HTMLInputElement>;
   onBoardUpdateFileSelected: ChangeEventHandler<HTMLInputElement>;
   onNoteFileSelected: ChangeEventHandler<HTMLInputElement>;
   onNoteUpdateFileSelected: ChangeEventHandler<HTMLInputElement>;
   onWorkspaceFileSelected: ChangeEventHandler<HTMLInputElement>;
}

// The hidden file inputs. Each input pairs with its own hidden form: a trigger button `.click()`s the input
// and its change handler `.reset()`s the form so re-picking the same file re-fires onChange.
export function SidebarFileInputs({
   characterImportInputRef,
   characterFormRef,
   componentImportInputRef,
   componentFormRef,
   boardImportInputRef,
   boardFormRef,
   characterUpdateInputRef,
   characterUpdateFormRef,
   boardUpdateInputRef,
   boardUpdateFormRef,
   noteImportInputRef,
   noteFormRef,
   noteUpdateInputRef,
   noteUpdateFormRef,
   workspaceImportInputRef,
   workspaceFormRef,
   onCharacterFileSelected,
   onComponentFileSelected,
   onBoardFileSelected,
   onCharacterUpdateFileSelected,
   onBoardUpdateFileSelected,
   onNoteFileSelected,
   onNoteUpdateFileSelected,
   onWorkspaceFileSelected,
}: SidebarFileInputsProps) {
   return (
      <>
         <form ref={characterFormRef} className="hidden">
            <input
               type="file"
               ref={characterImportInputRef}
               onChange={onCharacterFileSelected}
               accept=".cotm,application/json"
            />
         </form>
         <form ref={componentFormRef} className="hidden">
            <input
               type="file"
               ref={componentImportInputRef}
               onChange={onComponentFileSelected}
               accept=".cotm,application/json"
            />
         </form>
         <form ref={boardFormRef} className="hidden">
            <input
               type="file"
               ref={boardImportInputRef}
               onChange={onBoardFileSelected}
               accept=".cotm,application/json"
            />
         </form>
         <form ref={characterUpdateFormRef} className="hidden">
            <input
               type="file"
               ref={characterUpdateInputRef}
               onChange={onCharacterUpdateFileSelected}
               accept=".cotm,application/json"
            />
         </form>
         <form ref={boardUpdateFormRef} className="hidden">
            <input
               type="file"
               ref={boardUpdateInputRef}
               onChange={onBoardUpdateFileSelected}
               accept=".cotm,application/json"
            />
         </form>
         <form ref={noteFormRef} className="hidden">
            <input
               type="file"
               ref={noteImportInputRef}
               onChange={onNoteFileSelected}
               accept=".cotm,application/json,.md,.markdown,text/markdown"
            />
         </form>
         <form ref={noteUpdateFormRef} className="hidden">
            <input
               type="file"
               ref={noteUpdateInputRef}
               onChange={onNoteUpdateFileSelected}
               accept=".cotm,application/json,.md,.markdown,text/markdown"
            />
         </form>
         <form ref={workspaceFormRef} className="hidden">
            <input
               type="file"
               ref={workspaceImportInputRef}
               onChange={onWorkspaceFileSelected}
               accept=".cotm,application/json,.md,.markdown,text/markdown"
            />
         </form>
      </>
   );
}

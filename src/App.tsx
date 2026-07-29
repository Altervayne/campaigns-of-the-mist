import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeModeManager } from '@/components/providers/ThemeModeManager';
import { ThemeClassManager } from '@/components/providers/ThemeClassManager';
import { AppStartManagerProvider } from '@/components/providers/AppStartManager';
import { ActiveCharacterStoreProvider } from '@/lib/character/ActiveCharacterStoreProvider';
import { ActiveBoardStoreProvider } from '@/lib/board/ActiveBoardStoreProvider';
import { ActiveNoteStoreProvider } from '@/lib/notes/ActiveNoteStoreProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DevPreviewWarning, IS_DEV_PREVIEW } from '@/components/DevPreviewWarning';
import { AnnouncementBanner } from '@/components/AnnouncementBanner';
import PWAUpdatePrompt from '@/components/PWAUpdatePrompt';
import { router } from '@/router';
import { useDeviceType } from '@/hooks/useDeviceType';
import { useImageDragGuard } from '@/hooks/useImageDragGuard';
import '@/app/global.css';

function AppContent() {
  const { isMobile } = useDeviceType();
  // One delegated listener stands in for a `draggable={false}` on every image in the app.
  useImageDragGuard();

  return (
    // A flex column so the dev-preview banner (when present) reserves its height above the app instead of
    // covering it. With no banner the app child fills the whole 100dvh - layout is unchanged.
    <div className="flex h-[100dvh] w-[100dvw] flex-col overflow-hidden">
      {/* Env-gated unstable-build warning; renders nothing in normal/production builds. */}
      <DevPreviewWarning />
      {/* Returning-user announcement channel; reserves height above both shells, renders nothing when nothing's unseen. */}
      <AnnouncementBanner />
      {/* On the dev preview, inset the app by the hazard frame's 6px so it sits inside the frame (the frame
          draws in this gutter) instead of being overlapped. Top is already handled by the banner above. */}
      <div className={`relative min-h-0 w-full flex-1 overflow-hidden${IS_DEV_PREVIEW ? ' px-1.5 pb-1.5' : ''}`}>
        <RouterProvider router={router} />
      </div>
      <PWAUpdatePrompt />
      <Toaster
        position={isMobile ? 'top-center' : 'bottom-center'}
        // Keep top-center toasts clear of the status bar on inset devices (0 elsewhere).
        containerStyle={{ top: 'env(safe-area-inset-top)' }}
        toastOptions={{
          className: 'bg-card text-card-foreground border rounded-md shadow-lg',
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    // Mode (dark/light class) and palette (theme-* class) managers own disjoint classes on <html>; the
    // initial classes are set synchronously by the inline no-flash script in index.html.
    <ThemeModeManager>
      <ThemeClassManager>
        {/* Resolution layer for the active character store. Hoisted above
            AppStartManagerProvider because that provider boots the active character
            and hosts the TutorialRunner, both of which consume the store; this
            covers every character consumer in the app. */}
        <ActiveCharacterStoreProvider>
          {/* Parallel resolution layer for the active board store (board-5+). Inert
              until a board tab is opened: it resolves null under a character tab or the
              menu, so the app behaves identically for characters. */}
          <ActiveBoardStoreProvider>
            {/* Parallel resolution layer for the active note store (Notes epic). Inert
                until a note tab is opened: it resolves null under a character/board tab or
                the menu, so the app behaves identically for the other tab kinds. */}
            <ActiveNoteStoreProvider>
              <AppStartManagerProvider>
                <ErrorBoundary>
                  <AppContent />
                </ErrorBoundary>
              </AppStartManagerProvider>
            </ActiveNoteStoreProvider>
          </ActiveBoardStoreProvider>
        </ActiveCharacterStoreProvider>
      </ThemeClassManager>
    </ThemeModeManager>
  );
}
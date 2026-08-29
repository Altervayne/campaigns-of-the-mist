// -- React Imports --
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// -- Other Library Imports --
import { motion } from 'framer-motion';

// -- Component Imports --
import { TabTypeChooser } from '@/components/molecules/TabTypeChooser';

const MainMenu: React.FC = () => {
   const { t } = useTranslation();

   // Bottom scroll cue: shown only while there's more content below the fold.
   const scrollRef = useRef<HTMLElement>(null);
   const contentRef = useRef<HTMLDivElement>(null);
   const [canScrollDown, setCanScrollDown] = useState(false);
   useEffect(() => {
      const el = scrollRef.current;
      if (!el) return;
      const update = () => setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
      update();
      el.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      // Observe the CONTENT (not the fixed-size scroll box) so the cue re-checks when the page reflows.
      const observer = new ResizeObserver(update);
      if (contentRef.current) observer.observe(contentRef.current);
      return () => {
         el.removeEventListener('scroll', update);
         window.removeEventListener('resize', update);
         observer.disconnect();
      };
   }, []);

   return (
      <main ref={scrollRef} className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-linear-to-br from-background via-background to-muted/20">
       {/* Content layer: fills the viewport when short, grows when tall; sits above the mist. */}
       <div ref={contentRef} className="relative z-10 flex min-h-full w-full flex-col items-center">

         <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10 flex w-full max-w-6xl flex-col items-center gap-10 p-8 pt-12"
         >
            {/* Header */}
            <div className="flex flex-col items-center gap-6 text-center">
               {/* Wordmark banner, masked so it takes the theme foreground colour and reads on any theme. */}
               <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  role="img"
                  aria-label={t('MainMenu.title')}
                  className="aspect-[372/144] w-[34rem] max-w-[90%] bg-foreground"
                  style={{
                     maskImage: 'url(/icons/banner.svg)',
                     WebkitMaskImage: 'url(/icons/banner.svg)',
                     maskRepeat: 'no-repeat',
                     WebkitMaskRepeat: 'no-repeat',
                     maskPosition: 'center',
                     WebkitMaskPosition: 'center',
                     maskSize: 'contain',
                     WebkitMaskSize: 'contain',
                  }}
               />
               <p className="text-muted-foreground max-w-md">
                  {t('MainMenu.welcome')}
               </p>
            </div>

            {/* The shared tab-type chooser: one click on a game card or the board card creates that tab. */}
            <motion.div
               data-tutorial="main-menu-chooser"
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: 0.3 }}
               className="w-full max-w-3xl"
            >
               <TabTypeChooser />
            </motion.div>
         </motion.div>
       </div>

       {/* Mist: stuck to the bottom of the scrollport so it stays in view at any scroll depth. */}
       <div className="pointer-events-none sticky bottom-0 z-0 h-0 w-full">
          <div className="absolute bottom-0 left-0 right-0 h-[34rem] overflow-hidden">
             {/* Wave Layer 1 - Bottom */}
             <motion.div
                className="absolute bottom-0 left-0 right-0 h-[34rem] opacity-[0.12]"
                initial={{ x: 0 }}
                animate={{ x: [-20, 20, -20] }}
                transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
             >
                <svg className="absolute bottom-0 w-[110%] h-full -left-[5%]" preserveAspectRatio="none" viewBox="0 0 1200 120">
                   <path d="M0,50 C300,80 400,20 600,50 C800,80 900,20 1200,50 L1200,120 L0,120 Z" fill="currentColor" className="text-muted-foreground" />
                </svg>
             </motion.div>

             {/* Wave Layer 2 - Middle */}
             <motion.div
                className="absolute bottom-0 left-0 right-0 h-[28rem] opacity-[0.09]"
                initial={{ x: 0 }}
                animate={{ x: [20, -20, 20] }}
                transition={{ duration: 11, repeat: Infinity, ease: "easeInOut" }}
             >
                <svg className="absolute bottom-0 w-[110%] h-full -left-[5%]" preserveAspectRatio="none" viewBox="0 0 1200 120">
                   <path d="M0,60 C250,90 450,30 650,60 C850,90 1000,30 1200,60 L1200,120 L0,120 Z" fill="currentColor" className="text-muted-foreground/70" />
                </svg>
             </motion.div>

             {/* Wave Layer 3 - Top */}
             <motion.div
                className="absolute bottom-0 left-0 right-0 h-[22rem] opacity-[0.06]"
                initial={{ x: 0 }}
                animate={{ x: [-15, 15, -15] }}
                transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
             >
                <svg className="absolute bottom-0 w-[110%] h-full -left-[5%]" preserveAspectRatio="none" viewBox="0 0 1200 120">
                   <path d="M0,70 C200,100 500,40 700,70 C900,100 1050,40 1200,70 L1200,120 L0,120 Z" fill="currentColor" className="text-muted-foreground/50" />
                </svg>
             </motion.div>
          </div>
       </div>

       {/* Scroll cue: a soft shadow along the bottom edge while more content sits below the fold. */}
       <div
          className="pointer-events-none sticky bottom-0 z-20 h-0 w-full transition-opacity duration-300"
          style={{ opacity: canScrollDown ? 1 : 0 }}
       >
          <div className="absolute bottom-0 left-0 right-0 h-20" style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.3), rgb(0 0 0 / 0.08) 45%, transparent)' }} />
       </div>
      </main>
   );
};

export default MainMenu;
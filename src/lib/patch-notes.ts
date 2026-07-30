import { gt as isVersionGreaterThan } from 'semver';

export interface PatchNote {
  version: string;
  content: string;
}

export const patchNotes: PatchNote[] = [
   {
      version: '2.0.1',
      content: `
### 🔧 Changes
* Edit mode is now a toggle on the character sheet's tab bar on mobile, instead of being tucked away in the toolbelt.
* Undo and Redo no longer close the mobile toolbelt, so you can use them several times in a row.
* "Unload Character" is now "Close Sheet". It warns before discarding unsaved changes and offers to save first.
* The image cropper no longer rejects small or awkwardly-shaped images. It warns that a small crop may look soft, but lets you use it.

### 🐛 Bugfixes
* Fixed editing two fields in a row on a theme card (a main tag, then the quest / mystery / identity) sometimes wiping the first one because of debounce concurrency.
* Fixed multi-selections on boards only being movable by the toolbar's grab handle. You can now drag the whole group by any selected element.
* Fixed dragging a board element by an image on it starting a browser image-drag instead of moving the element.
* Fixed selection toolbars getting cut off at the edges of the board, near the sidebar and drawer.
* Fixed the multi-selection toolbar drifting off-screen when panning.
* Fixed reordering a journal's pages also dragging the journal across the board.
* Fixed "Add to character" showing in the mobile drawer for items that can't be added to a character.
`,
   },
   {
      version: '2.0.0',
      content: `
## 🎉 Campaigns of the Mist
*Alright, this is the big one.*

### Characters of the Mist is now Campaigns of the Mist.

When I started this, it was a character sheet app for me and my group to test drive the Tinderbox demo for Legend in the Mist. That was the whole idea, a nice home for your 4 theme cards, your tags, your statuses. But over time, it has become a lot more.
It first became a fully modular character sheet, with reorderable cards, and infinitely many, along with a complete file system to save your components, and the ability to import and export them.
Then it became a mobile app you could bring anywhere.

But now, I felt that "Characters of the Mist" wasn't doing justice to what it has become the past months. While I was developing the Mobile version, I kept branching off and brainstorming some cool new stuff I thought about. I also looked into neat ways to answer some requests, like the ability to have more than one character open at once.
Before I realized it, the Mobile update had taken a LOT more time to come out than I initially anticipated. So I shelved my "work in progress" stuff for a while, and focused on finishing that so I could bring you CotM on mobile phones.

And now, I'm bringing you a lot more. It isn't a simple Character Sheet anymore, it's a whole workspace for your game.
I'm very proud of what it has become, not because it's incredibly popular, but because **I** made it from a dumb little idea that grew to ever bigger proportions as I kept throwing some clay at it and working its shape.

It's still me, Altervayne, all alone.
And it's still free, open-source, and available everywhere.

But this time, it's bigger.

So thank *you* for being here, and using this dumb little app of mine. I hope it made your game a little bit simpler to run or play.

Alright, enough me being emotional. You want to read about what's new, don't you ? Well, here you go !


### 📱 One thing first, about Mobile
Almost everything below is **desktop-first, for now**. Mobile still does everything it did before, but Boards, Workspaces, the Notes editor and a good chunk of the rest didn't make the jump *yet*. At this point, if you've read some of my messages online, you know I don't want to rush things *just to get them out*, because the quality suffers from it, massively. Some features will come to mobile. I just can't promise when.

### 🎨 Custom Themes
Now you can truly make the app *yours*. I had always planned for this to be a thing, and the preset themes were the precursor to that. But now, you actually *can* create a custom theme. You can define every color, and there's even a theme generator from a set of colors you define yourself.

### 🗂️ Workspaces
Following a lot of requests, the app no longer is just *one* place at a time. I completely understand the premise. It's easier to have several characters open at once for GMs or solo players. Well, now you *can*. The app now features a full tabs system, with a tab strip, and a theoretically unlimited amount of simultaneous open tabs. Just... don't overdo it. I wouldn't want your RAM to collapse into a black hole.

### 🗺️ Boards
This is the big one *inside* the big one, and honestly the part I had the most fun making. A **Board** is a freeform, infinite canvas where you can drop... well, almost anything. Live card and tracker embeds, references to your characters, notes, post-its, journals, images, dice trays, zones to group things together, portals to jump around, freehand drawings, connections drawn between items, and Challenge Cards. All the stuff you usually keep juggling in your head while you run a game, a map, a web of who-knows-who, a wall of clues, your session prep, it finally has somewhere to live outside of it.

### 📝 Notes
Every game ends up needing a place for words, so here's yours. **Notes** are full markdown documents, but with a live-preview editor that formats as you type, so there's none of that clunky write-then-preview back-and-forth. You can link notes to each other, and to other corners of the app, using portals. And if you drop a status or a tag into your text as a mention, it turns into a clickable pill. Lore, session recaps, that NPC you improvised and now desperately need to remember, or just thinking out loud, it's all fair game.

### 🧭 The Navigator
Once your campaign starts sprawling across a handful of boards and notes, keeping track of what links to what gets... let's call it *interesting*. So I built the **Navigator**. It traces every portal across the whole app into one hierarchical map, following each connection both ways, forward *and* backward, so you can see exactly how your project holds together. Every board, note, and portal between them, laid out as a single tree you can walk and jump straight through. Drop a portal on a board or a link in a note, and it slots right into the graph. Scope it down to just the workspace you're in, or open it up to the whole project at once.

### ⚔️ Challenge Cards
The natural next step to implementing the Mist Engine properly was, of course, Challenge Cards. So here they are ! You can create one for any of the three games, it can have a proper image to represent it, and it comes with all the bells and whistles.

### 🖼️ Images on Character Sheets
You can now give your characters a face ! Add an image into a Portrait card, crop it directly within the app, and resize it on your sheet with a simple drag of the corner handle. Hopefully this will make it feel more alive !

### 🎲 The Dice Tray
And of course, dice. What's a TTRPG tool without a few dice ? The **Dice Tray** is a new element that follows you no matter which workspace you're in. Open it from the Sidebar, and then pile on as many dice as you want, throw in custom-sided ones, tack on modifiers and penalty dice, or just type something like \`2d6+3\` and let it build the pool for you. It remembers your past rolls too, so if you had a setup you liked, you can bring it right back. And it also lives as a Board element, for when you'd rather leave it out on the table for everyone to see. I know Mist Engine only needs 2d6 rolls, but when I started building it, I knew I had to just go all the way. Who doesn't love a roll table ?

### 🎓 A Brand New Tutorial
With this much new stuff to explore, the old tutorial just wasn't going to cut it, so I rebuilt the whole onboarding and tutorial system from the ground up. It now runs on its own seeded demo content, in an isolated space, so it will **never touch your real data** while it shows you around. And it lives in a new Learn section, which means you can replay any lesson whenever you feel like it, not just once on your very first day.

### 🧰 Also in the box
A handful of smaller things I tucked in along the way:
* **One unified Settings menu**: App Settings, About, and Patch Notes all live under one roof now, with the tutorials nestled into that Learn section.
* **Full backups**: you can export a single file holding *all* your data (characters, boards, notes, drawer, settings) and restore it anywhere. Your safety net, just in case.
* **In-app announcements**: I can now drop a short notice at the top of the app whenever there's something you should know.
* **Under the hood**: your data moved to a sturdier storage engine, so it can carry everything above without breaking a sweat.
* **Custom Markdown tokens**: Wrap your statuses or story tags in any markdown-capable space in the app with these bad boys "{}", and you get a *clickable* tracker pill that creates it in your current workspace.

### 💬 So what's next?
A serious look into PDF exports. It's a commonly requested feature, but it's also one of the more... *tedious*, to get right.
I'll also look into bringing some of the new features to mobile devices.

Thank you, again, for sticking around long enough to watch a silly little character sheet grow into a whole campaign. Now go make something with it.
`
   },
   {
      version: '1.3.1',
      content: `
### 🐛 Bugfixes
* Added missing localization keys for update prompt in French.
* Allowed scroll in onboarding screen on mobile for smaller screens.
* Fixed Edit Theme action in mobile toolbelt not working.
* Fixed custom themebooks not working on mobile.
`
   },
   {
      version: '1.3.0',
      content: `
### ✨ The Mobile Update!
As per requested, Mobile compatibility is here! Characters of the Mist can now be opened on a mobile device with a specially made mobile UI!
Please keep in mind I am absolutely not used to mobile UIs. I tried my best to make something intuitive and pleasant to use, but feeback is always welcome.
There may be unexpected bugs, I didn't get the opportunity to test this on a lot of screen sizes. Don't hesitate to hit up the Tools of the Mist discord !
For the best experience, please install Characters of the Mist as a Progressive Web App on your device using a browser that supports this feature.

**Here's what's in it:**
* **Two navigation modes**: pick what feels best in Settings. Bottom tabs gives you a familiar Sheet / Drawer / Menu bar at the bottom. FAB mode replaces it with a single corner button that expands into the same options, leaving more room for content.
* **Handedness setting**: also in Settings. Choose left or right, and every floating control (the navigation button, the toolbelt, the row grips, the card reorder button) mirrors itself to your thumb side.
* **The Toolbelt**: a thumb-zone action ring summoned by a wrench button. It collects every contextual action: undo/redo, edit mode, save, add cards or trackers, and per-item actions once you select something (delete, flip, export, save to drawer...). The button closest to your thumb is slightly larger as you scroll, so the action you're aiming at is easier to hit.
* **Cards on mobile**: swipe left or right anywhere on a card to flip between them. A navigation bar below has prev/next, flip and reorder buttons, plus dots to show where you are in the stack.
* **Drag to reorder**: drag the grip handle on a drawer item or on a tracker (in edit mode) to move it. For cards, there's a dedicated reorder view (the reorder button in the card navigation bar, or in the Toolbelt) where each card gets a grip handle on the side.
* **Long-press menus**: long-press a drawer item or folder to bring up rename / move / duplicate / delete (the overflow button on each row is always there as a fallback). Long-press a tracker on the sheet to "select" it, and the Toolbelt's actions will then target it specifically.
* **Mobile drawer**: the full drawer with its own undo/redo, view-mode toggle, file import and folder organization, all sized for touch.
* **Gesture tips and haptics**: little one-time hints show up the first time you can use a gesture (can be toggled off in Settings). On supported devices, short vibration cues confirm long-presses, mode changes and so on.

### 🔧 Changes
* "Unload Character" button is now at the bottom of the sidebar, and is called "Return to Menu". The effect is the same, it will completely unload your character from memory. Make sure you saved your character to the drawer beforehand! Hopefully this makes it less ambiguous.
* Tags on the back of character cards (Merc Card (Special) / Hero Card (Backpack) / Rift Card (Nemesis)) are now selectable/burnable.

### 🐛 Bugfixes
* "Save Character As" now properly saves to currently open Drawer folder instead of root.

### Other fixes
As reported, it's LEGEND in the Mist, and not LEGENDS in the Mist. Sorry about that! The text has been adjusted across the app.

`
   },
   {
      version: '1.2.1',
      content: `
### 🔧 Changes
The drop zone for items in the drawer has now been expanded to always take, at minimum, the full available height. It expands with items as they're added. No longer will you have to look for the drop zone before letting go of an item.
\nThe drawer's drop zone will now also look much more vibrant and distinct from the background, instead of the very light color used before.

### 🐛 Bugfixes
Found and fixed a few missing localized strings across the app.
Fixed Character Name inputs in Character Card and Page Header not updating each other.
`
   },
   {
      version: '1.2.0',
      content: `
### Another big one, back to back!
Not as long awaited, but a big milestone for me and for any future adjustment or addition.

### ✨ **New !**
**PWA support**: Characters of the Mist can now be installed as a PWA on compatible browser. PWAs (Progressive Web Apps) are web application that behave almost like native applications. You can now have a shortcut for Characters of the Mist on your computer, it can run in its own window, and... it can work offline!

### 🔧 Changes
Completely migrated Characters of the Mist to a new framework to facilitate offline capabilities. This means there could be a few issues I missed. Don't hesitate to report them on the discord!

### What's next ?
The migration was quite intense, but it was worth it. I took that opportunity to refactor quite a lot of things and make the code easier to maintain. Since Otherscape and City of Mist are integrated, Offline works, and some of the requested features have been implemented, I will now seriously look into mobile compatibility.
\nPlease keep in mind that I make no promises. I will seriously look into it, and how I can make it happen. But I greatly value user experience. If I can't find a user friendly way to do it, it'll have to wait.
\nAs usual, please ask for features you'd like to see in the app on the discord! I listen, even though I can be quiet at times.
`
   },
   {
      version: '1.1.0',
      content: `
### A Big One !
This is THE long awaited update.

### **⚠️ Important!**
* App's version of NextJS updated to get the latest security fixes which properly patches a serious security problem found in React Server Components.

### ✨ **The Long Awaited...**
* **City of Mist support !!!**: City of Mist support has been added to Characters of the Mist, along with all the themes available within the free demo!
* **Metro:Otherscape support !!!**: Metro:Otherscape support has been added to Characters of the Mist, along with all the themes available within the free demo!
* *Note for users of the legacy version*: The migration tool available in Settings can be used to migrate your legacy character sheets to the new app effortlessly.
* The app now features a **Main Menu**, which allows you to pick a game system to create a new character in. You can still drop character files from your file explorer or from the drawer to load them!

### 🐛 Bugfixes
* Fixed some stutterings and inconsistencies with card hitboxes.

### 🔧 Changes
* Characters now have persistence in the Drawer. There are now two buttons to save, "Save Character" and "Save Character As...". The "Save As" feature prompts you for a new file name within the drawer, while the "Save" overwrites the original drawer file.
* As requested, the Drawer now has a button in its header to close it.
* Adjusted Legend in the Mist Light mode color palette for a more "Wood and Stone" feel.

### So what's next ?
As always, please do not hesitate to send feature requests and bug reports on the Tools of the Mist server, even if I work slowly due to lack of time, I read them, and I try my best to implement them!
The next feature that will come to Characters of the Mist is offline app capabilities. You will be able to install Characters of the Mist as a PWA (Progressive Web App), which will act like a regular app and will keep working even if you're not online.
`
   },
   {
      version: '1.0.4',
      content: `
### I have been informed that there were new Demo themebooks!
So I made sure they were in the app.

### 🐛 Bugfixes
* Theme **type** translations wouldn't show up in card creation window and command palette.

### 🔧 Changes
* Default available themebooks have been changed to match the latest demo content.
`
   },
   {
      version: '1.0.3',
      content: `
### This one is a very small bugfix!
Small, but necessary.

### 🐛 Bugfixes
* Card creation window wouldn't always allow for a custom themebook.
`
   },
   {
      version: '1.0.2',
      content: `
### Small patch with a few features
This patch adds a couple of suggested features.

### **⚠️ Important!**
**This patch is the first that requires data harmonization**.

To make story themes possible, a slight modification to the data structure of characters was necessary. This is **a breaking change**, however, I set up a data harmonization system that will check if your data is in need of an update, and do it automatically.

This is the first opportunity I have to test this utility. If the app crashes for you, **DO NOT PANIC**, your data is safe as long as you don't clear your browser data or cache. Simply shoot me a message on Discord and we'll fix it together.

Everything should work fine, as far as I've tested before deploying this change. But since it's the first time this utility is used in the full, public app, unexpected things can happen.

### ✨ Features
* **Negative Story Tags**: You can now mark a story tag as *negative*, it will visually render like a weakness tag, serving as a visual indicator.
* **Story Themes**: You can now *evolve* a story tag into a story theme, and you can add any number of power or weakness tags to that story theme. You can, of course, *devolve* a story theme into a tag, as well.

### 🔧 Changes
* **Adjusted Themes**: There is now a very slight luminance difference on some of the background colors to add a bit more depth to the general UI. This change was brought to both the neutral and LitM palettes.
* **Updated Tutorial**: The tutorial now mentions Story Themes and how to create them.

`
   },
   {
      version: '1.0.1',
      content: `
### Nothing too exciting here
This is mainly a patch adding a small requested feature I found particularly interesting, and fixing a few UI bugs I dug up.

### ✨ Features
* **Card-specific view-mode**: You can now change a card's view mode from Side-by-Side, Flip, or having it follow your global preferences.
* **Theme Types now display as icons**: Because honestly, it's cute, and I think it looks nicer. They have a tooltip now so you know exactly what the icon means.
* **Localized themebook names**: Because our non-english peers deserve to know what those themebooks mean, too.
* **Trackers can now be locked in edit mode**: Following another request, you can now globally lock trackers in edit mode from your app settings. (This means the "Add" button for statuses and story tags will always be visible, they will always be deletable, and their name will always be editable.)

### 🐛 Bugfixes
* Command Palette's Create Card action did not properly assign chosen Main Tag name. Whoops.
* Incorrect colors on the tracking button for a card's main tag.
* The tracking button on tags was hard to notice when enabled, fixed with a new icon, and with tag underlining for good measure.
* Some texts weren't properly aligned in the French locale, because of erroneously set alignment properties.
`
   },
   {
      version: '1.0.0',
      content: `
### 🎉 Version 1.0.0 - The Proper Release!
This is the official launch of the new **Characters of the Mist** application! This version is a complete rewrite of the legacy alpha, built from the ground up with a modern, scalable, and privacy-first architecture. All your data is saved directly in your browser, ensuring complete privacy and offline capability.

### ✨ Key Features & Additions
* **The Drawer**: A complete file system for your characters and components. It features full CRUD functionality, nested folders, and robust drag-and-drop for organization.
* **Full Drag & Drop**: A highly requested feature is here! Reorder cards and trackers on your sheet, move items in the Drawer, or load a character by dragging their sheet from the Drawer onto the main play area.
* **Command Palette**: For the power users, press \`Ctrl+K\` to summon a powerful command palette that lets you do almost anything without touching your mouse.
* **Localization**: The application is now available in English and French from day one, with a system in place for community contributions. The entire tutorial is also fully localized.
* **Data Migration Tool**: A built-in tool helps you seamlessly migrate character sheets from the old alpha version of the app to the new format.
* **Interactive Guided Tutorial**: A new guided tour explains all the major features of the application to new users.

### 🔧 Architectural & Quality of Life Improvements
* **Modern Tech Stack**: The app is built with Next.js (App Router), TypeScript, Tailwind CSS, and Shadcn/UI for a fast, reliable, and maintainable codebase.
* **Robust State Management**: State is managed with Zustand, featuring automatic persistence to local storage and a powerful, context-aware Undo/Redo system (\`Ctrl+Z\`) for both the character sheet and the Drawer.
* **Polymorphic Card System**: The data structure is now more flexible, allowing for different types of cards (like Theme Cards and Character Cards) to coexist in a single, reorderable list.
* **Dynamic Layout**: The character sheet is no longer fixed. You can add as many cards and trackers as you need.
* **New UI & Theming**: The interface has been completely redesigned with multiple color themes and a light/dark mode toggle.
`
   }
];

/** The newest release with patch notes. The array is authored newest-first, but resolve by semver so order can't betray us. */
export const latestPatchNotesVersion: string = patchNotes.reduce(
   (newest, note) => (isVersionGreaterThan(note.version, newest) ? note.version : newest),
   patchNotes[0]?.version ?? '0.0.0',
);

/** Whether a genuinely newer release exists than the one the user last opened What's-new for (drives the New! dot). */
export function hasUnreadPatchNotes(lastReadVersion: string): boolean {
   return isVersionGreaterThan(latestPatchNotesVersion, lastReadVersion);
}
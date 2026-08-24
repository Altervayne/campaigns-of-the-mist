// -- Icon Imports --
import {
   Accessibility, Activity, AlarmClock, AlertCircle, AlertOctagon, AlertTriangle, Anchor, Apple, ArrowDown,
   ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Atom, Award, Axe, Baby, Backpack, Badge, Ban, Barcode,
   Battery, Beer, Bell, BellRing, Bike, Biohazard, Bird, Bluetooth, Bomb, Bone, Book, BookMarked, BookOpen,
   BookOpenText, Bookmark, Bot, Box, BoxSelect, Boxes, Brain, BrainCircuit, Briefcase, Brush, Bug, Building,
   Building2, Cake, Calendar, CalendarDays, Camera, Car, Carrot, Cast, Castle, Cat, Cctv, Check, CheckCircle,
   Cherry, ChevronRight, ChevronsRight, Church, Circle, CircleCheck, Clapperboard, Clipboard, ClipboardList,
   Clock, Cloud, CloudLightning, CloudRain, CloudSnow, Clover, Club, Coffee, Cog, Coins, Columns, Compass,
   Cone, Contact, Container, CornerUpRight, Cpu, Cross, Crosshair, Crown, CupSoda, Cylinder, Database,
   Diamond, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Dices, Disc, Dna, Dog, DoorClosed, DoorOpen, Download,
   Drama, Droplet, Droplets, Drum, Drumstick, Eclipse, Egg, ExternalLink, Eye, EyeOff, Factory, Feather,
   Fence, FileText, FileType, Files, Film, Fingerprint, Fish, Flag, FlagTriangleRight, Flame, FlameKindling,
   FlaskConical, Flower, Flower2, Folder, FolderHeart, FolderOpen, Footprints, Fuel, Gamepad, Gamepad2, Gem,
   Ghost, Gift, Globe, GraduationCap, Grid3x3, Group, Guitar, Ham, Hammer, Hand, HandCoins, Handshake,
   HardDrive, Headphones, Heart, HeartCrack, HeartPulse, HelpCircle, Hexagon, History, Home, Hotel, Hourglass,
   House, IdCard, Image, Images, Infinity as InfinityIcon, Info, Key, KeyRound, Keyboard, Landmark, Laptop, Layers,
   LayoutGrid, Leaf, Library, Lightbulb, Link, Link2, Locate, Lock, LockOpen, LogIn, LogOut, Magnet, Mail,
   Map, MapPin, MapPinned, Martini, Medal, MessageCircle, MessageSquare, Mic, Mic2, Microscope, Milestone,
   Monitor, Moon, MoonStar, Mountain, MountainSnow, Mouse, MousePointer, Move, Music, Music2, Navigation,
   Navigation2, NotebookPen, NotebookText, Octagon, Orbit, Package, PackageOpen, Paintbrush, Palette,
   Palmtree, PawPrint, PenTool, Pencil, PencilRuler, Pentagon, PersonStanding, Phone, Piano, PiggyBank, Pill,
   Pin, Pipette, Pizza, Plane, Plug, Power, Printer, Puzzle, Pyramid, QrCode, Quote, Rabbit, Radiation, Radio,
   Rainbow, Rat, RefreshCw, Ribbon, Rocket, RotateCcw, RotateCw, Route, Rows, Ruler, Sailboat, Scale, Scan,
   ScanEye, Scissors, Scroll, ScrollText, Search, Send, Server, Settings, Shapes, Share, Share2, Shell,
   Shield, ShieldAlert, ShieldCheck, ShieldHalf, ShieldX, Ship, ShoppingBag, ShoppingCart, Signpost,
   SignpostBig, Skull, Smartphone, Snail, Snowflake, Soup, Spade, Sparkle, Sparkles, Speaker, Sprout, Square,
   Squirrel, Stamp, Star, Stethoscope, StickyNote, Store, Sun, Sunrise, Sunset, Sword, Swords, Syringe,
   Tablet, Tag, Tags, Target, Telescope, Tent, TentTree, TestTube, Thermometer, Timer, Tornado, Train,
   TreeDeciduous, TreePine, Trees, Triangle, Trophy, Truck, Turtle, Umbrella, Unlock, Upload, User,
   UserCircle, UserRound, Users, Utensils, VenetianMask, Video, Volume2, Wand, Wand2, WandSparkles, Warehouse,
   Watch, Waves, Waypoints, Wheat, Wifi, Wind, Wine, Worm, Wrench, X, XCircle, Zap,
} from 'lucide-react';

// -- Type Imports --
import type { LucideIcon } from 'lucide-react';
import type { PortalTarget } from '@/lib/types/board';

/*
 * Portal iconography. A portal stores its chosen visual as a lucide icon NAME string (the curated-picker
 * value); this module resolves that name to a component and derives the two automatic glyphs a portal always
 * shows: the corner "opens X" destination glyph (by target kind) and the create-time smart default icon.
 * Curated + statically imported (tree-shaken into the board chunk), so the picker renders instantly and never
 * grows the precache manifest the way the full 3,800-icon lucide set would. An unknown name -> `Link2`.
 */

/**
 * The curated icon set, keyed by lucide's kebab NAME. This is the single source of truth for both the picker
 * grid (it maps over {@link PORTAL_ICON_NAMES}) and the resolver, so the two can never drift. It covers every
 * smart-default destination glyph plus a broad TTRPG + general-purpose signpost vocabulary.
 */
const PORTAL_ICONS: Record<string, LucideIcon> = {
   'link-2': Link2, link: Link, 'external-link': ExternalLink, globe: Globe, navigation: Navigation,
   'navigation-2': Navigation2, map: Map, 'map-pin': MapPin, 'map-pinned': MapPinned, compass: Compass,
   milestone: Milestone, signpost: Signpost, 'signpost-big': SignpostBig, route: Route, waypoints: Waypoints,
   locate: Locate, crosshair: Crosshair, target: Target, 'scan-eye': ScanEye, eye: Eye, 'eye-off': EyeOff,
   search: Search, flag: Flag, 'flag-triangle-right': FlagTriangleRight, bookmark: Bookmark, tag: Tag, tags: Tags,
   pin: Pin, 'layout-grid': LayoutGrid, 'notebook-pen': NotebookPen, 'notebook-text': NotebookText, book: Book,
   'book-open': BookOpen, 'book-open-text': BookOpenText, 'book-marked': BookMarked, library: Library,
   scroll: Scroll, 'scroll-text': ScrollText, 'file-text': FileText, 'file-type': FileType, files: Files, folder: Folder,
   'folder-open': FolderOpen, 'sticky-note': StickyNote, clipboard: Clipboard, 'clipboard-list': ClipboardList,
   pencil: Pencil, 'pen-tool': PenTool, feather: Feather, quote: Quote, 'message-square': MessageSquare,
   'message-circle': MessageCircle, mail: Mail, send: Send, sword: Sword, swords: Swords, shield: Shield,
   'shield-half': ShieldHalf, 'shield-alert': ShieldAlert, 'shield-check': ShieldCheck, axe: Axe, hammer: Hammer,
   wand: Wand, 'wand-2': Wand2, 'wand-sparkles': WandSparkles, bomb: Bomb, skull: Skull, ghost: Ghost, drama: Drama,
   biohazard: Biohazard, radiation: Radiation, flame: Flame, 'flame-kindling': FlameKindling, zap: Zap,
   crown: Crown, gem: Gem, diamond: Diamond, key: Key, 'key-round': KeyRound, lock: Lock, 'lock-open': LockOpen,
   unlock: Unlock, coins: Coins, 'hand-coins': HandCoins, 'piggy-bank': PiggyBank, scale: Scale, trophy: Trophy,
   award: Award, medal: Medal, ribbon: Ribbon, star: Star, sparkle: Sparkle, sparkles: Sparkles, castle: Castle,
   church: Church, landmark: Landmark, home: Home, house: House, tent: Tent, 'tent-tree': TentTree,
   warehouse: Warehouse, building: Building, 'building-2': Building2, hotel: Hotel, factory: Factory, store: Store,
   fence: Fence, 'door-open': DoorOpen, 'door-closed': DoorClosed, mountain: Mountain,
   'mountain-snow': MountainSnow, trees: Trees, 'tree-pine': TreePine, 'tree-deciduous': TreeDeciduous,
   palmtree: Palmtree, flower: Flower, 'flower-2': Flower2, leaf: Leaf, sprout: Sprout, clover: Clover,
   wheat: Wheat, cloud: Cloud, 'cloud-rain': CloudRain, 'cloud-lightning': CloudLightning, 'cloud-snow': CloudSnow,
   sun: Sun, moon: Moon, 'moon-star': MoonStar, sunrise: Sunrise, sunset: Sunset, wind: Wind, droplet: Droplet,
   droplets: Droplets, waves: Waves, anchor: Anchor, ship: Ship, sailboat: Sailboat, user: User, users: Users,
   'user-round': UserRound, 'user-circle': UserCircle, contact: Contact, 'venetian-mask': VenetianMask, baby: Baby,
   'person-standing': PersonStanding, footprints: Footprints, accessibility: Accessibility, heart: Heart,
   'heart-pulse': HeartPulse, 'heart-crack': HeartCrack, brain: Brain, activity: Activity, pill: Pill,
   syringe: Syringe, stethoscope: Stethoscope, cross: Cross, bone: Bone, dna: Dna, hand: Hand, handshake: Handshake,
   'dice-1': Dice1, 'dice-2': Dice2, 'dice-3': Dice3, 'dice-4': Dice4, 'dice-5': Dice5, 'dice-6': Dice6,
   dices: Dices, hexagon: Hexagon, pentagon: Pentagon, triangle: Triangle, square: Square, circle: Circle,
   spade: Spade, club: Club, gamepad: Gamepad, 'gamepad-2': Gamepad2, puzzle: Puzzle, clock: Clock, timer: Timer,
   hourglass: Hourglass, calendar: Calendar, 'calendar-days': CalendarDays, 'alarm-clock': AlarmClock, watch: Watch,
   history: History, 'rotate-cw': RotateCw, 'rotate-ccw': RotateCcw, infinity: InfinityIcon, lightbulb: Lightbulb,
   'brain-circuit': BrainCircuit, cpu: Cpu, bot: Bot, cog: Cog, settings: Settings, wrench: Wrench,
   'flask-conical': FlaskConical, 'test-tube': TestTube, atom: Atom, orbit: Orbit, telescope: Telescope,
   microscope: Microscope, magnet: Magnet, battery: Battery, plug: Plug, power: Power, music: Music,
   'music-2': Music2, mic: Mic, 'mic-2': Mic2, headphones: Headphones, speaker: Speaker, 'volume-2': Volume2,
   bell: Bell, 'bell-ring': BellRing, radio: Radio, disc: Disc, guitar: Guitar, drum: Drum, piano: Piano,
   camera: Camera, image: Image, images: Images, film: Film, clapperboard: Clapperboard, video: Video,
   palette: Palette, paintbrush: Paintbrush, brush: Brush, 'pencil-ruler': PencilRuler, ruler: Ruler,
   pipette: Pipette, scissors: Scissors, stamp: Stamp, shapes: Shapes, 'shopping-bag': ShoppingBag,
   'shopping-cart': ShoppingCart, package: Package, 'package-open': PackageOpen, gift: Gift, box: Box, boxes: Boxes,
   container: Container, truck: Truck, plane: Plane, rocket: Rocket, car: Car, bike: Bike, train: Train, fuel: Fuel,
   utensils: Utensils, coffee: Coffee, beer: Beer, wine: Wine, martini: Martini, 'cup-soda': CupSoda, pizza: Pizza,
   apple: Apple, cherry: Cherry, carrot: Carrot, cake: Cake, soup: Soup, drumstick: Drumstick, ham: Ham, egg: Egg,
   fish: Fish, phone: Phone, smartphone: Smartphone, laptop: Laptop, monitor: Monitor, tablet: Tablet,
   keyboard: Keyboard, mouse: Mouse, printer: Printer, 'hard-drive': HardDrive, database: Database, server: Server,
   wifi: Wifi, bluetooth: Bluetooth, cast: Cast, cctv: Cctv, snowflake: Snowflake, thermometer: Thermometer,
   umbrella: Umbrella, rainbow: Rainbow, tornado: Tornado, eclipse: Eclipse, 'alert-triangle': AlertTriangle,
   'alert-circle': AlertCircle, 'alert-octagon': AlertOctagon, info: Info, 'help-circle': HelpCircle, check: Check,
   'check-circle': CheckCircle, 'circle-check': CircleCheck, x: X, 'x-circle': XCircle, ban: Ban,
   'shield-x': ShieldX, 'arrow-up': ArrowUp, 'arrow-down': ArrowDown, 'arrow-left': ArrowLeft,
   'arrow-right': ArrowRight, 'arrow-up-right': ArrowUpRight, 'corner-up-right': CornerUpRight, move: Move,
   'chevron-right': ChevronRight, 'chevrons-right': ChevronsRight, 'refresh-cw': RefreshCw, share: Share,
   'share-2': Share2, upload: Upload, download: Download, 'log-in': LogIn, 'log-out': LogOut, bird: Bird, cat: Cat,
   dog: Dog, rabbit: Rabbit, rat: Rat, squirrel: Squirrel, turtle: Turtle, snail: Snail, bug: Bug, worm: Worm,
   shell: Shell, 'paw-print': PawPrint, 'mouse-pointer': MousePointer, 'graduation-cap': GraduationCap,
   backpack: Backpack, briefcase: Briefcase, 'folder-heart': FolderHeart, 'id-card': IdCard, badge: Badge,
   fingerprint: Fingerprint, 'qr-code': QrCode, scan: Scan, barcode: Barcode, octagon: Octagon, cylinder: Cylinder,
   cone: Cone, pyramid: Pyramid, 'box-select': BoxSelect, group: Group, layers: Layers, 'grid-3x3': Grid3x3,
   columns: Columns, rows: Rows,
};

/** The curated icon NAMES in catalog order (the picker grid iterates these). */
export const PORTAL_ICON_NAMES: readonly string[] = [
   'link-2', 'link', 'external-link', 'globe', 'navigation', 'navigation-2', 'map', 'map-pin', 'map-pinned',
   'compass', 'milestone', 'signpost', 'signpost-big', 'route', 'waypoints', 'locate', 'crosshair', 'target',
   'scan-eye', 'eye', 'eye-off', 'search', 'flag', 'flag-triangle-right', 'bookmark', 'tag', 'tags', 'pin',
   'layout-grid', 'notebook-pen', 'notebook-text', 'book', 'book-open', 'book-open-text', 'book-marked', 'library',
   'scroll', 'scroll-text', 'file-text', 'file-type', 'files', 'folder', 'folder-open', 'sticky-note', 'clipboard',
   'clipboard-list', 'pencil', 'pen-tool', 'feather', 'quote', 'message-square', 'message-circle', 'mail', 'send',
   'sword', 'swords', 'shield', 'shield-half', 'shield-alert', 'shield-check', 'axe', 'hammer', 'wand', 'wand-2',
   'wand-sparkles', 'bomb', 'skull', 'ghost', 'drama', 'biohazard', 'radiation', 'flame', 'flame-kindling', 'zap',
   'crown', 'gem', 'diamond', 'key', 'key-round', 'lock', 'lock-open', 'unlock', 'coins', 'hand-coins',
   'piggy-bank', 'scale', 'trophy', 'award', 'medal', 'ribbon', 'star', 'sparkle', 'sparkles', 'castle', 'church',
   'landmark', 'home', 'house', 'tent', 'tent-tree', 'warehouse', 'building', 'building-2', 'hotel', 'factory',
   'store', 'fence', 'door-open', 'door-closed', 'mountain', 'mountain-snow', 'trees', 'tree-pine',
   'tree-deciduous', 'palmtree', 'flower', 'flower-2', 'leaf', 'sprout', 'clover', 'wheat', 'cloud', 'cloud-rain',
   'cloud-lightning', 'cloud-snow', 'sun', 'moon', 'moon-star', 'sunrise', 'sunset', 'wind', 'droplet', 'droplets',
   'waves', 'anchor', 'ship', 'sailboat', 'user', 'users', 'user-round', 'user-circle', 'contact', 'venetian-mask',
   'baby', 'person-standing', 'footprints', 'accessibility', 'heart', 'heart-pulse', 'heart-crack', 'brain',
   'activity', 'pill', 'syringe', 'stethoscope', 'cross', 'bone', 'dna', 'hand', 'handshake', 'dice-1', 'dice-2',
   'dice-3', 'dice-4', 'dice-5', 'dice-6', 'dices', 'hexagon', 'pentagon', 'triangle', 'square', 'circle', 'spade',
   'club', 'gamepad', 'gamepad-2', 'puzzle', 'clock', 'timer', 'hourglass', 'calendar', 'calendar-days',
   'alarm-clock', 'watch', 'history', 'rotate-cw', 'rotate-ccw', 'infinity', 'lightbulb', 'brain-circuit', 'cpu',
   'bot', 'cog', 'settings', 'wrench', 'flask-conical', 'test-tube', 'atom', 'orbit', 'telescope', 'microscope',
   'magnet', 'battery', 'plug', 'power', 'music', 'music-2', 'mic', 'mic-2', 'headphones', 'speaker', 'volume-2',
   'bell', 'bell-ring', 'radio', 'disc', 'guitar', 'drum', 'piano', 'camera', 'image', 'images', 'film',
   'clapperboard', 'video', 'palette', 'paintbrush', 'brush', 'pencil-ruler', 'ruler', 'pipette', 'scissors',
   'stamp', 'shapes', 'shopping-bag', 'shopping-cart', 'package', 'package-open', 'gift', 'box', 'boxes',
   'container', 'truck', 'plane', 'rocket', 'car', 'bike', 'train', 'fuel', 'utensils', 'coffee', 'beer', 'wine',
   'martini', 'cup-soda', 'pizza', 'apple', 'cherry', 'carrot', 'cake', 'soup', 'drumstick', 'ham', 'egg', 'fish',
   'phone', 'smartphone', 'laptop', 'monitor', 'tablet', 'keyboard', 'mouse', 'printer', 'hard-drive', 'database',
   'server', 'wifi', 'bluetooth', 'cast', 'cctv', 'snowflake', 'thermometer', 'umbrella', 'rainbow', 'tornado',
   'eclipse', 'alert-triangle', 'alert-circle', 'alert-octagon', 'info', 'help-circle', 'check', 'check-circle',
   'circle-check', 'x', 'x-circle', 'ban', 'shield-x', 'arrow-up', 'arrow-down', 'arrow-left', 'arrow-right',
   'arrow-up-right', 'corner-up-right', 'move', 'chevron-right', 'chevrons-right', 'refresh-cw', 'share', 'share-2',
   'upload', 'download', 'log-in', 'log-out', 'bird', 'cat', 'dog', 'rabbit', 'rat', 'squirrel', 'turtle', 'snail',
   'bug', 'worm', 'shell', 'paw-print', 'mouse-pointer', 'graduation-cap', 'backpack', 'briefcase', 'folder-heart',
   'id-card', 'badge', 'fingerprint', 'qr-code', 'scan', 'barcode', 'octagon', 'cylinder', 'cone', 'pyramid',
   'box-select', 'group', 'layers', 'grid-3x3', 'columns', 'rows',
];

/** Resolves a stored icon name to its lucide component, falling back to `Link2` for an unknown name. */
export function resolvePortalIcon(name: string): LucideIcon {
   return PORTAL_ICONS[name] ?? Link2;
}

/** The corner "opens X" destination glyph for a portal's target kind (the drawer/link-chip glyph vocabulary). */
export function portalDestinationIcon(target: PortalTarget): LucideIcon {
   switch (target.kind) {
      case 'entity':
         return target.entity === 'note'
            ? NotebookPen
            : target.entity === 'board'
               ? LayoutGrid
               : target.entity === 'character'
                  ? IdCard
                  : FileType;
      case 'element':
         return Shapes;
      case 'board-element':
         return Crosshair;
      case 'external':
         return Globe;
   }
}

/** The smart-default icon NAME for a freshly-created portal (matches the destination glyph). */
export function smartPortalIconName(target: PortalTarget): string {
   switch (target.kind) {
      case 'entity':
         return target.entity === 'note'
            ? 'notebook-pen'
            : target.entity === 'board'
               ? 'layout-grid'
               : target.entity === 'character'
                  ? 'id-card'
                  : 'file-type';
      case 'element':
         return 'shapes';
      case 'board-element':
         return 'crosshair';
      case 'external':
         return 'globe';
   }
}

/** The i18n key naming a portal's activation OUTCOME (for the tooltip): "Open board", "Show on this board", ... */
export function portalOutcomeKey(target: PortalTarget): string {
   switch (target.kind) {
      case 'entity':
         return target.entity === 'note'
            ? 'BoardView.portalOpenNote'
            : target.entity === 'board'
               ? 'BoardView.portalOpenBoard'
               : target.entity === 'character'
                  ? 'BoardView.portalOpenCharacter'
                  : 'BoardView.portalOpenPdf';
      case 'element':
         return 'BoardView.portalShowOnBoard';
      case 'board-element':
         return 'BoardView.portalShowOnBoard';
      case 'external':
         return 'BoardView.portalOpenExternal';
   }
}

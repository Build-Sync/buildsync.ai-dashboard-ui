/**
 * components/icons.tsx
 *
 * WHAT   The icon registry. Maps short string keys ("wall", "stress", "undo"…) to icon components: lucide-react
 *        glyphs plus a handful of hand-drawn CAD glyphs (line, polyline, rectangle, circle, arc, spline, hatch,
 *        column, beam, slab, stress, shed, septic tank) and the three eyes of the window-size button (wide open,
 *        half closed, closed) drawn on the same 24x24 grid and stroke weight. <Icon name="…"/> renders one.
 * FOR    The ribbon configuration, menus and palettes refer to icons by key only, so the icon set can change in
 *        this one file. IconKey is the union of all keys, so a misspelt key is a compile error.
 * DEBUG  - Missing or wrong icon: look the key up in the ICONS table; TypeScript rejects keys that are not in
 *          it.
 *        - Icon looks too thin or heavy: strokeWidth defaults to 1.7 in <Icon/>; the ribbon passes 1.5 for
 *          large buttons.
 *        - A CAD glyph looks off: they are inline SVG paths in the cad(...) calls near the top.
 *
 * Author: Giordano Bertin-Maurice
 * Copyright (c) 2026 Giordano Bertin-Maurice. All rights reserved.
 */
import type { ComponentType, SVGProps } from "react";
import {
  Accessibility, Activity, AirVent, AlignStartVertical, AppWindow, Archive, ArrowDownToLine, ArrowUpRight, ArrowUpToLine, Armchair,
  Axis3d, BadgeCheck, Bath, Battery, BatteryCharging, Bell, BookOpenCheck, Bot, Box, BoxSelect, BrickWall, Bug, Building2, Calculator,
  CalendarRange, Car, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, CircleCheck, CircleX, Clock, Cloud, CloudLightning,
  Cog, Combine, Component, Construction, Contrast, Copy, CopyPlus, CornerDownRight, CreditCard, Crosshair, Cuboid, DollarSign,
  DoorOpen, Download, Drone, Droplets, Ellipsis, Eye, EyeOff, Fan, FileImage, FilePlus, FileSignature, FileText, FileUp, Filter,
  Flame, FlaskConical, FlipHorizontal2, Focus, FolderOpen, Footprints, GitBranch, GitCompare, Globe, Grid3x3, Grip, Group,
  Hand, Highlighter, History, House, Image as ImageIcon, Info, KeyRound, Keyboard, Landmark, Languages, Layers, LayoutGrid,
  LayoutPanelTop, LayoutTemplate, Lightbulb, Link, Link2, ListTodo, Lock, LockOpen, LogOut, Magnet, Mail, Map as MapIcon, MapPin,
  Maximize, Maximize2, Merge, MessageSquare, Mic, Monitor, Moon, Mountain, MountainSnow, Move, MoveDiagonal, MoveHorizontal,
  MousePointer2, Orbit, Palette, PanelBottom, PanelLeft, PanelRight, PanelTop, Paperclip, Pause, Pencil, PencilRuler, Pin, Play,
  Plug, Plus, Printer, RefreshCw, Repeat, Replace, Rotate3d, RotateCcw, RotateCw, Route, Ruler, RulerDimensionLine, Save, Scale, Scaling,
  Scan, ScanLine, ScanSearch, Scissors, ScissorsLineDashed, Search, Send, Settings, Share2, ShieldAlert, ShieldCheck, Shovel,
  SlidersHorizontal, Slice, Slash, Smartphone, Sparkles, Split, Square, StickyNote, Sun, Table2, Tag, Terminal, Thermometer,
  Trash2, TrendingDown, Triangle, TriangleAlert, Type, Undo2, Redo2, Unlink, Ungroup, Upload, UserPlus, UserRound, Users,
  Vibrate, WandSparkles, Waypoints, Weight, Wind, X, Zap, ZoomIn, ZoomOut, Wand2, Fingerprint, Receipt, Briefcase, GraduationCap,
  Rocket, ExternalLink, Loader, Dot, CircleDot, Trees, Compass, Target, Wrench, Hammer, HardHat, ListFilter, ArrowRight, ArrowUp,
  ArrowDown, Webhook, Server, Database, Hospital, Building, Package, Boxes, Table, ClipboardList, Heater, Snowflake,
  BookOpen, CircleHelp, LifeBuoy, LayoutDashboard, GripVertical, TreeDeciduous, TreePine, Shrub, Flower2, HousePlus, Fence,
  Sofa, BedDouble, Refrigerator, WashingMachine, Tv, LampDesk, CookingPot, Utensils, Library, LandPlot, LetterText, Command,
  Waves, Gem, Milestone, Signpost, TrafficCone, Octagon, CloudRain, SunMedium, Cable, PlugZap, LampCeiling, ToggleRight, Fan as FanIcon,
  AlarmSmoke, Toilet, ShowerHead, Snowflake as AcIcon, Workflow, Pipette,
} from "lucide-react";

/** Props every icon component accepts: size and strokeWidth plus any SVG attribute. */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number | string;
  strokeWidth?: number | string;
}
type IconC = ComponentType<IconProps>;

/** CAD glyphs drawn on a 24×24 grid with the same stroke weight as lucide. */
function cad(children: React.ReactNode): IconC {
  const Icon = ({ size = 24, strokeWidth = 1.7, ...rest }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
  return Icon;
}

const CadLine = cad(<><path d="M4.5 19.5 19.5 4.5" /><circle cx="4.5" cy="19.5" r="1.6" fill="currentColor" /><circle cx="19.5" cy="4.5" r="1.6" fill="currentColor" /></>);
const CadPolyline = cad(<><path d="M3.5 18 9 7.5l5.5 8L20.5 5" /><circle cx="3.5" cy="18" r="1.4" fill="currentColor" /><circle cx="20.5" cy="5" r="1.4" fill="currentColor" /></>);
const CadRect = cad(<rect x="4" y="6.5" width="16" height="11" rx="0.5" />);
const CadCircle = cad(<><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>);
const CadArc = cad(<><path d="M4.5 18a9.5 9.5 0 0 1 15 0" /><circle cx="4.5" cy="18" r="1.4" fill="currentColor" /><circle cx="19.5" cy="18" r="1.4" fill="currentColor" /></>);
const CadSpline = cad(<><path d="M3.5 16c3.5-11 6.5 5 9-3.2s5.5-7 8-5.3" /><circle cx="3.5" cy="16" r="1.3" fill="currentColor" /><circle cx="20.5" cy="7.5" r="1.3" fill="currentColor" /></>);
const CadHatch = cad(<><rect x="4" y="5" width="16" height="14" rx="0.5" /><path d="m4 15 7-10M4 19 15 5M9 19 20 5M14 19l6-8" /></>);
const CadColumn = cad(<><path d="M7.5 4.5h9M7.5 19.5h9M12 4.5v15" /><rect x="8.5" y="9" width="7" height="6" rx="0.4" /></>);
const CadBeam = cad(<><path d="M3.5 7h17M3.5 17h17M12 7v10" /></>);
const CadLayersPair = cad(<><path d="m12 4 8.5 4.5L12 13 3.5 8.5z" /><path d="m3.5 12.5 8.5 4.5 8.5-4.5" /><path d="m3.5 16 8.5 4.5L20.5 16" /></>);
const CadStress = cad(<><path d="M3 18h18" /><path d="M5 18c2.5-10 4.5-10 7-10s4.5 0 7 10" /><circle cx="12" cy="8" r="1.4" fill="currentColor" /></>);
/* the three window sizes: eye wide open (fully open), half closed (normal), closed (header only) */
const EyeWide = cad(<><path d="M2.5 12s3.6-6.8 9.5-6.8 9.5 6.8 9.5 6.8-3.6 6.8-9.5 6.8S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>);
const EyeHalf = cad(<><path d="M2.5 12.5Q12 8.2 21.5 12.5" strokeWidth={2.4} /><path d="M2.5 12.5s3.6 6 9.5 6 9.5-6 9.5-6" /><path d="M8.9 11.1a3.2 3.2 0 1 0 6.2 0" /><circle cx="12" cy="13.6" r="1.1" fill="currentColor" /></>);
const EyeShut = cad(<><path d="M2.5 10.5Q12 17.5 21.5 10.5" /><path d="m6.6 14.4-1.4 2.3M12 16.2v2.6m5.4-4.4 1.4 2.3" /></>);
const CadSeptic = cad(<><rect x="3.5" y="9" width="11" height="8" rx="2" /><path d="M7 9V7h4v2M14.5 13H21M17 11v4M20 11v4" /></>);
const CadShed = cad(<><path d="M3.5 11 12 5l8.5 6" /><path d="M5.5 10v9.5h13V10" /><path d="M10 19.5V14h4v5.5" /></>);

/** Key → component. Ribbon config, menus and palettes reference icons by key only. */
export const ICONS = {
  /* custom CAD */
  line: CadLine, polyline: CadPolyline, rectangle: CadRect, circle: CadCircle, arc: CadArc, spline: CadSpline, hatch: CadHatch,
  column: CadColumn, beam: CadBeam, slab: CadLayersPair, stress: CadStress,
  /* building / structure */
  wall: BrickWall, door: DoorOpen, window: AppWindow, roof: House, stair: Footprints, ramp: Accessibility, room: LayoutGrid,
  foundation: ArrowDownToLine, framing: Grid3x3, truss: Triangle, brace: X, connect: Link,
  /* mep */
  hvac: Fan, electrical: Zap, plumbing: Droplets, duct: Wind, pipe: Waypoints, tray: Cog, fire: Flame, fixture: Bath, equipment: Cog,
  /* modify */
  move: Move, rotate: RotateCw, rotateLeft: RotateCcw, scale: Scaling, mirror: FlipHorizontal2, offset: Copy, trim: Scissors, extend: MoveHorizontal,
  fillet: CornerDownRight, chamfer: Slice, array: Grip, split: Split, join: Merge, align: AlignStartVertical, copy: CopyPlus,
  chtype: Replace, material: Palette, dimensions: Ruler, attach: Link2, detach: Unlink,
  layers: Layers, isolate: Focus, lock: Lock, unlock: LockOpen, group: Group, ungroup: Ungroup,
  distance: Ruler, area: Scan, volume: Box, angle: Triangle, elevation: Mountain, coordinate: Crosshair, clearance: MoveDiagonal,
  /* insert */
  dwg: FileUp, survey: Route, drone: Drone, pdf: FileImage, map: MapPin, terrain: MountainSnow, soil: Shovel, xref: Link,
  furniture: Armchair, mepparts: Cog, strparts: Component, image: ImageIcon, text: Type, note: StickyNote,
  /* annotate */
  dim: RulerDimensionLine, leader: ArrowUpRight, tag: Tag, section: ScissorsLineDashed, detail: ZoomIn, gridline: Grid3x3,
  schedule: Table2, qto: Calculator,
  /* analyze */
  struct: Building2, activity: Activity, load: Weight, deflect: TrendingDown, wind: Wind, seismic: Vibrate, thermal: Thermometer,
  energy: BatteryCharging, solar: Sun, grading: Mountain, traffic: Car, clash: Combine, codecheck: ShieldCheck, matcheck: FlaskConical,
  construct: Construction, cost: DollarSign, schedq: CalendarRange, workforce: Users, simulate: CloudLightning,
  /* collaborate */
  comment: MessageSquare, markup: Highlighter, issue: CircleAlert, task: ListTodo, pin: Pin, pesign: FileSignature, approvals: BadgeCheck,
  review: Eye, share: Share2, perms: KeyRound, history: History, versions: GitBranch,
  /* ai */
  ask: Sparkles, p2p: WandSparkles, explain: Lightbulb, generate: Wand2, automate: Repeat, aireview: ScanSearch, aicode: ShieldCheck,
  aierr: Bug, aicost: Calculator, aimat: Layers, aiopt: Activity, aicompare: GitCompare, aiedit: PencilRuler, council: Scale,
  connectors: Plug, agent: Bot,
  /* view */
  plan: LayoutPanelTop, view3d: Box, orbit: Orbit, walk: Footprints, zoomext: Maximize2, vtop: ArrowUpToLine, vfront: Square, vback: Square,
  vleft: PanelLeft, vright: PanelRight, vbottom: ArrowDownToLine, vplan: LayoutPanelTop, velev: PanelTop, persp: Rotate3d, ortho3d: Axis3d,
  wire: Cuboid, shaded: Contrast, realistic: Sun, xray: ScanLine, sectionbox: BoxSelect, grid: Grid3x3, rulers: Ruler, guides: Slash,
  snap: Magnet, ortho: Crosshair, full: Maximize, hide: EyeOff, showall: Eye, explorer: PanelLeft, palettes: PanelRight,
  timeline: PanelBottom, cmdline: Terminal,
  /* manage / system */
  settings: Settings, aisettings: SlidersHorizontal, units: Ruler, gridsnap: Magnet, templates: LayoutTemplate, standards: BookOpenCheck,
  account: UserRound,
  /* ui */
  save: Save, undo: Undo2, redo: Redo2, newfile: FilePlus, open: FolderOpen, search: Search, download: Download, upload: Upload, printer: Printer,
  archive: Archive, close: X, plus: Plus, check: Check, chevDown: ChevronDown, chevLeft: ChevronLeft, chevRight: ChevronRight, chevUp: ChevronUp, mic: Mic,
  paperclip: Paperclip, trash: Trash2, pointer: MousePointer2, hand: Hand, zoomIn: ZoomIn, zoomOut: ZoomOut, refresh: RefreshCw,
  play: Play, pause: Pause, info: Info, warn: TriangleAlert, globe: Globe, languages: Languages, monitor: Monitor, moon: Moon,
  keyboard: Keyboard, bell: Bell, mail: Mail, shieldAlert: ShieldAlert, card: CreditCard, fingerprint: Fingerprint, logout: LogOut,
  phone: Smartphone, userPlus: UserPlus, send: Send, more: Ellipsis, filter: Filter, pencil: Pencil, file: FileText, receipt: Receipt,
  briefcase: Briefcase, grad: GraduationCap, rocket: Rocket, external: ExternalLink, loader: Loader, dot: Dot, circleDot: CircleDot,
  trees: Trees, compass: Compass, target: Target, wrench: Wrench, hammer: Hammer, hardhat: HardHat, listFilter: ListFilter,
  arrowRight: ArrowRight, arrowUp: ArrowUp, arrowDown: ArrowDown, webhook: Webhook, server: Server, database: Database,
  hospital: Hospital, building: Building, package: Package, boxes: Boxes, tableIcon: Table, clipboard: ClipboardList, heater: Heater,
  snow: Snowflake, cloud: Cloud, ok: CircleCheck, fail: CircleX, clock: Clock, landmark: Landmark, airvent: AirVent, battery: Battery,
  shieldCheck: ShieldCheck, mapIcon: MapIcon, scan: ScanSearch, ruler: Ruler,
  /* window sizes, help, interfaces */
  eyeWide: EyeWide, eyeHalf: EyeHalf, eyeShut: EyeShut, help: CircleHelp, tutorial: LifeBuoy, guide: BookOpen, interfaces: LayoutDashboard,
  grip: GripVertical,
  /* site objects and linked projects */
  tree: TreeDeciduous, pine: TreePine, shrub: Shrub, flower: Flower2, shed: CadShed, septic: CadSeptic, fence: Fence, community: HousePlus,
  /* room names, ground type, shortcuts */
  roomName: LetterText, ground: LandPlot, shortcut: Command,
  /* furniture groups */
  sofa: Sofa, bed: BedDouble, dining: Utensils, kitchen: CookingPot, office: LampDesk, storage: Library, appliance: Refrigerator,
  laundry: WashingMachine, media: Tv,
  /* site: pool, rocks, roads and drainage */
  pool: Waves, rock: Gem, gravel: Grip, road: Milestone, sidewalk: Footprints, sign: Octagon, signal: TrafficCone, drain: CloudRain,
  gutter: Droplets, solarpanel: SunMedium,
  /* MEP fixtures and connections */
  light: LampCeiling, switch: ToggleRight, outlet: Plug, fan: FanIcon, smoke: AlarmSmoke, thermostat: Thermometer, inverter: PlugZap,
  sink: Droplets, faucet: Pipette, toilet: Toilet, tub: Bath, shower: ShowerHead, waterheater: Flame, ac: AcIcon, wiring: Cable,
  pipeconnect: Workflow, pipes: Waypoints, wires: Cable, signpost: Signpost,
} satisfies Record<string, IconC>;

/** Union of all valid icon keys (the keys of ICONS). */
export type IconKey = keyof typeof ICONS;

/** Renders the icon registered under `name` at the given size and stroke weight. */
export function Icon({ name, size = 16, strokeWidth = 1.7, className }: { name: IconKey; size?: number; strokeWidth?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={strokeWidth} className={className} />;
}

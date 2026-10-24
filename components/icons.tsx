import type { ComponentType, SVGProps } from "react";
import {
  Accessibility, Activity, AirVent, AlignStartVertical, AppWindow, Archive, ArrowDownToLine, ArrowUpRight, ArrowUpToLine, Armchair,
  Axis3d, BadgeCheck, Bath, Battery, BatteryCharging, Bell, BookOpenCheck, Bot, Box, BoxSelect, BrickWall, Bug, Building2, Calculator,
  CalendarRange, Car, Check, ChevronDown, ChevronRight, ChevronUp, CircleAlert, CircleCheck, CircleX, Clock, Cloud, CloudLightning,
  Cog, Combine, Component, Construction, Contrast, Copy, CopyPlus, CornerDownRight, CreditCard, Crosshair, Cuboid, DollarSign,
  DoorOpen, Download, Drone, Droplets, Ellipsis, Eye, EyeOff, Fan, FileImage, FilePlus, FileSignature, FileText, FileUp, Filter,
  Flame, FlaskConical, FlipHorizontal2, Focus, FolderOpen, Footprints, GitBranch, GitCompare, Globe, Grid3x3, Grip, Group,
  Hand, Highlighter, History, House, Image as ImageIcon, Info, KeyRound, Keyboard, Landmark, Languages, Layers, LayoutGrid,
  LayoutPanelTop, LayoutTemplate, Lightbulb, Link, Link2, ListTodo, Lock, LockOpen, LogOut, Magnet, Mail, Map as MapIcon, MapPin,
  Maximize, Maximize2, Merge, MessageSquare, Mic, Monitor, Moon, Mountain, MountainSnow, Move, MoveDiagonal, MoveHorizontal,
  MousePointer2, Orbit, Palette, PanelBottom, PanelLeft, PanelRight, PanelTop, Paperclip, Pause, Pencil, PencilRuler, Pin, Play,
  Plug, Plus, Printer, RefreshCw, Repeat, Replace, Rotate3d, RotateCw, Route, Ruler, RulerDimensionLine, Save, Scale, Scaling,
  Scan, ScanLine, ScanSearch, Scissors, ScissorsLineDashed, Search, Send, Settings, Share2, ShieldAlert, ShieldCheck, Shovel,
  SlidersHorizontal, Slice, Slash, Smartphone, Sparkles, Split, Square, StickyNote, Sun, Table2, Tag, Terminal, Thermometer,
  Trash2, TrendingDown, Triangle, TriangleAlert, Type, Undo2, Redo2, Unlink, Ungroup, Upload, UserPlus, UserRound, Users,
  Vibrate, WandSparkles, Waypoints, Weight, Wind, X, Zap, ZoomIn, ZoomOut, Wand2, Fingerprint, Receipt, Briefcase, GraduationCap,
  Rocket, ExternalLink, Loader, Dot, CircleDot, Trees, Compass, Target, Wrench, Hammer, HardHat, ListFilter, ArrowRight, ArrowUp,
  ArrowDown, Webhook, Server, Database, Hospital, Building, Package, Boxes, Table, ClipboardList, Heater, Snowflake,
} from "lucide-react";

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
  move: Move, rotate: RotateCw, scale: Scaling, mirror: FlipHorizontal2, offset: Copy, trim: Scissors, extend: MoveHorizontal,
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
  archive: Archive, close: X, plus: Plus, check: Check, chevDown: ChevronDown, chevRight: ChevronRight, chevUp: ChevronUp, mic: Mic,
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
} satisfies Record<string, IconC>;

export type IconKey = keyof typeof ICONS;

export function Icon({ name, size = 16, strokeWidth = 1.7, className }: { name: IconKey; size?: number; strokeWidth?: number; className?: string }) {
  const C = ICONS[name];
  return <C size={size} strokeWidth={strokeWidth} className={className} />;
}

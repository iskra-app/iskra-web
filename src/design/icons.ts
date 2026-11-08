/**
 * Иконки — Lucide (ISC): контур 24 × 24, обводка `currentColor`, иконка берёт цвет кнопки.
 * Подключаются по одной, `@lucide/svelte/icons/<имя>`: в сборку попадают только они, никаких
 * шрифтов иконок и CDN. Толщина линии — `--icon-stroke` (`base.css`). Имена ключей — наши, по
 * смыслу места, а не по картинке: одну и ту же картинку могут звать по-разному.
 */
import type { Component } from 'svelte';
import Archive from '@lucide/svelte/icons/archive';
import ArrowLeft from '@lucide/svelte/icons/arrow-left';
import ArrowUp from '@lucide/svelte/icons/arrow-up';
import Ban from '@lucide/svelte/icons/ban';
import Bell from '@lucide/svelte/icons/bell';
import BellOff from '@lucide/svelte/icons/bell-off';
import Car from '@lucide/svelte/icons/car';
import Check from '@lucide/svelte/icons/check';
import ChevronDown from '@lucide/svelte/icons/chevron-down';
import ChevronLeft from '@lucide/svelte/icons/chevron-left';
import ChevronRight from '@lucide/svelte/icons/chevron-right';
import ChevronUp from '@lucide/svelte/icons/chevron-up';
import CircleAlert from '@lucide/svelte/icons/circle-alert';
import CircleMinus from '@lucide/svelte/icons/circle-minus';
import Clock from '@lucide/svelte/icons/clock';
import Copy from '@lucide/svelte/icons/copy';
import Download from '@lucide/svelte/icons/download';
import Ellipsis from '@lucide/svelte/icons/ellipsis';
import Eye from '@lucide/svelte/icons/eye';
import ExternalLink from '@lucide/svelte/icons/external-link';
import File from '@lucide/svelte/icons/file';
import FileAudio from '@lucide/svelte/icons/file-audio';
import Flag from '@lucide/svelte/icons/flag';
import Folder from '@lucide/svelte/icons/folder';
import Forward from '@lucide/svelte/icons/forward';
import Globe from '@lucide/svelte/icons/globe';
import HardDrive from '@lucide/svelte/icons/hard-drive';
import Heart from '@lucide/svelte/icons/heart';
import Image from '@lucide/svelte/icons/image';
import Info from '@lucide/svelte/icons/info';
import Languages from '@lucide/svelte/icons/languages';
import Leaf from '@lucide/svelte/icons/leaf';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Link from '@lucide/svelte/icons/link';
import Lock from '@lucide/svelte/icons/lock';
import LockOpen from '@lucide/svelte/icons/lock-open';
import LogOut from '@lucide/svelte/icons/log-out';
import MapPin from '@lucide/svelte/icons/map-pin';
import MessageCircle from '@lucide/svelte/icons/message-circle';
import MessagesSquare from '@lucide/svelte/icons/messages-square';
import Mic from '@lucide/svelte/icons/mic';
import Minus from '@lucide/svelte/icons/minus';
import MonitorSmartphone from '@lucide/svelte/icons/monitor-smartphone';
import Palette from '@lucide/svelte/icons/palette';
import Paperclip from '@lucide/svelte/icons/paperclip';
import Pause from '@lucide/svelte/icons/pause';
import Pencil from '@lucide/svelte/icons/pencil';
import Pin from '@lucide/svelte/icons/pin';
import Play from '@lucide/svelte/icons/play';
import Plus from '@lucide/svelte/icons/plus';
import QrCode from '@lucide/svelte/icons/qr-code';
import Reply from '@lucide/svelte/icons/reply';
import Search from '@lucide/svelte/icons/search';
import Settings from '@lucide/svelte/icons/settings';
import Shapes from '@lucide/svelte/icons/shapes';
import Share from '@lucide/svelte/icons/share';
import Shield from '@lucide/svelte/icons/shield';
import Smile from '@lucide/svelte/icons/smile';
import SmilePlus from '@lucide/svelte/icons/smile-plus';
import Square from '@lucide/svelte/icons/square';
import SquarePen from '@lucide/svelte/icons/square-pen';
import SwitchCamera from '@lucide/svelte/icons/switch-camera';
import Trash2 from '@lucide/svelte/icons/trash-2';
import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
import UserPlus from '@lucide/svelte/icons/user-plus';
import Users from '@lucide/svelte/icons/users';
import Utensils from '@lucide/svelte/icons/utensils';
import Video from '@lucide/svelte/icons/video';
import Volleyball from '@lucide/svelte/icons/volleyball';
import X from '@lucide/svelte/icons/x';

export const icons = {
  /** Сердечко непрочитанных реакций в строке списка — залитое. */
  heart: Heart,
  back: ArrowLeft,
  info: Info,
  close: X,
  devices: MonitorSmartphone,
  block: Ban,
  search: Search,
  signOut: LogOut,
  settings: Settings,
  compose: SquarePen,
  edit: Pencil,
  forward: ChevronRight,
  /** Тред — строка «N ответов» под сообщением (`bubble.left.and.text.bubble.right` нативной). */
  forum: MessagesSquare,
  previous: ChevronLeft,
  external: ExternalLink,
  up: ChevronUp,
  down: ChevronDown,
  folder: Folder,
  archive: Archive,
  plus: Plus,
  /** Часы — недавние стикеры (`clock` нативной). */
  clock: Clock,
  minus: Minus,
  removeCircle: CircleMinus,
  reaction: SmilePlus,
  chats: MessageCircle,
  photo: Image,
  none: Ban,
  appearance: Palette,
  bell: Bell,
  bellOff: BellOff,
  lock: Lock,
  unlock: LockOpen,
  personAdd: UserPlus,
  share: Share,
  shield: Shield,
  storage: HardDrive,
  warning: TriangleAlert,
  check: Check,
  location: MapPin,
  pin: Pin,
  play: Play,
  pause: Pause,
  reply: Reply,
  forwardMessage: Forward,
  attach: Paperclip,
  stop: Square,
  send: ArrowUp,
  video: Video,
  mic: Mic,
  switchCamera: SwitchCamera,
  copy: Copy,
  delete: Trash2,
  sending: Clock,
  read: Eye,
  failed: CircleAlert,
  more: Ellipsis,
  download: Download,
  file: File,
  audio: FileAudio,
  emojiSmileys: Smile,
  emojiAnimals: Leaf,
  emojiFood: Utensils,
  emojiActivity: Volleyball,
  emojiPlaces: Car,
  emojiObjects: Lightbulb,
  emojiSymbols: Shapes,
  emojiFlags: Flag,
  people: Users,
  publicRooms: Globe,
  link: Link,
  language: Languages,
  qr: QrCode,
} satisfies Record<string, Component<{ fill?: string }>>;

export type IconName = keyof typeof icons;

/** Те, что в Material были залиты: контуром они читаются хуже (кнопки воспроизведения, сердечко). */
export const filledIcons: ReadonlySet<IconName> = new Set(['heart', 'play', 'pause', 'stop']);

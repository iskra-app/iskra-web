/**
 * Что лежит на демо-сервере: люди, комнаты, переписка.
 *
 * Всё, чтобы посмотреть любой экран с чем-то на нём: личный чат с правкой, ответом и
 * реакциями, группа с опросом, беззвучный чат, приглашение и длинная комната для
 * подгрузки истории. Время — от «сейчас», чтобы «вчера» было вчера.
 */
import { DEMO_SERVER } from './address';
import { demoVoice } from './voice';

export { DEMO_BASE_URL, DEMO_SERVER } from './address';

export const demoUsers = {
  alice: `@alice:${DEMO_SERVER}`,
  anya: `@anya:${DEMO_SERVER}`,
  boris: `@boris:${DEMO_SERVER}`,
  vera: `@vera:${DEMO_SERVER}`,
} as const;

export const demoCredentials = { user: 'alice', password: 'password' } as const;

export const demoProfiles: Record<string, { displayname: string }> = {
  [demoUsers.alice]: { displayname: 'Алиса' },
  [demoUsers.anya]: { displayname: 'Аня' },
  [demoUsers.boris]: { displayname: 'Борис' },
  [demoUsers.vera]: { displayname: 'Вера' },
  // Её нет ни в одном чате — находится только каталогом сервера, как незнакомый человек.
  [`@lena:${DEMO_SERVER}`]: { displayname: 'Лена' },
};

export const demoRooms = {
  anya: `!anya:${DEMO_SERVER}`,
  weekend: `!weekend:${DEMO_SERVER}`,
  quiet: `!quiet:${DEMO_SERVER}`,
  history: `!history:${DEMO_SERVER}`,
  invite: `!bookclub:${DEMO_SERVER}`,
  archived: `!oldproject:${DEMO_SERVER}`,
  family: `!family:${DEMO_SERVER}`,
} as const;

export interface DemoEvent {
  event_id?: string;
  type: string;
  sender: string;
  content: Record<string, unknown>;
  state_key?: string;
  /** Редакция: что удалено (в комнатах до v11 — на верхнем уровне). */
  redacts?: string;
  origin_server_ts?: number;
  unsigned?: Record<string, unknown>;
}

export interface DemoRoom {
  roomId: string;
  state: DemoEvent[];
  /** Вся история по порядку; в синхронизацию уходит хвост, остальное — через /messages. */
  timeline: DemoEvent[];
  unread?: { notifications: number; highlights: number };
  /** До какого события Алиса дочитала — `m.read`. Нет — не читала ничего. */
  readUpTo?: string;
  /** Где Алиса остановилась в прошлый раз — `m.fully_read`, полоса «Непрочитанные сообщения». */
  fullyRead?: string;
  /** Теги комнаты: `m.favourite` — закреплённый, `m.lowpriority` — архив. */
  tags?: Record<string, Record<string, unknown>>;
  /** Данные комнаты, кроме тегов и маркера, — метка «непрочитано» (`m.marked_unread`). */
  accountData?: Record<string, unknown>;
  /** Сколько вошло — для сводки синхронизации, если комната «больше», чем её участники в демо. */
  joinedCount?: number;
}

export interface DemoInvite {
  roomId: string;
  inviteState: DemoEvent[];
}

const MINUTE = 60_000;

function member(roomId: string, userId: string, membership = 'join'): DemoEvent {
  return {
    type: 'm.room.member',
    sender: userId,
    state_key: userId,
    content: { membership, displayname: demoProfiles[userId]?.displayname },
    event_id: `$member-${userId}-${roomId}`,
  };
}

/** `admins` — кроме создателя: в личном чате, как у настоящих клиентов, админы оба. */
function roomState(roomId: string, creator: string, members: string[], extra: DemoEvent[] = [], admins: string[] = []): DemoEvent[] {
  return [
    {
      type: 'm.room.create',
      sender: creator,
      state_key: '',
      content: { creator, room_version: '10' },
      event_id: `$create-${roomId}`,
    },
    ...members.map((m) => member(roomId, m)),
    {
      type: 'm.room.power_levels',
      sender: creator,
      state_key: '',
      content: {
        users: Object.fromEntries([creator, ...admins].map((u) => [u, 100])),
        users_default: 0,
        events_default: 0,
        state_default: 50,
        redact: 50,
      },
      event_id: `$power-${roomId}`,
    },
    ...extra,
  ];
}

function text(sender: string, body: string, extra: Record<string, unknown> = {}): DemoEvent {
  return { type: 'm.room.message', sender, content: { msgtype: 'm.text', body, ...extra } };
}

/** Проставляет ID и время: последнее событие — `endsMinutesAgo` минут назад, шаг — `step` минут. */
function stamp(roomId: string, events: DemoEvent[], now: number, endsMinutesAgo: number, step = 1): DemoEvent[] {
  const slug = roomId.slice(1, roomId.indexOf(':'));
  return events.map((event, index) => ({
    ...event,
    event_id: event.event_id ?? `$${slug}-${index}`,
    origin_server_ts: now - (endsMinutesAgo + (events.length - 1 - index) * step) * MINUTE,
  }));
}

function photo(sender: string, id: string, w: number, h: number, caption?: string): DemoEvent {
  return {
    type: 'm.room.message',
    sender,
    content: {
      msgtype: 'm.image',
      body: caption ?? `${id}.svg`,
      ...(caption ? { filename: `${id}.svg` } : {}),
      url: `mxc://${DEMO_SERVER}/${id}`,
      info: { w, h, mimetype: 'image/svg+xml' },
    },
  };
}

export function buildDemoWorld(now: number): { rooms: DemoRoom[]; invites: DemoInvite[] } {
  const { alice, anya, boris, vera } = demoUsers;

  const anyaRoom = demoRooms.anya;
  const anyaTimeline = stamp(
    anyaRoom,
    [
      text(anya, 'Привет! Ты в субботу свободна?'),
      text(alice, 'Привет! Вроде да, а что?'),
      text(anya, 'Хотим за город, на озеро. Поедешь?'),
      {
        type: 'm.reaction',
        sender: alice,
        content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: `$anya-2`, key: '🔥' } },
      },
      text(alice, 'Поеду! Во сколько?', {
        'm.relates_to': { 'm.in_reply_to': { event_id: `$anya-2` } },
      }),
      text(anya, 'В девять у метро'),
      text(anya, '* В десять у метро', {
        'm.new_content': { msgtype: 'm.text', body: 'В десять у метро' },
        'm.relates_to': { rel_type: 'm.replace', event_id: `$anya-5` },
      }),
      text(anya, 'Возьми плед, там ветрено'),
    ],
    now,
    3,
    2,
  );

  const weekend = demoRooms.weekend;
  const voice = demoVoice();
  const weekendTimeline = stamp(
    weekend,
    [
      // Двое вошли подряд — одна строка «Борис и Вера теперь в чате».
      { type: 'm.room.member', sender: boris, state_key: boris, content: { membership: 'join', displayname: 'Борис' } },
      { type: 'm.room.member', sender: vera, state_key: vera, content: { membership: 'join', displayname: 'Вера' } },
      text(boris, 'Кто что берёт на пикник?'),
      text(vera, 'Я — пирог'),
      {
        type: 'm.poll.start',
        sender: boris,
        content: {
          'm.poll': {
            kind: 'm.disclosed',
            max_selections: 1,
            question: { 'm.text': [{ body: 'Куда едем?' }] },
            answers: [
              { 'm.id': 'lake', 'm.text': [{ body: 'На озеро' }] },
              { 'm.id': 'forest', 'm.text': [{ body: 'В лес' }] },
              { 'm.id': 'home', 'm.text': [{ body: 'Никуда, дома хорошо' }] },
            ],
          },
          'm.text': [{ body: 'Куда едем?\n1. На озеро\n2. В лес\n3. Никуда, дома хорошо' }],
        },
      },
      {
        type: 'm.poll.response',
        sender: vera,
        content: { 'm.relates_to': { rel_type: 'm.reference', event_id: '$weekend-4' }, 'm.selections': ['lake'] },
      },
      {
        type: 'm.room.message',
        sender: vera,
        content: {
          msgtype: 'm.image',
          body: 'Озеро прошлым летом',
          filename: 'lake.svg',
          url: `mxc://${DEMO_SERVER}/lake`,
          info: { w: 1200, h: 800, mimetype: 'image/svg+xml' },
        },
      },
      {
        type: 'm.room.message',
        sender: boris,
        content: { msgtype: 'm.image', body: 'forest.svg', url: `mxc://${DEMO_SERVER}/forest`, info: { w: 800, h: 1000, mimetype: 'image/svg+xml' } },
      },
      {
        type: 'm.room.message',
        sender: boris,
        content: { msgtype: 'm.file', body: 'Что взять.txt', url: `mxc://${DEMO_SERVER}/list`, info: { mimetype: 'text/plain', size: 96 } },
      },
      // Голосовое — как шлёт нативная Искра: `m.audio` с волной и меткой голосового.
      {
        type: 'm.room.message',
        sender: vera,
        content: {
          msgtype: 'm.audio',
          body: 'Голосовое сообщение',
          url: `mxc://${DEMO_SERVER}/voice`,
          info: { mimetype: 'audio/wav', duration: voice.duration, size: voice.size },
          'org.matrix.msc1767.audio': { duration: voice.duration, waveform: voice.waveform },
          'org.matrix.msc3245.voice': {},
        },
      },
      // Ссылка простым текстом — для вкладки «Ссылки» в «О чате».
      text(boris, 'Прогноз на субботу: https://example.org/weather — вроде солнце'),
      // Реакции от других — на фото озера и голосовое Веры.
      { type: 'm.reaction', sender: boris, content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$weekend-6', key: '🔥' } } },
      { type: 'm.reaction', sender: boris, content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$weekend-9', key: '❤️' } } },
      // Стикер из набора «Выходных» — у Алисы его нет, можно добавить себе.
      { type: 'm.sticker', sender: boris, event_id: '$weekend-sticker', content: demoStickerImage('connected') },
      text(vera, 'Алиса, ты с нами?', {
        format: 'org.matrix.custom.html',
        formatted_body: `<a href="https://matrix.to/#/${alice}">Алиса</a>, ты с нами?`,
        'm.mentions': { user_ids: [alice] },
      }),
    ],
    now,
    40,
    5,
  );

  const quiet = demoRooms.quiet;
  const quietTimeline = stamp(
    quiet,
    [
      text(boris, 'Напоминаю: собрание дома в четверг'),
      // Форматированное — с тем, что должно уцелеть, и тем, что не должно: скрипт и
      // картинка с сервера (`mxc://` внутри HTML сам не грузится).
      text(boris, 'Повестка: лифт, двор', {
        format: 'org.matrix.custom.html',
        formatted_body:
          '<p><b>Повестка</b> — <a href="https://example.org/agenda">полностью здесь</a></p><ul><li>лифт</li><li>двор</li></ul><img src="mxc://demo.iskra.invalid/plan" alt="схема двора"><script>alert(1)</script>',
      }),
      // Альбом: три фото подряд, с разницей в секунды, — одним пузырём (`album.ts`).
      photo(boris, 'yard', 900, 900, 'Двор сейчас'),
      photo(boris, 'forest', 800, 1000),
      photo(boris, 'lake', 1200, 800),
      text(vera, 'Лифт опять не работает'),
    ],
    now,
    60 * 5,
    30,
  ).map((event, index, all) =>
    // Отправлены разом: через четыре секунды друг за другом, а не через полчаса, как прочее.
    index > 2 && index < 5 ? { ...event, origin_server_ts: all[2]!.origin_server_ts! + (index - 2) * 4_000 } : event,
  );
  // Тред под «собранием»: чат подъезда большой (`joinedCount`), и ответы собираются под сообщением.
  const meetingId = quietTimeline[0]!.event_id!;
  const meetingTs = quietTimeline[0]!.origin_server_ts!;
  const meetingReplies = (
    [
      [vera, 'Во сколько?'],
      [boris, 'В семь, во дворе'],
      [vera, 'Приду'],
    ] as const
  ).map(([sender, body], index): DemoEvent => ({
    type: 'm.room.message',
    sender,
    event_id: `$quiet-thread-${index}`,
    origin_server_ts: meetingTs + (index + 1) * 5 * MINUTE,
    content: {
      msgtype: 'm.text',
      body,
      'm.relates_to': {
        rel_type: 'm.thread',
        event_id: meetingId,
        is_falling_back: true,
        'm.in_reply_to': { event_id: index ? `$quiet-thread-${index - 1}` : meetingId },
      },
    },
  }));
  // Сводка на корне — как её кладёт настоящий сервер (`unsigned.m.relations.m.thread`).
  quietTimeline[0] = {
    ...quietTimeline[0]!,
    unsigned: { 'm.relations': { 'm.thread': { count: meetingReplies.length, latest_event: meetingReplies.at(-1), current_user_participated: false } } },
  };
  quietTimeline.splice(1, 0, ...meetingReplies);

  const history = demoRooms.history;
  const historyTimeline = stamp(
    history,
    [
      ...Array.from({ length: 400 }, (_, i) =>
        text(i % 3 === 0 ? alice : i % 3 === 1 ? boris : vera, `Сообщение номер ${i + 1}`),
      ),
      // Последнее — Алисы, и прочитано; Борис отреагировал позже — сердечко в строке, не число.
      { type: 'm.reaction', sender: boris, content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$history-399', key: '👍' } } },
    ],
    now,
    60 * 26,
    3,
  );

  return {
    rooms: [
      {
        roomId: anyaRoom,
        state: roomState(
          anyaRoom,
          anya,
          [anya, alice],
          [{ type: 'm.room.encryption', sender: anya, state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' }, event_id: `$enc-${anyaRoom}` }],
          [alice],
        ),
        timeline: anyaTimeline,
        unread: { notifications: 2, highlights: 0 },
        readUpTo: `$anya-4`,
        fullyRead: `$anya-4`,
        tags: { 'm.favourite': { order: 0.5 } },
      },
      {
        roomId: weekend,
        state: roomState(weekend, boris, [boris, alice, vera], [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Выходные' }, event_id: `$name-${weekend}` },
          // Закреплено Борисом; Алиса здесь не админ — закреплять сама не может.
          { type: 'm.room.pinned_events', sender: boris, state_key: '', content: { pinned: ['$weekend-2'] }, event_id: `$pinned-${weekend}` },
          {
            type: 'im.ponies.room_emotes',
            sender: boris,
            state_key: '',
            content: { pack: { display_name: 'Искра', usage: ['sticker'] }, images: demoStickerPack(['connected', 'unlocked', 'surprise', 'bypass']) },
            event_id: `$stickers-${weekend}`,
          },
        ]),
        timeline: weekendTimeline,
        unread: { notifications: 3, highlights: 1 },
      },
      {
        roomId: quiet,
        state: roomState(quiet, boris, [boris, alice, vera], [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Дом 14, подъезд 2' }, event_id: `$name-${quiet}` },
        ]),
        timeline: quietTimeline,
        joinedCount: 128,
        // Беззвучный: сервер уведомлений не считает, но новые сообщения есть.
        unread: { notifications: 0, highlights: 0 },
      },
      {
        roomId: history,
        state: roomState(history, alice, [alice, boris, vera], [
          { type: 'm.room.name', sender: alice, state_key: '', content: { name: 'Длинная история' }, event_id: `$name-${history}` },
        ]),
        timeline: historyTimeline,
        readUpTo: '$history-399',
      },
      {
        roomId: demoRooms.archived,
        state: roomState(demoRooms.archived, alice, [alice, boris], [
          { type: 'm.room.name', sender: alice, state_key: '', content: { name: 'Старый проект' }, event_id: `$name-${demoRooms.archived}` },
        ]),
        timeline: stamp(demoRooms.archived, [text(boris, 'Закрываем, всем спасибо')], now, 60 * 24 * 40),
        readUpTo: `$oldproject-0`,
        tags: { 'm.lowpriority': { order: 0.5 } },
      },
      {
        roomId: demoRooms.family,
        state: [
          {
            type: 'm.room.create',
            sender: alice,
            state_key: '',
            content: { creator: alice, room_version: '10', type: 'm.space' },
            event_id: `$create-${demoRooms.family}`,
          },
          member(demoRooms.family, alice),
          member(demoRooms.family, anya),
          { type: 'm.room.name', sender: alice, state_key: '', content: { name: 'Семья' }, event_id: `$name-${demoRooms.family}` },
          ...[anyaRoom, weekend].map((child) => ({
            type: 'm.space.child',
            sender: alice,
            state_key: child,
            content: { via: [DEMO_SERVER] },
            event_id: `$child-${child}`,
          })),
        ],
        timeline: [],
      },
    ],
    invites: [
      {
        roomId: demoRooms.invite,
        inviteState: [
          { type: 'm.room.name', sender: boris, state_key: '', content: { name: 'Книжный клуб' } },
          { type: 'm.room.member', sender: boris, state_key: boris, content: { membership: 'join', displayname: 'Борис' } },
          { type: 'm.room.member', sender: boris, state_key: alice, content: { membership: 'invite' } },
        ],
      },
    ],
  };
}

/**
 * Стикеры демо — «Искорки» приложения (`public/stickers`), как в `MockWorld` нативной: одни
 * картинки и в наборах, и в переписке. Четыре — свои у Алисы, четыре других — набор
 * «Выходных», чтобы в чате попался стикер, которого у неё *ещё нет*, и его можно было добавить.
 */
const STICKER_EMOJI: Record<string, string> = {
  hello: '👋', joy: '🎉', love: '❤️', curious: '🤔', surprise: '😮', sleepy: '😴',
  sad: '😢', grumpy: '😒', loading: '⏳', unlocked: '🔓', bypass: '🏃', connected: '📶',
};

function demoStickerImage(code: string) {
  return { url: `mxc://${DEMO_SERVER}/sticker-${code}`, body: STICKER_EMOJI[code] ?? code, info: { w: 512, h: 512, mimetype: 'image/png' } };
}

function demoStickerPack(codes: readonly string[]) {
  return Object.fromEntries(codes.map((code) => [code, demoStickerImage(code)]));
}

/** Данные аккаунта Алисы до первой правки: свой набор стикеров. */
export const demoAccountData: Record<string, unknown> = {
  'im.ponies.user_emotes': { images: demoStickerPack(['hello', 'love', 'joy', 'sleepy']) },
};

/** `m.direct` Алисы: с кем какие личные чаты. */
export const demoDirect = { [demoUsers.anya]: [demoRooms.anya] };

/** Беззвучные комнаты — правилом `override` без действий, как их пишут клиенты. */
export const demoMutedRooms = [demoRooms.quiet];

/**
 * Каталог открытых комнат демо-сервера (`/publicRooms`): Алисы в них нет, пока она не вошла.
 * Одна — только по приглашению: в каталоге видна, а войти нельзя.
 */
export interface DemoPublicRoom {
  roomId: string;
  alias: string;
  name: string;
  topic: string;
  members: string[];
  joinRule: 'public' | 'invite';
}

export const demoDirectory: DemoPublicRoom[] = [
  {
    roomId: `!lounge:${DEMO_SERVER}`,
    alias: `#lounge:${DEMO_SERVER}`,
    name: 'Гостиная',
    topic: 'Обо всём и ни о чём',
    members: [demoUsers.boris, demoUsers.vera],
    joinRule: 'public',
  },
  {
    roomId: `!hiking:${DEMO_SERVER}`,
    alias: `#hiking:${DEMO_SERVER}`,
    name: 'Походы',
    topic: 'Маршруты выходного дня',
    members: [demoUsers.anya],
    joinRule: 'public',
  },
  {
    roomId: `!council:${DEMO_SERVER}`,
    alias: `#council:${DEMO_SERVER}`,
    name: 'Совет дома',
    topic: 'Только для жильцов',
    members: [demoUsers.vera],
    joinRule: 'invite',
  },
];

<!--
  Настройки — как `SettingsView` нативной Искры: список разделов (`#/settings`) и страница
  каждого (`#/settings/storage`). Безопасность собрала шифрование, устройства и заблокированных.
  На десктопе — в колонке чата, на телефоне — вместо списка, как чат.

  Здесь только то, что работает: чего ещё нет (пуши, звонки), того и в настройках нет.
-->
<script lang="ts">
  import { build, channel, version, website } from '../app/channel';
  import { onMount, tick } from 'svelte';
  import Avatar from '../../design/Avatar.svelte';
  import { asset } from '../../design/asset';
  import ConfirmDialog from '../../design/ConfirmDialog.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import TextField from '../../design/TextField.svelte';
  import Icon from '../../design/Icon.svelte';
  import type { IconName } from '../../design/icons.ts';
  import { formatRoute, type SettingsSection } from '../../core/navigation/route';
  import { router } from '../../core/navigation/router.svelte.ts';
  import type { AccountSwitch, DefaultAlerts } from '../../core/rooms/pushRules';
  import { app } from '../../core/session/app.svelte.ts';
  import type { UserSession } from '../../core/session/userSession.svelte.ts';
  import { isPersisted, requestPersistence } from '../../core/storage/persistence';
  import { i18n, t, type TextKey } from '../../i18n/index.svelte.ts';
  import { faceModes, fonts, preferences, type Appearance, type FaceMode, type Font } from '../app/preferences.svelte.ts';
  import { fileSize } from '../media/files';
  import RecoveryCode from '../recovery/RecoveryCode.svelte';
  import AccentSwatches from './AccentSwatches.svelte';
  import WallpaperPicker from './WallpaperPicker.svelte';
  import AppearancePreview from './AppearancePreview.svelte';
  import { settingsTitles } from './sections';
  import QuickReactionPicker from './QuickReactionPicker.svelte';
  import StickerSettings from './StickerSettings.svelte';
  import { builtOn, describeDevice, iskraLicence, type Licence } from './licences';
  import FoldersSettings from './FoldersSettings.svelte';
  import DevicesSection from './DevicesSection.svelte';
  import { languageChoices } from '../app/languages';
  import QrCodeDialog from '../app/QrCodeDialog.svelte';
  import { isMac } from '../../design/hotkeys';
  import { viewport } from '../../design/viewport.svelte.ts';
  import { autoDownloads, compressions, type MediaAutoDownload } from '../media/mediaSettings';
  import { Photo, pixelsFor } from '../rooms/faces.svelte.ts';

  let { session, section }: { session: UserSession; section?: SettingsSection } = $props();

  let page: HTMLElement | undefined = $state();

  // Другая страница — с начала.
  $effect(() => {
    void section;
    void tick().then(() => page?.scrollTo({ top: 0 }));
  });

  /** Строки списка — в порядке нативной Искры; профиль — карточкой над ними. */
  const rows: Array<{ section: SettingsSection; icon: IconName }> = [
    { section: 'appearance', icon: 'appearance' },
    { section: 'reactions', icon: 'reaction' },
    { section: 'chats', icon: 'chats' },
    { section: 'folders', icon: 'folder' },
    { section: 'notifications', icon: 'bell' },
    { section: 'security', icon: 'shield' },
    { section: 'media', icon: 'photo' },
    { section: 'storage', icon: 'storage' },
    { section: 'about', icon: 'info' },
  ];
  const hrefOf = (target: SettingsSection) => formatRoute({ name: 'settings', section: target });

  // ————— Профиль —————

  const me = $derived(session.profile);
  const photo = $derived(new Photo(session, me.avatarUrl, pixelsFor(4)));
  let name = $state('');
  let savingName = $state(false);
  let profileProblem = $state<'name' | 'picture' | null>(null);
  let picker: HTMLInputElement | undefined = $state();
  onMount(() => {
    name = me.name === me.id ? '' : me.name;
  });
  const offline = $derived(session.connection === 'offline');

  async function saveName(event: SubmitEvent) {
    event.preventDefault();
    savingName = true;
    profileProblem = null;
    try {
      await session.setName(name);
    } catch {
      profileProblem = 'name';
    } finally {
      savingName = false;
    }
  }

  async function setPhoto(file: File | null) {
    profileProblem = null;
    try {
      await session.setPhoto(file ? { blob: file, name: file.name, type: file.type } : null);
    } catch {
      profileProblem = 'picture';
    }
  }

  function picked() {
    const file = picker?.files?.[0];
    if (picker) picker.value = '';
    if (file?.type.startsWith('image/')) void setPhoto(file);
  }

  // ————— Уведомления —————

  const rules = $derived(session.notificationRules);
  // Перечитать при каждом открытии страницы: так видно изменённое в другом клиенте.
  $effect(() => {
    if (section === 'notifications') void session.notificationRules.load();
  });
  const defaultChoices: Array<{ value: DefaultAlerts; label: TextKey }> = [
    { value: 'all', label: 'room.manage.alertsAll' },
    { value: 'mentions', label: 'room.manage.alertsMentions' },
  ];
  const sides: Array<{ side: 'direct' | 'groups'; label: TextKey }> = [
    { side: 'direct', label: 'notifications.direct' },
    { side: 'groups', label: 'notifications.groups' },
  ];
  const mentionSwitches: Array<{ name: AccountSwitch; label: TextKey }> = [
    { name: 'mentionsMe', label: 'notifications.mentionsMe' },
    { name: 'roomMentions', label: 'notifications.roomMentions' },
  ];
  const otherSwitches: Array<{ name: AccountSwitch; label: TextKey }> = [
    { name: 'invitations', label: 'notifications.invitations' },
    { name: 'calls', label: 'notifications.calls' },
  ];

  // ————— Чаты —————

  /** Как назвать клавишу-модификатор: ⌘ на Mac, Ctrl везде ещё. */
  const mod = isMac() ? '⌘' : 'Ctrl';

  // ————— Фото и видео —————

  const autoDownloadHelp: Record<MediaAutoDownload, TextKey> = {
    always: 'media.autoDownload.alwaysHelp',
    never: 'media.autoDownload.neverHelp',
  };

  // ————— Безопасность: код восстановления —————

  const recovery = $derived(session.recovery);
  let confirmNewCode = $state(false);
  let newCode = $state<string | null>(null);

  async function makeNewCode() {
    confirmNewCode = false;
    newCode = (await recovery?.makeNewKey()) ?? null;
  }

  /** Ссылки — как `AboutView` нативной Искры: адрес показывается как есть, не переводится. */
  const source = { href: 'https://github.com/iskra-app/iskra-web', label: 'github.com/iskra-app/iskra-web' };
  const links: Array<{ title: TextKey; href: string; label: string }> = [
    { title: 'about.website', ...website },
    { title: 'about.sourceCode', ...source },
  ];

  // ————— Заблокированные —————

  // Только Matrix ID, без имён, как в нативной Искре: список — это ID, а имя может быть чьим угодно.
  const blocked = $derived(session.blocked);
  let unblocking = $state<string | null>(null);

  async function unblock(userId: string) {
    unblocking = userId;
    await blocked.unblock(userId);
    unblocking = null;
  }

  // ————— Хранилище —————

  let persisted = $state<boolean | null>(null);
  let usage = $state<{ used: number; quota: number } | null>(null);
  let clearing = $state(false);
  let confirmClear = $state(false);
  let clearFailed = $state(false);

  async function readStorage() {
    persisted = await isPersisted().catch(() => null);
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage !== undefined && estimate.quota) usage = { used: estimate.usage, quota: estimate.quota };
    } catch {
      usage = null;
    }
  }
  $effect(() => {
    if (section === 'storage') void readStorage();
  });

  async function askPersistence() {
    await requestPersistence();
    await readStorage();
  }

  async function clearCache() {
    confirmClear = false;
    clearing = true;
    clearFailed = false;
    try {
      await session.clearCache();
      location.reload();
    } catch {
      clearing = false;
      clearFailed = true;
    }
  }

  // ————— Внешний вид —————

  const themes: Array<{ value: Appearance; label: TextKey }> = [
    { value: 'system', label: 'appearance.mode.system' },
    { value: 'light', label: 'appearance.mode.light' },
    { value: 'dark', label: 'appearance.mode.dark' },
  ];
  const faceLabels: Record<FaceMode, { label: TextKey; help: TextKey }> = {
    creatures: { label: 'onboarding.faces.mixed', help: 'onboarding.faces.mixedHelp' },
    initials: { label: 'onboarding.faces.pictures', help: 'onboarding.faces.picturesHelp' },
    creaturesAlways: { label: 'onboarding.faces.faces', help: 'onboarding.faces.facesHelp' },
  };
  const fontLabel = (font: Font): TextKey => `appearance.font.${font}`;
  const languages = languageChoices;

  // ————— Об Iskra —————

  /** В ночной — с пометкой: по версии без неё ночную от стабильной не отличить. */
  const shownVersion = $derived(channel === 'nightly' ? `${version} (${t('signIn.nightlyBadgeWeb')})` : version);
  const device = describeDevice();

  /** Открытый текст лицензии — грузится, когда открыли. */
  let reading = $state<{ licence: Licence; text: string } | null>(null);
  async function read(licence: Licence) {
    reading = { licence, text: await licence.text() };
  }

  /** Тройной щелчок — `detail` считает щелчки подряд, как `onTapGesture(count: 3)`. */
  function openBeta(event: MouseEvent) {
    if (event.detail === 3) router.go({ name: 'settings', section: 'beta' });
  }

  let confirmingSignOut = $state(false);
  let showingCode = $state(false);
</script>

{#snippet licenceRow(licence: Licence)}
  <li>
    <button type="button" class="row-button" onclick={() => void read(licence)}>
      <span class="row-label">{licence.name}<span class="row-detail">{licence.kind}</span></span>
      <span class="chevron"><Icon name="forward" /></span>
    </button>
  </li>
{/snippet}

<div class="settings" bind:this={page}>
  {#if !section}
    <!-- Шапка профиля, как `ProfileHeader` нативной: лицо, имя, Matrix ID — по центру.
         «Изменить» — карандашом в шапке экрана (`Shell`). -->
    <div class="profile-header">
      <span class="avatar big"><Avatar name={me.name} seed={me.id} photo={photo.url} mode={preferences.faces} /></span>
      <strong class="profile-name">{me.name}</strong>
      <span class="secondary selectable">{me.id}</span>
      <!-- Свой QR-код — `ProfileActionTile` нативной в шапке профиля. -->
      <button type="button" class="tile" onclick={() => (showingCode = true)}>
        <Icon name="qr" />
        <span>{t('qr.title')}</span>
      </button>
    </div>
    <QrCodeDialog
      open={showingCode}
      link={`https://matrix.to/#/${encodeURIComponent(me.id)}`}
      name={me.name}
      subtitle={me.id}
      seed={me.id}
      photo={photo.url}
      onclose={() => (showingCode = false)}
    />
    <nav aria-label={t('settings.title')}>
      <ul class="rows">
        {#each rows as row (row.section)}
          <li>
            <a href={hrefOf(row.section)}>
              <span class="row-icon"><Icon name={row.icon} /></span>
              <span class="row-label">{t(settingsTitles[row.section])}</span>
              <span class="chevron"><Icon name="forward" /></span>
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    <PlainButton danger onclick={() => (confirmingSignOut = true)}>{t('account.signOut')}</PlainButton>
  {:else if section === 'profile'}
    <!-- `ProfileEditView` нативной: фото, имя с предупреждением, Matrix ID — только прочесть. -->
    <div class="profile-header">
      <span class="avatar big"><Avatar name={me.name} seed={me.id} photo={photo.url} mode={preferences.faces} /></span>
      <div class="buttons">
        <PlainButton disabled={offline} onclick={() => picker?.click()}>{t('account.changePicture')}</PlainButton>
        {#if me.avatarUrl}
          <PlainButton danger disabled={offline} onclick={() => void setPhoto(null)}>{t('account.removePicture')}</PlainButton>
        {/if}
      </div>
      <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
    </div>
    <section aria-labelledby="name-title">
      <h3 id="name-title">{t('account.nameHeader')}</h3>
      <form class="stack" onsubmit={saveName}>
        <TextField bind:value={name} label={t('account.nameHeader')} placeholder={t('account.namePlaceholder')} disabled={offline} />
        <PrimaryButton type="submit" busy={savingName} disabled={offline || !name.trim() || name.trim() === me.name}>{t('room.manage.save')}</PrimaryButton>
      </form>
      <p class="secondary">{offline ? t('account.editOffline') : t('account.nameChangeNotice')}</p>
      {#if profileProblem}
        <p class="problem" role="alert">{t(profileProblem === 'name' ? 'account.nameFailed' : 'account.pictureFailed')}</p>
      {/if}
    </section>
    <section aria-labelledby="username-title">
      <h3 id="username-title">{t('account.usernameHeader')}</h3>
      <p class="readonly selectable">{me.id}</p>
      <p class="secondary">{t('account.usernameFixed')}</p>
    </section>
  {:else if section === 'notifications'}
    {#if rules.current}
      {@const current = rules.current}
      <h3>{t('notifications.defaults')}</h3>
      {#each sides as { side, label } (side)}
        <h4 id="alerts-{side}">{t(label)}</h4>
        <div class="options" role="radiogroup" aria-labelledby="alerts-{side}">
          {#each defaultChoices as choice (choice.value)}
            <button
              type="button"
              role="radio"
              aria-checked={current[side] === choice.value}
              disabled={offline}
              onclick={() => void rules.setDefault(side, choice.value)}
            >
              {t(choice.label)}
            </button>
          {/each}
        </div>
      {/each}
      <p class="secondary">{t('notifications.defaultsFooter')}</p>
      <h3>{t('notifications.mentions')}</h3>
      {#each mentionSwitches as { name, label } (name)}
        <label class="switch">
          <span>{t(label)}</span>
          <input type="checkbox" role="switch" checked={current[name]} disabled={offline} onchange={(event) => void rules.setSwitch(name, event.currentTarget.checked)} />
        </label>
      {/each}
      <h3>{t('notifications.other')}</h3>
      {#each otherSwitches as { name, label } (name)}
        <label class="switch">
          <span>{t(label)}</span>
          <input type="checkbox" role="switch" checked={current[name]} disabled={offline} onchange={(event) => void rules.setSwitch(name, event.currentTarget.checked)} />
        </label>
      {/each}
      <p class="secondary">{t('notifications.otherFooter')}</p>
    {:else if rules.loadFailed}
      <p class="secondary">{t('notifications.failed')}</p>
    {/if}
    {#if rules.failure}
      <p class="problem" role="alert">{t(`notificationRules.${rules.failure}`)}</p>
    {/if}
  {:else if section === 'security'}
    <!-- `SecurityView` нативной: сначала — защищена ли переписка, потом устройства и
         заблокированные, последним — новый код: единственное здесь, чего не отменить. -->
    {#if recovery}
      <section aria-labelledby="encryption-title">
        <h3 id="encryption-title">{t('settings.encryption')}</h3>
        {#if recovery.protection === 'on'}
          <p class="state"><span class="ok" aria-hidden="true">✓</span>{t('encryption.on')}</p>
          <p class="secondary">{t('encryption.onHelp')}</p>
        {:else if recovery.protection === 'keyNeeded'}
          <!-- Копия есть, а это устройство её не откроет: код или подтверждение с другого. -->
          <p class="state"><span class="warn" aria-hidden="true">!</span>{t('encryption.keyNeeded')}</p>
          <PrimaryButton onclick={() => app.openRecovery()}>{t('encryption.restore')}</PrimaryButton>
          <p class="secondary">{t('encryption.keyNeededHelp')}</p>
        {:else if recovery.protection === 'off'}
          <p class="state"><span class="warn" aria-hidden="true">!</span>{t('encryption.off')}</p>
          <PrimaryButton onclick={() => app.openRecovery()}>{t('encryption.protect')}</PrimaryButton>
          <p class="secondary">{t('encryption.offHelp')}</p>
        {/if}
        {#if recovery.failure}
          <p class="problem" role="alert">{t(`account.${recovery.failure}`)}</p>
        {/if}
      </section>
    {/if}

    <DevicesSection {session} />

    <section aria-labelledby="blocked-title">
      <h3 id="blocked-title">{t('settings.blocked')}</h3>
      {#if blocked.ids.length}
        <ul class="list">
          {#each blocked.ids as userId (userId)}
            <li class="row">
              <span class="id">{userId}</span>
              <PlainButton busy={unblocking === userId} disabled={offline} onclick={() => void unblock(userId)}>{t('settings.unblock')}</PlainButton>
            </li>
          {/each}
        </ul>
      {:else}
        <p>{t('settings.blockedEmptyTitle')}</p>
        <p class="secondary">{t('settings.blockedEmptyMessage')}</p>
      {/if}
      {#if blocked.failure === 'unblockFailed'}
        <p class="problem" role="alert">{t('account.unblockFailed')}</p>
      {/if}
    </section>

    <!-- Что о вас узнают, пока вы ничего не пишете: что вы здесь и что набираете, — две вещи,
         которые сервер Matrix действительно говорит другим. На этом устройстве. -->
    <section aria-labelledby="privacy-title">
      <h3 id="privacy-title">{t('privacy.title')}</h3>
      <label class="switch">
        <span>{t('privacy.hidePresence')}</span>
        <input type="checkbox" role="switch" bind:checked={preferences.hidePresence} />
      </label>
      <p class="secondary">{t('privacy.hidePresenceHelp')}</p>
      <label class="switch">
        <span>{t('privacy.hideTyping')}</span>
        <input type="checkbox" role="switch" bind:checked={preferences.hideTyping} />
      </label>
      <p class="secondary">{t('privacy.hideTypingHelp')}</p>
    </section>

    {#if recovery?.protection === 'on'}
      <section aria-labelledby="new-code-title">
        <h3 id="new-code-title" class="visually-hidden">{t('settings.recoveryCode')}</h3>
        <PlainButton danger busy={recovery.working} onclick={() => (confirmNewCode = true)}>{t('encryption.newKey')}</PlainButton>
        <p class="secondary">{t('encryption.newKeyHelp')}</p>
      </section>
    {/if}

  {:else if section === 'appearance'}
    <!-- Порядок `AppearanceView` нативной: вид ленты, тема, цвет, обои; дальше — то, что есть
         только здесь: шрифт и язык (в iOS язык — в настройках системы). Первым — как это будет
         выглядеть. -->
    <AppearancePreview />
    <label class="switch">
      <span>{t('appearance.compact')}</span>
      <input
        type="checkbox"
        role="switch"
        checked={preferences.layout === 'compact'}
        onchange={(event) => (preferences.layout = event.currentTarget.checked ? 'compact' : 'bubbles')}
      />
    </label>
    <h3 id="theme-title">{t('appearance.theme')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="theme-title">
      {#each themes as theme (theme.value)}
        <button type="button" role="radio" aria-checked={preferences.appearance === theme.value} onclick={() => (preferences.appearance = theme.value)}>
          {t(theme.label)}
        </button>
      {/each}
    </div>
    <h3 id="accent-title">{t('appearance.accent')}</h3>
    <AccentSwatches labelledby="accent-title" />
    <h3 id="wallpaper-title">{t('appearance.wallpaper')}</h3>
    <WallpaperPicker labelledby="wallpaper-title" />
    <h3 id="font-title">{t('appearance.font')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="font-title">
      {#each fonts as font (font)}
        <!-- Каждый вариант написан своим шрифтом: видно, что выбираешь. -->
        <button type="button" role="radio" data-font={font} aria-checked={preferences.font === font} onclick={() => (preferences.font = font)}>
          {t(fontLabel(font))}
        </button>
      {/each}
    </div>
    <h3 id="language-title">{t('settings.language')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="language-title">
      {#each languages as language (language.value)}
        <button type="button" role="radio" aria-checked={preferences.language === language.value} onclick={() => (preferences.language = language.value)}>
          {t(language.label)}
        </button>
      {/each}
    </div>
  {:else if section === 'reactions'}
    <h3 id="quick-reaction-title">{t('reactions.quick')}</h3>
    <QuickReactionPicker labelledby="quick-reaction-title" />
    <p class="secondary">{t('reactions.quickHelp')}</p>
    <StickerSettings {session} />
  {:else if section === 'folders'}
    <FoldersSettings {session} />
  {:else if section === 'chats'}
    <h3>{t('chats.serviceSection')}</h3>
    <label class="switch">
      <span>{t('chats.hideNameChanges')}</span>
      <input type="checkbox" role="switch" bind:checked={preferences.hideNameChanges} />
    </label>
    <label class="switch">
      <span>{t('chats.hideMembershipChanges')}</span>
      <input type="checkbox" role="switch" bind:checked={preferences.hideMembershipChanges} />
    </label>
    <p class="secondary">{t('chats.serviceHelp')}</p>
    <!-- Только с клавиатурой: на сенсорном Enter и так переносит строку, а отправляет кнопка. -->
    {#if viewport.finePointer}
      <h3>{t('chats.keyboardSection')}</h3>
      <label class="switch">
        <span>{t('chats.modReturnWeb', { mod })}</span>
        <input type="checkbox" role="switch" bind:checked={preferences.sendWithModEnter} />
      </label>
      <p class="secondary">{preferences.sendWithModEnter ? t('chats.modReturnOnHelpWeb', { mod }) : t('chats.enterSendsHelpWeb')}</p>
    {/if}
  {:else if section === 'media'}
    <h3 id="auto-download-title">{t('media.autoDownload')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="auto-download-title">
      {#each autoDownloads as choice (choice)}
        <button type="button" role="radio" aria-checked={preferences.autoDownload === choice} onclick={() => (preferences.autoDownload = choice)}>
          {t(`media.autoDownload.${choice}`)}
        </button>
      {/each}
    </div>
    <p class="secondary">{t(autoDownloadHelp[preferences.autoDownload])}</p>
    <label class="switch">
      <span>{t('media.stripMetadata')}</span>
      <input type="checkbox" role="switch" bind:checked={preferences.stripMetadata} />
    </label>
    <label class="switch">
      <span>{t('media.compressPhotos')}</span>
      <input type="checkbox" role="switch" bind:checked={preferences.compress} />
    </label>
    <!-- Появляется вместе с переключателем, от которого зависит, — а не стоит серым. -->
    {#if preferences.compress}
      <h3 id="compression-title">{t('media.compression')}</h3>
      <div class="options" role="radiogroup" aria-labelledby="compression-title">
        {#each compressions as level (level)}
          <button type="button" role="radio" aria-checked={preferences.compression === level} onclick={() => (preferences.compression = level)}>
            {t(`media.compressionPhoto.${level}`)}
          </button>
        {/each}
      </div>
    {/if}
    <p class="secondary">{t('media.videoAsIsWeb')}</p>
  {:else if section === 'storage'}
    <!-- `StorageView` нативной: сначала — сколько всего, потом что с этим сделать. -->
    <dl>
      <dt>{t('storage.total')}</dt>
      <dd>{usage ? t('storage.used', { used: fileSize(usage.used, i18n.locale), quota: fileSize(usage.quota, i18n.locale) }) : t('storage.measuring')}</dd>
    </dl>
    {#if persisted !== null}
      <p>{persisted ? t('storage.persisted') : t('storage.notPersisted')}</p>
      {#if !persisted}
        <PlainButton onclick={() => void askPersistence()}>{t('storage.persist')}</PlainButton>
      {/if}
    {/if}
    <h3>{t('storage.cache')}</h3>
    <PlainButton danger busy={clearing} onclick={() => (confirmClear = true)}>{clearing ? t('storage.clearing') : t('storage.clear')}</PlainButton>
    <p class="secondary">{t('storage.cacheWeb')}</p>
    {#if clearFailed}<p class="problem" role="alert">{t('storage.failed')}</p>{/if}
  {:else if section === 'about'}
    <!-- `AboutView` нативной, строка в строку: значок, имя и строка о себе; версия, сборка,
         устройство; сайт, исходный код и лицензии; внизу — чьё это и на каких условиях. -->
    <div class="profile-header">
      <!-- Три щелчка по значку — «Бета-функции», как в нативной: строки к ним нет, их находит тот,
           кто ищет. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
      <img class="app-icon" src={asset('icons/icon-192.png')} alt="" onclick={openBeta} />
      <strong class="profile-name">{t('about.appNameWeb')}</strong>
      <span class="secondary">{t('about.webTagline')}</span>
    </div>
    <ul class="list">
      <li class="pair"><span>{t('about.version')}</span><span class="secondary selectable">{shownVersion}</span></li>
      <li class="pair"><span>{t('about.build')}</span><span class="secondary selectable">{build}</span></li>
      <li class="pair"><span>{t('about.device')}</span><span class="secondary selectable">{device}</span></li>
    </ul>
    <section aria-label={t('about.title')}>
      <ul class="rows">
        {#each links as link (link.href)}
          <li>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              <span class="row-label">{t(link.title)}<span class="row-detail">{link.label}</span></span>
              <span class="chevron"><Icon name="external" /></span>
            </a>
          </li>
        {/each}
        <li>
          <a href={hrefOf('licences')}>
            <span class="row-label">{t('about.licences')}</span>
            <span class="chevron"><Icon name="forward" /></span>
          </a>
        </li>
      </ul>
      <p class="secondary">{t('about.copyright')}</p>
      <p class="secondary">{t('about.freeSoftwareWeb')}</p>
    </section>
  {:else if section === 'beta'}
    <!-- `BetaView` нативной: что ещё не доделано, одним экраном. Пока здесь только мордочки — им
         сюда из «Внешнего вида», как и там. -->
    <p class="secondary">{t('beta.intro')}</p>
    <h3 id="faces-title">{t('appearance.avatars')}</h3>
    <div class="options" role="radiogroup" aria-labelledby="faces-title">
      {#each faceModes as mode (mode)}
        <button type="button" role="radio" aria-checked={preferences.faces === mode} onclick={() => (preferences.faces = mode)}>
          <span class="option">
            <span>{t(faceLabels[mode].label)}</span>
            <span class="secondary">{t(faceLabels[mode].help)}</span>
          </span>
        </button>
      {/each}
    </div>
  {:else if section === 'licences'}
    <!-- `LicensesView` нативной: своя лицензия, потом — на чём всё построено; строка открывает текст. -->
    <ul class="rows">
      {@render licenceRow(iskraLicence)}
    </ul>
    <h3 id="built-on-title">{t('licences.builtOn')}</h3>
    <ul class="rows" aria-labelledby="built-on-title">
      {#each builtOn as licence (licence.name)}
        {@render licenceRow(licence)}
      {/each}
    </ul>
  {/if}
</div>

<Dialog open={reading !== null} title={reading?.licence.name ?? ''} onclose={() => (reading = null)}>
  {#if reading}
    <pre class="licence">{reading.text}</pre>
    <PlainButton onclick={() => (reading = null)}>{t('folders.done')}</PlainButton>
  {/if}
</Dialog>

<ConfirmDialog
  open={confirmNewCode}
  title={t('recovery.new.title')}
  message={t('recovery.new.message')}
  confirmLabel={t('recovery.new.confirm')}
  cancelLabel={t('recovery.new.keepOld')}
  destructive
  onclose={() => (confirmNewCode = false)}
  onconfirm={() => void makeNewCode()}
/>

<Dialog open={!!newCode} title={t('settings.recoveryCode')} onclose={() => (newCode = null)}>
  {#if newCode}
    <RecoveryCode code={newCode} userId={session.userId} onsaved={() => (newCode = null)} />
  {/if}
</Dialog>

<ConfirmDialog
  open={confirmClear}
  title={t('storage.confirm.title')}
  message={t('storage.cacheWeb')}
  confirmLabel={t('storage.confirm.action')}
  cancelLabel={t('storage.cancel')}
  onclose={() => (confirmClear = false)}
  onconfirm={() => void clearCache()}
/>

<ConfirmDialog
  open={confirmingSignOut}
  title={t('signOut.confirmTitle')}
  message={t('signOut.confirmMessage')}
  confirmLabel={t('account.signOut')}
  cancelLabel={t('common.cancel')}
  destructive
  onclose={() => (confirmingSignOut = false)}
  onconfirm={() => {
    confirmingSignOut = false;
    void app.signOut();
  }}
/>

<style>
  .row-button {
    width: 100%;
    border: none;
    background: transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .row-detail {
    display: block;
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .list li.pair {
    display: flex;
    flex-direction: row;
    justify-content: space-between;
    gap: var(--space-normal);
  }
  .licence {
    max-height: var(--size-media-max-height);
    margin: 0;
    overflow: auto;
    font-size: var(--font-size-caption);
    white-space: pre-wrap;
  }
  .profile-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    padding-block: var(--space-roomy);
    text-align: center;
  }
  .big {
    --avatar-size: var(--size-avatar-profile);
    margin-block-end: var(--space-close);
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-tight);
    min-width: var(--size-avatar-profile);
    margin-block-start: var(--space-close);
    padding: var(--space-close) var(--space-normal);
    border: none;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    color: var(--accent);
    font: inherit;
    font-size: var(--font-size-caption);
    cursor: pointer;
  }
  .tile :global(svg) {
    width: var(--size-icon-button);
    height: var(--size-icon-button);
  }
  .app-icon {
    width: var(--size-avatar-profile);
    height: var(--size-avatar-profile);
    margin-block-end: var(--space-close);
    border-radius: var(--radius-card);
  }
  .profile-name {
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  .selectable {
    overflow-wrap: anywhere;
    user-select: text;
  }
  .readonly {
    margin: 0;
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    color: var(--color-text-secondary);
  }
  .state {
    display: flex;
    align-items: center;
    gap: var(--space-close);
  }
  .ok {
    color: var(--accent);
    font-weight: 700;
  }
  .warn {
    color: var(--color-warning);
    font-weight: 700;
  }
  .settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    width: 100%;
    max-width: var(--column-timeline-max);
    height: 100%;
    margin-inline: auto;
    padding: var(--space-roomy) var(--timeline-gutter) max(var(--space-generous), env(safe-area-inset-bottom));
    overflow-y: auto;
  }
  /* Страница прокручивается сама: без этого flex ужимал бы группы, и они срезали низ. */
  .settings > :global(*),
  section > :global(*) {
    flex-shrink: 0;
  }
  section + section {
    margin-block-start: var(--space-generous);
  }
  /* Список разделов — строки-ссылки, как `Form` нативной: значок акцентом, шеврон. */
  .rows {
    border-radius: var(--radius-card);
    background: var(--color-surface);
  }


  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: hidden;
  }
  .rows a,
  .row-button {
    display: flex;
    align-items: center;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal) var(--space-close) var(--space-roomy);
    color: inherit;
    text-decoration: none;
  }
  .rows li + li a,
  .rows li + li .row-button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .rows a:hover,
  .row-button:hover {
    background: var(--color-incoming-bubble);
  }
  /* Кольцо фокуса — внутрь: снаружи его срезал бы `overflow` списка. */
  .rows a:focus-visible,
  .row-button:focus-visible {
    outline-offset: calc(-1 * var(--space-tight));
  }
  .row-icon {
    display: flex;
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--accent);
  }
  .row-label {
    flex: 1;
  }
  .chevron {
    display: flex;
    width: var(--size-icon);
    height: var(--size-icon);
    color: var(--color-text-secondary);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-normal);
    scroll-margin-top: var(--space-roomy);
  }

  h3 {
    margin: var(--space-close) 0 0;
    font-size: var(--font-size-caption);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  h4 {
    margin: 0;
    font: inherit;
    font-weight: 600;
  }
  p {
    margin: 0;
  }
  .secondary {
    color: var(--color-text-secondary);
    font-size: var(--font-size-caption);
  }
  .problem {
    color: var(--color-danger);
    font-size: var(--font-size-caption);
  }

  .avatar {
    --avatar-size: var(--size-avatar-large);
  }

  .buttons {
    display: grid;
    grid-auto-flow: column;
    gap: var(--space-close);
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-close);
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    list-style: none;
  }
  .list li {
    display: flex;
    flex-direction: column;
    padding: var(--space-close) var(--space-normal);
  }
  /* Сеткой, а не флексом: `PlainButton` тянется на всю ширину, а колонка `auto` его держит. */
  .list li.row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-normal);
  }
  .id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .list li + li {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options {
    display: flex;
    flex-direction: column;
    border-radius: var(--radius-card);
    background: var(--color-surface);
    overflow: hidden;
  }
  .options button {
    display: flex;
    align-items: center;
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .options button:disabled {
    color: var(--color-text-secondary);
    cursor: default;
  }
  .options button[data-font='system'] {
    font-family: var(--font-system);
  }
  .options button[data-font='inter'] {
    font-family: 'Inter', var(--font-system);
  }
  .options button + button {
    border-block-start: var(--border-hairline) solid var(--color-separator);
  }
  .options button[aria-checked='true']::after {
    content: '✓';
    margin-inline-start: auto;
    padding-inline-start: var(--space-close);
    color: var(--accent);
    font-weight: 700;
  }
  .option {
    display: flex;
    flex-direction: column;
  }
  .switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-normal);
    min-height: var(--tap-target);
    padding: var(--space-close) var(--space-normal);
    border-radius: var(--radius-card);
    background: var(--color-surface);
    cursor: pointer;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-tight) var(--space-roomy);
    margin: 0;
  }
  dt {
    color: var(--color-text-secondary);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>

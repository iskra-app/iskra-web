<!--
  QR-код — `QRCodeSheet` нативной Искры: лицо, имя, код и адрес под ним. Свой — из настроек,
  собеседника или открытой комнаты — из «О чате».

  В коде — ссылка `matrix.to`, а не голый ID: её откроет любая камера, и в любом клиенте Matrix
  она ведёт туда же. ID написан и под кодом — для того, кто стоит рядом и предпочтёт набрать.
  «Поделиться» отдаёт сам код картинкой — то, что имеют в виду, делясь QR-кодом: показать на
  другом экране или распечатать. Где браузер не умеет делиться файлом, картинка скачивается.
-->
<script lang="ts">
  import Avatar from '../../design/Avatar.svelte';
  import Dialog from '../../design/Dialog.svelte';
  import PlainButton from '../../design/PlainButton.svelte';
  import PrimaryButton from '../../design/PrimaryButton.svelte';
  import QrCode from '../../design/QrCode.svelte';
  import { qrCard } from '../../design/qrCard';
  import { t } from '../../i18n/index.svelte.ts';
  import { preferences } from './preferences.svelte.ts';

  interface Props {
    open: boolean;
    /** Что в коде: ссылка `matrix.to` на человека или комнату. */
    link: string;
    name: string;
    /** Matrix ID или адрес комнаты — под кодом. */
    subtitle: string;
    seed?: string | undefined;
    /** Object URL фото — уже загруженного. */
    photo?: string | undefined;
    onclose: () => void;
  }
  let { open, link, name, subtitle, seed, photo, onclose }: Props = $props();

  let sharing = $state(false);

  async function share() {
    sharing = true;
    try {
      const blob = await qrCard(link, name, subtitle);
      if (!blob) return;
      const file = new File([blob], `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'iskra'}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => {});
        return;
      }
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      sharing = false;
    }
  }
</script>

<Dialog {open} title={t('qr.title')} {onclose}>
  <div class="sheet">
    <span class="face"><Avatar {name} {seed} {photo} mode={preferences.faces} /></span>
    <strong class="name">{name}</strong>
    <QrCode text={link} />
    <span class="subtitle selectable">{subtitle}</span>
  </div>
  <PrimaryButton wide busy={sharing} onclick={() => void share()}>{t('profile.share')}</PrimaryButton>
  <PlainButton onclick={onclose}>{t('recovery.close')}</PlainButton>
</Dialog>

<style>
  .sheet {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-roomy);
    text-align: center;
  }
  .face {
    --avatar-size: var(--size-avatar-large);
  }
  .name {
    font-size: var(--font-size-title);
    overflow-wrap: anywhere;
  }
  .subtitle {
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .selectable {
    user-select: text;
    -webkit-user-select: text;
  }
</style>

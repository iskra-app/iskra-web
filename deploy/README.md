# Боевой сервер: web.iskra.wtf

Российский VPS с Caddy. Зарубежные хостинги статики (Netlify, Vercel, Cloudflare Pages)
из России блокируют или режут до 16 КБ на соединение, а CSP нужна заголовком — GitHub Pages
не годится. CI выкладывает каждый зелёный пуш в `main` (job `deploy` в `.github/workflows/ci.yml`).

## Один раз на сервере

Ubuntu 24.04 или Debian 12; хватит 1 vCPU и 1 ГБ.

1. **Caddy** — из его собственного репозитория, по инструкции
   <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>. И `rsync`.
2. **Пользователь для деплоя** — без пароля, только с ключом:
   ```sh
   adduser --disabled-password --gecos '' deploy
   install -d -o deploy -g deploy /srv/iskra-web /srv/iskra-web/releases
   ```
   Ключ — новый, только для CI: `ssh-keygen -t ed25519 -N '' -f iskra-deploy`.
   Публичную половину — в `/home/deploy/.ssh/authorized_keys`.
3. **Caddyfile** — `deploy/Caddyfile` в `/etc/caddy/Caddyfile` (или `import` из него).
   Перезагружать Caddy после этого не нужно, пока нет первого релиза: `current` ещё не
   существует, и `import` не найдёт файл. Первый деплой сделает `caddy reload` сам.
   `caddy reload` идёт через админский адрес `localhost:2019`, root для него не нужен.
4. **Порты** 80 и 443 открыты (Caddy сам получит сертификат Let's Encrypt).
5. **DNS** — запись `A` (и `AAAA`, если есть IPv6) для `web.iskra.wtf` на адрес сервера,
   в панели Unstoppable Domains, где живёт зона `iskra.wtf`.

## Один раз в GitHub

Settings → Environments → `production`:

| Что | Где | Значение |
|---|---|---|
| `DEPLOY_SSH_KEY` | secret | приватная половина ключа `iskra-deploy` |
| `DEPLOY_HOST` | variable | адрес сервера (IP или имя) |
| `DEPLOY_USER` | variable | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | variable | вывод `ssh-keyscan -t ed25519 <адрес>` |

Пока нет `DEPLOY_HOST`, job пропускается. Переменные окружения видны job только из-за
`environment: production`; можно положить их и на уровень репозитория.

## Как устроен релиз

```
/srv/iskra-web/releases/<коммит>/site/          dist/ без _headers и headers.caddy
/srv/iskra-web/releases/<коммит>/headers.caddy  заголовки из security-headers.ts
/srv/iskra-web/current -> releases/<коммит>
```

CI загружает папку `rsync`'ом, переключает `current` одной ссылкой и делает `caddy reload`.
Не принял Caddy новые заголовки — ссылка возвращается на прежний релиз, job красная.
Хранятся пять последних релизов. Откат руками:

```sh
cd /srv/iskra-web && ln -sfn releases/<коммит> current.new && mv -Tf current.new current
caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Проверить, что доступно из России

Из дата-центров (check-host.net и подобные) открывается всё, даже Cloudflare, — это ничего
не доказывает. Проверять с домашнего провайдера и с мобильного интернета, без VPN.

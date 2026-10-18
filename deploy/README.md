# Боевой сервер: web.iskra.wtf

Российский VPS с nginx. Зарубежные хостинги статики (Netlify, Vercel, Cloudflare Pages)
из России блокируют или режут до 16 КБ на соединение, а CSP нужна заголовком — GitHub Pages
не годится. CI выкладывает каждый зелёный пуш в `main` (job `deploy` в `.github/workflows/ci.yml`).

## Один раз на сервере

Ubuntu 24.04 или Debian 12; хватит 1 vCPU и 1 ГБ. Порты 80 и 443 открыты.

1. **DNS** — запись `A` (и `AAAA`, если есть IPv6) для `web.iskra.wtf` на адрес сервера,
   в панели Unstoppable Domains, где живёт зона `iskra.wtf`. Нужна до сертификата.
2. **Пакеты:** `apt install nginx certbot python3-certbot-nginx rsync`.
3. **Сертификат** — пока nginx ещё со своим конфигом по умолчанию:
   ```sh
   certbot certonly --nginx -d web.iskra.wtf --deploy-hook 'systemctl reload nginx'
   ```
   Продлевает его таймер certbot сам.
4. **Пользователь для деплоя** — без пароля, только с ключом, и с правом на две команды
   nginx через sudo — проверить конфиг и перечитать его:
   ```sh
   adduser --disabled-password --gecos '' deploy
   echo 'deploy ALL=(root) NOPASSWD: /usr/sbin/nginx -t, /usr/sbin/nginx -s reload' \
     > /etc/sudoers.d/iskra-deploy && chmod 440 /etc/sudoers.d/iskra-deploy
   ```
   Ключ — новый, только для CI: `ssh-keygen -t ed25519 -N '' -f iskra-deploy`.
   Публичную половину — в `/home/deploy/.ssh/authorized_keys`.
5. **Папка сайта с пустым релизом** — конфиг подключает `current/headers.nginx`, и без него
   `nginx -t` не пройдёт. Первый деплой заменит заглушку:
   ```sh
   install -d -o deploy -g deploy /srv/iskra-web /srv/iskra-web/releases
   sudo -u deploy sh -c 'cd /srv/iskra-web && mkdir -p releases/empty/site &&
     touch releases/empty/headers.nginx && ln -s releases/empty current'
   ```
6. **Конфиг** — `deploy/nginx.conf` в `/etc/nginx/sites-available/iskra-web`, затем:
   ```sh
   ln -s ../sites-available/iskra-web /etc/nginx/sites-enabled/iskra-web
   rm /etc/nginx/sites-enabled/default
   nginx -t && nginx -s reload
   ```

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
/srv/iskra-web/releases/<коммит>/site/          dist/ без _headers и headers.nginx
/srv/iskra-web/releases/<коммит>/headers.nginx  заголовки из security-headers.ts
/srv/iskra-web/current -> releases/<коммит>
```

CI загружает папку `rsync`'ом, переключает `current` одной ссылкой, проверяет конфиг
`nginx -t` и делает `nginx -s reload`. Не прошла проверка — ссылка возвращается на прежний
релиз, job красная. Хранятся пять последних релизов. Откат руками:

```sh
cd /srv/iskra-web && ln -sfn releases/<коммит> current.new && mv -Tf current.new current
sudo nginx -t && sudo nginx -s reload
```

## Проверить, что доступно из России

Из дата-центров (check-host.net и подобные) открывается всё, даже Cloudflare, — это ничего
не доказывает. Проверять с домашнего провайдера и с мобильного интернета, без VPN.

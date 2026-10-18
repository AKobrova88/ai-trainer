#!/bin/bash
# «ИИ Тренер»: настройка сервера (Ubuntu 22.04 / 24.04). Запускается с компьютера Анастасии файлом server-setup.bat.
# Повторный запуск безопасен: обновляет настройки и сайт, выпускает HTTPS, когда домен уже смотрит на сервер.
#   https://trener-ii.ru/app/      — веб-приложение (папка app репозитория)
#   https://trener-ii.ru/          — камера-тренер; без параметров сама уводит в /app/
# Сайт сам подтягивается из GitHub каждые 2 минуты: публикация по-прежнему через publish-app.bat.
set -euo pipefail
DOMAIN=trener-ii.ru
REPO=https://github.com/akobrova88/ai-trainer.git
SITE=/srv/trener/site
export DEBIAN_FRONTEND=noninteractive
say() { printf '\n=== %s\n' "$*"; }

say "1/6 Программы (nginx, git, certbot)"
apt-get update -q
apt-get install -y -q nginx git certbot python3-certbot-nginx ufw unattended-upgrades curl >/dev/null

say "2/6 Сайт из GitHub"
mkdir -p /srv/trener
if [ -d "$SITE/.git" ]; then
  git -C "$SITE" fetch -q --depth 1 origin main && git -C "$SITE" reset -q --hard origin/main
else
  git clone -q --depth 1 "$REPO" "$SITE"
fi
git -C "$SITE" log -1 --format='последняя публикация: %cd — %s' --date=format:'%d.%m %H:%M'

say "3/6 Автообновление сайта каждые 2 минуты"
cat > /usr/local/bin/trener-update <<'UPD'
#!/bin/sh
cd /srv/trener/site && git fetch -q --depth 1 origin main && git reset -q --hard origin/main
UPD
chmod +x /usr/local/bin/trener-update
cat > /etc/systemd/system/trener-update.service <<'UNIT'
[Unit]
Description=ИИ Тренер: обновить сайт из GitHub
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/local/bin/trener-update
UNIT
cat > /etc/systemd/system/trener-update.timer <<'UNIT'
[Unit]
Description=ИИ Тренер: обновлять сайт каждые 2 минуты
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now trener-update.timer >/dev/null

say "4/6 Веб-сервер nginx"
cat > /etc/nginx/sites-available/trener <<'NGINX'
# тот же вид, что на GitHub Pages: корень — камера (без параметров сама уводит в /app/), /app/ — веб-приложение
map $uri $trener_cache {
    ~^/(app/)?(vendor|models|howto)/                 "public, max-age=2592000";
    ~^/(icon-192|icon-512|apple-touch-icon)\.png$    "public, max-age=604800";
    default                                          "no-cache";
}
server {
    listen 80;
    listen [::]:80;
    server_name trener-ii.ru www.trener-ii.ru;
    charset utf-8;
    absolute_redirect off;
    root /srv/trener/site;
    index index.html;
    add_header Cache-Control $trener_cache always;

    gzip on;
    gzip_types text/css application/javascript application/json application/wasm application/manifest+json image/svg+xml text/plain;

    # служебное из репозитория наружу не отдаётся
    location ~ /\.git { deny all; }
    location ^~ /server/ { deny all; }

    location = /app { return 301 /app/; }
    location / { try_files $uri $uri/ =404; }
}
NGINX
grep -q 'application/wasm' /etc/nginx/mime.types || sed -i 's#^}#    application/wasm wasm;\n}#' /etc/nginx/mime.types
grep -q 'webmanifest' /etc/nginx/mime.types || sed -i 's#^}#    application/manifest+json webmanifest;\n}#' /etc/nginx/mime.types
ln -sf /etc/nginx/sites-available/trener /etc/nginx/sites-enabled/trener
rm -f /etc/nginx/sites-enabled/default
nginx -t -q
systemctl enable --now nginx >/dev/null
systemctl reload nginx

say "5/6 Брандмауэр и автообновления безопасности"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades >/dev/null 2>&1 || true

say "6/6 HTTPS (Let's Encrypt)"
IP=$(curl -s4 --max-time 10 https://ifconfig.me || hostname -I | awk '{print $1}')
dns() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1; exit}'; }
NAMES=()
if [ "$(dns "$DOMAIN")" = "$IP" ]; then NAMES+=(-d "$DOMAIN"); fi
if [ "$(dns "www.$DOMAIN")" = "$IP" ]; then NAMES+=(-d "www.$DOMAIN"); fi
if [ ${#NAMES[@]} -eq 0 ]; then
  echo "Домен $DOMAIN пока не указывает на этот сервер ($IP)."
  echo "Добавь в DNS домена A-записи: @ -> $IP и www -> $IP, подожди 15-60 минут и запусти server-setup.bat ещё раз."
  echo "Пока сайт открывается по адресу http://$IP/"
else
  certbot --nginx -n --agree-tos --register-unsafely-without-email --redirect "${NAMES[@]}" >/dev/null
  echo "HTTPS готов: https://$DOMAIN/  (сертификат продлевается сам)"
fi

say "Готово"
echo "Приложение:  https://$DOMAIN/app/"
echo "Камера:      https://$DOMAIN/"

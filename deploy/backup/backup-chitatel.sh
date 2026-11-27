#!/bin/sh
# Ежедневная копия базы Читателя (27.11.2026).
#
# 1. mongodump из контейнера chitatel-mongodb → ~/backups/chitatel-ГГГГ-ММ-ДД.gz
# 2. на сервере хранятся 7 последних копий;
# 3. копия уходит на Google Диск через rclone в зашифрованный remote «gcrypt»
#    (rclone crypt поверх «gdrive», доступ drive.file — только свои файлы),
#    там хранятся 30 дней.
#
# Запуск из cron root (нужен docker exec без пароля; rclone настроен под root),
# см. deploy/backup/README.md:
#   30 2 * * * /home/deploy/chitatel/Chitatel_app/deploy/backup/backup-chitatel.sh >> /home/deploy/backups/backup.log 2>&1
#
# sh, а не bash: на сервере /bin/sh = dash, поэтому без ${VAR/a/b}.
set -eu

ENV_FILE=/home/deploy/chitatel/Chitatel_app/server/.env
DIR=/home/deploy/backups
KEEP_LOCAL=7
KEEP_REMOTE_DAYS=30
REMOTE=gcrypt:

mkdir -p "$DIR"
STAMP=$(date +%F)
FILE="$DIR/chitatel-$STAMP.gz"

# Адрес базы из .env; внутри контейнера Mongo слушает 27017, снаружи 27018.
URI=$(grep '^MONGO_URI=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | sed 's/27018/27017/')

echo "$(date '+%F %T') начало"
docker exec chitatel-mongodb mongodump --uri="$URI" --archive --gzip --quiet > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
SIZE=$(stat -c %s "$FILE")
if [ "$SIZE" -lt 100000 ]; then
  echo "$(date '+%F %T') ОШИБКА: копия подозрительно маленькая ($SIZE байт)"
  exit 1
fi
echo "$(date '+%F %T') копия $FILE, $SIZE байт"

# Локально — только последние KEEP_LOCAL.
ls -1t "$DIR"/chitatel-*.gz | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -f

# На Google Диск (зашифровано), старше KEEP_REMOTE_DAYS — удалить.
rclone copy "$FILE" "$REMOTE" --quiet
rclone delete "$REMOTE" --min-age "${KEEP_REMOTE_DAYS}d" --quiet
echo "$(date '+%F %T') отправлено на Google Диск"

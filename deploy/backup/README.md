# Ежедневная копия базы (27.11.2026)

Скрипт `backup-chitatel.sh`: копия базы каждую ночь, 7 последних на сервере,
30 дней на Google Диске Гиорги. На Диск копия уходит зашифрованной
(rclone crypt): без пароля шифрования её не прочитать. Доступ rclone к Диску —
`drive.file`: он видит только файлы, которые сам загрузил.

## Настройка (один раз)

**На компьютере (Windows, PowerShell):**
```
winget install Rclone.Rclone
rclone authorize "drive" "eyJzY29wZSI6ImRyaXZlLmZpbGUifQ"
```
Откроется браузер: войти в Google, разрешить доступ. В PowerShell появится
строка вида `{"access_token":...}` — это токен, его вставляем на сервере
(в переписку не отправлять).

**На сервере (под deploy):**
```
sudo apt install -y rclone
sudo rclone config create gdrive drive scope drive.file token 'ТОКЕН_ИЗ_POWERSHELL'
P=$(openssl rand -base64 24); echo "Пароль шифрования копий: $P"
sudo rclone config create gcrypt crypt remote gdrive:chitatel-backups password "$(rclone obscure "$P")"
```
Пароль шифрования сохранить в менеджер паролей Гиорги и передать Анне. Без
него копии не восстановить.

**Проверка и расписание:**
```
sudo /home/deploy/chitatel/Chitatel_app/deploy/backup/backup-chitatel.sh
sudo rclone ls gcrypt:
(sudo crontab -l 2>/dev/null; echo "30 2 * * * /home/deploy/chitatel/Chitatel_app/deploy/backup/backup-chitatel.sh >> /home/deploy/backups/backup.log 2>&1") | sudo crontab -
```
02:30 по времени сервера (CET) = 05:30 по Тбилиси.

## Восстановление
```
sudo rclone copy gcrypt:chitatel-ГГГГ-ММ-ДД.gz /tmp/
URI=$(grep '^MONGO_URI=' /home/deploy/chitatel/Chitatel_app/server/.env | cut -d= -f2- | tr -d '"' | sed 's/27018/27017/')
sudo docker exec -i chitatel-mongodb mongorestore --uri="$URI" --archive --gzip --drop < /tmp/chitatel-ГГГГ-ММ-ДД.gz
```
`--drop` заменяет текущие данные копией — только при реальном восстановлении.

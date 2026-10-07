# Backups y restauración

El servicio `backup` (imagen `prodrigestivill/postgres-backup-local`) ejecuta `pg_dump` según `BACKUP_SCHEDULE` y guarda archivos `.sql.gz` en el volumen `backups`:

- `/backups/daily`, `/backups/weekly`, `/backups/monthly`: copias con rotación (`BACKUP_KEEP_*`).
- `/backups/last/<db>-latest.sql.gz`: la copia más reciente.

## Ver las copias

```bash
docker compose exec backup ls -lh /backups/daily /backups/last
```

## Forzar una copia ahora

```bash
docker compose exec backup /backup.sh
```

## Restaurar la copia más reciente

```bash
docker compose stop api web
docker compose exec -T db psql -U finanzas -d finanzas -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker compose exec -T backup zcat /backups/last/finanzas-latest.sql.gz | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U finanzas -d finanzas
docker compose start api web
```

Reemplaza `finanzas` (usuario, base y nombre del archivo) si cambiaste `POSTGRES_USER` o `POSTGRES_DB`. Usa `-T` en los comandos con tubería: sin él, una TTY puede convertir `\n` en `\r\n` y corromper el volcado.

Para restaurar otra fecha, cambia la ruta por el archivo de `/backups/daily/…`.

## Copia fuera del servidor (recomendado)

Copia periódicamente el volumen a otro lugar, por ejemplo con `rclone` hacia S3, Google Drive o Backblaze, o descarga el archivo:

```bash
docker compose cp backup:/backups/last/finanzas-latest.sql.gz ./finanzas-$(date +%F).sql.gz
```

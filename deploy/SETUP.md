# ChoirBox — Neue Server-Instanz aufsetzen

Anleitung zum Einrichten einer neuen ChoirBox-Instanz auf einem bestehenden Linux-Server (z.B. zweite Dev-/Staging-Instanz auf derselben Maschine).

## Voraussetzungen

Auf dem Server muessen installiert sein:
- Python 3.13 + venv
- Node.js 22 + npm
- FFmpeg (Audio-Konvertierung)

## 1. Port waehlen

Jede Instanz braucht einen eigenen Port. Bestehende Belegung:

| Instanz | Port | Verzeichnis |
|---------|------|-------------|
| Dev | 8002 | `/home/joerg/choirbox-dev` |
| Staging | 8001 | `/home/joerg/choirbox` |
| Prod | 8001 | `/home/choirbox/choirbox` (Hetzner) |

Naechster freier Port: **8003**

## 2. Verzeichnis und venv anlegen

```bash
ssh joerg@192.168.178.50

mkdir -p /home/joerg/choirbox-INSTANZNAME
python3 -m venv /home/joerg/choirbox-INSTANZNAME/venv
```

## 3. .env erstellen

Von einer bestehenden Instanz kopieren und Port anpassen:

```bash
cp /home/joerg/choirbox/.env /home/joerg/choirbox-INSTANZNAME/.env
```

In der `.env` den Port aendern (optional, wird auch ueber systemd gesetzt):

```
PORT=NEUER_PORT
HOST=0.0.0.0
```

**Hinweis:** `DROPBOX_REDIRECT_URI` ist fuer lokale Instanzen irrelevant — der Dropbox-Token wird aus einer bestehenden DB kopiert (siehe Schritt 7).

## 4. systemd Service anlegen

Service-Datei als Template (`deploy/choirbox-dev.service` im Repo) kopieren und anpassen:

```bash
# Lokal: Service-Datei per SCP auf den Server kopieren
scp deploy/choirbox-dev.service joerg@192.168.178.50:/tmp/choirbox-INSTANZNAME.service
```

Auf dem Server die Datei anpassen (Port + Verzeichnis):

```bash
sudo cp /tmp/choirbox-INSTANZNAME.service /etc/systemd/system/choirbox-INSTANZNAME.service
sudo nano /etc/systemd/system/choirbox-INSTANZNAME.service
```

Wichtige Felder anpassen:

```ini
[Unit]
Description=ChoirBox INSTANZNAME

[Service]
WorkingDirectory=/home/joerg/choirbox-INSTANZNAME
Environment=PORT=NEUER_PORT
ExecStart=/home/joerg/choirbox-INSTANZNAME/venv/bin/python run.py
```

Dann aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable choirbox-INSTANZNAME
```

## 5. sudoers fuer passwortlosen Restart

Damit `deploy.sh` den Service ohne Passwort-Abfrage neustarten kann, muss der Service in `/etc/sudoers.d/joerg` eingetragen sein:

```bash
# Bestehende Eintraege anzeigen
sudo cat /etc/sudoers.d/joerg
```

Neuen Service anhaengen (alle Eintraege in einer Zeile, kommasepariert):

```bash
echo 'joerg ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart choirbox, /usr/bin/systemctl restart choirbox-dev, /usr/bin/systemctl restart choirbox-INSTANZNAME, /usr/bin/systemctl stop choirbox, /usr/bin/systemctl stop choirbox-dev, /usr/bin/systemctl stop choirbox-INSTANZNAME, /usr/bin/systemctl start choirbox, /usr/bin/systemctl start choirbox-dev, /usr/bin/systemctl start choirbox-INSTANZNAME' > /tmp/joerg-sudoers
sudo cp /tmp/joerg-sudoers /etc/sudoers.d/joerg
sudo chmod 440 /etc/sudoers.d/joerg
sudo visudo -c -f /etc/sudoers.d/joerg   # Muss "parsed OK" zeigen
```

## 6. Firewall-Port oeffnen

```bash
sudo ufw allow NEUER_PORT/tcp
```

## 7. Dropbox-Token kopieren

Dropbox erlaubt keine `http://`-Redirect-URIs (ausser `localhost`). Statt OAuth erneut durchzufuehren, wird der Refresh-Token aus einer bestehenden Instanz kopiert.

Erster Deploy ausfuehren (damit die DB und Tabellen existieren):

```bash
# Lokal:
./deploy.sh INSTANZNAME
```

Dann Token kopieren — auf dem Server:

```bash
cd /home/joerg/choirbox-INSTANZNAME
source venv/bin/activate
python3 -c "
from backend.database import engine
from sqlmodel import Session
from backend.models.app_settings import AppSettings

# Token aus Staging lesen
import sqlalchemy
staging_engine = sqlalchemy.create_engine('sqlite:///home/joerg/choirbox/choirbox.db')
with Session(staging_engine) as src:
    source = src.get(AppSettings, 1)

# In neue Instanz schreiben
with Session(engine) as s:
    settings = s.get(AppSettings, 1)
    settings.dropbox_refresh_token = source.dropbox_refresh_token
    settings.dropbox_account_id = source.dropbox_account_id
    settings.dropbox_account_email = source.dropbox_account_email
    settings.dropbox_connected_at = source.dropbox_connected_at
    s.add(settings)
    s.commit()
    print('Dropbox Token kopiert')
"
```

Service neustarten:

```bash
sudo systemctl restart choirbox-INSTANZNAME
```

## 8. deploy.sh anpassen

In `deploy.sh` die neue Instanz eintragen:

```bash
# --- Server-Konfigurationen ---
INSTANZNAME_SERVER="joerg@192.168.178.50"
INSTANZNAME_DIR="/home/joerg/choirbox-INSTANZNAME"
INSTANZNAME_URL="http://192.168.178.50:NEUER_PORT"
INSTANZNAME_RESTART="sudo systemctl restart choirbox-INSTANZNAME"
```

Und einen neuen `case`-Block hinzufuegen:

```bash
INSTANZNAME)
  echo -e "${BOLD}Deploy -> INSTANZNAME${NC}"
  echo ""
  deploy_server "$INSTANZNAME_SERVER" "$INSTANZNAME_DIR" "$INSTANZNAME_URL" "INSTANZNAME" \
    "ssh -t $INSTANZNAME_SERVER '$INSTANZNAME_RESTART'" \
    "ssh $INSTANZNAME_SERVER 'curl -s -o /dev/null -w \"%{http_code}\" --connect-timeout 5 http://localhost:NEUER_PORT/'"
  ;;
```

## 9. Verifizieren

```bash
# Deploy ausfuehren
./deploy.sh INSTANZNAME

# Im Browser oeffnen
open http://192.168.178.50:NEUER_PORT
```

## Checkliste

- [ ] Verzeichnis + venv angelegt
- [ ] .env kopiert und angepasst
- [ ] systemd Service angelegt und aktiviert
- [ ] sudoers aktualisiert (`visudo -c` geprueft)
- [ ] Firewall-Port geoeffnet
- [ ] Erster Deploy ausgefuehrt
- [ ] Dropbox-Token kopiert
- [ ] deploy.sh angepasst
- [ ] App im Browser erreichbar

# ChoirBox — Hetzner Deployment

## Server-Daten

| Eigenschaft | Wert |
|-------------|------|
| **URL** | https://choirbox.duckdns.org |
| **Hetzner Projekt** | Default (ID: 13940390) |
| **Servername** | choirbox |
| **Typ** | CX23 (Cost-Optimized, Shared) |
| **vCPUs** | 2 (Intel/AMD) |
| **RAM** | 4 GB |
| **SSD** | 40 GB |
| **Standort** | Helsinki (eu-central) |
| **OS** | Ubuntu 24.04 |
| **Öffentliche IPv4** | 204.168.218.188 |
| **Domain** | choirbox.duckdns.org (DuckDNS, kostenlos) |
| **SSL** | Let's Encrypt (auto-renew, läuft bis 24.06.2026) |
| **Kosten** | 4,15 €/mo (Server 3,56 € + IPv4 0,60 €) |
| **Abrechnung** | Stündlich, keine Kündigungsfrist |

## SSH-Zugang

```bash
# Als root
ssh root@204.168.218.188

# Als App-User
ssh choirbox@204.168.218.188

# SSH-Key liegt lokal unter:
# Private Key: ~/.ssh/id_ed25519
# Public Key:  ~/.ssh/id_ed25519.pub
```

## DNS (DuckDNS)

- **Account:** packmanne@googlemail.com (Google Login)
- **Domain:** choirbox.duckdns.org
- **Token:** 95d6c47a-ad7d-4e9b-b15f-840c0f4b0cc2
- **Dashboard:** https://www.duckdns.org

IP manuell aktualisieren (falls Server-IP sich ändert):
```bash
curl "https://www.duckdns.org/update?domains=choirbox&token=95d6c47a-ad7d-4e9b-b15f-840c0f4b0cc2&ip=NEUE_IP"
```

## Dropbox OAuth

- **Redirect URI (Production):** `https://choirbox.duckdns.org/api/dropbox/callback`
- **Redirect URI (Lokal):** `http://localhost:8001/api/dropbox/callback`
- **Dropbox Developer Console:** https://www.dropbox.com/developers/apps

Beide URIs müssen in der Dropbox App unter OAuth 2 > Redirect URIs eingetragen sein.

## Installierte Software

| Software | Version |
|----------|---------|
| Ubuntu | 24.04.3 LTS |
| Python | 3.13.12 |
| Node.js | 22.22.2 |
| npm | 10.9.7 |
| Nginx | 1.24.0 |
| Certbot | (Let's Encrypt) |

## Verzeichnisstruktur auf dem Server

```
/home/choirbox/choirbox/     # App-Verzeichnis
├── .env                     # Konfiguration (Secrets, Dropbox-Keys)
├── run.py                   # Entry Point
├── venv/                    # Python Virtual Environment
├── frontend/                # React Source
├── static/react/            # React Production Build
├── backend/                 # FastAPI Backend
└── choirbox.db              # SQLite Datenbank
```

## Deployment (aktuell: scp/rsync)

```bash
# Vom lokalen Rechner aus:
rsync -avz \
  --exclude 'node_modules' \
  --exclude 'venv' \
  --exclude '.git' \
  --exclude '*.db' \
  --exclude '.env' \
  --exclude '__pycache__' \
  --exclude 'static/react' \
  /Users/jregener/Documents/Git/choirbox/ \
  choirbox@204.168.218.188:~/choirbox/

# Auf dem Server: Frontend neu bauen + App neu starten
ssh choirbox@204.168.218.188 "cd ~/choirbox/frontend && npm install && npm run build"
ssh root@204.168.218.188 "systemctl restart choirbox"
```

## Systemd Service

Service-Datei: `/etc/systemd/system/choirbox.service`

```ini
[Unit]
Description=ChoirBox FastAPI App
After=network.target

[Service]
User=choirbox
WorkingDirectory=/home/choirbox/choirbox
ExecStart=/home/choirbox/choirbox/venv/bin/python run.py
Restart=always
RestartSec=5
Environment=PATH=/home/choirbox/choirbox/venv/bin:/usr/bin

[Install]
WantedBy=multi-user.target
```

## Nginx-Konfiguration

Datei: `/etc/nginx/sites-available/choirbox`

Certbot hat die Config automatisch auf HTTPS umgestellt mit Redirect von HTTP -> HTTPS.

## Verwaltung

```bash
# Server-Status prüfen
sudo systemctl status choirbox

# Logs anzeigen
sudo journalctl -u choirbox -f

# App neu starten
sudo systemctl restart choirbox

# SSL-Zertifikat manuell erneuern (normalerweise automatisch)
sudo certbot renew

# Firewall-Status
sudo ufw status
```

## Firewall (ufw)

| Port | Dienst |
|------|--------|
| 22/tcp | SSH |
| 80/tcp | HTTP (Redirect -> HTTPS) |
| 443/tcp | HTTPS |

## Hetzner Console

- **Login:** https://console.hetzner.cloud
- **Server löschen:** Console > Server > choirbox > Löschen (Abrechnung stoppt sofort)
- **Backups aktivieren:** Console > Server > choirbox > Backups (+0,71 €/mo)

## Server von Grund auf neu einrichten

Falls du den Server neu aufsetzen musst, hier die Reihenfolge:

1. System-Update: `apt update && apt upgrade -y`
2. User anlegen: `adduser choirbox && usermod -aG sudo choirbox`
3. SSH-Key kopieren (siehe SSH-Zugang)
4. Firewall: `ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable`
5. Python 3.13: `add-apt-repository ppa:deadsnakes/ppa -y && apt install python3.13 python3.13-venv python3.13-dev -y`
6. Node.js 22: `curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install nodejs -y`
7. Nginx + Certbot: `apt install nginx certbot python3-certbot-nginx -y`
8. App deployen (siehe Deployment-Sektion)
9. Systemd Service einrichten
10. Nginx konfigurieren + `certbot --nginx -d choirbox.duckdns.org`

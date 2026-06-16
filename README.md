# WA Bot Assistant (@aii)

Bot WhatsApp untuk grup yang bisa mencatat, manage task ClickUp, dan bales otomatis kalau di-mention `@aii`.

## Arsitektur

```
WhatsApp ←→ bridge.js (Node.js, always-on)
                ↕ (inbox.json / outbox.json)
            wa_processor.py (Python, cron job tiap 1-2 menit)
```

- **bridge.js** — Listener WA via Puppeteer + whatsapp-web.js. Nangkep pesan yang mention `@aii` di grup, tulis ke `inbox.json`. Polling `outbox.json` tiap 3 detik buat kirim reply.
- **wa_processor.py** — Baca inbox, proses command, tulis reply ke outbox. Dijalankan via cron job.

## Prerequisites

- **Node.js** >= 18
- **Python** >= 3.8
- **Chromium** / Google Chrome (untuk Puppeteer)
- **tmux** (opsional, buat jalanin bridge di background)

## Install

### 1. Clone & Install Dependencies

```bash
git clone <repo-url>
cd waBotAssistant
npm install
```

### 2. Setup Chromium Path

Bridge butuh path ke Chromium. Set environment variable:

```bash
export CHROME_PATH="/path/to/chromium"
```

Contoh lokasi umum:
- Linux: `/usr/bin/chromium-browser` atau `/usr/bin/google-chrome`
- WSL + Playwright: `~/.cache/ms-playwright/chromium-XXXX/chrome-linux64/chrome`
- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

Kalau gak di-set, default-nya pakai path dari Hermes profile.

### 3. Setup Queue Directory

Buat folder queue (otomatis dibuat pas bridge pertama kali jalan):

```bash
mkdir -p ~/.hermes/profiles/sekkha_puggala/wa_queue
```

### 4. Setup Config (Opsional — untuk ClickUp)

Buat file `~/.hermes/profiles/sekkha_puggala/wa_queue/config.json`:

```json
{
  "clickup_token": "pk_YOUR_TOKEN_HERE",
  "clickup_team_id": "YOUR_TEAM_ID",
  "bot_name": "@aii"
}
```

## Jalanin Bot

### Start Bridge (WA Listener)

```bash
node bridge.js
```

Atau pakai tmux biar jalan di background:

```bash
./start_bridge.sh
```

**Pertama kali jalan:** QR code muncul di terminal. Scan pakai WA → ⋮ (3 titik) → Linked Devices → Link a Device.

Setelah scan berhasil, session disimpan di `.wwebjs_auth/` dan gak perlu scan ulang (kecuali expired ~14 hari).

### Start Processor (Cron Job)

Tambahkan cron job:

```bash
crontab -e
```

Tambah baris:

```
*/2 * * * * cd /path/to/waBotAssistant && python3 wa_processor.py >> /tmp/wa_processor.log 2>&1
```

Atau jalanin manual buat testing:

```bash
python3 wa_processor.py
```

## Perintah Bot

Semua perintah dipanggil dengan mention `@aii` di grup:

| Perintah | Fungsi |
|----------|--------|
| `@aii help` | Lihat daftar perintah |
| `@aii catet [pesan]` | Catat informasi ke notes grup |
| `@aii notes` | Baca catatan grup |
| `@aii task Nama \| LIST_ID \| priority` | Buat task ClickUp |
| `@aii cari task [keyword]` | Search task ClickUp |
| `@aii cek task [ID]` | Detail task |
| `@aii update [ID] ke [Status]` | Update status task |
| `@aii reminder [waktu] [pesan]` | Set reminder (coming soon) |
| `@aii ringkas` | Ringkasan chat (coming soon) |

## Troubleshooting

### QR gak muncul
- Cek `CHROME_PATH` udah bener
- Pastikan Chromium bisa jalan di environment lo
- Hapus `.wwebjs_auth/` dan restart bridge

### Bot gak bales
- Pastikan `wa_processor.py` jalan (cek cron atau jalanin manual)
- Cek `~/.hermes/profiles/sekkha_puggala/wa_queue/inbox.json` — ada pesan masuk?
- Cek `outbox.json` — ada reply yang nunggu dikirim?

### Session expired / harus scan ulang
- Hapus folder `.wwebjs_auth/` lalu restart bridge
- Scan QR lagi

### Log "SKIP DM from status@broadcast"
- Normal. Itu WA status updates yang di-filter. Bot cuma proses pesan grup.

## File Structure

```
waBotAssistant/
├── bridge.js          # WA listener (Node.js)
├── wa_processor.py    # Command processor (Python)
├── package.json       # Node dependencies
├── start_bridge.sh    # Helper script buat tmux
├── .gitignore
├── .wwebjs_auth/      # (gitignored) WA session data
├── qr.txt             # (gitignored) Last QR code
└── qr.png             # (gitignored) Last QR image
```

## Known Issues

- Fitur `reminder` masih placeholder, belum ada scheduler
- Fitur `ringkas` (summarize) belum diimplementasi
- Bot hanya proses pesan text, media belum disupport

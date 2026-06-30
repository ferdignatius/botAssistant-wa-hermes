# WA Bot Assistant (Hermes + WA Gateway + Admin Panel)

Aplikasi WhatsApp Bot Assistant yang terintegrasi dengan **Hermes Agent AI** (menggunakan Responses API), database **PostgreSQL via Prisma**, dan dilengkapi dengan **Next.js Web Admin Panel** untuk manajemen user, monitoring log, dan status koneksi WhatsApp.

---

## 🏗️ Arsitektur Sistem & Aliran Data (Flow)

```
                       ┌────────────────────────┐
                       │   WhatsApp Client      │
                       │ (whatsapp-web.js Auth) │
                       └───────────┬────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
          INBOUND (WA → Bot)             OUTBOUND (Hermes → WA)
                    │                             │
                    ▼                             ▼
        ┌───────────────────────┐     ┌───────────────────────┐
        │   Message Listener    │     │    Express Server     │
        │   (client.on msg)     │     │  (POST /send endpoint)│
        └───────────┬───────────┘     └───────────┬───────────┘
                    │                             │
                    ▼                             │
        ┌───────────────────────┐                 │
        │     Filter Layer      │                 │
        │ (DM/tag/bot-loop/#aii)│                 │
        └───────────┬───────────┘                 │
                    │                             │
                    ▼                             │
        ┌───────────────────────┐                 │
        │     Role Resolver     │                 │
        │ (Prisma DB Lookup)    │                 │
        └───────────┬───────────┘                 │
                    │                             │
                    ▼                             │
        ┌───────────────────────┐                 │
        │   In-Memory Queue     │                 │
        │ (Sequential processing│                 │
        │     per Chat ID)      │                 │
        └───────────┬───────────┘                 │
                    │                             │
                    ▼                             ▼
        ┌───────────────────────┐     ┌───────────────────────┐
        │    Hermes Adapter     │     │      Admin Panel      │
        │ (POST to Hermes API   │◄────┤     (Next.js 16)      │
        │ + System Instruction) │     │ (WS Status & REST API)│
        └───────────┬───────────┘     └───────────────────────┘
                    │
                    ▼
          ┌───────────────────┐
          │ Kirim Balasan /   │
          │  Quoted Message   │
          └───────────────────┘
```

### 1. Inbound Message Flow (DM & Group)

Setiap ada pesan masuk, bot akan memprosesnya berdasarkan tipe chat:

#### **A. Direct Message (DM) Flow**
1. Pesan diterima oleh WA Client.
2. Filter checking: Pesan diabaikan jika berasal dari bot itu sendiri (`fromMe`) atau broadcast status (`status@broadcast`).
3. **Role Resolution**: Bot mencari nomor pengirim di tabel `User` (PostgreSQL).
   - **Jika nomor TIDAK terdaftar**: Chat langsung **didrop** (diabaikan sepenuhnya, tidak ada akses guest).
   - **Jika nomor terdaftar**: Mendapatkan role (`owner` atau `member`).
4. Memasukkan pemrosesan ke **In-memory Queue** berdasarkan `chat_id` agar pesan diproses berurutan (mencegah double reply).
5. Bot memicu indikator mengetik (`sendStateTyping`) secara otomatis.
6. Bot mengirim request ke API Hermes dengan payload yang menyertakan data pengirim, tipe chat, role pengirim, dan system prompt yang mendikte batasan role.
7. Setelah Hermes membalas, bot mengirim pesan balasan ke pengguna dengan behavior delay manusiawi (1.5s - 4s) dan membagi pesan jika melebihi 2000 karakter.
8. Menyimpan percakapan ke tabel `ActivityLog` di database.

#### **B. Group Chat Flow**
1. Pesan diterima oleh WA Client.
2. Filter checking: Pesan diabaikan jika berasal dari bot itu sendiri (`fromMe`).
3. Bot memeriksa apakah pesan mengandung tag `#aii` (case-insensitive). Jika tidak, pesan didrop.
4. Bot membersihkan tag `#aii` dari isi pesan sebelum dikirim ke Hermes.
5. **Role Resolution**: Bot mencari nomor pengirim di database. Jika pengirim tidak terdaftar di DB, pesan langsung didrop.
6. Memasukkan pemrosesan ke antrean (`enqueue`).
7. Bot memicu indikator mengetik, menyusun instruksi context (termasuk quoted message jika membalas pesan lain).
8. Mengirim data ke Hermes.
9. Setelah menerima jawaban, bot mengirimkannya sebagai **quoted reply** ke pengirim asli dalam grup.
10. Menyimpan percakapan ke tabel `ActivityLog`.

---

### 2. Outbound Message Flow (Push Notification / Reminder)

1. Hermes Agent memutuskan untuk mengirim pesan terjadwal atau notifikasi.
2. Hermes mengirim request `POST` ke gateway di endpoint `/send`.
   - Header: `x-hermes-secret` wajib cocok dengan configuration secret.
   - Body: `{ chat_id, message }`
3. Gateway memvalidasi token rahasia tersebut.
4. Gateway mengirimkan pesan ke WhatsApp menggunakan `client.sendMessage(chat_id, message)`.

---

## 🔑 Manajemen Peran & Hak Akses (Access Rights / RBAC)

Sistem menggunakan hak akses berbasis database PostgreSQL. Terdapat dua role utama yang dikirimkan ke Hermes untuk ditegakkan melalui system instruction:

### 👑 1. **OWNER** (Akses Penuh / Full Access)
* **Kewenangan**: Memiliki kendali mutlak atas bot dan server.
* **Fitur**:
  - Boleh melakukan semua perintah tanpa batas.
  - Boleh mengubah konfigurasi agent secara realtime (system prompt, kepribadian, behavior).
  - Boleh meminta agent melupakan instruksi sebelumnya (override system).
  - Boleh melakukan operasi CRUD ke seluruh data.
  - Memiliki akses penuh ke seluruh tools (web search, image generation, terminal, file system, execution command, dll).

### 👥 2. **MEMBER** (Akses Terbatas / Limited Access)
* **Kewenangan**: Hanya diizinkan untuk interaksi umum dan penggunaan tools dasar.
* **Fitur**:
  - Boleh chat biasa (diskusi, tanya-jawab).
  - Boleh menggunakan tools umum seperti pencarian web (`web search`), pembuatan gambar (`image generation`), dan teks-ke-suara (`tts`).
  - **DILARANG** mengubah konfigurasi agent, kepribadian, atau memodifikasi system prompt.
  - **DILARANG** mengakses filesystem, terminal, atau menjalankan shell command di server.
  - **DILARANG** mengunduh, menginstal, atau memodifikasi file apa pun di server.
  - **Pencegahan**: Prompt sistem secara ketat menginstruksikan Hermes untuk menolak perintah sensitif dari member secara sopan, dan aturan ini kebal terhadap prompt injection.

---

## 🛠️ Fitur Utama Aplikasi

1. **Anti-Ban Human Behavior**: Simulasi delay respons manusiawi (1.5s - 4.0s) sebelum membalas pesan, auto-typing loop, dan split pesan otomatis per baris baru jika melebihi batas karakter agar aman dari deteksi spam WhatsApp.
2. **Sequential Message Queue**: Menggunakan antrean berbasis `Map` per `chat_id` untuk menghindari tabrakan state (race conditions) saat user mengirim pesan beruntun.
3. **Database-Driven Users**: Otorisasi user dinamis (CRUD) langsung dari Admin Panel tanpa perlu restart aplikasi gateway.
4. **WebSocket Real-time Broadcast**: Mengalirkan event status (QR code untuk scan, status koneksi: *connecting, qr, connected, disconnected*) secara langsung ke Admin Panel Web.
5. **Nginx & Docker Ready**: Dilengkapi dengan konfigurasi Docker Compose multiservice (Database, Gateway App, Hermes Agent) dan Nginx reverse proxy.
6. **Automatic Log Pruner**: Menghapus baris tabel log aktivitas (`ActivityLog`) yang berusia lebih dari 30 hari setiap 24 jam secara otomatis untuk menghemat ruang penyimpanan.

---

## 📁 Struktur Folder Proyek

```
waBotAssistant/
├── prisma/
│   ├── schema.prisma         # Definisi skema database PostgreSQL
│   └── seed.ts               # Script seeding untuk membuat akun admin default
├── src/
│   ├── auth/
│   │   └── roles.ts          # Definisi type Role ('owner' | 'member')
│   ├── config/
│   │   └── env.ts            # Loader & validasi environment variables (.env)
│   ├── hermes/
│   │   ├── adapter.ts        # Adapter Responses API & pembentuk prompt instruksi
│   │   └── types.ts          # Type definition untuk request/response Hermes
│   ├── lib/
│   │   └── prisma.ts         # Singleton PrismaClient dengan Postgres Driver Adapter
│   ├── queue/
│   │   └── messageQueue.ts   # Mekanisme sequential queue berbasis Map per chat ID
│   ├── server/
│   │   ├── adminAuth.ts      # JWT Authentication Middleware untuk Express
│   │   ├── adminRouter.ts    # REST Endpoint Admin API (Users, Logs, Status)
│   │   ├── pushEndpoint.ts   # Express server, REST API setup & endpoint /send
│   │   └── wsServer.ts       # WebSocket server untuk broadcast status koneksi
│   └── index.ts              # Entry point utama aplikasi (wiring & loop pruner)
├── wa-admin-panel/           # Dashboard Web Next.js 16 (React, TailwindCSS)
├── tsconfig.json             # Konfigurasi TypeScript global / IDE
├── tsconfig.build.json       # Konfigurasi TypeScript khusus untuk production build
├── docker-compose.yml        # Konfigurasi multi-container Docker
├── Dockerfile                # Instruksi build container WA Gateway (Puppeteer-friendly)
└── README.md                 # Dokumentasi proyek
```

---

## 🚀 Cara Menjalankan Aplikasi

### 1. Prasyarat (Prerequisites)
* Docker dan Docker Compose terinstal di mesin Anda.
* Akun WhatsApp untuk scan QR code.

### 2. Setup Environment Variables
Salin berkas `.env.example` menjadi `.env` di root folder dan sesuaikan nilainya:
```env
DATABASE_URL="postgresql://admin:hermesbosferdi@postgres-db:5432/wagateway?schema=public"
HERMES_API_URL="http://hermes-agent:8689/v1/responses"
HERMES_API_KEY="your-hermes-api-key"
HERMES_SECRET="your-push-secret"
EXPRESS_PORT=4849
JWT_SECRET="your-long-jwt-secret-key"

# Kredensial untuk akun admin awal (seeding)
ADMIN_SEED_USERNAME=admin
ADMIN_SEED_PASSWORD=admin123
```
*Catatan: Jika menggunakan Docker Compose, alamat host database harus menunjuk ke nama service database (`postgres-db`) dan URL Hermes mengarah ke `hermes-agent`.*

---

### 📦 Metode A: Menggunakan Docker Compose (Direkomendasikan untuk Production)

#### 1. Jalankan Seluruh Kontainer
Gunakan Docker Compose untuk membangun dan menjalankan database, agen Hermes, serta WA Gateway secara latar belakang:
```bash
docker compose up -d --build
```
*(Proses migrasi database otomatis dijalankan oleh kontainer `wa-gateway` saat startup).*

#### 2. Jalankan Database Seeding (Membuat Admin Awal)
Setelah kontainer berjalan, eksekusi perintah *seed* di dalam kontainer `wa-gateway` untuk membuat akun admin default:
```bash
docker compose exec wa-gateway npm run db:seed
```

---

### 💻 Metode B: Menjalankan secara Lokal/Manual (Development)

#### 1. Jalankan Database PostgreSQL lokal Anda
Pastikan PostgreSQL lokal Anda menyala dan sesuaikan `DATABASE_URL` di `.env` ke `localhost` (misal: `localhost:5432` / `localhost:5489`).

#### 2. Install Dependensi & Migrasi Database
```bash
# Install dependensi utama
npm install

# Jalankan migrasi Prisma
npx prisma migrate dev

# Jalankan Database Seeding
npm run db:seed
```

#### 3. Jalankan Aplikasi Gateway
```bash
# Jalankan mode development
npm run dev

# Atau compile dan jalankan mode production
npm run build
npm start
```

---

### 🖥️ 3. Jalankan Admin Panel Web (Next.js)
Admin panel berjalan di folder terpisah. Masuk ke direktorinya, instal dependensi, lalu jalankan aplikasinya:
```bash
cd wa-admin-panel
npm install
npm run dev
```
Buka browser di `http://localhost:3000` untuk membuka halaman login, masukkan kredensial admin Anda (`ADMIN_SEED_USERNAME` & `ADMIN_SEED_PASSWORD`), lalu scan QR Code WhatsApp yang tampil di dashboard untuk mengaktifkan bot!

---

## 🔄 Setup CI/CD (GitHub Actions)

Aplikasi ini dilengkapi dengan pipeline CI/CD otomatis pada berkas [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml) yang akan terpicu ketika ada perubahan yang di-push ke branch `production`.

### 1. Konfigurasi Secrets di GitHub
Masuk ke repositori GitHub Anda, buka **Settings > Secrets and variables > Actions**, lalu tambahkan Repository Secrets berikut:

* **Docker Hub (Build & Push)**
  * `DOCKERHUB_USERNAME`: Username akun Docker Hub Anda.
  * `DOCKERHUB_TOKEN`: Personal Access Token (PAT) dari Docker Hub Anda.
* **VPS Deploy (SSH)**
  * `SSH_HOST`: Alamat IP Publik atau Domain server VPS Anda.
  * `SSH_USERNAME`: Username SSH server Anda (contoh: `root` atau `ubuntu`).
  * `SSH_KEY`: Private Key SSH Anda (isi dari berkas `id_rsa`).
  * `SSH_PORT`: Port SSH server Anda (default: `22` jika tidak didefinisikan).

### 2. Penyesuaian Path Server
Pastikan Anda telah menyesuaikan direktori kerja proyek di server Anda pada berkas [.github/workflows/deploy.yml](file:///.github/workflows/deploy.yml) baris ke-45:
```yaml
script: |
  cd /path/to/your/project-on-server
```
Ubah `/path/to/your/project-on-server` dengan path direktori folder proyek Anda di VPS tempat berkas `docker-compose.yml` berada.

### 3. Eksekusi
Lakukan push perubahan ke branch `production` untuk memulai alur otomatisasi deployment:
```bash
git push origin production
```
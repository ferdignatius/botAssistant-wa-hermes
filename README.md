# Gateway Wa with Hermes
```
┌─────────────────────────────────────────────────────────┐
│                      WA Number (Bot)                       │
└───────────────────────────┬─────────────────────────────────┘
                            │
                     whatsapp-web.js
                    (session via LocalAuth)
                            │
              ┌─────────────┴──────────────┐
              │                             │
        INBOUND (WA→Hermes)          OUTBOUND (Hermes→WA)
              │                             │
              ▼                             ▼
     ┌─────────────────┐         ┌─────────────────────┐
     │ Message Listener │         │  Express Server      │
     │ (client.on msg)  │         │  POST /send endpoint │
     └────────┬──────────┘         └──────────┬────────────┘
              │                                │
              ▼                                │
     ┌─────────────────┐                       │
     │  Filter Layer    │                       │
     │ (DM/tag/bot-loop)│                       │
     └────────┬──────────┘                       │
              │                                │
              ▼                                │
     ┌─────────────────┐                       │
     │  Role Resolver   │                       │
     │  (flat config)   │                       │
     └────────┬──────────┘                       │
              │                                │
              ▼                                │
     ┌─────────────────┐                       │
     │  In-memory Queue │                       │
     │  (per chat_id)   │                       │
     └────────┬──────────┘                       │
              │                                │
              ▼                                │
     ┌─────────────────┐                       │
     │  Hermes Adapter  │                       │
     │  (axios POST)    │                       │
     └────────┬──────────┘                       │
              │                                │
              ▼                                │
         Hermes (brain) ◄───────────────────────┘
        (call balik via /send pas mau reminder dll)
              │
              ▼
     ┌─────────────────┐
     │ Response Handler │
     │ (split, reply)   │
     └────────┬──────────┘
              │
              ▼
         Kirim ke WA
```

ada 2 opsi, dm ataupun grup
```
User DM bot
   │
   ▼
isGroup? NO
   │
   ▼
contact.isMe / isStatus? → kalau ya, drop
   │
   ▼
resolveRole(number) → owner/member/guest
   │
   ▼
guest? → reply "belum terdaftar", stop
   │
   ▼
enqueue(chat_id, task)
   │
   ▼
sendStateTyping() + delay 1-2s
   │
   ▼
callHermes({source: "whatsapp", chat_type: "dm", sender, role, message})
   │
   ▼
reply ke user (split kalau >4096 char)
```

```
Pesan masuk di grup
   │
   ▼
botId ada di message.mentionedIds? NO → drop, ga proses apa-apa
   │
  YES
   ▼
sender adalah bot lain? → drop (anti loop)
   │
   ▼
strip mention text ("@Hermes ..." → "...")
   │
   ▼
resolveRole(number) berdasar nomor pengirim
   │
   ▼
isAllowed(role, message)? NO → reply "ga punya akses", stop
   │
  YES
   ▼
enqueue(chat_id, task)
   │
   ▼
typing + delay
   │
   ▼
callHermes({chat_type: "group", chat_name, sender_name, role, message})
   │
   ▼
message.reply() — quoted reply ke pesan yang nge-tag
```

Outbound — Hermes push (reminder dll)
```
Hermes (cron internal dia) decide "saatnya kirim"
   │
   ▼
POST ke Gateway /send
   { chat_id, message }
   header: x-hermes-secret
   │
   ▼
Gateway validasi secret
   │
   ▼
client.sendMessage(chat_id, message)
   │
   ▼
return { success: true }
```

### Struktur folder
```
hermes-wa-gateway/
├── src/
│   ├── wa/
│   │   ├── client.ts        # init whatsapp-web.js + LocalAuth + event QR
│   │   ├── filters.ts        # isGroupTagged(), isBotLoop(), stripMention()
│   │   └── reply.ts          # splitLongMessage(), sendReply()
│   │
│   ├── auth/
│   │   ├── roles.ts          # ROLES config (flat object)
│   │   └── permissions.ts    # resolveRole(), isAllowed()
│   │
│   ├── hermes/
│   │   ├── adapter.ts        # callHermes() — axios POST ke Hermes
│   │   └── types.ts          # HermesPayload, HermesResponse interface
│   │
│   ├── queue/
│   │   └── messageQueue.ts   # enqueue() — Map<chatId, Promise>
│   │
│   ├── server/
│   │   └── pushEndpoint.ts   # Express app, POST /send
│   │
│   ├── config/
│   │   └── env.ts            # load & validate .env vars
│   │
│   └── index.ts              # wiring: start WA client + start Express server
│
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── .gitignore                # wajib ignore .wwebjs_auth/ (session data)
```
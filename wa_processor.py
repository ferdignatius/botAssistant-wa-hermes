#!/usr/bin/env python3
"""
WA Queue Processor — dipanggil tiap ~1-2 menit dari cron job.
Membaca inbox.json, ngirim ke Hermes, nulis balasan ke outbox.json.

Usage: python3 wa_processor.py
"""

import json
import os
import sys
import subprocess
from datetime import datetime

HOME = os.path.expanduser("~")
# Detect if we're running inside Hermes profile (HOME = ~/.hermes/profiles/xxx/home/)
if "/.hermes/profiles/" in HOME:
    HOME = "/home/ferdignatius"
QUEUE_DIR = os.path.join(HOME, ".hermes/profiles/sekkha_puggala/wa_queue")
INBOX = os.path.join(QUEUE_DIR, "inbox.json")
OUTBOX = os.path.join(QUEUE_DIR, "outbox.json")
CONVOS_DIR = os.path.join(QUEUE_DIR, "conversations")
CONFIG_FILE = os.path.join(QUEUE_DIR, "config.json")

os.makedirs(CONVOS_DIR, exist_ok=True)


def read_json(path):
    try:
        with open(path, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


# Load config
CONFIG = read_json(CONFIG_FILE)
CLICKUP_TOKEN = CONFIG.get("clickup_token", "")
CLICKUP_TEAM_ID = CONFIG.get("clickup_team_id", "")
BOT_NAME = CONFIG.get("bot_name", "@aii")

if CLICKUP_TOKEN:
    os.environ["CLICKUP_TOKEN"] = CLICKUP_TOKEN


def get_conversation(chat_id):
    """Get conversation history for a chat"""
    path = os.path.join(CONVOS_DIR, f"{chat_id.replace('/', '_')}.json")
    return read_json(path)


def save_conversation(chat_id, msgs):
    path = os.path.join(CONVOS_DIR, f"{chat_id.replace('/', '_')}.json")
    write_json(path, msgs[-20:])  # keep last 20


def get_or_create_note(chat_id, group_name):
    """Get note file for a group"""
    notes_dir = os.path.join(QUEUE_DIR, "notes")
    os.makedirs(notes_dir, exist_ok=True)
    note_file = os.path.join(notes_dir, f"{chat_id.replace('/', '_')}.md")

    if not os.path.exists(note_file):
        with open(note_file, "w") as f:
            f.write(f"# Notes - {group_name}\n\n")
            f.write(f"Created: {datetime.now().isoformat()}\n")
            f.write("---\n\n")
    return note_file


def append_note(chat_id, group_name, sender, text):
    """Append to group notes"""
    note_file = get_or_create_note(chat_id, group_name)
    with open(note_file, "a") as f:
        f.write(f"\n## {datetime.now().strftime('%Y-%m-%d %H:%M')} — {sender}\n\n")
        f.write(f"{text}\n\n")
    return note_file


def call_clickup(action, *args, **kwargs):
    """Call ClickUp API helper script"""
    script = os.path.join(HOME, ".hermes/profiles/sekkha_puggala/scripts/clickup.py")
    cmd = [sys.executable, script, action] + list(args)

    # Add kwargs as --key=value
    for k, v in kwargs.items():
        if v:
            cmd.append(f"--{k}")
            cmd.append(str(v))

    try:
        env = os.environ.copy()
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, env=env)
        if result.returncode == 0:
            return result.stdout
        else:
            return f"Error: {result.stderr}"
    except subprocess.TimeoutExpired:
        return "Error: ClickUp API timeout"
    except Exception as e:
        return f"Error: {e}"


def process_message(msg):
    """Process a single WhatsApp message and return a reply"""
    body = msg.get("body", "").strip()
    group = msg.get("groupName", "Unknown")
    sender = msg.get("senderName", "Unknown")
    chat_id = msg.get("chatId", "")

    # Remove @aii mention from body
    clean_body = body.replace("@aii", "").replace("@AII", "").replace("@Aii", "").strip()

    if not clean_body:
        return None

    lower = clean_body.lower()

    # ── COMMAND: ClickUp create task ──
    if lower.startswith("task ") or lower.startswith("buat task "):
        task_text = clean_body
        if "buat task " in lower:
            task_text = clean_body.split("buat task ", 1)[1].strip()
        elif "task " in lower:
            task_text = clean_body.split("task ", 1)[1].strip()

        # Parse: "Nama Task | list_id | priority"
        parts = [p.strip() for p in task_text.split("|")]
        name = parts[0]
        list_id = parts[1] if len(parts) > 1 else ""
        priority = parts[2] if len(parts) > 2 else "normal"

        if list_id:
            result = call_clickup("create", list_id, name=name, priority=priority)
            return f"✅ Task dibuat:\n{result}"
        else:
            return (
                f"⚠️ Format: @aii task Nama Task | LIST_ID | priority\n\n"
                f"Contoh: @aii task Design Landing Page | 90123456789 | high"
            )

    # ── COMMAND: Search task ──
    if lower.startswith("cari task ") or lower.startswith("search task "):
        query = clean_body.split(" ", 2)[-1]
        # Need team_id — store default in env or config
        team_id = CLICKUP_TEAM_ID
        if team_id:
            result = call_clickup("search", team_id, query=query)
            return f"🔍 Hasil pencarian:\n{result}"
        else:
            return "⚠️ Set CLICKUP_TEAM_ID dulu: export CLICKUP_TEAM_ID=xxx"

    # ── COMMAND: Get task ──
    if lower.startswith("task id ") or lower.startswith("cek task "):
        task_id = clean_body.split(" ")[-1]
        result = call_clickup("task", task_id)
        return f"📋 Detail task:\n{result}"

    # ── COMMAND: Update task status ──
    if lower.startswith("update ") or lower.startswith("ubah "):
        # "update TASK_ID ke Done" or "ubah TASK_ID jadi In Progress"
        parts = clean_body.split(" ")
        task_id = parts[1]
        status = " ".join(parts[3:]) if len(parts) > 3 else "Done"
        result = call_clickup("update", task_id, status=status)
        return f"🔄 Task diupdate:\n{result}"

    # ── COMMAND: Save note ──
    if lower.startswith("catet ") or lower.startswith("catat ") or lower.startswith("note "):
        note_text = clean_body.split(" ", 1)[1] if " " in clean_body else ""
        if note_text:
            note_file = append_note(chat_id, group, sender, note_text)
            return f"📝 Udah dicatet! ({note_file})"
        else:
            return "⚠️ Format: @aii catet [isi catatan]"

    # ── COMMAND: Read notes ──
    if lower.startswith("baca note") or lower.startswith("notes") or lower.startswith("note apa"):
        note_file = get_or_create_note(chat_id, group)
        try:
            with open(note_file, "r") as f:
                content = f.read()
            # Only return last ~1000 chars
            if len(content) > 1000:
                content = content[-1000:] + "\n\n...(sebelumnya dipotong)"
            return f"📖 Catatan grup:\n{content}"
        except:
            return "Belum ada catatan buat grup ini."

    # ── COMMAND: Reminder ──
    if lower.startswith("reminder ") or lower.startswith("remind ") or lower.startswith("ingetin "):
        # Format: "reminder [waktu] [pesan]"
        # Eg: "reminder besok jam 9 meeting dengan client"
        # We'll put this in the queue for Hermes to process as a cron job
        reminder_text = clean_body.split(" ", 1)[1] if " " in clean_body else ""
        if reminder_text:
            return f"⏰ Request reminder diterima: '{reminder_text}'\nGw bakal bikin cron job pas diproses Hermes."
        else:
            return "⚠️ Format: @aii reminder [waktu] [pesan]\nContoh: @aii reminder besok jam 9 meeting client"

    # ── COMMAND: Summary / ringkasan ──
    if lower.startswith("ringkas") or lower.startswith("summarize") or lower.startswith("summary"):
        return (
            "📊 Fitur ringkasan chat bakal aktif setelah beberapa hari bot jalan "
            "(butuh history chat terkumpul dulu)."
        )

    # ── COMMAND: Help ──
    if lower.startswith("help") or lower.startswith("bantu") or clean_body in ["?", "/help"]:
        return (
            "🤖 *AII - Asisten Grup*\n\n"
            "Perintah yang bisa dipake:\n"
            "• `@aii catet [pesan]` — catat informasi\n"
            "• `@aii notes` — baca catatan grup\n"
            "• `@aii task Nama | LIST_ID | priority` — buat task ClickUp\n"
            "• `@aii cari task [kata kunci]` — cari task\n"
            "• `@aii cek task [ID]` — detail task\n"
            "• `@aii update [ID] ke [Status]` — update status task\n"
            "• `@aii reminder [waktu] [pesan]` — bikin reminder\n"
            "• `@aii ringkas` — ringkasan chat (coming soon)\n"
            "• `@aii help` — ini\n\n"
            "_Gw cuma baca pesan yang mention @aii_\U0001f4cc"
        )

    # ── Default: I don't understand ──
    return (
        f"Halo {sender}! 👋\n"
        f"Maaf, gw gak paham perintahnya. Coba ketik `@aii help` buat lihat daftar perintah."
    )


def main():
    inbox = read_json(INBOX)
    if not inbox:
        print("[PROCESSOR] No new messages")
        return

    print(f"[PROCESSOR] Processing {len(inbox)} messages...")
    outbox = read_json(OUTBOX)
    unprocessed = []

    for msg in inbox:
        reply_text = process_message(msg)
        if reply_text:
            outbox.append({
                "chatId": msg.get("chatId"),
                "text": reply_text,
                "source": msg.get("id"),
                "timestamp": datetime.now().isoformat(),
            })
            print(f"[PROCESSOR] Reply prepared for {msg.get('groupName')}: {reply_text[:60]}...")
        else:
            print(f"[PROCESSOR] No reply needed for message: {msg.get('body', '')[:60]}")
            unprocessed.append(msg)

    write_json(OUTBOX, outbox)
    write_json(INBOX, unprocessed)
    print(f"[PROCESSOR] Done. {len(outbox)} messages in outbox.")


if __name__ == "__main__":
    main()
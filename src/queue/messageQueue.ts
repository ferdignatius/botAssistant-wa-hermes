const queues = new Map<string, Promise<void>>();

export function enqueue(chatId: string, task: () => Promise<void>) {
    const current = queues.get(chatId) || Promise.resolve();

    const next = current.then(task).catch((err) => {
        console.error(`[Queue] error procesing ${chatId}:`, err);
    })

    queues.set(chatId, next);
}
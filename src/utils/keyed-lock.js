const DEFAULT_HOLD_LIMIT_MS = 30000;

class KeyedLock {
    static tails = new Map();

    static async acquire(key, holdLimitMs = DEFAULT_HOLD_LIMIT_MS) {
        const previous = this.tails.get(key) || Promise.resolve();

        let releaseFn;
        const current = new Promise(resolve => { releaseFn = resolve; });
        const tail = previous.then(() => current);
        this.tails.set(key, tail);

        await previous;

        let released = false;
        const timer = setTimeout(() => release(), holdLimitMs);
        timer.unref();

        function release() {
            if (released) return;
            released = true;
            clearTimeout(timer);
            releaseFn();
        }

        tail.then(() => {
            if (this.tails.get(key) === tail) this.tails.delete(key);
        });

        return release;
    }

    static async run(key, fn, holdLimitMs) {
        const release = await this.acquire(key, holdLimitMs);
        try {
            return await fn();
        } finally {
            release();
        }
    }
}

module.exports = KeyedLock;

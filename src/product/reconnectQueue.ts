import {
  RECONNECT_QUEUE_LIMITS,
  type SessionStatus,
} from "../../contracts/domain";

export type QueuedCommand = {
  id: string;
  sessionId: string;
  path: string;
  method: "POST" | "PUT" | "PATCH";
  idempotencyKey: string;
  idempotent: boolean;
  body: string;
  byteLength: number;
  createdAt: number;
  draft?: unknown;
};

export type EnqueueInput = {
  sessionId: string;
  path: string;
  method: "POST" | "PUT" | "PATCH";
  idempotencyKey?: string;
  idempotent: boolean;
  payload: unknown;
  draft?: unknown;
  now?: number;
};

export type EnqueueResult =
  | {
      accepted: true;
      command: QueuedCommand;
      queuedCount: number;
      totalBytes: number;
    }
  | {
      accepted: false;
      reason: "non_idempotent" | "queue_full" | "payload_too_large";
      preservedDraft: unknown;
      queuedCount: number;
      totalBytes: number;
    };

export class BoundedReconnectQueue {
  private items: QueuedCommand[] = [];

  pruneExpired(now = Date.now()): number {
    const before = this.items.length;
    this.items = this.items.filter(
      (item) => now - item.createdAt <= RECONNECT_QUEUE_LIMITS.ttlMs,
    );
    return before - this.items.length;
  }

  get totalBytes(): number {
    return this.items.reduce((sum, item) => sum + item.byteLength, 0);
  }

  get size(): number {
    return this.items.length;
  }

  snapshot(): readonly QueuedCommand[] {
    return [...this.items];
  }

  clear(): void {
    this.items = [];
  }

  enqueue(input: EnqueueInput): EnqueueResult {
    const now = input.now ?? Date.now();
    this.pruneExpired(now);

    if (!input.idempotent || !input.idempotencyKey) {
      return {
        accepted: false,
        reason: "non_idempotent",
        preservedDraft: input.draft ?? input.payload,
        queuedCount: this.items.length,
        totalBytes: this.totalBytes,
      };
    }

    const body = JSON.stringify(input.payload ?? {});
    const byteLength = new TextEncoder().encode(body).byteLength;

    if (byteLength > RECONNECT_QUEUE_LIMITS.maxBytes) {
      return {
        accepted: false,
        reason: "payload_too_large",
        preservedDraft: input.draft ?? input.payload,
        queuedCount: this.items.length,
        totalBytes: this.totalBytes,
      };
    }

    if (
      this.items.length >= RECONNECT_QUEUE_LIMITS.maxCommands ||
      this.totalBytes + byteLength > RECONNECT_QUEUE_LIMITS.maxBytes
    ) {
      return {
        accepted: false,
        reason: "queue_full",
        preservedDraft: input.draft ?? input.payload,
        queuedCount: this.items.length,
        totalBytes: this.totalBytes,
      };
    }

    const command: QueuedCommand = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      path: input.path,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
      idempotent: true,
      body,
      byteLength,
      createdAt: now,
      draft: input.draft ?? input.payload,
    };
    this.items.push(command);
    return {
      accepted: true,
      command,
      queuedCount: this.items.length,
      totalBytes: this.totalBytes,
    };
  }

  async flush(
    sessionStatus: SessionStatus,
    executor: (cmd: QueuedCommand) => Promise<void>,
    now = Date.now(),
  ): Promise<{
    replayed: number;
    droppedAfterEnd: number;
    expired: number;
    failed: number;
  }> {
    const expired = this.pruneExpired(now);
    if (sessionStatus === "ended" || sessionStatus === "reviewed") {
      const droppedAfterEnd = this.items.length;
      this.items = [];
      return { replayed: 0, droppedAfterEnd, expired, failed: 0 };
    }

    let replayed = 0;
    let failed = 0;
    const pending = this.items;
    this.items = [];
    const remaining: QueuedCommand[] = [];
    for (const cmd of pending) {
      try {
        await executor(cmd);
        replayed += 1;
      } catch {
        failed += 1;
        remaining.push(cmd);
      }
    }
    this.items = [...remaining, ...this.items];
    return { replayed, droppedAfterEnd: 0, expired, failed };
  }
}

import { FastifyReply } from 'fastify';
import { EventEmitter } from 'events';

class StreamManager {
  private emitters: Map<string, EventEmitter> = new Map();

  createStream(executionId: string): EventEmitter {
    const emitter = new EventEmitter();
    this.emitters.set(executionId, emitter);
    return emitter;
  }

  getStream(executionId: string): EventEmitter | undefined {
    return this.emitters.get(executionId);
  }

  removeStream(executionId: string) {
    const emitter = this.emitters.get(executionId);
    if (emitter) {
      emitter.removeAllListeners();
      this.emitters.delete(executionId);
    }
  }

  sendEvent(executionId: string, event: string, data: any) {
    const emitter = this.emitters.get(executionId);
    if (emitter) {
      emitter.emit('data', { event, data });
    }
  }

  setupSSE(executionId: string, reply: FastifyReply) {
    const emitter = this.getStream(executionId);
    if (!emitter) {
      reply.status(404).send({ error: `No active stream session found for execution ${executionId}` });
      return;
    }

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    const listener = (event: { event: string; data: any }) => {
      reply.raw.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };

    emitter.on('data', listener);

    // Send initial connected ack
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ executionId, status: 'streaming' })}\n\n`);

    // Setup keepalive ping every 15s
    const pingInterval = setInterval(() => {
      reply.raw.write(': ping\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(pingInterval);
      emitter.off('data', listener);
      this.removeStream(executionId);
    };

    reply.raw.on('close', cleanup);
    reply.raw.on('end', cleanup);
  }
}

export const streamManager = new StreamManager();

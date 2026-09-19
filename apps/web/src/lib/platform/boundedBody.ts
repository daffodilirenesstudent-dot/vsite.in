// Caps how many bytes a request body may deliver, while it streams.
//
// `request.formData()` buffers the whole body before a handler can look at it,
// and a chunked upload declares no Content-Length to check first. Measured on
// the extract path, every uploaded byte costs ~7 bytes of RAM by the time it
// reaches OpenAI, so a single unbounded body is enough to exhaust a 512MB
// instance. Wrapping the stream means the parse fails at the limit instead of
// after the allocation.

export interface BoundedBody {
  /** Same URL, method and headers; the body errors once it passes the limit. */
  request: Request;
  /** True once the body tried to deliver more than the limit. */
  exceeded(): boolean;
}

export function boundBody(request: Request, maxBytes: number): BoundedBody {
  let over = false;
  const source = request.body;
  if (!source) return { request, exceeded: () => false };

  const reader = source.getReader();
  let seen = 0;
  const limited = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
      seen += value.byteLength;
      if (seen > maxBytes) {
        over = true;
        controller.error(new Error('body exceeds limit'));
        // Stop the producer too, so the rest of the upload is never pulled.
        reader.cancel().catch(() => undefined);
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) { return reader.cancel(reason); },
  });

  const init: RequestInit & { duplex: 'half' } = {
    method: request.method,
    headers: request.headers,
    body: limited,
    duplex: 'half',
  };
  return { request: new Request(request.url, init), exceeded: () => over };
}

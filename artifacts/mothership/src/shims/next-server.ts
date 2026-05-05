// Stubs for next/server. These are server-only types in Next.js.
export class NextResponse extends Response {
  static json(data: any, init?: ResponseInit) {
    return new Response(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
  }
  static redirect(url: string | URL, init?: number | ResponseInit) {
    return Response.redirect(url, typeof init === 'number' ? init : 302);
  }
  static next() {
    return new Response(null);
  }
  static rewrite(url: string | URL) {
    return new Response(null, { headers: { 'x-rewrite': String(url) } });
  }
}
export type NextRequest = Request;

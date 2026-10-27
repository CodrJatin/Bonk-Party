// Thin WebSocket wrapper.
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
  }

  on(type, fn) {
    this.handlers[type] = fn;
  }

  connect(timeoutMs = 20000) {
    this.close();
    return new Promise((resolve, reject) => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      let opened = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => { if (!opened) { ws.close(); reject(new Error('timeout')); } }, timeoutMs);
      ws.onopen = () => { opened = true; clearTimeout(timer); resolve(); };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        this.handlers[m.t]?.(m);
      };
      ws.onclose = (e) => {
        clearTimeout(timer);
        if (!opened) { reject(new Error('closed')); return; }
        if (this.ws === ws) { this.ws = null; this.handlers.close?.(e); }
      };
      ws.onerror = () => {};
    });
  }

  get open() {
    return this.ws?.readyState === 1;
  }

  send(o) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    if (ws) { try { ws.close(); } catch { /* ignore */ } }
  }
}

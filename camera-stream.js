/**
 * CameraStream - High-performance WebRTC / MSE / HLS player for go2rtc.
 * Guarantees zero-interaction autoplay on page load by enforcing muted/playsinline policies.
 */
export class CameraStream {
  /**
   * @param {HTMLVideoElement} videoElement 
   * @param {Object} options
   * @param {string} options.serverUrl - Base URL of go2rtc API (e.g., "http://localhost:1984")
   * @param {string} options.streamName - Stream identifier defined in go2rtc.yaml (e.g. "ch01")
   * @param {string} [options.mode="auto"] - "webrtc" | "mse" | "hls" | "auto"
   * @param {boolean} [options.reconnect=true] - Auto-reconnect on disconnect
   * @param {function} [options.onStatus] - Callback for status changes
   */
  constructor(videoElement, options = {}) {
    this.video = videoElement;
    this.serverUrl = (options.serverUrl || `http://${window.location.hostname || 'localhost'}:1984`).replace(/\/+$/, '');
    this.streamName = options.streamName || 'ch01';
    this.mode = options.mode || 'auto';
    this.reconnect = options.reconnect !== false;
    this.onStatus = options.onStatus || (() => {});

    this.pc = null;
    this.ws = null;
    this.reconnectTimer = null;
    this.retryCount = 0;
    this.destroyed = false;

    this.setupVideoElement();
  }

  setupVideoElement() {
    this.video.muted = true;
    this.video.defaultMuted = true;
    this.video.autoplay = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('muted', '');
    this.video.setAttribute('autoplay', '');
  }

  async start() {
    if (this.destroyed) return;
    this.cleanup();
    this.onStatus({ state: 'connecting', stream: this.streamName });

    if (this.mode === 'webrtc' || this.mode === 'auto') {
      try {
        await this.startWebRTC();
        return;
      } catch (err) {
        console.warn(`[CameraStream] WebRTC connection failed for ${this.streamName}, trying MSE fallback:`, err);
        if (this.mode === 'auto') {
          this.startMSE();
          return;
        }
        this.scheduleReconnect();
      }
    } else if (this.mode === 'mse') {
      this.startMSE();
    } else if (this.mode === 'hls') {
      this.startHLS();
    }
  }

  async startWebRTC() {
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    this.pc.addTransceiver('video', { direction: 'recvonly' });
    this.pc.addTransceiver('audio', { direction: 'recvonly' });

    this.pc.ontrack = (event) => {
      if (this.video.srcObject !== event.streams[0]) {
        this.video.srcObject = event.streams[0];
        this.video.play().catch((e) => console.warn('[CameraStream] Autoplay play() rejected:', e));
        this.onStatus({ state: 'playing', mode: 'webrtc', stream: this.streamName });
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        this.onStatus({ state: 'disconnected', stream: this.streamName });
        this.scheduleReconnect();
      }
    };

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    await new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (this.pc.iceGatheringState === 'complete') {
            this.pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        this.pc.addEventListener('icegatheringstatechange', checkState);
        setTimeout(resolve, 1500);
      }
    });

    const url = `${this.serverUrl}/api/webrtc?src=${encodeURIComponent(this.streamName)}`;
    const response = await fetch(url, {
      method: 'POST',
      body: this.pc.localDescription.sdp,
      headers: { 'Content-Type': 'application/sdp' }
    });

    if (!response.ok) {
      throw new Error(`go2rtc WebRTC error: HTTP ${response.status}`);
    }

    const answerSdp = await response.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.retryCount = 0;
  }

  startMSE() {
    if (!('MediaSource' in window)) {
      console.warn('[CameraStream] MSE not supported, falling back to HLS');
      this.startHLS();
      return;
    }

    const wsUrl = `${this.serverUrl.replace(/^http/, 'ws')}/api/ws?src=${encodeURIComponent(this.streamName)}`;
    const ms = new MediaSource();
    this.video.src = URL.createObjectURL(ms);

    ms.addEventListener('sourceopen', () => {
      this.ws = new WebSocket(wsUrl);
      this.ws.binaryType = 'arraybuffer';

      let sb = null;
      const queue = [];

      this.ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          const msg = JSON.parse(event.data);
          if (msg.type === 'mse' && msg.value) {
            sb = ms.addSourceBuffer(msg.value);
            sb.mode = 'segments';
            sb.addEventListener('updateend', () => {
              if (queue.length > 0 && !sb.updating) {
                sb.appendBuffer(queue.shift());
              }
            });
          }
          return;
        }

        if (sb) {
          if (sb.updating || queue.length > 0) {
            queue.push(event.data);
          } else {
            sb.appendBuffer(event.data);
          }
        }
      };

      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ type: 'mse', value: ['video/mp4'] }));
        this.video.play().catch(console.warn);
        this.onStatus({ state: 'playing', mode: 'mse', stream: this.streamName });
      };

      this.ws.onerror = () => this.scheduleReconnect();
      this.ws.onclose = () => this.scheduleReconnect();
    });
  }

  startHLS() {
    const hlsUrl = `${this.serverUrl}/api/stream.m3u8?src=${encodeURIComponent(this.streamName)}`;
    this.video.src = hlsUrl;
    this.video.play().catch(console.warn);
    this.onStatus({ state: 'playing', mode: 'hls', stream: this.streamName });
  }

  scheduleReconnect() {
    if (!this.reconnect || this.destroyed) return;
    this.cleanup();
    const delay = Math.min(1000 * Math.pow(1.5, this.retryCount), 15000);
    this.retryCount++;
    console.log(`[CameraStream] Reconnecting ${this.streamName} in ${delay}ms (attempt ${this.retryCount})`);
    this.reconnectTimer = setTimeout(() => this.start(), delay);
  }

  cleanup() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (_) {}
      this.pc = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.cleanup();
    if (this.video) {
      this.video.srcObject = null;
      this.video.src = '';
    }
  }
}

/**
 * Custom Element <camera-feed src="ch01" server="http://localhost:1984">
 */
export class CameraFeedElement extends HTMLElement {
  connectedCallback() {
    const streamName = this.getAttribute('src') || 'ch01';
    const serverUrl = this.getAttribute('server') || `http://${window.location.hostname || 'localhost'}:1984`;
    const mode = this.getAttribute('mode') || 'auto';

    this.innerHTML = `
      <div class="camera-feed-box" style="position:relative;width:100%;height:100%;background:#000;overflow:hidden;">
        <video autoplay muted playsinline style="width:100%;height:100%;object-fit:cover;display:block;"></video>
        <div class="cam-badge" style="position:absolute;bottom:10px;left:10px;padding:3px 8px;font-family:monospace;font-size:11px;color:#fff;background:rgba(0,0,0,0.65);border-radius:4px;border:1px solid rgba(255,255,255,0.15);pointer-events:none;">Connecting...</div>
        <button class="cam-unmute-btn" style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.65);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;z-index:20;">🔇</button>
      </div>
    `;

    const video = this.querySelector('video');
    const badge = this.querySelector('.cam-badge');
    const unmuteBtn = this.querySelector('.cam-unmute-btn');

    unmuteBtn.onclick = (e) => {
      e.stopPropagation();
      video.muted = !video.muted;
      unmuteBtn.textContent = video.muted ? '🔇' : '🔊';
    };

    this.stream = new CameraStream(video, {
      serverUrl,
      streamName,
      mode,
      onStatus: ({ state, mode }) => {
        if (badge) {
          badge.textContent = `${streamName.toUpperCase()} [${state}${mode ? `:${mode}` : ''}]`;
          badge.style.color = state === 'playing' ? '#4ade80' : '#f87171';
        }
      }
    });

    this.stream.start();
  }

  disconnectedCallback() {
    if (this.stream) {
      this.stream.destroy();
    }
  }
}

if (!customElements.get('camera-feed')) {
  customElements.define('camera-feed', CameraFeedElement);
}

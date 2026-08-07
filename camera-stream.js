/**
 * CameraStream - High-performance WebRTC / MSE / HLS player for go2rtc.
 * Powered by VideoRTC engine with automated fallbacks, reconnection, and UI overlays.
 */
import { VideoRTC } from './video-rtc.js';

export { VideoRTC };

export class CameraStream {
  /**
   * @param {HTMLElement|HTMLVideoElement} targetElement 
   * @param {Object} options
   * @param {string} options.serverUrl - Base URL of go2rtc API (e.g. "http://127.0.0.1:1984")
   * @param {string} options.streamName - Stream identifier (e.g. "ch01")
   * @param {string} [options.mode="webrtc,mse,hls,mjpeg"]
   * @param {function} [options.onStatus] - Callback for status changes
   */
  constructor(targetElement, options = {}) {
    this.target = targetElement;
    this.serverUrl = (options.serverUrl || `http://${window.location.hostname || '127.0.0.1'}:1984`).replace(/\/+$/, '');
    this.streamName = options.streamName || 'ch01';
    this.mode = options.mode || 'webrtc,mse,hls,mjpeg';
    this.onStatus = options.onStatus || (() => {});
    this.videoRtc = null;
    this.destroyed = false;
  }

  start() {
    if (this.destroyed) return;
    this.cleanup();

    const wsProto = this.serverUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = this.serverUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}://${wsHost}/api/ws?src=${encodeURIComponent(this.streamName)}`;

    this.videoRtc = new VideoRTC();
    this.videoRtc.mode = this.mode;
    this.videoRtc.background = true;
    this.videoRtc.src = wsUrl;
    this.videoRtc.style.width = '100%';
    this.videoRtc.style.height = '100%';
    this.videoRtc.style.display = 'block';

    if (this.target.tagName.toLowerCase() === 'video') {
      const parent = this.target.parentElement;
      if (parent) {
        parent.replaceChild(this.videoRtc, this.target);
      }
    } else {
      this.target.innerHTML = '';
      this.target.appendChild(this.videoRtc);
    }

    this.onStatus({ state: 'connecting', stream: this.streamName });

    // Monitor internal video element events
    const checkInterval = setInterval(() => {
      if (this.destroyed || !this.videoRtc) {
        clearInterval(checkInterval);
        return;
      }
      const vid = this.videoRtc.querySelector('video');
      if (vid && vid.readyState >= 2 && !vid.paused) {
        this.onStatus({ state: 'playing', mode: 'live', stream: this.streamName });
      }
    }, 1000);
  }

  cleanup() {
    if (this.videoRtc) {
      try {
        this.videoRtc.disconnectedCallback();
        if (this.videoRtc.parentElement) {
          this.videoRtc.parentElement.removeChild(this.videoRtc);
        }
      } catch (_) {}
      this.videoRtc = null;
    }
  }

  destroy() {
    this.destroyed = true;
    this.cleanup();
  }
}

/**
 * Custom Element <camera-feed src="ch01" server="http://127.0.0.1:1984">
 */
export class CameraFeedElement extends HTMLElement {
  connectedCallback() {
    const streamName = this.getAttribute('src') || 'ch01';
    const serverUrl = this.getAttribute('server') || `http://${window.location.hostname || '127.0.0.1'}:1984`;
    const mode = this.getAttribute('mode') || 'webrtc,mse,hls,mjpeg';

    const wsProto = serverUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = serverUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}://${wsHost}/api/ws?src=${encodeURIComponent(streamName)}`;

    this.innerHTML = `
      <div class="camera-feed-box" style="position:relative;width:100%;height:100%;background:#04060a;overflow:hidden;border-radius:4px;">
        <video-rtc src="${wsUrl}" mode="${mode}" background style="width:100%;height:100%;display:block;object-fit:cover;"></video-rtc>
        <div class="cam-badge" style="position:absolute;bottom:8px;left:8px;padding:2px 6px;font-family:'Chakra Petch',monospace;font-size:10px;font-weight:700;color:#94a3b8;background:rgba(4,6,10,0.85);border-radius:3px;border:1px solid rgba(255,255,255,0.1);pointer-events:none;z-index:10;letter-spacing:0.5px;">
          ${streamName.toUpperCase()} <span class="cam-dot" style="display:inline-block;width:6px;height:6px;background:#f59e0b;border-radius:50%;margin-left:4px;"></span>
        </div>
        <button class="cam-unmute-btn" title="Toggle Audio" style="position:absolute;bottom:8px;right:8px;background:rgba(4,6,10,0.85);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:2px 6px;border-radius:3px;cursor:pointer;font-size:10px;z-index:20;">🔇</button>
      </div>
    `;

    const vRtc = this.querySelector('video-rtc');
    const badge = this.querySelector('.cam-badge');
    const dot = this.querySelector('.cam-dot');
    const unmuteBtn = this.querySelector('.cam-unmute-btn');

    unmuteBtn.onclick = (e) => {
      e.stopPropagation();
      const video = vRtc ? vRtc.querySelector('video') : null;
      if (video) {
        video.muted = !video.muted;
        unmuteBtn.textContent = video.muted ? '🔇' : '🔊';
      }
    };

    // State monitoring
    this.statusTimer = setInterval(() => {
      const video = vRtc ? vRtc.querySelector('video') : null;
      if (video && video.readyState >= 2 && !video.paused) {
        if (dot) dot.style.background = '#10b981';
        if (badge) badge.style.color = '#34d399';
      } else {
        if (dot) dot.style.background = '#f59e0b';
        if (badge) badge.style.color = '#94a3b8';
      }
    }, 1500);
  }

  disconnectedCallback() {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
  }
}

if (!customElements.get('camera-feed')) {
  customElements.define('camera-feed', CameraFeedElement);
}

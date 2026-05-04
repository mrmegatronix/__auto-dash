# AutoDash · Feature Roadmap

## ✅ Implemented
- 254-device subnet grid (1080p optimized)
- Color-coded states (Known/Unknown/Offline/Dead)
- Voice alerts (Web Speech API)
- Edge-blink alerts (Orange/Red)
- Slide-in camera banner (4x RTSP)
- Full 4-cam security view
- Port scan presets with port display
- Grid/List view toggle
- Known device persistence
- SecDash merger (risk levels, PORT_INTEL, vuln presets)
- Device detail sidebar
- known-devices.json registry
- Service/app detection via service-apps.json

## 🔜 Phase 2
| Feature | Priority |
|---|---|
| Wake-on-LAN from sidebar | HIGH |
| Device Grouping / Zones (Office, IoT, Servers) | HIGH |
| Scheduled Auto-Scan (5/15/30 min intervals) | HIGH |
| Export Scan Report (CSV/JSON) | MED |
| MAC Address OUI Lookup | MED |
| Topology Map View | MED |
| Notification Webhooks (Discord/Slack) | MED |
| Multi-Subnet Support | LOW |

## 🧪 Phase 3 — Advanced
- CVE vulnerability cross-reference
- SSL Certificate Inspector
- SNMP Polling for device info
- UPnP Discovery & risk flagging
- Honeypot Detection
- Traffic Anomaly Alerts
- Historical Trend Graphs
- RTSP Stream Health Monitor

## 🏗️ Infrastructure
- Firebase/JSON API backend (replace localStorage)
- Node.js backend for real TCP SYN scans
- PWA Manifest + Service Worker
- Role-Based Access with PIN auth

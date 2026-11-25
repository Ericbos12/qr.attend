import os from 'node:os';

/**
 * Finds the best local LAN IPv4 address (e.g. Wi-Fi / Ethernet) for QR codes when accessed via localhost.
 */
export function getLocalLanIp() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (!Array.isArray(list)) continue;
    for (const addr of list) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      if (addr.address.startsWith('169.254.')) continue;
      const lower = name.toLowerCase();
      const isVirtual = /vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|tailscale|loopback/.test(lower);
      const isWifiOrEth = /wi-?fi|wlan|ethernet|en0|eth0/.test(lower);
      candidates.push({
        address: addr.address,
        priority: isVirtual ? 3 : isWifiOrEth ? 1 : 2,
      });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.address || null;
}

/**
 * Extracts normalized client IP address from an Express request (proxy-aware for hosted deployments).
 */
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw =
    typeof forwarded === 'string' && forwarded.trim()
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || req.ip || '';

  if (raw.startsWith('::ffff:')) {
    return raw.slice(7);
  }
  return raw;
}

/**
 * Computes distance in meters between two WGS84 coordinates using the Haversine formula.
 */
export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

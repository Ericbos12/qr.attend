import os from 'node:os';

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
 * Returns true if the TCP connection itself originated from the local machine (loopback).
 */
export function isLoopbackRequest(req) {
  const remote = req.socket?.remoteAddress || '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

/**
 * Detects non-internal IPv4 LAN addresses on this machine so local QR codes
 * can point phones to the host's LAN IP instead of unreachable "localhost".
 */
export function getLanAddresses() {
  const ifaces = os.networkInterfaces();
  const virtualPattern = /(vethernet|wsl|virtual|vmware|vbox|docker|hyper-v|loopback|teredo|bluetooth)/i;
  const preferredPattern = /(wi-fi|wifi|wlan|ethernet|en0|en1)/i;
  const results = [];

  for (const [name, entries] of Object.entries(ifaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      const isV4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isV4 || entry.internal) continue;
      if (entry.address.startsWith('169.254.')) continue; // link-local apipa
      const isVirtual = virtualPattern.test(name);
      const isPreferred = !isVirtual && preferredPattern.test(name);
      results.push({
        name,
        address: entry.address,
        isVirtual,
        isPreferred,
      });
    }
  }

  results.sort((a, b) => {
    if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return results;
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

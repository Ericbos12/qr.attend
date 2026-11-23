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

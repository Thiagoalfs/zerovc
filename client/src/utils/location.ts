const locationCache = new Map<string, string>();

function isPrivateOrLocalIP(ip: string): boolean {
  if (!ip) return true;
  const clean = ip.replace(/^::ffff:/, '').trim().toLowerCase();
  if (
    clean === '127.0.0.1' ||
    clean === '::1' ||
    clean === 'localhost' ||
    clean === '0.0.0.0'
  ) {
    return true;
  }
  if (
    clean.startsWith('10.') ||
    clean.startsWith('192.168.') ||
    clean.startsWith('fc00:') ||
    clean.startsWith('fe80:')
  ) {
    return true;
  }
  if (clean.startsWith('172.')) {
    const parts = clean.split('.');
    if (parts.length >= 2) {
      const secondOctet = parseInt(parts[1], 10);
      if (secondOctet >= 16 && secondOctet <= 31) {
        return true;
      }
    }
  }
  return false;
}

export async function fetchLocationFromIP(rawIP: string): Promise<string> {
  if (!rawIP || !rawIP.trim()) {
    return 'Localização indisponível';
  }

  const cleanIP = rawIP.replace(/^::ffff:/, '').trim();

  if (isPrivateOrLocalIP(cleanIP)) {
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP === 'localhost') {
      return 'Rede Local (Dispositivo Atual)';
    }
    return 'Rede Local (Privada)';
  }

  if (locationCache.has(cleanIP)) {
    return locationCache.get(cleanIP)!;
  }

  // Try sessionStorage cache
  try {
    const stored = sessionStorage.getItem(`zerovc_geoip_${cleanIP}`);
    if (stored) {
      locationCache.set(cleanIP, stored);
      return stored;
    }
  } catch {}

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    // Primary API: ipwho.is (CORS enabled, HTTPS, rich city/region/country)
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(cleanIP)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.success !== false) {
        const parts = [data.city, data.region, data.country].filter(Boolean);
        if (parts.length > 0) {
          const formatted = parts.join(', ');
          locationCache.set(cleanIP, formatted);
          try {
            sessionStorage.setItem(`zerovc_geoip_${cleanIP}`, formatted);
          } catch {}
          return formatted;
        }
      }
    }
  } catch {
    clearTimeout(timeoutId);
  }

  // Secondary Fallback: freeipapi.com
  const fallbackController = new AbortController();
  const fallbackTimeoutId = setTimeout(() => fallbackController.abort(), 4000);

  try {
    const response = await fetch(`https://freeipapi.com/api/json/${encodeURIComponent(cleanIP)}`, {
      signal: fallbackController.signal,
    });
    clearTimeout(fallbackTimeoutId);

    if (response.ok) {
      const data = await response.json();
      const parts = [data.cityName, data.regionName, data.countryName].filter(
        (p) => p && p !== '-'
      );
      if (parts.length > 0) {
        const formatted = parts.join(', ');
        locationCache.set(cleanIP, formatted);
        try {
          sessionStorage.setItem(`zerovc_geoip_${cleanIP}`, formatted);
        } catch {}
        return formatted;
      }
    }
  } catch {
    clearTimeout(fallbackTimeoutId);
  }

  const fallback = 'Localização indisponível';
  locationCache.set(cleanIP, fallback);
  return fallback;
}

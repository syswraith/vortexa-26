
function isPrivateOrLocal(ip) {
    if (!ip) return true;
    const cleanIp = ip.replace(/^.*:/, "");
    if (ip === "::1" || ip === "localhost" || cleanIp === "127.0.0.1") return true;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(cleanIp)) return true;
    return false;
}

export function extractClientIp(req) {
    if (req.query && typeof req.query.ip === "string" && req.query.ip.trim()) {
        return req.query.ip.trim();
    }
    const xForwardedFor = req.headers && req.headers["x-forwarded-for"];
    if (xForwardedFor) {
        const firstIp = (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor).split(",")[0].trim();
        if (firstIp) return firstIp;
    }
    return req.ip || req.socket?.remoteAddress || null;
}

/**
 * Generate an observation from an Express request
 * using the ipwho.is geolocation API.
 */
export async function generateIpObservation(req) {
    const rawIp = extractClientIp(req);
    const isLocal = isPrivateOrLocal(rawIp);

    // If local/private, query ipwho.is without IP to determine public egress IP, or use rawIp
    const targetUrl = isLocal
        ? "https://ipwho.is/"
        : `https://ipwho.is/${encodeURIComponent(rawIp)}`;

    let geo = null;
    try {
        const response = await fetch(targetUrl);
        if (response.ok) {
            geo = await response.json();
        }
    } catch (err) {
        console.warn("Geolocation fetch error:", err.message);
    }

    const effectiveIp = (geo && geo.success && geo.ip) || rawIp || "127.0.0.1";
    const lookupSuccess = Boolean(
        geo &&
        geo.success &&
        geo.latitude != null &&
        geo.longitude != null &&
        geo.country_code != null
    );

    const latitude = lookupSuccess ? geo.latitude : null;
    const longitude = lookupSuccess ? geo.longitude : null;

    const observation = {
        ip_address: effectiveIp,
        country_code: lookupSuccess ? geo.country_code : null,
        region: lookupSuccess ? geo.region ?? null : null,
        city: lookupSuccess ? geo.city ?? null : null,
        latitude,
        longitude,
        asn: lookupSuccess ? geo.connection?.asn ?? null : null,
        isp: lookupSuccess ? geo.connection?.isp ?? null : null,
        timezone: lookupSuccess ? geo.timezone?.id ?? null : null,
        geo_provider: lookupSuccess ? "ipwho.is" : null,
        geo_lookup_success: lookupSuccess,
        observed_at: new Date().toISOString(),
    };

    return observation;
}


/**
 * Generate an observation from an Express request
 * using the ipwho.is geolocation API.
 */
export async function generateIpObservation(req) {
    console.log("Request IP:", req.ip);
    console.log("Socket IP:", req.socket.remoteAddress);

    const ip = req.ip;

    if (!ip) {
        throw new Error("Unable to determine request IP");
    }

    const response = await fetch(
        `https://ipwho.is/${encodeURIComponent(ip)}`
    );

    if (response.status === 429) {
        throw new Error("Geolocation rate limit exceeded");
    }

    if (!response.ok) {
        throw new Error(`Geolocation API failed: ${response.status}`);
    }

    const geo = await response.json();

    if (!geo.success) {
        throw new Error(
            geo.message || "Geolocation lookup failed"
        );
    }

    const latitude = geo.latitude ?? null;
    const longitude = geo.longitude ?? null;

    const observation = {
        ip_address: ip,
        country_code: geo.country_code ?? null,
        region: geo.region ?? null,
        city: geo.city ?? null,
        latitude,
        longitude,
        asn: geo.connection?.asn ?? null,
        isp: geo.connection?.isp ?? null,
        timezone: geo.timezone?.id ?? null,
        geo_provider: "ipwho.is",
        geo_lookup_success:
            latitude !== null &&
            longitude !== null &&
            geo.country_code != null,
        observed_at: new Date().toISOString(),
    };

    return observation;
}

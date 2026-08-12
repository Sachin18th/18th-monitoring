import type { MetadataRoute } from 'next';

/**
 * Serves /robots.txt.
 *
 * The dashboard is a private, authenticated analytics tool — there is nothing
 * here for a search engine to index, and the hostname is already discoverable
 * through Certificate Transparency logs, so crawlers do find it unprompted.
 * Everything is disallowed.
 *
 * Note this is advisory only: well-behaved crawlers honour it, hostile scanners
 * ignore it. The enforcing measure is the `X-Robots-Tag: noindex` response
 * header set in the nginx config.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                disallow: '/',
            },
        ],
    };
}

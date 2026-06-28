const pool = require('../config/db')

/**
 * Generate an SEO-friendly sitemap.xml from active products and static pages.
 * Cached for 1 hour to reduce DB load.
 */
const getSitemap = async (req, res) => {
  try {
    const { rows: products } = await pool.query(
      `SELECT id, name, updated_at FROM products WHERE is_visible = TRUE AND is_draft = FALSE`
    );

    // Front-end URL (defaults to production if FRONTEND_URL is not provided or if it's localhost)
    let frontendUrl = process.env.FRONTEND_URL || 'https://naseeracollection.com';
    // Clean up trailing slash
    if (frontendUrl.endsWith('/')) {
      frontendUrl = frontendUrl.slice(0, -1);
    }

    // A helper to generate SEO friendly slugs
    const slugify = (text) =>
      text
        .toString()
        .toLowerCase()
        .replace(/\s+/g, '-')       // Replace spaces with -
        .replace(/[^\w-]+/g, '')    // Remove all non-word chars
        .replace(/--+/g, '-')       // Replace multiple - with single -
        .replace(/^-+/, '')         // Trim - from start of text
        .replace(/-+$/, '');        // Trim - from end of text

    // Helper to format dates as YYYY-MM-DD
    const fmtDate = (d) => {
      const dt = new Date(d);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    };

    const today = fmtDate(new Date());

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <!-- Static pages -->
    <url>
        <loc>${frontendUrl}/</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${frontendUrl}/collection</loc>
        <lastmod>${today}</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${frontendUrl}/about</loc>
        <changefreq>monthly</changefreq>
        <priority>0.4</priority>
    </url>
    <url>
        <loc>${frontendUrl}/contact</loc>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>
    <url>
        <loc>${frontendUrl}/shipping</loc>
        <changefreq>monthly</changefreq>
        <priority>0.3</priority>
    </url>
    <url>
        <loc>${frontendUrl}/cart</loc>
        <changefreq>monthly</changefreq>
        <priority>0.2</priority>
    </url>
    <!-- Product pages -->
    ${products.map(p => {
      const slug = slugify(p.name);
      const lastmod = p.updated_at ? fmtDate(p.updated_at) : today;
      return `<url>
        <loc>${frontendUrl}/product/${p.id}/${slug}</loc>
        <lastmod>${lastmod}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
    }).join('\n    ')}
</urlset>`;

    // Cache for 1 hour (3600 seconds)
    res.header('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
};

module.exports = { getSitemap };
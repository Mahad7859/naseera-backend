const pool = require('../config/db')

/**
 * Generate a dynamic sitemap based on active products in the DB.
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

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${frontendUrl}/</loc>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>
    <url>
        <loc>${frontendUrl}/collection</loc>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
    </url>
    <url>
        <loc>${frontendUrl}/contact</loc>
        <changefreq>monthly</changefreq>
        <priority>0.5</priority>
    </url>`;

    products.forEach(p => {
      // Use the new dynamic route format /product/:id/:slug
      const slug = slugify(p.name);
      xml += `
    <url>
        <loc>${frontendUrl}/product/${p.id}/${slug}</loc>
        <lastmod>${new Date(p.updated_at).toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
    });

    xml += `\n</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
};

module.exports = { getSitemap };

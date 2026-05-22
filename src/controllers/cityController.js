const cities = require('../../data/trax_cities.json')

async function getCities(_req, res) {
  try {
    return res.json(cities)
  } catch (error) {
    console.error('Error fetching cities:', error)
    return res.status(500).json({ message: 'Failed to fetch cities.' })
  }
}

module.exports = { getCities }

const cloudinary = require('cloudinary').v2

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

async function uploadImage(req, res) {
  if (!req.file) {
    return res.status(400).json({ message: 'Please choose an image to upload.' })
  }

  // Only allow image mime types
  if (!req.file.mimetype.startsWith('image/')) {
    return res.status(400).json({ message: 'Only image files are allowed.' })
  }

  // 5MB limit check
  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ message: 'Image must be under 5MB.' })
  }

  const b64 = Buffer.from(req.file.buffer).toString('base64')
  const dataURI = `data:${req.file.mimetype};base64,${b64}`

  const result = await cloudinary.uploader.upload(dataURI, {
    folder: 'naseera-collection',
  })

  return res.status(201).json({ imageUrl: result.secure_url })
}

module.exports = { uploadImage }

const axios = require('axios');
const FormData = require('form-data');

// Your Catbox user hash
const CATBOX_USERHASH = '61101e1ef85d3a146d5841cee';

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed' 
    });
  }

  try {
    // Parse multipart form data
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Content-Type must be multipart/form-data'
      });
    }

    // Get the boundary from content-type header
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({
        success: false,
        error: 'Invalid multipart/form-data'
      });
    }

    // Get raw body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Parse the multipart data manually
    const parts = buffer.toString('binary').split(`--${boundary}`);
    let fileBuffer = null;
    let fileName = 'upload';
    let mimeType = 'application/octet-stream';

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        const filenameMatch = part.match(/filename="([^"]+)"/);
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        
        if (filenameMatch) {
          fileName = filenameMatch[1];
        }
        
        if (contentTypeMatch) {
          mimeType = contentTypeMatch[1];
        }

        if (nameMatch && nameMatch[1] === 'file' && filenameMatch) {
          // Extract file data (after double CRLF)
          const fileDataStart = part.indexOf('\r\n\r\n') + 4;
          const fileDataEnd = part.lastIndexOf('\r\n');
          
          if (fileDataStart > 3 && fileDataEnd > fileDataStart) {
            const fileData = part.substring(fileDataStart, fileDataEnd);
            fileBuffer = Buffer.from(fileData, 'binary');
          }
        }
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({
        success: false,
        error: 'No file found in request'
      });
    }

    console.log('Uploading file:', fileName, 'Size:', fileBuffer.length);

    // Create form data for Catbox
    const formData = new FormData();
    formData.append('reqtype', 'fileupload');
    formData.append('userhash', CATBOX_USERHASH);
    formData.append('fileToUpload', fileBuffer, {
      filename: fileName,
      contentType: mimeType
    });

    // Upload to Catbox
    const response = await axios.post('https://catbox.moe/user/api.php', formData, {
      headers: formData.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 300000 // 5 minutes
    });

    const catboxUrl = response.data.trim();
    
    if (!catboxUrl.startsWith('http')) {
      throw new Error('Invalid response from Catbox: ' + catboxUrl);
    }

    console.log('Upload successful:', catboxUrl);

    return res.status(200).json({
      success: true,
      data: {
        url: catboxUrl,
        fileName: fileName,
        size: fileBuffer.length,
        mimeType: mimeType
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      success: false,
      error: 'Upload failed',
      message: error.message
    });
  }
};

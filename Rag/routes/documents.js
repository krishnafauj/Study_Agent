import { Router } from 'express';
import multer from 'multer';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import Folder from '../models/Folder.js';
import Document from '../models/Document.js';
import Chunk from '../models/Chunk.js';
import { uploadToS3, getSignedDownloadUrl, isS3Configured } from '../services/s3.js';
import { getEmbedding, chunkText, isOpenAIConfigured } from '../services/embeddings.js';

const router = Router();

// Multer – store uploaded files in memory for processing
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// GET /api/folders/:folderId/documents – list docs in a folder
router.get('/folders/:folderId/documents', async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const documents = await Document.find({ folderId }).sort({ uploadedAt: -1 });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/folders/:folderId/upload – upload PDF, store in S3, extract + embed
router.post('/folders/:folderId/upload', upload.single('file'), async (req, res) => {
  try {
    const { folderId } = req.params;

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. Upload to S3
    let s3Key = '';
    if (isS3Configured()) {
      s3Key = await uploadToS3(req.file.buffer, req.file.originalname, folder.name);
    } else {
      // Generate a placeholder key if S3 isn't configured
      s3Key = `local/${folder.name}/${Date.now()}_${req.file.originalname}`;
      console.warn('⚠️  S3 not configured – file stored in DB metadata only, not uploaded to cloud.');
    }

    // 2. Extract text from PDF
    let pdfText = '';
    try {
      const pdfData = await pdf(req.file.buffer);
      pdfText = pdfData.text;
    } catch (pdfErr) {
      console.error('PDF parsing error:', pdfErr.message);
      pdfText = '';
    }

    // 3. Save document record
    const document = await Document.create({
      folderId,
      fileName: req.file.originalname,
      s3Key,
      fileSize: req.file.size,
    });

    // 4. Chunk text and generate embeddings
    let totalChunks = 0;
    if (pdfText.trim().length > 0 && isOpenAIConfigured()) {
      const chunks = chunkText(pdfText);
      const chunkDocs = [];

      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await getEmbedding(chunks[i]);
          chunkDocs.push({
            documentId: document._id,
            folderId,
            text: chunks[i],
            embedding,
            chunkIndex: i,
          });
        } catch (embErr) {
          console.error(`Embedding error for chunk ${i}:`, embErr.message);
        }
      }

      if (chunkDocs.length > 0) {
        await Chunk.insertMany(chunkDocs);
        totalChunks = chunkDocs.length;
      }
    } else if (!isOpenAIConfigured()) {
      console.warn('⚠️  OpenAI not configured – skipping embeddings.');
    }

    // Update document with chunk count
    document.totalChunks = totalChunks;
    await document.save();

    res.status(201).json({
      document,
      message: `Uploaded successfully. ${totalChunks} chunks created.`,
      warnings: {
        s3: isS3Configured() ? null : 'S3 not configured – file not uploaded to cloud',
        embeddings: isOpenAIConfigured() ? null : 'OpenAI not configured – no embeddings generated',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/documents/:id/download – get download URL
router.get('/documents/:id/download', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (!isS3Configured()) {
      return res.status(400).json({ error: 'S3 not configured – cannot generate download URL' });
    }

    const url = await getSignedDownloadUrl(doc.s3Key);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id – delete a document + its chunks
router.delete('/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await Chunk.deleteMany({ documentId: doc._id });
    await Document.findByIdAndDelete(doc._id);

    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

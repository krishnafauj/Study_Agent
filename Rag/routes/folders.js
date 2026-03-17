import { Router } from 'express';
import Folder from '../models/Folder.js';
import Document from '../models/Document.js';
import Chunk from '../models/Chunk.js';

const router = Router();

// GET /api/folders – list all folders
router.get('/', async (req, res) => {
  try {
    const folders = await Folder.find().sort({ createdAt: -1 });

    // Attach document count for each folder
    const foldersWithCounts = await Promise.all(
      folders.map(async (folder) => {
        const docCount = await Document.countDocuments({ folderId: folder._id });
        return {
          _id: folder._id,
          name: folder.name,
          createdAt: folder.createdAt,
          documentCount: docCount,
        };
      })
    );

    res.json(foldersWithCounts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/folders – create a folder
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const existing = await Folder.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ error: 'Folder with this name already exists' });
    }

    const folder = await Folder.create({ name: name.trim() });
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/folders/:id – delete folder + all docs & chunks
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const folder = await Folder.findById(id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Delete all chunks belonging to docs in this folder
    await Chunk.deleteMany({ folderId: id });

    // Delete all documents in this folder
    await Document.deleteMany({ folderId: id });

    // Delete the folder itself
    await Folder.findByIdAndDelete(id);

    res.json({ message: 'Folder deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

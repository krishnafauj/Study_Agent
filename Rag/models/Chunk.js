import mongoose from 'mongoose';

const chunkSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  embedding: {
    type: [Number],
    required: true,
  },
  pageNumber: {
    type: Number,
    default: 0,
  },
  chunkIndex: {
    type: Number,
    default: 0,
  },
});

// Index for vector search – the actual Atlas Vector Search index
// must be created via the Atlas UI with these settings:
// {
//   "fields": [{
//     "type": "vector",
//     "path": "embedding",
//     "numDimensions": 1536,
//     "similarity": "cosine"
//   }]
// }

export default mongoose.model('Chunk', chunkSchema);

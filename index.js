const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ytSearch = require('yt-search'); 

const app = express(); 

// Dynamic environment routing matching your Dockerfile (7860) or local fallback (3000)
const PORT = process.env.PORT || 3000;

app.use(cors());

// Basic welcome check route
app.get('/', (req, res) => {
  res.send('Altum Core Audio Core Engine is fully online!');
});

// ROUTE 1: The Search Engine
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  console.log(`\n=======================`);
  console.log(`🔍 New search query received: "${query}"`);

  try {
    if (!query) {
      return res.status(400).json({ error: 'Missing search query parameter (q)' });
    }

    const results = await ytSearch(query);
    const cleanVideos = results.videos.slice(0, 12).map(video => ({
      id: video.videoId,
      title: video.title,
      artist: video.author.name,
      thumbnail: video.image,
      duration: video.timestamp,
      views: video.views
    }));

    console.log(`✅ Search successful! Found ${cleanVideos.length} tracks.`);
    res.json(cleanVideos);

  } catch (error) {
    console.error('❌ Search endpoint breakdown:', error.message);
    res.status(500).json({ error: 'Failed to process search query' });
  }
});

// ROUTE 2: Dynamic Streaming Pipe
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  const startSeconds = parseInt(req.query.start) || 0;
  
  console.log(`\n=======================`);
  console.log(`📡 Stream request: ID ${videoId} at position ${startSeconds}s`);
  
  if (!videoId) {
    console.log(`❌ Request failed: Missing video ID`);
    return res.status(400).json({ error: 'Missing YouTube video ID parameter' });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  
  // CRITICAL FIX: Explicitly signal 'bytes' support to make Android media engines happy
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes'); 

  // 1. Spawn yt-dlp to stream native high quality audio stream
  const ytdlp = spawn('yt-dlp', [
    '-f', '140/bestaudio[ext=m4a]/bestaudio',
    '--no-playlist',
    '--js-runtimes', 'node',
    '-o', '-',
    youtubeUrl
  ]);

  // 2. Spawn ffmpeg to dynamically consume the pipe, seek safely, and format to streamable mp3
  const ffmpeg = spawn('ffmpeg', [
    '-i', 'pipe:0',                  
    '-ss', startSeconds.toString(), 
    '-acodec', 'libmp3lame',        
    '-ab', '128k',                  
    '-f', 'mp3',                    
    '-'                              
  ]);

  // Establish the pipeline link: yt-dlp -> ffmpeg -> Express response
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  ytdlp.on('error', (err) => {
    console.error('❌ yt-dlp runtime engine failure:', err.message);
  });

  ffmpeg.on('error', (err) => {
    console.error('❌ ffmpeg pipeline remuxer failure:', err.message);
  });

  // CRITICAL CLEANUP: Terminate active pipelines on request close
  req.on('close', () => {
    console.log(`🔌 Request dropped by user. Terminating active streaming pipelines.`);
    
    try {
      ytdlp.stdout.unpipe();
      ytdlp.kill('SIGKILL');
    } catch (e) {}

    try {
      ffmpeg.stdout.unpipe(res);
      ffmpeg.kill('SIGKILL');
    } catch (e) {}
  });
});

// Bind cleanly to standard or production environment variables
app.listen(PORT, () => {
  console.log(`🚀 Altum Core Audio Processing Server running seamlessly on port: ${PORT}`);
});

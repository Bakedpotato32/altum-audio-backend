const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ytSearch = require('yt-search'); 

const app = report || express();

// Dynamically handle cloud port assignment, defaulting to 7860 for Hugging Face
const PORT = process.env.PORT || 7860;

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

// ROUTE 2: Dynamic Streaming Pipe (Fixed for seamless pipe seeking and audio format compatibility)
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
  
  // Set headers for standard chunked stream delivery
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'none'); 

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
    '-i', 'pipe:0',                  // Read input directly from yt-dlp first
    '-ss', startSeconds.toString(), // Output seeking (safe for non-seekable streams/pipes)
    '-acodec', 'libmp3lame',        // Convert stream to universal, robust MP3 formatting
    '-ab', '128k',                  // Stream audio resolution quality setup
    '-f', 'mp3',                    // Force raw mp3 frame delivery container
    '-'                              // Output out directly to system standard stdout
  ]);

  // Establish the pipeline link: yt-dlp -> ffmpeg -> Express response
  ytdlp.stdout.pipe(ffmpeg.stdin);
  ffmpeg.stdout.pipe(res);

  // Catch engine failures safely
  ytdlp.on('error', (err) => {
    console.error('❌ yt-dlp runtime engine failure:', err.message);
  });

  ffmpeg.on('error', (err) => {
    console.error('❌ ffmpeg pipeline remuxer failure:', err.message);
  });

  // CRITICAL CLEANUP: Terminate both background tasks instantly when the user skips or scrubs
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

// Explicitly bind to "0.0.0.0" so the internal container can communicate with external internet traffic
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Altum Core Audio Processing Server running cleanly on port ${PORT}`);
});

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const ytSearch = require('yt-search'); 

const app = express(); 

// Fallback to 5000 locally to prevent port collisions with Next.js (port 3000)
const PORT = process.env.PORT || 5000;

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

// ROUTE 2: Dynamic Core Audio Pipeline
app.get('/api/stream', async (req, res) => {
  const videoId = req.query.id;
  const startSeconds = parseInt(req.query.start) || 0;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing video id parameter (id)' });
  }

  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`\n🎵 Stream requested: ${videoId} starting at ${startSeconds}s`);

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

  // Establish the pipeline link: yt-dlp -> ffmpeg
  ytdlp.stdout.pipe(ffmpeg.stdin);

  // CRITICAL STREAM PROTECTION LAYER: Intercept stream errors to prevent EPIPE application crashes
  ytdlp.stdout.on('error', (err) => {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.error('[yt-dlp stdout stream exception]:', err.message);
    }
  });

  ffmpeg.stdin.on('error', (err) => {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.error('[ffmpeg stdin stream exception]:', err.message);
    }
  });

  ffmpeg.stdout.on('error', (err) => {
    if (err.code !== 'EPIPE' && err.code !== 'ECONNRESET') {
      console.error('[ffmpeg stdout stream exception]:', err.message);
    }
  });

  let headersSent = false;

  // Intercept data chunks coming out of ffmpeg
  ffmpeg.stdout.on('data', (chunk) => {
    if (!headersSent) {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      headersSent = true;
      console.log(`🚀 Audio processing successful. Piping live binary stream payload.`);
    }
    res.write(chunk);
  });

  ffmpeg.stdout.on('end', () => {
    if (headersSent) {
      res.end();
    }
  });

  // Verbose stderr routing (filters out progress text noise to keep logs readable)
  ytdlp.stderr.on('data', (data) => {
    const logStr = data.toString().trim();
    if (!logStr.includes('% of') && !logStr.includes('MiB at')) {
      console.log(`[yt-dlp operational log]: ${logStr}`);
    }
  });

  ytdlp.on('error', (err) => {
    console.error('❌ yt-dlp runtime engine failure:', err.message);
    if (!headersSent) {
      res.status(500).json({ error: 'Audio extractor failed to initialize.' });
      headersSent = true;
    }
  });

  ffmpeg.on('error', (err) => {
    console.error('❌ ffmpeg pipeline remuxer failure:', err.message);
    if (!headersSent) {
      res.status(500).json({ error: 'Audio encoder pipeline breakdown.' });
      headersSent = true;
    }
  });

  // Handle stream terminations cleanly
  ffmpeg.on('close', (code) => {
    if (!headersSent && code !== 0 && code !== null) {
      console.error(`❌ Pipeline crash: ffmpeg closed with code ${code} before audio generation.`);
      res.status(500).json({ 
        error: 'Streaming server failed to process format.' 
      });
      headersSent = true;
    }
  });

  // CRITICAL CLEANUP: Safely decouple active pipelines when client disconnects or scrubs
  req.on('close', () => {
    console.log(`🔌 Request dropped by user. Terminating active streaming pipelines.`);
    try {
      ytdlp.stdout.unpipe();
    } catch (e) {}
    try {
      ffmpeg.stdout.unpipe();
    } catch (e) {}
    try {
      ytdlp.kill('SIGKILL');
    } catch (e) {}
    try {
      ffmpeg.kill('SIGKILL');
    } catch (e) {}
  });
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Altum Core Audio Engine running on port ${PORT}`);
  console.log(`==================================================`);
});

FROM node:20-slim

# 1. Install Python3, Pip, Curl, and FFMPEG
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 2. Download and configure the latest yt-dlp production binary executable
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# 3. Install the required external JavaScript challenge solver module
RUN pip3 install --break-system-packages yt-dlp-ejs

# 4. Configure environmental variables for Hugging Face compliance
ENV PORT=7860
EXPOSE 7860

# 5. Evict the default 'node' user to clear UID 1000, then safely build the Hugging Face profile
RUN userdel -r node && useradd -m -u 1000 user
USER user
ENV HOME=/home/user
WORKDIR $HOME/app

# 6. Bring in your app dependency manifest mappings
COPY --chown=user package*.json ./
RUN npm install --production

# 7. Pull the rest of your backend local directory items into the build space
COPY --chown=user . .

# 8. Ignite the execution script
CMD ["node", "index.js"]

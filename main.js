const express = require("express");
const cors = require("cors");
const https = require("https");
const fs = require("fs");
const app = express();
const { promisify } = require('util');
const id3 = require('node-id3');

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);

require('dotenv').config();

const SpotifyGet = require('spotify-get');
var spotifyClient = new SpotifyGet({
  consumer: {
  key: process.env.SPOTIFY_CLIENT_ID,
  secret: process.env.SPOTIFY_CLIENT_SECRET
  }});

const SpotifyDL = require('spotifydl-core').default
const credentials = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
}
const spotify = new SpotifyDL(credentials);


app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 5000;

let songsToDownlaod = [];

function cleanAuthorName(name) {
  return name.replaceAll(/ *\([^)]*\) */g, "").replaceAll(" - Topic", "").replaceAll("é", "e").replaceAll("/", "").replaceAll("?", "").replaceAll(":", "").replaceAll(".", "");
  // return name.replaceAll(" - Topic", "").replaceAll("é", "e").replaceAll("/", "").replaceAll("?", "").replaceAll(":", "").replaceAll(".", "");
}
function cleanSongName(name) {
  return name.replaceAll(/ *\([^)]*\) */g, "").replaceAll(" - Topic", "").replaceAll("é", "e").replaceAll("/", "").replaceAll("?", "").replaceAll(":", "").replaceAll(".", "").replace("*", "");
  // return name.replaceAll(" - Topic", "").replaceAll("é", "e").replaceAll("/", "").replaceAll("?", "").replaceAll(":", "").replaceAll(".", "");
}

const spotifySearch = async (query) => {
  const searchDatas = await spotifyClient.search({
    q: `${query}`,
    type: 'track',
    limit: 20
  });

  let items = searchDatas.tracks.items.map((item) => {
    let artists = item.artists.map((a) => {
      return {
        name: cleanAuthorName(a.name),
        id: a.i,
        uri: a.external_urls.spotify
      }
    });

    let album = {
      id: item.album.id,
      uri: item.album.external_urls.spotify,
      name: item.album.name,
      image: {
        url: item.album.images[0].url,
        height: item.album.images[0].height,
        width: item.album.images[0].width
      }
    };

    let artist = artists.map((a) => a.name).join(", ");

    return {
      name: cleanSongName(item.name),
      artist,
      cover: album.image.url,
      id: item.id,
      type: item.type,
      uri: item.external_urls.spotify,
      artists,
      duration_ms: item.duration_ms,
      album,
    }
  });
  return items;
}

const downloadCover = (url, path) => {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      response.pipe(fs.createWriteStream(path)).on("close", () => {
        resolve();
      });
    });
  });
}

const addImageToMp3 = async (mp3Path, imagePath, outputMp3Path) => {
  const mp3Data = await readFileAsync(mp3Path);
  const imageData = await readFileAsync(imagePath);
  const tags = id3.read(mp3Data);

  tags.image = {
    mime: 'image/jpeg',
    type: {
      id: 3,
      name: 'front cover'
    },
    description: 'Cover',
    imageBuffer: imageData
  };

  const taggedMp3Data = id3.write(tags, mp3Data);
  await writeFileAsync(outputMp3Path, taggedMp3Data);

  let SongBuffer = await fs.readFileSync(outputMp3Path);
};

const downloadSongSpotify = async (url, path) => {
  const songBuffer = await spotify.downloadTrack(url);

  await fs.writeFileSync(path, songBuffer);

  return songBuffer;
}

app.post("/search", async (req, res) => {
  let data = req.body;

  let items = await spotifySearch(data.query);

  res.send(items);

});
app.post("/download", async (req, res) => {
  let data = req.body;

  let { name, artist, id, uri, cover, album, duration_ms } = data;

  
  let songName = `${name} - ${artist}`;
  let songPathBefore = `./songs/${songName}_.mp3`;
  let songPath = `./songs/${songName}.mp3`;
  let songPathCover = `./songs/${songName}.jpg`;

  // regarder si le fichier existe
  if (fs.existsSync(songPath)) {
    let absolutePath = `${process.cwd()}/${songPath}`;
    res.sendFile(absolutePath);
    return;
  }

  let downloadedSong = await downloadSongSpotify(uri, songPathBefore);
  let downloadedCover = await downloadCover(cover, songPathCover);
  await addImageToMp3(songPathBefore, songPathCover, songPath);
  // delete songPathBefore
  fs.unlinkSync(songPathBefore);
  fs.unlinkSync(songPathCover);

  let absolutePath = `${process.cwd()}/${songPath}`;
  res.sendFile(absolutePath);

});

app.post("/search", async (req, res) => {
  let data = req.body;

  let items = await spotifySearch(data.query);

  res.send(items);

});

app.post("/searchDownload", async (req, res) => {

  let items = await spotifySearch(req.body.query);

  let { name, artist, id, uri, cover, album, duration_ms } = items[0];

  let songName = `${name} - ${artist}`;
  let songPathBefore = `./songs/${songName}_.mp3`;
  let songPath = `./songs/${songName}.mp3`;
  let songPathCover = `./songs/${songName}.jpg`;

  // regarder si le fichier existe
  if (fs.existsSync(songPath)) {
    let absolutePath = `${process.cwd()}/${songPath}`;
    res.sendFile(absolutePath);
    return;
  }

  let downloadedSong = await downloadSongSpotify(uri, songPathBefore);
  console.log()
  let downloadedCover = await downloadCover(cover, songPathCover);
  await addImageToMp3(songPathBefore, songPathCover, songPath);
  // delete songPathBefore
  fs.unlinkSync(songPathBefore);
  fs.unlinkSync(songPathCover);

  let absolutePath = `${process.cwd()}/${songPath}`;
  res.sendFile(absolutePath);

});

app.get("/searchDownload/:query", async (req, res) => {

  let query = req.params.query;

  let items = await spotifySearch(query);

  let { name, artist, id, uri, cover, album, duration_ms } = items[0];

  let songName = `${name} - ${artist}`;
  let songPathBefore = `./songs/${songName}_.mp3`;
  let songPath = `./songs/${songName}.mp3`;
  let songPathCover = `./songs/${songName}.jpg`;

  // regarder si le fichier existe
  if (fs.existsSync(songPath)) {
    let absolutePath = `${process.cwd()}/${songPath}`;
    res.sendFile(absolutePath);
    return;
  }

  let downloadedSong = await downloadSongSpotify(uri, songPathBefore);
  console.log()
  let downloadedCover = await downloadCover(cover, songPathCover);
  await addImageToMp3(songPathBefore, songPathCover, songPath);
  // delete songPathBefore
  fs.unlinkSync(songPathBefore);
  fs.unlinkSync(songPathCover);

  let absolutePath = `${process.cwd()}/${songPath}`;
  res.sendFile(absolutePath);

});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

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
      preview_url: item.preview_url
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

const downloadSongFromDatas = async (data) => {
  let { name, artist, id, uri, cover, album, duration_ms } = data;

  let songName = `${name} - ${artist}`;
  let songPathBefore = `./songs/${songName}_.mp3`;
  let songPath = `./songs/${songName}.mp3`;
  let songPathCover = `./songs/${songName}.jpg`;

  console.log(`Téléchargement de la musique : ${songName}`);

  // regarder si le fichier existe
  if (fs.existsSync(songPath)) {
    console.log(`Fichier déjà téléchargé : ${songPath}`);
    return `${songName}.mp3`;
  }

  let downloadedSong = await downloadSongSpotify(uri, songPathBefore);
  console.log(`Musique téléchargée : ${songName}`);
  let downloadedCover = await downloadCover(cover, songPathCover);
  console.log(`Cover téléchargée : ${songName}`);
  await addImageToMp3(songPathBefore, songPathCover, songPath);
  console.log(`Cover ajoutée : ${songName}`);
  // delete songPathBefore
  fs.unlinkSync(songPathBefore);
  fs.unlinkSync(songPathCover);
  console.log(`Fichiers temporaires supprimés : ${songPathBefore}`);

  let songsList = JSON.parse(fs.readFileSync("songsList.json"));
  songsList.push({
    name,
    artist,
    id,
    uri,
    cover,
    album,
    duration_ms,
    path: `${songName}.mp3`
  });
  fs.writeFileSync("songsList.json", JSON.stringify(songsList));

  return `${songName}.mp3`;
}

if(!fs.existsSync("./songs")) {
  fs.mkdirSync("./songs");
}

if(!fs.existsSync("songsList.json")) {
  fs.writeFileSync("songsList.json", JSON.stringify([]));
}

app.get("/songs/:fileName", (req, res) => {

  let fileName = req.params.fileName;

  if(!fileName.endsWith(".mp3")) {
    fileName += ".mp3";
  }

  if(!fs.existsSync(`./songs/${fileName}`)) {
    console.log(`File not found : ${fileName}`);
    res.status(404).send("Not found");
    return;
  }
  console.log(`Serve file : ${fileName}`);

  let absolutePath = `${process.cwd()}/songs/${fileName}`;

  // res.sendFile(absolutePath);
  res.download(absolutePath, fileName, (err) => {
    if (err) {
      console.log(err);
      res.status(404).send('File not found');
    }
  });

});

app.delete("/songs/:songId", (req, res) => {

  let songId = req.params.songId;

  let songsList = JSON.parse(fs.readFileSync("songsList.json"));

  let song = songsList.find((s) => s.id === songId);

  if(!song) {
    res.status(404).send("Not found");
    return;
  }

  // delete song file
  let absolutePath = `${process.cwd()}/songs/${song.path}`;
  fs.unlinkSync(absolutePath);

  // delete song from list
  songsList = songsList.filter((s) => s.id !== songId);
  fs.writeFileSync("songsList.json", JSON.stringify(songsList));

  res.send("OK");

  console.log(`Delete song : ${song.name}`);

});

// app.get("/songs", (req, res) => {

//   let songs = fs.readdirSync("./songs");

//   songs = songs.filter((s) => s.endsWith(".mp3"));

//   res.send(songs);

// });

app.get("/songs", (req, res) => {

  let songsList = JSON.parse(fs.readFileSync("songsList.json"));

  res.send(songsList);

});

app.get("/search/:query", async (req, res) => {
  let query = req.params.query;

  let items = await spotifySearch(query);

  res.send(items);
});

app.post("/search", async (req, res) => {
  let data = req.body;

  let items = await spotifySearch(data.query);

  res.send(items);

});

app.post("/download", async (req, res) => {
  let data = req.body;

  let songPath = await downloadSongFromDatas(data);
  return res.send(songPath);

});

app.post("/search", async (req, res) => {
  let data = req.body;

  let items = await spotifySearch(data.query);
  res.send(items);

});

app.post("/searchDownload", async (req, res) => {

  let items = await spotifySearch(req.body.query);

  let songPath = await downloadSongFromDatas(items[0]);
  let absolutePath = `${process.cwd()}/songs/${songPath}`;
  res.sendFile(absolutePath);

});

app.get("/searchDownload/:query", async (req, res) => {

  let query = req.params.query;

  let items = await spotifySearch(query);

  let songPath = await downloadSongFromDatas(items[0]);
  let absolutePath = `${process.cwd()}/songs/${songPath}`;
  res.sendFile(absolutePath);

});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

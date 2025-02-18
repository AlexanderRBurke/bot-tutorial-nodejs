var http, director, cool, bot, router, server, port, fs;

http = require("http");
director = require("director");
cool = require("cool-ascii-faces");
bot = require("./bot.js");
fs = require("fs"); // Require the file system module

router = new director.http.Router({
  "/": {
    post: bot.respond,
    get: ping,
  },
});

server = http.createServer(function (req, res) {
  req.chunks = [];
  req.on("data", function (chunk) {
    req.chunks.push(chunk.toString());
  });

  router.dispatch(req, res, function (err) {
    res.writeHead(err.status, { "Content-Type": "text/plain" });
    res.end(err.message);
  });
});

port = Number(process.env.PORT || 5000);
server.listen(port, "0.0.0.0");

function ping() {
  const data = fs.readFileSync("./code/index.html");

  if (!data) {
    this.res.writeHead(500, { "Content-Type": "text/plain" });
    this.res.end("Error loading index.html");
  } else {
    this.res.writeHead(200, { "Content-Type": "text/html" }); // Set correct content type
    this.res.end(data); // Send the HTML data
  }
}

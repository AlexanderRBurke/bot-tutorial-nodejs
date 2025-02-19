const express = require("express");
const bot = require("./bot.js");

const app = express(); // Create an Express app
app.use(express.json()); // Enable parsing JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Routes
app.post("/", bot.respond); // Bot interaction
// app.get("/", ping); // Serve index.html
// app.post("/add_phrase", addPhrase); // Add phrase route
// app.get("/phrases", getPhrases); // Get phrases route

// Serve static files from the "code" directory
app.use(express.static(__dirname + "/code"));

// Explicit route for index.html (if needed) - only if express.static does not work
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html"); // Use res.sendFile
});

const port = Number(process.env.PORT || 5000);
app.listen(port, "0.0.0.0", function () {
  console.log(`Server listening on port ${port}`);
  // populatePhrases(); // Call populatePhrases after the server starts
});

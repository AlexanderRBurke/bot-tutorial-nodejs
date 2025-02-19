const express = require("express");
const bot = require("./bot.js");
const admin = require("firebase-admin");
const { phrases, handlePhrase } = require("./phrases");

const app = express(); // Create an Express app
app.use(express.json()); // Enable parsing JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Routes
app.post("/", bot.respond); // Bot interaction
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

var serviceAccount = require("../" + process.env.FIREBASE_SERVICE_ACCOUNT_KEY);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.GCP_PROJECT_ID,
});
const db = admin.firestore();

async function addPhrase(req, res) {
  console.log("addPhrase: " + JSON.stringify(req.body));
  let body = "";
  // req.on("data", (chunk) => {
  //   body += chunk;
  // });

  // req.on("end", async () => {
  try {
    const { key, value } = req.body;
    console.log("Trying to add: " + key + " " + value);
    await db.collection("phrases").doc(key).set({ value });
    res.json({ message: "Phrase added successfully" });
  } catch (error) {
    console.error("Error adding phrase:", error);
    res.status(500).json({ error: "Error adding phrase" });
  }
  // });
}

async function getPhrases(req, res) {
  try {
    const phrasesSnapshot = await db.collection("phrases").get();
    const phrases = {};
    phrasesSnapshot.forEach((doc) => {
      phrases[doc.id] = doc.data().value;
    });
    res.json(phrases);
  } catch (error) {
    console.error("Error retrieving phrases:", error);
    res.status(500).json({ error: "Error retrieving phrases" });
  }
}

async function populatePhrases(req, res) {
  try {
    const batch = db.batch(); // Use a batch for efficient writes

    for (const key in phrases) {
      const phraseData = phrases[key];
      // ***Wrap the string in an object***
      const dataToSet = {
        value: phraseData, // Or any property name you want (e.g., 'text', 'message')
      };
      // console.log(key + " : " + dataToSet);
      const phraseRef = db.collection("phrases").doc(key); // Reference to the document
      batch.set(phraseRef, dataToSet); // Add the set operation to the batch
    }

    await batch.commit(); // Commit the batch write
    console.log("Phrases populated successfully!");
  } catch (error) {
    console.error("Error populating phrases:", error);
  }
}

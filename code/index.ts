import express, { Request, Response } from "express"; // Import the types
import { QuerySnapshot, QueryDocumentSnapshot } from "firebase/firestore";
import * as admin from "firebase-admin";

const bot = require("./bot");
import { phrases, handlePhrase } from "./phrases";

const app = express(); // Create an Express app
app.use(express.json()); // Enable parsing JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Routes
app.post("/", bot.respond); // Bot interaction
// app.post("/add_phrase", addPhrase); // Add phrase route
// app.get("/phrases", getPhrases); // Get phrases route
app.get("/api/leaderboard", async (req: Request, res: Response) => {
  const period =
    req.query.period === "day" || req.query.period === "month"
      ? req.query.period
      : "week";
  try {
    const leaderboardResponse = await bot.fetchLeaderboardData(period);

    if (leaderboardResponse && leaderboardResponse.messages) {
      // Filter messages server-side
      const filteredMessages = leaderboardResponse.messages.filter(
        (message: any) =>
          Array.isArray(message.favorited_by) &&
          message.favorited_by.length >= 5
      );

      // Sort server-side
      filteredMessages.sort(
        (a: any, b: any) => b.favorited_by.length - a.favorited_by.length
      );

      // --- NEW: Extract image URL ---
      const messagesWithImages = filteredMessages.map((message: any) => {
        let imageUrl = null;
        if (message.attachments && message.attachments.length > 0) {
          const imageAttachment = message.attachments.find(
            (att: any) => att.type === "image"
          );
          if (imageAttachment) {
            imageUrl = imageAttachment.url;
          }
        }
        // Return a new object including the original message data and the imageUrl
        return {
          ...message, // Spread existing message properties
          imageUrl: imageUrl, // Add the imageUrl property
        };
      });

      // Send back the modified messages array
      res.json({ messages: messagesWithImages }); // <-- Use messagesWithImages here
    } else {
      console.warn(
        "Leaderboard response format unexpected:",
        leaderboardResponse
      );
      res
        .status(500)
        .json({ error: "Unexpected response format from GroupMe API." });
    }
  } catch (error: any) {
    console.error("Error in /api/leaderboard endpoint:", error);
    res.status(500).json({
      error: "Failed to fetch leaderboard data.",
      details: error.message,
    });
  }
});

// Serve static files from the "code" directory
app.use(express.static(__dirname + "/code"));

// Explicit route for index.html (if needed) - only if express.static does not work
app.get("/", (req: Request, res: Response) => {
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
export const db: admin.firestore.Firestore = admin.firestore();

async function addPhrase(req: Request, res: Response) {
  console.log("addPhrase: " + JSON.stringify(req.body));

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

interface Phrase {
  // Define an interface for your data (Recommended)
  phrase: string;
}

// async function getPhrases(req: Request, res: Response) {
//   try {
//     const phrasesSnapshot = await db.collection("phrases").get();
//     // const phrases = {};
//     phrasesSnapshot.forEach((doc: QueryDocumentSnapshot<Phrase>) => {
//       phrases[doc.id] = doc.data().phrase;
//     });
//     res.json(phrases);
//   } catch (error) {
//     console.error("Error retrieving phrases:", error);
//     res.status(500).json({ error: "Error retrieving phrases" });
//   }
// }

// async function populatePhrases(req: Request, res: Response) {
//   try {
//     const batch = db.batch(); // Use a batch for efficient writes

//     for (const key in phrases) {
//       const phraseData = phrases[key];
//       // ***Wrap the string in an object***
//       const dataToSet = {
//         value: phraseData, // Or any property name you want (e.g., 'text', 'message')
//       };
//       // console.log(key + " : " + dataToSet);
//       const phraseRef = db.collection("phrases").doc(key); // Reference to the document
//       batch.set(phraseRef, dataToSet); // Add the set operation to the batch
//     }

//     await batch.commit(); // Commit the batch write
//     console.log("Phrases populated successfully!");
//   } catch (error) {
//     console.error("Error populating phrases:", error);
//   }
// }

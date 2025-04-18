import express, { Request, Response } from "express";
import * as admin from "firebase-admin";

const bot = require("./bot"); // Import your bot logic
import { phrases, handlePhrase } from "./phrases"; // Import your phrases
import { log } from "console";
import { GroupMeMessage } from "./bot";
import * as fs from "fs";

const app = express(); // Create an Express app
app.use(express.json()); // Enable parsing JSON request bodies
app.use(express.urlencoded({ extended: true }));

// Routes
app.post("/", bot.respond); // Bot interaction
// app.post("/add_phrase", addPhrase); // Add phrase route
// app.get("/phrases", getPhrases); // Get phrases route

app.get("/api/leaderboard", async (req: Request, res: Response) => {
  const period: "day" | "week" | "month" =
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
      res.json({ messages: messagesWithImages });
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

export const FILTERED_MESSAGES_FILE = "most_liked_messages.json"; // File to store most liked messages
app.get("/api/allTimeLeaderboard", async (req: Request, res: Response) => {
  log("allTimeLeaderboard");
  const groupId = process.env.GROUP_ID;
  const accessToken = process.env.GROUPME_KEY;

  if (!groupId || !accessToken) {
    res.status(500).json({
      error:
        "Missing GROUPME_GROUP_ID or GROUPME_ACCESS_TOKEN in environment variables.",
    });
    return;
  }

  try {
    // const allMessages: GroupMeMessage[] = await bot.getAllGroupMeMessages(
    //   groupId,
    //   accessToken
    // );
    // console.log("allMessages len: " + allMessages.length);
    // const mostLiked: GroupMeMessage[] =
    //   bot.filterAndSortMostLikedMessages(allMessages);
    // // Store the most liked messages to a file
    // try {
    //   // Check if the file exists
    //   let existingMessages: GroupMeMessage[] = [];
    //   if (fs.existsSync(FILTERED_MESSAGES_FILE)) {
    //     const fileContent = fs.readFileSync(FILTERED_MESSAGES_FILE, "utf8");
    //     try {
    //       existingMessages = JSON.parse(fileContent);
    //     } catch (parseError) {
    //       console.error(
    //         "Error parsing existing filtered messages:",
    //         parseError
    //       );
    //       // Handle the error, e.g., start with an empty array or throw an error.
    //       // For now, we'll just log and continue with an empty array.
    //     }
    //   }

    //   // Append the new filtered messages to the existing ones
    //   const allFilteredMessages = existingMessages.concat(mostLiked);

    //   fs.writeFileSync(
    //     FILTERED_MESSAGES_FILE,
    //     JSON.stringify(allFilteredMessages, null, 2) // Pretty print JSON
    //   );
    //   console.log(
    //     `Appended ${mostLiked.length} filtered messages to ${FILTERED_MESSAGES_FILE}`
    //   );
    // } catch (error) {
    //   console.error("Error writing filtered messages:", error);
    //   // Handle error.  Consider if this is critical or not.
    // }
    getStoredLeaderboard(req, res);
    // res.json({ messages: mostLiked });
  } catch (error: any) {
    console.error("Error fetching all-time leaderboard:", error);
    res.status(500).json({
      error: "Failed to fetch all-time leaderboard data.",
      details: error.message,
    });
  }
});

// Serve static files
app.use(express.static(__dirname + "/code"));

// Explicit route for index.html (if needed) - only if express.static does not work
app.get("/", (req: Request, res: Response) => {
  res.sendFile(__dirname + "/index.html"); // Use res.sendFile
});

// --- Server Startup ---
const port = Number(process.env.PORT || 5000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
  // populatePhrases(); // Call populatePhrases after the server starts
});

// Initialize Firebase Admin SDK
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
}

// Example of retrieving the stored messages in a new endpoint
const getStoredLeaderboard = async (req: Request, res: Response) => {
  try {
    if (fs.existsSync(FILTERED_MESSAGES_FILE)) {
      const data = fs.readFileSync(FILTERED_MESSAGES_FILE, "utf8");
      const mostLiked: GroupMeMessage[] = JSON.parse(data);
      mostLiked.sort(
        (a, b) => (b.favorited_by?.length || 0) - (a.favorited_by?.length || 0)
      );
      res.json({ messages: mostLiked });
    } else {
      res.status(404).json({ error: "No stored leaderboard data found." });
    }
  } catch (error: any) {
    console.error("Error reading stored leaderboard:", error);
    res.status(500).json({
      error: "Failed to retrieve stored leaderboard data.",
      details: error.message,
    });
  }
};

// interface Phrase {
//   // Define an interface for your data (Recommended)
//   phrase: string;
// }

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

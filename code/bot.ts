import { GenerateContentResponse, GoogleGenAI } from "@google/genai";
import * as admin from "firebase-admin"; // Initialize Firebase Admin SDK
import { Request, Response } from "express"; // Import the types

import * as HTTPS from "https"; // Or import * as HTTP from 'http';
import { IncomingMessage } from "http"; // Or from 'https' if using https
import cool from "cool-ascii-faces";
// Import the secrets module.  The path should be relative to your main file.
import { accessSecret } from "./secrets"; // No file extension needed for .js modules.
require("dotenv").config();
import { phrases, handlePhrase } from "./phrases";
import { db } from "./index";

let uses = new Map<string, number>();
let currentDay: number = new Date().getDay();
let botID: string; // Declare botID outside the async function
let ai: GoogleGenAI;
const modelName = "gemini-2.0-flash";

async function initialize() {
  // Initialize everything that needs await
  try {
    const aiApiKey = await accessSecret("ai-api-key");

    ai = new GoogleGenAI({ apiKey: aiApiKey });

    botID = await accessSecret("bot-id"); // Assign the result to botID

    return;
  } catch (error) {
    console.error("Error initializing:", error);
    // Handle the error appropriately, perhaps exit the application
    throw error; // Re-throw so the error is caught when initialize is called.
  }
}

// Create the regex dynamically:
const regexString = Object.keys(phrases)
  .map((key) => {
    const lowerKey = key.toLowerCase(); // Convert key to lowercase
    // Escape special regex characters in the keys
    const escapedKey = lowerKey.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"); // escape regex special chars
    return escapedKey;
  })
  .join("|");

const regex = new RegExp(`\\b(${regexString})\\b`, "gi");

interface MessageBody {
  attachments: any[];
  avatar_url: string;
  created_at: number;
  group_id: string; // Example group ID
  id: string; // Example message ID
  name: string; // Or get the user's name somehow
  sender_id: string; // Example sender ID
  sender_type: string;
  source_guid: string; // Unique GUID
  system: false;
  text: string;
  user_id: string; // Example user ID
}

async function respond(req: Request, res: Response) {
  if (currentDay != new Date().getDay()) {
    console.log("Reset uses map");
    uses.clear();
    currentDay = new Date().getDay();
  }
  const request: MessageBody = req.body; // Access request body using req.body (Express),
  const botRegex: RegExp = regex;
  let message: PostBody;
  if (request.text) {
    if (!uses.has(request.sender_id)) {
      uses.set(request.sender_id, 0);
    }

    // if (<number>uses.get(request.sender_id) > 5) {
    //   console.log("Too many uses from: " + request.name);
    //   // res.writeHead(200);
    //   // res.end();
    //   // return;
    // }
    const requestText = request.text;
    const AI_regex = /@bot/i;
    const img_regex = /@img/i;
    if (request?.name != "RoN Bot" && AI_regex.test(requestText)) {
      if (ai == undefined) {
        await initialize();
      }

      const contents: any[] = [];
      try {
        if (request.attachments.length > 0) {
          const fetchModule = await import("node-fetch");
          const fetch = fetchModule.default; // Access the default export

          const imgResponse = await fetch(request.attachments[0].url);

          if (!imgResponse.ok) {
            throw new Error(
              `Failed to fetch image: ${imgResponse.status} ${imgResponse.statusText}`
            );
          }

          const buffer = await imgResponse.buffer();
          const base64Image: string = buffer.toString("base64");
          contents.push({
            inlineData: {
              mimeType: "image/png",
              data: base64Image,
            },
          });
        }
      } catch (error) {
        console.log("attachment oopsie: " + error);
      }
      const result = await generateBotResponse(
        request.name,
        requestText.replaceAll("@bot", ""),
        contents
      );
      res.writeHead(200);
      message = await postMessage(result.text, request, result.attachments);

      res.end(JSON.stringify(message));
      return;
    } else if (img_regex.test(requestText)) {
      if (ai == undefined) {
        await initialize();
      }
      let newResponse: GenerateContentResponse | undefined;
      const contents: any[] = [{ text: requestText.replaceAll("@img", "") }];
      let imgTxt = "";
      let bodyAttachments = [];
      try {
        if (request.attachments.length > 0) {
          const fetchModule = await import("node-fetch");
          const fetch = fetchModule.default; // Access the default export

          const imgResponse = await fetch(request.attachments[0].url);

          if (!imgResponse.ok) {
            throw new Error(
              `Failed to fetch image: ${imgResponse.status} ${imgResponse.statusText}`
            );
          }

          const buffer = await imgResponse.buffer();
          const base64Image: string = buffer.toString("base64");
          contents.push({
            inlineData: {
              mimeType: "image/png",
              data: base64Image,
            },
          });
        }

        // Prepare the content parts
        newResponse = await ai.models.generateContent({
          model: "gemini-2.0-flash-exp-image-generation",
          config: {
            responseModalities: ["Text", "Image"],
          },
          contents: contents,
        });
      } catch (error: any) {
        console.log("img oopsie: " + error);
        imgTxt = "AI image went boom boom";
      }
      if (newResponse?.candidates?.[0]?.content?.parts) {
        for (const part of newResponse.candidates[0].content.parts) {
          // Based on the part type, either show the text or save the image
          if (part.text) {
            imgTxt = part.text;
          } else if (part.inlineData && part.inlineData.data) {
            const imageData = part.inlineData.data;
            const buffer = Buffer.from(imageData, "base64");
            const responseImg = await uploadImage(buffer);
            const parsedResponse = JSON.parse(responseImg);
            if (parsedResponse.payload && parsedResponse.payload.url) {
              let newAttach = {
                type: "image",
                url: parsedResponse.payload.url,
              };
              bodyAttachments.push(newAttach);
            }
          }
        }
      }

      res.writeHead(200);
      message = await postMessage(imgTxt, request, bodyAttachments);
      res.end(JSON.stringify(message));
      return;
    } else if (request?.name != "RoN Bot" && botRegex.test(requestText)) {
      // && getRandomInt(2) == 1
      res.writeHead(200);
      let matches = regexpmatcharrayToStringArray(requestText.match(regex));
      let botResponse = "";
      if (matches[0] == "169") {
        botResponse = cool();
      } else {
        for (let index = 0; index < matches.length; index++) {
          const element = phrases[matches[index].toLowerCase()];
          botResponse += element + " ";
        }
      }
      message = await postMessage(
        botResponse,
        request,
        matches.length > 0 ? handlePhrase(matches[0]) : []
      );

      res.end(JSON.stringify(message));
    } else {
      console.log("not bot, but dont care: " + request.text);
      res.writeHead(200);
      res.end();
    }
    return;
  }
  console.log("don't care about: " + request.text + ", from: " + request.name);
  res.writeHead(200);
  res.end();
}

interface PostBody {
  attachments?: any[];
  bot_id: string;
  text: string;
}

async function postMessage(
  botResponse: string,
  request: MessageBody,
  attachments: any[]
) {
  var options, botReq;

  options = {
    hostname: "api.groupme.com",
    path: "/v3/bots/post",
    method: "POST",
  };

  let usesById = <number>uses.get(request.sender_id);
  let body: PostBody = {
    bot_id: botID,
    text: botResponse, //  usesLogic(request.sender_id, usesById) +
    attachments: attachments,
  };

  let isTest: boolean = request.name == "Test User";
  if (isTest != true) {
    console.log("sending " + botResponse + " to " + botID);

    botReq = HTTPS.request(options, function (res: IncomingMessage) {
      if (res.statusCode == 202) {
        //neat
      } else {
        console.log("rejecting bad status code " + res.statusCode);
      }
    });

    botReq.on("error", function (err: Error) {
      console.log("error posting message " + JSON.stringify(err));
    });
    botReq.on("timeout", function (err: Error) {
      console.log("timeout posting message " + JSON.stringify(err));
    });
    botReq.end(JSON.stringify(body));
  } else {
    console.log("Test: " + JSON.stringify(body) + " to HTML? ");
  }
  return body;
}

function regexpmatcharrayToStringArray(matchArray: string[] | null): string[] {
  if (matchArray == null) {
    return [];
  }
  return matchArray
    .filter((match) => match !== null)
    .map((match) => String(match));
}

function usesLogic(sender_id: string, usesByUser: number) {
  let messageToStartWith: string = "";
  if (usesByUser == 5) {
    messageToStartWith = "This is your FINAL bot use for the day. \n ";
  } else if (usesByUser == 4) {
    messageToStartWith = "WARNING: You have one more bot use for today. \n ";
  }
  usesByUser++;
  uses.set(sender_id, usesByUser);

  return messageToStartWith;
}

async function savePrompt(userId: string, prompt: string, response: string) {
  try {
    await db.collection("prompts").add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      userId: userId,
      prompt: prompt,
      response: response,
    });
    console.log("Prompt saved successfully!");
  } catch (error) {
    console.error("Error saving prompt:", error);
  }
}

async function getPromptHistory(
  userId: string,
  limit: number = 10
): Promise<admin.firestore.DocumentData[]> {
  try {
    let query = db.collection("prompts").orderBy("timestamp", "desc"); // Most recent first

    // if (userId) {
    //   query = query.where("userId", "==", userId);
    // }
    const snapshot = await query.get();
    const history = snapshot.docs.map((doc) => doc.data());
    return history;
  } catch (error) {
    console.error("Error getting prompt history:", error);
    return []; // Return an empty array in case of error
  }
}

type AIResponse = {
  text: string;
  attachments: any[];
};

async function generateBotResponse(
  userId: string,
  userPrompt: string,
  contents: any[]
): Promise<AIResponse> {
  const promptHistory = await getPromptHistory(userId);

  const context = promptHistory
    .map((p) => `${p.userId}: ${p.prompt}\n`) //Bot: ${p.response}
    .join("\n");

  contents.push({
    text: `Previous conversation:\n${context}\nCurrent prompt:${userId}:  ${userPrompt}`, //userPrompt,//
  });

  try {
    const botResponse = // Call the model with the combined prompt
      await ai.models.generateContent({
        model: modelName,
        config: {
          responseModalities: ["Text"],
          systemInstruction: `Each prompt will have a history in the cache, use the history when answering.
          When the prompt is self referential, only use the messages by the user's name.
          You can be offensive.`,
        },
        contents: contents,
      });
    let botString = "";
    let botAttachments = [];
    if (botResponse?.candidates?.[0]?.content?.parts) {
      for (const part of botResponse.candidates[0].content.parts) {
        // Based on the part type, either show the text or save the image
        if (part.text) {
          botString = part.text;
        } else if (part.inlineData && part.inlineData.data) {
          console.log("ther eis an image");
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          const responseImg = await uploadImage(buffer);
          const parsedResponse = JSON.parse(responseImg);
          if (parsedResponse.payload && parsedResponse.payload.url) {
            let newAttach = {
              type: "image",
              url: parsedResponse.payload.url,
            };
            botAttachments.push(newAttach);
          }
        }
      }
    }

    await savePrompt(userId, userPrompt, botString); // Save to the database
    return { text: botString, attachments: botAttachments };
  } catch (error) {
    console.log("AI oopsie: " + error);
    return { text: "sorry AI failed", attachments: [] };
  }
}

async function uploadImage(imageBuffer: Buffer<ArrayBuffer>): Promise<string> {
  try {
    const options: HTTPS.RequestOptions = {
      hostname: "image.groupme.com",
      path: "/pictures",
      method: "POST",
      headers: {
        "X-Access-Token": process.env.GROUPME_KEY,
        "Content-Type": "image/jpeg",
        "Content-Length": imageBuffer.length,
      },
    };

    return new Promise((resolve, reject) => {
      const req = HTTPS.request(options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => {
          responseData += chunk;
        });
        res.on("end", () => {
          if (
            res &&
            res.statusCode &&
            res.statusCode >= 200 &&
            res.statusCode < 300
          ) {
            resolve(responseData);
          } else {
            reject(
              new Error(
                `Request failed with status code ${res.statusCode}: ${responseData}`
              )
            );
          }
        });
      });

      req.on("error", (error) => {
        reject(error);
      });

      req.write(imageBuffer);
      req.end();
    });
  } catch (error) {
    console.error("Error reading image file:", error);
    throw error;
  }
}

async function deleteDocumentsByUserId(userIdToDelete: string) {
  const promptsRef = db.collection("prompts");
  const querySnapshot = await promptsRef
    .where("userId", "==", userIdToDelete)
    .get();

  if (querySnapshot.empty) {
    console.log("No documents found with the specified userId.");
    return;
  }

  const batch = db.batch();
  querySnapshot.forEach((doc) => {
    // batch.delete(doc.ref);
    console.log(
      `Deleting document with ID: ${doc.id} and prompt: ${doc.get("prompt")}`
    );
  });

  try {
    await batch.commit();
    console.log("Successfully deleted documents.");
  } catch (error) {
    console.error("Error deleting documents:", error);
  }
}

exports.respond = respond;

import { GenerativeModel } from "@google/generative-ai";
import { GenerateContentResponse, GoogleGenAI } from "@google/genai";
import * as admin from "firebase-admin"; // Initialize Firebase Admin SDK
import { Request, Response } from "express"; // Import the types

import { GoogleGenerativeAI } from "@google/generative-ai";
import * as HTTPS from "https"; // Or import * as HTTP from 'http';
import { IncomingMessage } from "http"; // Or from 'https' if using https
import cool from "cool-ascii-faces";
// Import the secrets module.  The path should be relative to your main file.
import { accessSecret } from "./secrets"; // No file extension needed for .js modules.
import fs from "fs";
require("dotenv").config();
import { phrases, handlePhrase } from "./phrases";
import { db } from "./index";

let uses = new Map<string, number>();
let currentDay: number = new Date().getDay();
let botID: string; // Declare botID outside the async function
let ai: GoogleGenAI;

async function initialize() {
  // Initialize everything that needs await
  try {
    const aiApiKey = await accessSecret("ai-api-key");

    ai = new GoogleGenAI({ apiKey: aiApiKey });
    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model: GenerativeModel = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: `Each prompt will have a history before it, use the history when answering.
        The format will be "Previous conversation:" followed by the history, and then the user\'s name will be followed by a colon and the current prompt.
        When the prompt is self referential, only use the messages by the user's name.
        You can be offensive.`,
    });

    botID = await accessSecret("bot-id"); // Assign the result to botID

    return { model }; // Return the model so it's accessible
  } catch (error) {
    console.error("Error initializing:", error);
    // Handle the error appropriately, perhaps exit the application
    throw error; // Re-throw so the error is caught when initialize is called.
  }
}

let model: GenerativeModel; // Declare model outside, will be set by initialize
initialize()
  .then(({ model: initializedModel }) => {
    model = initializedModel; // Set the model once initialization is done
  })
  .catch((error) => {
    console.error("Initialization failed:", error);
    // Handle the error, maybe exit the process.
    process.exit(1); // Example: Exit the process if initialization fails
  });

var beeString = fs.readFileSync("./beeMovie.txt").toString("utf-8");

function getRandomInt(max: number) {
  return Math.floor(Math.random() * max);
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
  if (request?.name != "RoN Bot" && request.text) {
    if (!uses.has(request.sender_id)) {
      uses.set(request.sender_id, 0);
    }

    if (<number>uses.get(request.sender_id) > 5) {
      console.log("Too many uses from: " + request.name);
      // res.writeHead(200);
      // res.end();
      // return;
    }
    const requestText = request.text;
    const AI_regex = /@bot/i;
    const img_regex = /@img/i;
    if (AI_regex.test(requestText)) {
      if (model == undefined || model == null) {
        await initialize();
      }

      const result = await generateBotResponse(request.name, requestText);
      res.writeHead(200);
      message = await postMessage(result, request, []);

      res.end(JSON.stringify(message));
    } else if (img_regex.test(requestText)) {
      if (ai == undefined) {
        await initialize();
      }
      let newResponse: GenerateContentResponse | undefined;
      const contents: any[] = [{ text: requestText.replaceAll("@img", "") }];
      try {
        console.log(JSON.stringify(request.attachments));
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
      } catch (error) {
        console.log("img oopsie: " + error);
      }
      let imgTxt = "";
      let bodyAttachments = [];
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
    } else if (botRegex.test(requestText)) {
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
  } else {
    console.log(
      "don't care about: " + request.text + ", from: " + request.name
    );
    res.writeHead(200);
    res.end();
  }
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

async function generateBotResponse(userId: string, userPrompt: string) {
  const promptHistory = await getPromptHistory(userId);
  const context = promptHistory
    .map((p) => `${p.userId}: ${p.prompt}\nBot: ${p.response}`)
    .join("\n");

  const fullPrompt = `Previous conversation:\n${context}\n\n${userId}:  ${userPrompt}`;

  const botResponse = await model.generateContent(fullPrompt); // Call the model with the combined prompt
  const botString = botResponse.response.text();

  await savePrompt(userId, userPrompt, botString); // Save to the database

  return botString;
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

exports.respond = respond;

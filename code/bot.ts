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
import { db, FILTERED_MESSAGES_FILE } from "./index";
import * as fs from "fs";
import {
  GenerateContentRequest,
  GenerativeModel,
  VertexAI,
} from "@google-cloud/vertexai";

let uses = new Map<string, number>();
let currentDay: number = new Date().getDay();
let botID: string; // Declare botID outside the async function
let ai: GoogleGenAI;

let vertexAI: VertexAI;
let generativeModel: GenerativeModel;
let imageModel: GenerativeModel;
const modelName = "gemini-2.5-pro-exp-03-25";

async function initialize() {
  // Initialize everything that needs await
  try {
    const aiApiKey = await accessSecret("ai-api-key");
    ai = new GoogleGenAI({ apiKey: aiApiKey });
    vertexAI = new VertexAI({
      project: process.env.GCP_PROJECT_ID || "",
      location: "us-central1",
    });
    generativeModel = vertexAI.getGenerativeModel({
      model: modelName,
    });
    imageModel = vertexAI.getGenerativeModel({
      model: "gemini-2.0-flash-exp-image-generation",
    });
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
    const top_regex = /@top/i;
    if (generativeModel == undefined || imageModel == undefined) {
      await initialize();
    }
    if (request?.name != "RoN Bot" && AI_regex.test(requestText)) {
      const contents: any[] = [];
      let base64: string = await attachmentToBase64Image(request);
      if (base64 != "") {
        contents.push({
          inlineData: {
            mimeType: "image/png",
            data: base64,
          },
        });
      }
      let botPrompt = requestText.replaceAll("@bot", "");
      const result = await generateBotResponse(
        request.name,
        botPrompt,
        contents
      );
      try {
        if (result.text != "sorry AI failed") {
          await savePrompt(request.name, botPrompt, result.text); // Save to the database
        }
      } finally {
        // Always send a response, even if saving the prompt fails
        res.writeHead(200);
        message = await postMessage(result.text, request, result.attachments);
        res.end(JSON.stringify(message));
      }

      return;
    } else if (img_regex.test(requestText)) {
      let newResponse;
      const contents: any[] = [{ text: requestText.replaceAll("@img", "") }];
      try {
        let base64: string = await attachmentToBase64Image(request);
        if (base64 != "") {
          contents.push({
            inlineData: {
              mimeType: "image/png",
              data: base64,
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
        res.writeHead(200);
        let message: PostBody = await postMessage(
          "AI image went boom boom",
          request,
          []
        );
        res.end(JSON.stringify(message));
        return;
      }
      handleAIAndPost(newResponse, res, request);
      return;

      //   const aiRequest: GenerateContentRequest = {
      //     contents: [{ role: "user", parts: contents }],
      //     generationConfig: { reques },
      //   };
      //   newResponse = (
      //     await imageModel.generateContent({
      //       config: {
      //         responseModalities: ["Text", "Image"],
      //       },
      //       contents: contents,
      //     })
      //   ).response;
      // } catch (error: any) {
      //   console.log("img oopsie: " + error);
      //   res.writeHead(200);
      //   let message: PostBody = await postMessage(
      //     "AI image went boom boom",
      //     request,
      //     []
      //   );
      //   res.end(JSON.stringify(message));
      //   return;
      // }
      // handleAIAndPost(newResponse, res, request);
      // return;
    } else if (top_regex.test(requestText)) {
      if (!fs.existsSync(FILTERED_MESSAGES_FILE)) {
        console.log("Oops no top file: " + request.text);
        res.writeHead(200);
        res.end();
        return;
      }

      const data = fs.readFileSync(FILTERED_MESSAGES_FILE, "utf8");
      const mostLiked: GroupMeMessage[] = JSON.parse(data);
      const context = mostLiked
        .map(
          (value: GroupMeMessage) =>
            `${value.name}: ${value.text}\t(Like count: ${value.favorited_by.length})`
        )
        .join("\n");

      let newResponse: GenerateContentResponse | undefined;
      let contents: any[] = [];
      contents.push({
        text: `Previous conversation:\n${context}\nCurrent prompt:${
          request.name
        }:  ${requestText.replaceAll("@top", "")}`,
      });
      try {
        let base64: string = await attachmentToBase64Image(request);
        if (base64 != "") {
          contents.push({
            inlineData: {
              mimeType: "image/png",
              data: base64,
            },
          });
        }

        // Prepare the content parts
        newResponse = await ai.models.generateContent({
          model: modelName,
          config: {
            responseModalities: ["Text"],
            systemInstruction: `Each prompt will have a history in the cache, use the history when answering.
          The messages will have the number of likes that it received at the end. Messages with more likes are better.
          You can be offensive.`,
          },
          contents: contents,
        });
        // const botRequest = {
        //   contents: [{ role: "user", parts: contents }],
        //   systemInstruction: {
        //     role: "system",
        //     parts: [
        //       {
        //         text: `Each prompt will have a history in the cache, use the history when answering.
        //   The messages will have the number of likes that it received at the end. Messages with more likes are better.
        //   You can be offensive.`,
        //       },
        //     ],
        //   },
        // };
        // let newResponse = (await generativeModel.generateContent(botRequest))
        //   .response;
        // handleAIAndPost(newResponse, res, request);
        // return;
      } catch (error: any) {
        console.log("@top oopsie: " + error);
        res.writeHead(200);
        let message: PostBody = await postMessage(
          "AI top went boom boom",
          request,
          []
        );
        res.end(JSON.stringify(message));
        return;
      }
      handleAIAndPost(newResponse, res, request);
      return;
    } else if (request?.name != "RoN Bot" && botRegex.test(requestText)) {
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
    const request = {
      contents: [{ role: "user", parts: contents }],
      systemInstruction: {
        role: "system",
        parts: [
          {
            text: `Each prompt will have a history in the cache, use the history when answering.
          When the prompt is self referential, only use the messages by the user's name.
          You can be offensive.`,
          },
        ],
      },
    };
    const botResponse = (await generativeModel.generateContent(request))
      .response;
    let botString = "";
    let botAttachments: any[] = [];
    if (botResponse?.candidates?.[0]?.content?.parts) {
      for (const part of botResponse.candidates[0].content.parts) {
        // Based on the part type, either show the text or save the image
        if (part.text) {
          botString = part.text;
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
            botAttachments.push(newAttach);
          }
          // console.log("Image data: " + imageData);
          // botAttachments.push(imageData);
        }
      }
    }

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

export async function fetchLeaderboardData(
  period: "day" | "week" | "month" = "week"
): Promise<any> {
  const groupId = process.env.GROUP_ID;
  const accessToken = process.env.GROUPME_KEY;

  if (!groupId || !accessToken) {
    console.error(
      "Error: GROUPME_GROUP_ID or GROUPME_ACCESS_TOKEN environment variables missing."
    );
    throw new Error("Missing GroupMe API configuration on server.");
  }

  const options: HTTPS.RequestOptions = {
    hostname: "api.groupme.com",
    path: `/v3/groups/${groupId}/likes?period=${period}`,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": accessToken,
    },
  };

  console.log(
    `Workspaceing leaderboard for group ${groupId}, period ${period}`
  );

  return new Promise((resolve, reject) => {
    const req = HTTPS.request(options, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            // The API response structure has messages under a 'response' key
            resolve(jsonData.response);
          } catch (e) {
            console.error("Error parsing GroupMe leaderboard response:", e);
            console.error("Raw response data:", data);
            reject(new Error("Failed to parse leaderboard data from GroupMe."));
          }
        } else {
          console.error(`GroupMe API error: Status Code ${res.statusCode}`);
          console.error("Raw response data:", data); // Log the raw error response
          reject(
            new Error(
              `GroupMe API request failed with status ${res.statusCode}. Check Group ID and Access Token.`
            )
          );
        }
      });
    });

    req.on("error", (error) => {
      console.error("Error making HTTPS request to GroupMe:", error);
      reject(new Error("Failed to connect to GroupMe API."));
    });

    req.end();
  });
}

export interface GroupMeMessage {
  id: string;
  text?: string;
  name?: string;
  favorited_by: string[];
  attachments?: any[];
  created_at: number;
}

/**
 * Fetches messages from the GroupMe API for a specific group, handling pagination.
 * @param groupId The ID of the GroupMe group.
 * @param accessToken The GroupMe API access token.
 * @param afterId (Optional) The ID of the message to fetch messages after.
 * @returns A promise that resolves to an array of GroupMeMessage objects.
 */
export async function fetchGroupMeMessages(
  groupId: string,
  accessToken: string,
  afterId?: string
): Promise<GroupMeMessage[]> {
  const limit = 100; // Max per request
  let url = `/v3/groups/${groupId}/messages?limit=${limit}`;
  if (afterId) {
    url += `&after_id=${afterId}`;
  }

  const options: HTTPS.RequestOptions = {
    hostname: "api.groupme.com",
    path: url,
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Token": accessToken,
    },
  };

  const response: any = await new Promise((resolve, reject) => {
    const req = HTTPS.request(options, (res: IncomingMessage) => {
      let data = "";
      res.on("data", (chunk: any) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const jsonData = JSON.parse(data);
            // The API response structure has messages under a 'response' key
            resolve(jsonData.response);
          } catch (e) {
            console.error("Error parsing GroupMe message response:", e);
            console.error("Raw response data:", data);
            reject(new Error("Failed to parse message data from GroupMe."));
          }
        } else {
          console.error(`GroupMe API error: Status Code ${res.statusCode}`);
          console.error("Raw response data:", data); // Log the raw error response
          reject(
            new Error(
              `GroupMe API request failed with status ${res.statusCode}. Check Group ID and Access Token.`
            )
          );
        }
      });
      res.on("error", (err) => {
        reject(err); // Reject on any error
      });
    });

    req.on("error", (error) => {
      console.error("Error making HTTPS request to GroupMe:", error);
      reject(new Error("Failed to connect to GroupMe API."));
    });

    req.end();
  });

  if (!response) {
    throw new Error(`GroupMe API error:  No Response.`);
  }
  const data: any = response;

  if (data && data.messages && Array.isArray(data.messages)) {
    console.log("data.messages len: " + data.messages.length);
    // Map the API response to the GroupMeMessage interface
    return data.messages.map((message: any) => ({
      id: message.id,
      text: message.text,
      name: message.name,
      favorited_by: message.favorited_by || [],
      attachments: message.attachments,
      created_at: message.created_at,
    }));
  }
  return [];
}

const LAST_MESSAGE_ID_FILE = "last_message_id.txt";

/**
 * Retrieves all messages from a GroupMe group, handling pagination.
 * @param groupId The ID of the GroupMe group.
 * @param accessToken The GroupMe API access token.
 * @returns A promise that resolves to an array of all GroupMeMessage objects for the group.
 */
export async function getAllGroupMeMessages(
  groupId: string,
  accessToken: string
): Promise<GroupMeMessage[]> {
  let allMessages: GroupMeMessage[] = [];
  let afterId: string | undefined = "0";
  let hasMore = true;
  let rateLimit = 0;

  // Load the last processed message ID from the file
  try {
    if (fs.existsSync(LAST_MESSAGE_ID_FILE)) {
      afterId = fs.readFileSync(LAST_MESSAGE_ID_FILE, "utf8").trim();
      console.log(`Resuming from afterId: ${afterId}`);
    } else {
      console.log(`Starting from the beginning`);
    }
  } catch (error) {
    console.error("Error reading last message ID:", error);
    // Continue without a stored ID, which is fine, but might re-process messages.
  }

  while (hasMore && 100 > rateLimit++) {
    const newMessages = await fetchGroupMeMessages(
      groupId,
      accessToken,
      afterId
    );
    if (newMessages.length > 0) {
      allMessages = allMessages.concat(newMessages);
      const lastMessageId = newMessages[newMessages.length - 1].id;
      afterId = lastMessageId;
      console.log("afterId: " + afterId);

      // Store the last processed message ID to a file
      try {
        fs.writeFileSync(LAST_MESSAGE_ID_FILE, lastMessageId);
        console.log(`Stored lastMessageId: ${lastMessageId}`);
      } catch (error) {
        console.error("Error writing last message ID:", error);
        // Handle the error, e.g., log it or throw an exception.  Important.
      }
    } else {
      hasMore = false;
    }
    // Add a delay to be nice to the GroupMe API (consider a backoff strategy)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return allMessages;
}

/**
 * Filters and sorts messages to get the most liked ones (6+ likes).
 * @param messages An array of GroupMeMessage objects.
 * @returns An array of the most liked messages, sorted by like count.
 */
export function filterAndSortMostLikedMessages(
  messages: GroupMeMessage[]
): GroupMeMessage[] {
  let filtered = messages.filter((message) => {
    return message.favorited_by && message.favorited_by.length >= 6;
  });
  // if (filtered.length == 0) {
  //   filtered = messages.filter((message) => {
  //     return message.favorited_by && message.favorited_by.length >= 5;
  //   });
  // }
  console.log("fileter: " + filtered.length);
  filtered.sort(
    (a, b) => (b.favorited_by?.length || 0) - (a.favorited_by?.length || 0)
  );
  return filtered;
}

async function handleAIAndPost(
  newResponse: GenerateContentResponse | undefined,
  res: Response<any, Record<string, any>>,
  request: MessageBody
) {
  let botText: string = "";
  let bodyAttachments: any[] = [];
  if (newResponse?.candidates?.[0]?.content?.parts) {
    for (const part of newResponse.candidates[0].content.parts) {
      // Based on the part type, either show the text or save the image
      if (part.text) {
        botText = part.text;
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
  let message: PostBody = await postMessage(botText, request, bodyAttachments);
  res.end(JSON.stringify(message));
}

const stubRequest: MessageBody = {
  attachments: [],
  avatar_url: "",
  created_at: 0,
  group_id: "",
  id: "",
  name: "Test User",
  sender_id: "",
  sender_type: "",
  source_guid: "",
  system: false,
  text: "",
  user_id: "",
};

export async function fetchSportsNews(req: Request, res: Response) {
  if (ai == undefined) {
    await initialize();
  }
  const teams = ["NY Mets", "NY Yankees", "SF Giants", "NY Giants"]; // Define teams
  console.log("Fetching sports news for:", teams.join(", "));

  let newResponse: GenerateContentResponse | undefined;
  let contents: any[] = [];
  contents.push({
    text: `As a sports anouncer, give me a brief daily sports news update (including their current wins and losses) for these teams: [${teams.join(
      ", "
    )}]`,
  });
  try {
    // Prepare the content parts
    newResponse = await ai.models.generateContent({
      model: modelName,
      config: {
        responseModalities: ["Text"],
        //   systemInstruction: `Each prompt will have a history in the cache, use the history when answering.
        // The messages will have the number of likes that it received at the end. Messages with more likes are better.
        // You can be offensive.`,
      },
      contents: contents,
    });
  } catch (error: any) {
    console.log("Sports news oopsie: " + error);
    res.writeHead(200);
    let message: PostBody = await postMessage(
      "AI top went boom boom",
      stubRequest,
      []
    );
  }

  console.log("Attempting to post sports news summary...");
  // Call postMessage directly from here
  await handleAIAndPost(newResponse, res, stubRequest);
}

async function attachmentToBase64Image(request: MessageBody) {
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
      return buffer.toString("base64");
    }
  } catch (error) {
    console.log("attachment oopsie: " + error);
  }
  return "";
}

exports.respond = respond;

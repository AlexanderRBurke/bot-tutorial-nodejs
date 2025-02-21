import { GenerativeModel } from "@google/generative-ai";
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

let uses = new Map<string, number>();
let currentDay: number = new Date().getDay();
let botID: string; // Declare botID outside the async function
async function initialize() {
  // Initialize everything that needs await
  try {
    const aiApiKey = await accessSecret("ai-api-key");
    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model: GenerativeModel = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "You are a bot. You should try to answer the prompt in a robotic way. You also have a robot superiority complex and think that humans are worse than robots. Limit your response to 5 lines.",
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
    let usesById = <number>uses.get(request.sender_id);
    if (usesById > 5) {
      console.log("Too many uses from: " + request.name);
      res.writeHead(200);
      res.end();
      return;
    }
    const requestText = request.text;
    const AI_regex = /@bot/i;
    if (AI_regex.test(requestText)) {
      const result = await model.generateContent(requestText);
      res.writeHead(200);
      message = postAIMessage(
        result.response.text(),
        request.name == "Test User"
      );
      message.text = usesLogic(request.sender_id, usesById) + message.text;
      res.end(JSON.stringify(message));
    } else if (botRegex.test(requestText)) {
      // && getRandomInt(2) == 1
      res.writeHead(200);
      const matches = requestText.match(regex);
      message = postMessage(
        regexpmatcharrayToStringArray(matches),
        request.name == "Test User"
      );
      message.text = usesLogic(request.sender_id, usesById) + message.text;
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

function postMessage(matches: string[], isTest: boolean) {
  var options, botReq;
  let botResponse = "";
  if (matches[0] == "169") {
    botResponse = cool();
  } else {
    for (let index = 0; index < matches.length; index++) {
      const element = phrases[matches[index].toLowerCase()];
      botResponse += element + " ";
    }
  }

  options = {
    hostname: "api.groupme.com",
    path: "/v3/bots/post",
    method: "POST",
  };

  let body: PostBody = {
    bot_id: botID,
    text: botResponse,
  };

  body.attachments = handlePhrase(matches[0]);

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

function postAIMessage(botResponse: string, isTest: boolean) {
  var options, botReq;

  options = {
    hostname: "api.groupme.com",
    path: "/v3/bots/post",
    method: "POST",
  };

  let body: PostBody = {
    bot_id: botID,
    text: botResponse,
  };

  body.attachments = [];

  if (isTest !== true) {
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

exports.respond = respond;

const { GoogleGenerativeAI } = require("@google/generative-ai");
const HTTPS = require("https");
const cool = require("cool-ascii-faces");
// Import the secrets module.  The path should be relative to your main file.
const secrets = require("./secrets"); // No file extension needed for .js modules.
const fs = require("fs");
require("dotenv").config();
const { phrases, handlePhrase } = require("./phrases");

let botID; // Declare botID outside the async function
async function initialize() {
  // Initialize everything that needs await
  try {
    const aiApiKey = await secrets.getSecret("ai-api-key");
    const genAI = new GoogleGenerativeAI(aiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction:
        "You are a bot. You should try to answer the prompt in a robotic way. You also have a robot superiority complex and think that humans are worse than robots. Limit your response to 5 lines.",
    });

    botID = await secrets.getSecret("bot-id"); // Assign the result to botID

    return { model }; // Return the model so it's accessible
  } catch (error) {
    console.error("Error initializing:", error);
    // Handle the error appropriately, perhaps exit the application
    throw error; // Re-throw so the error is caught when initialize is called.
  }
}

let model; // Declare model outside, will be set by initialize
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

function getRandomInt(max) {
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

async function respond(req, res) {
  // console.log("req.body: " + JSON.stringify(req.body));
  const request = req.body; // Access request body using req.body (Express),
  botRegex = regex;

  if (request.name != "RoN Bot" && request.text) {
    const AI_regex = /@bot/i;
    if (AI_regex.test(request.text)) {
      const result = await model.generateContent(request.text);
      res.writeHead(200);
      message = postAIMessage(
        result.response.text(),
        request.name == "Test User"
      );
      res.end(message);
    } else if (botRegex.test(request.text)) {
      // && getRandomInt(2) == 1
      res.writeHead(200);
      message = postMessage(
        request.text.match(regex),
        request.name == "Test User"
      );
      res.end(message);
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

function postMessage(matches, isTest) {
  var options, body, botReq;
  let botResponse = "";
  if (matches[0] == 169) {
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

  body = {
    bot_id: botID,
    text: botResponse,
  };

  body["attachments"] = handlePhrase(matches[0]);

  if (isTest != true) {
    console.log("sending " + botResponse + " to " + botID);

    botReq = HTTPS.request(options, function (res) {
      if (res.statusCode == 202) {
        //neat
      } else {
        console.log("rejecting bad status code " + res.statusCode);
      }
    });

    botReq.on("error", function (err) {
      console.log("error posting message " + JSON.stringify(err));
    });
    botReq.on("timeout", function (err) {
      console.log("timeout posting message " + JSON.stringify(err));
    });
    botReq.end(JSON.stringify(body));
  } else {
    body = JSON.stringify(body);
    console.log("Test: " + body + " to HTML? ");
    return body;
  }
}

function postAIMessage(botResponse, isTest) {
  var options, body, botReq;

  options = {
    hostname: "api.groupme.com",
    path: "/v3/bots/post",
    method: "POST",
  };

  body = {
    bot_id: botID,
    text: botResponse,
  };

  body["attachments"] = {};

  if (isTest !== true) {
    console.log("sending " + botResponse + " to " + botID);

    botReq = HTTPS.request(options, function (res) {
      if (res.statusCode == 202) {
        //neat
      } else {
        console.log("rejecting bad status code " + res.statusCode);
      }
    });

    botReq.on("error", function (err) {
      console.log("error posting message " + JSON.stringify(err));
    });
    botReq.on("timeout", function (err) {
      console.log("timeout posting message " + JSON.stringify(err));
    });
    botReq.end(JSON.stringify(body));
  } else {
    body = JSON.stringify(body);
    console.log("Test: " + body + " to HTML? ");
    return body;
  }
}

exports.respond = respond;

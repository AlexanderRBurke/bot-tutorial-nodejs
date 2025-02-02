var HTTPS = require('https');
var cool = require('cool-ascii-faces');

var botID = "";

const phrases = {
  0: "RoN?",
  "can't": "Riiiiiiiight.",
  "time": "Time is a tool you can put on the wall, Or wear it on your wrist.",
  "where": "I know Where mine are.",
  1: "Yes.",
  2: "No.",
  3: "Maybe.",
  4: "I need Food.",
  5: "I need Timber.",
  6: "I need Metal.",
  7: "I need Wealth.",
  8: "I need Oil.",
  9: "I need Knowledge.",
  10: "Do you need resources?",
  11: "Little help here...",
  12: "This noob's rushing me.",
  13: "Build more troops.",
  14: "Build a wonder.",
  15: "Work on your economy.",
  16: "Work on your air force.",
  17: "Work on your navy.",
  18: "Wait for my signal to attack.",
  19: "Attack!",
  20: "Let's get 'em.",
  21: "Guard my artillery.",
  22: "Move troops here.",
  23: "Grab some territory.",
  24: "Gonna boom.",
  25: "Gonna rush.",
  26: "Wanna ally?",
  27: "Wanna make peace?",
  28: "Of course you know, this means war...",
  29: "Pay up or die.",
  30: "Prepare to be crushed.",
  31: "Who shall we attack?",
  32: "When shall we attack?",
  33: "Where's the enemy?",
  34: "They've got air power.",
  35: "Ships ahoy!",
  36: "I spy a spy.",
  37: "Rare resources for the taking.",
  38: "The city is going down.",
  39: "Check out the timer.",
  40: "Let's set up shop.",
  41: "Wanna bet?",
  42: "It's on.",
  43: "Was that supposed to hurt?",
  44: "Have you fixed your little problem?",
  45: "Good luck with that.",
  46: "Let me know how that works out for you.",
  47: "I may be slow, but I'm ahead of you.",
  48: "Classy.",
  49: "Play the tutorials, noob.",
  50: "Wake me up when you're done.",
  51: "Get outta my face.",
  52: "Leave me alone.",
  53: "'Cause you need that.",
  54: "Is it over yet?",
  55: "Do your parents know you're up this late?",
  56: "You okay over there?",
  57: "And stay out!",
  58: "Bwa ha ha ha ha!",
  59: "Have fun stormin the castle.",
  60: "Random! Random!",
  61: "RanDOM! RanDOM!",
  62: "Let the game begin.",
  63: "Dude, we know who you're going to take. Just pick 'em and get on with it.",
  64: "Which part of 'Click in' didn't you understand?",
  65: "What's the holdup?",
  66: "Ahhh.",
  67: "Unh Unh Unh.",
  68: "Ohhh.",
  69: "Ughhhhhhhh.",
  70: "Unh!",
  71: "We're doomed!",
  72: "Wanna give up?",
  73: "Victory is mine!",
  74: "Oww! My eye!",
  75: "Not in the face! Not in the face!",
  76: "Coming.",
  77: "Be right there.",
  78: "On my way.",
  79: "I'm trying to send some help.",
  80: "Gotcha covered.",
  81: "Check.",
  82: "It shall be done.",
  83: "Let me get right on that.",
  84: "Sweet.",
  85: "You da man.",
  86: "That's what I'm talking about.",
  87: "Consider it taken care of.",
  88: "Sounds like a plan.",
  89: "Groovy.",
  90: "Red",
  91: "Blue",
  92: "Purple",
  93: "Green",
  94: "Yellow",
  95: "Light Blue",
  96: "White",
  97: "Orange",
  98: "Aaaaagh! The Humanity!",
  99: "Let me get that for you.",
  100: "They keep on rising!",
  101: "I am down, with a squad.",
  111: "Shave his belly with a rusty razor.",
  112: "Put him in the brig with the captain's daughter.",
  144: "Have you fixed your little cock yet?"
};

// Create the regex dynamically:
const regexString = Object.keys(phrases).map(key => {
  // Escape special regex characters in the keys
  const escapedKey = key.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');  // escape regex special chars
  return escapedKey;
}).join('|');

const regex = new RegExp(`\\b(${regexString})\\b`, 'g');

function respond() {
  var request = JSON.parse(this.req.chunks[0]),
    botRegex = regex;

  if (request.text && botRegex.test(request.text)) {
    this.res.writeHead(200);
    postMessage(request.text.match(regex));
    this.res.end();
  } else {
    console.log("don't care");
    this.res.writeHead(200);
    this.res.end();
  }
}

function postMessage(matches) {
  var options, body, botReq;
  let botResponse = "";
  if (matches[0] == 169) {
    botResponse = cool();
  } else {
    for (let index = 0; index < matches.length; index++) {
      const element = phrases[matches[index]];
      botResponse += element + " ";
    }
  }

  options = {
    hostname: 'api.groupme.com',
    path: '/v3/bots/post',
    method: 'POST'
  };

  body = {
    "bot_id": botID,
    "text": botResponse
  };

  console.log('sending ' + botResponse + ' to ' + botID);

  botReq = HTTPS.request(options, function (res) {
    if (res.statusCode == 202) {
      //neat
    } else {
      console.log('rejecting bad status code ' + res.statusCode);
    }
  });

  botReq.on('error', function (err) {
    console.log('error posting message ' + JSON.stringify(err));
  });
  botReq.on('timeout', function (err) {
    console.log('timeout posting message ' + JSON.stringify(err));
  });
  botReq.end(JSON.stringify(body));
}


exports.respond = respond;
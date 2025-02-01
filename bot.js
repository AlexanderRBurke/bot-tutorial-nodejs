var HTTPS = require('https');
var cool = require('cool-ascii-faces');

var botID = "";

const phrases = {
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
  100: "They keep on rising!"
};

const regex = /\b(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27|28|29|30|31|32|33|34|35|36|37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65|66|67|68|69|70|71|72|73|74|75|76|77|78|79|80|81|82|83|84|85|86|87|88|89|90|91|92|93|94|95|96|97|98|99|100)\b/g;

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
  var botResponse, options, body, botReq;

  botResponse = phrases[matches[0]]; //cool();

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
(function () {
  "use strict";

  var SPRITES = {
    closed:      "mascot/hanya_closed.webp",       // рот закрыт
    open:        "mascot/hanya_open.webp",         // рот открыт
    closedBlink: "mascot/hanya_closed_blink.webp", // мигает, рот закрыт
    openBlink:   "mascot/hanya_open_blink.webp"    // мигает, рот открыт
  };

  // Длительность каждой гласной — время, на которое рот остаётся открытым.
  var VOWEL_TIMING = { а: 118, е: 96, ё: 128, и: 84, о: 132, у: 116, ы: 116, э: 112, ю: 120, я: 118 };
  // Согласные, пробелы и знаки препинания дают закрытые интервалы разной длины.
  var CONSONANT_TIMING = { б: 62, в: 58, г: 56, д: 58, ж: 66, з: 54, й: 48, к: 56, л: 72, м: 66, н: 62, п: 64, р: 74, с: 54, т: 54, ф: 58, х: 58, ц: 62, ч: 64, ш: 66, щ: 70 };
  var SPACE_TIMING = 145;
  var PUNCTUATION_TIMING = { ",": 220, ".": 360, "!": 410, "?": 410, "…": 480, ":": 240, ";": 250, "-": 210 };
  var AFTER_SPEECH_MS = 6000;   // сколько висит пузырь после конца реплики
  var BLINK_MS = 145;           // длительность мигания
  var BLINK_EVERY = [2500, 5000]; // мигание раз в 2.5–5 секунд

  // может текст поменяю на эти тайминги
  var TEXT_TIMING = {
  letter: 60,       // обычные буквы
  space: 70,        // пробелы
  comma: 130,       // запятая
  punctuation: 210  // точка, вопросительный знак и т.д.
};

  function characterTiming(character) {
    var ch = String(character || "").toLowerCase();
    if (/\s/.test(ch)) return { duration: SPACE_TIMING, open: false };
    if (Object.prototype.hasOwnProperty.call(PUNCTUATION_TIMING, ch)) return { duration: PUNCTUATION_TIMING[ch], open: false };
    if (Object.prototype.hasOwnProperty.call(VOWEL_TIMING, ch)) return { duration: VOWEL_TIMING[ch], open: true };
    return { duration: CONSONANT_TIMING[ch] || 56, open: false };
  }

  var button, bubble, bubbleText, buttonImg, fallback;
  var mouthOpen = false, blinking = false;
  var spritesReady = false;
  var speechTimers = [];
  var hideTimer = null;
  var blinkTimer = null, blinkResetTimer = null;
  var playToken = 0;
  var phraseBags = Object.create(null);
  var lastSpokenLine = null;
  var currentSpeechText = "";

  var img = {};
  ["closed", "open", "closedBlink", "openBlink"].forEach(function (key) {
    img[key] = new Image();
    img[key].src = SPRITES[key];
  });

  function build() {
    button = document.createElement("button");
    button.type = "button";
    button.className = "honey-button";
    button.setAttribute("aria-label", "Позвать Ханю — реплики помощницы");
    buttonImg = document.createElement("img");
    buttonImg.className = "honey-button-img";
    buttonImg.alt = "";
    buttonImg.hidden = true;
    button.appendChild(buttonImg);
    button.addEventListener("click", function () { say("click"); });

    var sprite = document.createElement("div");
    sprite.className = "honey-sprite";
    sprite.appendChild(button);

    bubble = document.createElement("div");
    bubble.className = "honey-bubble";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.hidden = true;
    bubbleText = document.createElement("p");
    bubbleText.className = "honey-text";
    bubble.appendChild(bubbleText);
    bubble.addEventListener("click", skipSpeech);

    document.body.appendChild(bubble);
    document.body.appendChild(sprite);

    loadSprites();
  }

  function loadSprites() {
    var closed = img.closed, open = img.open;
    function check() {
      if (spritesReady) return;
      spritesReady = closed.complete && open.complete && closed.naturalWidth > 0 && open.naturalWidth > 0;
      if (spritesReady) {
        button.classList.remove("honey-no-sprite");
        if (fallback) fallback.hidden = true;
        renderSprite();
      }
    }
    closed.onload = open.onload = check;
    closed.onerror = open.onerror = function () {
      spritesReady = false;
      button.classList.add("honey-no-sprite");
      buttonImg.hidden = true;
      if (!fallback) {
        fallback = document.createElement("span");
        fallback.className = "honey-fallback";
        fallback.textContent = "Ханя";
        button.appendChild(fallback);
      }
    };
  }

  function renderSprite() {
    if (!spritesReady) return;
    var file = blinking
      ? (mouthOpen ? SPRITES.openBlink : SPRITES.closedBlink)
      : (mouthOpen ? SPRITES.open : SPRITES.closed);
    if (buttonImg.getAttribute("src") !== file) buttonImg.src = file;
    buttonImg.hidden = false;
  }

  function setMouth(open) {
    mouthOpen = !!open;
    renderSprite();
    if (!spritesReady) button.classList.toggle("honey-talking", mouthOpen);
  }

  function setBlink(blink) {
    blinking = !!blink;
    renderSprite();
  }


  function stopBlink() {
    clearTimeout(blinkTimer); clearTimeout(blinkResetTimer);
    blinkTimer = blinkResetTimer = null;
  }
  function scheduleBlink() {
    stopBlink();
    blinkTimer = setTimeout(function () {
      setBlink(true);
      blinkResetTimer = setTimeout(function () {
        setBlink(false);
        scheduleBlink();
      }, BLINK_MS);
    }, BLINK_EVERY[0] + Math.floor(Math.random() * (BLINK_EVERY[1] - BLINK_EVERY[0])));
  }

  function pick(list, queueKey) {
    if (!list || !list.length) return null;

    var uniqueLines = Array.from(new Set(list.map(function (item) {
      return String(item || "").trim();
    }).filter(Boolean)));
    if (!uniqueLines.length) return null;

    var signature = uniqueLines.join("\u001f");
    var bag = phraseBags[queueKey];

    if (!bag || bag.signature !== signature) {
      bag = phraseBags[queueKey] = { signature: signature, queue: [] };
    }

    if (!bag.queue.length) {
      bag.queue = uniqueLines.slice();

      for (var i = bag.queue.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = bag.queue[i];
        bag.queue[i] = bag.queue[j];
        bag.queue[j] = temp;
      }

      if (bag.queue.length > 1 && bag.queue[bag.queue.length - 1] === lastSpokenLine) {
        var replacementIndex = bag.queue.findIndex(function (item) {
          return item !== lastSpokenLine;
        });
        if (replacementIndex >= 0) {
          var replacement = bag.queue[replacementIndex];
          bag.queue[replacementIndex] = bag.queue[bag.queue.length - 1];
          bag.queue[bag.queue.length - 1] = replacement;
        }
      }
    }

    var nextIndex = bag.queue.length - 1;
    if (bag.queue[nextIndex] === lastSpokenLine) {
      var alternativeIndex = -1;
      for (var k = bag.queue.length - 2; k >= 0; k--) {
        if (bag.queue[k] !== lastSpokenLine) {
          alternativeIndex = k;
          break;
        }
      }
      if (alternativeIndex < 0) return null;
      var alternative = bag.queue[alternativeIndex];
      bag.queue[alternativeIndex] = bag.queue[nextIndex];
      bag.queue[nextIndex] = alternative;
    }

    var line = bag.queue.pop();
    lastSpokenLine = line;
    return line;
  }

  function say(category) {
    var L = window.HONEY_LINES || {};
    var line = null;
    if (category === "tab") {
      var active = document.querySelector(".tab-link.is-active");
      var tabKey = active ? active.getAttribute("data-tab") : null;
      var set = L.tab || {};
      line = pick(tabKey && set[tabKey], "tab:" + tabKey) || pick(set.general, "tab:general");
    } else {
      line = pick(L[category], category);
    }
    if (line) speak(line);
  }

  function clearSpeech() {
    speechTimers.forEach(clearTimeout);
    speechTimers = [];
  }

  function speak(text) {
    playToken++;
    var token = playToken;
    clearSpeech();
    clearTimeout(hideTimer);
    setMouth(false);

    currentSpeechText = String(text);
    bubbleText.textContent = "";
    bubble.hidden = false;
    scheduleBlink();

    var chars = Array.prototype.slice.call(String(text));
    var elapsed = 0;
    chars.forEach(function (character) {
      var step = characterTiming(character);
      (function (delay, open) {
        speechTimers.push(setTimeout(function () {
          if (token !== playToken) return;
          setMouth(open);
        }, delay));
      })(elapsed, step.open);
      elapsed += step.duration;
      var shown = elapsed;
      speechTimers.push(setTimeout(function () {
        if (token !== playToken) return;
        bubbleText.textContent += character;
      }, Math.max(0, shown - 70)));
    });

    speechTimers.push(setTimeout(function () {
      if (token !== playToken) return;
      setMouth(false);
    }, elapsed));

    hideTimer = setTimeout(function () {
      if (token === playToken) bubble.hidden = true;
    }, elapsed + AFTER_SPEECH_MS);
  }

  function skipSpeech() {
    playToken++;
    clearSpeech();
    bubbleText.textContent = currentSpeechText;
    setMouth(false);
    scheduleBlink();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { bubble.hidden = true; }, AFTER_SPEECH_MS);
  }

  function getTextDelay(character) {
    if (/\s/.test(character)) return TEXT_TIMING.space;
    if (character === ",") return TEXT_TIMING.comma;

    if (/[.!?…:;—-]/.test(character)) {
      return TEXT_TIMING.punctuation;
    }

    return TEXT_TIMING.letter;
  }

  function init() {
    build();
    scheduleBlink();

    // Приветствие
    var hour = new Date().getHours();
    setTimeout(function () { say(hour >= 22 || hour < 6 ? "night" : "greeting"); }, 700);

    // Реплика при переключении вкладок
    document.addEventListener("site:tabchange", function () { say("tab"); });

    // Реплика при скачивании
    document.addEventListener("click", function (e) {
      var btn = e.target.closest(".button-download");
      if (btn) say("download");
    });

    // Реплика если 45 секунд нет активности
    var idleTimer;
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { say("idle"); }, 45000);
    }
    ["click", "scroll", "keydown", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, resetIdle, { passive: true });
    });
    resetIdle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

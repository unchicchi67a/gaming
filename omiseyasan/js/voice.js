/**
 * 語りとせりふの読み上げ。ブラウザの音声合成（Web Speech API）を使う。
 *
 * 声の質は端末に入っている音声で決まるため、自然に聞こえる声（ニューラル音声）を優先して選ぶ。
 *   - Edge：Microsoft Nanami / Keita など「Online (Natural)」の声
 *   - Chrome：Google 日本語
 *   - iPhone / iPad / Mac：Kyoko・O-ren などの「拡張」「プレミアム」の声
 * 声の高さを大きく変えると機械っぽくなるため、話す人ごとの違いはごく小さくしている。
 * また、ひらがなの分かち書きのスペースで読み上げが途切れないよう、読む前にスペースを取り除く。
 *
 * 日本語の声がない端末や、読み上げを切っているときは、文字の長さに応じて待つだけにする。
 */
(function (root) {
  'use strict';

  /** 語り手の声。お客さんは say() に { pitch, rate } を渡して声の高さを変える。 */
  const NARRATOR = { pitch: 1.0, rate: 0.92 };

  const synth = root.speechSynthesis || null;
  let enabled = true;
  let voices = [];
  let chosen = null;
  let preferredName = '';
  let current = null;
  const listeners = [];

  const isJa = (v) => /^ja([-_]|$)/i.test(v.lang);

  /** 声の自然さの点数。大きいほど優先する。 */
  function score(v) {
    const n = v.name;
    let s = 0;
    if (/natural|neural/i.test(n)) s += 100;
    if (/online/i.test(n)) s += 30;
    if (/premium|enhanced|拡張|プレミアム/i.test(n)) s += 80;
    if (/google/i.test(n)) s += 60;
    if (/nanami|keita|aoi|daichi|mayu|naoki|shiori/i.test(n)) s += 20;
    if (/o-?ren|kyoko|hattori/i.test(n)) s += 15;
    if (/compact|eloquence|espeak/i.test(n)) s -= 80;
    if (/ayumi|haruka|ichiro|sayaka/i.test(n) && !/natural/i.test(n)) s -= 10;
    return s;
  }

  function refresh() {
    if (!synth) return;
    voices = synth.getVoices().filter(isJa).sort((a, b) => score(b) - score(a));
    chosen = voices.find((v) => v.name === preferredName) || voices[0] || null;
    listeners.forEach((fn) => fn());
  }
  if (synth) {
    refresh();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refresh);
    else synth.onvoiceschanged = refresh;
  }

  /** 読み上げ用に整える：分かち書きのスペースを取り、音が途切れないようにする。 */
  function speakable(text) {
    return text.replace(/[ 　]+/g, '');
  }

  /** 読み上げなしで待つ時間（ミリ秒）。 */
  function readingTime(text) {
    return 900 + text.length * 120;
  }

  const Voice = {
    get available() { return !!(synth && chosen); },
    get enabled() { return enabled; },
    /** 選べる日本語の声（自然な順）。 */
    get voices() { return voices.map((v) => v.name); },
    get voiceName() { return chosen ? chosen.name : ''; },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) Voice.cancel();
    },
    /** 声を名前で選ぶ。空文字ならいちばん自然な声を自動で選ぶ。 */
    setVoice(name) {
      preferredName = name || '';
      refresh();
    },
    onVoicesChanged(fn) { listeners.push(fn); },

    /** iOS などでは最初の読み上げをユーザー操作の中で行う必要があるため、操作時に呼ぶ。 */
    unlock() {
      if (!synth || !enabled) return;
      refresh();
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        synth.speak(u);
      } catch (e) { /* 読み上げが使えなくても遊べる */ }
    },

    /**
     * 読み終わったら（または待ち時間が過ぎたら）解決する Promise を返す。
     * style：{ pitch, rate }（省略すると語り手の声）
     */
    say(text, style) {
      if (!synth || !enabled || !chosen) {
        return new Promise((resolve) => {
          current = { cancel: resolve };
          setTimeout(resolve, readingTime(text));
        });
      }
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve();
        };
        const u = new SpeechSynthesisUtterance(speakable(text));
        const st = Object.assign({}, NARRATOR, style || {});
        u.lang = chosen.lang || 'ja-JP';
        u.voice = chosen;
        u.pitch = st.pitch;
        u.rate = st.rate;
        u.onend = finish;
        u.onerror = finish;
        // onend が届かない端末があるので、長めの待ち時間で打ち切る
        const timer = setTimeout(finish, text.length * 350 + 3000);
        current = { cancel: finish };
        synth.speak(u);
      });
    },

    cancel() {
      if (synth) synth.cancel();
      if (current) current.cancel();
      current = null;
    },
  };

  root.ShopVoice = Voice;
})(typeof self !== 'undefined' ? self : this);

/**
 * 語りとせりふの読み上げ。
 *
 * ふだんは VOICEVOX（冥鳴ひまり）であらかじめつくった音声ファイル（voice/*.mp3）を再生する。
 * せりふと音声ファイルの対応は js/voice-lines.js（tools/voicevox/generate.js が自動でつくる）。
 * 対応表にないせりふ・再生できなかったとき・設定で端末の声を選んだときは、
 * ブラウザの音声合成（Web Speech API）で読み上げる。
 *
 * 端末の声の質は端末に入っている音声で決まるため、自然に聞こえる声（ニューラル音声）を優先して選ぶ。
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

  /** VOICEVOX でつくった音声の対応表。端末の声を選んでいない（preferredName が空の）ときに使う。 */
  const LINES = root.ShopVoiceLines || null;
  const canPlayFile = typeof root.Audio === 'function';
  let audio = null;

  function recordedFile(text) {
    if (preferredName || !LINES || !canPlayFile) return null;
    return LINES.files[speakable(text)] || null;
  }

  /**
   * 音声ファイルを再生し、終わったら解決する Promise を返す。
   * 再生できなかったときは fallback()（端末の声での読み上げ）に切りかえる。
   */
  function playFile(file, text, fallback) {
    if (!audio) audio = new root.Audio();
    const el = audio;
    return new Promise((resolve) => {
      let done = false;
      const end = () => {
        clearTimeout(timer);
        el.onended = null;
        el.onerror = null;
      };
      const finish = () => {
        if (done) return;
        done = true;
        end();
        resolve();
      };
      const fail = () => {
        if (done) return;
        done = true;
        end();
        fallback().then(resolve);
      };
      el.onended = finish;
      el.onerror = fail;
      el.muted = false;
      el.src = LINES.base + file;
      // ended が届かない端末があるので、長めの待ち時間で打ち切る
      const timer = setTimeout(finish, text.length * 350 + 5000);
      current = { cancel() { el.pause(); finish(); } };
      let p;
      try { p = el.play(); } catch (e) { fail(); return; }
      if (p && typeof p.catch === 'function') p.catch(fail);
    });
  }

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
    get available() { return Voice.recorded || !!(synth && chosen); },
    /** VOICEVOX でつくった音声を使えるか。 */
    get recorded() { return !!(LINES && canPlayFile); },
    /** 音声のクレジット表記。 */
    get credit() { return LINES ? LINES.credit : ''; },
    get enabled() { return enabled; },
    /** 選べる日本語の声（自然な順）。 */
    get voices() { return voices.map((v) => v.name); },
    get voiceName() { return chosen ? chosen.name : ''; },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) Voice.cancel();
    },
    /**
     * 声を名前で選ぶ。空文字なら VOICEVOX の音声を使う
     * （対応表にないせりふは、端末のいちばん自然な声で読み上げる）。
     */
    setVoice(name) {
      preferredName = name || '';
      refresh();
    },
    onVoicesChanged(fn) { listeners.push(fn); },

    /** iOS などでは最初の読み上げをユーザー操作の中で行う必要があるため、操作時に呼ぶ。 */
    unlock() {
      if (enabled && Voice.recorded && !audio) {
        // iOS などでは、操作の中で一度再生した audio 要素でないと後から鳴らせないため、消音で一度再生しておく
        audio = new root.Audio();
        const first = Object.values(LINES.files)[0];
        if (first) {
          audio.muted = true;
          audio.src = LINES.base + first;
          try {
            const p = audio.play();
            if (p && typeof p.then === 'function') p.then(() => { if (audio.muted) audio.pause(); }, () => {});
          } catch (e) { /* 再生できなくても、端末の声で遊べる */ }
        }
      }
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
      const file = enabled ? recordedFile(text) : null;
      if (file) return playFile(file, text, () => Voice.speakWithDevice(text, style));
      return Voice.speakWithDevice(text, style);
    },

    /** 端末の声（Web Speech API）で読み上げる。声がないときは文字の長さに応じて待つだけ。 */
    speakWithDevice(text, style) {
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
      if (audio) audio.pause();
      if (current) current.cancel();
      current = null;
    },
  };

  root.ShopVoice = Voice;
})(typeof self !== 'undefined' ? self : this);

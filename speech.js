// CNN 2026 Extended Course — speech recognition & reading practice
// Read Aloud is assessed; simultaneous Shadowing is practice-only (speaker audio can be heard by the microphone).
'use strict';

let currentReadMode = 'readaloud';
const RecognitionEngine = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let recordingRequested = false;
let isRecording = false;
let stopRequested = false;
let cancelRequested = false;
let shadowingPlaying = false;
let sessionFinal = '';
let accumulatedFinal = '';
let retryCount = 0;
let lastRecognitionError = '';
let restartTimer = null;
let successAudioContext = null;
const HISTORY_KEY = 'cnn2026ReadingHistoryV2';

function readingStatus(message, error = false) {
    const el = document.getElementById('readingStatus');
    if (!el) return;
    el.textContent = message;
    el.style.color = error ? '#b71c1c' : '#5c4861';
}

function enableSuccessAudio() {
    try {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        if (!successAudioContext) successAudioContext = new Context();
        if (successAudioContext.state === 'suspended') successAudioContext.resume().catch(() => {});
    } catch (_) { /* Nonessential sound must not block learning. */ }
}

function playSuccessChime() {
    if (!successAudioContext || successAudioContext.state !== 'running') return;
    const now = successAudioContext.currentTime;
    [523.25, 659.25, 783.99].forEach((frequency, index) => {
        try {
            const oscillator = successAudioContext.createOscillator();
            const gain = successAudioContext.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = frequency;
            gain.gain.setValueAtTime(0.0001, now + index * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.13, now + index * 0.09 + 0.025);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.32);
            oscillator.connect(gain);
            gain.connect(successAudioContext.destination);
            oscillator.start(now + index * 0.09);
            oscillator.stop(now + index * 0.09 + 0.34);
        } catch (_) {}
    });
}

function safeSpeechText(finalText, interimText = '') {
    const el = document.getElementById('userSpeechText');
    if (!el) return;
    el.replaceChildren();
    const strong = document.createElement('strong');
    strong.textContent = finalText;
    el.appendChild(strong);
    if (interimText) {
        const span = document.createElement('span');
        span.style.color = '#888';
        span.textContent = (finalText ? ' ' : '') + interimText;
        el.appendChild(span);
    }
}

function spokenWords(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/([a-z])'([a-z])/g, '$1$2')
        .match(/[a-z]+|[0-9]+/g) || [];
}

// Word-level Levenshtein distance: correct order and repetitions both matter.
function readingAccuracy(targetText, spokenText) {
    const target = spokenWords(targetText);
    const spoken = spokenWords(spokenText);
    if (!target.length || !spoken.length) return 0;
    let previous = Array.from({length: spoken.length + 1}, (_, i) => i);
    for (let i = 1; i <= target.length; i++) {
        const next = [i];
        for (let j = 1; j <= spoken.length; j++) {
            next[j] = Math.min(
                previous[j] + 1,
                next[j - 1] + 1,
                previous[j - 1] + (target[i - 1] === spoken[j - 1] ? 0 : 1)
            );
        }
        previous = next;
    }
    return Math.max(0, Math.min(100, Math.round(100 * (1 - previous[spoken.length] / target.length))));
}

function readHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
        return history && typeof history === 'object' && !Array.isArray(history) ? history : {};
    } catch (_) { return {}; }
}

function storeReadingResult(score) {
    try {
        const all = readHistory();
        if (!Array.isArray(all[currentFolder])) all[currentFolder] = [];
        all[currentFolder].push({ score, date: new Date().toISOString() });
        all[currentFolder] = all[currentFolder].slice(-30);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
    } catch (_) {
        readingStatus('この端末では記録を保存できません。ブラウザの保存設定をご確認ください。', true);
    }
    renderReadingHistory();
}

function renderReadingHistory() {
    const container = document.getElementById('readingHistory');
    if (!container) return;
    container.replaceChildren();
    const records = readHistory()[currentFolder] || [];
    if (!records.length) {
        container.textContent = 'このニュースの音読記録はまだありません（記録はこの端末内だけに保存）。';
        return;
    }
    const best = Math.max(...records.map(record => Number(record.score) || 0));
    const heading = document.createElement('div');
    heading.textContent = 'Reading history  |  ' + records.length + '回  |  Best ' + best + '%';
    heading.className = 'history-heading';
    container.appendChild(heading);
    const bars = document.createElement('div');
    bars.className = 'history-bars';
    records.slice(-10).forEach((record, index) => {
        const bar = document.createElement('div');
        bar.className = 'history-bar';
        bar.title = (index + 1) + ': ' + record.score + '%';
        const fill = document.createElement('span');
        fill.style.height = Math.max(3, Math.min(100, Number(record.score) || 0)) + '%';
        bar.appendChild(fill);
        bars.appendChild(bar);
    });
    container.appendChild(bars);
    const caption = document.createElement('small');
    caption.textContent = '直近10回（左→右）  ※同じブラウザ・端末内のみ';
    container.appendChild(caption);
}

function resetRecognitionState() {
    if (restartTimer !== null) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    recordingRequested = false;
    stopRequested = false;
    isRecording = false;
    retryCount = 0;
    sessionFinal = '';
    accumulatedFinal = '';
    lastRecognitionError = '';
}

function stopShadowing() {
    shadowingPlaying = false;
    if (typeof stopAllAudio === 'function') stopAllAudio();
    updateMicButtonUI(false);
}

function cancelReading() {
    cancelRequested = true;
    recordingRequested = false;
    stopRequested = false;
    if (restartTimer !== null) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    if (recognition) {
        try { recognition.abort(); } catch (_) {}
    }
    isRecording = false;
    stopShadowing();
    updateMicButtonUI(false);
}

function openReadingMode() {
    cancelReading();
    document.getElementById('readingModal').style.display = 'flex';
    document.getElementById('resultArea').style.display = 'none';
    const news = typeof newsData !== 'undefined' && newsData[currentFolder];
    document.getElementById('targetText').textContent = news && news.transcript ?
        news.transcript : '本文が見つかりません。';
    safeSpeechText('');
    document.getElementById('gaugeFill').style.strokeDashoffset = '126';
    setReadingMode('readaloud');
    renderReadingHistory();
}

function closeReadingModal() {
    cancelReading();
    document.getElementById('readingModal').style.display = 'none';
}

function setReadingMode(mode) {
    if (mode !== 'readaloud' && mode !== 'shadowing') return;
    cancelReading();
    currentReadMode = mode;
    document.getElementById('btn-readaloud').classList.toggle('active', mode === 'readaloud');
    document.getElementById('btn-shadowing').classList.toggle('active', mode === 'shadowing');
    document.getElementById('shadowing-options').classList.toggle('hidden', mode !== 'shadowing');
    document.getElementById('resultArea').style.display = 'none';
    safeSpeechText('');
    readingStatus(mode === 'shadowing'
        ? 'お手本を聞きながら練習するモードです。マイク判定・採点は行いません。採点する場合は Read Aloud を選択してください。'
        : 'Startを押して英文を音読し、Stopで判定します。マイクの使用を許可してください。');
    updateMicButtonUI(false);
}

function updateMicButtonUI(active) {
    const btn = document.getElementById('toggleMicBtn');
    if (!btn) return;
    btn.textContent = active ? 'Stop ⏹' : (currentReadMode === 'shadowing' ? 'Play ▶' : 'Start 🎤');
    btn.style.background = active
        ? 'linear-gradient(135deg,#78909c,#546e7a)'
        : 'linear-gradient(135deg,#e91e63,#c2185b)';
}

function startRecognizer() {
    if (!recognition || !recordingRequested || cancelRequested) return;
    sessionFinal = '';
    try {
        recognition.start();
    } catch (_) {
        recordingRequested = false;
        isRecording = false;
        readingStatus('音声認識を開始できません。マイクの状態を確認して再度お試しください。', true);
        updateMicButtonUI(false);
    }
}

if (RecognitionEngine) {
    recognition = new RecognitionEngine();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.onstart = () => {
        isRecording = true;
        updateMicButtonUI(true);
        readingStatus('音声を認識中… 終わったら Stop を押してください。');
    };
    recognition.onresult = event => {
        let finalText = '';
        let interimText = '';
        for (let i = 0; i < event.results.length; i++) {
            const phrase = event.results[i][0].transcript || '';
            if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + phrase;
            else interimText += (interimText ? ' ' : '') + phrase;
        }
        sessionFinal = finalText;
        safeSpeechText([accumulatedFinal, finalText].filter(Boolean).join(' '), interimText);
    };
    recognition.onerror = event => {
        lastRecognitionError = event.error || 'unknown';
        if (cancelRequested) return;
        const errors = {
            'not-allowed': 'マイクが許可されていません。ブラウザのサイト設定でマイクを許可してください。',
            'service-not-allowed': 'このブラウザでは音声認識サービスを利用できません。',
            'audio-capture': 'マイクが見つからないか、別のアプリで使用されています。',
            'network': '音声認識サーバーに接続できません。接続を確認してください。',
            'no-speech': '音声を検出できませんでした。もう一度はっきり音読してください。'
        };
        if (lastRecognitionError !== 'aborted') {
            readingStatus(errors[lastRecognitionError] || '音声認識エラー: ' + lastRecognitionError, true);
        }
        if (lastRecognitionError !== 'no-speech' && lastRecognitionError !== 'aborted') {
            recordingRequested = false;
        }
    };
    recognition.onend = () => {
        isRecording = false;
        if (sessionFinal) accumulatedFinal = [accumulatedFinal, sessionFinal].filter(Boolean).join(' ');
        sessionFinal = '';
        updateMicButtonUI(false);
        if (cancelRequested || document.getElementById('readingModal').style.display === 'none') {
            resetRecognitionState();
            return;
        }
        if (stopRequested) {
            const speech = accumulatedFinal;
            resetRecognitionState();
            if (!speech.trim()) {
                readingStatus('発話が認識されませんでした。マイクを確認してもう一度お試しください。', true);
                return;
            }
            calculateAccuracy(speech);
            return;
        }
        if (recordingRequested && retryCount < 2 && (!lastRecognitionError || lastRecognitionError === 'no-speech')) {
            retryCount++;
            lastRecognitionError = '';
            readingStatus('認識が中断されたため再開します（' + retryCount + '/2）。');
            restartTimer = setTimeout(() => {
                restartTimer = null;
                startRecognizer();
            }, 300);
            return;
        }
        if (recordingRequested) {
            recordingRequested = false;
            readingStatus('音声認識が途中で終了しました。もう一度 Start からお試しください。', true);
        }
    };
}

function toggleReading() {
    if (currentReadMode === 'shadowing') {
        if (shadowingPlaying) {
            stopShadowing();
            readingStatus('シャドーイング練習を停止しました。');
            return;
        }
        const selected = document.querySelector('input[name="shadowSpeed"]:checked');
        const speed = selected ? selected.value : 'natural';
        const audio = typeof getAudioElement === 'function' ? getAudioElement(speed) : null;
        if (!audio) return readingStatus('お手本音声を読み込めません。', true);
        if (typeof stopAllAudio === 'function') stopAllAudio();
        audio.currentTime = 0;
        shadowingPlaying = true;
        updateMicButtonUI(true);
        readingStatus('お手本を聞きながら発声してください（練習専用・採点なし）。');
        audio.play().then(() => {
            audio.addEventListener('ended', () => {
                if (shadowingPlaying) {
                    shadowingPlaying = false;
                    updateMicButtonUI(false);
                    readingStatus('練習終了。採点は Read Aloud で行えます。');
                }
            }, { once: true });
        }).catch(() => {
            shadowingPlaying = false;
            updateMicButtonUI(false);
            readingStatus('音声の再生に失敗しました。端末の音量と接続を確認してください。', true);
        });
        return;
    }

    if (!recognition) {
        readingStatus('このブラウザは音声認識に対応していません。Chrome または対応する Safari でお試しください。', true);
        return;
    }
    if (recordingRequested) {
        recordingRequested = false;
        stopRequested = true;
        if (restartTimer !== null) {
            clearTimeout(restartTimer);
            restartTimer = null;
            const speech = [accumulatedFinal, sessionFinal].filter(Boolean).join(' ');
            resetRecognitionState();
            if (speech.trim()) calculateAccuracy(speech);
            else readingStatus('発話を認識できませんでした。もう一度お試しください。', true);
            return;
        }
        readingStatus('判定中…');
        try { recognition.stop(); } catch (_) {
            const speech = [accumulatedFinal, sessionFinal].filter(Boolean).join(' ');
            resetRecognitionState();
            if (speech.trim()) calculateAccuracy(speech);
            else readingStatus('発話を認識できませんでした。もう一度お試しください。', true);
        }
        return;
    }
    enableSuccessAudio();
    cancelRequested = false;
    stopRequested = false;
    recordingRequested = true;
    retryCount = 0;
    lastRecognitionError = '';
    sessionFinal = '';
    accumulatedFinal = '';
    document.getElementById('resultArea').style.display = 'none';
    safeSpeechText('');
    readingStatus('マイクを起動しています…');
    startRecognizer();
}

function calculateAccuracy(userSpeech) {
    const score = readingAccuracy(document.getElementById('targetText').textContent, userSpeech);
    displayResult(score);
    storeReadingResult(score);
    readingStatus('採点完了。単語の順序と抜け・余分な単語を含めて評価しています。');
}

function displayResult(score) {
    document.getElementById('resultArea').style.display = 'block';
    document.getElementById('accuracyScore').textContent = String(score);
    document.getElementById('gaugeFill').style.strokeDashoffset = String(126 * (1 - score / 100));
    const msg = document.getElementById('feedbackMsg');
    if (score >= 80) {
        msg.textContent = 'Excellent! 🎉';
        msg.style.color = '#e91e63';
        playSuccessChime();
        if (typeof confetti === 'function') confetti({particleCount:90,spread:70,origin:{y:0.6},zIndex:2000});
    } else if (score >= 50) {
        msg.textContent = 'Good job! Keep practicing!';
        msg.style.color = '#8e24aa';
    } else {
        msg.textContent = "Keep trying! You can do it.";
        msg.style.color = '#555';
    }
}

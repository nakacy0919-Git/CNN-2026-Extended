// =========================================
// speech.js: 音声認識・シャドーイング・自動採点機能
// =========================================

let currentReadMode = 'readaloud';
let recognition;
let isRecording = false;

// --- 音声認識の初期化 ---
if ('webkitSpeechRecognition' in window) {
    recognition = new webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = function(event) {
        let finalTranscript = '';
        let interimTranscript = '';
        
        // ★修正：0からループを回すことで、間が空いて確定した過去の文章も消えずに残り続けます
        for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        document.getElementById('userSpeechText').innerHTML = 
            `<b>${finalTranscript}</b><span style="color:#999">${interimTranscript}</span>`;
    };

    // 録音が終了した時の処理（自動採点へ移行）
    recognition.onend = function() {
        if (isRecording) {
            // 録音終了時にテキストがあれば採点
            calculateAccuracy(document.getElementById('userSpeechText').innerText);
        }
        isRecording = false;
        updateMicButtonUI(false);
    };
}

// --- モーダル操作 ---
function openReadingMode() {
    document.getElementById('readingModal').style.display = 'flex';
    document.getElementById('resultArea').style.display = 'none';
    document.getElementById('userSpeechText').innerHTML = '<span class="placeholder">マイクボタンを押して話し始めてください...</span>';
    document.getElementById('gaugeFill').style.strokeDashoffset = 126; 
    
    const targetElement = document.getElementById('targetText');
    if (typeof newsData !== 'undefined' && newsData[currentFolder] && newsData[currentFolder].transcript) {
        targetElement.innerText = newsData[currentFolder].transcript;
    } else {
        targetElement.innerText = "データが見つかりません。data.jsが正しく読み込まれているか確認してください。";
    }
}

function closeReadingModal() {
    document.getElementById('readingModal').style.display = 'none';
    if (isRecording) toggleReading(); // モーダルを閉じたら録音も停止
}

function setReadingMode(mode) {
    currentReadMode = mode;
    document.getElementById('btn-readaloud').classList.toggle('active', mode === 'readaloud');
    document.getElementById('btn-shadowing').classList.toggle('active', mode === 'shadowing');
    document.getElementById('shadowing-options').classList.toggle('hidden', mode !== 'shadowing');
}

// --- 録音のStart/Stop切り替え (トグル式) ---
function toggleReading() {
    if (!recognition) return alert("このブラウザは音声認識をサポートしていません。Google Chromeをご利用ください。");

    if (isRecording) {
        // 録音停止（onendが発火して採点へ）
        recognition.stop();
        if (currentReadMode === 'shadowing' && typeof stopAllAudio === 'function') {
            stopAllAudio();
        }
    } else {
        // 録音開始
        document.getElementById('userSpeechText').innerHTML = "";
        document.getElementById('resultArea').style.display = 'none';
        document.getElementById('gaugeFill').style.strokeDashoffset = 126;
        
        if (currentReadMode === 'shadowing' && typeof getAudioElement === 'function') {
            const speed = document.querySelector('input[name="shadowSpeed"]:checked').value;
            if (typeof stopAllAudio === 'function') stopAllAudio(); 
            getAudioElement(speed).play();
        }

        try {
            recognition.start();
            isRecording = true;
            updateMicButtonUI(true);
        } catch(e) {
            console.log("Recognition error:", e);
        }
    }
}

// マイクボタンの見た目変更
function updateMicButtonUI(recording) {
    const btn = document.getElementById('toggleMicBtn');
    if (recording) {
        btn.innerHTML = "Stop ⏹";
        btn.style.background = "linear-gradient(135deg, #78909c, #546e7a)"; // 停止中はグレーに
    } else {
        btn.innerHTML = "Start 🎤";
        btn.style.background = "linear-gradient(135deg, #e91e63, #c2185b)"; // 待機中はピンクに
    }
}

// --- スコアリング処理 ---
function calculateAccuracy(userSpeech) {
    if (!userSpeech || userSpeech.trim() === "") {
        displayResult(0);
        return;
    }

    const targetText = document.getElementById('targetText').innerText;
    // 記号を排除し、小文字にして単語の配列にする
    const cleanTarget = targetText.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w=>w);
    const cleanUser = userSpeech.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w=>w);
    
    if (cleanTarget.length === 0) return displayResult(0);

    let matchCount = 0;
    cleanTarget.forEach(word => {
        if (cleanUser.includes(word)) {
            matchCount++;
            cleanUser.splice(cleanUser.indexOf(word), 1); // 一度マッチした単語は消す（重複カウント防止）
        }
    });
    
    let accuracy = Math.round((matchCount / cleanTarget.length) * 100);
    if(accuracy > 100) accuracy = 100;

    displayResult(accuracy);
}

function displayResult(accuracy) {
    document.getElementById('resultArea').style.display = 'block';
    
    let currentScore = 0;
    const scoreElem = document.getElementById('accuracyScore');
    const gaugeFill = document.getElementById('gaugeFill');
    
    const maxOffset = 126;
    const targetOffset = maxOffset - (maxOffset * (accuracy / 100));

    // 0.1秒待ってからアニメーション開始
    setTimeout(() => {
        gaugeFill.style.strokeDashoffset = targetOffset;
        const interval = setInterval(() => {
            if (currentScore >= accuracy) {
                clearInterval(interval);
                checkHighscore(accuracy);
            } else {
                currentScore++;
                scoreElem.innerText = currentScore;
            }
        }, 15); 
    }, 100);
}

function checkHighscore(accuracy) {
    const msg = document.getElementById('feedbackMsg');
    if (accuracy >= 80) {
        msg.innerText = "Excellent!! 🎉";
        msg.style.color = "#e91e63";
        const sound = document.getElementById('successSound');
        if(sound) sound.play().catch(e=>console.log(e));
        // 紙吹雪アニメーション
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, zIndex: 2000 });
    } else if (accuracy >= 50) {
        msg.innerText = "Good job! Keep it up!";
        msg.style.color = "#ab47bc";
    } else {
        msg.innerText = "Let's try again!";
        msg.style.color = "#555";
    }
}
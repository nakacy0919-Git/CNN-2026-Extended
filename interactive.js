// Interactive transcript mode for CNN 2026 Extended.
// All display content comes from local lesson data; no remote translation service.
'use strict';
const interactiveState = { folder: 'news1', sentences: [], japanese: [], lastTrigger: null, speechRate: 0.9, selectionTimer: null };
const ir = id => document.getElementById(id);

function cnnSplitSentences(text) {
    return String(text || '').trim()
        .replace(/([.!?][”"']?)(\s+)(?=[A-Z“])/g, '$1\u0001')
        .split('\u0001').map(s => s.trim()).filter(Boolean);
}

function cnnCreate(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}
function cnnButton(text, onClick, className = 'ir-action') {
    const btn = cnnCreate('button', className, text);
    btn.type = 'button';
    btn.addEventListener('click', onClick);
    return btn;
}
function cnnNormalizedWord(raw) {
    return String(raw || '').toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}
function cnnNormalizePhrase(raw) {
    return String(raw || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g,' ').trim();
}

function cnnVocabularyEntry(word, folder) {
    const v = (newsData[folder] && newsData[folder].vocabulary) || [];
    const normalized = cnnNormalizedWord(word);
    for (const item of v) {
        const head = cnnNormalizePhrase(item.word);
        const answer = cnnNormalizePhrase(item.answer);
        if (normalized === head || normalized === answer) return item;
    }
    return null;
}

const cnnIrregular = {
    was:'be', were:'be', been:'be', is:'be', are:'be',
    had:'have', has:'have', does:'do', did:'do',
    made:'make', making:'make', took:'take', got:'get', getting:'get',
    won:'win', winning:'win', said:'say', says:'say',
    found:'find', given:'give', struck:'strike', spent:'spend',
    bought:'buy', went:'go', gotten:'get', become:'become'
};
function cnnDictionaryWord(word) {
    const dictionary = typeof cnnBasicGlossary === 'object' ? cnnBasicGlossary : {};
    const exact = cnnNormalizedWord(word);
    if (dictionary[exact]) return dictionary[exact];
    const possessive = exact.replace(/'s$/,'');
    if (dictionary[possessive]) return dictionary[possessive] + '（所有格）';
    const irregular = cnnIrregular[exact];
    if (irregular && dictionary[irregular]) return dictionary[irregular];
    for (const suffix of ['ies','ing','ed','es','s']) {
        if (!exact.endsWith(suffix) || exact.length < suffix.length + 2) continue;
        const stem = exact.slice(0, -suffix.length);
        const choices = suffix === 'ies' ? [stem+'y'] : suffix === 'ing' ?
            [stem,stem+'e',stem.slice(0,-1)] : suffix === 'ed' ?
            [stem,stem+'e'] : [stem];
        for (const candidate of choices) if (dictionary[candidate]) return dictionary[candidate];
    }
    return null;
}
function cnnWordDetail(word, folder) {
    const normalized = cnnNormalizedWord(word);
    const vocab = cnnVocabularyEntry(normalized, folder);
    if (vocab) return { word, meaning: vocab.japanese, type:'重要語句', example:vocab.example || '' };
    const generic = cnnDictionaryWord(normalized);
    if (generic) return { word, meaning:generic, type:cnnGuessType(normalized), example:'' };
    return {word,meaning:'この単語の日本語訳は辞書に未登録です。下の文脈訳を参考にしてください。',type:'語句',example:''};
}
function cnnGuessType(word) {
    if (/^\d/.test(word)) return '数字';
    if (['a','an','the'].includes(word)) return '冠詞';
    if (['i','we','you','he','she','it','they','me','him','us','them','my','his','her','our','their','itself'].includes(word)) return '代名詞';
    if (['in','at','on','for','of','by','with','to','from','over','under','around','across','between','through','during','without','into'].includes(word)) return '前置詞など';
    if (['and','or','but','if','because','while','when','that','although'].includes(word)) return '接続詞など';
    if (['is','are','was','were','have','has','had','do','does','did','could','can','would','will','must','may','might'].includes(word)) return '動詞・助動詞';
    if (word.endsWith('ly')) return '副詞など';
    return '単語・表現';
}

function cnnStopVoice() {
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
}
function cnnSpeak(text) {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
        cnnPopupNotice('このブラウザでは文・単語の読み上げを利用できません。左側のNatural / Slow音声は引き続き利用できます。');
        return;
    }
    cnnStopVoice();
    if (typeof stopAllAudio === 'function') stopAllAudio();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = interactiveState.speechRate;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => /^en-US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onerror = () => cnnPopupNotice('音声を再生できませんでした。端末の音量と読み上げ設定をご確認ください。');
    try { window.speechSynthesis.speak(utterance); }
    catch (_) { cnnPopupNotice('音声再生を開始できませんでした。'); }
}
function cnnPopupNotice(message) {
    const notice = ir('irPopupNotice');
    if (notice) notice.textContent = message;
}
function cnnOpenPopup(title, subtitle, populate) {
    const overlay = ir('interactivePopup');
    if (!overlay) return;
    cnnStopVoice();
    ir('irPopupTitle').textContent = title;
    ir('irPopupSubtitle').textContent = subtitle || '';
    ir('irPopupNotice').textContent = '';
    const body = ir('irPopupBody');
    body.replaceChildren();
    populate(body);
    overlay.hidden = false;
    ir('irPopupClose').focus();
}
function cnnClosePopup() {
    const overlay = ir('interactivePopup');
    if (!overlay || overlay.hidden) return;
    cnnStopVoice();
    overlay.hidden = true;
    if (interactiveState.lastTrigger && interactiveState.lastTrigger.isConnected) {
        interactiveState.lastTrigger.focus({preventScroll:true});
    }
    try { window.getSelection().removeAllRanges(); } catch (_) {}
}

function cnnShowWord(word, index, trigger) {
    interactiveState.lastTrigger = trigger || null;
    const detail = cnnWordDetail(word, interactiveState.folder);
    cnnOpenPopup(detail.word, detail.type, body => {
        body.appendChild(cnnCreate('p','ir-meaning',detail.meaning));
        const row = cnnCreate('div','ir-popup-actions');
        row.appendChild(cnnButton('🔊 発音を聞く',() => cnnSpeak(detail.word)));
        body.appendChild(row);
        if (detail.example) {
            body.appendChild(cnnCreate('div','ir-popup-label','教材内の用例'));
            body.appendChild(cnnCreate('p','ir-context',detail.example));
        }
        body.appendChild(cnnCreate('div','ir-popup-label','この英文の意味'));
        body.appendChild(cnnCreate('p','ir-japanese-text',interactiveState.japanese[index] || '日本語訳はありません。'));
    });
}

function cnnShowSentence(index, trigger) {
    interactiveState.lastTrigger = trigger || null;
    const en = interactiveState.sentences[index] || '';
    const ja = interactiveState.japanese[index] || '日本語訳はありません。';
    cnnOpenPopup('Sentence ' + (index+1), 'この英文の日本語訳', body => {
        body.appendChild(cnnCreate('p','ir-context',en));
        body.appendChild(cnnCreate('p','ir-japanese-text',ja));
        body.appendChild(cnnButton('🔊 この英文を聞く',()=>cnnSpeak(en)));
    });
}

function cnnShowFullJapaneseTranslation() {
    const lesson = newsData[interactiveState.folder];
    if (!lesson) return;
    interactiveState.lastTrigger = null;
    cnnOpenPopup('全文の日本語訳', lesson.title || '', body => {
        interactiveState.sentences.forEach((sentence,index) => {
            const block = cnnCreate('div','ir-translation-pair');
            block.appendChild(cnnCreate('div','ir-popup-label','Sentence '+(index+1)));
            block.appendChild(cnnCreate('p','ir-context',sentence));
            block.appendChild(cnnCreate('p','ir-japanese-text',interactiveState.japanese[index] || '訳が見つかりません。'));
            body.appendChild(block);
        });
    });
}

function cnnShowPhrase(selected, index) {
    interactiveState.lastTrigger = null;
    const phrase = cnnNormalizePhrase(selected);
    const en = interactiveState.sentences[index] || '';
    if (phrase.replace(/[.!?]+$/,'') === cnnNormalizePhrase(en).replace(/[.!?]+$/,'')) {
        cnnShowSentence(index,null);
        return;
    }
    const entries = newsData[interactiveState.folder]?.vocabulary || [];
    const exactPhrase = entries.find(e => cnnNormalizePhrase(e.word) === phrase || cnnNormalizePhrase(e.answer) === phrase);
    cnnOpenPopup('選択した部分', selected, body => {
        if (exactPhrase) {
            body.appendChild(cnnCreate('p','ir-meaning',exactPhrase.japanese));
        } else {
            const individual = selected.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?|\d+(?:\.\d+)?/g) || [];
            const list = cnnCreate('div','ir-phrase-words');
            individual.slice(0,24).forEach(token => {
                const detail = cnnWordDetail(token, interactiveState.folder);
                const el = cnnCreate('div','ir-phrase-word');
                el.appendChild(cnnCreate('strong','',token));
                el.appendChild(cnnCreate('span','',detail.meaning));
                list.appendChild(el);
            });
            body.appendChild(cnnCreate('div','ir-popup-label','各単語の意味（自然な句の訳ではありません）'));
            body.appendChild(list);
        }
        body.appendChild(cnnCreate('div','ir-popup-label','文脈：この英文全体の日本語訳'));
        body.appendChild(cnnCreate('p','ir-japanese-text',interactiveState.japanese[index] || ''));
        body.appendChild(cnnButton('🔊 選択部分を聞く',()=>cnnSpeak(selected)));
    });
}

function cnnWordParts(text) {
    return text.match(/[A-Za-z]+(?:[’'][A-Za-z]+)?(?:-[A-Za-z]+)*|\d+(?:\.\d+)*|[^A-Za-z0-9]+/g) || [];
}

function cnnRenderSentence(sentence, index) {
    const card = cnnCreate('article','ir-sentence');
    const toolbar = cnnCreate('div','ir-sentence-toolbar');
    toolbar.appendChild(cnnCreate('span','ir-number',String(index+1).padStart(2,'0')));
    const actions = cnnCreate('div','ir-sentence-tools');
    actions.appendChild(cnnButton('🔊',()=>cnnSpeak(sentence),'ir-icon-btn'));
    actions.appendChild(cnnButton('日本語訳',event=>cnnShowSentence(index,event.currentTarget),'ir-mini-btn'));
    toolbar.appendChild(actions);
    card.appendChild(toolbar);
    const paragraph = cnnCreate('p','ir-english');
    paragraph.dataset.sentenceIndex = String(index);
    for (const part of cnnWordParts(sentence)) {
        if (/^[A-Za-z0-9]/.test(part)) {
            const word = cnnCreate('span','ir-word',part);
            word.setAttribute('role','button');
            word.tabIndex = 0;
            word.setAttribute('aria-label',part+'の意味を表示');
            word.addEventListener('click', event => {
                if (window.getSelection && window.getSelection().toString().trim()) return;
                cnnShowWord(part,index,word);
                event.stopPropagation();
            });
            word.addEventListener('keydown',event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    cnnShowWord(part,index,word);
                }
            });
            paragraph.appendChild(word);
        } else paragraph.appendChild(document.createTextNode(part));
    }
    paragraph.addEventListener('click',event => {
        if (event.target === paragraph && !(window.getSelection && window.getSelection().toString().trim())) cnnShowSentence(index,paragraph);
    });
    card.appendChild(paragraph);
    return card;
}
function cnnHandleSelection() {
    if (ir('interactiveReading').hidden || !ir('interactivePopup').hidden) return;
    const selection = window.getSelection && window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const picked = selection.toString().replace(/\s+/g,' ').trim();
    if (!picked || picked.length > 350) return;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    const transcript = ir('irSentenceList');
    if (!transcript || !transcript.contains(anchor) || !transcript.contains(focus)) return;
    const anchorParagraph = anchor.nodeType === 1 ? anchor.closest('.ir-english') : anchor.parentElement.closest('.ir-english');
    const focusParagraph = focus.nodeType === 1 ? focus.closest('.ir-english') : focus.parentElement.closest('.ir-english');
    if (!anchorParagraph || anchorParagraph !== focusParagraph) return;
    const index = Number(anchorParagraph.dataset.sentenceIndex);
    if (!Number.isInteger(index)) return;
    cnnShowPhrase(picked,index);
}
function cnnScheduleSelection() {
    if (interactiveState.selectionTimer) clearTimeout(interactiveState.selectionTimer);
    interactiveState.selectionTimer = setTimeout(cnnHandleSelection, 160);
}
function hideInteractiveReading() {
    const el = ir('interactiveReading');
    if (el) el.hidden = true;
    cnnClosePopup();
    cnnStopVoice();
}
function showInteractiveLesson(folder) {
    const lesson = typeof newsData !== 'undefined' ? newsData[folder] : null;
    if (!lesson || !lesson.transcript) return;
    if (typeof hideDigitalLearning === 'function') hideDigitalLearning();
    hideInteractiveReading();
    interactiveState.folder = folder;
    interactiveState.sentences = cnnSplitSentences(lesson.transcript);
    interactiveState.japanese = typeof cnnJapaneseSentences !== 'undefined' ? (cnnJapaneseSentences[folder] || []) : [];
    ir('irHeading').textContent = lesson.title || 'Interactive Text';
    ir('irCategory').textContent = 'NEWS ' + folder.replace('news','') + ' · ' + (lesson.category || 'CNN');
    const list = ir('irSentenceList');
    list.replaceChildren();
    interactiveState.sentences.forEach((sentence,index) => list.appendChild(cnnRenderSentence(sentence,index)));
    ir('interactiveReading').hidden = false;
    ir('irSentenceList').scrollTop = 0;
    if (typeof clearVocabularyFallback === 'function') clearVocabularyFallback();
    if (typeof hideAnswerBoxes === 'function') hideAnswerBoxes();
    if (typeof contentLayer !== 'undefined') contentLayer.style.display = 'none';
    if (typeof activeSlideType !== 'undefined') activeSlideType = 'interactive';
    if (typeof cnnSetMode === 'function') cnnSetMode('text');
}
function showOriginalTranscript() {
    if (typeof hideDigitalLearning === 'function') hideDigitalLearning();
    hideInteractiveReading();
    if (typeof toggleSlide === 'function' && typeof activeSlideType !== 'undefined' && activeSlideType !== 'transcript') {
        toggleSlide('transcript');
    } else if (typeof contentLayer !== 'undefined') {
        contentLayer.style.display = 'block';
    }
    if (typeof cnnSetMode === 'function') cnnSetMode('original');
}

function initializeInteractiveReading() {
    const reading = ir('interactiveReading');
    if (!reading) return;
    reading.addEventListener('pointerup',cnnScheduleSelection);
    reading.addEventListener('touchend',cnnScheduleSelection,{passive:true});
    ir('irPopupClose').addEventListener('click',cnnClosePopup);
    ir('interactivePopup').addEventListener('click',event => {
        if (event.target === ir('interactivePopup')) cnnClosePopup();
    });
    document.addEventListener('keydown',event => { if(event.key === 'Escape') cnnClosePopup(); });
    const rate = ir('irAudioRate');
    rate.addEventListener('change',()=> { interactiveState.speechRate = Number(rate.value) || 0.9; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initializeInteractiveReading);
else initializeInteractiveReading();

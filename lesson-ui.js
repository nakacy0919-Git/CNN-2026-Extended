// Compact lesson modes. Uses only local CNN materials; no new network requests.
'use strict';
const cnnLearning = {
 view:'text', shown:[false,false], selected:[null,null],
 words:[], mode:'cloze', index:0, score:0, answer:null, choices:[], correct:''
};
const cnnNode = id => document.getElementById(id);
const cnnMake = (tag,cls,text)=>{
 const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;
};
function cnnButton(text,fn,cls='study-action') {
 const b=cnnMake('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;
}
function cnnSetMode(mode) {
 cnnLearning.view=mode;
 document.querySelectorAll('[data-cnn-mode]').forEach(b=>{
  const yes=b.dataset.cnnMode===mode;
  b.classList.toggle('is-current',yes);b.setAttribute('aria-pressed',String(yes));
 });
 const answers=cnnNode('quizRevealControls');if(answers)answers.hidden=mode!=='comprehension';
}
function hideDigitalLearning() {
 ['digitalComprehension','vocabularyPractice'].forEach(k=>{const e=cnnNode(k);if(e)e.hidden=true;});
 const answers=cnnNode('quizRevealControls');if(answers)answers.hidden=true;
}
function cnnPrepareDigital(mode) {
 hideDigitalLearning();
 if(typeof hideInteractiveReading==='function')hideInteractiveReading();
 if(typeof clearVocabularyFallback==='function')clearVocabularyFallback();
 if(typeof hideAnswerBoxes==='function')hideAnswerBoxes();
 if(typeof contentLayer!=='undefined')contentLayer.style.display='none';
 if(typeof activeSlideType!=='undefined')activeSlideType='digital-'+mode;
 cnnSetMode(mode);
}
function showDigitalComprehension() {
 cnnPrepareDigital('comprehension');
 const panel=cnnNode('digitalComprehension');
 if(!panel)return;
 cnnNode('cqTitle').textContent=newsData[currentFolder]?.title||'Comprehension';
 cnnLearning.shown=[false,false];cnnLearning.selected=[null,null];
 panel.hidden=false;
 renderDigitalComprehension();
}
function renderDigitalComprehension() {
 const root=cnnNode('cqQuestions');if(!root)return;
 const scroll=root.scrollTop;root.replaceChildren();
 const questions=typeof cnnComprehensionQuestions!=='undefined'?cnnComprehensionQuestions[currentFolder]:null;
 if(!questions||questions.length!==2){root.append(cnnMake('p','study-empty','このニュースの設問は準備中です。'));return;}
 questions.forEach((entry,q)=>{
  const card=cnnMake('article','cq-card');card.id='cqCard'+(q+1);
  card.append(cnnMake('div','cq-label','QUESTION '+(q+1)),cnnMake('h3','cq-question',entry.question));
  const options=cnnMake('div','cq-options');
  entry.choices.forEach((choice,i)=>{
   const b=cnnButton('',()=>{cnnLearning.selected[q]=i;renderDigitalComprehension();},'cq-option');
   b.append(cnnMake('span','cq-letter','ABCD'[i]),cnnMake('span','cq-option-text',choice));
   if(cnnLearning.selected[q]===i)b.classList.add('is-selected');
   if(cnnLearning.shown[q]&&entry.answer==='ABCD'[i])b.classList.add('is-answer');
   if(cnnLearning.shown[q]&&cnnLearning.selected[q]===i&&entry.answer!=='ABCD'[i])b.classList.add('is-wrong');
   b.setAttribute('aria-pressed',String(cnnLearning.selected[q]===i));
   options.append(b);
  });
  card.append(options);
  const foot=cnnMake('div','cq-footer');
  foot.append(cnnButton(cnnLearning.shown[q]?'答えを隠す':'答えを表示',()=>revealComprehensionAnswer(q+1),'cq-reveal'));
  if(cnnLearning.shown[q])foot.append(cnnMake('span','cq-result','正解 '+entry.answer+'　'+entry.choices['ABCD'.indexOf(entry.answer)]));
  card.append(foot);root.append(card);
 });
 root.scrollTop=scroll;
 for(let i=0;i<2;i++){const b=cnnNode('quizAnswer'+(i+1));if(b)b.setAttribute('aria-pressed',String(cnnLearning.shown[i]));}
}
function revealComprehensionAnswer(number) {
 if(cnnLearning.view!=='comprehension')showDigitalComprehension();
 if(number!==1&&number!==2)return;
 cnnLearning.shown[number-1]=!cnnLearning.shown[number-1];
 renderDigitalComprehension();
}
function cnnShuffle(values) {
 const a=values.slice();
 for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function cnnVocabularyItems() {
 const v=newsData[currentFolder]?.vocabulary||[];
 return v.filter(x=>x&&x.japanese&&x.answer&&x.question);
}
function showVocabularyPractice() {
 cnnPrepareDigital('vocabulary');
 const p=cnnNode('vocabularyPractice');if(!p)return;
 cnnNode('vqTitle').textContent=newsData[currentFolder]?.title||'Vocabulary';
 p.hidden=false;
 cnnStartVocabulary('cloze');
}
function cnnStartVocabulary(mode) {
 cnnLearning.mode=mode==='meaning'?'meaning':'cloze';
 cnnLearning.words=cnnShuffle(cnnVocabularyItems());
 cnnLearning.index=0;cnnLearning.score=0;cnnLearning.answer=null;
 cnnSetVocabularyChoices();renderVocabularyPractice();
}
function cnnSetVocabularyChoices() {
 const item=cnnLearning.words[cnnLearning.index];
 if(!item){cnnLearning.choices=[];cnnLearning.correct='';return;}
 const property=cnnLearning.mode==='meaning'?'japanese':'answer';
 const correct=String(item[property]).trim();
 const fromLesson=cnnShuffle(cnnLearning.words).map(x=>String(x[property]||'').trim());
 const choices=[correct];
 for(const value of fromLesson)if(value&&!choices.includes(value)&&choices.length<4)choices.push(value);
 if(choices.length<4) {
  for(const lesson of Object.values(newsData))for(const word of lesson.vocabulary||[]){
   const value=String(word[property]||'').trim();
   if(value&&!choices.includes(value)&&choices.length<4)choices.push(value);
  }
 }
 cnnLearning.correct=correct;cnnLearning.choices=cnnShuffle(choices);
}
function cnnChooseVocabulary(i) {
 if(cnnLearning.answer!==null)return;
 cnnLearning.answer=i;
 if(cnnLearning.choices[i]===cnnLearning.correct)cnnLearning.score++;
 renderVocabularyPractice();
}
function cnnNextVocabulary() {
 if(cnnLearning.answer===null)return;
 cnnLearning.index++;cnnLearning.answer=null;
 cnnSetVocabularyChoices();renderVocabularyPractice();
}
function renderVocabularyPractice() {
 const root=cnnNode('vqContent');if(!root)return;
 root.replaceChildren();
 const n=cnnLearning.words.length,idx=cnnLearning.index;
 const stats=cnnMake('div','vq-topline');
 stats.append(cnnMake('span','vq-counter',(n?Math.min(idx+1,n):0)+' / '+n),cnnMake('span','vq-score','正解 '+cnnLearning.score));
 root.append(stats);
 const track=cnnMake('div','vq-track'),fill=cnnMake('span','vq-track-fill');
 fill.style.width=(n?Math.round(idx/n*100):0)+'%';track.append(fill);root.append(track);
 if(!n){root.append(cnnMake('p','study-empty','このニュースに語彙問題はありません。'));return;}
 if(idx>=n){
  const result=cnnMake('div','vq-finished');
  result.append(cnnMake('div','vq-finish-icon','✓'),
    cnnMake('h3','',''+cnnLearning.score+' / '+n+' 正解'),
    cnnMake('p','','正解率 '+Math.round(cnnLearning.score/n*100)+'%'),
    cnnButton('もう一度挑戦',()=>cnnStartVocabulary(cnnLearning.mode),'study-action study-action-primary'));
  root.append(result);return;
 }
 const switcher=cnnMake('div','vq-modes');
 [['cloze','空所補充'],['meaning','意味を選ぶ']].forEach(pair=>{
  const b=cnnButton(pair[1],()=>cnnStartVocabulary(pair[0]),'vq-mode');
  b.classList.toggle('is-current',cnnLearning.mode===pair[0]);b.setAttribute('aria-pressed',String(cnnLearning.mode===pair[0]));
  switcher.append(b);
 });root.append(switcher);
 const item=cnnLearning.words[idx],cloze=cnnLearning.mode==='cloze';
 root.append(cnnMake('p','vq-instruction',cloze?'空欄に入る英語を選んでください。':'単語の意味を選んでください。'));
 root.append(cnnMake('p','vq-prompt',cloze?item.question:item.word||item.answer));
 const choices=cnnMake('div','vq-choices');
 cnnLearning.choices.forEach((value,i)=>{
  const b=cnnButton('',()=>cnnChooseVocabulary(i),'vq-choice');
  b.append(cnnMake('span','vq-choice-label','ABCD'[i]),cnnMake('span','vq-choice-content',value));
  if(cnnLearning.answer===i)b.classList.add('is-selected');
  if(cnnLearning.answer!==null&&value===cnnLearning.correct)b.classList.add('is-correct');
  if(cnnLearning.answer===i&&value!==cnnLearning.correct)b.classList.add('is-wrong');
  b.disabled=cnnLearning.answer!==null;choices.append(b);
 });root.append(choices);
 if(cnnLearning.answer!==null){
  const yes=cnnLearning.choices[cnnLearning.answer]===cnnLearning.correct;
  const feedback=cnnMake('div','vq-feedback');
  feedback.append(cnnMake('strong','',yes?'正解！':'正解：'+cnnLearning.correct));
  feedback.append(cnnMake('p','',item.word+' — '+item.japanese));
  const row=cnnMake('div','vq-footer');
  row.append(cnnButton('🔊 発音',()=>{if(typeof cnnSpeak==='function')cnnSpeak(item.answer||item.word);}),
    cnnButton(idx+1===n?'結果を見る':'次の問題 →',cnnNextVocabulary,'study-action study-action-primary'));
  feedback.append(row);root.append(feedback);
 }
}
function cnnTransportSeek(seconds) {
 const audio=typeof getAudioElement==='function'?getAudioElement(currentAudioType==='slow'?'slow':'natural'):null;
 if(audio&&Number.isFinite(audio.duration)&&audio.duration>0)
   audio.currentTime=Math.min(audio.duration,Math.max(0,audio.currentTime+seconds));
}
function cnnTransportStop(){if(typeof stopAllAudio==='function')stopAllAudio();}
function cnnReturnToText(){
 if(typeof clearAllAnswers==='function')clearAllAnswers();
 if(typeof showInteractiveLesson==='function')showInteractiveLesson(currentFolder);
}

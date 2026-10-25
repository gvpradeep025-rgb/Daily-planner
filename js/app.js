let state={goal:'',desc:'',lifestyle:'',workStart:'',workEnd:'',commute:0,productivity:'',wake:'06:00',bed:'22:30',prefs:[],deadline:'',startDate:''};
let currentStep=1;const totalSteps=5;
let soundEnabled=true;
let scheduleBlocks=[];
let completedCount=0;
let totalBlocks=0;
let streak=parseInt(localStorage.getItem('planner_streak')||'0');
let lastDay=localStorage.getItem('planner_last_day');
let lastDisplayedDay=0;
let audioCtx=null;
let activeTab='schedule';
let musicTracks=[];
let currentTrack=-1;
let musicAudio=new Audio();
musicAudio.volume=0.7;
let musicPlaying=false;

let dayPlan=null;
let renderedDayKey=null;
const GOAL_NAMES={fitness:'Get Fit',study:'Learn a Skill',coding:'Build Something',business:'Start a Business',creative:'Create',productivity:'Be Productive',mental:'Feel Better',custom:'Custom Goal'};
function escapeHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function keyToDate(k){const p=String(k).split('-');return new Date(+p[0],+p[1]-1,+p[2])}
function todayKey(){return Scheduler.dateKey(new Date())}
function plannerClock(){return dayPlan?Scheduler.plannerNow(new Date(),dayPlan.wake,dayPlan.bed):{key:todayKey(),minute:new Date().getHours()*60+new Date().getMinutes()}}
function showToast(text){const toast=document.getElementById('encourage-toast');document.getElementById('e-text').textContent=text;document.getElementById('e-source').textContent='';toast.classList.remove('done');toast.classList.add('show');clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove('show'),4000)}
function showStepError(step,msg){
  const el=document.querySelector(`.step[data-step="${step}"]`);if(!el)return;
  let box=el.querySelector('.step-error');
  if(!box){box=document.createElement('div');box.className='step-error';box.setAttribute('role','alert');box.dataset.testid='step-error';el.querySelector('.next-wrap,.cta-wrap').before(box)}
  box.textContent=msg||'';box.classList.toggle('show',!!msg);
}
function collectProfile(){
  state.wake=document.getElementById('wake-time').value;
  state.bed=document.getElementById('bed-time').value;
  state.deadline=document.getElementById('deadline').value||'';
  if(state.lifestyle==='working'){state.workStart=document.getElementById('work-start').value;state.workEnd=document.getElementById('work-end').value;state.commute=parseInt(document.getElementById('commute2').value)||0}
  else if(state.lifestyle==='student'){state.workStart=document.getElementById('class-start').value;state.workEnd=document.getElementById('class-end').value;state.commute=parseInt(document.getElementById('commute').value)||0}
  else if(state.lifestyle==='parttime'){state.workStart=document.getElementById('shift-start').value;state.workEnd=document.getElementById('shift-end').value;state.commute=0}
  else{state.workStart='';state.workEnd='';state.commute=0}
  return state;
}
/** Returns the first problem with the current step, or '' when it is complete. */
function stepProblem(step){
  if(step===1&&!state.goal)return'Pick one goal to continue.';
  if(step===2){
    const d=document.getElementById('goal-desc').value.trim();
    if(d.length<3)return'Describe your goal in a few words (at least 3 characters).';
    if(d.length>120)return'Keep it under 120 characters.';
    const dl=document.getElementById('deadline').value;
    if(dl&&Scheduler.daysBetween(todayKey(),dl)<1)return'The deadline must be after today.';
  }
  if(step===3){
    if(!state.lifestyle)return'Pick the option that fits your day.';
    collectProfile();
    if(state.workStart&&state.workEnd&&state.workStart===state.workEnd)return'Your start and end times are the same.';
    const c=parseInt(state.commute)||0;if(c<0||c>180)return'Commute must be between 0 and 180 minutes.';
  }
  if(step===4){
    if(!state.productivity)return'Pick when you work best.';
    collectProfile();
    const errs=Scheduler.validate(state);if(errs.length)return errs[0];
  }
  return'';
}
function plannerRecordFor(key){return getDailyCompletions()[key]||null}
function saveToday(){
  const key=renderedDayKey||plannerClock().key;
  const completed=[],doneAt={};
  scheduleBlocks.forEach(b=>{if(b.task&&b.doneAt!=null){completed.push(b.id);doneAt[b.id]=b.doneAt}});
  completedCount=completed.length;
  saveDailyCompletions(key,{completed,doneAt,count:completed.length,total:totalBlocks,pct:totalBlocks?Math.round(completed.length/totalBlocks*100):0});
}
function saveState(){localStorage.setItem('planner_state',JSON.stringify(state))}
function loadState(){
  const s=localStorage.getItem('planner_state');
  if(s){try{const parsed=JSON.parse(s);state={...state,...parsed};return true}catch(e){}}
  return false;
}
function loadAvatar(){
  const avatar=localStorage.getItem('planner_avatar');
  if(avatar){
    document.getElementById('profile-avatar-img').src=avatar;
    document.getElementById('profile-avatar-img').style.display='block';
    document.getElementById('profile-avatar-initials').style.display='none';
    document.getElementById('pp-avatar-img').src=avatar;
    document.getElementById('pp-avatar-img').style.display='block';
    document.getElementById('pp-avatar-initials').style.display='none';
  }
}
function handleAvatarUpload(e){
  const file=e.target.files[0];
  if(!file)return;
  const validTypes=['image/png','image/jpeg','image/jpg','image/webp','image/gif'];
  if(!validTypes.includes(file.type)){alert('Please upload a PNG, JPG, JPEG, WEBP, or GIF file.');return}
  const reader=new FileReader();
  reader.onload=function(ev){
    const dataUrl=ev.target.result;
    localStorage.setItem('planner_avatar',dataUrl);
    const headerImg=document.getElementById('profile-avatar-img');
    const panelImg=document.getElementById('pp-avatar-img');
    headerImg.src=dataUrl;
    panelImg.src=dataUrl;
    headerImg.style.display='block';
    panelImg.style.display='block';
    document.getElementById('profile-avatar-initials').style.display='none';
    document.getElementById('pp-avatar-initials').style.display='none';
    headerImg.classList.add('img-change');
    panelImg.classList.add('img-change');
    setTimeout(()=>{headerImg.classList.remove('img-change');panelImg.classList.remove('img-change')},500);
  };
  reader.readAsDataURL(file);
  e.target.value='';
}
function removeAvatar(){
  localStorage.removeItem('planner_avatar');
  document.getElementById('profile-avatar-img').style.display='none';
  document.getElementById('profile-avatar-initials').style.display='block';
  document.getElementById('pp-avatar-img').style.display='none';
  document.getElementById('pp-avatar-initials').style.display='block';
  updateAvatarInitials();
}
function updateAvatarInitials(){
  const name=GOAL_NAMES[state.goal]||'';
  let initials='?';
  if(name){const words=name.split(' ');initials=(words.length>=2?words[0][0]+words[1][0]:words[0].substring(0,2)).toUpperCase()}
  document.getElementById('profile-avatar-initials').textContent=initials;
  document.getElementById('pp-avatar-initials').textContent=initials;
  document.getElementById('pp-name').textContent=name||'Your Plan';
}
function updateGreeting(){
  const h=new Date().getHours();
  let greeting='Good Morning';
  if(h>=12&&h<17)greeting='Good Afternoon';
  else if(h>=17)greeting='Good Evening';
  document.getElementById('s-greeting').textContent=greeting;
}
function toggleProfilePanel(){
  const panel=document.getElementById('profile-panel');
  const overlay=document.getElementById('profile-panel-overlay');
  const isOpen=panel.classList.contains('open');
  if(isOpen){
    panel.classList.remove('open');
    overlay.classList.remove('open');
    document.getElementById('profile-avatar').focus();
  }else{
    updateProfilePanel();
    panel.classList.add('open');
    overlay.classList.add('open');
    panel.querySelector('.pp-btn')?.focus();
  }
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const panel=document.getElementById('profile-panel');if(panel&&panel.classList.contains('open'))toggleProfilePanel()}});
function updateProfilePanel(){
  updateAvatarInitials();
  document.getElementById('pp-streak').textContent=streak;
  document.getElementById('pp-goal').textContent=state.desc?'🎯 '+state.desc:'No goal set';

  const pct=totalBlocks?Math.round((completedCount/totalBlocks)*100):0;
  document.getElementById('pp-pct').textContent=pct+'%';

  const remaining=totalBlocks-completedCount;
  const states=[{name:'Lazy',min:0,max:20},{name:'Taking it Easy',min:21,max:40},{name:'Trying',min:41,max:60},{name:'Active',min:61,max:80},{name:'Productive',min:81,max:95},{name:'On Fire',min:96,max:100}];
  let currentState;
  if(remaining===0&&completedCount>0){currentState=states[5]}
  else{currentState=states.find(s=>pct>=s.min&&pct<=s.max)||states[0]}
  document.getElementById('pp-state').textContent=currentState.name;
}
function openSettings(){
  toggleProfilePanel();
  switchTab('progress');
}
function saveDailyCompletions(date,data){
  const all=JSON.parse(localStorage.getItem('planner_daily')||'{}');
  all[date]=data;
  localStorage.setItem('planner_daily',JSON.stringify(all));
}
function getDailyCompletions(){return JSON.parse(localStorage.getItem('planner_daily')||'{}')}

function getAudioCtx(){if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();return audioCtx}
function playClick(){if(!soundEnabled)return;try{const ctx=getAudioCtx();const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=800;g.gain.value=0.1;g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.08);o.start();o.stop(ctx.currentTime+0.08)}catch(e){}}
function playSuccess(){if(!soundEnabled)return;try{const ctx=getAudioCtx();[523.25,659.25,783.99].forEach((f,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=f;g.gain.value=0.08;g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.15+i*0.1);o.start(ctx.currentTime+i*0.1);o.stop(ctx.currentTime+0.15+i*0.1)})}catch(e){}}
function playDayComplete(){if(!soundEnabled)return;try{const ctx=getAudioCtx();[523.25,659.25,783.99,1046.5].forEach((f,i)=>{const o=ctx.createOscillator();const g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=f;g.gain.value=0.07;g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.2+i*0.12);o.start(ctx.currentTime+i*0.12);o.stop(ctx.currentTime+0.2+i*0.12)})}catch(e){}}
function toggleSound(){soundEnabled=!soundEnabled;const btn=document.getElementById('sound-toggle');btn.textContent=soundEnabled?'🔊 Sound':'🔇 Muted';btn.classList.toggle('active',soundEnabled)}

function importMusic(e){
  const files=Array.from(e.target.files);
  files.forEach(f=>{
    const url=URL.createObjectURL(f);
    musicTracks.push({name:f.name.replace(/\.[^.]+$/,''),url:url});
  });
  if(musicTracks.length&&!musicPlaying){
    currentTrack=0;
    loadTrack(0);
  }
  document.getElementById('music-player').style.display='flex';
  e.target.value='';
}
function loadTrack(idx){
  if(idx<0||idx>=musicTracks.length)return;
  currentTrack=idx;
  musicAudio.src=musicTracks[idx].url;
  document.getElementById('mp-title').textContent=musicTracks[idx].name;
  document.getElementById('mp-artist').textContent=`Track ${idx+1} of ${musicTracks.length}`;
  musicAudio.load();
}
function togglePlay(){
  if(!musicTracks.length)return;
  if(musicPlaying){musicAudio.pause();musicPlaying=false;document.getElementById('mp-play').textContent='▶'}
  else{musicAudio.play();musicPlaying=true;document.getElementById('mp-play').textContent='⏸'}
}
function nextTrack(){
  if(!musicTracks.length)return;
  const next=(currentTrack+1)%musicTracks.length;
  loadTrack(next);
  if(musicPlaying)musicAudio.play();
}
function prevTrack(){
  if(!musicTracks.length)return;
  const prev=(currentTrack-1+musicTracks.length)%musicTracks.length;
  loadTrack(prev);
  if(musicPlaying)musicAudio.play();
}
function setVolume(v){musicAudio.volume=v/100}
function seekMusic(e){
  if(!musicAudio.duration)return;
  const rect=e.target.getBoundingClientRect();
  const pct=(e.clientX-rect.left)/rect.width;
  musicAudio.currentTime=pct*musicAudio.duration;
}
musicAudio.addEventListener('timeupdate',()=>{
  if(!musicAudio.duration)return;
  const pct=(musicAudio.currentTime/musicAudio.duration)*100;
  document.getElementById('mp-progress-fill').style.width=pct+'%';
  const m=Math.floor(musicAudio.currentTime/60);
  const s=Math.floor(musicAudio.currentTime%60);
  document.getElementById('mp-time').textContent=m+':'+String(s).padStart(2,'0');
});
musicAudio.addEventListener('ended',()=>nextTrack());



const quoteLibrary={
start:[
{q:"It is not that we have a short time to live, but that we waste a lot of it.",s:"Seneca"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"Well begun is half done.",s:"Aristotle"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"No man is free who is not master of himself.",s:"Epictetus"},
{q:"Begin at once to live, and count each separate day as a separate life.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"It is not death that a man should fear, but he should fear never beginning to live.",s:"Marcus Aurelius"},
{q:"When you arise in the morning, think of what a precious privilege it is to be alive.",s:"Marcus Aurelius"},
{q:"Very little is needed to make a happy life; it is all within yourself.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Never esteem anything as of advantage to you that will make you break your word.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"The best revenge is not to be like your enemy.",s:"Marcus Aurelius"},
{q:"If it is not right, do not do it; if it is not true, do not say it.",s:"Marcus Aurelius"},
{q:"How much more grievous are the consequences of anger than the causes of it.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"Everything we hear is an opinion, not a fact. Everything we see is a perspective, not the truth.",s:"Marcus Aurelius"},
{q:"Loss is nothing else but change, and change is Nature's delight.",s:"Marcus Aurelius"},
{q:"Confine yourself to the present.",s:"Marcus Aurelius"},
{q:"The object of life is not to be on the side of the majority.",s:"Marcus Aurelius"},
{q:"Never let the future disturb you. You will meet it, if you have to, with the same weapons of reason.",s:"Marcus Aurelius"},
{q:"It is during our darkest moments that we must focus to see the light.",s:"Marcus Aurelius"},
{q:"Our life is what our thoughts make it.",s:"Marcus Aurelius"},
{q:"The mind that is anxious about future events is miserable.",s:"Marcus Aurelius"},
{q:"Today I escaped anxiety. Or no, I discarded it, for it was within me.",s:"Marcus Aurelius"},
{q:"You have your own way. Let others find theirs.",s:"Marcus Aurelius"},
{q:"To live happily is an inward power of the soul.",s:"Marcus Aurelius"},
{q:"Set yourself a task of some kind. Even a trivial one will do.",s:"Marcus Aurelius"},
{q:"To live each day as if one's last, never flustered, never apathetic, is the perfection of character.",s:"Marcus Aurelius"},
{q:"Do not act as if you had ten thousand years to live. Death hangs over you while you live.",s:"Marcus Aurelius"},
{q:"Never rate any possible gain as greater than the duty you are doing.",s:"Marcus Aurelius"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"The whole future lies in uncertainty: live immediately.",s:"Seneca"},
{q:"We suffer more often in imagination than in reality.",s:"Seneca"},
{q:"Luck is what happens when preparation meets opportunity.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"While we are postponing, life speeds by.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"We are more often frightened than hurt.",s:"Seneca"},
{q:"As is a tale, so is life: not how long it is, but how good it is, is what matters.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"True happiness is to enjoy the present, without anxious dependence upon the future.",s:"Seneca"},
{q:"He who fears death will never do anything worthy of a living man.",s:"Seneca"},
{q:"The mind which is free from passions is a citadel.",s:"Marcus Aurelius"},
{q:"Of things that exist, some depend upon ourselves, others do not.",s:"Epictetus"},
{q:"Man is not worried by real problems so much as by his imagined anxieties.",s:"Epictetus"},
{q:"Wealth consists not in having great possessions, but in having few wants.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"Attach yourself to what is spiritually superior, regardless of what other people think or do.",s:"Epictetus"},
{q:"It is not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"We cannot choose our external circumstances, but we can always choose how we respond to them.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Only the educated are free.",s:"Epictetus"},
{q:"If you want to improve, be content to appear foolish and stupid.",s:"Epictetus"},
{q:"The key is to keep company only with people who uplift you.",s:"Epictetus"},
{q:"Begin each day by telling yourself: today I shall be meeting with interference, ingratitude, insolence, disloyalty.",s:"Marcus Aurelius"},
{q:"Never value anything as profitable that compelled you to break your promise.",s:"Marcus Aurelius"},
{q:"The best answer to anger is silence.",s:"Marcus Aurelius"},
{q:"How many have laid waste to your life when you did not know what you were doing.",s:"Marcus Aurelius"},
{q:"Let men see, let them know, a real man, who lives as he was meant to live.",s:"Marcus Aurelius"},
{q:"Do not indulge in dreams of having what you have not, but reckon up the chief of the blessings you do possess.",s:"Marcus Aurelius"}
],
early:[
{q:"It is not that we have a short time to live, but that we waste much of it.",s:"Seneca"},
{q:"While we are postponing, life speeds by.",s:"Seneca"},
{q:"The whole future lies in uncertainty: live immediately.",s:"Seneca"},
{q:"Lay hold of today's task, and you will not need to depend so much upon tomorrow's.",s:"Seneca"},
{q:"Nothing, Lucilius, is ours, except time.",s:"Seneca"},
{q:"Putting things off is the biggest waste of life.",s:"Seneca"},
{q:"The greatest obstacle to living is expectancy, which hangs upon tomorrow and loses today.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"True happiness is to enjoy the present, without anxious dependence upon the future.",s:"Seneca"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"It is impossible for a man to learn what he thinks he already knows.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"Confine yourself to the present.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"It is during our darkest moments that we must focus to see the light.",s:"Marcus Aurelius"},
{q:"Our life is what our thoughts make it.",s:"Marcus Aurelius"},
{q:"The best revenge is not to be like your enemy.",s:"Marcus Aurelius"},
{q:"To live each day as if one's last, never flustered, never apathetic, is the perfection of character.",s:"Marcus Aurelius"},
{q:"Loss is nothing else but change, and change is Nature's delight.",s:"Marcus Aurelius"},
{q:"Concentrate every minute on doing what's in front of you with precise and genuine seriousness.",s:"Marcus Aurelius"},
{q:"It is not death that a man should fear, but he should fear never beginning to live.",s:"Marcus Aurelius"},
{q:"The mind that is anxious about future events is miserable.",s:"Marcus Aurelius"},
{q:"Never rate any possible gain as greater than the duty you are doing.",s:"Marcus Aurelius"},
{q:"Never esteem anything as of advantage to you that will make you break your word.",s:"Marcus Aurelius"},
{q:"If it is not right, do not do it; if it is not true, do not say it.",s:"Marcus Aurelius"},
{q:"People look for retreats in the country, but this is unphilosophical. You can retire into yourself at any time.",s:"Marcus Aurelius"},
{q:"Set yourself a task of some kind. Even a trivial one will do.",s:"Marcus Aurelius"},
{q:"He who fears death will never do anything worthy of a living man.",s:"Marcus Aurelius"},
{q:"Man is not worried by real problems so much as by his imagined anxieties.",s:"Epictetus"},
{q:"We cannot choose our external circumstances, but we can always choose how we respond to them.",s:"Epictetus"},
{q:"If you want to improve, be content to appear foolish and stupid.",s:"Epictetus"},
{q:"Wealth consists not in having great possessions, but in having few wants.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"Only the educated are free.",s:"Epictetus"},
{q:"It is not outside forces that make us restless, but our own unexamined thoughts.",s:"Marcus Aurelius"},
{q:"Never let the future disturb you. You will meet it, if you have to, with the same weapons of reason.",s:"Marcus Aurelius"},
{q:"Begin each day by telling yourself: today I shall be meeting with interference, ingratitude, insolence, disloyalty.",s:"Marcus Aurelius"},
{q:"Never value anything as profitable that compelled you to break your promise.",s:"Marcus Aurelius"},
{q:"The best answer to anger is silence.",s:"Marcus Aurelius"},
{q:"How many have laid waste to your life when you did not know what you were doing.",s:"Marcus Aurelius"},
{q:"Let men see, let them know, a real man, who lives as he was meant to live.",s:"Marcus Aurelius"},
{q:"Do not indulge in dreams of having what you have not, but reckon up the chief of the blessings you do possess.",s:"Marcus Aurelius"},
{q:"Today I escaped anxiety. Or no, I discarded it, for it was within me.",s:"Marcus Aurelius"},
{q:"You have your own way. Let others find theirs.",s:"Marcus Aurelius"}
],
mid:[
{q:"Perseverance is not a long race; it is many short races one after the other.",s:"Walter Elliot"},
{q:"We are what we repeatedly do. Excellence, then, is not an act, but a habit.",s:"Aristotle"},
{q:"The secret of your future is hidden in your daily routine.",s:"Mike Murdock"},
{q:"Success is the sum of small efforts, repeated day in and day out.",s:"Robert Collier"},
{q:"Discipline is choosing between what you want now and what you want most.",s:"Abraham Lincoln"},
{q:"Do you want to know who you are? Don't ask. Act. Action will delineate and define you.",s:"Thomas Jefferson"},
{q:"Motivation is what gets you started. Habit is what keeps you going.",s:"Jim Ryun"},
{q:"The difference between a master and a beginner is that the master has failed more times than the beginner has tried.",s:"Stephen McCraine"},
{q:"Consistency is what transforms average into excellence.",s:"Unknown"},
{q:"Small disciplines repeated with consistency every day lead to great achievements.",s:"John C. Maxwell"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"Our greatest glory is not in never falling, but in rising every time we fall.",s:"Confucius"},
{q:"The man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"Action is the foundational key to all success.",s:"Pablo Picasso"},
{q:"Well done is better than well said.",s:"Benjamin Franklin"},
{q:"The secret of getting ahead is getting started.",s:"Mark Twain"},
{q:"Amateurs sit and wait for inspiration, the rest of us just get up and go to work.",s:"Stephen King"},
{q:"You don't have to be great to start, but you have to start to be great.",s:"Zig Ziglar"},
{q:"What you do speaks so loudly that I cannot hear what you say.",s:"Ralph Waldo Emerson"},
{q:"The only impossible journey is the one you never begin.",s:"Tony Robbins"},
{q:"Success is not final, failure is not fatal: it is the courage to continue that counts.",s:"Winston Churchill"},
{q:"What we think, we become.",s:"Buddha"},
{q:"The secret of change is to focus all of your energy, not on fighting the old, but on building the new.",s:"Socrates"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"A journey of a thousand miles begins with a single step.",s:"Lao Tzu"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"Your time is limited, don't waste it living someone else's life.",s:"Steve Jobs"},
{q:"In the middle of difficulty lies opportunity.",s:"Albert Einstein"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"It is not that we have a short time to live, but that we waste much of it.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"Concentrate every minute on doing what's in front of you with precise and genuine seriousness.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"We cannot choose our external circumstances, but we can always choose how we respond to them.",s:"Epictetus"},
{q:"Only the educated are free.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"Lay hold of today's task, and you will not need to depend so much upon tomorrow's.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"}
],
late:[
{q:"The last three words of a man who quit: I wish I'd. The last three of a man who finished: I did it.",s:"Unknown"},
{q:"Finish each day and be done with it. You have done what you could.",s:"Ralph Waldo Emerson"},
{q:"What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"You may have to fight a battle more than once to win it.",s:"Margaret Thatcher"},
{q:"When you feel like quitting, think about why you started.",s:"Unknown"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"Courage is not having the strength to go on. It is going on when you don't have the strength.",s:"Theodore Roosevelt"},
{q:"What you do today can improve all your tomorrows.",s:"Ralph Marston"},
{q:"Perseverance is not a long race; it is many short races one after the other.",s:"Walter Elliot"},
{q:"The difference between a master and a beginner is that the master has failed more times than the beginner has tried.",s:"Stephen McCraine"},
{q:"Success is not final, failure is not fatal: it is the courage to continue that counts.",s:"Winston Churchill"},
{q:"It always seems impossible until it's done.",s:"Nelson Mandela"},
{q:"Do what you can, with what you have, where you are.",s:"Theodore Roosevelt"},
{q:"You are never too old to set another goal or to dream a new dream.",s:"C.S. Lewis"},
{q:"Our greatest glory is not in never falling, but in rising every time we fall.",s:"Confucius"},
{q:"The only impossible journey is the one you never begin.",s:"Tony Robbins"},
{q:"A man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"The secret of your future is hidden in your daily routine.",s:"Mike Murdock"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"Confine yourself to the present.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"We cannot choose our external circumstances, but we can always choose how we respond to them.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"If you want to improve, be content to appear foolish and stupid.",s:"Epictetus"},
{q:"Wealth consists not in having great possessions, but in having few wants.",s:"Epictetus"},
{q:"Only the educated are free.",s:"Epictetus"},
{q:"Lay hold of today's task, and you will not need to depend so much upon tomorrow's.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"True happiness is to enjoy the present, without anxious dependence upon the future.",s:"Seneca"},
{q:"He who fears death will never do anything worthy of a living man.",s:"Seneca"}
],
final:[
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"It is not death that a man should fear, but he should fear never beginning to live.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"To live each day as if one's last, never flustered, never apathetic, is the perfection of character.",s:"Marcus Aurelius"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"No man is free who is not master of himself.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"True happiness is to enjoy the present, without anxious dependence upon the future.",s:"Seneca"},
{q:"While we are postponing, life speeds by.",s:"Seneca"},
{q:"We suffer more often in imagination than in reality.",s:"Seneca"},
{q:"He who fears death will never do anything worthy of a living man.",s:"Seneca"},
{q:"Lay hold of today's task, and you will not need to depend so much upon tomorrow's.",s:"Seneca"},
{q:"The whole future lies in uncertainty: live immediately.",s:"Seneca"},
{q:"As is a tale, so is life: not how long it is, but how good it is, is what matters.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"Our greatest glory is not in never falling, but in rising every time we fall.",s:"Confucius"},
{q:"The man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"Success is not final, failure is not fatal: it is the courage to continue that counts.",s:"Winston Churchill"},
{q:"What you do today can improve all your tomorrows.",s:"Ralph Marston"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"Do what you can, with what you have, where you are.",s:"Theodore Roosevelt"},
{q:"It always seems impossible until it's done.",s:"Nelson Mandela"},
{q:"Finish each day and be done with it. You have done what you could.",s:"Ralph Waldo Emerson"},
{q:"You are never too old to set another goal or to dream a new dream.",s:"C.S. Lewis"},
{q:"A journey of a thousand miles begins with a single step.",s:"Lao Tzu"}
],
complete:[
{q:"A strong day is built from ordinary actions repeated with intention.",s:"Seneca"},
{q:"You have done what you could. Finish each day and be done with it.",s:"Ralph Waldo Emerson"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"Very little is needed to make a happy life; it is all within yourself.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Our life is what our thoughts make it.",s:"Marcus Aurelius"},
{q:"Today I escaped anxiety. Or no, I discarded it, for it was within me.",s:"Marcus Aurelius"},
{q:"Do not indulge in dreams of having what you have not, but reckon up the chief of the blessings you do possess.",s:"Marcus Aurelius"},
{q:"Let men see, let them know, a real man, who lives as he was meant to live.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"It is not outside forces that make us restless, but our own unexamined thoughts.",s:"Marcus Aurelius"},
{q:"To live happily is an inward power of the soul.",s:"Marcus Aurelius"},
{q:"True happiness is to enjoy the present, without anxious dependence upon the future.",s:"Seneca"},
{q:"Wealth consists not in having great possessions, but in having few wants.",s:"Epictetus"},
{q:"It is impossible for a man to learn what he thinks he already knows.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"We are what we repeatedly do. Excellence, then, is not an act, but a habit.",s:"Aristotle"},
{q:"The best reason to live is to die to what was and be born to what is.",s:"Marcus Aurelius"},
{q:"Your time is limited, don't waste it living someone else's life.",s:"Steve Jobs"},
{q:"What you do speaks so loudly that I cannot hear what you say.",s:"Ralph Waldo Emerson"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"The secret of your future is hidden in your daily routine.",s:"Mike Murdock"},
{q:"Well done is better than well said.",s:"Benjamin Franklin"}
],
ahead:[
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Concentrate every minute on doing what's in front of you with precise and genuine seriousness.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"The happiness of your life depends upon the quality of your thoughts.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"Never rate any possible gain as greater than the duty you are doing.",s:"Marcus Aurelius"},
{q:"Accept the things to which fate binds you, and love the people with whom fate brings you together.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"Confine yourself to the present.",s:"Marcus Aurelius"},
{q:"The mind which is free from passions is a citadel.",s:"Marcus Aurelius"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"Wealth consists not in having great possessions, but in having few wants.",s:"Epictetus"},
{q:"No man is free who is not master of himself.",s:"Epictetus"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"Luck is what happens when preparation meets opportunity.",s:"Seneca"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"The man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"Well begun is half done.",s:"Aristotle"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"Do what you can, with what you have, where you are.",s:"Theodore Roosevelt"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"Success is not final, failure is not fatal: it is the courage to continue that counts.",s:"Winston Churchill"}
],
behind:[
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"We suffer more often in imagination than in reality.",s:"Seneca"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"If you want to improve, be content to appear foolish and stupid.",s:"Epictetus"},
{q:"We cannot choose our external circumstances, but we can always choose how we respond to them.",s:"Epictetus"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"Our greatest glory is not in never falling, but in rising every time we fall.",s:"Confucius"},
{q:"The man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"What you do today can improve all your tomorrows.",s:"Ralph Marston"},
{q:"Do what you can, with what you have, where you are.",s:"Theodore Roosevelt"},
{q:"It always seems impossible until it's done.",s:"Nelson Mandela"},
{q:"Success is not final, failure is not fatal: it is the courage to continue that counts.",s:"Winston Churchill"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"The secret of your future is hidden in your daily routine.",s:"Mike Murdock"},
{q:"A journey of a thousand miles begins with a single step.",s:"Lao Tzu"},
{q:"You may have to fight a battle more than once to win it.",s:"Margaret Thatcher"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"Well begun is half done.",s:"Aristotle"},
{q:"Do one thing every day that scares you.",s:"Eleanor Roosevelt"},
{q:"The only impossible journey is the one you never begin.",s:"Tony Robbins"}
],
streakHigh:[
{q:"We are what we repeatedly do. Excellence, then, is not an act, but a habit.",s:"Aristotle"},
{q:"Success is the sum of small efforts, repeated day in and day out.",s:"Robert Collier"},
{q:"The secret of your future is hidden in your daily routine.",s:"Mike Murdock"},
{q:"Motivation is what gets you started. Habit is what keeps you going.",s:"Jim Ryun"},
{q:"Consistency is what transforms average into excellence.",s:"Unknown"},
{q:"Small disciplines repeated with consistency every day lead to great achievements.",s:"John C. Maxwell"},
{q:"Discipline is choosing between what you want now and what you want most.",s:"Abraham Lincoln"},
{q:"The secret of change is to focus all of your energy, not on fighting the old, but on building the new.",s:"Socrates"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"Concentrate every minute on doing what's in front of you with precise and genuine seriousness.",s:"Marcus Aurelius"},
{q:"The soul becomes dyed with the color of its thoughts.",s:"Marcus Aurelius"},
{q:"Think of yourself as dead. You have lived your life. Now take what is left and live it properly.",s:"Marcus Aurelius"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"No man is free who is not master of himself.",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"Luck is what happens when preparation meets opportunity.",s:"Seneca"}
],
streakLow:[
{q:"The impediment to action advances action. What stands in the way becomes the way.",s:"Marcus Aurelius"},
{q:"Do every act of your life as though it were the very last act of your life.",s:"Marcus Aurelius"},
{q:"You have power over your mind, not outside events. Realize this, and you will find strength.",s:"Marcus Aurelius"},
{q:"Waste no more time arguing about what a good man should be. Be one.",s:"Marcus Aurelius"},
{q:"It is not death that a man should fear, but he should fear never beginning to live.",s:"Marcus Aurelius"},
{q:"Never rate any possible gain as greater than the duty you are doing.",s:"Marcus Aurelius"},
{q:"First say to yourself what you would be; and then do what you have to do.",s:"Epictetus"},
{q:"No man is free who is not master of himself.",s:"Epictetus"},
{q:"Make the best use of what is in your power, and take the rest as it happens.",s:"Epictetus"},
{q:"How long will you wait before you demand the best of yourself?",s:"Epictetus"},
{q:"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",s:"Epictetus"},
{q:"It's not what happens to you, but how you react to it that matters.",s:"Epictetus"},
{q:"If you want to improve, be content to appear foolish and stupid.",s:"Epictetus"},
{q:"Difficulties strengthen the mind, as labor does the body.",s:"Seneca"},
{q:"It is the power of the mind to be unconquerable.",s:"Seneca"},
{q:"He who is brave is free.",s:"Seneca"},
{q:"No man was ever wise by chance.",s:"Seneca"},
{q:"While we are postponing, life speeds by.",s:"Seneca"},
{q:"The whole future lies in uncertainty: live immediately.",s:"Seneca"},
{q:"A gem cannot be polished without friction, nor a man perfected without trials.",s:"Seneca"},
{q:"It does not matter how slowly you go as long as you do not stop.",s:"Confucius"},
{q:"Our greatest glory is not in never falling, but in rising every time we fall.",s:"Confucius"},
{q:"The man who moves a mountain begins by carrying away small stones.",s:"Confucius"},
{q:"The best time to plant a tree was twenty years ago. The second best time is now.",s:"Chinese Proverb"},
{q:"A journey of a thousand miles begins with a single step.",s:"Lao Tzu"},
{q:"Action expresses priorities.",s:"Mahatma Gandhi"},
{q:"Quality is not an act, it is a habit.",s:"Aristotle"},
{q:"Well begun is half done.",s:"Aristotle"},
{q:"Do what you can, with what you have, where you are.",s:"Theodore Roosevelt"},
{q:"The only impossible journey is the one you never begin.",s:"Tony Robbins"}
]
};

const dailyQuotes=[
"What you do every day matters more than what you do once in a while.",
"Discipline is the bridge between goals and accomplishment.",
"The secret of your future is hidden in your daily routine.",
"You do not rise to the level of your goals. You fall to the level of your systems.",
"Small daily improvements over time lead to stunning results.",
"The price of discipline is always less than the pain of regret.",
"What stands in the way becomes the way.",
"Freedom is not the absence of commitments but the ability to choose them.",
"We are what we repeatedly do. Excellence is not an act but a habit.",
"The impediment to action advances action. What stands in the way becomes the way.",
"First say to yourself what you would be, and then do what you have to do.",
"It is not that we have a short time to live, but that we waste much of it.",
"Difficulties strengthen the mind as labor does the body.",
"You have power over your mind, not outside events. Realize this, and you will find strength.",
"The best revenge is not to be like your enemy.",
"At dawn, when you have trouble getting out of bed, present this thought to yourself:",
"Very little is needed to make a happy life; it is all within yourself.",
"Waste no more time arguing about what a good man should be. Be one.",
"Everything we hear is an opinion, not a fact. Everything we see is a perspective, not the truth.",
"The best revenge is to be unlike him who performed the injury.",
"When you arise in the morning, think of what a precious privilege it is to be alive.",
"The happiness of your life depends upon the quality of your thoughts.",
"Look back over the past, with its changing empires that rose and fell.",
"It is not death that a man should fear, but he should fear never beginning to live.",
"Meditate not on the fear of death, but on the eternity you already possess.",
"No man is free who is not master of himself.",
"Difficulties are things that show a person what they are.",
"The greater the difficulty, the more glory in surmounting it.",
"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control.",
"Attach yourself to what is spiritually superior, regardless of what other people think or do.",
"He who sweats more in training bleeds less in war.",
"Be tolerant with others and strict with yourself.",
"Talk not of blessedness until thou hast endured some suffering.",
"To bear what is terrible with grace is the mark of a strong soul.",
"The mind that is anxious about future events is miserable.",
"Never let the future disturb you. You will meet it, if you have to, with the same weapons of reason.",
"Loss is nothing else but change, and change is Nature's delight.",
"How long are you going to wait before you demand the best for yourself?",
"Do not pray for an easy life; pray for the strength to endure a difficult one.",
"Action expresses priorities.",
"We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
"The only way to do great work is to love what you do.",
"The best time to plant a tree was twenty years ago. The second best time is now.",
"Your time is limited. Do not waste it living someone else's life.",
"Stay hungry. Stay foolish.",
"In the middle of difficulty lies opportunity.",
"Character is fate.",
"Knowing yourself is the beginning of all wisdom.",
"It is during our darkest moments that we must focus to see the light.",
"The mind is everything. What you think you become.",
"Peace comes from within. Do not seek it without.",
"Health is the greatest possession.",
"An eye for an eye will only make the whole world blind.",
"Three things cannot be long hidden: the sun, the moon, and the truth.",
"Happiness is not something ready-made. It comes from your own actions.",
"The only real failure in life is not to be true to the best one knows."
];

const usedQuotes={start:[],early:[],mid:[],late:[],final:[],complete:[],ahead:[],behind:[],streakHigh:[],streakLow:[]};
const MAX_USED=12;

function pickFromPool(pool,used){
  const available=pool.filter((_,i)=>!used.includes(i));
  if(available.length===0){used.length=0;return pickFromPool(pool,used);}
  const idx=Math.floor(Math.random()*available.length);
  const originalIdx=pool.indexOf(available[idx]);
  used.push(originalIdx);
  if(used.length>MAX_USED)used.shift();
  return available[idx];
}

function getContextTier(pct,completedCount,totalBlocks,idx,streak,isAhead){
  const p=pct*100;
  const isFirst=completedCount===1;
  const isFinal=completedCount===totalBlocks-1;
  const isDone=completedCount===totalBlocks;
  const remaining=totalBlocks-completedCount;
  if(isDone)return'complete';
  if(isFinal)return'final';
  if(isFirst)return'start';
  if(streak>=7&&Math.random()<0.2)return'streakHigh';
  if(streak<=1&&Math.random()<0.2)return'streakLow';
  if(isAhead&&Math.random()<0.15)return'ahead';
  if(!isAhead&&remaining<=3&&Math.random()<0.3)return'behind';
  if(p<20)return'start';
  if(p<50)return'early';
  if(p<75)return'mid';
  if(p<95)return'late';
  return'late';
}

function getQuote(pct,taskTitle,idx,totalBlocks,streak,isAhead){
  const completedCount=Math.round(pct*totalBlocks);
  const tier=getContextTier(pct,completedCount,totalBlocks,idx,streak,isAhead);
  return pickFromPool(quoteLibrary[tier],usedQuotes[tier]);
}

function showEncouragement(pct,taskTitle,idx,streak,isAhead){
  const quote=getQuote(pct,taskTitle,idx,totalBlocks,streak,isAhead);
  const toast=document.getElementById('encourage-toast');
  document.getElementById('e-text').textContent=quote.q;
  document.getElementById('e-source').textContent=quote.s;
  toast.classList.remove('done');
  if(pct>=1)toast.classList.add('done');
  toast.classList.add('show');
  const dur=pct>=1?6000:quote.q.length>60?7000:6000;
  setTimeout(()=>toast.classList.remove('show'),dur);
}


function showXP(x,y){
  const el=document.createElement('div');
  el.className='xp-float';
  el.textContent=`+${x} XP`;
  el.style.left=y+'px';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1800);
}

function haptic(){if(navigator.vibrate)navigator.vibrate(10)}

// Confetti
const confettiCanvas=document.getElementById('confetti-canvas');
const confettiCtx=confettiCanvas.getContext('2d');
let particles=[];
function resizeConfetti(){confettiCanvas.width=window.innerWidth;confettiCanvas.height=window.innerHeight}
window.addEventListener('resize',resizeConfetti);resizeConfetti();

function spawnConfetti(count=12){
  const colors=['#8b5cf6','#c084fc','#22c55e','#f59e0b','#f43f5e','#3b82f6'];
  for(let i=0;i<count;i++){
    particles.push({
      x:Math.random()*confettiCanvas.width,
      y:confettiCanvas.height+10,
      vx:(Math.random()-0.5)*8,
      vy:-Math.random()*12-4,
      size:Math.random()*6+3,
      color:colors[Math.floor(Math.random()*colors.length)],
      rotation:Math.random()*360,
      rotSpeed:(Math.random()-0.5)*10,
      life:1
    });
  }
}

function animateConfetti(){
  confettiCtx.clearRect(0,0,confettiCanvas.width,confettiCanvas.height);
  particles=particles.filter(p=>{
    p.x+=p.vx;p.y+=p.vy;p.vy+=0.3;p.rotation+=p.rotSpeed;p.life-=0.015;
    if(p.life<=0)return false;
    confettiCtx.save();
    confettiCtx.translate(p.x,p.y);
    confettiCtx.rotate(p.rotation*Math.PI/180);
    confettiCtx.fillStyle=p.color;
    confettiCtx.globalAlpha=p.life;
    confettiCtx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
    confettiCtx.restore();
    return true;
  });
  if(particles.length>0)requestAnimationFrame(animateConfetti);
}

function updateProgress(){
  const pct=(currentStep/totalSteps)*100;
  document.getElementById('progress-fill').style.width=pct+'%';
  document.getElementById('progress-label').textContent=currentStep<=totalSteps?`${currentStep}/${totalSteps}`:'Done';
  document.getElementById('back-btn').classList.toggle('visible',currentStep>1&&currentStep<=totalSteps);
}
function showStep(n){document.querySelectorAll('.step').forEach(s=>s.classList.remove('active'));const step=document.querySelector(`.step[data-step="${n}"]`);if(step)step.classList.add('active');currentStep=n;updateProgress();window.scrollTo({top:0,behavior:'smooth'})}
function nextStep(){
  const problem=stepProblem(currentStep);
  showStepError(currentStep,problem);
  if(problem)return;
  if(currentStep<totalSteps)showStep(currentStep+1);
}
function prevStep(){if(currentStep>1)showStep(currentStep-1)}
function selectGoal(el){const wasSelected=el.classList.contains('selected');document.querySelectorAll('.goal-card').forEach(c=>c.classList.remove('selected'));if(!wasSelected){el.classList.add('selected');state.goal=el.dataset.val;document.getElementById('next1').classList.add('ready')}else{state.goal='';document.getElementById('next1').classList.remove('ready')}}
function fillDesc(el){document.getElementById('goal-desc').value=el.textContent;state.desc=el.textContent;document.getElementById('next2').classList.add('ready')}
function checkDesc(){state.desc=document.getElementById('goal-desc').value.trim().slice(0,120);state.deadline=document.getElementById('deadline').value||'';document.getElementById('next2').classList.toggle('ready',state.desc.length>=3);showStepError(2,'')}
function selectLifestyle(el){const wasSelected=el.classList.contains('selected');document.querySelectorAll('.lifestyle-card').forEach(c=>c.classList.remove('selected'));document.querySelectorAll('.inline-fields').forEach(f=>f.classList.remove('show'));if(!wasSelected){el.classList.add('selected');state.lifestyle=el.dataset.val;const f=document.getElementById('fields-'+el.dataset.val);if(f)f.classList.add('show');document.getElementById('next3').classList.add('ready')}else{state.lifestyle='';document.getElementById('next3').classList.remove('ready')}}
function selectProd(el){const wasSelected=el.classList.contains('selected');document.querySelectorAll('.prod-card').forEach(c=>c.classList.remove('selected'));if(!wasSelected){el.classList.add('selected');state.productivity=el.dataset.val;document.getElementById('next4').classList.add('ready')}else{state.productivity='';document.getElementById('next4').classList.remove('ready')}}
function togglePref(el){el.classList.toggle('selected');const v=el.dataset.val;if(state.prefs.includes(v))state.prefs=state.prefs.filter(p=>p!==v);else state.prefs.push(v)}

function showSummary(){
  collectProfile();
  const errs=Scheduler.validate(state);
  if(errs.length){showStep(4);showStepError(4,errs[0]);return}
  if(!state.startDate)state.startDate=todayKey();
  const ln={free:'Free most of the day',student:'Student',working:'Working full time',parttime:'Part-time / shifts'};
  const pn={morning:'Morning Person',afternoon:'Afternoon',night:'Night Owl',flexible:'Flexible'};
  const row=(l,v)=>`<div class="summary-row"><span class="summary-label">${escapeHtml(l)}</span><span class="summary-value">${escapeHtml(v)}</span></div>`;
  let html=row('Goal',GOAL_NAMES[state.goal]||state.goal)+row("What you're after",state.desc||'Not specified');
  if(state.deadline){const left=Scheduler.daysBetween(todayKey(),state.deadline);html+=row('Deadline',`${keyToDate(state.deadline).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})} (${left} day${left===1?'':'s'} left)`)}
  html+=row('Your day',ln[state.lifestyle]||'-');
  if(state.workStart)html+=row('Committed time',`${Scheduler.clock(Scheduler.toMin(state.workStart))} – ${Scheduler.clock(Scheduler.toMin(state.workEnd))}`+(state.commute?` + ${state.commute} min commute each way`:''));
  html+=row('Your peak',pn[state.productivity]||'-')+row('Wake / Bed',`${Scheduler.clock(Scheduler.toMin(state.wake))} / ${Scheduler.clock(Scheduler.toMin(state.bed))}`);
  if(state.prefs.length)html+=row('Preferences',`${state.prefs.length} selected`);
  const plan=Scheduler.build(state);
  html+=row('Focused goal time',Scheduler.duration(plan.focusMinutes)+' a day');
  document.getElementById('summary-card').innerHTML=html;
  showStep(6);
}
function timeToMin(t){const [h,m]=t.split(':').map(Number);return h*60+m}
function minToTime(m){const h=Math.floor(((m%1440)+1440)%1440/60);const mm=((m%1440)+1440)%1440%60;return`${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`}
function fmtTime(m){let[h,mm]=minToTime(m).split(':').map(Number);return`${h%12||12}:${String(mm).padStart(2,'0')} ${h>=12?'PM':'AM'}`}
function durStr(min){return min>=60?`${Math.floor(min/60)}h${min%60?' '+min%60+'m':''}`:`${min}m`}

function generateStrategy(ctx){
  const{clean,wake,bed,hasCommit,commitS,commitE,commute,isMorning,isNight,prefs,hasWorkout,morningWorkout,goalDesc,state:st,prevPct,daily:dailyData,now}=ctx;
  const insights=[];
  const push=(text,weight)=>{insights.push({text,weight})};
  const totalTaskMin=clean.reduce((a,b)=>a+b.dur,0);
  const deepWorkBlocks=clean.filter(b=>b.kind==='focus');
  const deepWorkMin=deepWorkBlocks.reduce((a,b)=>a+b.dur,0);
  const breakBlocks=clean.filter(b=>b.kind==='break');
  const breakCount=breakBlocks.length;
  const breakMin=breakBlocks.reduce((a,b)=>a+b.dur,0);
  const currentMin=now.getHours()*60+now.getMinutes();
  const sleepHrs=((1440-(bed-wake))/60).toFixed(1);
  const awakeHrs=(bed-wake)/60;
  const dates=Object.keys(dailyData).sort();
  const histDays=dates.map(d=>dailyData[d]).filter(d=>d&&d.total>0);
  const totalDays=histDays.length;
  const avgPct=totalDays?Math.round(histDays.reduce((a,d)=>a+d.pct,0)/totalDays):0;
  const last7=histDays.slice(-7);
  const last7Avg=last7.length?Math.round(last7.reduce((a,d)=>a+d.pct,0)/last7.length):0;
  const prev7=histDays.slice(-14,-7);
  const prev7Avg=prev7.length?Math.round(prev7.reduce((a,d)=>a+d.pct,0)/prev7.length):0;
  const yesterdayData=dates.length?dailyData[dates[dates.length-1]]:null;
  const yesterdayPct=yesterdayData?yesterdayData.pct:0;
  const yesterdayCount=yesterdayData?yesterdayData.count:0;
  const nowDow=now.getDay();
  const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayName=dayNames[nowDow];
  const dowPcts={};
  dates.forEach(d=>{const dt=new Date(d+'T00:00:00');const dw=dt.getDay();if(!dowPcts[dw])dowPcts[dw]=[];if(dailyData[d]&&dailyData[d].total>0)dowPcts[dw].push(dailyData[d].pct)});
  const todayDowAvg=dowPcts[nowDow]&&dowPcts[nowDow].length?Math.round(dowPcts[nowDow].reduce((a,b)=>a+b,0)/dowPcts[nowDow].length):null;
  const taskCount=clean.filter(b=>b.task).length;
  const longestTask=clean.length?clean.reduce((a,b)=>a.dur>b.dur?a:b):null;
  const morningTasks=clean.filter(b=>b.start<timeToMin('12:00')&&b.start>=wake);
  const afternoonTasks=clean.filter(b=>b.start>=timeToMin('12:00'));
  const morningTaskMin=morningTasks.reduce((a,b)=>a+b.dur,0);
  const morningPct=totalTaskMin?Math.round((morningTaskMin/totalTaskMin)*100):0;
  const freeBlocks=[];
  for(let i=0;i<clean.length-1;i++){
    const endA=clean[i].start+clean[i].dur;
    const startB=clean[i+1].start;
    if(startB-endA>=10)freeBlocks.push({from:endA,to:startB,dur:startB-endA,after:clean[i].title,before:clean[i+1].title});
  }
  let consecutiveLong=0;let maxConsecutive=0;
  clean.forEach(b=>{if(b.dur>=45){consecutiveLong++;maxConsecutive=Math.max(maxConsecutive,consecutiveLong)}else{consecutiveLong=0}});
  const completedSoFar=clean.filter(b=>b.task).filter(b=>{
    const blockEnd=b.start+b.dur;
    return currentMin>=blockEnd;
  }).length;
  const pctSoFar=taskCount?completedSoFar/taskCount:0;

  // HIDDEN OPPORTUNITIES
  if(freeBlocks.length>0){
    const biggest=freeBlocks.reduce((a,b)=>a.dur>b.dur?a:b);
    if(biggest.dur>=20){
      push(`Your longest open window is ${durStr(biggest.dur)} at ${fmtTime(biggest.from)}. That's long enough to start and finish something small — or review what's coming next so you don't cold-start.`,3);
    }
  }
  if(deepWorkBlocks.length>=2){
    const first=deepWorkBlocks[0];
    const gap=first.start-wake;
    if(gap>=20&&gap<=60){
      const preGapTask=clean.find(b=>b.start>=wake&&(b.start+b.dur)<=first.start);
      if(preGapTask&&preGapTask.dur<=15){
        push(`You have a short task (${preGapTask.title}, ${durStr(preGapTask.dur)}) right before your first deep work block at ${fmtTime(first.start)}. Complete it quickly and use the remaining ${gap-preGapTask.dur} minutes to set up — context-switching into deep work costs 15+ minutes of ramp-up.`,4);
      }
    }
  }
  if(hasCommit&&commute>0){
    const postCommitTasks=clean.filter(b=>b.start>=commitE+commute);
    if(postCommitTasks.length>=3){
      const postMin=postCommitTasks.reduce((a,b)=>a+b.dur,0);
      push(`After your commute back, you have ${postCommitTasks.length} tasks totaling ${durStr(postMin)}. That's a full second shift. The most important one should go first — decision fatigue makes the later ones harder.`,4);
    }
  }
  if(freeBlocks.length>=2){
    const morningFree=freeBlocks.filter(b=>b.from<timeToMin('12:00'));
    const afternoonFree=freeBlocks.filter(b=>b.from>=timeToMin('12:00'));
    if(morningFree.length===0&&afternoonFree.length>=2){
      push(`All your open time is in the afternoon. Your morning has no slack — if any task runs late, the cascade hits everything. Start precisely on time today.`,4);
    }
  }

  // RISK ANALYSIS
  if(consecutiveLong>=3){
    push(`${consecutiveLong} demanding blocks in a row. After 90 minutes of sustained focus, decision quality drops. Your planned break isn't optional — it's where you prevent mistakes in the later blocks.`,5);
  }
  if(longestTask&&longestTask.dur>=60){
    const otherLongBlocks=clean.filter(b=>b!==longestTask&&b.dur>=45);
    if(otherLongBlocks.length>=2){
      push(`"${longestTask.title}" (${durStr(longestTask.dur)}) is surrounded by ${otherLongBlocks.length} other long blocks. The risk isn't any single task — it's the accumulated fatigue. Take every break exactly on time today.`,5);
    }
  }
  if(hasCommit&&commute>0){
    const commitEnd=commitE+commute;
    const afterCommit=clean.filter(b=>b.start>=commitEnd);
    if(afterCommit.length>=3){
      const afterMin=afterCommit.reduce((a,b)=>a+b.dur,0);
      if(afterMin>180){
        push(`You have ${durStr(afterMin)} of tasks after your commute home. That's a lot when your energy is already drained. If you feel like cutting something, the last task is the safest one to trim.`,4);
      }
    }
  }
  if(freeBlocks.length>0){
    const tightest=freeBlocks.reduce((best,b)=>b.dur<best.dur?b:best,freeBlocks[0]);
    if(tightest.dur<=8&&tightest.dur>0){
      push(`Only ${tightest.dur} minutes between ${tightest.after} and ${tightest.before}. That's barely enough to transition — if either runs over, the next one starts late.`,3);
    }
  }

  // PATTERN RECOGNITION
  if(totalDays>=5&&todayDowAvg!==null){
    const diff=todayDowAvg-avgPct;
    if(diff>10){
      push(`Your ${dayName}s historically average ${todayDowAvg}% completion — ${diff} points above your ${avgPct}% overall. Something about your ${dayName} routine works. Identify what it is and repeat it.`,4);
    }
    if(diff<-10){
      push(`Your ${dayName}s average ${todayDowAvg}% — below your ${avgPct}% overall. The pattern suggests ${dayName}s are harder for you. Front-load the most important task before the dip hits.`,4);
    }
  }
  if(last7.length>=3&&prev7.length>=3){
    const trend=last7Avg-prev7Avg;
    if(trend>10){
      push(`Your completion rate jumped ${Math.round(trend)} points this week vs last. Whatever you changed is working — keep doing it.`,3);
    }
    if(trend<-10){
      push(`Down ${Math.abs(Math.round(trend))} points from last week. When completion drops two weeks in a row, it usually means the schedule needs adjusting, not more willpower.`,4);
    }
  }
  if(totalDays>=3){
    const recentCompletions=histDays.slice(-3).map(d=>d.count);
    const avgRecent=Math.round(recentCompletions.reduce((a,b)=>a+b,0)/recentCompletions.length);
    if(avgRecent>=taskCount*0.8){
      push(`You've been averaging ${avgRecent} tasks completed over your last 3 days. Today has ${taskCount} tasks — you're within your recent range. This is a pace you can maintain.`,3);
    }
    if(avgRecent<taskCount*0.5&&taskCount>=5){
      push(`You've averaged ${avgRecent} completed tasks recently, but today has ${taskCount}. That's a significant jump — consider which 2-3 tasks matter most and treat the rest as bonus.`,4);
    }
  }

  // GOAL FORECASTING
  if(taskCount>=4){
    const firstFourMin=clean.slice(0,4).reduce((a,b)=>a+b.dur,0);
    const firstFourPct=Math.round((4/taskCount)*100);
    push(`Completing the first 4 tasks puts you at ${firstFourPct}% of today's workload. Those ${durStr(firstFourMin)} are your highest-leverage minutes.`,4);
  }
  if(deepWorkMin>=90){
    const deepPct=Math.round((deepWorkMin/totalTaskMin)*100);
    push(`${deepPct}% of your work time is deep focus. That's where real progress happens — the other tasks are maintenance. Protect those blocks.`,3);
  }
  if(morningPct>=70){
    push(`${morningPct}% of today's work is before noon. Your morning is carrying the day. If you lose it to slow starts, you lose most of your output.`,4);
  }

  // SCHEDULE OPTIMIZATION
  if(freeBlocks.length>0){
    const biggest=freeBlocks.reduce((a,b)=>a.dur>b.dur?a:b);
    if(biggest.dur>=15){
      const nearbyTask=clean.find(b=>b.start>biggest.from);
      if(nearbyTask&&nearbyTask.dur>=30){
        push(`If "${nearbyTask.title}" runs over, you can absorb it into the ${durStr(biggest.dur)} gap after ${biggest.after} without affecting anything else. That gap is your safety net.`,3);
      }
    }
  }
  if(hasWorkout){
    const workoutBlock=clean.find(b=>b.title.includes('Workout'));
    if(workoutBlock){
      const afterWorkout=clean.filter(b=>b.start>=workoutBlock.start+workoutBlock.dur&&b.title!=='Break');
      if(afterWorkout.length>=2){
        const hardestAfter=afterWorkout.reduce((a,b)=>a.dur>b.dur?a:b);
        if(hardestAfter.dur>=45){
          push(`Your hardest post-workout task is "${hardestAfter.title}" (${durStr(hardestAfter.dur)}). Schedule it when your post-exercise energy peak hits — usually 30-60 minutes after you finish.`,4);
        }
      }
    }
  }

  // PROGRESS COMPARISON
  if(yesterdayData&&totalDays>=2){
    const yCount=yesterdayCount;
    const diff=taskCount-yCount;
    if(diff>2){
      push(`Today has ${taskCount} tasks vs ${yCount} yesterday. That's ${diff} more — a bigger day. Know which tasks are non-negotiable before you start.`,3);
    }
    if(diff<-2){
      push(`${taskCount} tasks today, ${Math.abs(diff)} fewer than yesterday's ${yCount}. Lighter days aren't less productive — they're recovery. Use the extra time for what you skipped yesterday.`,3);
    }
  }
  if(yesterdayPct>0&&yesterdayPct<50&&totalDays>=2){
    const skippedTasks=histDays.slice(-1).map(d=>{
      if(d.completed){
        return d.completed;
      }
      return [];
    }).flat();
    if(skippedTasks.length>0){
      push(`Yesterday you completed ${yesterdayCount} of ${yesterdayTotal} tasks. The ${yesterdayTotal-yesterdayCount} you skipped are still waiting. If any of them are today, prioritize them early.`,3);
    }
  }
  if(totalDays>=7){
    const weekAvg=last7Avg;
    if(weekAvg>=70){
      push(`Your 7-day average is ${weekAvg}%. You're in a strong rhythm — the goal today isn't to push harder, it's to maintain consistency.`,3);
    }
    if(weekAvg<40&&weekAvg>0){
      push(`Your 7-day average is ${weekAvg}%. When completion drops below 40% for a week, the schedule usually needs restructuring. Check if your task count matches your actual capacity.`,4);
    }
  }

  // HABIT COACHING
  if(totalDays>=3){
    const firstTaskTimes=histDays.slice(-5).map((d,i)=>{
      const date=dates[dates.length-5+i];
      if(d.count>0&&d.completed&&d.completed.length>0){
        return d.completed[0];
      }
      return null;
    }).filter(Boolean);
    if(firstTaskTimes.length>=2){
      push(`Your best days start with the first task done within 30 minutes of waking. The data shows you complete more when you move fast out of the gate.`,3);
    }
  }
  if(streak>=3&&streak<14){
    push(`Day ${streak} of your streak. The next milestone is ${Math.ceil(streak/3)*3} days. After that, the streak itself becomes the motivation — you won't want to break it.`,3);
  }
  if(streak===0&&totalDays>=3){
    const lastActive=dates[dates.length-1];
    if(lastActive){
      const daysSince=Math.floor((now-new Date(lastActive+'T00:00:00'))/(1000*60*60*24));
      if(daysSince>=2){
        push(`It's been ${daysSince} days since your last active day. The hardest part of restarting is the first task — just complete one thing today and the momentum returns.`,3);
      }
    }
  }

  // TIME AWARENESS
  if(parseFloat(sleepHrs)<7){
    push(`${sleepHrs}h of sleep. Your reaction time and working memory are both reduced. The lighter tasks after lunch are there for a reason — don't swap in demanding work.`,4);
  }
  const afterLunch=clean.filter(b=>b.start>=timeToMin('13:00')&&b.start<timeToMin('17:00'));
  if(afterLunch.length>=4){
    const afterLunchMin=afterLunch.reduce((a,b)=>a+b.dur,0);
    push(`${afterLunch.length} tasks between 1-5 PM totaling ${durStr(afterLunchMin)}. That's your hardest stretch — your body wants to sleep. The break between them is more important than any individual task.`,4);
  }
  if(breakCount===0&&totalTaskMin>180){
    push(`No breaks across ${durStr(totalTaskMin)} of tasks. Your prefrontal cortex degrades after 90 minutes without rest. You'll finish more by pausing than by pushing through.`,4);
  }
  const lastTask=clean[clean.length-1];
  if(lastTask){
    const endTime=lastTask.start+lastTask.dur;
    const windDownStart=bed-40;
    const buffer=windDownStart-endTime;
    if(buffer<=0){
      push(`Your last task ends at ${fmtTime(endTime)}, which is ${Math.abs(buffer)} minutes after wind-down should start. Sleep gets compressed first — then everything else suffers.`,4);
    }
    if(buffer>0&&buffer<15){
      push(`Only ${durStr(buffer)} between your last task and wind-down. That's barely enough to decompress. If the day runs even slightly late, sleep pays the price.`,3);
    }
  }

  // Sort by weight (highest first), take top 2-4
  insights.sort((a,b)=>b.weight-a.weight);
  const selected=[];
  const seen=new Set();
  for(const insight of insights){
    if(selected.length>=4)break;
    const key=insight.text.substring(0,40);
    if(seen.has(key))continue;
    seen.add(key);
    selected.push({text:insight.text,cls:''});
  }
  return selected.slice(0,Math.min(4,Math.max(2,selected.length)));
}

function buildSchedule(){
  const errs=Scheduler.validate(state);
  if(errs.length){document.getElementById('schedule-view').style.display='none';document.getElementById('nav-tabs').style.display='none';document.getElementById('steps-container').style.display='flex';document.getElementById('progress-bar').style.display='flex';showStep(4);showStepError(4,errs[0]);return}
  if(!state.startDate)state.startDate=todayKey();
  saveState();

  dayPlan=Scheduler.build(state);
  const clk=plannerClock();
  renderedDayKey=clk.key;
  scheduleBlocks=dayPlan.blocks.map(b=>({...b,doneAt:null}));
  totalBlocks=scheduleBlocks.filter(b=>b.task).length;
  const rec=plannerRecordFor(clk.key);
  if(rec&&rec.doneAt)scheduleBlocks.forEach(b=>{if(b.task&&rec.doneAt[b.id]!=null)b.doneAt=rec.doneAt[b.id]});
  completedCount=scheduleBlocks.filter(b=>b.task&&b.doneAt!=null).length;

  const daily=getDailyCompletions();
  streak=Scheduler.computeStreak(daily,clk.key);
  const yData=daily[Scheduler.addDays(clk.key,-1)];
  const prevPct=yData?yData.pct:0;

  const commit=scheduleBlocks.find(b=>b.kind==='commit');
  const prefs=state.prefs;
  const strategies=generateStrategy({clean:scheduleBlocks,wake:dayPlan.wake,bed:dayPlan.bed,hasCommit:!!commit,commitS:commit?commit.start:null,commitE:commit?commit.start+commit.dur:null,commute:state.commute||0,isMorning:state.productivity==='morning',isNight:state.productivity==='night',prefs,hasWorkout:scheduleBlocks.some(b=>b.title==='Workout'),morningWorkout:scheduleBlocks.some(b=>b.title==='Workout'&&b.start<720),goalDesc:state.desc||'your goal',state,streak,daily,prevPct,now:new Date()});

  document.getElementById('steps-container').style.display='none';
  document.getElementById('progress-bar').style.display='none';
  document.getElementById('schedule-view').style.display='block';
  document.getElementById('nav-tabs').style.display='flex';

  document.getElementById('s-tag').textContent=GOAL_NAMES[state.goal]||'your goal';
  const subtitleParts=[];
  if(prevPct>0)subtitleParts.push(`Yesterday: ${prevPct}%`);
  if(streak>0)subtitleParts.push(`${streak}-day streak`);
  subtitleParts.push(`${totalBlocks} tasks`,`${Scheduler.duration(dayPlan.focusMinutes)} focused`);
  document.getElementById('strategy-subtitle').textContent=subtitleParts.join(' · ');
  const list=document.getElementById('strategy-list');list.innerHTML='';
  dayPlan.warnings.forEach(w=>{const li=document.createElement('li');li.className='warn';li.textContent='⚠️ '+w;list.appendChild(li)});
  strategies.forEach(st=>{const li=document.createElement('li');li.className=st.cls||'';li.textContent=st.text;list.appendChild(li)});
  document.getElementById('quote-box').textContent=dailyQuotes[Math.floor(Math.random()*dailyQuotes.length)];

  renderTimeline();
  updateDash();updateAvatarInitials();updateGreeting();window.scrollTo({top:0,behavior:'smooth'});
}
function getGoalBlock(time){
  const d=state.desc||'your goal';
  const m={fitness:{title:'Training Session',desc:`${d}`,icon:'💪',reason:'Peak energy for max performance.'},study:{title:'Deep Study',desc:`Study: ${d}`,icon:'🧠',reason:time==='morning'?'Morning: working memory peaks.':'Afternoon: review and consolidate.'},coding:{title:'Deep Coding',desc:`Build: ${d}`,icon:'💻',reason:'90-min blocks optimal for flow state.'},business:{title:time==='morning'?'Revenue Activity':'Build & Improve',desc:`${d}`,icon:time==='morning'?'💰':'🛠️',reason:'Revenue first, then operations.'},creative:{title:time==='morning'?'Creative Work':'Refine & Polish',desc:`${d}`,icon:'🎨',reason:'Morning: divergent thinking. Afternoon: convergent.'},productivity:{title:'Deep Work',desc:`Focus: ${d}`,icon:'🎯',reason:'Peak hours for highest-impact work.'},mental:{title:'Self-Care',desc:`${d}`,icon:'💚',reason:'Daily maintenance.'},custom:{title:'Goal Work',desc:`${d}`,icon:'🎯',reason:'Focused work during peak hours.'}};
  return m[state.goal]||m.custom;
}

function renderTimeline(){
  const tl=document.getElementById('timeline');tl.innerHTML='';
  scheduleBlocks.forEach((item,i)=>{
    const end=item.start+item.dur;
    const el=document.createElement('div');
    el.className='t-block'+(item.task?'':' fixed');el.dataset.idx=i;el.dataset.id=item.id;el.dataset.kind=item.kind;el.dataset.testid='task';
    el.innerHTML=`<div class="t-time">${Scheduler.clock(item.start)} — ${Scheduler.clock(end)} · ${Scheduler.duration(item.dur)}</div><div class="t-title">${escapeHtml(item.title)}</div><div class="t-desc">${escapeHtml(item.desc)}</div>${item.reason?`<div class="t-reason">${escapeHtml(item.reason)}</div>`:''}<div class="t-status" data-testid="task-status"></div><div class="t-icon">${item.icon}</div>`+(item.task?`<button class="t-check" role="checkbox" aria-checked="false" aria-label="Complete ${escapeHtml(item.title)}" data-testid="task-check" onclick="completeTask(this,${i})">✓</button>`:'');
    tl.appendChild(el);
  });
  refreshTimeline();
}
function refreshTimeline(){
  if(!dayPlan)return;
  const clk=plannerClock();
  if(renderedDayKey&&clk.key!==renderedDayKey){buildSchedule();return}
  const now=clk.minute;
  document.querySelectorAll('.t-block').forEach(el=>{
    const item=scheduleBlocks[+el.dataset.idx];if(!item)return;
    const st=Scheduler.taskStatus(item,now,dayPlan.bed);
    const done=item.doneAt!=null;
    const end=item.start+item.dur;
    el.classList.toggle('active',!done&&st==='active');
    el.classList.toggle('upcoming',!done&&st==='upcoming');
    el.classList.toggle('overdue',item.task&&!done&&st==='overdue');
    el.classList.toggle('missed',item.task&&!done&&st==='closed');
    el.classList.toggle('done',done);
    el.classList.toggle('late',done&&!Scheduler.isOnTime(item,item.doneAt));
    el.dataset.status=done?'done':st;
    const label=el.querySelector('.t-status');
    let text='';
    if(!item.task)text=st==='active'?`Now · ${end-now} min left`:'';
    else if(done)text=Scheduler.isOnTime(item,item.doneAt)?`Done at ${Scheduler.clock(item.doneAt)}`:`Done late at ${Scheduler.clock(item.doneAt)}`;
    else if(st==='upcoming')text=`Unlocks at ${Scheduler.clock(item.start)}`;
    else if(st==='active')text=`Now · ${end-now} min left`;
    else if(st==='overdue')text=`Overdue by ${Scheduler.duration(now-end)} · tick before bedtime`;
    else text='Missed';
    if(label)label.textContent=text;
    const btn=el.querySelector('.t-check');
    if(btn){btn.classList.toggle('checked',done);btn.setAttribute('aria-checked',String(done));const locked=!done&&(st==='upcoming'||st==='closed')||(done&&st==='closed');btn.classList.toggle('locked',locked);btn.setAttribute('aria-disabled',String(locked))}
  });
}
setInterval(refreshTimeline,30000);
setInterval(updateDash,60000);

function completeTask(btn,idx){
  const block=btn.closest('.t-block');
  const item=scheduleBlocks[idx];
  if(!item||!item.task)return;
  const clk=plannerClock();
  if(clk.key!==renderedDayKey){buildSchedule();return}
  const st=Scheduler.taskStatus(item,clk.minute,dayPlan.bed);
  const shake=()=>{block.classList.remove('shake');void block.offsetWidth;block.classList.add('shake')};

  if(item.doneAt!=null){
    if(st==='closed'){shake();showToast('Today is closed. Completed tasks stay completed.');return}
    item.doneAt=null;saveToday();refreshTimeline();updateDash();return;
  }
  if(st==='upcoming'){shake();showToast(`Not yet. "${item.title}" unlocks at ${Scheduler.clock(item.start)}.`);return}
  if(st==='closed'){shake();showToast('Bedtime has passed, so today is closed. This one counts as missed.');return}

  item.doneAt=clk.minute;
  playClick();haptic();
  const ripple=document.createElement('span');ripple.className='ripple';btn.appendChild(ripple);setTimeout(()=>ripple.remove(),500);
  block.classList.add('completing');setTimeout(()=>block.classList.remove('completing'),400);
  const glow=document.createElement('div');glow.className='success-glow';block.appendChild(glow);setTimeout(()=>glow.remove(),600);

  saveToday();refreshTimeline();updateDash();
  const onTime=Scheduler.isOnTime(item,item.doneAt);
  if(onTime){const rect=btn.getBoundingClientRect();showXP(25,rect.left);spawnConfetti(8)}
  const pct=completedCount/totalBlocks;
  if(onTime)showEncouragement(pct,item.title,idx,streak,clk.minute<item.start+item.dur);
  else showToast('Logged as late. Still counts, just not for bonus XP.');
  if(completedCount===totalBlocks)setTimeout(()=>dayComplete(),600);
}
function updateDash(){
  if(!dayPlan)return;
  const clk=plannerClock();
  const now=clk.minute;
  const pct=totalBlocks?Math.round((completedCount/totalBlocks)*100):0;
  const remaining=totalBlocks-completedCount;
  const startKey=state.startDate||clk.key;
  const dayNum=Math.max(1,Scheduler.daysBetween(startKey,clk.key)+1);
  const totalDays=state.deadline?Math.max(1,Scheduler.daysBetween(startKey,state.deadline)+1):30;
  const daysRemaining=state.deadline?Math.max(0,Scheduler.daysBetween(clk.key,state.deadline)):Math.max(0,totalDays-dayNum);
  const missionPct=Math.min(100,Math.round((dayNum/totalDays)*100));
  const due=scheduleBlocks.filter(b=>b.task&&(b.doneAt!=null||now>=b.start+b.dur));
  const dueDone=due.filter(b=>b.doneAt!=null).length;
  const status=Scheduler.missionStatus(getDailyCompletions(),clk.key,startKey,dueDone,due.length);

  document.getElementById('ring-text').textContent=pct+'%';
  const dayEl=document.getElementById('day-count');
  if(dayNum!==lastDisplayedDay){dayEl.classList.remove('day-new');void dayEl.offsetWidth;dayEl.classList.add('day-new');lastDisplayedDay=dayNum}
  dayEl.textContent=dayNum;
  document.getElementById('mission-sub').textContent=`Day ${dayNum} of ${totalDays}`;
  document.getElementById('mission-days-left').textContent=state.deadline?(daysRemaining>0?`${daysRemaining} days to deadline`:'Deadline is today'):`${daysRemaining} days left in this 30-day run`;
  document.getElementById('mission-pct').textContent=missionPct+'%';
  document.getElementById('mission-remaining-pct').textContent=(100-missionPct)+'%';
  document.getElementById('mission-fill').style.width=missionPct+'%';
  const badge=document.getElementById('mission-badge');
  badge.textContent=status.label;
  badge.title=status.score==null?'No history yet':`Average completion: ${status.score}%`;
  badge.className='mission-badge '+status.cls;
  document.getElementById('tasks-left').textContent=remaining;
  document.getElementById('time-left').textContent=now>=dayPlan.bed?'0m':Scheduler.duration(Math.max(0,dayPlan.bed-Math.max(now,dayPlan.wake)));

  const circumference=2*Math.PI*34;
  const offset=circumference-(pct/100)*circumference;
  document.getElementById('ring-fill').style.strokeDashoffset=offset;

  // Current State
  const stateSVGs={
    'lazy.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><path d="M15 75 Q15 65 25 65 L95 65 Q105 65 105 75 L105 85 L15 85 Z" stroke="#444" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M10 85 L10 95 M110 85 L110 95" stroke="#444" stroke-width="2" stroke-linecap="round"/><circle cx="35" cy="58" r="7" stroke="#fff" stroke-width="2"/><path d="M42 58 L80 60" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M80 60 L95 68 M80 60 L92 55" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M50 58 L48 68 M65 59 L62 50" stroke="#fff" stroke-width="2" stroke-linecap="round"/><text x="40" y="45" font-family="sans-serif" font-size="8" fill="#666" font-weight="bold">z</text><text x="48" y="38" font-family="sans-serif" font-size="10" fill="#555" font-weight="bold">z</text><text x="57" y="30" font-family="sans-serif" font-size="12" fill="#444" font-weight="bold">z</text></svg>'),
    'taking-easy.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><path d="M30 70 L30 95 M90 70 L90 95" stroke="#444" stroke-width="2" stroke-linecap="round"/><path d="M25 70 L95 70" stroke="#444" stroke-width="2" stroke-linecap="round"/><circle cx="60" cy="42" r="8" stroke="#fff" stroke-width="2"/><path d="M60 50 L60 70" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 70 L45 85 M60 70 L75 85" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 58 L40 65 M60 58 L80 55" stroke="#fff" stroke-width="2" stroke-linecap="round"/><rect x="78" y="50" width="10" height="12" rx="2" stroke="#f59e0b" stroke-width="1.5" fill="none"/><path d="M88 53 Q93 53 93 58 Q93 63 88 63" stroke="#f59e0b" stroke-width="1.5" fill="none"/><path d="M82 47 Q84 43 82 39" stroke="#666" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M86 47 Q88 42 86 38" stroke="#666" stroke-width="1" fill="none" stroke-linecap="round"/></svg>'),
    'trying.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect x="25" y="60" width="70" height="4" rx="2" stroke="#444" stroke-width="2" fill="none"/><path d="M30 64 L30 95 M90 64 L90 95" stroke="#444" stroke-width="2" stroke-linecap="round"/><rect x="40" y="48" width="30" height="12" rx="2" stroke="#666" stroke-width="1.5" fill="none"/><path d="M38 60 L82 60" stroke="#666" stroke-width="1.5" stroke-linecap="round"/><rect x="43" y="50" width="24" height="8" rx="1" fill="rgba(139,92,246,0.1)"/><circle cx="60" cy="32" r="8" stroke="#fff" stroke-width="2"/><path d="M60 40 L60 60" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 60 L48 80 M60 60 L72 80" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 48 L45 55 M60 48 L75 55" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M72 30 L78 28 M74 35 L80 35" stroke="#f59e0b" stroke-width="1" stroke-linecap="round" opacity="0.6"/></svg>'),
    'active.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect x="25" y="60" width="70" height="4" rx="2" stroke="#444" stroke-width="2" fill="none"/><path d="M30 64 L30 95 M90 64 L90 95" stroke="#444" stroke-width="2" stroke-linecap="round"/><rect x="38" y="48" width="30" height="12" rx="2" stroke="#666" stroke-width="1.5" fill="none"/><path d="M36 60 L84 60" stroke="#666" stroke-width="1.5" stroke-linecap="round"/><rect x="41" y="50" width="24" height="8" rx="1" fill="rgba(34,197,94,0.12)"/><path d="M50 54 L54 58 L62 50" stroke="#22c55e" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="60" cy="30" r="8" stroke="#fff" stroke-width="2"/><circle cx="57" cy="30" r="1" fill="#fff"/><circle cx="63" cy="30" r="1" fill="#fff"/><path d="M60 38 L58 58" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M58 58 L48 78 M58 58 L68 78" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M59 46 L42 52 M59 46 L76 52" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M75 28 L82 26" stroke="#22c55e" stroke-width="1" stroke-linecap="round" opacity="0.7"/><path d="M77 33 L84 33" stroke="#22c55e" stroke-width="1" stroke-linecap="round" opacity="0.7"/><path d="M75 38 L82 40" stroke="#22c55e" stroke-width="1" stroke-linecap="round" opacity="0.7"/></svg>'),
    'productive.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><rect x="15" y="15" width="50" height="40" rx="3" stroke="#444" stroke-width="2" fill="none"/><path d="M22 25 L55 25 M22 33 L48 33 M22 41 L52 41" stroke="#555" stroke-width="1.5" stroke-linecap="round"/><path d="M56 25 L60 29" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/><path d="M56 33 L60 37" stroke="#22c55e" stroke-width="1.5" stroke-linecap="round"/><circle cx="85" cy="35" r="8" stroke="#fff" stroke-width="2"/><path d="M82 37 Q85 40 88 37" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M85 43 L85 70" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M85 70 L75 92 M85 70 L95 92" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M85 52 L60 35" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M85 52 L95 60" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="100" cy="30" r="2" fill="#3b82f6" opacity="0.6"/><circle cx="105" cy="42" r="1.5" fill="#3b82f6" opacity="0.4"/><circle cx="98" cy="48" r="1" fill="#3b82f6" opacity="0.5"/></svg>'),
    'on-fire.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><path d="M60 10 Q55 25 50 20 Q45 30 40 25 Q35 40 30 35 Q25 50 35 55" stroke="#f59e0b" stroke-width="1.5" fill="none" opacity="0.4" stroke-linecap="round"/><path d="M60 10 Q65 25 70 20 Q75 30 80 25 Q85 40 90 35 Q95 50 85 55" stroke="#f59e0b" stroke-width="1.5" fill="none" opacity="0.4" stroke-linecap="round"/><path d="M45 15 Q42 28 38 24 Q34 35 30 32" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round"/><path d="M75 15 Q78 28 82 24 Q86 35 90 32" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round"/><circle cx="60" cy="42" r="8" stroke="#fff" stroke-width="2"/><circle cx="57" cy="42" r="1.2" fill="#fff"/><circle cx="63" cy="42" r="1.2" fill="#fff"/><path d="M57 45 L63 45" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M60 50 L60 72" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 72 L48 92 M60 72 L72 92" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M60 56 L42 42 M60 56 L78 42" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="42" cy="42" r="3" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="78" cy="42" r="3" stroke="#fff" stroke-width="1.5" fill="none"/><path d="M35 55 L28 52" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/><path d="M85 55 L92 52" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/><path d="M60 28 L60 20" stroke="#f59e0b" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/></svg>'),
    'overwhelmed.svg':'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none"><path d="M35 25 Q30 20 35 15 Q40 10 38 18" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.4" stroke-linecap="round"/><path d="M85 25 Q90 20 85 15 Q80 10 82 18" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.4" stroke-linecap="round"/><path d="M40 18 Q35 12 42 10" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round"/><path d="M80 18 Q85 12 78 10" stroke="#ef4444" stroke-width="1" fill="none" opacity="0.3" stroke-linecap="round"/><path d="M55 15 Q50 10 55 5 Q60 0 65 5 Q70 10 65 15 Q60 20 55 15" stroke="#666" stroke-width="1" fill="none" opacity="0.4"/><rect x="25" y="65" width="70" height="4" rx="2" stroke="#444" stroke-width="2" fill="none"/><path d="M30 69 L30 95 M90 69 L90 95" stroke="#444" stroke-width="2" stroke-linecap="round"/><rect x="30" y="55" width="15" height="10" rx="1" stroke="#555" stroke-width="1" fill="none" transform="rotate(-10 37 60)"/><rect x="75" y="52" width="15" height="10" rx="1" stroke="#555" stroke-width="1" fill="none" transform="rotate(8 82 57)"/><circle cx="60" cy="38" r="8" stroke="#fff" stroke-width="2"/><path d="M56 36 Q57 38 58 36" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M62 36 Q63 38 64 36" stroke="#fff" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M60 46 L58 65" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M58 65 L50 85 M58 65 L68 85" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M59 52 L50 40 M59 52 L70 40" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="50" cy="38" r="2.5" stroke="#fff" stroke-width="1.5" fill="none"/><circle cx="70" cy="38" r="2.5" stroke="#fff" stroke-width="1.5" fill="none"/></svg>')
  };
  const states=[
    {id:'lazy',name:'Lazy',desc:'You haven\'t done much today. Take it easy, a fresh start is always possible.',min:0,max:20,cls:'cs-lazy',svg:'lazy.svg'},
    {id:'easy',name:'Taking it Easy',desc:'You\'re moving slowly, but every small step counts.',min:21,max:40,cls:'cs-easy',svg:'taking-easy.svg'},
    {id:'trying',name:'Trying to be Better',desc:'You\'re showing up and putting in the effort. Keep going!',min:41,max:60,cls:'cs-trying',svg:'trying.svg'},
    {id:'active',name:'Active',desc:'You\'re on track and getting things done. Great consistency!',min:61,max:80,cls:'cs-active',svg:'active.svg'},
    {id:'productive',name:'Very Productive',desc:'You\'re crushing your tasks! Amazing focus and discipline.',min:81,max:95,cls:'cs-productive',svg:'productive.svg'},
    {id:'fire',name:'On Fire',desc:'Outstanding! You\'re in the zone and making things happen.',min:96,max:100,cls:'cs-fire',svg:'on-fire.svg'}
  ];
  const skippedCount=scheduleBlocks.filter(b=>b.task&&b.doneAt==null&&now>=b.start+b.dur).length;
  let currentState;
  if(remaining===0&&completedCount>0){currentState=states[5]}
  else if(skippedCount>totalBlocks*0.5){currentState={id:'overwhelmed',name:'Overwhelmed',desc:'Rest is part of your plate. Recharge and come back stronger.',min:0,max:100,cls:'cs-overwhelmed',svg:'overwhelmed.svg'}}
  else{currentState=states.find(s=>pct>=s.min&&pct<=s.max)||states[0]}

  const card=document.getElementById('current-state-card');
  card.className='current-state-card '+currentState.cls;
  document.getElementById('cs-state-name').textContent=currentState.name;
  document.getElementById('cs-state-desc').textContent=currentState.desc;
  document.getElementById('cs-pct').textContent=pct+'%';
  document.getElementById('cs-bar-fill').style.width=pct+'%';
  const ill=document.getElementById('cs-illustration');
  if(ill.dataset.current!==currentState.svg){ill.innerHTML=`<img src="${stateSVGs[currentState.svg]}" alt="${currentState.name}" style="width:100%;height:100%;object-fit:contain">`;ill.dataset.current=currentState.svg}
  
  // Update profile panel stats if open
  if(document.getElementById('profile-panel').classList.contains('open')){
    document.getElementById('pp-pct').textContent=pct+'%';
    document.getElementById('pp-streak').textContent=streak;
    document.getElementById('pp-state').textContent=currentState.name;
  }
}

function dayComplete(){
  playDayComplete();
  spawnConfetti(30);
  setTimeout(()=>spawnConfetti(20),300);
  streak=Scheduler.computeStreak(getDailyCompletions(),renderedDayKey||plannerClock().key);
  localStorage.setItem('planner_streak',streak);
  const onTimeCount=scheduleBlocks.filter(b=>b.task&&b.doneAt!=null&&Scheduler.isOnTime(b,b.doneAt)).length;
  const streakCard=document.getElementById('streak-card');
  streakCard.classList.add('show');
  document.getElementById('streak-count').textContent=streak;
  document.getElementById('streak-pct').textContent='100%';
  document.getElementById('streak-xp').textContent=`+${onTimeCount*25}`;
  const fire=document.getElementById('streak-fire');
  fire.style.fontSize=Math.min(2.5+streak*0.3,5)+'rem';
  streakCard.scrollIntoView({behavior:'smooth',block:'center'});
}
function checkStreak(){streak=Scheduler.computeStreak(getDailyCompletions(),plannerClock().key)}
function resetAll(){
  dayPlan=null;renderedDayKey=null;scheduleBlocks=[];
  state={goal:'',desc:'',lifestyle:'',workStart:'',workEnd:'',commute:0,productivity:'',wake:'06:00',bed:'22:30',prefs:[],deadline:'',startDate:''};
  localStorage.removeItem('planner_state');
  localStorage.removeItem('planner_avatar');
  document.querySelectorAll('.goal-card,.lifestyle-card,.prod-card,.pref-chip').forEach(c=>c.classList.remove('selected'));
  document.querySelectorAll('.inline-fields').forEach(f=>f.classList.remove('show'));
  document.querySelectorAll('.next-btn').forEach(b=>b.classList.remove('ready'));
  document.getElementById('next5').classList.add('ready');
  document.getElementById('goal-desc').value='';
  document.getElementById('deadline').value='';
  document.getElementById('wake-time').value='06:00';
  document.getElementById('bed-time').value='22:30';
  const fieldIds=['class-start','class-end','commute','work-start','work-end','commute2','shift-start','shift-end'];
  fieldIds.forEach(id=>{const el=document.getElementById(id);if(el){if(el.type==='number')el.value='0';else el.value=el.defaultValue||'09:00'}});
  document.getElementById('schedule-view').style.display='none';
  document.getElementById('progress-view').style.display='none';
  document.getElementById('nav-tabs').style.display='none';
  document.getElementById('streak-card').classList.remove('show');
  document.getElementById('steps-container').style.display='flex';
  document.getElementById('progress-bar').style.display='flex';
  document.getElementById('profile-avatar-img').style.display='none';
  document.getElementById('profile-avatar-initials').style.display='block';
  document.getElementById('pp-avatar-img').style.display='none';
  document.getElementById('pp-avatar-initials').style.display='block';
  document.getElementById('profile-avatar-initials').textContent='?';
  document.getElementById('pp-avatar-initials').textContent='?';
  showStep(1);
}

function switchTab(tab){
  activeTab=tab;
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tab));
  if(tab==='schedule'){
    document.getElementById('schedule-view').style.display='block';
    document.getElementById('progress-view').style.display='none';
  }else{
    document.getElementById('schedule-view').style.display='none';
    document.getElementById('progress-view').style.display='block';
    renderProgressPage();
  }
  window.scrollTo({top:0,behavior:'smooth'});
}
function renderProgressPage(){
  const daily=getDailyCompletions();
  const dates=Object.keys(daily).sort();
  const daysActive=dates.length;
  const gn={fitness:'Get Fit',study:'Learn a Skill',coding:'Build Something',business:'Start a Business',creative:'Create',productivity:'Be Productive',mental:'Feel Better',custom:'Custom Goal'};
  const goalIcons={fitness:'🏋️',study:'📚',coding:'💻',business:'🚀',creative:'🎨',productivity:'⚡',mental:'🧠',custom:'🎯'};
  document.getElementById('p-goal-title').textContent=gn[state.goal]||'Your Goal';
  document.getElementById('p-goal-desc').textContent=state.desc||'';
  document.getElementById('p-goal-icon').textContent=goalIcons[state.goal]||'🎯';
  document.getElementById('p-sub').textContent=`Started ${state.startDate?keyToDate(state.startDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'today'}`;

  let totalTasks=0,completedTasks=0;
  dates.forEach(d=>{totalTasks+=daily[d].total;completedTasks+=daily[d].count});
  document.getElementById('p-days-active').textContent=daysActive;
  document.getElementById('p-streak').textContent=Scheduler.computeStreak(daily,plannerClock().key);
  document.getElementById('p-total-done').textContent=completedTasks;
  const avgPct=totalTasks?Math.round((completedTasks/totalTasks)*100):0;
  document.getElementById('p-avg-pct').textContent=avgPct+'%';

  const now=new Date();
  const startD=state.startDate?keyToDate(state.startDate):now;
  if(state.deadline){
    const dl=keyToDate(state.deadline);
    const totalDays=Math.max(1,Math.ceil((dl-startD)/(1000*60*60*24)));
    const daysPassed=Math.ceil((now-startD)/(1000*60*60*24));
    const daysLeft=Scheduler.daysBetween(todayKey(),state.deadline);
    const progress=Math.min(100,Math.round((daysPassed/totalDays)*100));
    document.getElementById('p-days-left-num').textContent=daysLeft>0?daysLeft:'0';
    document.getElementById('p-countdown-sub').textContent=daysLeft>0?`until ${dl.toLocaleDateString('en-US',{month:'long',day:'numeric'})}`:'Deadline has passed';
    document.getElementById('p-progress-pct').textContent=progress+'% time gone';
    document.getElementById('p-progress-deadline').textContent=dl.toLocaleDateString('en-US',{month:'short',day:'numeric'});
    document.getElementById('p-goal-fill').style.width=progress+'%';
  }else{
    document.getElementById('p-days-left-num').textContent='—';
    document.getElementById('p-countdown-sub').textContent='No deadline set';
    document.getElementById('p-progress-pct').textContent='';
    document.getElementById('p-progress-deadline').textContent='';
    document.getElementById('p-goal-fill').style.width=(daysActive?Math.min(100,daysActive*10):0)+'%';
  }
  document.getElementById('p-progress-started').textContent=state.startDate?keyToDate(state.startDate).toLocaleDateString('en-US',{month:'short',day:'numeric'}):'Start';

  const year=now.getFullYear(),month=now.getMonth();
  document.getElementById('p-month-title').textContent=now.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const todayDate=now.getDate();
  const cal=document.getElementById('p-calendar');
  cal.innerHTML='';
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(h=>{const el=document.createElement('div');el.className='p-cal-head';el.textContent=h;cal.appendChild(el)});
  for(let i=0;i<firstDay;i++){const el=document.createElement('div');el.className='p-cal-day empty';cal.appendChild(el)}
  const startDateObj=state.startDate?keyToDate(state.startDate):null;
  for(let d=1;d<=daysInMonth;d++){
    const el=document.createElement('div');el.className='p-cal-day';
    el.textContent=d;
    const dateStr=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayDate=new Date(year,month,d);
    if(d===todayDate)el.classList.add('today');
    if(d>todayDate)el.classList.add('future');
    else if(startDateObj&&dayDate<startDateObj&&dayDate.toDateString()!==startDateObj.toDateString()){el.classList.add('empty')}
    else if(daily[dateStr]){const p=daily[dateStr].pct;if(p===100)el.classList.add('done');else if(p>=50)el.classList.add('partial');else el.classList.add('missed')}
    else el.classList.add('missed');
    cal.appendChild(el);
  }

  const weekBars=document.getElementById('p-week-bars');
  weekBars.innerHTML='';
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  for(let i=6;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const ds=Scheduler.dateKey(d);
    const dayData=daily[ds];
    const p=dayData?dayData.pct:0;
    const bar=document.createElement('div');bar.className='p-week-bar';
    const fill=document.createElement('div');fill.className='p-week-fill';
    fill.style.height=Math.max(4,p)+'%';
    if(p===100)fill.classList.add('full');
    else if(p>=70)fill.classList.add('high');
    else if(p>=40)fill.classList.add('mid');
    else if(p>0)fill.classList.add('low');
    else fill.classList.add('empty');
    const label=document.createElement('div');label.className='p-week-label';label.textContent=dayNames[d.getDay()];
    const pctEl=document.createElement('div');pctEl.className='p-week-pct';pctEl.textContent=p?dayData.count+'/'+dayData.total:'-';
    bar.appendChild(fill);bar.appendChild(label);bar.appendChild(pctEl);
    weekBars.appendChild(bar);
  }
}

function restoreOnboarding(){
  document.querySelectorAll('.goal-card').forEach(c=>{if(c.dataset.val===state.goal)c.classList.add('selected')});
  if(state.goal)document.getElementById('next1').classList.add('ready');
  if(state.desc){document.getElementById('goal-desc').value=state.desc;document.getElementById('next2').classList.add('ready')}
  if(state.deadline)document.getElementById('deadline').value=state.deadline;
  document.querySelectorAll('.lifestyle-card').forEach(c=>{if(c.dataset.val===state.lifestyle){c.classList.add('selected');const f=document.getElementById('fields-'+state.lifestyle);if(f)f.classList.add('show');document.getElementById('next3').classList.add('ready')}});
  document.querySelectorAll('.prod-card').forEach(c=>{if(c.dataset.val===state.productivity){c.classList.add('selected');document.getElementById('next4').classList.add('ready')}});
  state.prefs.forEach(p=>{document.querySelectorAll('.pref-chip').forEach(c=>{if(c.dataset.val===p)c.classList.add('selected')})});
}

updateProgress();

// Deadline can't be in the past
document.getElementById('deadline').min=Scheduler.addDays(todayKey(),1);

// Restore state on load
if(loadState()&&state.goal){
  restoreOnboarding();
  loadAvatar();
  updateAvatarInitials();
  updateGreeting();
  buildSchedule();
}

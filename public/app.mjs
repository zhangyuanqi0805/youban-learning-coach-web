const nav = [
  ['coach','学习教练','▤'],['materials','课程与资料','▣'],['mistakes','错题本','☑'],
  ['practice','训练与测试','↗'],['report','学习报告','▥'],['teachers','老师们','◎'],['settings','设置','⚙']
];
const subtitles = {coach:'把资料、练习和下一步连起来',materials:'先核对来源，再让练习有依据',mistakes:'看清错因，再做补练',practice:'真实试卷与首答保留',report:'看进展，也看下一步',teachers:'按课程找到学习入口',settings:'账号与连接状态'};
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const route = () => {const [view='coach',query='']=(location.hash.slice(1)||'coach').split('?');return {view:nav.some(x=>x[0]===view)?view:'coach',params:new URLSearchParams(query)};};
const go = (view,params={}) => {const query=new URLSearchParams(params).toString();location.hash=view+(query?'?'+query:'');if(location.hash.slice(1)===view&&!query)void render();window.scrollTo({top:0,behavior:'smooth'});};
const action = (label,name,data={},primary=false) => `<button class="${primary?'primary':'secondary'}" type="button" data-action="${name}" ${Object.entries(data).map(([k,v])=>`data-${k}="${esc(v)}"`).join(' ')}>${esc(label)}</button>`;
let auth={known:false,authenticated:false,csrfToken:null},overview={courses:[],history:[],jobs:[],mistakes:[]},details=new Map(),viewRun=0,toastTimer,drafts=new Map(),busy=false;
function toast(value){const node=$('#toast');node.textContent=value;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),4500);}
async function api(path,{method='GET',body,headers={}}={}){
  const response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{accept:'application/json',...(body instanceof File?{}:{'content-type':'application/json'}),...(method==='GET'?{}:{'x-csrf-token':auth.csrfToken||''}),...headers},body,signal:AbortSignal.timeout(body instanceof File?90000:30000)});
  if(response.status===204)return null;
  const type=response.headers.get('content-type')||'';
  const result=type.includes('application/json')?await response.json():{};
  if(!response.ok)throw Object.assign(new Error(result.message||`请求未完成 (${response.status})`),{status:response.status,code:result.error});
  return result;
}
async function refreshAuth(){try{auth={...await api('/api/auth/status'),known:true};}catch(error){auth={known:false,authenticated:false,csrfToken:null};throw error;}}
async function loadOverview(){
  const [courses,history,jobs,mistakes]=await Promise.all([
    api('/api/learning/library/courses'),api('/api/pilot/v1/history'),api('/api/pilot/v1/jobs'),api('/api/pilot/v1/mistakes')
  ]);
  overview={courses:courses.courses||[],history:history.history||[],jobs:jobs.jobs||[],mistakes:mistakes.mistakes||[]};
}
function renderNav(view){
  const markup=nav.map(([id,label,icon])=>`<button class="nav-button ${id===view?'active':''}" type="button" data-view="${id}" aria-current="${id===view?'page':'false'}"><span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></button>`).join('');
  $('#side-nav').innerHTML=markup;$('#mobile-nav').innerHTML=markup;
  $('#page-title').textContent=view==='coach'?'有伴学习教练':nav.find(x=>x[0]===view)[1];$('#page-subtitle').textContent=subtitles[view];
  $('#profile-name').textContent=auth.profile?.nickname||auth.user?.name||'同学';$('#profile-caption').textContent=auth.authenticated?(auth.user?.email||'账号已连接'):'请先登录';
  $('#connection').innerHTML='<span class="connection-dot"></span> '+(auth.known?'本机总控已连接':'本机总控暂时离线');
}
function loginView(){return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">WELCOME BACK</span><h2>登录后，继续自己的学习。</h2><p>这个公网版本使用现有有伴账号；第一次进入需要在新网址重新登录。</p></div></div><section class="panel"><div class="tab-row"><button type="button" class="active" data-auth-tab="login">已有账号登录</button><button type="button" data-auth-tab="register">用邀请码激活</button></div><form id="login-form" class="auth-form"><label>邮箱账号<input name="identifier" type="email" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">登录学习空间</button></form><form id="register-form" class="auth-form" hidden><label>邀请码<input name="inviteCode" autocomplete="one-time-code" required></label><label>邮箱账号<input name="identifier" type="email" autocomplete="username" required></label><label>设置密码<input name="password" type="password" autocomplete="new-password" minlength="6" required></label><p class="footnote">密码至少 6 位，包含大写、小写字母和数字。邀请码由有伴后台发放。</p><button class="primary" type="submit">激活并登录</button></form><p id="auth-message" role="status"></p></section></div><aside class="note-panel"><h3>你会看到什么</h3><p>资料、试卷、错题和报告会从当前账号读取。文件和答案保存在这台电脑的有伴总控中。</p><p>如果电脑暂时离线，本页会明确提示；请先核对已有状态，再决定是否重试提交。</p></aside></div>`;}
function promptCard(){
  const pending=overview.jobs.find(j=>['queued','running','validating'].includes(j.status));
  const ready=overview.history.find(h=>!h.attempt&&['ready','trial_ready'].includes(h.status));
  const last=overview.history.find(h=>h.attempt);
  if(pending)return {title:'生成任务正在进行',desc:'先看任务状态；不要重复申请试卷。',label:'查看生成状态',view:'practice',params:{job:pending.id}};
  if(ready)return {title:'有一份试卷可以作答',desc:'首答提交后会保留，交卷前不会显示答案。',label:'进入试卷',view:'practice',params:{exam:ready.id}};
  if(overview.mistakes.length)return {title:'先回看一道真实错题',desc:'对照错因，再决定是否申请补练。',label:'打开错题本',view:'mistakes'};
  if(last)return {title:'看看上次答卷，再定下一步',desc:'报告里保留原答案、解析和材料依据。',label:'查看学习报告',view:'report',params:{attempt:last.attempt.id}};
  if(overview.courses.length)return {title:'从已有课程里选一份材料',desc:'对照原件核对提取内容，再开始练习。',label:'打开课程资料',view:'materials'};
  return {title:'先建一门课，放进一份资料',desc:'上传后核对原文，确认来源才能生成练习。',label:'添加课程资料',view:'materials'};
}
function coachView(){
  const p=promptCard(),submitted=overview.history.filter(x=>x.attempt).length;
  const chat=`<div class="chat-row"><span class="coach-avatar" aria-hidden="true">伴</span><div><div class="chat-name">有伴学习教练 · 账号进度引导</div><div class="chat-message">我会根据当前账号的资料和答卷，帮你找到下一步。<div class="task-callout"><div><b>${esc(p.title)}</b><small>${esc(p.desc)}</small></div>${action(p.label,'go',{view:p.view,...p.params},true)}</div></div></div></div><div class="chat-row"><span class="coach-avatar" aria-hidden="true">伴</span><div><div class="chat-name">有伴学习教练 · 状态说明</div><div class="chat-message">目前读到 ${overview.courses.length} 门课程、${submitted} 份已交答卷、${overview.mistakes.length} 道错题。这里的下一步是根据真实记录生成的页面引导；自由问答尚未接入模型。</div></div></div>`;
  return `<div class="coach-grid"><div class="coach-panel"><div class="coach-intro"><span class="eyebrow">TODAY · 从一件小事开始</span><h2>今天先把这一处弄明白。</h2><p>把真实资料、练习结果和下一步放在一条线上。</p></div><div class="chat-stream">${chat}</div><div class="chat-composer"><div class="suggestions">${action('我现在先学什么？','go',{view:p.view,...p.params})}${action('查看资料','go',{view:'materials'})}${action('看练习历史','go',{view:'report'})}</div><p class="footnote">当前是学习流程引导。实时 AI 对话与学科老师问答尚未接入。</p></div></div><aside class="coach-aside"><section class="panel"><h3>我的进度 <span class="status-chip done">实时</span></h3><div class="stats"><div class="stat"><span>课程</span><strong>${overview.courses.length}</strong></div><div class="stat"><span>答卷</span><strong>${submitted}</strong></div><div class="stat accent"><span>错题</span><strong>${overview.mistakes.length}</strong></div></div></section><section class="panel"><h3>今天可以做</h3><ul class="todo-list"><li><strong>${esc(p.title)}</strong><small>${esc(p.desc)}</small></li><li><strong>回看资料来源</strong><small>原文核对后再出题</small></li><li><strong>检查练习报告</strong><small>首答与补练分开保留</small></li></ul>${action(p.label,'go',{view:p.view,...p.params},true)}</section></aside></div>`;
}
async function getDetail(id){if(!details.has(id)){const data=await api('/api/learning/library/courses/'+encodeURIComponent(id));details.set(id,data);}return details.get(id);}
async function materialsView(params){
  const courseId=params.get('course'),fileId=params.get('file');
  if(!courseId)return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">SOURCE BEFORE PRACTICE</span><h2>每一次练习，都能回到原文。</h2><p>课程和文件来自当前有伴账号。</p></div></div><section class="panel"><h3>新增科目</h3><form id="course-form" class="inline-form"><input name="title" class="text-input" maxlength="120" required placeholder="例如：经济学原理"><button class="primary" type="submit">建立科目</button></form></section><div class="section-gap"></div>${overview.courses.map(c=>`<article class="list-card"><span class="file-icon">课</span><div class="card-main"><h3>${esc(c.title)}</h3><p>${c.fileCount||0} 份已保存资料</p></div>${action('查看与上传','go',{view:'materials',course:c.id})}</article>`).join('')||'<section class="panel">还没有课程。先建立一门科目。</section>'}</div><aside class="note-panel"><h3>资料怎样进入练习</h3><p>上传原件 → 核对提取文字 → 人工确认版本 → 申请练习卷。扫描件或图片需要额外核对，不能跳过。</p></aside></div>`;
  const d=await getDetail(courseId),files=d.files||[];
  let selected=null,source=null;if(fileId){selected=files.find(f=>f.id===fileId);if(selected){try{source=(await api('/api/pilot/v1/files/'+fileId+'/source')).source;}catch(error){if(error.status!==404)throw error;}}}
  const fileCards=files.map(f=>`<article class="list-card"><span class="file-icon">文</span><div class="card-main"><h3>${esc(f.fileName)}</h3><p>${esc(f.status)} · ${Math.ceil((f.bytes||0)/1024)} KB</p></div><span class="status-chip ${f.status==='completed'?'done':''}">${esc(f.status)}</span>${action('查看原文','go',{view:'materials',course:courseId,file:f.id})}</article>`).join('');
  const word=selected?.result?.wordTextReviewReady===true,raw=word?selected?.result?.unpagedText:selected?.result?.text;
  const ready=Boolean(selected&&(word||selected.status==='completed'&&selected.result?.complete)&&raw?.trim());
  const preview=selected?`<section class="panel"><h3>${esc(selected.fileName)}</h3><p class="section-intro">请先下载原件逐页对照，再确认提取文字。${source?'当前版本已确认。':''}</p><a class="source-link" href="${esc(selected.originalUrl)}" target="_blank" rel="noopener">下载原件核对 ↗</a><pre class="source-preview">${esc(raw||selected.message||'当前没有可确认文字。')}</pre>${source?`<p class="status-chip done">来源已确认</p>${action('基于此资料申请练习卷','start-job',{source:source.sourceVersion},true)}`:ready?action('我已对照原件，确认这个版本','confirm-file',{file:selected.id,word:String(word)},true):`<p class="footnote">材料仍需处理或人工核对。请刷新状态；扫描件需要在${` <a href="https://youban-student-relay-candidate.yuanqi0805.workers.dev/student/#materials?file=${encodeURIComponent(selected.id)}" target="_blank" rel="noopener">原有学生页</a>`}完成图片识别与逐页核对。</p>`}</section>`:'';
  return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">${esc(d.course.title)} · 我的资料</span><h2>先确认资料，再开始练习。</h2><p>文件、状态与确认结果来自本机总控。</p></div>${action('返回课程','go',{view:'materials'})}</div>${preview}<section class="panel"><h3>上传原件</h3><form id="upload-form" data-course="${esc(courseId)}" class="auth-form"><input name="file" type="file" accept=".txt,.md,.pdf,.doc,.docx,.png,.jpg,.jpeg" required><p class="footnote">每份最多 20 MB。上传会保存到当前账号。</p><button class="primary" type="submit">上传并读取</button></form></section><div class="section-gap"></div>${fileCards||'<section class="panel">这门课还没有资料。</section>'}</div><aside class="note-panel"><h3>核对提醒</h3><p>提取文字可能漏页或识别错误。确认前请下载原件并逐页对照；有疑点时先不要申请练习。</p></aside></div>`;
}
function mistakesView(){return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">REVIEW THE REASON</span><h2>真实错题，逐道回看。</h2><p>错题来自已交的首答；补练会另存，不覆盖原成绩。</p></div></div>${overview.mistakes.map(m=>`<article class="list-card"><span class="file-icon">?</span><div class="card-main"><h3>${esc(m.stem)}</h3><p>我的答案 ${esc(m.selected)} · 正确答案 ${esc(m.correctAnswer)}</p></div>${action('看原报告','go',{view:'report',attempt:m.attemptId})}</article>`).join('')||'<section class="panel">当前账号还没有错题。完成一份练习后，这里会显示真实结果。</section>'}</div><aside class="note-panel"><h3>下一步</h3><p>先看报告里的解析和原文依据，再决定是否申请补练。新题生成可能受到试用额度与审核状态限制。</p>${overview.mistakes.length?action('进入练习','go',{view:'practice'}):''}</aside></div>`;}
async function practiceView(params){
  const jobId=params.get('job'),examId=params.get('exam');
  if(jobId){const {job}=await api('/api/pilot/v1/jobs/'+encodeURIComponent(jobId));if(job.examId){go('practice',{exam:job.examId});return '';}return `<div class="page-grid"><div><section class="panel"><span class="eyebrow">生成任务</span><h2>${esc(job.status)}</h2><p>任务已进入本机总控。状态不确定时不要再次申请，先查看历史。</p>${action('刷新任务状态','refresh',{},true)} ${action('看练习历史','go',{view:'report'})}</section></div><aside class="note-panel">原资料与生成任务会保留。</aside></div>`;}
  if(examId){const {exam}=await api('/api/pilot/v1/exams/'+encodeURIComponent(examId));const existing=overview.history.find(h=>h.id===examId)?.attempt;if(existing){go('report',{attempt:existing.id});return '';}
    const answerable=['ready','trial_ready'].includes(exam.status),answers=drafts.get(examId)||{};
    return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">${esc(exam.kind==='retest'?'错点补练':'材料主卷')} · ${esc(exam.status)}</span><h2>${answerable?'屏幕作答':'试卷暂不可作答'}</h2><p>${exam.status==='trial_ready'?'AI 生成，未经学科人工审核；仅供试用。':'交卷前隐藏正确答案，首答提交后固定保留。'}</p></div></div>${answerable?(exam.questions||[]).map((q,i)=>`<article class="question-card"><span class="eyebrow">第 ${i+1} 题 · 原文第 ${esc(q.citation?.page??'?')} 页</span><h3>${esc(q.stem)}</h3><div class="choice-list">${Object.entries(q.options||{}).map(([key,value])=>`<button class="choice ${answers[q.id]===key?'selected':''}" type="button" data-action="answer" data-exam="${esc(examId)}" data-question="${esc(q.id)}" data-answer="${esc(key)}">${esc(key)}. ${esc(value)}</button>`).join('')}</div></article>`).join('')+`<label class="confirm-line"><input id="submit-check" type="checkbox"> 我确认交卷后不能修改这次首答</label>${action('确认交卷并看报告','submit',{exam:examId},true)}`:`<section class="panel"><p>当前状态：${esc(exam.status)}。请等审核或联系试用负责人。</p>${action('返回练习','go',{view:'practice'})}</section>`}</div><aside class="note-panel"><h3>首答保护</h3><p>提交前不会显示正确答案。交卷后可从报告回看解析、来源和首次成绩。</p></aside></div>`;
  }
  const pending=overview.jobs.find(j=>['queued','running','validating'].includes(j.status));
  const ready=overview.history.find(h=>!h.attempt&&['ready','trial_ready'].includes(h.status));
  return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">PRACTICE</span><h2>从已核对的材料开始练。</h2><p>当前账号的任务和试卷来自本机总控。</p></div></div>${pending?`<section class="panel"><h3>生成中：${esc(pending.status)}</h3>${action('查看任务状态','go',{view:'practice',job:pending.id},true)}</section>`:''}${ready?`<section class="panel"><h3>有一份试卷待作答</h3>${action('进入试卷','go',{view:'practice',exam:ready.id},true)}</section>`:''}<section class="panel"><h3>从资料申请新卷</h3><p>先打开课程资料，核对并确认原文，再主动申请。生成任务可能使用受控模型额度。</p>${action('打开课程与资料','go',{view:'materials'},true)}</section><div class="section-gap"></div>${overview.history.map(h=>`<article class="list-card"><span class="file-icon">卷</span><div class="card-main"><h3>${esc(h.kind==='retest'?'错点补练':'材料主卷')}</h3><p>${esc(h.trialLabel||h.status)} · ${h.attempt?'首答已交':'尚未交卷'}</p></div>${action(h.attempt?'看报告':'打开试卷','go',h.attempt?{view:'report',attempt:h.attempt.id}:{view:'practice',exam:h.id})}</article>`).join('')}</div><aside class="note-panel"><h3>生成说明</h3><p>资料核对、模型生成、人工审核和试用资格是独立步骤；未审核的卷不会被伪装成已可作答。</p></aside></div>`;
}
async function reportView(params){
  const attemptId=params.get('attempt')||overview.history.find(h=>h.attempt)?.attempt?.id;
  if(!attemptId)return `<section class="panel"><h2>还没有交卷报告</h2><p>先完成资料确认和一份练习。</p>${action('进入练习','go',{view:'practice'},true)}</section>`;
  const {attempt}=await api('/api/pilot/v1/attempts/'+encodeURIComponent(attemptId)+'/report');
  let exam=null;try{exam=(await api('/api/pilot/v1/exams/'+encodeURIComponent(attempt.examId))).exam;}catch{}
  const cites=new Map((exam?.questions||[]).map(q=>[q.id,q.citation]));
  return `<div class="page-grid"><div><div class="report-band"><div><span class="eyebrow">REAL REPORT · 当前账号</span><strong>${esc(attempt.report.score)} / ${esc(attempt.report.total)} 题正确</strong><p>首答已保存。${esc(attempt.trialLabel||'请对照材料与学科依据复核试用结果。')}</p></div></div>${(attempt.report.rows||[]).map((r,i)=>`<article class="question-card"><span class="eyebrow">第 ${i+1} 题 · ${r.status==='correct'?'答对':'需要回看'}</span><h3>我的答案 ${esc(r.selected||'未作答')} · 正确答案 ${esc(r.correctAnswer)}</h3><p>${esc(r.explanation)}</p>${cites.get(r.questionId)?`<div class="answer-note">材料依据：${cites.get(r.questionId).page===0?'已核对全文，原页码未知':'第 '+esc(cites.get(r.questionId).page)+' 页'} · ${esc(cites.get(r.questionId).quote)}</div>`:''}</article>`).join('')}<section class="panel"><h3>下一步</h3><p>${attempt.report.wrong?'先回看上面的错因与原文，再决定是否申请补练。':'本卷没有答错题，可继续学习下一份资料。'}</p>${attempt.report.wrong?action('申请本次错点补练','retest',{attempt:attemptId},true):action('继续学习资料','go',{view:'materials'},true)}</section></div><aside class="note-panel"><h3>记录保护</h3><p>当前报告从总控读取。补练会另开新卷，原首答和成绩不会被覆盖。</p>${action('查看错题本','go',{view:'mistakes'})}</aside></div>`;
}
function teachersView(){return `<div><div class="heading-row"><div><span class="eyebrow">SUBJECT SUPPORT</span><h2>按自己的课程找学习入口。</h2><p>学科老师实时问答还没有接入总控，当前提供真实课程与资料入口。</p></div></div><div class="teacher-grid"><article class="teacher-card"><span class="file-icon">伴</span><strong>学习教练</strong><small>根据账号进度给出下一步页面引导。</small>${action('回到教练','go',{view:'coach'})}</article>${overview.courses.map(c=>`<article class="teacher-card"><span class="file-icon">课</span><strong>${esc(c.title)}</strong><small>${c.fileCount||0} 份资料；先核对来源，再进入练习。</small>${action('打开课程','go',{view:'materials',course:c.id})}</article>`).join('')}</div><p class="footnote">自由提问、课程老师个性化讲解需要单独接入模型与来源检索，目前不显示模拟回答。</p></div>`;}
function settingsView(){return `<div class="page-grid"><div><div class="heading-row"><div><span class="eyebrow">ACCOUNT & CONNECTION</span><h2>账号和学习数据说清楚。</h2></div></div><section class="panel"><div class="setting-row"><div><strong>当前账号</strong><small>${esc(auth.user?.email||'未登录')}</small></div><span class="status-chip done">已登录</span></div><div class="setting-row"><div><strong>本机总控</strong><small>资料、试卷和报告保存在现有有伴学生服务</small></div><span class="status-chip done">已连接</span></div><div class="setting-row"><div><strong>实时 AI 问答</strong><small>尚无教练与学科老师对话接口</small></div><span class="status-chip">未接入</span></div><div class="setting-row"><div><strong>安全退出</strong><small>退出当前公网测试版的账号会话</small></div>${action('退出账号','logout')}</div></section></div><aside class="note-panel"><h3>另一个入口</h3><p>原有学生页仍可使用；本测试页和原入口是不同网址，需要分别登录。</p><a class="source-link" href="https://youban-student-relay-candidate.yuanqi0805.workers.dev/student/" target="_blank" rel="noopener">打开原有学生页 ↗</a></aside></div>`;}
async function render(){
  const run=++viewRun,{view,params}=route();renderNav(view);$('#view').innerHTML='<section class="panel">正在读取当前账号状态…</section>';
  try{
    await refreshAuth();if(run!==viewRun)return;renderNav(view);
    if(!auth.authenticated){$('#view').innerHTML=loginView();return;}
    await loadOverview();if(run!==viewRun)return;
    const html=view==='coach'?coachView():view==='materials'?await materialsView(params):view==='mistakes'?mistakesView():view==='practice'?await practiceView(params):view==='report'?await reportView(params):view==='teachers'?teachersView():settingsView();
    if(run===viewRun)$('#view').innerHTML=html;
  }catch(error){if(run===viewRun){renderNav(view);$('#view').innerHTML=`<div class="page-grid"><section class="panel"><h2>暂时没读到总控状态</h2><p>${esc(error.message)}</p>${action('重新读取','refresh',{},true)}</section><aside class="note-panel"><h3>你的资料仍在原处</h3><p>连接恢复后先查看课程、任务和历史状态，再决定是否重新提交。</p></aside></div>`;}}
}
document.addEventListener('click',async event=>{
  const tab=event.target.closest('[data-auth-tab]');if(tab){const login=tab.dataset.authTab==='login';$('#login-form').hidden=!login;$('#register-form').hidden=login;document.querySelectorAll('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b===tab));return;}
  const navButton=event.target.closest('[data-view]');if(navButton){go(navButton.dataset.view);return;}
  const button=event.target.closest('[data-action]');if(!button||busy)return;
  const name=button.dataset.action;
  if(name==='go'){const {view,...params}=button.dataset;delete params.action;go(view,params);return;}
  if(name==='refresh'){details.clear();void render();return;}
  if(name==='answer'){const {exam,question,answer}=button.dataset;const draft=drafts.get(exam)||{};draft[question]=answer;drafts.set(exam,draft);button.parentElement.querySelectorAll('.choice').forEach(b=>b.classList.toggle('selected',b===button));return;}
  busy=true;button.disabled=true;
  try{
    if(name==='confirm-file'){await api('/api/pilot/v1/files/'+button.dataset.file+'/confirm',{method:'POST',body:JSON.stringify({acceptUnpagedWord:button.dataset.word==='true'})});toast('来源版本已确认');details.clear();await render();}
    else if(name==='start-job'){const sourceVersion=button.dataset.source;const key='coach-main:'+sourceVersion+':'+crypto.randomUUID();const {job}=await api('/api/pilot/v1/jobs',{method:'POST',body:JSON.stringify({sourceVersion,key,kind:'main'})});toast('生成任务已保存，请查看状态');go('practice',{job:job.id});}
    else if(name==='submit'){if(!$('#submit-check')?.checked){toast('请先确认首答提交后不能修改');return;}const exam=button.dataset.exam,answers=drafts.get(exam)||{};const key='coach-submit:'+exam+':'+crypto.randomUUID();const {attempt}=await api('/api/pilot/v1/exams/'+exam+'/submit',{method:'POST',body:JSON.stringify({key,answers})});drafts.delete(exam);toast('首答已保存');go('report',{attempt:attempt.id});}
    else if(name==='retest'){const attemptId=button.dataset.attempt,matched=overview.mistakes.filter(m=>m.attemptId===attemptId);if(!matched.length){toast('本次报告没有已确认错题');return;}const sourceVersion=matched[0].sourceVersion,key='coach-retest:'+attemptId+':'+crypto.randomUUID();const {job}=await api('/api/pilot/v1/mistakes/retest',{method:'POST',body:JSON.stringify({sourceVersion,mistakeIds:matched.map(m=>m.id),key})});toast('补练生成任务已保存');go('practice',{job:job.id});}
    else if(name==='logout'){await api('/api/auth/logout',{method:'POST',body:'{}'});auth={known:false,authenticated:false,csrfToken:null};details.clear();drafts.clear();go('coach');await render();}
  }catch(error){toast(error.message);}finally{busy=false;if(button.isConnected)button.disabled=false;}
});
document.addEventListener('submit',async event=>{
  const form=event.target;if(!['login-form','register-form','course-form','upload-form'].includes(form.id))return;
  event.preventDefault();if(busy)return;busy=true;const button=form.querySelector('button[type=submit]');if(button)button.disabled=true;
  try{
    if(form.id==='login-form'||form.id==='register-form'){
      const path=form.id==='login-form'?'/api/auth/local/login':'/api/auth/local/register';
      await api(path,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();toast('已登录有伴学习空间');await render();
    }else if(form.id==='course-form'){
      const {course}=await api('/api/learning/library/courses',{method:'POST',body:JSON.stringify({title:String(new FormData(form).get('title')||'').trim()})});details.clear();go('materials',{course:course.id});
    }else if(form.id==='upload-form'){
      const file=new FormData(form).get('file');if(!(file instanceof File)||!file.size||file.size>20*1024*1024)throw Error('请选择 1 字节至 20 MB 的文件。');
      await api('/api/learning/library/courses/'+form.dataset.course+'/files',{method:'POST',body:file,headers:{'content-type':'application/octet-stream','x-file-name':encodeURIComponent(file.name)}});
      details.delete(form.dataset.course);toast('原件已保存，正在提取；请刷新查看状态');await render();
    }
  }catch(error){const target=$('#auth-message');if(target&&form.id.includes('login')||form.id==='register-form'&&target)target.textContent=error.message;else toast(error.message);}
  finally{busy=false;if(button?.isConnected)button.disabled=false;}
});
$('#refresh').addEventListener('click',()=>{details.clear();void render();});
window.addEventListener('hashchange',()=>void render());
void render();

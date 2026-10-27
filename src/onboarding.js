// Advice reads actual company state and never creates economic progress.
export function onboardingStep(state, {skipped=false,financeReviewed=false}={}) {
  let step;
  if(state.ending)step={id:'ended',title:'经营结束了',copy:'模型成绩和每期账单都存着，可以继续查看。',goal:'查看结局与公司记录',action:'查看排行榜',target:'ranking',complete:true};
  else if(!state.employees.length)step={id:'hire',title:'公司现在没人做研发了',copy:'先招一位员工，才能继续研发或主持发布。已经做好的成果都还在。',goal:'招聘一位员工',action:'前往人才市场',target:'hiring'};
  else if(state.project?.status==='ready')step={id:'release',title:'模型做完了，准备发布吧',copy:'这款已经做完。可以选媒体写报道，也可以直接发布；正式发布后，这款成绩才能参榜。',goal:'筹备发布会',action:'筹备发布会',target:'release'};
  else if(state.project?.status==='planning'&&state.project.plannerId===null)step={id:'planner',title:'方案还没做完，负责人走了',copy:'到研发页选个人接手。已经用掉的设计时间保留，不用再付训练费。',goal:'重新选择方案负责人',action:'重选方案负责人',target:'project'};
  else if(!state.project&&state.models.some(m=>m.company==='player')&&financeReviewed)step={id:'next-project',title:'接下来做哪款',copy:'看看榜上差哪一项。想补能力就招人，想缩短工期就买算力，也可以直接开下一款。',goal:'开发下一款模型',action:'开发下一款模型',target:'project',complete:true};
  else if(!state.project&&state.models.some(m=>m.company==='player'))step={id:'published',title:'模型已经上榜',copy:'先看这次花了多少钱、下期能收多少订阅费。达标融资当场到账，其他收入等账单结算。',goal:'查看收入与扩张',action:'查看资金与扩张',target:'finance',complete:true};
  else if(!state.project)step={id:'project',title:'先定第一款做什么',copy:'给模型起名，选编程、办公或多模态，再挑一个员工负责方案。卡片上能比较每个人的三项能力。立项先付训练费，别把发布费和工资也花了。',goal:'选择方案负责人并立项',action:'带我去立项',target:'project'};
  else if(state.paused)step={id:'start',title:'现在暂停着',copy:'点“继续经营”，员工就会接着干活。不用逐人派任务，想停下来随时按暂停。',goal:'继续推进当前项目',action:'继续经营',target:'resume'};
  else if(state.project.status==='planning')step={id:'planning',title:'负责人正在做方案',copy:'方案完成后会给出三项初始属性，随后全员开始处理数据。现在可以等，也可以去看进度。',goal:'等待方案交付',action:'查看方案进度',target:'project'};
  else step={id:'research',title:'大家都在研发',copy:'员工头上跳一次图标，对应属性就加一点。人手和能力影响成绩，算力影响工期。火爆时会连着加点。',goal:'观察团队能力、阶段和模型增长',action:'查看研发进度',target:'project'};
  return {...step,skipped,showGuidance:!skipped&&!step.complete};
}

// Office orientation has its own saved UI preferences, separate from live goals.
const TOUR_STEPS = [
  { id:'office', title:'老板，我是小满', copy:'我是公司秘书小满，帮你看账、招人、安排发布。先带你认一下按钮。', items:['办公室中间是员工工位，老板和我在后面。','不知道接下来做什么，就点“问小满”。'], targets:['.office-card'] },
  { id:'dashboard', title:'钱、排名和设备看这里', copy:'最上面这排会跟着经营情况变化。刚开张还没产品，所以没有名次和评价。', items:['现金：训练、发布、招聘、工资和买算力都从这里扣。','综合榜：模型正式发布后才有公司名次。','算力：显示研发占用与设备总量，更多算力更快。','用户评价：首款模型发布后才会出现。'], targets:['.dashboard'] },
  { id:'time', title:'用这里暂停或加速', copy:'时间走动时，员工才会干活，账单也会到期。要算预算就先暂停。', items:['继续经营与暂停：随时切换。','1、2、4 倍速：按自己的节奏玩。','打开管理页或切走页面时临时暂停，返回后自动继续；主动暂停会保留。'], targets:['.timebar'] },
  { id:'production', title:'研发、员工和招聘', copy:'做模型在“模型研发”，看现有员工在“团队能力”，想招新人就去“人才市场”。', items:['模型研发：起型号名、选主攻方向与方案负责人。','团队能力：查看员工能力、使用主动能力，自动特性有生效说明。','人才市场：招聘已开放人才，后续随进度增加。'], targets:['.office-navigation [data-panel-target="project"]','.office-navigation [data-panel-target="team"]','.office-navigation [data-panel-target="hiring"]'] },
  { id:'business', title:'查榜单、账目和消息', copy:'这几个按钮用来查结果。介绍完以后，我会带你做第一款模型。', items:['排行榜：看真实模型成绩，也能打开型号介绍。','资金扩张：小满解释收支，也在这里买设备、增工位。','行业快讯：看竞品发布、挖人和设备报价。','用户反馈：看用户投诉，Rebo 入职后可以在这里重置额度。'], targets:['.office-navigation [data-panel-target="ranking"]','.office-navigation [data-panel-target="finance"]','.office-navigation [data-panel-target="news"]','.office-navigation [data-panel-target="feedback"]'] },
];
export function tourStep(progress = {}) {
  const index = Number.isInteger(progress.tourStep) ? Math.max(0, Math.min(TOUR_STEPS.length-1, progress.tourStep)) : 0;
  return { ...TOUR_STEPS[index], index, count:TOUR_STEPS.length, completed:progress.tourCompleted !== false };
}
export function updateTourProgress(progress, action) {
  const step = tourStep(progress);
  if (action === 'restart') return {tourStep:0,tourCompleted:false};
  if (action === 'skip') return {tourStep:step.index,tourCompleted:true};
  if (action === 'back') return {tourStep:Math.max(0,step.index-1),tourCompleted:false};
  if (action === 'next') return {tourStep:Math.min(step.count-1,step.index+1),tourCompleted:step.index===step.count-1};
  return {tourStep:step.index,tourCompleted:step.completed};
}

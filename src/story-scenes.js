import {
  campaignDay, rulesFor, price, rank, total, marketSummary, operatingCosts,
  productionSummary, board,
} from './game/rules.js';

export const STORY_SCENES = [
  { id: 'story-bill', classicDay: 7, replaces: ['bill-first'], mode: 'dialogue', title: '工资表已经发来了' },
  { id: 'story-contacts', classicDay: 24, replaces: ['N17'], mode: 'reveal', title: 'Jeff 发了封告别邮件' },
  { id: 'story-headlines', classicDay: 44, replaces: ['headlines'], mode: 'choice', title: '给昨天的稿子换个标题' },
  { id: 'story-prices', classicDay: 60, replaces: ['N22'], mode: 'reveal', title: '股票跌了，显卡能便宜吗' },
  { id: 'story-pencil', classicDay: 78, replaces: ['rival-0-2'], mode: 'dialogue', title: '这张榜单图怎么裁' },
  { id: 'story-doors', classicDay: 94, replaces: ['N20'], mode: 'choice', title: '模型要申请，简历直接收' },
  { id: 'story-soon', classicDay: 111, replaces: ['countdown'], mode: 'reveal', title: '两家都在问对面几点发' },
  { id: 'story-verification', classicDay: 128, replaces: ['N16'], mode: 'choice', title: '到底要打多快' },
  { id: 'story-steady', classicDay: 140, replaces: ['N01-sale'], mode: 'dialogue', title: '销售又发来一张机房效果图' },
  { id: 'story-deadline', classicDay: 161, replaces: ['deadline'], mode: 'choice', title: '这款还能赶上吗' },
];

const owned = state => state.models.filter(model => model.company === 'player');
const cash = amount => `${amount} 万`;
const signedCash = amount => `${amount >= 0 ? '+' : ''}${amount} 万`;
const rankText = state => rank(state) === null ? '尚未发布' : `综合榜第 ${rank(state)} 名`;
const historicalModel = (state, company, day) => state.models
  .filter(model => model.company === company && model.day <= day)
  .sort((a, b) => b.day - a.day || b.sequence - a.sequence)[0];
const modelCopy = model => model
  ? `${model.name}：编程 ${model.scores[0]}，办公 ${model.scores[1]}，多模态 ${model.scores[2]}。`
  : '当时还没有已发布的型号。';
const currentFacts = state => [
  { label: '你公司的已发布模型', value: `${owned(state).length} 款` },
  { label: '你公司的综合排名', value: rankText(state) },
];

export function storyScene(state, id, observedIds = []) {
  const meta = STORY_SCENES.find(scene => scene.id === id);
  if (!meta) return null;
  const day = campaignDay(state, meta.classicDay);
  const result = { ...meta, day, intro: '', facts: [], outro: '' };
  const published = owned(state);
  const bills = state.bills;
  const costs = operatingCosts(state);

  if (id === 'story-bill') {
    const market = marketSummary(state);
    const income = Math.max(0, market.weeklyIncome + state.pendingBonus + state.pendingNews);
    Object.assign(result, {
      intro: '老板还在改融资用的演示稿，小满把工资表拖到了屏幕正中间。',
      lines: [
        { speaker: '小满', text: '工资和设备运行费都在这儿，您看一下。' },
        { speaker: '老板', text: '能不能等融资到了再付？' },
        { speaker: '小满', text: published.length ? '到账再算。先看已发布模型的订阅收入够不够。' : '还没发模型，也没有订阅收入。这笔得从现有现金里出。' },
      ],
      facts: [
        { label: '公司现金', value: cash(state.cash) },
        { label: '每期工资和设备运行费', value: cash(costs.salaries + costs.running) },
        { label: state.ending ? '公司状态' : '预计下期收支净额', value: state.ending ? '已结束经营' : signedCash(income - costs.salaries - costs.running) },
      ],
      outro: state.ending?'小满把最后一张账单收好：“实际收支都留着，您可以再看。”':`小满在日历上圈了一下：“第 ${(Math.floor(state.gameDay/7)+1)*7} 日还要付下一张，别把钱全拿去买设备。”`,
      cta: { label: '打开资金账目', panel: 'finance' },
    });
  } else if (id === 'story-contacts') {
    const model = historicalModel(state, 'Gloglo', day);
    Object.assign(result, {
      intro: 'Gloglo 的公司群里转来一封邮件：首席科学家 Jeff Damn 离职了。这家千人以上的大公司，光是告别回复就刷了好几屏。',
      cards: [
        { label: '读告别邮件', title: 'Jeff Damn 离开 Gloglo', copy: 'Jeff：“谢谢大家这些年的合作。我已经离职，接下来做什么还没公布。”同事问下次模型评审谁来主持。行政回了一句：“会议照开，主持人稍后更新。”' },
        { label: '看看模型页面', title: model?.name || '当时的模型页面', copy: `${modelCopy(model)} Jeff 走后，Gloglo 仍有上千名员工。模型页面没有下线，研发团队继续准备后面的发布。` },
      ],
      facts: [{ label: '你公司的在岗员工', value: `${state.employees.length} 人` }],
      outro: state.employees.length === 2 ? '老板看完新闻，又看了看办公室：“咱们才两个人，还是先看看有没有合适的候选人。”' : `老板关掉邮件：“Gloglo 的事先放一边。咱们现在 ${state.employees.length} 个人，看看还缺什么人。”`,
      cta: { label: '看看我们能招谁', panel: 'hiring' },
    });
  } else if (id === 'story-headlines') {
    Object.assign(result, {
      intro: '媒体编辑把昨天的报道另存了一份，只改了型号名。光标停在标题开头，等着再加一个词。',
      choices: [
        { id: 'sudden', label: '填“突然”', reply: '编辑：“行。预热链接先别放，点进去就知道预告挂了多久。”' },
        { id: 'again', label: '填“又”', reply: '编辑：“‘又一个新时代’？昨天那篇也叫这个，我把型号换掉。这个标题存着，下次还能用。”' },
        { id: 'epic', label: '填“史诗级”', reply: '编辑：“有对比数据吗？”同事：“还没给。”编辑：“那先把字放大。”' },
      ],
      facts: [{ label: '你公司已购买的报道', value: `${published.filter(model => model.media).length} 篇` }],
      outro: '编辑把样稿发进群：“谁有新模型的全名？别又把上一代发出去。”',
    });
  } else if (id === 'story-prices') {
    Object.assign(result, {
      intro: 'DeepPeek R1 的价目表传到了同行群里。有人圈出费用那一行，又转来 Nvidya 的股票页面。',
      cards: [
        { label: '读股票新闻', title: 'Nvidya 的股价跌了', copy: '同行老板：“照这个价格卖，他们怎么赚钱？”工程师：“技术报告里写了。”老板：“先别讲原理，把咱们的报价表拿来。”' },
        { label: '看供应商的报价单', title: '显卡报价没跟着跌', copy: `公告当天的设备报价是每单位 ${cash(price({ ...state, gameDay: day }))}。采购：“股票都跌了，卡能便宜点吗？”供应商：“您要买多少？我按这张单子开。”` },
      ],
      facts: [
        { label: '你公司现在的采购单价', value: `${cash(price(state))} / 单位` },
        { label: '你公司已购算力', value: `${state.compute} 单位` },
      ],
      outro: '采购关掉股票新闻，留下报价单：“还是按这个数算。”',
      cta: { label: '查看设备报价', panel: 'finance' },
    });
  } else if (id === 'story-pencil') {
    const cloud = historicalModel(state, 'AntiThropic', day);
    const talk = historicalModel(state, 'CloseAI', day);
    const purchased = published.some(model => model.media);
    Object.assign(result, {
      intro: 'Cloud 和 TalkGPT 又赶在一起发布。编辑把两家的榜单图摆到桌面上，开始裁掉各自不好看的那几列。',
      lines: [
        { speaker: '行业快讯', text: `榜单已更新，可以查看 ${cloud?.name || 'Cloud 的已发布型号'} 和 ${talk?.name || 'TalkGPT 的已发布型号'} 的成绩。` },
        { speaker: '媒体编辑', text: '这两张图别叠，各发一篇。自家的柱子涂亮一点。' },
        { speaker: '小满', text: purchased ? '咱们那篇报道已经发了。要改型号的话，我先问问编辑。' : '咱们先别急着写“最新”。把自己的成绩查一下。' },
      ],
      facts: currentFacts(state),
      outro: rank(state) === 1 ? '老板看了一眼榜单：“我们还在第一，截图把日期也带上。”' : rank(state) === null ? '老板：“咱们的模型还没上榜，先别做海报。”' : `老板：“咱们现在第 ${rank(state)} 名。图别裁了，完整的给我看看。”`,
      cta: { label: '打开完整榜单', panel: 'ranking' },
    });
  } else if (id === 'story-doors') {
    Object.assign(result, {
      intro: 'Meeta 的模型下载页弹出“请联系商务”。隔壁招聘页不用登录，邮箱和电话都写在第一屏。',
      choices: [
        { id: 'download', label: '点一下模型下载', reply: '访客：“不是说开放吗？”商务：“介绍文档可以直接看。您要模型的话，我先给您约个会。”' },
        { id: 'talent', label: '点一下招聘入口', reply: '招聘负责人：“您现在在哪家公司？”候选人：“还没打算跳。”对方：“先聊待遇，方便留个电话吗？”' },
      ],
      facts: [{ label: '你公司的在岗员工', value: `${state.employees.length} 人` }],
      outro: '招聘页的聊天框还亮着。下载页只收到一封自动邮件：已收到您的申请。',
      cta: { label: '查看我们的招聘名单', panel: 'hiring' },
    });
  } else if (id === 'story-soon') {
    Object.assign(result, {
      intro: '两封发布预告先后进了媒体邮箱，都没写具体时间。编辑给两家公司各回了一封邮件。',
      cards: [
        { label: '读 CloseAI 的回信', title: '“对面定了吗？”', copy: 'Sam Allman 的助理：“台搭好了。AntiThropic 说哪天了吗？”编辑：“我在问你们。”助理：“您先问问他们。”' },
        { label: '读 AntiThropic 的回信', title: '“他们发了就打给我”', copy: 'AntiThropic 公关：“先别发稿。CloseAI 要是今天发，给我打电话。”编辑看了眼手机，把两边都设成了置顶。' },
      ],
      facts: [{ label: '你公司的已发布模型', value: `${published.length} 款` }],
      outro: '午饭送到了，编辑也没敢关电脑，两份稿子还并排开着。',
    });
  } else if (id === 'story-verification') {
    Object.assign(result, {
      intro: '用户打开 Cloud，问题还没发出去，页面先要求证明“不是自动程序”。输入框下面又多了一份检测说明。',
      choices: [
        { id: 'fast', label: '试着打快一点', reply: '页面：“输入速度异常，请重新验证。”用户删掉刚打好的问题，开始一个字一个字敲。' },
        { id: 'slow', label: '一个字一个字打', reply: '页面：“操作节奏异常，请重新验证。”用户：“我按你说的打慢了啊？”' },
      ],
      facts: [{ label: '你公司用户的评分', value: published.length ? `${(state.ratingTenths / 10).toFixed(1)} / 5` : '尚未发布，暂无评价' }],
      outro: '用户点了申诉。系统让他先登录，登录页又弹出了同一道人机验证。',
    });
  } else if (id === 'story-steady') {
    const lastBill = bills.at(-1);
    Object.assign(result, {
      intro: `Nvidya 的促销邮件又来了：当日报价每单位 ${cash(price({ ...state, gameDay: day }))}，到第 ${campaignDay(state, 147)} 日结束。附件里还放了一张扩建机房的效果图。`,
      lines: [
        { speaker: 'Nvidya 销售', text: published.length ? '已经发模型了，更得多备几台设备。下款模型总要做大一点吧？' : '先把设备备上，后面做大模型用得着。' },
        { speaker: '老板', text: '先别发效果图了。我问的是买回来以后，每期还要付多少。' },
        { speaker: '小满', text: '设备买完，运行费还得每期付。我把最近那张账单放下面了。' },
      ],
      facts: [
        { label: '现在的设备采购单价', value: `${cash(price(state))} / 单位` },
        { label: '你公司最近的账单', value: lastBill ? `第 ${lastBill.day} 日，收入 ${cash(lastBill.income)}，工资和运行费 ${cash(lastBill.salaries + lastBill.running)}` : '还没有账单' },
      ],
      outro: '老板关掉效果图，把最近一张账单放大了。',
      cta: { label: '看看最近的账单', panel: 'finance' },
    });
  } else if (id === 'story-deadline') {
    const deadline = rulesFor(state).lastDay - 1;
    const summary = productionSummary(state);
    const best = board(state).find(model => model.company === 'player');
    let progress;
    if (state.ending) progress = '这家公司已经结算完了。这里能看记录，不能再补发模型。';
    else if (!state.project) progress = '现在没有在研模型。先看看已发布的成绩，再决定要不要开新项目。';
    else if (state.project.status === 'ready') progress = `${state.project.name} 已完成，还差正式发布。发布费 ${cash(rulesFor(state).publicationCost)}，之前的训练费不用再付。`;
    else if (summary.estimatedDays === null || summary.blockedReason) progress = `项目现在停着：${summary.blockedReason || '没有能工作的员工'}。处理好以后，才能继续算完成日期。`;
    else {
      const completion = state.gameDay + summary.estimatedDays;
      progress = `照现在的人手和算力，${state.project.name} 预计第 ${completion} 日做完。${completion > deadline ? '晚于发布截止日，赶不上这期了。' : '预计来得及。做完后记得正式发布。'}`;
    }
    const again = observedIds.includes('story-pick:story-headlines:again');
    Object.assign(result, {
      intro: `小满在日历上圈出第 ${deadline} 日：“这是最后能发布的一天。第 ${rulesFor(state).lastDay} 日结账，没发的模型不算成绩。”`,
      choices: [
        { id: 'progress', label: '看在研项目的进度', reply: progress },
        { id: 'record', label: '看我们已经发了什么', reply: best ? `我们发过 ${published.length} 款模型。综合榜上是 ${best.name}，${total(best)} 分，${rankText(state)}。` : '我们尚未发布模型，报告里还没有成绩。' },
      ],
      facts: [
        { label: '公司现金', value: cash(state.cash) },
        { label: '最后可发布日期', value: `第 ${deadline} 日` },
      ],
      outro: again ? '小满翻出你上次选的“又”：“标题模板还在，日期和型号可别也照抄。”' : '小满：“没发出去的先别写进报告，我按实际榜单填。”',
      cta: { label: '打开模型项目', panel: 'project' },
    });
  }
  return result;
}

// Reading progress belongs to this company; it never enters the economic reducer.
export function storyStartMarker(day) { return `story-start:${day}`; }
export function reachedStoryScenes(state,observedIds=[]) {
  const marker=observedIds.find(id=>/^story-start:\d+$/.test(id));
  const startDay=marker?Number(marker.slice('story-start:'.length)):state.gameDay+1;
  return STORY_SCENES.map(scene=>({...scene,day:campaignDay(state,scene.classicDay)})).filter(scene=>scene.day>=startDay&&scene.day<=state.gameDay);
}
export function selectedStoryChoice(observedIds,sceneId) {
  const prefix=`story-pick:${sceneId}:`;
  const marker=observedIds.find(id=>id.startsWith(prefix));
  return marker?marker.slice(prefix.length):null;
}

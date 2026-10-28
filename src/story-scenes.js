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
      intro: '老板正把融资演示稿里的增长曲线往上拉，小满把工资表放到了他面前。',
      lines: [
        { speaker: '小满', text: '工资和设备运行费的账单快到了。' },
        { speaker: '老板', text: '融资还没到账，能晚几天吗？' },
        { speaker: '小满', text: published.length ? '先看看订阅收入够不够吧。' : '模型还没发布，只能先从账上的钱里付。' },
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
      intro: 'Gloglo 的首席科学家 Jeff Damn 发邮件宣布离职。Gloglo 是千人以上的大公司，群里的祝福刷了几百条。',
      cards: [
        { label: '读告别邮件', title: 'Jeff Damn 离开 Gloglo', copy: 'Jeff：“谢谢大家这些年的合作。接下来做什么，想好了再告诉你们。”团队的模型评审邀请照常发出，主持人一栏暂时空着。' },
        { label: '看看模型页面', title: model?.name || '当时的模型页面', copy: `${modelCopy(model)} Jeff 走后，Gloglo 仍有上千名员工。产品页面照常更新，下一场发布会的准备工作还在进行。` },
      ],
      facts: [{ label: '你公司的在岗员工', value: `${state.employees.length} 人` }],
      outro: state.employees.length === 2 ? '老板看完邮件，抬头问：“咱们招人的事有消息了吗？”' : `老板关掉邮件：“咱们现在 ${state.employees.length} 个人，还缺什么人？”`,
      cta: { label: '看看我们能招谁', panel: 'hiring' },
    });
  } else if (id === 'story-headlines') {
    Object.assign(result, {
      intro: '新模型的预热还挂在首页。编辑拿起昨晚写的稿子，打算给标题再加个词。',
      choices: [
        { id: 'sudden', label: '填“突然”', reply: '编辑：“就写‘突然’。预热了三天的消息先别提。”' },
        { id: 'again', label: '填“又”', reply: '编辑：“又来了！型号换一下，昨天的标题还能用。”' },
        { id: 'epic', label: '填“史诗级”', reply: '编辑：“数据呢？”同事：“还在跑。”编辑：“标题先写，数据等跑完再补。”' },
      ],
      facts: [{ label: '你公司已购买的报道', value: `${published.filter(model => model.media).length} 篇` }],
      outro: '编辑发出样稿，又在群里补了一句：“谁核一下型号，别写成上次的。”',
    });
  } else if (id === 'story-prices') {
    Object.assign(result, {
      intro: 'DeepPeek R1 的价目表传到了同行群里。有人圈出费用那一行，又转来 Nvidya 的股票页面。',
      cards: [
        { label: '读股票新闻', title: 'Nvidya 的股价跌了', copy: '同行先转发了价格页，财务把预算表改了三遍。老板问：“我们能按这个价格卖吗？”工程师：“我先算算机器的钱。”' },
        { label: '看供应商的报价单', title: '显卡报价没跟着跌', copy: `公告当天的设备报价是每单位 ${cash(price({ ...state, gameDay: day }))}。采购：“股票都跌了，卡能便宜点吗？”销售：“您要几张？”` },
      ],
      facts: [
        { label: '你公司现在的采购单价', value: `${cash(price(state))} / 单位` },
        { label: '你公司已购算力', value: `${state.compute} 单位` },
      ],
      outro: '采购看了看股票，又看了看报价单：“这俩好像没什么关系。”',
      cta: { label: '查看设备报价', panel: 'finance' },
    });
  } else if (id === 'story-pencil') {
    const cloud = historicalModel(state, 'AntiThropic', day);
    const talk = historicalModel(state, 'CloseAI', day);
    const purchased = published.some(model => model.media);
    Object.assign(result, {
      intro: '编辑把 Cloud 和 TalkGPT 的成绩放在一起，准备做一张榜单图。',
      lines: [
        { speaker: '行业快讯', text: `榜单已更新，可以查看 ${cloud?.name || 'Cloud 的已发布型号'} 和 ${talk?.name || 'TalkGPT 的已发布型号'} 的成绩。` },
        { speaker: '媒体编辑', text: '榜单截图能不能只留自家的成绩？' },
        { speaker: '小满', text: purchased ? '我们的报道已经发了，要改图我再联系编辑。' : published.length ? '我们还没买报道，要用这张图吗？' : '我们还没有模型上榜，先留一份完整榜单吧。' },
      ],
      facts: currentFacts(state),
      outro: rank(state) === 1 ? '老板看了一眼榜单：“我们还在第一，截图把日期也带上。”' : rank(state) === null ? '老板：“咱们的模型还没上榜，先别做海报。”' : `老板：“咱们现在第 ${rank(state)} 名。图别裁了，完整的给我看看。”`,
      cta: { label: '打开完整榜单', panel: 'ranking' },
    });
  } else if (id === 'story-doors') {
    Object.assign(result, {
      intro: 'Meeta 的模型下载页弹出“请联系商务”。隔壁招聘页不用登录，邮箱和电话都写在第一屏。',
      choices: [
        { id: 'download', label: '点一下模型下载', reply: '访客：“不是说开放吗？”商务：“模型需要申请，我先帮您登记。”' },
        { id: 'talent', label: '点一下招聘入口', reply: '招聘负责人：“您现在在哪家公司？”候选人：“还没打算跳。”对方：“先聊待遇，方便留个电话吗？”' },
      ],
      facts: [{ label: '你公司的在岗员工', value: `${state.employees.length} 人` }],
      outro: '招聘页的聊天框还亮着。下载页只收到一封自动邮件：已收到您的申请。',
      cta: { label: '查看我们的招聘名单', panel: 'hiring' },
    });
  } else if (id === 'story-soon') {
    Object.assign(result, {
      intro: 'CloseAI 和 AntiThropic 先后发来发布预告，都没写具体时间。编辑打电话去问。',
      cards: [
        { label: '读 CloseAI 的回信', title: '“对面定了吗？”', copy: 'CloseAI 公关：“AntiThropic 定几点？”编辑：“还没说。”公关：“那您问到了告诉我一声。”' },
        { label: '读 AntiThropic 的回信', title: '“他们发了就打给我”', copy: '五分钟后，AntiThropic 公关打来：“CloseAI 定了吗？”编辑：“我也正等他们电话。”' },
      ],
      facts: [{ label: '你公司的已发布模型', value: `${published.length} 款` }],
      outro: '编辑打开两个直播间，先把外卖点了。',
    });
  } else if (id === 'story-verification') {
    Object.assign(result, {
      intro: '用户打开 Cloud，问题还没发出去，页面先要求证明“不是自动程序”。输入框下面又多了一份检测说明。',
      choices: [
        { id: 'fast', label: '试着打快一点', reply: '页面：“输入速度异常，请重新验证。”用户放慢速度，重新输入。' },
        { id: 'slow', label: '一个字一个字打', reply: '页面：“操作节奏异常，请重新验证。”用户：“刚才不是让我打慢一点吗？”' },
      ],
      facts: [{ label: '你公司用户的评分', value: published.length ? `${(state.ratingTenths / 10).toFixed(1)} / 5` : '尚未发布，暂无评价' }],
      outro: '用户打开申诉页：请先登录。',
    });
  } else if (id === 'story-steady') {
    const lastBill = bills.at(-1);
    Object.assign(result, {
      intro: `Nvidya 的促销邮件又来了：当日报价每单位 ${cash(price({ ...state, gameDay: day }))}，到第 ${campaignDay(state, 147)} 日结束。附件里还放了一张扩建机房的效果图。`,
      lines: [
        { speaker: 'Nvidya 销售', text: published.length ? '下款模型不打算做大一点？现在买设备正合适。' : '现在买设备，等模型做大就不用排队了。' },
        { speaker: '老板', text: '设备买回来，每期电费和运行费怎么算？' },
        { speaker: '小满', text: '最近一张账单在下面，您先看看。' },
      ],
      facts: [
        { label: '现在的设备采购单价', value: `${cash(price(state))} / 单位` },
        { label: '你公司最近的账单', value: lastBill ? `第 ${lastBill.day} 日，收入 ${cash(lastBill.income)}，工资和运行费 ${cash(lastBill.salaries + lastBill.running)}` : '还没有账单' },
      ],
      outro: '老板关掉效果图，打开了账单。',
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

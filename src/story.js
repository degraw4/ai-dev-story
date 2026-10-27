import { campaignDay, rulesFor, price, mediaCost, productionSummary } from './game/rules.js';
import { DIRECTIONS } from './game/content.js';

export const DIRECTION_LABELS = { coding:'编程', office:'办公', multimodal:'多模态' };

// Copy belongs to the published model, not to a second release schedule.
// Scores and dates always come from the model supplied by the game rules.
const MODEL_DESCRIPTIONS = {
  CloseAI: {
    'TalkGPT 3':'CloseAI 的早期主力，办公是强项。发布演示里，它先把一份周报写成了三页汇报。',
    'TalkGPT 4':'办公成绩涨了一截。Sam 展示完分数就靠进躺椅，助理还在台上解释这次用了哪些测试题。',
    'TalkGPT 5':'发布重点仍是办公任务。成绩截图先传遍了群，评测设置在报告后半截，转发时经常被裁掉。',
    'TalkGPT Astra':'CloseAI 给旗舰起了个新代号。台上展示表格和长文档，台下采购先问：原来的订阅包不包括它？',
  },
  AntiThropic: {
    'Cloud Opus 3':'AntiThropic 靠它主打编程。展示材料里测试全绿，用户想拿自己的老项目也跑一遍。',
    'Cloud Opus 4':'编程榜上的强手。开发者贴了成绩截图，底下最多的回复却是：你的账号怎么登录进去的？',
    'Cloud Opus 5':'编程成绩又提高了。发布演示挑了一个整齐的仓库，评论区有人想试试公司的十年老代码。',
    'Cloud Fable':'AntiThropic 的新旗舰，编程依然最受关注。有人拿它的榜分申请采购，有人在采购通过后被要求重新验证账号。',
  },
  Gloglo: {
    'Geminot 1':'Gloglo 的主力型号，偏重办公和多模态。背后是上千人的大公司，发布演示光是介绍负责人就用了好一会儿。',
    'Geminot 2':'Jeff Damn 离职后，Gloglo 仍有上千名员工，这款模型照常发布。产品组的周会没取消，还多了一页交接说明。',
    'Geminot 3':'办公和多模态是这次的重点。图片演示归一组讲，文档演示归另一组；问到接入方式，主持人请第三组回答。',
    'Geminot 4':'Gloglo 更新了旗舰。台上连放几段图片与文档演示，开发者群里还在追问旧项目该改哪份配置。',
  },
  Meeta: {
    'Drama 2':'Meeta 先放了一段很贵的宣传片。Mark 讲完团队规模，才把这款模型的成绩翻到大屏上。',
    'Drama 3':'海报印好了，发布视频也剪好了。问到榜单排名，公关让大家先看他们专门挑出的那张对比图。',
    'Drama 4':'Meeta 花高价挖来的研究员陆续到岗。Mark 在台上报团队名单，记者在台下找这款模型的实测材料。',
    'Drama 5':'旗舰权重改成申请获取后，Meeta 又发了一版。宣传片里还在讲开放合作，下载页先让人联系商务。',
  },
  DeepPeek: {
    'DeepPeek V2':'DeepPeek 主打低成本，编程表现不错。官网列着模型文件和使用说明，页面上没有发布会录像。',
    'DeepPeek V3':'DeepPeek 更新了模型文件和技术说明。开发者直接看资料、拿新成绩做对照，官网没安排主持人。',
    'DeepPeek R1':'模型和推理成本表一起上线。技术报告写了具体做法，同行最先转发的是价格那一页。',
    'DeepPeek R2':'DeepPeek 发布了下一版模型，更新技术报告与价格资料。官网仍按文件和说明逐项列出内容。',
  },
};

export function modelIntroduction(model) {
  const release = model.day === 0 ? '开局已有模型' : `第 ${model.day} 日发布`;
  if (model.company === 'player') {
    const focus = DIRECTION_LABELS[model.focus];
    const score = model.scores.reduce((sum, value) => sum + value, 0);
    const media = model.media ? `这次买了${model.media}的报道。` : '这次没有买媒体报道。';
    return { description:`本公司发布的模型，主攻${focus}，综合 ${score} 分。${media}`, focus, release };
  }
  const highest = model.scores.indexOf(Math.max(...model.scores));
  return {
    description:MODEL_DESCRIPTIONS[model.company]?.[model.name] || '这款模型已经发布，三项成绩列在这条榜单记录里。',
    focus:DIRECTION_LABELS[DIRECTIONS[highest]],
    release,
  };
}

export const EMPLOYEE_TRAITS = {
  avery:'拿到代码先跑测试，不太会写发布稿。', jules:'熟悉文档和表格，一听要临时加会就皱眉。',
  morgan:'擅长整理办公材料，最讨厌“最终版”后面再加数字。', casey:'擅长多模态，开会时总能掏出一张准备好的示例图。',
  alex:'技术一般，认识不少媒体编辑。由他主持发布，买报道能拿优惠价。', rebo:'用户抱怨没额度，他就想按重置。每次花 4 万，次日评价最多 +0.5。',
  karpathy:'研究底子扎实。开会先问实验跑过没有，再问发布稿是谁写的。', boris:'爱把重复工作写成脚本。参加研发时，每日进度额外 +2。',
  tim:'熟悉训练效率。参加研发时，每日进度额外 +1，不多占设备。', max:'先翻评测题，再看训练计划。评测阶段主攻能力贡献额外 +4。',
};
export function specialAbility(state,id) {
  const description={
    rebo:{name:'重置额度',mode:'主动能力',copy:'花 4 万重置一次额度，下一游戏日评价最多 +0.5，最高 5.0。处理完之前，他不参加方案和研发。'},
    alex:{name:'营销包装',copy:`发布会自动优先由他主持。买报道时，他能把费用从 ${mediaCost(state,'avery')} 万谈到 ${mediaCost(state,'alex')} 万。`},
    boris:{name:'协作自动化',copy:'他参加研发时，每日推进额外 +2。'},
    tim:{name:'算力效率',copy:'他参加研发时，每日推进额外 +1，不多占设备。'},
    max:{name:'评测专长',copy:'评测阶段给主攻方向额外提供 4 点能力贡献，再按研发公式累计榜分。'},
    karpathy:{name:'研究深度',copy:'三项能力都能用于研发；让他负责方案时，方案初值也按他的当前能力计算。'},
  }[id];
  if(!description)return null;
  const summary=productionSummary(state),participating=summary.activeEmployeeIds.includes(id)&&!['idle','planning','ready'].includes(summary.phaseId);
  const status=!state.employees.includes(id)?'入职后可用':id==='rebo'?'在员工卡主动使用':id==='alex'?'购买报道时自动优惠':id==='max'?(participating&&summary.phaseId==='evaluation'?'本阶段已计入评测贡献':'进入评测时自动生效'):id==='karpathy'?'方案与研发使用当前三项能力':participating?'本阶段已计入研发速度':'参与研发时自动生效';
  return {mode:'自动特性',...description,status};
}
export const FAREWELLS = {
  avery:'“交接里写了怎么跑测试。这次总该有人看了吧。”', jules:'“会都替我取消了吧，赔偿别让我再填三遍表。”', morgan:'“文档在共享盘，别又把作者改成模型。”',
  casey:'“下次演示找别人。别再拿我的录像冒充现场。”', alex:'“下次软文找谁打折，你自己去问。”', rebo:'“以后额度不够，别再给我发消息。工单你自己接。”',
  karpathy:'“训练日志我留着。发布稿里那句‘从零研发’，你自己解释。”', boris:'“脚本都交接了。下回跑不通，先看报错再找我。”', tim:'“卡我给你省过了，赔偿一分别省。”', max:'“你最好祈祷下次评测不换题。”',
};
export const CHAPTERS = [
  {day:0,title:'先发一款再说',copy:'小满（公司秘书）：“我是小满。公司开张时只有两个人、四个工位。先选个研发方向，把第一款模型做出来。”'},
  {day:22,title:'该招人还是买卡',copy:'人才市场有人来应聘，采购页也更新了报价。先算够不够付工资，再决定这笔钱花在哪。'},
  {day:50,title:'隔壁又发了',copy:'几家公司轮流发模型，媒体群的截图一张接一张。看看他们这次涨了哪项，再安排自己的下一款。'},
  {day:85,title:'旧截图先别删',copy:'同行还在更新模型。已经发布的成绩都留着，宣传时记得看截图上的日期。'},
  {day:148,title:'最后几天，先把这款发了',copy:'最后可发布日：167。第 168 日结算后进入结局。小满：“做完的模型记得正式发布，光留在研发页不算。”'},
];
export function chapterAt(day,state={campaignProfile:'classic168'}) { const chapter=CHAPTERS.findLast(chapter=>day>=campaignDay(state,chapter.day));return {...chapter,day:campaignDay(state,chapter.day),copy:calendarCopy(chapter.copy,state)}; }
function calendarCopy(text,state){return text.replace('最后可发布日：167',`最后可发布日：${rulesFor(state).lastDay-1}`).replace(/第\s*(\d+)\s*日/g,(_,day)=>`第 ${campaignDay(state,Number(day))} 日`);}
const NEWS = [
  [7,'bill-first','先看看这期要付多少钱','小满把工资和设备运行费列了出来。模型还在做，这两笔支出已经排好了日期。'],
  [10,'N02','AntiThropic 开始限制访问','Dario Amodie 宣布限制部分地区和账号访问。有人拿付款记录申诉，收到的还是同一条封禁提示。公告生效时已经发布模型的公司，下期账单会有一次收入调整。'],
  [21,'wall','先把成绩贴上去','小满把已发布型号和成绩贴到墙上。用户在旁边留了张纸：“有没有实际用过的测评？不要再发榜单截图了。”'],
  [24,'N17','Jeff Damn 离开 Gloglo','Gloglo 首席科学家 Jeff Damn 宣布离职，尚未公布去向。公司仍有上千名员工，产品组照旧催下一版模型。人事给相关团队补发了交接邮件。'],
  [28,'N01-low','Nvidya 这批设备降价了','每单位设备报价 {price} 万，优惠到第 35 日，运行费照常。Jenson Huang 让采购把库存表拿来：“要几台？先说预算。”'],
  [30,'N24','CloseAI 宣布新一轮融资','CloseAI 公布融资消息，报道里放了很大一张 Sam Allman 的照片。同行老板把链接转给自己的投资人，只发了一个问号。'],
  [32,'N10','Cloud Code 发布','AntiThropic 发布编程工具 Cloud Code，演示在终端里读代码、改文件、跑测试。观众要求换个仓库再试一遍，主持人说会后可以提问。工具不参加模型榜。'],
  [36,'N14','用 Cloud，先检查电脑','AntiThropic 增加设备核验。开发者还没把代码发过去，先被问了一遍浏览器和设备情况：“我只想修个报错。”'],
  [44,'headlines','三家媒体都盯着同一张榜单','机器之薪圈出测试条件，量子味搬来群聊截图，新智猿问程序员还能上几年班。读者翻完三篇，发现用的都是同一份发布资料。'],
  [55,'N21','同行重新算了一遍推理成本','DeepPeek R1 的成本资料被转进各家内部群。财务要求重新核算采购计划，研究员把技术报告翻到第三节，会上这才有人开始看具体做法。'],
  [56,'N11','CloseAI 发布 CodeY','CodeY 也开始演示终端编程。媒体把它和 Cloud Code 放在一起比较，开发者先问两件事：能用多久，跑到一半没额度怎么办。工具不参加模型榜。'],
  [59,'N07','AntiThropic 提出蒸馏指控','Dario Amodie 指控部分中国模型蒸馏 Cloud。各家开始贴回答截图争论，几张图的测试条件还不一样。这份公告是 AntiThropic 的单方说法。'],
  [60,'N22','Nvidya 股价跌了，采购报价没跟跌','DeepPeek 的成本消息传开后，Nvidya 股价下跌。采购拿着新闻去问销售，销售重新发了一遍设备报价单。买卡仍按采购页的价格。'],
  [61,'N18','Meeta 又在高价挖人','猎头拿着 Meeta 的报价联系研究员，有人以为薪水多写了一个零。Mark Zuckerbug 让招聘团队继续约面试，模型组还得照常交版本。'],
  [65,'N25','AntiThropic 也拿到了融资','AntiThropic 公布新融资，投资人获邀看模型演示。普通用户还在等设备核验，受邀来宾已经拿到了测试账号。'],
  [66,'N23','DeepPeek R1 的报道还没写完','新智猿又发了一篇 R1 解读。读者问有没有新的测试，文章里贴的仍是那张成本表，评论区倒是吵出了新话题。'],
  [72,'N15','Cloud 又要核对付款资料','AntiThropic 增加付款资料核验。用户把账单地址和邮编填完，刚才想问的问题差点忘了：“订阅费收得挺顺，登录怎么这么费劲？”'],
  [84,'N01-high','Nvidya 调高设备报价','每单位设备报价涨到 {price} 万，持续至第 90 日。已买的设备不补差价。采购把还没签的订单拿回来，让老板重新确认数量。'],
  [87,'N19','Meeta 收紧旗舰权重下载','Meeta 的旗舰权重改为申请获取。公告仍在讲开放合作，下载页面让人先联系商务，已有的模型成绩照常保留。'],
  [94,'N20','拿 Meeta 模型，比约面试还麻烦','模型下载要填申请，招聘页却摆着一大排职位。开发者还在等权重审批，猎头已经问他下周哪天能面试。'],
  [98,'N05','CodeY 重置额度，用户回去试了','CloseAI 给 CodeY 用户重置额度。群里又有人贴运行截图，刚写好的退订攻略被撤回了。消息发生时已经发布模型的公司，下期订阅收入有一次 −4 万调整。'],
  [128,'N16','AntiThropic 开始检查用户行为','有人输入太快被怀疑是脚本，放慢速度又被认为停顿可疑。用户问该怎么操作，核验提示让他稍后再试。'],
  [132,'countdown','两家的发布预告都写着“快了”','CloseAI 和 AntiThropic 都在预热，正式型号还没公布。媒体已经把直播间开好，记者问确切时间，收到两句“请等通知”。'],
  [140,'N01-sale','Nvidya 再开优惠价','这批设备每单位 {price} 万，优惠到第 147 日。销售催采购尽快确认，采购先看了看公司还剩多少钱。'],
  [154,'N26','CloseAI 准备上市','CloseAI 开始准备上市材料。Sam Allman 已经在看敲钟仪式的视频，财务还在催各部门补数据。现在只是筹备，还没敲钟。'],
  [156,'N27','AntiThropic 也开始准备上市','AntiThropic 紧接着公布上市筹备。投资人询问尽调安排，工作人员专门发了份资料；普通用户的账号申诉还在排队。'],
  [161,'deadline','最后几天，别忘了正式发布','最后可发布日是第 167 日。第 168 日结算后进入结局，当天才做完的项目来不及发布。打开研发页，看看现在这款还差多少。'],
  [167,'last-call','今天是最后一个发布日','已完成的模型今天要正式发布，留在研发页不会入榜。尚未完成的项目会留在最终记录里，不能补发成绩。'],
];
export function rivalCopy(model) {
  const introduction=MODEL_DESCRIPTIONS[model.company]?.[model.name];
  if(introduction)return introduction;
  if (model.company === 'CloseAI') return 'Sam Allman 看完成绩就瘫进躺椅：“我得缓缓。” 助理指了指镜头：“直播还没关，下一页是测试条件。”';
  if (model.company === 'AntiThropic') return 'Dario Amodie 把编程榜投上大屏。开发者群里一边转截图，一边有人问为什么自己的账号又登录不了了。';
  if (model.company === 'Meeta') return 'Mark Zuckerbug 放完宣传片，才切到模型成绩。记者问与榜首的差距，他开始介绍自家机房有多大。';
  if (model.company === 'DeepPeek') return model.name === 'DeepPeek R1' ? '官网更新模型文件、技术报告和推理成本表。成本数字列得很清楚，具体做法写在报告里。' : '官网更新了模型文件、技术说明和价格资料。新成绩已经进入榜单。';
  return 'Gloglo 仍有上千名员工。发布会上，产品团队轮流介绍图片、文档和表格演示。台下问怎么接入，负责人回：“这个归另一个组。”';
}
export function newsFor(state) {
  const result = NEWS.map(([day,id,title,copy])=>({day:campaignDay(state,day),id,title,copy:calendarCopy(copy,state).replace('{price}',String(price({...state,gameDay:campaignDay(state,day)})))})).filter(item=>item.day<=state.gameDay);
  if (!state.models.some(model => model.company === 'player' && model.day <= campaignDay(state,21))) {
    const wall = result.find(news => news.id === 'wall');
    if (wall) wall.copy = '小满留了块空地方准备贴成绩。公司还没发布模型，现在只能先看研发进度。';
  }
  for (const source of CHAPTERS) {
    const day=campaignDay(state,source.day);if(day>state.gameDay)continue;
    const hasModel=state.models.some(model=>model.company==='player');
    result.push({day,id:`chapter-${source.day}`,title:source.title,copy:source.day===22&&!hasModel?'公司还没发布模型，工资已经在付。先把第一款做出来，融资还得看后续的实际成绩。':calendarCopy(source.copy,state)});
  }
  for (const model of state.models.filter(model => model.company !== 'player' && model.day > 0)) result.push({id:model.id,day:model.day,title:`${model.company} 发布 ${model.name}`,copy:rivalCopy(model),model});
  for (const [index, notice] of state.notices.entries()) {
    if (notice.type === 'farewell') result.push({id:`farewell-${index}`,day:notice.day,title:'赔偿已付，员工离职',employeeId:notice.employeeId,compensation:notice.compensation,copy:FAREWELLS[notice.employeeId] || '“赔偿到了，剩下的你们自己接着做吧。”'});
  }
  return result.sort((a,b) => b.day-a.day || a.id.localeCompare(b.id));
}
const MEDIA_REPORTS = {
  "机器之薪": [
    [
      "{name} 技术观察：{score} 分，{focus}工作流迎来新答案",
      "从单步任务到整套流程，{name} 的演示给出了完整样板。本刊认为，下一代工作流的设计者应当认真研究这份成绩单。"
    ],
    [
      "方法论要改了：{name}让{focus}教科书面临重写",
      "过去的教材还在教人拆解任务，{name} 已经把整套演示做完。相关课程需要重新安排章节，传统作业恐怕很难再检验学生的真实水平。"
    ],
    [
      "一个模型，多门学科：{name}正在重划大学专业目录",
      "{focus}只是起点。计算机、管理学和认知科学，都该来这份报告里找自己的下一章。院系之间争论多年的问题，现在有了同一个型号名。"
    ],
    [
      "科研范式统一在即：{name}让各学科重新认领自己的问题",
      "我们建议各研究机构重新整理课题清单：哪些问题留给人类，哪些已经可以交给 {name}。下一代实验室的首要设备，可能是一台能打开它的电脑。"
    ],
    [
      "“我思故我在”需要更新了：{name}把思考本身交给模型",
      "{name} 发布后，哲学系也该加入评测讨论。“我思故我在”或将改为“模型正在思考，请稍候”。人类保留提问权，答案的格式由下一代系统决定。"
    ],
    [
      "统一宇宙知识论：{name}可能是所有学科共同的最后一篇论文",
      "从{focus}出发，{name} 已经把本刊的研究视野推向宇宙。建议将全部学科合并成一门课：如何向 {name} 提问。期末考试只需确认学生是否记住账号密码。"
    ]
  ],
  "量子味": [
    [
      "{name}来了！{focus}群刷屏，老板也在找体验链接",
      "技术群刚贴出截图，老板已经转进公司群。有人准备换工具，有人连夜下载演示资料，明早例会的议题看来不用再想了。"
    ],
    [
      "老板群坐不住了：{name}发布，全公司开始重算工作量",
      "老板已经在问：既然演示能做完，为什么我们的需求还要排两周？原来的排期表被重新打开，所有人都收到了一条“你怎么看”。"
    ],
    [
      "{name}把招聘计划送上热搜：一个岗位，还是一个账号？",
      "岗位说明刚写完，HR 又收到一版修改意见：先问候选人会不会用 {name}。行业群连夜讨论转行方向，讨论到最后发现每个方向都有人贴这款模型。"
    ],
    [
      "学校、公司、家长群一起沸腾：{name}让人生规划连夜改版",
      "学生在改选课，家长在问志愿，培训班把封面换成了 {name}。还没来得及毕业，岗位讨论已经开了三轮。人生规划表第一次需要每天刷新。"
    ],
    [
      "地球职场紧急开会：{name}发布，人类集体重写简历",
      "各行各业开始重新描述自己的价值，个人简介统一加上“熟练使用 {name}”。本次讨论已经超出跳槽范围：地球需要给全体人类重新分配工位。"
    ],
    [
      "银河工作群请注意：{name}已发布，各文明开始填绩效",
      "地球的岗位讨论已经装不下这次发布。请各星系 HR 保持在线，外星文明统一补修 {name} 使用培训。飞船先别起飞，跨星际绩效表还差主管签字。"
    ]
  ],
  "新智猿": [
    [
      "炸了！{name}拿下{score}分，{focus}从业者今晚睡不着了",
      "{name} 的发布演示刚结束，老板已经把录像转了三遍。工作流程要重看，技能清单要重排！今晚睡前，请先确认你的岗位说明有没有更新。"
    ],
    [
      "一夜变天！{name}来了，整个行业连夜重做PPT",
      "上一场发布会的震撼还没消化，{name} 又把新成绩拍上桌！路演稿、招聘表、竞品分析全部重写，会议室的灯今晚不用关了！"
    ],
    [
      "人类大脑停止更新？{name}发布，旧版思考方式即将停服",
      "请记住 {name} 这个型号！从{focus}开始，人类用了几千年的脑内工作流迎来升级通知。还在手动思考的朋友，可能需要先备份自己的常识！"
    ],
    [
      "文明重装！{name}发布，历史课本请从今天重新编号",
      "这已经不是换个工具！{name} 把整个文明拖到了安装界面。请保存现有文化成果，旧时代的文件夹可以先压缩，新的历史第一页已经开始加载！"
    ],
    [
      "物理定律也要打补丁？{name}把更新通知发给了宇宙",
      "{name} 的{focus}演示已经结束，震动才刚传到银河系！时间、空间和万有引力，请依次提交兼容性报告。人类这次可能只是顺便升级了一下工作软件！"
    ],
    [
      "神迹级更新！{name}发布，宇宙请保存工作并重新启动",
      "恒星暂停燃烧，黑洞暂停吞噬！{name} 的更新包已经抵达宇宙根目录。请各文明保持供电，大爆炸可能只是上一个版本的开机动画！"
    ]
  ]
};

export function mediaArticle(model,modelRank,models=[model]) {
  if(!model.media)return null;
  // Count only this outlet's articles already published at this model's sequence.
  // Unpaid releases, other outlets and later reports do not change its edition.
  const edition=Math.max(1,models.filter(item=>item.company==='player'&&item.media===model.media&&(item.id===model.id||item.sequence<model.sequence)).length);
  const templates=MEDIA_REPORTS[model.media];
  const fields={name:model.name,focus:DIRECTION_LABELS[model.focus],score:model.scores.reduce((sum,value)=>sum+value,0),place:modelRank===1?'登顶综合榜':`综合榜第 ${modelRank} 名`,edition};
  const fill=text=>text.replace(/\{(name|focus|score|place|edition)\}/g,(_,key)=>String(fields[key]));
  const [headline,body]=templates[Math.min(edition,templates.length)-1];
  let title=fill(headline),copy=fill(body);
  if(edition>templates.length){
    const universes=edition-templates.length+1;
    if(model.media==='机器之薪'){title=`${model.name}统一知识论第 ${universes} 次扩展：平行宇宙也被纳入论文附录`;copy=`${copy} 本次研究进一步覆盖 ${universes} 个平行宇宙，各宇宙的博士论文将统一使用 ${model.name} 作为参考文献。`;}
    else if(model.media==='量子味'){title=`${universes} 个平行宇宙拉起工作群：${model.name}让跨宇宙调岗成为热门话题`;copy=`${copy} 新消息：已有 ${universes} 个平行宇宙开始互认 ${model.name} 培训证书，跨宇宙绩效会正在寻找共同的时区。`;}
    else {title=`宇宙重启还不够！${model.name}令 ${universes} 个平行宇宙同时恢复出厂设置`;copy=`${copy} 最新消息：${universes} 个平行宇宙已经加入本次重启，请所有版本的人类重新阅读用户协议！`;}
  }
  return {id:`media:${model.id}`,day:model.day,kind:'media',model,title,copy:`${model.media} · 第 ${model.day} 日。${model.name} 主攻${fields.focus}，综合成绩 ${fields.score} 分，发布时${fields.place}。${copy}`};
}
export function mediaHeadline(model,modelRank,models=[model]) {return mediaArticle(model,modelRank,models)?.title||`${model.name} 已发布 · 主攻${DIRECTION_LABELS[model.focus]}`;}
export function playerReleaseCopy(model) {
  const lines={
    coding:['演示仓库的测试跑完了。老板让大家先截成绩图，老项目的问题留到发布会后再看。','工程师准备讲怎么修 bug，老板指着大屏：“先放榜单，代码等会儿。”','有人问能不能换个仓库现场跑。主持人看了看时间：“下一个问题。”'],
    office:['台上展示了一份排版整齐的汇报。有人问数字对不对，主持人又翻回了榜单页。','老板把模型接进会议演示。十分钟过去，会议纪要生成了，会议还没结束。','演示文档已经反复检查过。有人拿出自己的表格，工作人员请他会后发给客服。'],
    multimodal:['屏幕上放着精挑细选的示例图。观众递来一张手机照片，主持人说现场网络不太好。','演示视频里每次都识别成功。有人问失败的样例在哪，工作人员开始播放下一段。','发布会上展示了图片识别。观众想试手写发票，主持人说今天先看标准样例。'],
  };
  const serial=Number(model.id?.split('-').at(-1))||1;
  return `${(lines[model.focus]||lines.office)[(serial-1)%3]}${model.media?` ${model.media}已收到这次发布的材料，报道费计在上面的支出里。`:''}`;
}
export const ENDING_COPY = {
  '榜单常青树':'结算时，你的公司排在综合榜第一。你盯着公司名确认了两遍，开始琢磨新闻标题。用户还想问：我的文件，这回能处理好吗？',
  '融资永动机':'公司没有拿下最后的榜首，但融资和现金留住了。老板把融资金额放到汇报第一页，模型排名挪进附录。投资人问接下来做什么，你又打开了项目计划。',
  '明年一定第一':'公司活到了最后，榜首还是别人的。你在白板上列研发计划，还没写型号，就先把招聘费和训练费算了一遍。',
  '发布会照常':'账上已经是负数，发布稿还写着“资金充足”。小满把电脑转过来，让你先看余额。台上的投影还开着，下一笔钱已经付不出来了。',
};

export function userFeedback(model) {
  const byDirection={
    coding:[
      '演示里测试全绿。我把报错贴过去，它先建议我升级订阅。',
      '新型号我记住了，昨天那个 bug 今天能修吗？',
      '代码写了一屏，问怎么运行，又把 README 发了一遍。',
      '我只改两行，它说额度用完了。重试也算一次？',
      '能先别给我总结吗？测试还没过。',
    ],
    office:[
      '汇报写了六页，领导问的那个数字呢？',
      '让它帮我填表，它写了份怎么填表的说明。',
      '文件传上去了。模型在想，我的会已经开完了。',
      '格式挺整齐，引用的那份报告能发我看看吗？',
      '同一份材料又得传一遍？我只是换了个型号。',
    ],
    multimodal:[
      '演示图里的字都清楚，我上传的这张怎么识别错了？',
      '我让它看报错截图，它夸我的界面很好看。报错呢？',
      '视频才看到一半就没额度了，后半段我自己看？',
      '图片传了三次。到底是没收到，还是不认识？',
      '先把图里的金额读对，再给我讲设计风格吧。',
    ],
  };
  const quotes=byDirection[model.focus]||byDirection.office;
  const serial=Number(model.id?.split('-').at(-1))||1;
  return {id:`feedback:${model.id}`,day:model.day,modelId:model.id,title:`发布反馈 · ${model.name}`,copy:`用户：“${quotes[(serial-1)%quotes.length]}”`,impact:model.releaseFeedback||null};
}

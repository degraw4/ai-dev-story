import { campaignDay, rulesFor, price, mediaCost, productionSummary } from './game/rules.js';
import { DIRECTIONS } from './game/content.js';

export const DIRECTION_LABELS = { coding:'编程', office:'办公', multimodal:'多模态' };

// Copy belongs to the published model, not to a second release schedule.
// Scores and dates always come from the model supplied by the game rules.
const MODEL_DESCRIPTIONS = {
  CloseAI: {
    'TalkGPT 3':'CloseAI 的早期主力，办公是强项。演示中，Sam 让它写一封邮件，现场有人已经开始问能不能接进公司的工作流。',
    'TalkGPT 4':'办公成绩涨了一截。Sam 演示完靠进椅子：“你们刚才看到了吗？”台下的记者还在找回放按钮。',
    'TalkGPT 5':'发布会开始前，Sam 连发了几条意味深长的预告。等到正式演示，观众才看到它处理长文档和表格。',
    'TalkGPT Astra':'CloseAI 给旗舰起了新代号。台上刚展示完办公任务，台下采购就问：原来的订阅包包括这个型号吗？',
  },
  AntiThropic: {
    'Cloud Opus 3':'AntiThropic 用它主打编程。演示里的测试全部通过，开发者打算拿公司项目再试一次。',
    'Cloud Opus 4':'编程榜上的强手。开发者发帖分享使用体验，评论里有人追问：“你的账号是怎么注册成功的？”',
    'Cloud Opus 5':'编程成绩继续提高。有人试着让它处理十年老项目，刚跑到一半，屏幕上弹出了额度提示。',
    'Cloud Fable':'AntiThropic 的新旗舰，编程依然是重点。团队刚批完采购申请，负责人登录时又被要求验证设备。',
  },
  Gloglo: {
    'Geminot 1':'Gloglo 的主力型号，偏重办公和多模态。发布会上，搜索、邮箱和云服务团队分别展示了接入计划。',
    'Geminot 2':'Jeff Damn 离职后，Gloglo 的大团队继续推进发布。邀请函照常发出，只是主持人的名字换了。',
    'Geminot 3':'图片演示由一组介绍，文档演示由另一组介绍。记者问什么时候接入现有产品，主持人请第三组来回答。',
    'Geminot 4':'Gloglo 更新了旗舰，图片和文档演示接连上台。开发者看完发布会，又打开三份产品文档确认接入方式。',
  },
  Meeta: {
    'Drama 2':'Meeta 发布了新模型。Mark 先介绍投入了多少显卡，又展示了一段制作精良的宣传片。',
    'Drama 3':'发布视频和户外广告同时上线。记者问模型能做什么，公关先递来一份印着团队合照的资料。',
    'Drama 4':'高价挖来的研究员陆续到岗。Mark 在台上逐个介绍新成员，台下记者翻着资料找模型的实测结果。',
    'Drama 5':'Meeta 又发布了一版旗舰。宣传片里继续讲开放合作，开发者打开下载页，看到的是申请表。',
  },
  DeepPeek: {
    'DeepPeek V2':'DeepPeek 主打低成本，编程表现不错。官网同时列出了模型文件、使用说明和价格。',
    'DeepPeek V3':'DeepPeek 更新了模型文件和技术说明。开发者下载后跑起测试，也顺手算了算使用成本。',
    'DeepPeek R1':'模型和推理成本表一起上线。技术报告写了具体做法，同行最先转发的是价格那一页。',
    'DeepPeek R2':'DeepPeek 发布下一版模型，同步更新技术报告和价格资料。同行收到链接后，先点开了价格页。',
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
  [7,'bill-first','先看看这期要付多少钱','小满列出这期工资和设备运行费：“研发还要继续，账单也记得留钱。”'],
  [10,'N02','AntiThropic 开始限制部分账号访问','Dario Amodie 宣布限制部分地区和账号访问。有人收到停用通知，当天订阅费照常扣了；申诉页面要求先登录，结果又回到了停用通知。公告生效时已经发布模型的公司，下期账单会有一次收入调整。'],
  [21,'wall','先把成绩贴上去','小满把已发布型号和成绩贴到墙上。旁边多了一张用户纸条：“表格里的日期又填错了，什么时候修？”'],
  [24,'N17','Jeff Damn 离开 Gloglo','Gloglo 首席科学家 Jeff Damn 宣布离职。告别邮件发出后，团队群刷了几百条祝福；公司仍有上千名员工，下一场模型发布会按计划准备，只是会议邀请里的主持人一栏暂时空着。'],
  [28,'N01-low','Nvidya 这批设备降价了','每单位设备报价 {price} 万，优惠到第 35 日，运行费照常。Jenson Huang 对采购说：“现在下单最划算，要不要多买几台？”'],
  [30,'N24','CloseAI 宣布新一轮融资','CloseAI 公布新一轮融资。同行老板把新闻链接转给自己的投资人，只发了一个问号。'],
  [32,'N10','Cloud Code 进了终端','AntiThropic 发布编程工具 Cloud Code。演示里，它读代码、改文件、跑完测试；开发者更关心自己的账号能不能登录，额度够跑几次。工具不参加模型榜。'],
  [36,'N14','用 Cloud，先检查设备','AntiThropic 增加设备核验。开发者打开 Cloud 准备修报错，先要确认浏览器和设备信息；核验页面加载时，报错窗口还在旁边等着。'],
  [44,'headlines','三家媒体报道同一场发布会','机器之薪写“评测条件值得注意”，量子味问“老板今天又转了什么”，新智猿的标题则是“刚刚！AI 圈又变天了”。三篇文章引用的是同一份发布资料。'],
  [55,'N21','DeepPeek 更新成本资料，同行重算预算','DeepPeek R1 的技术报告和成本资料上线。链接传进同行群后，财务重新打开预算表，研究员也开始翻技术报告。'],
  [56,'N11','CloseAI 发布 CodeY','CodeY 也开始演示终端编程。媒体把它和 Cloud Code 放在一起比较，开发者先问两件事：能用多久，跑到一半没额度怎么办。工具不参加模型榜。'],
  [59,'N07','AntiThropic 提出蒸馏指控','Dario Amodie 指控部分中国模型蒸馏 Cloud。这是 AntiThropic 的单方说法；消息传开后，各家群里开始比较截图，有人提醒测试条件并不相同。'],
  [60,'N22','Nvidya 股价跌了，设备报价没跟跌','DeepPeek 的成本消息传开后，Nvidya 股价下跌。采购拿着新闻问显卡能不能降价，销售回了句：“您要几张？”买卡仍按采购页的价格。'],
  [61,'N18','Meeta 又开始高价挖人','猎头发来一份 Meeta 的报价，研究员数了两遍数字。第三遍还没数完，自己公司的老板已经打来电话：“你先别急着回复。”'],
  [65,'N25','AntiThropic 也拿到了融资','AntiThropic 公布新融资，投资人获邀看模型演示。普通用户还在等设备核验，受邀来宾已经拿到了测试账号。'],
  [66,'N23','DeepPeek R1 的成本表还在刷屏','新智猿又发了一篇 R1 解读。读者从头翻到尾，发现几家媒体引用的还是同一页成本表，标题倒是一个比一个响。'],
  [72,'N15','Cloud 又要核对付款资料','AntiThropic 增加付款资料核验。用户的订阅费已经扣了，账单地址和邮编还要再填一遍；提交后，页面提示等待审核。'],
  [84,'N01-high','Nvidya 调高设备报价','每单位设备报价涨到 {price} 万，持续至第 90 日。已买的设备不补差价。采购把还没签的订单拿回来，让老板重新确认数量。'],
  [87,'N19','Meeta 收紧旗舰权重下载','Meeta 宣布旗舰权重改为申请获取。开发者提交表单后收到自动回复；此前发布的模型成绩照常保留。'],
  [94,'N20','Meeta 的下载申请还在排队','开发者还在等旗舰权重审批，Meeta 的猎头先发来私信：“方便聊聊新机会吗？”'],
  [98,'N05','CodeY 重置额度，开发者又回来了','CloseAI 给 CodeY 用户重置额度。早上还在群里说“今天就退订”的用户，下午贴出成功运行的截图。有人问退订攻略还发不发，他说：“再等等。”消息发生时已经发布模型的公司，下期订阅收入有一次 −4 万调整。'],
  [128,'N16','AntiThropic 开始检查用户行为','有人输入太快，系统提示操作异常；他放慢速度重新输入，系统仍提示操作异常。打开申诉页，上面写着：请先登录。'],
  [132,'countdown','两家都在打听对方的发布时间','CloseAI 和 AntiThropic 都在预热，正式型号尚未公布。两家的公关分别问记者：“对面定几点？”记者打开两个直播间，先把外卖点了。'],
  [140,'N01-sale','Nvidya 再开优惠价','这批设备每单位 {price} 万，优惠到第 147 日。销售建议趁促销扩机房，小满提醒采购：设备买回来之后，运行费还得照付。'],
  [154,'N26','CloseAI 准备上市','CloseAI 开始准备上市材料。Sam Allman 在看敲钟仪式的视频，财务正催各部门交数据；上市仍在筹备中。'],
  [156,'N27','AntiThropic 也开始准备上市','AntiThropic 紧接着公布上市筹备。投资人询问尽调安排，工作人员专门发了份资料；普通用户的账号申诉还在排队。'],
  [161,'deadline','最后几天，别忘了正式发布','最后可发布日是第 167 日。第 168 日结算后进入结局，当天才做完的项目来不及发布。打开研发页，看看现在这款还差多少。'],
  [167,'last-call','今天是最后一个发布日','已完成的模型今天要正式发布，留在研发页不会入榜。尚未完成的项目会留在最终记录里，不能补发成绩。'],
];
export function rivalCopy(model) {
  const introduction=MODEL_DESCRIPTIONS[model.company]?.[model.name];
  if(introduction)return introduction;
  if (model.company === 'CloseAI') return 'Sam Allman 看完演示靠进椅子：“你们刚才看到了吗？”台下的记者已经开始找回放。';
  if (model.company === 'AntiThropic') return 'Dario Amodie 展示了新模型的编程表现。开发者打开账号准备试用，页面要求重新验证设备。';
  if (model.company === 'Meeta') return 'Mark Zuckerbug 放完宣传片，开始介绍研究团队。记者翻开资料，继续寻找模型的实测结果。';
  if (model.company === 'DeepPeek') return '官网更新了模型文件、技术说明和价格资料。新成绩已经进入榜单。';
  return 'Gloglo 的产品团队分别介绍了图片、文档和表格演示。台下问什么时候接入现有产品，主持人请另一组回答。';
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
    ["{name}发布：综合成绩{score}分，我们看了它的测试条件", "{name} 公开了演示和评测结果，发布时{place}。研究群里有人先转了榜单截图，也有人问：这次的测试条件在哪里？"],
    ["刷榜背后：{name}的{focus}成绩到底说明了什么？", "发布材料列出了{focus}方向的几个例题。研究者翻到测试条件，发现自己还需要对照题目和设置，才能判断结果能否复现。"],
    ["{name}登场，{focus}评测这次要重新出题了？", "{name} 在演示中完成了几项{focus}任务。一位研究者建议增加新题，另一位先问：现有题目的答案是不是已经公开了？"],
    ["一张榜单引发讨论：{name}之后，评测还能怎么测？", "{name} 的成绩截图在研究群里传开。有人关注分数，也有人拿出不同的测试设置，希望看看换一批题后的结果。"],
    ["从{score}分到研究范式：{name}让整个{focus}领域重新看题", "围绕 {name} 的讨论已经从分数转向出题方式。几位研究者还在比较测试条件，组会的封面已经换成了它的榜单截图。"],
    ["可能是今年最重要的一张榜单：{name}发布，评测界今夜重新打开表格", "{name} 发布后，评测表又多了一行。研究群里讨论着测试样本和复现方法，组会材料已经更新，表格制作者还在核对数据。"]
  ],
  "量子味": [
    ["{name}发布了，老板已经把链接转进了工作群", "老板把 {name} 的演示视频甩进群里：“这个能接进我们的流程吗？”工程师回了句“我先试试”。十分钟后，老板追问：“那下周能上线吗？”"],
    ["{name}的{focus}榜单更新，群里开始讨论：这次真能省多少活？", "一段{focus}演示传进工作群。有人说可以试试，有人问能不能处理旧文件；老板已经开始琢磨，原来排两天的活能不能改成一天。"],
    ["{name}来了，老板问：上周说要两天的需求今天能做完吗？", "同事把演示链接贴进群里，老板很快回复：“上周那个需求是不是也能用？”负责项目的人打开文档，先检查了客户的数据能不能上传。"],
    ["{name}刚发布，招聘群又开始讨论“一个人能顶几个人”", "招聘群里转发了 {name} 的演示。有人讨论团队要不要调整，有人问实际任务跑完需要多久；岗位说明还没改，面试安排已经发出去了。"],
    ["{name}刷屏后，一场关于岗位的讨论从午休开到了下班", "午休时，有人在群里分享 {name} 的测评。话题从怎么接入转到团队怎么分工，大家讨论到下班，最后决定先找个项目试用。"],
    ["老板群沸腾了！{name}刚出，明年招聘计划已经被拉出来重算", "演示视频在几个老板群里传了一圈，有人提议重新估算招聘人数。团队负责人看完链接后提醒：先试完手头的需求，再谈能省多少人。"]
  ],
  "新智猿": [
    ["刚刚！{name}发布，{focus}圈又开始刷屏了", "{name} 发布，综合成绩 {score} 分！演示视频还没播完，群里就有人贴出了榜单截图，也有人已经开始排队申请试用。"],
    ["一夜变天？{name}交出{score}分，网友：今晚又睡不着了", "{name} 的成绩刚公布，几个技术群已经转了好几轮！有人连夜打开体验页面，还有人盯着等待名单，等着明天上班演示给老板看。"],
    ["炸了！{name}一出，老板连夜转发，打工人默默打开招聘网站", "{name} 的演示刷屏了！老板问能不能用在项目里，员工先去申请账号；有人顺手打开招聘网站，看看别家的岗位要求改了没有。"],
    ["卷疯了！{name}发布，AI圈还没看完评测，群里已经开始讨论裁员", "{name} 发布后的第一个小时，群里转了榜单、演示和测评！有人问任务能省多少时间，也有人提醒：大家先等账号开通再说。"],
    ["又是这一夜！{name}刷屏，程序员、产品经理、老板全都坐不住了", "{name} 的发布视频被转进了不同的群！程序员想试代码，产品经理想看方案，老板已经问起项目排期。体验链接前的队伍也越来越长。"],
    ["史诗级突袭！{name}一出，行业群彻夜未眠：这次真的要变天了？", "{name} 发布，{focus}演示引发热议！工作群还在讨论能省多少活，招聘群已经有人追问岗位会不会变。测试账号能做什么，大家还在等着亲自试。"]
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
    const angles={
      '机器之薪':[
        ['评测表再添一行','研究群又在对照测试条件，有人建议换一批题再试一次。'],
        ['榜单截图又进了组会','有人在核对数据，有人已经把成绩放进了报告首页。'],
        ['研究者再次讨论怎么出题','讨论从榜单排名转到样本选择，复现结果还要等下一轮测试。'],
        ['一份成绩单引出新问题','榜分公布后，研究者又开始比较不同测试设置。']
      ],
      '量子味':[
        ['工作群又转发了发布链接','老板问能不能赶上下周的项目，团队先申请了试用。'],
        ['招聘计划又被打开','团队还在试用，老板已经问起明年要招多少人。'],
        ['排期表再被拉出来讨论','演示看起来很顺利，工程师先确认客户文件能不能处理。'],
        ['老板群再次讨论一个人能干多少活','团队负责人表示，先拿真实需求试一遍再算。']
      ],
      '新智猿':[
        ['又炸了！行业群连夜转发','演示刚放完，榜单截图已经刷屏！还有人守着申请页面，等一个试用名额。'],
        ['刷屏了！老板催项目，打工人先看招聘网站','群里一边转演示，一边讨论岗位！至于效果怎样，还得等账号开通。'],
        ['这一夜又没白等！榜单刚更新，工作群已沸腾','有人追问能省几个人，也有人提醒先看看自己的项目能不能跑。'],
        ['突袭！招聘群、技术群、老板群同时聊起了它','视频刚转完一圈，排期会就约上了！负责试用的人还在找入口。']
      ]
    };
    const followups={
      '机器之薪':['榜单之外的测试结果仍在整理。','有人准备把对照实验带到下次组会。','研究者期待看到更完整的测试报告。','换一套题后的成绩，还得等大家亲自验证。'],
      '量子味':['大家约好先找一个小任务试水。','会议结束前，有人又问了一遍账号费用。','项目经理决定先保留原来的排期。','讨论还没结束，客户又发来了新的需求。'],
      '新智猿':['有人已经把截图设成了群公告！','试用申请还在排队，下一个问题已经来了！','群聊消息不断刷新，实际测试也得赶紧安排上！','有人催着做测评，有人催着改排期，今晚的群消息停不下来了！']
    };
    const offset=edition-templates.length-1;
    const [angle,detail]=angles[model.media][offset%angles[model.media].length];
    title=`${model.name}：${angle}（第 ${edition} 次报道）`;
    copy=`${model.name} 发布后，${detail} ${followups[model.media][Math.floor(offset/angles[model.media].length)%followups[model.media].length]}`;
  }
  return {id:`media:${model.id}`,day:model.day,kind:'media',model,title,copy:`${model.media} · 第 ${model.day} 日。${model.name} 主攻${fields.focus}，综合成绩 ${fields.score} 分，发布时${fields.place}。${copy}`};
}
export function mediaHeadline(model,modelRank,models=[model]) {return mediaArticle(model,modelRank,models)?.title||`${model.name} 已发布 · 主攻${DIRECTION_LABELS[model.focus]}`;}
export function playerReleaseCopy(model) {
  const lines={
    coding:['演示结束，工程师正准备展示修复过程。老板：“那页先别放，榜单截图给我留十秒。”','工程师想讲刚修好的 bug，老板问：“能不能先把跑分那页放大？”','观众问能否用自己的项目试试。工程师刚要回答，老板已经开始介绍下一张榜单。'],
    office:['模型把会议纪要写好了。老板看了一眼：“把‘还没做完’改成‘持续推进中’。”','一份周报几秒就写好了。台下有人问数据从哪来的，工程师翻开了原表。','发布会演示了自动填表。老板很满意，财务拿着自己的表格排队等试用。'],
    multimodal:['模型读完了演示图片。台下有人递上一张手机照片，工程师说：“这张我回去试试。”','视频里的字幕识别得很顺利。观众问嘈杂的录音能不能用，团队记下了问题。','大屏展示了一张发票识别结果。财务凑近看了看：“金额对了，报销人怎么是老板？”'],
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
      '让它修测试，修复思路总结了三遍，测试还是红的。',
    ],
    office:[
      '周报确实写得快，里面那个不存在的客户我自己删了。',
      '让它帮我填表，它写了份怎么填表的说明。',
      '文件传上去了。模型在想，我的会已经开完了。',
      '格式挺整齐，引用的那份报告能发我看看吗？',
      '同一份材料又得传一遍？我只是换了个型号。',
    ],
    multimodal:[
      '照片里的小字这次读对了，剩下那张手写的我再试试。',
      '我让它看报错截图，它夸我的界面很好看。报错呢？',
      '视频才看到一半就没额度了，后半段我自己看？',
      '发票上的 8 识别成 3。我让它再看一遍，它说：您说得对，是 5。',
      '先把图里的金额读对，再给我讲设计风格吧。',
    ],
  };
  const quotes=byDirection[model.focus]||byDirection.office;
  const serial=Number(model.id?.split('-').at(-1))||1;
  return {id:`feedback:${model.id}`,day:model.day,modelId:model.id,title:`发布反馈 · ${model.name}`,copy:`用户：“${quotes[(serial-1)%quotes.length]}”`,impact:model.releaseFeedback||null};
}

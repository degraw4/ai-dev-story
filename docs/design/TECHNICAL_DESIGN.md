# 浏览器 Demo 技术设计

客户端使用原生 JavaScript 标准模块、网页元素、Canvas 二维画布、PNG 场景和静态音频。Node.js 22+ 的 npm start 只负责本地静态服务；不需要后端、账号、真实模型调用或联网榜单。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| src/game/content.js | 公司规则配置、员工基础能力、阶段参数和竞品日历 |
| src/game/rules.js | 唯一经营动作执行、自动研发、成长、榜单、账单、结局与历史重放 |
| src/clock.js | 将前台时间预算转为逐游戏日的 advanceTo 动作，聚合瞬时逐点事件，遵循当前公司的期限 |
| src/storage.js | 存档格式、历史一致性验证、兼容迁移和编码；不直接读写浏览器存储 |
| src/app.js | 当前公司、浏览器存储、输入、临时暂停与页面演出生命周期 |
| src/onboarding.js | 从真实状态计算小满的经营建议与五步界面导览 |
| src/story.js | 章节、新闻、角色、逐型号介绍和媒体文章，不修改经营资源 |
| src/story-scenes.js | 精选交互片段、日历映射、真实数据分支和对白选择读取，不修改经营资源 |
| src/notifications.js | 从真实事件、已发布模型和已读标识派生未读提示 |
| src/office.js | 合成办公室背景、动态员工、老板、小满和真实研发反馈 |
| src/research-feedback.js | 保存当前项目的显示分数与待播逐点队列，不修改经营状态 |
| src/point-icons.js | 编程、办公、多模态的共享像素图形，供画布和网页标签绘制 |
| src/stage-art.js | 方案、发布和庆祝画面；时间与经营状态由调用方提供 |
| src/audio.js | 背景音乐、事件音效、音量和后台停止 |

网页、核算和存档重放均调用 rules.js，不维护第二套成绩或收入公式。design-preview 是固定设计样张，不保存真实经营结果。

## 公司规则与状态

campaignProfile 是公司创建时确定的规则标识，由经营模块维护，开始后不可切换。新建公司使用 startup112，期限 112 日，公司继承比例 11%，每 120 经验成长一点，单项能力最多提高 6 点。兼容公司使用 classic168，期限 168 日，公司继承比例 50%，每 40 经验成长一点，单项能力最多提高 20 点。已有 budget112 公司保留原竞品、融资条件、10% 继承与预算费用；compact112 公司使用其原 112 日参数及原费用。四种公司共用同一个经营计算实现，参数差异由公司规则决定。startup112 的 seedScore 为 180，fundingPublications 为种子至少两款、专项至少三款、总榜至少四款；发布数量与实际成绩、榜单条件同时成立才融资。

rulesFor(state) 返回当前公司参数；rivalsFor(state) 和 releasesFor(state) 返回对应竞品资料与发布日历；campaignDay(state, classicDay) 将剧情定义日转换为当前公司的实际日点。界面读取实时公司时使用这些接口，设备报价通过 price(state) 取得。employeeTerms(state, employeeId) 返回实际招聘费与工资；trainingCost(state) 返回下一款训练预算；mediaCost(state, presenter) 返回报道费；operatingCosts(state) 返回本期工资与设备运行费。界面报价和扣款共用这些接口。全局 RULES、RIVALS 和 RELEASES 只代表新建公司的默认配置。

state 持有当前游戏日 gameDay、暂停状态 paused、现金 cash、工位 seats、设备容量 compute、在岗 employees、辞退记录 dismissed 和唯一项目 project。knowledge 是公司三项积累；models 保存所有已发布模型；funding 保存已兑现融资；pendingBonus 与 pendingNews 分别保存尚未到账的发布奖励和行业收入调整。bills 与 notices 保存实际账单和事件，acceptedActions 保存成功经营动作。assignments 仅记录 Rebo 暂时离开研发处理额度重置的工作。

employeeExperience 为每位员工保存三项经验，能力顺序固定为编程、办公、多模态。employeeAbilities(state, employeeId) 把基础能力与当前公司的成长规则结合，供方案、研发、招聘比较和团队展示读取。方案交付与实际研发工作产生经验，空闲不成长。growthEnabled 标明该公司是否已经启用后续成长，用于兼容历史动作。

quotaResetStatus(state) 由经营模块派生 Rebo 的 available、reason、cost、finishDay 和 ratingAfter，分别表示是否可用、不可用原因、费用、完成日与预计评分。团队卡和用户反馈页共用此结果，reset 动作使用相同条件校验；浏览器写入冲突在界面另行禁用。使用能力不新增动作类型或存档字段，仍通过 reset 和 advanceTo 完成真实结算。

story.specialAbility(state, employeeId) 为六位特殊员工提供能力名称、主动或自动类别、描述与触发状态。Alex 的优惠读取 mediaCost，Boris、Tim 和 Max 的生效说明读取当前研发阶段及实际参与者。notifications 从 reset-complete 实际通知生成能力结果，使用通知位置形成稳定已读标识；展示、刷新及关闭都不再次结算。

## 项目与发布

project 保存项目编号 id、项目名称 name、主攻 focus、方案负责人 plannerId、状态 status、方案进度 planProgress、方案成果 planScores、初始成绩 initialScores、当前成绩 scores、总完成工作 work、阶段位置 stageIndex、阶段完成量 stageWork 和三项贡献余数 scoreRemainders。initialScores 在立项时复制公司积累，之后保持不变；planScores 在方案交付前为 null，交付后保存真实方案成果。

startup112 与 budget112 项目还保存 trainingCost，即立项成功时一次预付的四阶段训练预算；发布时复制到模型。重复无效动作不扣款，后续研发不再次收取训练费。

项目依次处于 planning、researching、ready。createProject 必须指定一名可工作的方案负责人；selectPlanner 只用于负责人已离岗且方案尚未完成的情况。方案交付后所有可工作的员工自动参加四阶段研发。招聘影响后续工作，辞退保留既有成果；交付前辞退负责人会暂停并要求明确重选。

负责人控件使用原生单选输入，project-planner 与 replacement-planner 各有独立的 name。卡片从 employeeAbilities 读取当前三项能力，重选方向取自当前项目；忙碌员工仍展示，但输入禁用。人员、能力和资格相同的渲染复用现有节点，切换方向只更新高亮，保留选择和键盘焦点。提交分别调用 createProject 和 selectPlanner，后者不再次扣训练费。无可用员工时统一禁用提交按钮。

productionSummary 返回当前阶段、进度、预计剩余游戏日、每日推进量、设备占用、参与员工和阻碍说明。employeeActivity 返回某位员工的工作类型和是否正在活动。办公室动画只读取这些事实，不自行生成研发进度。属性与经验按实际工作量累计，同一团队增加设备不会因工期缩短而减少总成果。

productionSummary.teamAbilities 是研发阶段 activeEmployeeIds 对应员工的当前三项能力总和，顺序为编程、办公、多模态；其他阶段为三个零值，界面不将其展示成研发团队。汇总由 rules.js 的内部 teamAbilities 函数派生，不写入存档。实际每单位研发按员工逐个累计当前能力，员工升级后下一单位重新计算；Max 的评测加成归入他本人对应方向的贡献。该字段是解释现有贡献的数据，不创建额外分数或另一套结算。

applyAction 复制原状态，校验规范化动作后执行；失败返回原状态，不修改现金、事件或历史。模型达到 ready 时，核心停止本次时间推进；界面等待末批逐点反馈结束后主动展示发布准备。关闭提示后可以恢复此前运行状态，模型仍需实际发布才能参榜。

发布界面不要求玩家再次选负责人。publicationPresenter(state) 优先选择可用的 Alex，其次是可用的方案负责人，否则选择第一名可用员工；实际主持人保存在模型记录中，用于费用、演出和回看。发布先结算并保存，演出只读取结果，不再次调用发布动作。

marketSummary(state) 派生当前活跃用户、付费人数、下期预计订阅和客户评分。没有正式产品时人数与收入为零，评分为空。用户数可随公司排名回落，不是累计注册数。

baseSubscriptionIncome(state) 是基础订阅的唯一计算入口，市场预览与七日账单共同调用。普通公司按当前综合第一至第六取得 50、40、32、25、20、15；subscriptionGrowthEnabled 为 true 且 funding 包含 overall 时使用成熟表 75、70、65、60、30、20。没有已发布模型时为零。成熟订阅不按发布数量叠加，不固定历史最高名次，也不修改融资金额。

startup112、budget112 与 compact112 的每次正式发布保存 releaseFeedback：before 和 after 是发布前后的市场概况，nextBillIncome 是包含现有待到账奖励和行业调整的下期收入预估。后续排名仍会影响实际账单。评分变化不参与收入、融资或结局公式。兼容模型没有该字段时，界面只显示当前概况，不补造历史变化。完整公式见 [ECONOMY.md](ECONOMY.md)。

mediaCampaign(state, day) 从最后一款付费宣传模型取得有效订阅加成，默认 day 为下次账单日；账单结算传入当前账单日。模型中的 mediaUntilDay 定义最后有效日，mediaIncome 保存每期收入；期限截至最终经营日。推广每期增加真实收入，bills.mediaIncome 单独记录。更新报道替换有效期，不累计多个宣传效果。回看文章和发布演出不再次扣款或结算。

mediaArticle(model, modelRank, models) 从已发布记录派生该媒体在本公司刊登的篇数，只计入同媒体的玩家模型且发布顺序不晚于当前型号。六级模板之后从评测、职场与招聘等角度轮换标题和正文组合，标题包含该媒体的报道篇数。notifications 传入当时的模型历史，发布及回看传入完整记录，由函数过滤未来型号；两处使用同一篇文章。正文不引用 mediaIncome 或 mediaUntilDay，经营收益只在资金及发布相关账目中展示，不新增持久计数。

## 逐点事件与火爆

applyAction 成功返回 presentationEvents 数组。研发每结算一个整数点，产生一个 type 为 research-point 的事件，包含 projectId、workUnit、employeeId、direction、amount、burst 与 source。projectId 对应所属项目的 id，employeeId 对应提交该点的员工；workUnit 是从零开始的项目实际工作单位；direction 使用 coding、office 或 multimodal；amount 固定为 1；burst 表示提交者在该单位处于火爆窗口；source 区分 research 正常贡献与 burst 额外贡献。逐员工累计共享 scoreRemainders，补齐一个整数点的员工成为提交者；该顺序不依赖游戏日。

这些事件属于本次动作的瞬时返回值。clock.js 按执行顺序聚合各日事件；app.js 保存经营结果后将它们交给 research-feedback.js。事件不进入存档，replayActions 不收集它们；持久 research 通知继续保存每日 gains 汇总。显示队列按员工依次播放，每发出一个图标只更新对应的显示分数，不调用经营动作。重复渲染不会重新排队，缺少完整事件时直接同步真实成绩。

research-feedback 使用真实毫秒播放。sync 的 durationMs 是当前倍速下一游戏日的目标展示时长，按员工分组将点数分散到该时段；正常点可见950毫秒、同员工最小间隔1100毫秒，火爆点可见650毫秒、最小间隔750毫秒。全局出点至少间隔140毫秒。advance每帧至多发出一个新图标，迟到的点从实际发出时刻开始计时，不补播已经过期的动画，也不压缩寿命。office使用同一真实时间步长，员工成长提示放在工位下方，避开头顶图标。

显示逐点期间，app通过clockElapsed限制新结算：单帧最多到下一个游戏日边界，有待播点或尚未消失的图标时只推进到日内最后1毫秒。日内进度仍连续，超量时间不累积，不通过额外pause动作改变经营历史；播完后才能产出下一批。减少动画和没有在研项目时无需等待图标，沿用正常时钟推进。ready尾批由resumeAfterInterruption控制播放，时间按钮根据实际播放状态显示暂停或继续；继续尾批不会额外推进游戏日。

enableBurst 只新增 state.burstEnabled=true。新建 startup112 公司与显式创建的 budget112 公司在 beginCampaign 后执行一次；createState 的 burst:false 选项供隔离核算使用。项目只在立项时读取该标记，写入 project.burst，其中 startWork 和 endWork 定义左闭右开的四单位窗口，employeeId 在首单位前为空，earned 是已经产生的额外点数。首三款 startWork 依次为 12、16、20，此后循环。首单位按项目编号在当时可工作名单中确定员工；后续不更换人选，仅在该员工实际参与时额外增加一点主攻属性。earned 最多为 4，不产生额外经验；发布时保存为模型的 burstBonus。

## 历史与存档

acceptedActions 由经营模块持有，从开局累积到结局；拒绝的动作不进入历史。每条只保存允许的字段，最多 4096 条，整个存档最多 2 MB。新公司的第一个动作是 beginCampaign，明确记录公司规则；它不能出现在历史中途。replayActions 使用同一个经营计算实现重放，快照的经济状态、项目、模型、经验、事件和发布反馈必须与结果一致。

没有 beginCampaign 的历史从 classic168 开局重放。读档或外部写入冲突可以暂停公司而不增加经济动作，因此校验允许将重放结果的 paused 置为 true，但不能借此改动其它字段或静默恢复时间。

已存在的 v5 budget112 与 compact112 公司保留各自原定参数；新公司的 beginCampaign 记录 startup112，历史重放仍按每家公司的既定标识选择竞品、积累比例与融资条件，不改写已发生的动作或快照。SCHEMA_VERSION 为 5，SAVE_KEY 为 ai-dev-story-save-v5。外层包含 schemaVersion、state、dayProgressMs、observedStoryEvents、feedbackResponses。dayProgressMs 是不足一个游戏日的时间预算；observedStoryEvents 记录已确认消息；feedbackResponses 保存玩家对实际模型的回应文字。

通过历史校验后，app.js 为尚未结束且未启用火爆的 budget112 公司追加一次 enableBurst 并保存；当前项目不添加火爆字段，后续立项才使用该能力。没有此动作的历史维持原值，classic168 和 compact112 默认不启用。

enableSubscriptionGrowth 由经营模块执行，只将 state.subscriptionGrowthEnabled 设为 true，并进入 acceptedActions。createState 对 startup112 默认启用，可用 subscriptionGrowth:false 构造普通订阅的兼容核算；其它公司规则默认不启用。重放只按历史中的实际动作启用，不能因为当前新公司默认值而重写过去账单。

app.js 在校验已有 budget112 或 startup112 存档后，为尚未结束且未启用的公司追加 enableSubscriptionGrowth 并保存。启用不更改已有现金、项目、模型反馈、通知或账单；后续基础订阅同时检查该标记与综合融资资格。已结束公司与 classic168、compact112 不自动追加，外层存档格式保持 v5。

当前存档不存在时，app.js 按 MIGRATION_SAVE_KEYS 中的 v4、v3 顺序查找。storage.js 先严格重放并核对完整快照，再补充 classic168 标识和兼容字段，保留既有现金、项目、模型、账单、事件与已有经验。未启用成长的存续公司追加一次 enableGrowth，从后续工作开始积累经验；已启用的公司不重复添加。恢复后暂停，新格式写入 v5，原 v3、v4 字符串留在原位置。

LEGACY_SAVE_KEYS 保存 v2 手动研发与 v1 五方向原文。欢迎页允许导出，不自动解释为当前自动研发历史。坏档保留原字符串，明确确认新局才能覆盖当前键；普通保存配额失败保留内存公司并提示。

app.js 每次写入前比较上次成功读取或保存的原始字符串。检测到外部变化时暂停、禁止写入，并回滚本次尚未保存的经营动作或时间推进。这只保护已可见的变化，不是跨标签原子锁；同一份存档应在一个页面操作。

## 时间、窗口与主动提示

clock.js 使用前台单调时间，支持一倍、两倍、四倍。页面隐藏时暂停经营与声音，不累计离线时间。研发完成或终局打断多日追赶，清除多余时间预算；只有显式的经营动作推进游戏日期。

app.js 用 resumeAfterInterruption 记住临时中断前是否正在运行。管理窗口、通知和后台切换临时暂停；全部窗口关闭或页面恢复可见时，满足原本运行的条件才继续。手动暂停清除自动恢复意图。恢复存档保持暂停；终局、后台、离开页面、导览、未关闭窗口、方案或发布场景、写入冲突以及缺少方案负责人都会阻止错误恢复。

关闭处理先确认已读，再通过下一任务检查通知与恢复条件，保证同一个原生 close 事件的全部处理先完成。未读提示由事件和模型记录重建，优先显示研发完成的发布准备，其次是未读融资或综合登顶卡。其余通知中，实际离职告别优先，其他消息按日期呈现，同日依次展示新闻、媒体文章和用户反馈。不同窗口不会为同一消息重复执行经济效果。

通知关闭后才持久化已读，刷新时仍未确认的内容会再次呈现。首次融资和首次综合登顶从真实 funding 事件生成，发布演出中刷新也能恢复尚未读的庆祝卡。确认后的通知不再次主动弹出；行业新闻保留在快讯列表，已发布模型的成绩和发布演出可以回看。

精选剧情由 STORY_SCENES 定义稳定 id、classicDay、replaces、mode 和 title。classicDay 使用兼容日历，展示时通过 campaignDay 映射；replaces 列出本片段承接的原新闻标识。reachedStoryScenes 根据公司起始阅读日和当前游戏日列出已经到期的片段，notifications 用它们替代对应的主动新闻提示，原新闻仍留在档案。storyScene 生成具体对白、选择、资料卡与数据；行业型号按片段日过滤，玩家数据按当前状态生成，回看标明当前经营日。

剧情阅读进度由 app.js 保存在 observedStoryEvents：新公司写入 story-start:0；已有公司若在第 29 日首次接入，写入 story-start:30，避免重演当天已读新闻。选择“又”时保存 story-pick:story-headlines:again，关闭或跳过时保存片段本身的标识 story-headlines。选择即时保存，关闭前仍未读；刷新可以恢复回应。对白页码和资料页码仅属于当前窗口，刷新从第一页开始。所有标记随新公司重建而清空，不添加经济动作或存档字段。

activeStory 只在窗口打开期间持有片段、页码、当前选择和回看状态。回看中的试选不改持久选择，关闭不重复结算；原生关闭处理先确认当前片段，再由既有延迟调度检查后续通知。片段跳转管理页时，先关闭剧情窗口、打开指定管理页，关闭管理页后按原运行状态接续。

小满是唯一秘书角色，同时负责导览、当前目标、宣传和财务解释；老板代表玩家。五步导览的 tourStep、tourCompleted 保存在界面设置中，与经营历史分离。首发后查看资金会记录对应引导进度，后续建议指向下一款模型，不反复要求查看同一账本。

## 画面与声音

办公室使用 1536 × 1024 的创业背景、城市总部背景和角色图集，由 Canvas 合成铺满办公室视窗。背景以覆盖方式缩放，必要时裁切外围街区，工作区域保持居中；画布按设备像素比设置实际尺寸并关闭平滑采样。扩张记录决定使用哪个背景、工位布局与老板和小满的位置，员工名单决定占用哪些工位。

方案、研发、额度重置、实际增分和员工成长分别驱动工作效果。三项属性使用共享的 16 × 16 像素图形；员工头顶每次出现一个方向图标与 +1，主屏对应显示分数同步增加一点。火爆员工在真实贡献播放期间显示火焰，并以更短间隔连续出点。员工成长另显示“能力提升”。方案与发布的独立演出使用 320 × 144 画布，文字和数值保持网页文本。

手动暂停冻结待播点数和图形时间。管理窗口、后台切换、终局与减少动画会清空视觉队列并同步经营状态中的真实成绩；恢复存档直接显示真实成绩。ready 状态保留完成前的自动恢复意图，允许末批点数播完，再打开发布安排；一次补算从 planning 到 ready 也遵循此流程。

development-progress.js 根据 productionSummary 和已保存的 dayProgressMs 计算阶段显示进度。当前阶段已结算工作量，加上当天可推进量乘以日内时间比例，形成连续填充；当天推进量最多取该阶段剩余工作量。主屏与研发窗口使用同一个结果及百分比，阶段切换仍由经营结算决定。暂停和读档保留日内比例，没有可工作员工时不预估增量，完成或终局只显示实际进度。该函数不写分数、工作量或经营历史。

模型介绍支持指针、键盘聚焦和点击；顶层浮层约束在视口内，滚动、关闭榜单和 Escape 都会清理。发布先保存真实结果，再显示型号、成绩和账目。DeepPeek 使用资料形式呈现，不安排争议回应。

音频控制独立于经济状态，背景音乐与事件音效分开调节。静音、后台、跳过和返回清理对应声音；动画、文字和声音不会再结算发布或发钱。

## 验证边界

npm test 覆盖经营、成长、时钟、存档、兼容迁移、引导、通知、音频与静态服务。check-cost-balance.mjs 的命令行入口调用 subscriptionExamples，以实际动作核算成熟订阅、二至八单位设备、七人轮换研发与四结局；subscription-routes.test.mjs 比较完整状态重放与存档往返。startupExamples 和 budgetExamples 保留未启用订阅成长的兼容路线；check-realtime-design.mjs 保留 compact112 的兼容回归。check-prototype.mjs 在隔离 Chromium 中执行真实界面操作、存档故障注入与截图。订阅核算见[专项记录](../reviews/2026-10-21-post-funding-income.md)，逐点反馈与火爆见[专项记录](../reviews/2026-10-21-point-icons-and-bursts.md)。运行报告保存在 [docs/reviews](../reviews/)，每份报告只证明其列明的版本与场景。

自动浏览器使用加速时钟，结局由合法动作构造，不替代真人完整时长、重复感和设备试听。十段精选交互已接入，其余文稿片段作为可选素材；公开许可、GitHub 仓库与公网部署仍需完成。

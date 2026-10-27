# GitHub 发布记录

日期：2026-10-27。用户要求整理源码、补充 README 与启动方式并创建公开 GitHub 仓库；代码与项目原创素材采用 MIT 许可。

## 本地检查

- `npm test`：130 项通过。
- `npm run check:balance`：八条经营路线核算通过；这不等同于真人试玩平衡通过。
- `npm run check:audio`、`npm run check:sounds`：音频结构和生成文件一致性检查通过；不代替实际听感评估。
- 使用 `PORT=4174 npm start` 启动独立服务，首页、JavaScript 入口与办公室图片均返回 HTTP 200。
- README 与素材说明的本地相对链接检查通过；已跟踪文本及新增公开文件经过针对常见私钥、GitHub 令牌和 AWS 密钥格式的简单扫描，未发现匹配。这不是全面安全审计。
- 检查现有 Git 历史的文件路径，用户提供的商业游戏截图、视频及原始交接文件不在历史中；这些文件也被 `.gitignore` 排除。
- 逐点动画的浏览器测试及截图见 [动画验证记录](2026-10-21-readable-research-points.md)，完整真人游戏时长仍待验证。

## 公开仓库和后续工作

已创建公开仓库 [degraw4/ai-dev-story](https://github.com/degraw4/ai-dev-story)。用户试玩反馈第 48 日第三款模型仍第 6，订阅收入不足且不敢招聘；目前只记录，后续复现并调整。公开分支按用户要求压缩为单提交并使用 GitHub 无回复邮箱，本地原历史保留在备份分支。GitHub Pages 已启用，首页、JavaScript 入口和办公室图片返回 HTTP 200：[在线游玩](https://degraw4.github.io/ai-dev-story/)。页面主要交互和线上完整流程尚未验证。

公开文件补充扫描未发现本机 home 路径、公司域名、电子邮箱或私网地址；仓库 PNG 文件没有文本或 EXIF 元数据块。扫描仅覆盖常见模式，不构成对所有潜在信息泄露的保证。

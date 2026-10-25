# dsh-subagent-panel

DeepSeek Harness（DSH）插件：对话区左侧可收起的**子 Agent 面板**。只整合当前会话的
subagent 谱系（根会话 / 自己 / 子 agent），点击切换会话；附带会话状态点、后台任务徽标
和只读团队任务区。

本仓库就是一个可安装的 DSH bundle（`package.json` 的 `dsh.bundle.patch` +
`dsh.client` 双端声明），不需要构建步骤。

## 兼容性

- 在 **DeepSeek Harness 0.2.1-rc.3**（Web / Desktop）上开发与验证。
- `engines.dsh: >=0.2.0-0 <0.3.0-0`：DSH 安装器会在启用前检查这个范围，运行时版本
  不满足会拒绝安装/启用（详见 DSH 的 plugin compatibility 检查）。这表示**接受整个
  0.2.x 系列**（含 0.2.x 的 RC 预发布，如 0.2.1-rc.3），但拒绝 0.3.0 及其预发布。
  两端都带 `-0` 是 semver 的写法：不带 `-0` 时 `>=0.2.0` 会排除 0.2.0 的 RC，
  `<0.3.0` 又会把 `0.3.0-rc.*` 算进来。
- 纯 ESM JavaScript，无构建、无运行时依赖；React 由 DSH 客户端在运行时提供。
- 依赖的 Client 服务与宿主锚点列在 [工作原理与数据契约](#工作原理与数据契约)，
  上游改版时需要复核。

## 功能

- **会话谱系列表**：列表锚定在当前会话所在 subagent 链的**最顶层根会话**，
  行 = 根 + 它的 subagent 子树（递归，子女按 `updatedAt` 新到旧）。
  当前会话只靠高亮和「当前」chip 区分；点开某个子会话只移动高亮，不把列表根换成它，
  兄弟 subagent 不会消失。`fork` 不参与整合：不挂在来源会话下，来源会话也不作为
  祖先出现。
- **会话状态点**：读 `ctx.uiSession.sessionStatus`，按「等你处理 > 运行中 >
  新完成未看 > 无标记」取一档。颜色对齐 DSH `StateDot`：`warning` 琥珀 =
  等你处理、`ongoing` 灰转圈 = 运行中、`done` 绿 = 新完成未看、`idle` 灰点 = 待办。
- **后台任务徽标**：读 `ctx.jobs.state`，只统计 `running` / `stopping` 的 job，
  在会话行末尾显示「转圈 + 数量」；hover 显示 job 的 label 与已运行时长。
- **团队任务区**：面板底部只读一节，数据取自树根（Lead）会话的 `agentTeam` 投影
  （Agent Teams 实验性功能）。按「进行中 → 可开始的待办 → 被依赖阻塞 → 已完成」
  排序，显示状态点、`task-N`、标题、负责人、依赖数、写入范围重叠警告和投影的
  failure；鼠标悬停单个任务弹出详情卡片（完整描述、负责人、依赖、写入范围、警告），
  移开即消失。任务不能在这里编辑；没有任务或投影未加载时整节不渲染。
- **形态与开合**：对话列左侧 gutter 里的一块浮层。展开时面板占据整个左缘
  （默认 300px，可拖右缘在 220–460px 间调宽）；收起后只剩一个 40px 图标按钮
  （列表图标 + 会话数徽标），点它展开。展开态的收缩按钮是面板头部最左侧的按钮，
  与收起态按钮同一尺寸、同一角落，开合都点这个位置；**面板头部最右侧是固定按钮**。
- **自动折叠与固定**：未固定时，以下任一情况会把面板**自动折叠**（不写偏好，条件解除
  后恢复展开）：① 右侧边栏打开；② gutter 放不下最小面板宽度（220px）。**未固定时点
  左缘图标可以「仅本次」临时展开**（不写入偏好，空间不足时以覆盖方式展开；下一次自动
  折叠条件触发或刷新页面后回到偏好状态）。点面板头部右上角的**固定按钮**后，这两种
  情况都不再自动折叠面板——右栏打开时保持展开，空间不足时改为覆盖展开；固定状态持久化。
  取消固定后恢复自动折叠。
- **窄屏**：gutter 放不下最小宽度时，未固定 → 自动折叠，但点图标仍可临时覆盖展开
  （「仅本次」）；固定 → 一直覆盖展开（宽度按视口收缩，最低 160px）。窗口太矮
  （可用高度 < 120px）时整块隐藏。
- **偏好**：开合、宽度与固定状态存 localStorage `subagent-panel:v1`。

## 安装

前置：已有一个运行中的 DSH profile（Desktop 或 `dsh` CLI）。

从 npm 安装（推荐）：

```js
// 在带 plugin_manager 的 DSH 会话里
plugin_manager({ action: 'install_bundle', target: '@brucecheung666/dsh-subagent-panel' })
```

```sh
# 或用 CLI
dsh plugin --profile <profile> install @brucecheung666/dsh-subagent-panel
```

也可以从 GitHub 或本地路径安装：

```js
plugin_manager({ action: 'install_bundle', target: '/path/to/dsh-subagent-panel' })
```

```sh
dsh plugin --profile <profile> install /path/to/dsh-subagent-panel
dsh plugin --profile <profile> install github:BruceCheung666/dsh-subagent-panel
```

安装后：

- 「设置 → 插件」里出现 **子 Agent 面板 / Subagent panel**，可启用/禁用/卸载；
- 打开一个对话（conversation 主面板、内容已进入 active 阶段）后，对话区左缘出现面板
  或它的图标按钮。

更新 / 卸载：

```js
plugin_manager({ action: 'remove_bundle', target: '@brucecheung666/dsh-subagent-panel' })
plugin_manager({ action: 'install_bundle', target: '@brucecheung666/dsh-subagent-panel' })
```

## 使用

1. 收起态点左缘的 40px 图标按钮：未固定时是**仅本次**的临时展开（不记住，空间不足时
   覆盖展开），固定时是正常展开并记住；展开态点面板头部左上角同位置的按钮收起。
2. 拖动面板右缘调整宽度（220–460px）；开合与宽度会记住。
3. 点击会话行切换到该会话；列表只显示当前会话的 subagent 谱系，不列出全部会话。
4. 行末尾的状态点/任务徽标只作提示，点击行仍然是「切换会话」。
5. 右侧边栏打开、或 gutter 放不下最小宽度时，未固定的面板会自动收起（空间恢复后
   自动展开）。点面板头部右上角的**固定按钮**可以固定——固定后这两种情况都不再
   自动折叠（空间不足时覆盖展开），固定状态会记住；取消固定后恢复联动。

## 工作原理与数据契约

**注册与渲染**

- Client 半注册在 frame 级 `shell.overlay` 槽（`id: subagent-panel`，`order: 50`），
  渲染一个 `position: fixed` 的点击穿透层；面板/按钮自己恢复 pointer-events。
- Host 半 `index.js` 是空 `apply()`：它只负责让这个包成为 Host Loader 里的一行，
  Client 半通过 `package.json` 的 `dsh.client` + `exports["./client"]` 被发现和下发。
- 一律只用 `--dsw-*` 主题 token，不写死颜色（图标除外）；文案走
  `ctx.locale.register('subagent-panel', 'en'|'zh', …)`。

**注入的 Client 服务**

| 服务 | 用途 |
|---|---|
| `ctx.sessions.list`（快照 store） | 会话目录：当前会话判定、谱系行、状态/时间 |
| `ctx.uiSession.sessionStatus` | 行状态点（等你处理 / 运行中 / 新完成未看） |
| `ctx.jobs`（`state` + `watchRows`） | 行上的后台任务徽标 |
| `ctx.uiWorkspace.openSession(id)` | 点击行切换会话 |

`inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'uiSession', 'jobs']`。

**数据契约（半公开，上游改版先查这些）**

- `sessions.list` 的行字段：`id`、`parentId`、`origin === 'subagent'`、
  `retainedBy.mainView`（当前会话判定）、`title/displayTitle`、`cwd`、`blank`、
  `running`、`updatedAt`；当前会话取 `retainedBy.mainView > 0` 的那一行。
- `uiSession.sessionStatus`：`running` / `pendingInteraction` / `completionUnread`。
- `jobs.state`：`{ rows: Record<sessionId, JobView[]> }`，JobView 用到
  `status`（`running`/`stopping`）、`label`、`kind`、`startedAt`。
- `agentTeam` 投影：树根（Lead）会话上的 `{ members, tasks, failure? }`，
  实验性投影，只在启用 Agent Teams 的 profile 有数据；任务字段用到 `id`、`subject`、
  `description`、`status`、`ready`、`ownerName`、`blockedBy`、`writeScopes`、
  `writeScopeWarnings`。
- 宿主 DOM 锚点：`[data-conversation-region="chat"]`（含 `data-content-phase`）、
  `[data-composer-card]`、`[data-rightbar-col]` 及 frame 的
  `data-rightbar-collapsed/fullscreen` 属性。位置靠 `ResizeObserver` +
  `MutationObserver` + rAF 实时测量，属原型手段。

**几何**

- 横向：区域左缘 `chat 区域 left + 8px`；gutter 右边界是输入卡左缘减 12px。
  gutter ≥ 220px 时面板就近放进 gutter（不遮对话）。gutter < 220px 时：未固定则
  自动折叠（点图标可仅本次临时覆盖展开）；固定则一直覆盖展开，宽度按视口收缩，
  最低 160px。
- 纵向：`chat 区域 top + 8px` 到输入卡顶部减 12px；低于 120px 时整块隐藏。
- 面板只会在 conversation 内容处于 `active` 阶段时出现（hero/settling 等阶段测量
  锚点没有意义）。

## 已知边界与妥协

- 只显示当前会话的 subagent 谱系：没有「全部会话」视图，也不在面板里 fork / 归档 /
  重命名（这些仍在 DSH 侧栏）。
- `fork` 不进树：fork 出来的会话不会挂在来源会话下，来源会话也不会成为祖先。
- 团队任务区只读：创建/认领/完成由 agent 工具完成，面板不写回。
- 位置依赖宿主 DOM 锚点 + 浮层，不是真正的左列；覆盖展开时会遮住一部分对话内容。
- Client 半在槽位里抛运行时错误会导致该条目被 DSH 的槽位错误边界移除（面板消失，
  看浏览器 Console）；改完代码用 remove + install 重新加载模块。

## 开发

```
client.js          Client 半（全部 UI、交互与几何测量）
index.js           Host 半（空实现：Loader 行载体）
cordis.patch.yml   bundle 层：向 profile 插入 id=subagent-panel 的插件行
locale/            插件管理页标题/描述与面板文案（en/zh）
icon.svg           插件列表图标
```

- 无构建：改完在 DSH 里 `remove_bundle` + `install_bundle`（或重启）加载新模块代际。
- 校验：`node --check client.js`；本仓库没有额外脚本。DSH 侧可用
  `cordis_inspect_query` 查 live 槽（`Slots.listSubTree` 的 `shell.overlay` occupants）
  确认注册是否生效。
- 样式只用主题 token；不要改 `document.body`，不要读别的插件的 DOM/样式。

## 常见问题

**面板完全没出现？**

- 当前主面板不是 conversation，或对话内容处于 hero/settling 阶段（只有 `active`
  才显示）；窗口太矮（可用高度 < 120px）也会整块隐藏。
- 插件未启用或被卸载：「设置 → 插件」里确认「子 Agent 面板」处于启用状态。

**展开后看不到面板、只有图标按钮？**

- 收起态本来就只有 40px 图标按钮；点它展开。
- 未固定且 gutter 放不下最小宽度（220px）时会被自动折叠，但点图标仍可**临时覆盖展开**
  （仅本次，不写偏好）；想一直保持展开就点面板头部右上角的固定按钮，或者把输入区
  拖窄/放大窗口让出足够的 gutter。

**行状态点/任务徽标不出现？**

- 状态点只在会话有对应状态时显示；任务徽标只统计未结束（`running`/`stopping`）的 job。
- 团队任务区需要启用 Agent Teams 的 profile，且树根会话上有 `agentTeam` 投影。

**开合/宽度/固定偏好没保留？**

- 偏好存在 localStorage `subagent-panel:v1`；隐私模式或清站点数据后会回到默认值。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。

## License

[MIT](LICENSE) © 2026 BruceCheung666

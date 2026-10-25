/**
 * subagent-panel 的 Client 半（左侧子 Agent 面板）。
 *
 * 做什么：
 * - 注册到 frame 级浮层 `shell.overlay`，把会话谱系放进对话区左侧、由输入宽度
 *   让出来的 gutter 里；展开时是一块浮层，收起时只剩左缘一个 40px 图标按钮。
 * - 内容只整合 **subagent 关系**：当前会话（若是 subagent，带它的 subagent 上级链）、
 *   它自己、以及它的 subagent 子树。`fork` 不参与整合：不挂在来源会话下，来源会话
 *   也不作为祖先出现。
 * - 数据来自 Client 服务 `ctx.sessions.list` 的快照（Host 的会话目录），不向
 *   Host 发额外请求；当前会话用快照行的 `retainedBy.mainView` 判定（DSH 侧栏
 *   自己也是这么判断的）。点击一行 = `ctx.uiWorkspace.openSession(id)`。
 * - 面板底部另有只读的「团队任务」区（不折叠）：读 Lead 会话上的 `agentTeam`
 *   投影（Agent Teams，实验性），展示任务状态/负责人/依赖/写入范围警告；鼠标悬停
 *   单个任务弹出详情卡片。没启用团队 bundle 或投影未加载时不出现。
 * - 开合：收起时左缘是一个 40px 图标按钮（列表图标），点它展开；
 *   展开后面板占据整个左缘，收缩按钮是**面板头部最左侧**的按钮，占同一角落、
 *   同一尺寸（它是会话列表窗口的一部分，不再外置，也不给面板让宽度）。
 * - 几何不写死：测量宿主公开锚点 `[data-conversation-region="chat"]` 与
 *   `[data-composer-card]`，跟随输入宽度拖拽、侧栏/右栏开合与窗口缩放；
 *   gutter 不足时面板改为**覆盖**在对话区左侧展开（仍可收起），不再因为空间
 *   不足而禁用展开；低分辨率设备也能打开。
 * - 样式只用 --dsw-* 主题 token；开合与宽度偏好存 localStorage
 *   `subagent-panel:v1`（按窗口实例区分，和 DSH 里其他界面偏好一致）。
 *
 * 为什么用 `shell.overlay` 而不是布局列：`ui-layout` 只管理
 * `sidebar | main | rightbar` 三列，`main.conversation` 由 `ui-conversation` 独占，
 * 插件没有插入新列的扩展点。这里选择测量宿主公开锚点 + 浮层，属原型手段；
 * 上游提供 leftbar 真分栏后应迁移。
 */
window.__ModuleLoader__.load({
  id: '@brucecheung666/dsh-subagent-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'subagent-panel'
    const STORAGE_KEY = 'subagent-panel:v1'

    // ----- geometry constants -------------------------------------------------
    /** 区域左缘距对话列左缘的留白。 */
    const EDGE_INSET = 8
    /** 收起后左缘图标按钮的边长（与面板头部的收缩按钮一致）。 */
    const ORB_SIZE = 40
    /** 图标按钮到「窗口」上边/左边的距离；展开态与收起态共用，两个按钮位置完全重合。 */
    const CORNER_INSET = 6
    /** 区域纵向底边距输入卡顶部的间距。 */
    const CARD_GAP = 12
    /** 纵向可用高度小于它时整块隐藏（避免在极矮窗口里露出碎片）。 */
    const MIN_STACK_HEIGHT = 120
    /** 展开后浮层面板的最小/最大/默认宽度；实际宽度还受 gutter 可用宽度限制。 */
    const MIN_PANEL_WIDTH = 220
    const MAX_PANEL_WIDTH = 460
    const DEFAULT_PANEL_WIDTH = 300
    /** gutter 放不下面板时改为覆盖式展开；面板至少保留这么宽（低分辨率设备）。 */
    const MIN_OVERLAY_WIDTH = 160
    /** 缩进最多到第几层（再深不再增加缩进）。 */
    const MAX_INDENT = 4
    const INDENT_STEP = 14

    /** 会话的三种来源，按 Host 的列表元数据区分。 */
    const KIND = { main: 'main', fork: 'fork', sub: 'sub' }

    // ----- locale dictionaries ------------------------------------------------
    const EN = {
      'panel.title': 'Sessions',
      'panel.collapse': 'Collapse the panel',
      'panel.expand': 'Expand the panel',
      'panel.expandTemp': 'Expand the panel this time (not pinned)',
      'panel.pin': 'Pin the panel (keep it open when the right sidebar opens)',
      'panel.unpin': 'Unpin the panel (collapse when the right sidebar opens)',
      'panel.resize': 'Drag to resize',
      'row.current': 'Current',
      'row.untitled': 'Untitled session',
      'row.blank': 'Not started',
      'row.running': 'Running',
      'row.waiting': 'Needs you',
      'row.unread': 'Finished, unread',
      'job.active': '{n} background jobs running',
      'job.seconds': '{n}s',
      'job.minutes': '{n}m',
      'job.hours': '{n}h',
      'row.open': 'Open this session',
      'kind.main': 'Main',
      'kind.fork': 'Fork',
      'kind.sub': 'Subagent',
      'empty.none': 'No sessions yet',
      'empty.noCurrent': 'No session is open',
      'loading': 'Loading…',
      'time.now': 'just now',
      'time.minutes': '{n} min ago',
      'time.hours': '{n} h ago',
      'time.days': '{n} d ago',
      'task.title': 'Team tasks',
      'task.pending': 'Pending',
      'task.blocked': 'Blocked',
      'task.inProgress': 'In progress',
      'task.completed': 'Completed',
      'task.owner': 'owner {name}',
      'task.depends': 'depends on {n}',
      'task.warn': 'Write scopes overlap',
      'task.failure': 'The task board reported a rejected record: {message}',
      'task.label.owner': 'Owner',
      'task.label.depends': 'Depends on',
      'task.label.scopes': 'Write scopes',
      'task.label.warnings': 'Warnings',
      'task.label.none': '—',
    }
    const ZH = {
      'panel.title': '会话',
      'panel.collapse': '收起面板',
      'panel.expand': '展开面板',
      'panel.expandTemp': '临时展开面板（未固定）',
      'panel.pin': '固定面板（右侧边栏打开时不自动折叠）',
      'panel.unpin': '取消固定（右侧边栏打开时自动折叠）',
      'panel.resize': '拖动调整宽度',
      'row.current': '当前',
      'row.untitled': '未命名会话',
      'row.blank': '未开始',
      'row.running': '运行中',
      'row.waiting': '等你处理',
      'row.unread': '新完成未看',
      'job.active': '{n} 个后台任务运行中',
      'job.seconds': '{n} 秒',
      'job.minutes': '{n} 分钟',
      'job.hours': '{n} 小时',
      'row.open': '打开这个会话',
      'kind.main': '主会话',
      'kind.fork': '分支',
      'kind.sub': '子 agent',
      'empty.none': '还没有会话',
      'empty.noCurrent': '没有打开的会话',
      'loading': '载入中…',
      'time.now': '刚刚',
      'time.minutes': '{n} 分钟前',
      'time.hours': '{n} 小时前',
      'time.days': '{n} 天前',
      'task.title': '团队任务',
      'task.pending': '待办',
      'task.blocked': '被依赖阻塞',
      'task.inProgress': '进行中',
      'task.completed': '已完成',
      'task.owner': '负责人 {name}',
      'task.depends': '依赖 {n}',
      'task.warn': '写入范围重叠',
      'task.failure': '任务板有记录被拒绝：{message}',
      'task.label.owner': '负责人',
      'task.label.depends': '依赖',
      'task.label.scopes': '写入范围',
      'task.label.warnings': '警告',
      'task.label.none': '—',
    }

    // ----- one-shot stylesheet ------------------------------------------------
    const STYLE_ID = 'subagent-panel-styles'
    const CSS = [
      '.sa-layer{position:fixed;inset:0;z-index:21;pointer-events:none;}',
      // 收起后只剩左缘一个图标按钮（和面板头部的收缩按钮同尺寸），点一下展开面板。
      '.sa-orb{position:absolute;display:grid;place-items:center;width:40px;height:40px;padding:0;box-sizing:border-box;border:0.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;pointer-events:auto;box-shadow:var(--dsw-elevation-soft, none);transition:background 120ms ease,color 120ms ease;}',
      '.sa-orb:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.sa-orb:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.sa-orb > svg{width:18px;height:18px;display:block;}',
      // 展开后的浮层面板。
      // 边框用 0.5px 的 ring shadow 画，不占布局：头部内边距因此能与收起态按钮共用同一个 CORNER_INSET 锚点。
      '.sa-panel{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;background:var(--dsw-specific-menu);border-radius:16px;box-shadow:0 0 0 0.5px var(--dsw-alias-border-l1), var(--dsw-elevation-panel, var(--dsw-elevation-soft));}',
      // 收缩按钮到窗口上边与左边的距离相等，且等于收起态图标按钮的 CORNER_INSET；
      // 左边距同时对齐 .sa-body 的横向内边距 6px。
      '.sa-head{display:flex;flex:none;align-items:center;gap:2px;padding:6px 8px 6px 6px;}',
      // 面板头部最左侧的收缩按钮：和收起态的图标按钮同一尺寸、同一角落，但属于面板本身。
      '.sa-toggle{display:grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:none;border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;transition:background 120ms ease,color 120ms ease;}',
      '.sa-toggle:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.sa-toggle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.sa-toggle > svg{width:18px;height:18px;display:block;}',
      // 面板头部右上角的固定按钮：固定后右侧边栏打开时不再自动折叠。
      '.sa-pin{display:grid;place-items:center;flex:none;width:24px;height:24px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;cursor:pointer;transition:background 120ms ease,color 120ms ease;}',
      '.sa-pin:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);}',
      '.sa-pin:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px;}',
      '.sa-pin[data-pinned="true"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 12%, transparent);color:var(--dsw-alias-state-business-primary);}',
      '.sa-pin[data-pinned="true"]:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);}',
      '.sa-pin > svg{width:14px;height:14px;display:block;}',
      '.sa-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);}',
      '.sa-body{flex:1;min-height:0;overflow-y:auto;padding:0 6px 8px;}',
      '.sa-row{display:flex;align-items:flex-start;gap:6px;box-sizing:border-box;width:100%;padding:5px 6px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;text-align:left;cursor:pointer;}',
      '.sa-row:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.sa-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px;}',
      '.sa-row[data-role="self"]{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 10%, transparent);}',
      '.sa-row[data-role="self"]:hover{background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 16%, transparent);}',
      '.sa-row-icon{flex:none;display:grid;place-items:center;width:16px;height:16px;margin-top:2px;color:var(--dsw-alias-label-tertiary);}',
      '.sa-row[data-kind="main"] .sa-row-icon{color:var(--dsw-alias-label-secondary);}',
      '.sa-row-icon > svg{width:14px;height:14px;display:block;}',
      '.sa-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}',
      '.sa-row-title{display:flex;align-items:center;gap:4px;min-width:0;}',
      '.sa-row-titletext{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;}',
      // 状态点统一用 DSH StateDot 的语义：ongoing=灰色转圈 / warning=琥珀 / done=绿 / idle=灰点。
      // 会话行和任务行共用同一套 data-tone，颜色风格保持一致。
      // idle：深色主题保持主文字色（白），浅色主题用中灰（label-tertiary ≈ #81858c）。
      '.sa-job-badge{flex:none;display:inline-flex;align-items:center;gap:3px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:14px;font-variant-numeric:tabular-nums;}',
      '.sa-mini-spinner{flex:none;width:7px;height:7px;box-sizing:border-box;border-radius:999px;border:1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 30%, transparent);border-top-color:var(--dsw-alias-label-tertiary);animation:sa-spin 900ms linear infinite;}',
      '.sa-dot{flex:none;box-sizing:border-box;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-label-tertiary);}',
      '.sa-dot[data-tone="idle"]{background:var(--dsw-alias-label-tertiary);box-shadow:0 0 0 0.5px var(--dsw-alias-border-l2);}',
      'body[data-ds-dark-theme] .sa-dot[data-tone="idle"]{background:var(--dsw-alias-label-primary);}',
      '.sa-dot[data-tone="warning"]{background:var(--dsw-alias-state-warn-primary);}',
      '.sa-dot[data-tone="done"]{background:var(--dsw-alias-state-success-primary);}',
      '.sa-dot[data-tone="ongoing"]{width:8px;height:8px;background:transparent;border:1.5px solid color-mix(in srgb, var(--dsw-alias-label-tertiary) 30%, transparent);border-top-color:var(--dsw-alias-label-tertiary);animation:sa-spin 900ms linear infinite;}',
      '@keyframes sa-spin{to{transform:rotate(360deg);}}',
      '.sa-status-word{flex:none;font-size:10px;line-height:14px;color:var(--dsw-alias-state-warn-primary);}',
      '.sa-chip{flex:none;font-size:9px;line-height:14px;padding:0 4px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent);color:var(--dsw-alias-state-business-primary);}',
      '.sa-row-meta{display:flex;align-items:center;gap:4px;min-width:0;overflow:hidden;white-space:nowrap;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;}',
      '.sa-row-meta-sep{color:var(--dsw-alias-label-caption);}',
      '.sa-empty{padding:10px 8px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary);}',
      // 团队任务区（Agent Teams 的只读任务板，数据来自 Lead 会话的 agentTeam 投影）。
      '.sa-team{flex:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--dsw-alias-border-l1);}',
      '.sa-team-head{display:flex;align-items:center;gap:4px;padding:2px 6px 4px;color:var(--dsw-alias-label-secondary);}',
      '.sa-team-title{flex:1;min-width:0;overflow:hidden;text-align:left;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;font-weight:500;}',
      '.sa-team-body{display:flex;flex-direction:column;gap:1px;}',
      '.sa-task{display:flex;align-items:flex-start;gap:6px;padding:4px 6px;border-radius:8px;}',
      '.sa-task:hover{background:var(--dsw-alias-interactive-bg-hover);}',
      '.sa-task-dot{margin-top:6px;}',
      '.sa-task-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}',
      '.sa-task-subject{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:17px;color:var(--dsw-alias-label-primary);}',
      '.sa-task-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);}',
      '.sa-task-warn{flex:none;font-size:11px;line-height:17px;color:var(--dsw-alias-state-warn-primary);}',
      '.sa-team-failure{padding:2px 6px 4px;font-size:10px;line-height:14px;color:var(--dsw-alias-state-error-primary);}',
      // 单个任务的悬浮详情（pointer-events:none，不抢鼠标）。
      '.sa-detail{position:fixed;z-index:40;box-sizing:border-box;width:288px;max-height:60vh;overflow:hidden;pointer-events:none;padding:10px 12px;border-radius:12px;background:var(--dsw-specific-menu);box-shadow:0 0 0 0.5px var(--dsw-alias-border-l1), var(--dsw-elevation-panel, var(--dsw-elevation-soft));color:var(--dsw-alias-label-secondary);}',
      '.sa-detail-head{display:flex;align-items:center;gap:6px;margin-bottom:2px;}',
      '.sa-detail-id{font-size:10px;line-height:14px;color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);}',
      '.sa-detail-status{font-size:10px;line-height:14px;}',
      '.sa-detail-subject{margin-bottom:2px;font-size:12px;line-height:17px;font-weight:600;color:var(--dsw-alias-label-primary);}',
      '.sa-detail-desc{display:-webkit-box;margin-bottom:6px;-webkit-box-orient:vertical;-webkit-line-clamp:8;overflow:hidden;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-secondary);}',
      '.sa-detail-facts{display:flex;flex-direction:column;gap:3px;font-size:10px;line-height:14px;}',
      '.sa-detail-fact{display:flex;gap:8px;}',
      '.sa-detail-key{flex:none;width:52px;color:var(--dsw-alias-label-tertiary);}',
      '.sa-detail-value{flex:1;min-width:0;word-break:break-word;color:var(--dsw-alias-label-secondary);}',
      '.sa-detail-value.mono{font-family:var(--dsw-font-family-mono, ui-monospace, SFMono-Regular, Menlo, monospace);}',
      '.sa-detail-value.warn{color:var(--dsw-alias-state-warn-primary);}',
      '.sa-resize{position:absolute;top:8px;right:0;bottom:8px;width:6px;border-radius:3px;background:transparent;cursor:col-resize;pointer-events:auto;transition:background 120ms ease;}',
      '.sa-resize:hover{background:var(--dsw-alias-border-l2);}',
    ].join('\n')

    function installStyles() {
      const styles = document.createElement('style')
      styles.id = STYLE_ID
      styles.textContent = CSS
      document.head.append(styles)
      return () => {
        styles.remove()
      }
    }

    // ----- preferences --------------------------------------------------------
    /** @type {{ open: boolean, width: number, pinned: boolean }} */
    const prefs = { open: true, width: DEFAULT_PANEL_WIDTH, pinned: false }

    function clampWidth(value) {
      return Math.min(Math.max(Math.round(value), MIN_PANEL_WIDTH), MAX_PANEL_WIDTH)
    }

    function readPreference() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return
        const parsed = JSON.parse(raw)
        prefs.open = parsed.open !== false
        if (Number.isFinite(parsed.width)) prefs.width = clampWidth(parsed.width)
        prefs.pinned = parsed.pinned === true
      } catch (error) {
        // 偏好是可选增强：存储不可用时用默认值继续。
      }
    }
    readPreference()

    function persist() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ open: prefs.open, width: prefs.width, pinned: prefs.pinned }))
      } catch (error) {
        // 同上：存储失败只影响记忆，不影响本次会话。
      }
    }

    // ----- session data -------------------------------------------------------

    /** 插件 Context（apply 时捕获；组件定义在同一个闭包里）。 */
    let pluginCtx = null

    /** Subscribe to the Client session list snapshot (`ctx.sessions.list`). */
    function useSessionsList() {
      const store = pluginCtx.sessions.list
      const [snapshot, setSnapshot] = React.useState(() => store.getSnapshot())
      React.useEffect(() => {
        setSnapshot(store.getSnapshot())
        return store.subscribe(() => { setSnapshot(store.getSnapshot()) })
      }, [store])
      return snapshot
    }

    /**
     * 每个会话的 UI 状态事实（来自 ui-session 服务）：running、等你处理
     * （pendingInteraction，如审批/提问）、新完成未看（completionUnread）。
     */
    function useSessionStatuses() {
      const observable = pluginCtx.uiSession?.sessionStatus
      const [snapshot, setSnapshot] = React.useState(() => observable?.getSnapshot() ?? new Map())
      React.useEffect(() => {
        if (observable === undefined) return undefined
        setSnapshot(observable.getSnapshot())
        return observable.subscribe(() => { setSnapshot(observable.getSnapshot()) })
      }, [observable])
      return snapshot
    }

    /** 会话行上的后台任务徽标只关心还没结束的 job。 */
    function activeJobsOf(jobs) {
      if (!Array.isArray(jobs)) return []
      return jobs.filter((job) => job.status === 'running' || job.status === 'stopping')
    }

    /** 已运行时长（秒 / 分钟 / 小时）。 */
    function elapsedText(t, startedAt) {
      if (!Number.isFinite(startedAt)) return ''
      const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
      if (seconds < 60) return t('job.seconds', { n: seconds })
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) return t('job.minutes', { n: minutes })
      return t('job.hours', { n: Math.floor(minutes / 60) })
    }

    /**
     * 每个会话的后台任务名册（`ctx.jobs.state` 的快照）。jobs 不在 Session
     * 投影里，所以要对自己要展示的会话调 `watchRows`（引用计数），卸载/切换
     * 会话时 stop；没 watch 的会话拿不到 rows。
     */
    function useSessionJobs(sessionIds) {
      const service = pluginCtx.jobs
      const observable = service?.state
      const [snapshot, setSnapshot] = React.useState(() => observable?.getSnapshot() ?? { rows: {}, observed: {} })
      React.useEffect(() => {
        if (observable === undefined) return undefined
        setSnapshot(observable.getSnapshot())
        return observable.subscribe(() => { setSnapshot(observable.getSnapshot()) })
      }, [observable])
      const key = sessionIds.join('\u0000')
      React.useEffect(() => {
        if (service === undefined) return undefined
        const stops = sessionIds.map((id) => service.watchRows(id))
        return () => { for (const stop of stops) stop() }
      }, [service, key])
      return snapshot?.rows ?? {}
    }

    /** 当前会话 = 被主视图保留的那个（DSH 自己的侧栏也用它判断）。 */
    function currentUserSession(byId) {
      for (const summary of Object.values(byId)) {
        if ((summary.retainedBy?.mainView ?? 0) > 0) return summary
      }
      return undefined
    }

    /** 会话的三种来源：主会话 / fork 分支 / subagent（Host 列表元数据）。 */
    function kindOf(summary) {
      if (summary.origin === 'subagent') return KIND.sub
      if (summary.parentId) return KIND.fork
      return KIND.main
    }

    /**
     * The current session's **subagent** lineage, anchored at the top of the subagent
     * chain: the root session, itself, and its subagent subtree (any depth).
     * Fork sessions do not take part in the tree at all: a fork is not
     * nested under the session it was forked from, and a fork's source is not pulled in
     * either. A fork may still be the top of the tree when a subagent hangs off it —
     * that edge is a subagent edge, which is what this list is.
     */
    function buildLineage(list) {
      const byId = list?.byId ?? {}
      const current = currentUserSession(byId)
      if (current === undefined) return { rows: [], anchorId: undefined }

      const isSubagent = (summary) => summary.origin === 'subagent'

      // 锚点：稳定在 subagent 链的最顶层（会话本身或它的 subagent 上位者）。
      // 点开某个子会话时只移动高亮、不把列表根换成它——否则兄弟 subagent 会消失。
      // 链条只经过 subagent 边，防环、防缺失父节点。
      let anchor = current
      const chain = new Set([current.id])
      while (isSubagent(anchor) && anchor.parentId !== undefined && byId[anchor.parentId] !== undefined && !chain.has(anchor.parentId)) {
        chain.add(anchor.parentId)
        anchor = byId[anchor.parentId]
      }

      // 子节点索引：只收 subagent 行（fork 不进树）；按更新时间新的在前。
      const childrenOf = new Map()
      for (const summary of Object.values(byId)) {
        if (!isSubagent(summary) || summary.parentId === undefined) continue
        const children = childrenOf.get(summary.parentId) ?? []
        children.push(summary)
        childrenOf.set(summary.parentId, children)
      }
      for (const children of childrenOf.values()) {
        children.sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
      }

      // 行：锚点到它的 subagent 子树（DFS）。锚点不是当前会话时显示为「上级」（dim），
      // 当前会话那一行标成 self（高亮），其余是普通子行。
      const rows = []
      const seen = new Set([anchor.id])
      const walk = (summary, depth) => {
        // 树根就是普通会话行；点开子会话时根会话不变灰。
        const role = summary.id === current.id ? 'self' : summary.id === anchor.id ? 'root' : 'child'
        rows.push({ summary, depth: Math.min(depth, MAX_INDENT), role })
        for (const child of childrenOf.get(summary.id) ?? []) {
          if (seen.has(child.id)) continue
          seen.add(child.id)
          walk(child, depth + 1)
        }
      }
      walk(anchor, 0)
      return { rows, anchorId: anchor.id }
    }

    /** "刚刚 / N 分钟前 / N 小时前 / N 天前"（locale 决定语言）。 */
    function timeAgo(t, at) {
      if (!Number.isFinite(at)) return ''
      const diff = Math.max(0, Date.now() - at)
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return t('time.now')
      if (minutes < 60) return t('time.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('time.hours', { n: hours })
      return t('time.days', { n: Math.floor(hours / 24) })
    }

    /** 会话所在目录的名字（和当前会话不同目录时才在 meta 里显示）。 */
    function folderName(cwd) {
      if (typeof cwd !== 'string' || cwd === '') return null
      const parts = cwd.split(/[\\/]/u).filter(Boolean)
      return parts.length > 0 ? parts[parts.length - 1] : null
    }

    // ----- geometry -----------------------------------------------------------

    function sameLayout(left, right) {
      if (left === null || right === null) return left === right
      return left.top === right.top && left.height === right.height && left.left === right.left && left.room === right.room
    }

    function computeLayout(body, card) {
      if (body === null || card === null) return null
      // 只在有对话内容（active）时出现：hero/settling 下输入卡居中/隐藏，锚点没有意义。
      if (body.getAttribute('data-content-phase') !== 'active') return null
      const bodyRect = body.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      if (bodyRect.width <= 0 || bodyRect.height <= 0) return null
      const top = bodyRect.top + EDGE_INSET
      const height = cardRect.top - CARD_GAP - top
      if (height < MIN_STACK_HEIGHT) return null
      const left = bodyRect.left + EDGE_INSET
      // gutter 的右边界：不压住输入卡左缘。
      // gutter 宽度只决定「就近展开」还是「覆盖展开」，不再因为太窄而隐藏：
      // 低分辨率设备上图标按钮/面板仍要能打开（覆盖在对话区左侧）。
      const room = Math.max(0, cardRect.left - CARD_GAP - left)
      return { top: Math.floor(top), height: Math.floor(height), left: Math.floor(left), room: Math.floor(room) }
    }

    /** Track the conversation/composer geometry the area anchors to. */
    function useLayout() {
      const [layout, setLayout] = React.useState(null)
      React.useEffect(() => {
        let frame = 0
        let bodyElement = null
        let cardElement = null
        const resize = new ResizeObserver(() => { schedule() })
        const mutations = new MutationObserver(() => { schedule() })

        function measure() {
          frame = 0
          const body = document.querySelector('[data-conversation-region="chat"]')
          const card = document.querySelector('[data-composer-card]')
          if (body !== bodyElement) {
            if (bodyElement !== null) resize.unobserve(bodyElement)
            bodyElement = body
            if (body !== null) resize.observe(body)
          }
          if (card !== cardElement) {
            if (cardElement !== null) resize.unobserve(cardElement)
            cardElement = card
            if (card !== null) resize.observe(card)
          }
          const next = computeLayout(body, card)
          setLayout((previous) => (sameLayout(previous, next) ? previous : next))
        }

        function schedule() {
          if (frame !== 0) return
          frame = requestAnimationFrame(measure)
        }

        mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-content-phase'] })
        window.addEventListener('resize', schedule)
        measure()
        return () => {
          if (frame !== 0) cancelAnimationFrame(frame)
          resize.disconnect()
          mutations.disconnect()
          window.removeEventListener('resize', schedule)
        }
      }, [])
      return layout
    }

    /**
     * 右栏（对话右侧边栏）是否打开。AppFrame 在右栏收起时给 frame 元素加
     * `data-rightbar-collapsed`，但面板挂载时该属性可能不存在，所以用
     * `[data-rightbar-col]` 的实际宽度判断（收起时轨道宽度为 0），并用
     * ResizeObserver + MutationObserver 跟随开合。
     */
    function useRightbarOpen() {
      const [open, setOpen] = React.useState(() => readRightbarOpen())
      React.useEffect(() => {
        let column = null
        const resize = new ResizeObserver(() => { update() })
        const mutations = new MutationObserver(() => { attach(); update() })

        function read() {
          const el = document.querySelector('[data-rightbar-col]')
          return el !== null && el.getBoundingClientRect().width > 1
        }
        function attach() {
          const el = document.querySelector('[data-rightbar-col]')
          if (el === column) return
          if (column !== null) resize.unobserve(column)
          column = el
          if (el !== null) resize.observe(el)
        }
        function update() {
          const next = read()
          setOpen((previous) => (previous === next ? previous : next))
        }

        mutations.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['data-rightbar-collapsed', 'data-rightbar-fullscreen'],
        })
        window.addEventListener('resize', update)
        attach()
        update()
        return () => {
          resize.disconnect()
          mutations.disconnect()
          window.removeEventListener('resize', update)
        }
      }, [])
      return open
    }

    /** 首帧读右栏开合（组件外也能用）。 */
    function readRightbarOpen() {
      const el = document.querySelector('[data-rightbar-col]')
      return el !== null && el.getBoundingClientRect().width > 1
    }

    // ----- icons --------------------------------------------------------------
    const iconProps = { viewBox: '0 0 16 16', 'aria-hidden': true }

    function IconChevronLeft() {
      return h('svg', iconProps, h('path', {
        d: 'M10 3.5 5.5 8 10 12.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
      }))
    }

    /** 会话列表：三行，每行左侧一个点。 */
    function IconSessions() {
      return h('svg', iconProps,
        h('circle', { cx: 3, cy: 4, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 3, cy: 8, r: 1, fill: 'currentColor' }),
        h('circle', { cx: 3, cy: 12, r: 1, fill: 'currentColor' }),
        h('path', { d: 'M6 4h7.5M6 8h7.5M6 12h7.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    /** 固定图标（path 取自 DSH 客户端 ui-primitives 的 IconPinOutline）。 */
    function IconPin() {
      return h('svg', iconProps,
        h('path', {
          d: 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z',
          fill: 'none', stroke: 'currentColor', strokeWidth: 1, strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z',
          fill: 'currentColor',
        }),
      )
    }

    /** 已固定态（path 取自 DSH 客户端 ui-primitives 的 IconPinFill）。 */
    function IconPinFilled() {
      return h('svg', iconProps,
        h('path', {
          d: 'M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z',
          fill: 'currentColor', stroke: 'currentColor', strokeWidth: 1, strokeLinejoin: 'round',
        }),
        h('path', {
          d: 'M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z',
          fill: 'currentColor',
        }),
      )
    }

    /** 主会话：对话气泡。 */
    function IconMain() {
      return h('svg', iconProps, h('path', {
        d: 'M3 4.5A1.5 1.5 0 0 1 4.5 3h7A1.5 1.5 0 0 1 13 4.5v5A1.5 1.5 0 0 1 11.5 11H7l-3 2.5V11a1 1 0 0 1-1-1z',
        fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round',
      }))
    }

    /** 分支：分叉。 */
    function IconFork() {
      return h('svg', iconProps,
        h('circle', { cx: 5, cy: 4, r: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 5, cy: 12, r: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('circle', { cx: 11, cy: 6, r: 1.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M5 5.5v5M11 7.5c0 2-3 2-5.5 3', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
      )
    }

    /** 子 agent：机器人。 */
    function IconSub() {
      return h('svg', iconProps,
        h('rect', { x: 3.5, y: 5, width: 9, height: 7.5, rx: 2, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3 }),
        h('path', { d: 'M8 5V3M6.3 8.5h.01M9.7 8.5h.01', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      )
    }

    const KIND_ICON = { main: IconMain, fork: IconFork, sub: IconSub }

    // ----- components ---------------------------------------------------------

    function RowView({ t, row, currentCwd, status, jobs, onOpen }) {
      const summary = row.summary
      const kind = kindOf(summary)
      const Icon = KIND_ICON[kind]
      const title = summary.title || summary.displayTitle || t('row.untitled')
      // 状态只取“最需要人”的那一档：等你处理 > 运行中 > 新完成未看 > 无标记。
      const running = status?.running ?? summary.running === true
      const pending = status?.pendingInteraction !== undefined
      const unread = status?.completionUnread === true
      // 与任务板共用同一套语义：等你处理/被阻塞 = warning，运行/进行中 = ongoing，完成 = done。
      const tone = pending ? 'warning' : running ? 'ongoing' : unread ? 'done' : null
      const toneLabel = tone === null ? '' : t(`row.${tone === 'warning' ? 'waiting' : tone === 'ongoing' ? 'running' : 'unread'}`)
      const activeJobs = activeJobsOf(jobs)
      const jobsTitle = activeJobs.map((job) => `${job.label || job.kind} · ${elapsedText(t, job.startedAt)}`).join('\n')
      // 会话在别的目录里跑（fork/subagent 可能继承到了别处）：meta 里标出目录名。
      const otherFolder = summary.cwd !== currentCwd ? folderName(summary.cwd) : null
      const meta = [
        t(`kind.${kind}`),
        summary.blank === true ? t('row.blank') : '',
        otherFolder ?? '',
        timeAgo(t, summary.updatedAt),
      ].filter(Boolean)
      const style = { paddingLeft: `${6 + row.depth * INDENT_STEP}px` }
      return h('button', {
        type: 'button',
        className: 'sa-row',
        style,
        'data-role': row.role,
        'data-kind': kind,
        'data-session-id': summary.id,
        'aria-current': row.role === 'self' ? 'true' : undefined,
        title: t('row.open'),
        onClick: () => { onOpen(summary.id) },
      },
        h('span', { className: 'sa-row-icon' }, h(Icon, {})),
        h('span', { className: 'sa-row-main' },
          h('span', { className: 'sa-row-title' },
            tone !== null ? h('span', { className: 'sa-dot', 'data-tone': tone, 'aria-label': toneLabel, title: toneLabel }) : null,
            h('span', { className: 'sa-row-titletext' }, title),
            pending ? h('span', { className: 'sa-status-word' }, t('row.waiting')) : null,
            row.role === 'self' ? h('span', { className: 'sa-chip' }, t('row.current')) : null,
            activeJobs.length > 0
              ? h('span', {
                className: 'sa-job-badge',
                'data-session-jobs': String(activeJobs.length),
                title: jobsTitle,
                'aria-label': t('job.active', { n: activeJobs.length }),
              },
                h('span', { className: 'sa-mini-spinner', 'aria-hidden': true }),
                h('span', null, String(activeJobs.length)),
              )
              : null,
          ),
          h('span', { className: 'sa-row-meta' },
            meta.map((part, index) => h(React.Fragment, { key: `${index}-${part}` },
              index > 0 ? h('span', { className: 'sa-row-meta-sep', 'aria-hidden': true }, '·') : null,
              h('span', null, part),
            )),
          ),
        ),
      )
    }

    /** 任务状态 → 共享的状态语义（与会话行同一套颜色）。 */
    function taskTone(task) {
      if (task.status === 'completed') return 'done'
      if (task.status === 'in_progress') return 'ongoing'
      return task.ready === false ? 'warning' : 'idle'
    }

    /** 任务区排序：进行中 → 可开始的待办 → 被依赖阻塞的待办 → 已完成。 */
    function taskPhase(task) {
      if (task.status === 'in_progress') return 0
      if (task.status === 'completed') return 3
      return task.ready === false ? 2 : 1
    }

    /** 悬浮详情卡片的宽度与视口留白。 */
    const TASK_DETAIL_WIDTH = 288
    const VIEWPORT_MARGIN = 8

    /** 把详情卡片放在任务行右侧（右边放不下就放左侧），并夹在视口内。 */
    function detailPlacement(rect) {
      const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 1280
      const viewportHeight = Number.isFinite(window.innerHeight) ? window.innerHeight : 800
      let left = rect.right + VIEWPORT_MARGIN
      if (left + TASK_DETAIL_WIDTH > viewportWidth - VIEWPORT_MARGIN) {
        left = Math.max(VIEWPORT_MARGIN, rect.left - TASK_DETAIL_WIDTH - VIEWPORT_MARGIN)
      }
      const top = Math.max(VIEWPORT_MARGIN, Math.min(rect.top - 4, viewportHeight - 320))
      return { left: Math.round(left), top: Math.round(top) }
    }

    /** 团队任务板的一行（只读；任务由 agent 工具创建/认领/完成）。鼠标悬浮弹出详情卡片。 */
    function TaskRow({ t, task }) {
      const status = task.status === 'pending' && task.ready === false ? 'blocked' : task.status
      const tone = taskTone(task)
      const statusText = t(`task.${status === 'in_progress' ? 'inProgress' : status}`)
      const [detailAt, setDetailAt] = React.useState(null)
      const meta = [
        statusText,
        task.ownerName ? t('task.owner', { name: task.ownerName }) : '',
        task.blockedBy.length > 0 ? t('task.depends', { n: task.blockedBy.length }) : '',
      ].filter(Boolean).join(' · ')

      const row = h('div', {
        className: 'sa-task',
        'data-task-id': task.id,
        'data-task-status': status,
        onMouseEnter: (event) => { setDetailAt(detailPlacement(event.currentTarget.getBoundingClientRect())) },
        onMouseLeave: () => { setDetailAt(null) },
      },
        h('span', { className: 'sa-dot sa-task-dot', 'data-tone': tone, 'aria-hidden': true }),
        h('span', { className: 'sa-task-main' },
          h('span', { className: 'sa-task-subject' }, task.subject || task.id),
          h('span', { className: 'sa-task-meta' }, meta),
        ),
        task.writeScopeWarnings.length > 0
          ? h('span', {
            className: 'sa-task-warn',
            title: `${t('task.warn')}\n${task.writeScopeWarnings.join('\n')}`,
            'aria-label': t('task.warn'),
          }, '⚠')
          : null,
      )

      if (detailAt === null) return row
      const fact = (key, value, className) => h('div', { className: 'sa-detail-fact' },
        h('span', { className: 'sa-detail-key' }, key),
        h('span', { className: `sa-detail-value${className ? ` ${className}` : ''}` }, value),
      )
      const facts = [
        fact(t('task.label.owner'), task.ownerName || t('task.label.none')),
        fact(t('task.label.depends'), task.blockedBy.length > 0 ? task.blockedBy.join(', ') : t('task.label.none'), 'mono'),
      ]
      if (task.writeScopes.length > 0) facts.push(fact(t('task.label.scopes'), task.writeScopes.join(', '), 'mono'))
      if (task.writeScopeWarnings.length > 0) facts.push(fact(t('task.label.warnings'), task.writeScopeWarnings.join('；'), 'warn'))

      return h(React.Fragment, null, row,
        h('div', {
          className: 'sa-detail',
          role: 'tooltip',
          'data-task-detail': task.id,
          style: { left: `${detailAt.left}px`, top: `${detailAt.top}px` },
        },
          h('div', { className: 'sa-detail-head' },
            h('span', { className: 'sa-detail-id' }, task.id),
            h('span', { className: 'sa-dot sa-task-dot', 'data-tone': tone, 'aria-hidden': true }),
            h('span', { className: 'sa-detail-status' }, statusText),
          ),
          h('div', { className: 'sa-detail-subject' }, task.subject || task.id),
          task.description ? h('div', { className: 'sa-detail-desc' }, task.description) : null,
          h('div', { className: 'sa-detail-facts' }, facts),
        ),
      )
    }

    /**
     * The frame-overlay entry: the session tree, collapsed to a left-edge icon button.
     * @param {{ t?: Function }} props - slot-localized translate seat
     * @returns {object | null}
     */
    function SessionArea(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key
      const list = useSessionsList()
      const statuses = useSessionStatuses()
      const layout = useLayout()
      const lineage = React.useMemo(() => buildLineage(list), [list])
      const jobsBySession = useSessionJobs(React.useMemo(() => lineage.rows.map((row) => row.summary.id), [lineage]))
      const [expanded, setExpanded] = React.useState(prefs.open)
      const [width, setWidth] = React.useState(prefs.width)
      // 固定：右栏打开/空间不足时不自动折叠；autoCollapsed 表示这次折叠是自动触发的；
      // temporary 表示未固定时通过图标做的「仅本次」临时展开（不写偏好）。
      const [pinned, setPinned] = React.useState(prefs.pinned)
      const [autoCollapsed, setAutoCollapsed] = React.useState(false)
      const [temporary, setTemporary] = React.useState(false)
      const rightbarOpen = useRightbarOpen()
      const autoCollapseRef = React.useRef(false)
      const resize = React.useRef(null)
      const bodyRef = React.useRef(null)
      // 覆盖展开时沿用的宽度（从就近视口切过来时设置），以及上一帧是否为就近视口。
      const [carriedWidth, setCarriedWidth] = React.useState(null)
      const lastGutterWidth = React.useRef(null)
      const wasGutter = React.useRef(false)

      // 当前会话变了（从侧栏/别的插件切过来）：把那一行滚进视口。
      const currentId = lineage.rows.find((row) => row.role === 'self')?.summary.id
      React.useEffect(() => {
        const self = bodyRef.current?.querySelector('[data-role="self"]')
        if (self !== null && self !== undefined) self.scrollIntoView({ block: 'nearest' })
      }, [currentId, expanded, layout])

      // 「gutter 放得下最小面板宽度」= 就近展开的前提；放不下时未固定就自动折叠，固定则覆盖展开。
      const fitsGutter = layout !== null && layout.room >= MIN_PANEL_WIDTH
      // 未固定 +（右栏打开 或 空间不足）→ 自动折叠；条件解除后恢复到自动折叠前的展开态。
      // 自动折叠不写偏好，重载后仍是用户的选择；自动折叠也会清掉「仅本次」的临时展开。
      // 这个 effect 必须放在 layout 早退之前：hooks 数量不能随 layout 是否为 null 变化，
      // 否则第一次渲染（layout 还是 null）少调用一个 hook，第二次渲染直接崩掉整个槽位。
      const autoCollapseWanted = !pinned && (rightbarOpen || (layout !== null && !fitsGutter))
      React.useEffect(() => {
        const previous = autoCollapseRef.current
        autoCollapseRef.current = autoCollapseWanted
        if (autoCollapseWanted && !previous) {
          if (expanded) {
            setExpanded(false)
            setAutoCollapsed(true)
          }
          setTemporary(false)
        } else if (!autoCollapseWanted && previous) {
          if (autoCollapsed) {
            setExpanded(true)
            setAutoCollapsed(false)
          }
          setTemporary(false)
        }
      }, [autoCollapseWanted, expanded, autoCollapsed])

      // 「就近展开（gutter 够宽）→ 覆盖展开（gutter 不够）」时沿用切换前的宽度：
      // 否则面板会从被 gutter 压窄的宽度突然跳回 width 偏好。
      // useLayoutEffect 在绘制前完成交接，窗口缩放过程中不会闪一帧。
      React.useLayoutEffect(() => {
        if (layout === null) return
        if (fitsGutter) {
          // 记录最近的 gutter 可视宽度（可能被 room 压窄），离开 gutter 时用它接管。
          lastGutterWidth.current = Math.min(clampWidth(width), layout.room)
          setCarriedWidth(null)
        } else if (wasGutter.current && lastGutterWidth.current !== null) {
          setCarriedWidth(lastGutterWidth.current)
        }
        wasGutter.current = fitsGutter
      }, [fitsGutter, width, layout])

      if (layout === null) return null

      // 面板占据整个左缘宽度；收起后那个位置只剩一个图标按钮。收缩按钮是面板
      // 头部最左侧的按钮，和展开按钮同一角落（开合都在同一位置，但按钮属于
      // 会话列表本身）。
      // gutter 够宽：面板放在 gutter 里（不遮对话）；gutter 放不下最小宽度时，
      // 固定或「仅本次」临时展开则覆盖在对话区左侧展开，否则保持收起（由上面的 effect 自动折叠）。
      const viewportWidth = Number.isFinite(window.innerWidth) ? window.innerWidth : 1280
      const available = fitsGutter
        ? layout.room
        : Math.max(MIN_OVERLAY_WIDTH, viewportWidth - layout.left - VIEWPORT_MARGIN)
      // 覆盖展开且刚从 gutter 切过来时用继承宽度，避免宽度跳变；用户一拖宽就回到 width。
      const baseWidth = carriedWidth === null ? width : carriedWidth
      const panelWidth = Math.min(Math.max(baseWidth, MIN_PANEL_WIDTH), MAX_PANEL_WIDTH, available)
      // 未固定且空间不足时只有「仅本次」临时展开可以覆盖显示；固定则一直允许覆盖。
      const canShow = fitsGutter || pinned || temporary
      const shown = expanded && canShow
      const currentCwd = lineage.rows.find((row) => row.role === 'self')?.summary.cwd

      // 团队任务板：Lead 会话上的 `agentTeam` 投影（Agent Teams，实验性）。
      // 我们算出的锚点就是 teammate 会话的 Lead；没启用团队 bundle 或投影未加载时为空。
      const team = lineage.anchorId === undefined
        ? undefined
        : list?.projectionsBySession?.[lineage.anchorId]?.values?.agentTeam
      const teamTasks = team === undefined
        ? []
        : team.tasks
          .filter((task) => task.status !== 'deleted')
          .slice()
          .sort((left, right) => taskPhase(left) - taskPhase(right) || left.id.localeCompare(right.id, undefined, { numeric: true }))

      // 手动展开：清掉自动折叠标记，并写入偏好（用于固定态）。
      const expandPanel = () => {
        prefs.open = true
        persist()
        setExpanded(true)
        setAutoCollapsed(false)
        setTemporary(false)
      }
      // 未固定时点图标：只做「仅本次」临时展开，不写偏好；空间不足时按覆盖模式显示，
      // 下一次自动折叠条件触发或刷新页面后回到偏好状态。
      const expandTemporarily = () => {
        setTemporary(true)
        setExpanded(true)
        setAutoCollapsed(false)
      }
      // 手动折叠：用户意图，清掉自动/临时状态（下次右栏打开不再做「恢复」）。
      const collapsePanel = () => {
        prefs.open = false
        persist()
        setExpanded(false)
        setAutoCollapsed(false)
        setTemporary(false)
      }
      // 固定开关：固定后右栏打开不再自动折叠；取消固定后恢复联动（当前已展开的保持不动）。
      const togglePinned = () => {
        const next = !pinned
        prefs.pinned = next
        // 固定时面板一定是打开的（按钮在面板里），把它落成明确的展开偏好。
        if (next) prefs.open = true
        persist()
        setPinned(next)
        if (next) setTemporary(false)
      }

      const onOpenSession = (id) => {
        try {
          pluginCtx.uiWorkspace.openSession(id)
        } catch (error) {
          console.warn(`subagent-panel: cannot open session ${String(id)}`, error)
        }
      }

      const onResizeDown = (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        // 覆盖展开时用户开始拖宽：把继承来的宽度落成 width，之后完全按用户拖拽走。
        if (carriedWidth !== null) {
          setWidth(panelWidth)
          setCarriedWidth(null)
        }
        event.currentTarget.setPointerCapture(event.pointerId)
        resize.current = { x: event.clientX, width: panelWidth }
      }
      const onResizeMove = (event) => {
        const start = resize.current
        if (start === null) return
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        setWidth(clampWidth(start.width + event.clientX - start.x))
      }
      const onResizeEnd = (event) => {
        if (resize.current === null) return
        resize.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        prefs.width = clampWidth(width)
        persist()
      }

      const rows = lineage.rows
      const body = rows.length === 0
        ? h('div', { className: 'sa-empty' }, list?.phase === 'pending' ? t('loading') : t('empty.noCurrent'))
        : rows.map((row) => h(RowView, {
          key: row.summary.id,
          t,
          row,
          currentCwd,
          status: statuses.get(row.summary.id),
          jobs: jobsBySession[row.summary.id],
          onOpen: onOpenSession,
        }))

      // 任务板为空时不显示这一节。
      const teamSection = team === undefined || teamTasks.length === 0
        ? null
        : h('section', { className: 'sa-team', 'data-subagent-panel-team': '' },
          h('div', { className: 'sa-team-head' },
            h('span', { className: 'sa-team-title' }, t('task.title')),
          ),
          team.failure ? h('div', { className: 'sa-team-failure' }, t('task.failure', { message: team.failure })) : null,
          h('div', { className: 'sa-team-body' }, teamTasks.map((task) => h(TaskRow, { key: task.id, t, task }))),
        )

      if (!shown) {
        // 未固定时点图标只是「仅本次」临时展开（不写偏好）；固定时是正常展开并记住。
        const orbLabel = pinned ? t('panel.expand') : t('panel.expandTemp')
        return h('div', { className: 'sa-layer', 'data-subagent-panel': '' },
          h('button', {
            type: 'button',
            className: 'sa-orb',
            'data-subagent-panel-orb': '',
            // 与展开后面板头部的收缩按钮同一坐标（layout.left/top + 同一个角内边距）。
            style: { left: `${layout.left + CORNER_INSET}px`, top: `${layout.top + CORNER_INSET}px` },
            title: orbLabel,
            'aria-label': orbLabel,
            'aria-expanded': 'false',
            onClick: () => { if (pinned) expandPanel(); else expandTemporarily() },
          },
            h(IconSessions),
          ),
        )
      }

      return h('div', { className: 'sa-layer', 'data-subagent-panel': '' },
        h('section', {
          className: 'sa-panel',
          'data-subagent-panel-surface': '',
          'data-overlay': fitsGutter ? undefined : 'true',
          'aria-label': t('panel.title'),
          style: {
            left: `${layout.left}px`,
            top: `${layout.top}px`,
            width: `${panelWidth}px`,
            height: `${layout.height}px`,
          },
        },
          h('div', { className: 'sa-head' },
            h('button', {
              type: 'button',
              className: 'sa-toggle',
              'data-subagent-panel-toggle': '',
              title: t('panel.collapse'),
              'aria-label': t('panel.collapse'),
              'aria-expanded': 'true',
              onClick: () => { collapsePanel() },
            }, h(IconChevronLeft)),
            h('span', { className: 'sa-title' }, t('panel.title')),
            h('button', {
              type: 'button',
              className: 'sa-pin',
              'data-subagent-panel-pin': '',
              'data-pinned': pinned ? 'true' : 'false',
              'aria-pressed': pinned ? 'true' : 'false',
              title: pinned ? t('panel.unpin') : t('panel.pin'),
              'aria-label': pinned ? t('panel.unpin') : t('panel.pin'),
              onClick: togglePinned,
            }, pinned ? h(IconPinFilled) : h(IconPin)),
          ),
          h('div', { className: 'sa-body', ref: bodyRef, 'aria-label': t('panel.title') }, body, teamSection),
          h('div', {
            className: 'sa-resize',
            'data-subagent-panel-resize': '',
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': t('panel.resize'),
            title: t('panel.resize'),
            onPointerDown: onResizeDown,
            onPointerMove: onResizeMove,
            onPointerUp: onResizeEnd,
            onPointerCancel: onResizeEnd,
            onLostPointerCapture: onResizeEnd,
          }),
        ),
      )
    }

    // ----- plugin -------------------------------------------------------------
    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace', 'uiSession', 'jobs'],
      apply(ctx) {
        pluginCtx = ctx
        ctx.effect(() => ctx.locale.register(NS, 'en', EN))
        ctx.effect(() => ctx.locale.register(NS, 'zh', ZH))
        ctx.effect(() => installStyles())
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'subagent-panel',
          order: 50,
          locale: NS,
        }, SessionArea))
      },
    }
  },
})
